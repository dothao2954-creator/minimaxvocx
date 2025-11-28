import { GoogleGenAI, Modality } from "@google/genai";

// Available voices in Gemini 2.5 Flash TTS
export const VOICES = [
  // Vietnamese Voices (Custom Mapped)
  { 
    id: 'vn-male-hanoi', 
    name: 'VN: Nam (Hà Nội)', 
    gender: 'Male', 
    style: 'Trầm ấm, Tin tức', 
    description: 'Giọng nam chuẩn Hà Nội, ngắt nghỉ rõ ràng, tự nhiên như MC.',
    // Custom property for internal mapping (not part of UI type, handled in logic)
    baseVoice: 'Charon' 
  },
  { 
    id: 'vn-female-saigon', 
    name: 'VN: Nữ (Sài Gòn)', 
    gender: 'Female', 
    style: 'Nhẹ nhàng, Cảm xúc', 
    description: 'Giọng nữ miền Nam ngọt ngào, có tiếng lấy hơi chân thực.',
    baseVoice: 'Zephyr'
  },
  // Standard English Voices
  { id: 'Puck', name: 'Puck (US)', gender: 'Male', style: 'Narrative', description: 'Deep, resonant, storytelling voice.' },
  { id: 'Charon', name: 'Charon (US)', gender: 'Male', style: 'Conversational', description: 'Calm, authoritative, news-style.' },
  { id: 'Kore', name: 'Kore (US)', gender: 'Female', style: 'Energetic', description: 'Bright, clear, helpful assistant.' },
  { id: 'Fenrir', name: 'Fenrir (US)', gender: 'Male', style: 'Intense', description: 'Strong, impactful, dynamic.' },
  { id: 'Zephyr', name: 'Zephyr (US)', gender: 'Female', style: 'Soft', description: 'Gentle, soothing, meditative.' },
] as const;

interface GenerateSpeechOptions {
  text: string;
  voiceName?: string;
  referenceAudio?: {
    data: string;
    mimeType: string;
  };
}

// Helper to safely get API Key in both Node/Dev and Vite/Prod environments
const getApiKey = () => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_API_KEY;
  }
  // Fallback to process.env if available (Node/Dev)
  if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
    return process.env.API_KEY;
  }
  return '';
};

export const generateSpeech = async (options: GenerateSpeechOptions | string, voiceNameArg?: string): Promise<string> => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error("API Key is missing. Please create a .env file with VITE_API_KEY=your_key");
  }

  let text = '';
  let voiceName = 'Puck';
  let referenceAudio = null;

  if (typeof options === 'string') {
    text = options;
    voiceName = voiceNameArg || 'Puck';
  } else {
    text = options.text;
    voiceName = options.voiceName || 'Puck';
    referenceAudio = options.referenceAudio;
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    // 1. Determine Model and Mode
    // Default to TTS model for stability
    let model = "gemini-2.5-flash-preview-tts"; 
    
    // 2. Handle Voice Mapping (Vietnamese vs Standard)
    let targetVoiceName = 'Puck';
    let processedText = text;

    // Check if it is one of our custom Vietnamese IDs
    const vnVoice = VOICES.find(v => v.id === voiceName && (v as any).baseVoice);
    
    if (vnVoice) {
       // Map to the underlying API voice (Charon/Zephyr)
       targetVoiceName = (vnVoice as any).baseVoice;
       
       // Just use the raw text. 
       processedText = text;
    } else {
      if (referenceAudio) {
        // Fallback for cloning logic if active
        targetVoiceName = 'Charon'; 
      } else {
        // Standard English selection
        const foundVoice = VOICES.find(v => v.id === voiceName); // Match by ID first
        if (foundVoice) {
            targetVoiceName = foundVoice.name.split(' ')[0]; // Extract 'Puck' from 'Puck (US)'
        } else {
             // Fallback lookup by name just in case
             const foundByName = VOICES.find(v => v.name === voiceName);
             targetVoiceName = foundByName ? foundByName.name.split(' ')[0] : 'Puck';
        }
      }
    }

    // 3. Configure Payload
    const config = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: targetVoiceName },
        },
      },
    };

    const contents = [{ parts: [{ text: processedText }] }];

    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
      const errorText = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (errorText) {
          throw new Error("AI returned text instead of audio: " + errorText);
      }
      throw new Error("No audio data received from Gemini.");
    }

    return base64Audio;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    if (error.message?.includes("400")) {
        throw new Error("API Error: The selected model configuration is not supported by your API key.");
    }
    if (error.message?.includes("404")) {
        throw new Error("Model not found. Google may have updated their API endpoints.");
    }
    
    throw error;
  }
};