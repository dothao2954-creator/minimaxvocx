import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateSpeech, VOICES } from './services/gemini';
import { decodeAudioData, analyzeAudioQuality, fileToBase64 } from './utils/audio';
import { saveVoiceToDB, getSavedVoicesFromDB, deleteSavedVoiceFromDB, updateSavedVoiceInDB } from './utils/db';
import { GeneratedAudio, TTSStatus, SavedVoice } from './types';
import VoiceSelector from './components/VoiceSelector';
import HistoryItem from './components/HistoryItem';
import VoiceClonePanel from './components/VoiceClonePanel';
import ProcessingItem from './components/ProcessingItem';
import { Sparkles, History, Volume2, Mic, AlertCircle, Loader2, Wand2, Gauge, Volume1, VolumeX } from 'lucide-react';

type AppMode = 'standard' | 'clone';

// Helper to safely get API Key
const getApiKey = () => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_API_KEY;
  }
  if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
    return process.env.API_KEY;
  }
  return '';
};

export default function App() {
  const [mode, setMode] = useState<AppMode>('standard');
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<string>(VOICES[0].id);
  const [clonedFile, setClonedFile] = useState<File | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  
  const [status, setStatus] = useState<TTSStatus>(TTSStatus.IDLE);
  const [loadingText, setLoadingText] = useState<string>('Generating...');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedAudio[]>([]);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);

  // Saved Voices Library
  const [savedVoices, setSavedVoices] = useState<SavedVoice[]>([]);
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);

  // Separate state for previewing
  const [isPreviewing, setIsPreviewing] = useState(false); // Generating the preview
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false); // Playing the preview audio
  const [hasPreviewed, setHasPreviewed] = useState(false); // Track if user has previewed successfully
  
  // State for immediate file analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisScore, setAnalysisScore] = useState<number | null>(null);

  // Audio Context Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // Initialize AudioContext & GainNode
  useEffect(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000
    });
    audioContextRef.current = ctx;

    // Create GainNode for volume control
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    gainNode.connect(ctx.destination);
    gainNodeRef.current = gainNode;
    
    return () => {
      ctx.close();
    };
  }, []);

  // Load Saved Voices from DB
  useEffect(() => {
    const loadVoices = async () => {
      try {
        const voices = await getSavedVoicesFromDB();
        setSavedVoices(voices.sort((a, b) => b.createdAt - a.createdAt));
      } catch (e) {
        console.error("Failed to load saved voices", e);
      }
    };
    loadVoices();
  }, []);

  // Update volume in real-time
  useEffect(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      // Use setTargetAtTime for smooth volume transitions preventing clicks/pops
      gainNodeRef.current.gain.setTargetAtTime(volume, audioContextRef.current.currentTime, 0.05);
    }
  }, [volume]);

  // Update active source when rate changes
  useEffect(() => {
    if (sourceNodeRef.current && audioContextRef.current) {
      sourceNodeRef.current.playbackRate.setValueAtTime(playbackRate, audioContextRef.current.currentTime);
    }
  }, [playbackRate]);

  const validateAndAnalyzeAudio = async (file: File): Promise<number> => {
    if (!audioContextRef.current) return 0;
    try {
        const arrayBuffer = await file.arrayBuffer();
        // Attempt to decode the user's file to ensure it's valid audio
        const analysisBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        
        // Run advanced quality checks
        const analysis = analyzeAudioQuality(analysisBuffer);
        if (!analysis.valid) {
            throw new Error(analysis.reason || "Audio validation failed.");
        }
        return analysis.score;
    } catch (e: any) {
        console.error("Analysis failed", e);
        if (e.message) {
            throw e;
        }
        throw new Error("Failed to analyze audio file. The file may be corrupted or in an unsupported format.");
    }
  };

  // Shared processing logic for both new files and saved files
  const processFile = async (file: File) => {
    setClonedFile(file);
    setIsAnalyzing(true);
    setError(null);
    setHasPreviewed(false); // Reset preview state on new file
    setAnalysisScore(null);

    try {
      // Artificial delay to ensure user sees the "Analyzing" state and UI doesn't flicker
      await new Promise(resolve => setTimeout(resolve, 800));
      const score = await validateAndAnalyzeAudio(file);
      setAnalysisScore(score);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setClonedFile(null); // Reset file if invalid
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileSelect = async (file: File | null) => {
    if (!file) {
      setClonedFile(null);
      setError(null);
      setHasPreviewed(false);
      setActiveVoiceId(null);
      setAnalysisScore(null);
      return;
    }

    // Since this is a direct upload, it's not a saved voice yet
    setActiveVoiceId(null);
    await processFile(file);
  };

  const handleSelectSavedVoice = async (voice: SavedVoice) => {
    setActiveVoiceId(voice.id);
    await processFile(voice.file);
  };

  const handleRenameSavedVoice = async (id: string, newName: string) => {
    const voiceToUpdate = savedVoices.find(v => v.id === id);
    if (!voiceToUpdate) return;
    
    const updatedVoice = { ...voiceToUpdate, name: newName };
    try {
        await updateSavedVoiceInDB(updatedVoice);
        setSavedVoices(prev => prev.map(v => v.id === id ? updatedVoice : v));
    } catch (e) {
        console.error("Failed to rename voice", e);
        setError("Failed to rename voice.");
    }
  };

  const handleSaveVoice = async (name: string) => {
    if (!clonedFile) return;
    
    const newVoice: SavedVoice = {
      id: crypto.randomUUID(),
      name: name,
      file: clonedFile,
      createdAt: Date.now()
    };
    
    try {
      await saveVoiceToDB(newVoice);
      setSavedVoices(prev => [newVoice, ...prev]);
      // Automatically switch to this new saved voice as active
      setActiveVoiceId(newVoice.id);
    } catch (e) {
      console.error("Failed to save voice to DB", e);
      setError("Failed to save voice to local storage.");
    }
  };

  const handleDeleteSavedVoice = async (id: string) => {
    try {
      await deleteSavedVoiceFromDB(id);
      setSavedVoices(prev => prev.filter(v => v.id !== id));
      if (activeVoiceId === id) {
        setActiveVoiceId(null);
      }
    } catch (e) {
      console.error("Failed to delete voice", e);
      setError("Failed to delete saved voice.");
    }
  };

  const playAudio = useCallback((item: GeneratedAudio) => {
    if (!audioContextRef.current || !item.audioBuffer) return;

    // Stop current playing
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
    }
    
    // Reset all playing states to ensure clean slate
    setCurrentlyPlayingId(null);
    setIsPreviewPlaying(false);
    setStatus(TTSStatus.IDLE);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = item.audioBuffer;
    source.playbackRate.value = playbackRate; // Apply current speed preference
    
    // Connect to GainNode (Volume) instead of Destination directly
    if (gainNodeRef.current) {
      source.connect(gainNodeRef.current);
    } else {
      source.connect(audioContextRef.current.destination);
    }
    
    source.onended = () => {
      if (item.id === 'preview-temp') {
          setIsPreviewPlaying(false);
      } else {
          setCurrentlyPlayingId(null);
          setStatus(TTSStatus.IDLE);
      }
    };

    source.start();
    sourceNodeRef.current = source;
    
    if (item.id === 'preview-temp') {
        setIsPreviewPlaying(true);
    } else {
        setCurrentlyPlayingId(item.id);
        setStatus(TTSStatus.PLAYING);
    }
  }, [playbackRate]);

  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    setCurrentlyPlayingId(null);
    setIsPreviewPlaying(false);
    setStatus(TTSStatus.IDLE);
  }, []);

  const handlePreview = async () => {
    if (!clonedFile || !audioContextRef.current) return;
    
    // Stop any current audio before starting preview logic
    stopAudio();

    setIsPreviewing(true);
    setError(null);

    try {
        // Re-validate just in case
        await validateAndAnalyzeAudio(clonedFile);

        const base64Ref = await fileToBase64(clonedFile);

        // Perform real voice cloning generation
        const base64Data = await generateSpeech({
            text: "Hello! This is a preview of how your cloned voice will sound. The AI is mimicking your tone.",
            referenceAudio: {
                data: base64Ref,
                mimeType: clonedFile.type
            }
        });
        
        const audioBuffer = await decodeAudioData(base64Data, audioContextRef.current);

        const previewItem: GeneratedAudio = {
            id: 'preview-temp',
            text: "Preview Voice",
            voiceId: 'cloned-preview',
            voiceName: 'Preview',
            timestamp: Date.now(),
            audioBuffer: audioBuffer,
            duration: audioBuffer.duration
        };

        playAudio(previewItem);
        setHasPreviewed(true); // Mark as previewed successfully

    } catch (err: any) {
        console.error(err);
        setError(err.message || "Preview failed");
    } finally {
        setIsPreviewing(false);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    
    const apiKey = getApiKey();
    if (!apiKey) {
        setError("Missing API Key. Please verify your environment.");
        return;
    }
    if (mode === 'clone' && !clonedFile) {
        setError("Please upload a reference audio file for cloning.");
        return;
    }

    setStatus(TTSStatus.GENERATING);
    setLoadingText(mode === 'clone' ? 'Processing Voice...' : 'Generating...');
    setError(null);
    
    // Stop any playing audio
    stopAudio();

    try {
      let voiceLabel = VOICES.find(v => v.id === selectedVoice)?.name || 'Unknown';
      let options: any = { text, voiceName: selectedVoice };

      if (mode === 'clone' && clonedFile && audioContextRef.current) {
        // Ensure analysis passed
        await validateAndAnalyzeAudio(clonedFile);
           
        setLoadingText('Processing Audio...');
        const base64Ref = await fileToBase64(clonedFile);
        
        setLoadingText('Synthesizing Clone...');
        
        options = {
            text,
            referenceAudio: {
                data: base64Ref,
                mimeType: clonedFile.type
            }
        };
        
        // Determine correct label
        if (activeVoiceId) {
            const saved = savedVoices.find(v => v.id === activeVoiceId);
            if (saved) {
                voiceLabel = saved.name;
            } else {
                voiceLabel = `Cloned Voice`;
            }
        } else {
            voiceLabel = `Cloned (${clonedFile.name})`;
        }
      }

      const base64Data = await generateSpeech(options);
      
      if (!audioContextRef.current) return;

      const audioBuffer = await decodeAudioData(base64Data, audioContextRef.current);
      
      const newItem: GeneratedAudio = {
        id: crypto.randomUUID(),
        text: text,
        voiceId: mode === 'clone' ? 'cloned' : selectedVoice,
        voiceName: voiceLabel,
        timestamp: Date.now(),
        audioBuffer: audioBuffer,
        duration: audioBuffer.duration
      };

      setHistory(prev => [newItem, ...prev]);
      setStatus(TTSStatus.IDLE);
      
      // Auto-play the new item
      playAudio(newItem);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate speech");
      setStatus(TTSStatus.ERROR);
    }
  };

  const handleDelete = (id: string) => {
    if (currentlyPlayingId === id) stopAudio();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30 font-sans">
      
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Volume2 size={20} className="text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
              MiniVox
            </h1>
          </div>
          <div className="flex items-center space-x-4">
             <span className="hidden md:inline-block text-xs font-mono text-zinc-500 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
                gemini-2.5-flash-tts
             </span>
             <a href="#" className="text-sm text-zinc-400 hover:text-white transition-colors">Docs</a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Controls (Voice & Input) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Mode Tabs */}
          <div className="flex p-1 bg-zinc-900/80 rounded-xl border border-zinc-800">
            <button
              onClick={() => {
                setMode('standard');
                setError(null);
                stopAudio();
              }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg flex items-center justify-center space-x-2 transition-all ${
                mode === 'standard' 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Mic size={16} />
              <span>Standard Voices</span>
            </button>
            <button
              onClick={() => {
                setMode('clone');
                setError(null);
                stopAudio();
              }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg flex items-center justify-center space-x-2 transition-all ${
                mode === 'clone' 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Wand2 size={16} />
              <span>Voice Clone</span>
            </button>
          </div>

          {/* Voice Selection or Cloning UI */}
          <div className="min-h-[220px]">
            {mode === 'standard' ? (
              <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="flex items-center mb-4 space-x-2">
                  <h2 className="text-lg font-semibold text-zinc-200">Select Voice Model</h2>
                </div>
                <VoiceSelector 
                  selectedVoiceId={selectedVoice} 
                  onSelect={setSelectedVoice} 
                />
              </div>
            ) : (
               <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                 <div className="flex items-center mb-4 space-x-2">
                  <h2 className="text-lg font-semibold text-zinc-200">Upload Reference Voice</h2>
                </div>
                <VoiceClonePanel 
                  selectedFile={clonedFile}
                  onFileSelect={handleFileSelect}
                  onPreview={handlePreview}
                  onStopPreview={stopAudio}
                  isPreviewing={isPreviewing}
                  isPreviewPlaying={isPreviewPlaying}
                  isAnalyzing={isAnalyzing}
                  analysisError={mode === 'clone' ? error : null}
                  savedVoices={savedVoices}
                  activeVoiceId={activeVoiceId}
                  onSaveVoice={handleSaveVoice}
                  onSelectSavedVoice={handleSelectSavedVoice}
                  onRenameSavedVoice={handleRenameSavedVoice}
                  onDeleteSavedVoice={handleDeleteSavedVoice}
                  hasPreviewed={hasPreviewed}
                  analysisScore={analysisScore}
                />
               </div>
            )}
          </div>

          {/* Text Input */}
          <section className="bg-zinc-900/50 p-1 rounded-2xl border border-zinc-800 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all shadow-xl">
             <div className="p-4">
               <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={mode === 'clone' ? "Enter the text you want the cloned voice to speak..." : "Type something amazing for the AI to say..."}
                className="w-full h-40 bg-transparent text-lg resize-none outline-none placeholder:text-zinc-600"
                spellCheck={false}
               />
             </div>
             
             {/* Bottom Bar inside Input */}
             <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between bg-zinc-900/80 rounded-b-xl">
                <div className="text-xs text-zinc-500">
                  {text.length} characters
                </div>
                
                <button
                  onClick={handleGenerate}
                  disabled={!text.trim() || status === TTSStatus.GENERATING || isAnalyzing || (mode === 'clone' && !clonedFile)}
                  className={`
                    flex items-center space-x-2 px-6 py-2.5 rounded-lg font-medium transition-all duration-200
                    ${!text.trim() || status === TTSStatus.GENERATING || isAnalyzing || (mode === 'clone' && !clonedFile)
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98]'
                    }
                  `}
                >
                  {status === TTSStatus.GENERATING ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>{loadingText}</span>
                    </>
                  ) : (
                    <>
                      {mode === 'clone' ? <Wand2 size={18} /> : <Sparkles size={18} />}
                      <span>{mode === 'clone' ? 'Clone & Speak' : 'Generate Speech'}</span>
                    </>
                  )}
                </button>
             </div>
          </section>

          {/* Only show global error if it's NOT handled by the clone panel logic to avoid duplication */}
          {error && mode !== 'clone' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center text-red-400 text-sm animate-in fade-in zoom-in-95">
              <AlertCircle size={18} className="mr-2 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Right Column: History/Results */}
        <div className="lg:col-span-5 flex flex-col h-full min-h-[500px]">
           <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <History size={18} className="text-zinc-400" />
                <h2 className="text-lg font-semibold">Generations</h2>
              </div>
              
              <div className="flex items-center space-x-2">
                {/* Volume Control */}
                <div className="flex items-center space-x-2 bg-zinc-900/50 rounded-lg p-1.5 border border-zinc-800/50 mr-2">
                   <div className="text-zinc-500">
                      {volume === 0 ? <VolumeX size={14} /> : volume < 0.5 ? <Volume1 size={14} /> : <Volume2 size={14} />}
                   </div>
                   <input 
                     type="range"
                     min="0"
                     max="1"
                     step="0.05"
                     value={volume}
                     onChange={(e) => setVolume(parseFloat(e.target.value))}
                     className="w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                     aria-label="Volume"
                   />
                </div>

                {/* Speed Control */}
                <div className="flex items-center space-x-2 bg-zinc-900/50 rounded-lg p-1 border border-zinc-800/50">
                   <Gauge size={14} className="text-zinc-500 ml-2" />
                   <select 
                     value={playbackRate}
                     onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                     className="bg-transparent text-xs font-medium text-zinc-300 focus:outline-none cursor-pointer py-1 pr-2 [&>option]:bg-zinc-900"
                     aria-label="Playback Speed"
                   >
                     <option value="0.5">0.5x</option>
                     <option value="0.75">0.75x</option>
                     <option value="1">1.0x</option>
                     <option value="1.25">1.25x</option>
                     <option value="1.5">1.5x</option>
                     <option value="2">2.0x</option>
                   </select>
                </div>
              </div>
            </div>
            
            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl p-4 overflow-y-auto max-h-[calc(100vh-200px)] custom-scrollbar">
              {history.length === 0 && status !== TTSStatus.GENERATING ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center">
                    <Volume2 size={32} className="opacity-20" />
                  </div>
                  <p className="text-sm">Generated audio will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Processing Status Item */}
                  {status === TTSStatus.GENERATING && (
                    <ProcessingItem mode={mode} />
                  )}

                  {history.map(item => (
                    <HistoryItem
                      key={item.id}
                      item={item}
                      isPlaying={currentlyPlayingId === item.id}
                      onPlay={playAudio}
                      onPause={stopAudio}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
        </div>

      </main>
    </div>
  );
}