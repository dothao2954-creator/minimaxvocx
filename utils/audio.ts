
/**
 * Decodes a base64 string into a Uint8Array.
 */
function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts a File object to a Base64 string.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g. "data:audio/wav;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

/**
 * Decodes raw PCM data from Gemini into an AudioBuffer.
 * Gemini 2.5 TTS typically returns 24kHz mono PCM.
 */
export async function decodeAudioData(
  base64Data: string,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const bytes = decodeBase64(base64Data);
  const dataInt16 = new Int16Array(bytes.buffer);
  
  // Calculate duration
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 to Float32 (-1.0 to 1.0)
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Converts an AudioBuffer to a WAV Blob for downloading.
 */
export function bufferToWave(abuffer: AudioBuffer, len: number): Blob {
  const numOfChan = abuffer.numberOfChannels;
  const length = len * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this example)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i));

  while (pos < len) {
    for (i = 0; i < numOfChan; i++) {
      // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true); // write 16-bit sample
      offset += 2;
    }
    pos++;
  }

  return new Blob([buffer], { type: "audio/wav" });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

/**
 * Calculates Zero Crossing Rate for a buffer segment.
 * Used as a proxy for frequency content/pitch.
 */
function calculateZCR(buffer: Float32Array): number {
  let zcr = 0;
  for (let i = 1; i < buffer.length; i++) {
    if ((buffer[i] >= 0 && buffer[i - 1] < 0) || (buffer[i] < 0 && buffer[i - 1] >= 0)) {
      zcr++;
    }
  }
  return zcr / buffer.length;
}

export interface AudioAnalysisResult {
    valid: boolean;
    reason?: string;
    score: number;
}

/**
 * Analyzes audio buffer quality for voice cloning suitability.
 * Uses advanced heuristics to detect background music, noise, monotony, unnatural pauses,
 * speech rate consistency, and vocal expressiveness.
 */
export function analyzeAudioQuality(buffer: AudioBuffer): AudioAnalysisResult {
  const data = buffer.getChannelData(0); // Analyze first channel
  const sampleRate = buffer.sampleRate;

  // 1. Duration Check
  if (buffer.duration < 3.0) {
    return { valid: false, reason: "Recording is too short (< 3s). Please upload at least 3-5 seconds of continuous speech.", score: 0 };
  }
  if (buffer.duration > 300) {
    return { valid: false, reason: "File is too large (> 5m). Please trim your clip to a shorter sample for faster processing.", score: 0 };
  }

  // Analysis Parameters
  const windowSizeSec = 0.05; // 50ms windows
  const windowSizeSamples = Math.floor(sampleRate * windowSizeSec);
  const totalWindows = Math.floor(data.length / windowSizeSamples);
  
  let globalPeak = 0;
  let totalRMS = 0;
  const windowRMSs: number[] = [];
  const windowZCRs: number[] = []; // Zero Crossing Rates per window

  // Calculate RMS and ZCR for each window
  for (let i = 0; i < totalWindows; i++) {
    let sumSquares = 0;
    const windowData = data.slice(i * windowSizeSamples, (i + 1) * windowSizeSamples);
    
    // RMS
    for (let j = 0; j < windowData.length; j++) {
      const sample = windowData[j];
      const abs = Math.abs(sample);
      if (abs > globalPeak) globalPeak = abs;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / windowSizeSamples);
    windowRMSs.push(rms);
    totalRMS += rms;

    // ZCR (Frequency proxy)
    const zcr = calculateZCR(windowData);
    windowZCRs.push(zcr);
  }

  const avgRMS = totalRMS / totalWindows;

  // 2. Volume Check
  if (avgRMS < 0.01) { // Relaxed from 0.015
    return { valid: false, reason: "Audio is too quiet. We can't hear the voice clearly. Please record closer to the microphone.", score: 20 };
  }

  // 3. Clipping Check
  if (globalPeak > 0.99 && avgRMS > 0.5) { // Relaxed from 0.45
    return { valid: false, reason: "Audio is distorted (too loud). This causes artifacts. Please lower your volume or move back from the mic.", score: 30 };
  }

  // 4. Advanced Dynamic & Rhythm Analysis
  const dynamicThreshold = Math.max(avgRMS * 0.4, 0.02); // Threshold to consider a window "silent" vs "active"
  
  let quietWindows = 0;
  let longestPauseWindows = 0;
  let currentPauseRun = 0;
  let activeWindowsCount = 0;
  
  // Stats for active speech only
  const activeZCRs: number[] = [];

  // Syllable Estimation (Counting energy peaks)
  let peakCount = 0;
  // Simple peak detection: current > prev && current > next && current > threshold
  for (let i = 1; i < windowRMSs.length - 1; i++) {
    const prev = windowRMSs[i - 1];
    const curr = windowRMSs[i];
    const next = windowRMSs[i + 1];
    
    if (curr > dynamicThreshold) {
       // It's active speech
       activeWindowsCount++;
       activeZCRs.push(windowZCRs[i]);

       // Peak check for speech rate
       if (curr > prev && curr > next && curr > (avgRMS * 0.8)) {
         peakCount++;
       }
    }

    // Pause analysis
    if (curr < dynamicThreshold) {
      quietWindows++;
      currentPauseRun++;
    } else {
      if (currentPauseRun > 0) {
        longestPauseWindows = Math.max(longestPauseWindows, currentPauseRun);
        currentPauseRun = 0;
      }
    }
  }
  longestPauseWindows = Math.max(longestPauseWindows, currentPauseRun);

  const quietRatio = quietWindows / totalWindows;
  // const longestPauseSec = longestPauseWindows * windowSizeSec; // Unused
  
  // Rate Calculation
  // We only count rate over the *active* duration, not total file length (avoids punishing long pauses)
  const activeDurationSec = activeWindowsCount * windowSizeSec;
  const peaksPerSecond = activeDurationSec > 0 ? peakCount / activeDurationSec : 0;

  // ZCR Variance (Expressiveness proxy)
  let zcrSum = 0;
  activeZCRs.forEach(z => zcrSum += z);
  const avgZCR = activeZCRs.length > 0 ? zcrSum / activeZCRs.length : 0;
  
  let zcrVarianceSum = 0;
  activeZCRs.forEach(z => zcrVarianceSum += Math.pow(z - avgZCR, 2));
  const zcrStdDev = activeZCRs.length > 0 ? Math.sqrt(zcrVarianceSum / activeZCRs.length) : 0;

  // RMS Variance (Dynamics proxy)
  let sumSquaredDiff = 0;
  for (const rms of windowRMSs) {
      sumSquaredDiff += Math.pow(rms - avgRMS, 2);
  }
  const stdDevRMS = Math.sqrt(sumSquaredDiff / totalWindows);
  const variationCoefficient = stdDevRMS / avgRMS;

  console.log(`[AudioAnalysis] Rate:${peaksPerSecond.toFixed(1)} peaks/s, ZCR_SD:${zcrStdDev.toFixed(4)}, CV:${variationCoefficient.toFixed(2)}`);

  // SCORING LOGIC
  let score = 100;

  // Penalize Low Volume
  if (avgRMS < 0.05) score -= 15;
  else if (avgRMS < 0.1) score -= 5;

  // Penalize Clipping Risk
  if (globalPeak > 0.95) score -= 10;

  // Penalize Noise (Low Silence Ratio)
  // Ideal is ~20-50% silence for natural reading. <15% is suspicious of noise.
  if (quietRatio < 0.15) score -= 20;

  // Penalize Monotony (Low Dynamics)
  if (variationCoefficient < 0.25) score -= 15;
  
  // Penalize Flat Pitch (Low ZCR Variance)
  if (zcrStdDev < 0.005) score -= 10;

  // Penalize Extreme Rates
  if (peaksPerSecond < 1.5 || peaksPerSecond > 8.0) score -= 10;

  // Clamp Score
  score = Math.max(0, Math.min(100, Math.round(score)));

  // HEURISTIC CHECKS

  // A. Wall of Sound / Noise
  if (quietRatio < 0.02 && variationCoefficient < 0.5) { // Relaxed quiet ratio from 0.05
     return { 
         valid: false, 
         reason: "Background music or noise detected. The AI needs a clean, 'dry' voice recording without background tracks.",
         score: Math.min(score, 40)
     };
  }

  // B. Monotony / Compression (Dynamics)
  if (variationCoefficient < 0.15) { // Relaxed from 0.3
    return {
      valid: false,
      reason: "Voice sounds robotic or over-processed. Please use a natural recording with normal speaking intonation.",
      score: Math.min(score, 45)
    };
  }

  // C. Rhythm / Pause
  if (quietRatio > 0.95) { // Relaxed from 0.9
    return {
      valid: false,
      reason: "Too much silence detected. The file is mostly empty. Please trim the silent parts so we can hear your voice.",
      score: Math.min(score, 30)
    };
  }

  // D. Speech Rate Analysis
  // Relaxed thresholds significantly to avoid false positives
  if (peaksPerSecond < 0.5 && activeDurationSec > 2) { // Relaxed from 1.5
      return {
          valid: false,
          reason: "Speech is too slow. Please speak at a natural, conversational pace for best cloning results.",
          score: Math.min(score, 50)
      };
  }
  
  if (peaksPerSecond > 15.0) { // Relaxed from 8.0 to 15.0 to accommodate energetic speech/noise jitter
      return {
          valid: false,
          reason: "Speech is too fast/rushed. Please speak clearly at a moderate pace so the AI can capture articulation.",
          score: Math.min(score, 50)
      };
  }

  // E. Pitch/Expressiveness Analysis (ZCR Variance)
  // Relaxed from 0.01 to 0.001 to support steady voices
  if (zcrStdDev < 0.001 && activeDurationSec > 3) {
      return {
          valid: false,
          reason: "Voice lacks pitch variation (monotone). Try speaking with more emotion and tonal range.",
          score: Math.min(score, 55)
      };
  }

  return { valid: true, score };
}
