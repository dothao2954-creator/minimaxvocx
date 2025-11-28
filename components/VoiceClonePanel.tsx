
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Upload, X, AlertTriangle, ShieldCheck, Play, Loader2, Square, CheckCircle2, Activity, BarChart2, Save, Disc, Trash2, Pencil, Star } from 'lucide-react';
import { SavedVoice } from '../types';

interface VoiceClonePanelProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  onPreview: () => void;
  onStopPreview: () => void;
  isPreviewing: boolean;
  isPreviewPlaying: boolean;
  isAnalyzing: boolean;
  analysisError?: string | null;
  savedVoices: SavedVoice[];
  activeVoiceId: string | null;
  onSaveVoice: (name: string) => void;
  onSelectSavedVoice: (voice: SavedVoice) => void;
  onRenameSavedVoice: (id: string, newName: string) => void;
  onDeleteSavedVoice: (id: string) => void;
  hasPreviewed: boolean;
  analysisScore: number | null;
}

const MAX_FILE_SIZE_MB = 10;

const VoiceClonePanel: React.FC<VoiceClonePanelProps> = ({ 
  onFileSelect, 
  selectedFile, 
  onPreview,
  onStopPreview, 
  isPreviewing,
  isPreviewPlaying, 
  isAnalyzing,
  analysisError,
  savedVoices,
  activeVoiceId,
  onSaveVoice,
  onSelectSavedVoice,
  onRenameSavedVoice,
  onDeleteSavedVoice,
  hasPreviewed,
  analysisScore
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [audioMetrics, setAudioMetrics] = useState<{ peak: number; rms: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Save Voice Modal State
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newVoiceName, setNewVoiceName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  // Rename Voice Modal State
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameVoiceId, setRenameVoiceId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Combine local validation errors with upstream analysis errors
  const activeError = localError || (!selectedFile ? analysisError : null);

  // Reset states when file changes
  useEffect(() => {
    if (!selectedFile) {
      setShowDeleteConfirm(false);
      setShowSaveDialog(false);
      setNewVoiceName('');
      setNameError(null);
    }
  }, [selectedFile]);

  // Waveform Generation & Metrics Logic
  useEffect(() => {
    if (!selectedFile || !canvasRef.current) return;

    let audioContext: AudioContext | null = null;
    let isMounted = true;

    const drawWaveform = async () => {
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        if (!isMounted || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Visual config
        const width = canvas.width;
        const height = canvas.height;
        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        // --- Calculate Metrics ---
        let maxVal = 0;
        let sumSquares = 0;
        
        for (let i = 0; i < data.length; i++) {
            const abs = Math.abs(data[i]);
            if (abs > maxVal) maxVal = abs;
            sumSquares += abs * abs;
        }
        
        const rms = Math.sqrt(sumSquares / data.length);
        
        setAudioMetrics({
            peak: maxVal,
            rms: rms
        });

        // --- Draw Canvas ---
        ctx.clearRect(0, 0, width, height);
        
        // Draw Center Line
        ctx.beginPath();
        ctx.strokeStyle = '#3f3f46'; // zinc-700
        ctx.lineWidth = 1;
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Draw Waveform
        ctx.beginPath();
        ctx.moveTo(0, amp);
        
        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        if (analysisError) {
             gradient.addColorStop(0, '#f87171'); // red-400
             gradient.addColorStop(1, '#ef4444'); // red-500
        } else {
             gradient.addColorStop(0, '#6366f1'); // indigo-500
             gradient.addColorStop(1, '#10b981'); // emerald-500
        }

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;

        for (let i = 0; i < width; i++) {
          let min = 1.0;
          let max = -1.0;
          
          for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
          }
          
          ctx.lineTo(i, (1 + min) * amp);
          ctx.lineTo(i, (1 + max) * amp);
        }
        
        ctx.stroke();

      } catch (e) {
        console.error("Error drawing waveform", e);
      } finally {
        if (audioContext) {
          audioContext.close();
        }
      }
    };

    drawWaveform();

    return () => {
      isMounted = false;
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [selectedFile, analysisError]);

  const validateFile = (file: File): boolean => {
    setLocalError(null);
    setAudioMetrics(null); // Reset metrics on new file
    
    if (!file.type.startsWith('audio/')) {
      setLocalError("Invalid file type. Please upload an audio file (WAV, MP3, M4A).");
      return false;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setLocalError(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      return false;
    }

    return true;
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        onFileSelect(file);
      }
    }
  }, [onFileSelect]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        onFileSelect(file);
      } else {
        // Reset input so user can try again
        e.target.value = '';
      }
    }
  };

  const validateName = (name: string, ignoreId: string | null = null): string | null => {
    if (!name.trim()) return "Voice name cannot be empty.";
    if (name.length > 32) return "Name is too long (max 32 chars).";
    // Strict alphanumeric, space, hyphen validation
    if (!/^[a-zA-Z0-9\s-]+$/.test(name)) return "Only letters, numbers, spaces, and hyphens allowed.";
    
    // Check for duplicates
    const isDuplicate = savedVoices.some(v => v.name.toLowerCase() === name.toLowerCase() && v.id !== ignoreId);
    if (isDuplicate) return "A voice with this name already exists.";
    
    return null;
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>, isRename: boolean = false) => {
    const val = e.target.value;
    if (isRename) setRenameName(val);
    else setNewVoiceName(val);

    // If empty, just clear error (button disable handles the "required" aspect)
    if (!val) {
      setNameError(null);
      return;
    }

    // Real-time regex check
    if (!/^[a-zA-Z0-9\s-]+$/.test(val)) {
      setNameError("Only letters, numbers, spaces, and hyphens allowed.");
    } else {
      // Clear error if it was a regex error previously
      if (nameError === "Only letters, numbers, spaces, and hyphens allowed.") {
        setNameError(null);
      }
    }
  };

  const handleOpenSaveDialog = () => {
    if (selectedFile) {
      let name = selectedFile.name.replace(/\.[^/.]+$/, "");
      // Clean up the initial name
      name = name.replace(/[^a-zA-Z0-9 -]/g, " ").replace(/\s+/g, " ").trim();
      setNewVoiceName(name.substring(0, 32));
    }
    setShowSaveDialog(true);
    setNameError(null);
  };

  const executeSave = () => {
      const name = newVoiceName.trim();
      const error = validateName(name);
      if (error) {
          setNameError(error);
          return;
      }

      onSaveVoice(name);
      setShowSaveDialog(false);
      setNewVoiceName('');
      setNameError(null);
  };

  const handleOpenRenameDialog = (id: string, currentName: string) => {
      setRenameVoiceId(id);
      setRenameName(currentName);
      setShowRenameDialog(true);
      setNameError(null);
  };

  const executeRename = () => {
      if (!renameVoiceId) return;
      const name = renameName.trim();
      const error = validateName(name, renameVoiceId);
      if (error) {
          setNameError(error);
          return;
      }
      onRenameSavedVoice(renameVoiceId, name);
      setShowRenameDialog(false);
      setRenameVoiceId(null);
      setRenameName('');
      setNameError(null);
  };

  const getScoreColor = (score: number) => {
      if (score >= 80) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      if (score >= 50) return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
      return 'text-red-400 border-red-500/30 bg-red-500/10';
  };

  return (
    <div className="w-full">
      {/* Rename Dialog Overlay */}
      {showRenameDialog && (
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
             <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                 <h3 className="text-lg font-semibold text-white mb-4">Rename Voice</h3>
                 <input 
                    autoFocus
                    type="text" 
                    value={renameName}
                    maxLength={32}
                    onChange={(e) => handleNameChange(e, true)}
                    className={`
                        w-full bg-zinc-950 border rounded-lg px-4 py-2 text-white mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500
                        ${nameError ? 'border-red-500' : 'border-zinc-700'}
                    `}
                    onKeyDown={(e) => e.key === 'Enter' && renameName.trim() && !nameError && executeRename()}
                 />
                 
                 {nameError && (
                    <p className="text-xs text-red-400 font-medium mb-4">{nameError}</p>
                 )}

                 <div className="flex justify-end space-x-2 mt-4">
                    <button 
                        onClick={() => {
                            setShowRenameDialog(false);
                            setNameError(null);
                        }}
                        className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={executeRename}
                        disabled={!renameName.trim() || !!nameError}
                        className={`
                            px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-lg shadow-indigo-500/20
                            ${(!renameName.trim() || !!nameError)
                                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                                : 'bg-indigo-600 hover:bg-indigo-500'}
                        `}
                    >
                        Save Changes
                    </button>
                 </div>
             </div>
         </div>
      )}

      {!selectedFile ? (
        <div className="space-y-4">
            <label 
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
                relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200
                ${isDragging 
                ? 'border-indigo-500 bg-indigo-500/10' 
                : activeError 
                    ? 'border-red-500/40 bg-red-500/5' 
                    : 'border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-500'}
            `}
            >
            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-6">
                <div className={`p-4 rounded-full mb-3 transition-colors ${
                activeError 
                    ? 'bg-red-500/20 text-red-400' 
                    : isDragging ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}>
                {activeError ? <AlertTriangle size={24} /> : <Upload size={24} />}
                </div>
                
                {activeError ? (
                <div className="animate-in fade-in zoom-in-95 duration-200 flex flex-col items-center">
                    <p className="text-sm text-red-400 font-bold mb-1">Analysis Failed</p>
                    <p className="text-xs text-red-300/80 mb-3 text-center leading-relaxed max-w-[90%] bg-red-500/10 p-2 rounded">
                    {activeError}
                    </p>
                    <span className="inline-flex items-center text-xs font-semibold text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20 hover:bg-red-500/20 transition-colors">
                    Try another file
                    </span>
                </div>
                ) : (
                <>
                    <p className="mb-2 text-sm text-zinc-300 font-medium">
                    <span className="font-semibold">Click to upload</span> or drag reference audio
                    </p>
                    <div className="flex flex-col items-center space-y-2">
                        <p className="text-xs text-zinc-500">Supports WAV, MP3, M4A</p>
                        <div className="px-2 py-0.5 rounded border border-zinc-700/50 bg-zinc-800/30 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
                            Max {MAX_FILE_SIZE_MB}MB
                        </div>
                    </div>
                </>
                )}
            </div>
            <input type="file" className="hidden" accept="audio/*" onChange={handleChange} />
            </label>

            {/* Saved Voices List */}
            {savedVoices.length > 0 && (
                <div className="animate-in fade-in slide-in-from-bottom-2">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-2 px-1">Your Saved Voices</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {savedVoices.map(voice => {
                            const isActive = activeVoiceId === voice.id;
                            return (
                                <div
                                    key={voice.id}
                                    className={`
                                        relative flex items-center justify-between p-2 rounded-lg border transition-all group
                                        ${isActive 
                                            ? 'bg-zinc-800 border-indigo-500/80 shadow-[0_0_10px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/30' 
                                            : 'bg-zinc-900 border-zinc-800 hover:border-indigo-500/30 hover:bg-zinc-800'}
                                    `}
                                >
                                    <button
                                        onClick={() => onSelectSavedVoice(voice)}
                                        className="flex items-center flex-1 min-w-0 text-left"
                                    >
                                        <div className={`
                                            w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0 transition-colors
                                            ${isActive ? 'bg-indigo-500 text-white' : 'bg-indigo-500/20 text-indigo-400 group-hover:bg-indigo-500/40 group-hover:text-indigo-200'}
                                        `}>
                                            <Disc size={16} />
                                        </div>
                                        <div className="min-w-0 pr-2">
                                            <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-zinc-200'}`}>{voice.name}</p>
                                            <p className="text-xs text-zinc-500">{new Date(voice.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    </button>
                                    
                                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenRenameDialog(voice.id, voice.name);
                                            }}
                                            className="p-1.5 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors"
                                            title="Rename voice"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteSavedVoice(voice.id);
                                            }}
                                            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                            title="Delete voice"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    
                                    {isActive && (
                                        <div className="absolute top-2 right-2 flex space-x-1 group-hover:opacity-0 pointer-events-none">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
      ) : (
        <div className="flex flex-col space-y-3 animate-in fade-in slide-in-from-bottom-2">
          {/* File Info Card with Waveform */}
          <div className={`
             relative bg-zinc-900 border rounded-xl overflow-hidden transition-colors duration-300
             ${isAnalyzing ? 'border-zinc-700' : 'border-emerald-500/30 bg-emerald-950/10'}
          `}>
             {/* Delete Confirmation Overlay */}
             {showDeleteConfirm && (
                <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-center p-4 animate-in fade-in zoom-in-95 duration-200">
                  <AlertTriangle className="text-red-500 mb-2" size={24} />
                  <p className="text-sm font-medium text-zinc-200 mb-3">Are you sure you want to remove this file?</p>
                  <div className="flex space-x-3">
                    <button 
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors border border-zinc-700"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        onFileSelect(null);
                        setLocalError(null);
                        setAudioMetrics(null);
                        setShowDeleteConfirm(false);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors shadow-lg shadow-red-500/20 border border-red-500"
                    >
                      Remove
                    </button>
                  </div>
                </div>
             )}

             {/* Save Name Confirmation Dialog Overlay */}
             {showSaveDialog && (
                 <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-center p-4 animate-in fade-in zoom-in-95 duration-200">
                     <h3 className="text-sm font-semibold text-white mb-3">Confirm Voice Name</h3>
                     <p className="text-xs text-zinc-400 mb-3 max-w-[220px]">
                        Please confirm the name for this voice clone before saving to your library.
                     </p>
                     <input 
                        autoFocus
                        type="text" 
                        value={newVoiceName}
                        maxLength={32}
                        onChange={(e) => handleNameChange(e, false)}
                        placeholder="e.g. My Narrator Voice"
                        className={`
                            w-full max-w-[200px] bg-zinc-900 border rounded-md px-3 py-1.5 text-sm text-white mb-1 focus:outline-none focus:border-indigo-500
                            ${nameError ? 'border-red-500' : 'border-zinc-700'}
                        `}
                        onKeyDown={(e) => e.key === 'Enter' && newVoiceName.trim() && !nameError && executeSave()}
                     />
                     
                     {/* Error Message */}
                     <div className="h-5 w-full max-w-[200px] mb-2 text-left">
                        {nameError && (
                            <p className="text-[10px] text-red-400 font-medium truncate">{nameError}</p>
                        )}
                     </div>

                     <div className="flex space-x-2">
                        <button 
                            onClick={() => {
                                setShowSaveDialog(false);
                                setNameError(null);
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors border border-zinc-700"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={executeSave}
                            disabled={!newVoiceName.trim() || !!nameError}
                            className={`
                                px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors shadow-lg
                                ${(!newVoiceName.trim() || !!nameError)
                                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                                    : 'bg-indigo-600 hover:bg-indigo-500'}
                            `}
                        >
                            Confirm & Save
                        </button>
                     </div>
                 </div>
             )}

             <div className="p-4 flex items-center justify-between relative z-10">
                <div className="flex items-center space-x-4 overflow-hidden">
                    <div className={`
                        w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-500
                        ${isAnalyzing 
                            ? 'bg-indigo-500/10 text-indigo-400' 
                            : 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]'}
                    `}>
                        {isAnalyzing ? <Loader2 size={24} className="animate-spin" /> : <CheckCircle2 size={24} />}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-zinc-200 truncate">{selectedFile.name}</h3>
                        <div className="flex items-center space-x-2">
                        {isAnalyzing ? (
                            <p className="text-xs text-indigo-400 font-medium animate-pulse">Analyzing voice signature...</p>
                        ) : (
                            <div className="flex items-center space-x-3">
                                <div className="flex items-center space-x-1.5">
                                    <p className="text-xs text-emerald-400 font-medium">Verified</p>
                                    <span className="text-[10px] text-emerald-500/70 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">High Fidelity</span>
                                </div>
                                {analysisScore !== null && (
                                    <div className={`
                                        flex items-center space-x-1 px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-wide
                                        ${getScoreColor(analysisScore)}
                                    `} title="Higher score indicates better clone quality">
                                        <Star size={10} fill="currentColor" />
                                        <span>{analysisScore}/100</span>
                                    </div>
                                )}
                            </div>
                        )}
                        </div>
                    </div>
                </div>
                
                <button 
                onClick={(e) => {
                    e.preventDefault();
                    if (!isAnalyzing) {
                        setShowDeleteConfirm(true);
                    }
                }}
                disabled={isAnalyzing}
                className={`
                    p-2 rounded-lg transition-colors
                    ${isAnalyzing 
                        ? 'text-zinc-700 cursor-not-allowed' 
                        : 'text-zinc-500 hover:bg-zinc-800 hover:text-red-400'}
                `}
                >
                    <X size={20} />
                </button>
             </div>

             {/* Waveform Visualization Area */}
             <div className="relative w-full h-16 bg-zinc-950/50 border-t border-zinc-800/50 group">
                <canvas 
                    ref={canvasRef} 
                    width={600} 
                    height={64} 
                    className="w-full h-full block opacity-80"
                />
                
                {/* Scanning overlay animation */}
                {isAnalyzing && (
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent animate-scan pointer-events-none" />
                )}
                
                {/* Audio Metrics Overlay - Visible immediately after calculation */}
                {audioMetrics && !analysisError && !showDeleteConfirm && !showSaveDialog && (
                    <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none z-10 animate-in fade-in duration-500">
                        <div className="flex items-center space-x-1.5 bg-zinc-950/70 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-mono border border-zinc-800 text-indigo-300">
                             <Activity size={10} />
                             <span>Peak: {audioMetrics.peak.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center space-x-1.5 bg-zinc-950/70 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-mono border border-zinc-800 text-emerald-300">
                             <BarChart2 size={10} />
                             <span>RMS: {audioMetrics.rms.toFixed(3)}</span>
                        </div>
                    </div>
                )}
                
                {!isAnalyzing && !analysisError && (
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-emerald-500/5 to-transparent pointer-events-none" />
                )}
             </div>
          </div>

          {/* Inline Error Display */}
          {analysisError && !isAnalyzing && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start space-x-3">
                <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                   <h4 className="text-xs font-bold text-red-400 mb-0.5">Processing Error</h4>
                   <p className="text-xs text-red-300/90 leading-relaxed">{analysisError}</p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons: Preview & Save */}
          <div className="flex space-x-2">
            {isPreviewPlaying ? (
                <button
                    onClick={onStopPreview}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center space-x-2 transition-all bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                >
                    <Square size={16} fill="currentColor" />
                    <span>Stop Preview</span>
                </button>
            ) : (
                <button
                    onClick={onPreview}
                    disabled={isPreviewing || isAnalyzing}
                    className={`
                    flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center space-x-2 transition-all
                    ${isPreviewing || isAnalyzing 
                        ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed' 
                        : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 hover:text-indigo-200'}
                    `}
                >
                    {isPreviewing ? (
                    <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Synthesizing Preview...</span>
                    </>
                    ) : (
                    <>
                        <Play size={16} fill="currentColor" />
                        <span>Preview Voice Clone</span>
                    </>
                    )}
                </button>
            )}

            {/* Save Button - Only show if analyzed, valid, previewed AND NOT currently a saved voice */}
            {!isAnalyzing && !analysisError && selectedFile && !activeVoiceId && (
                <button
                    onClick={handleOpenSaveDialog}
                    disabled={!hasPreviewed}
                    className={`
                        px-4 py-2.5 rounded-lg font-medium flex items-center justify-center space-x-2 transition-all shadow-lg
                        ${hasPreviewed 
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20' 
                            : 'bg-zinc-800 text-zinc-500 border border-zinc-700 opacity-50 cursor-not-allowed'}
                    `}
                    title={hasPreviewed ? "Save Voice to Library" : "Preview voice before saving"}
                >
                    <Save size={18} />
                    <span className="hidden sm:inline">Save Voice</span>
                </button>
            )}
          </div>
        </div>
      )}
      
      {!savedVoices.length && !selectedFile && (
        <div className="mt-4 p-3 bg-indigo-900/10 border border-indigo-500/20 rounded-lg flex flex-col space-y-2">
            <div className="flex items-center space-x-2 text-indigo-300">
            <ShieldCheck size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">Strict Quality Check</span>
            </div>
            <ul className="text-xs text-indigo-200/80 space-y-1 list-disc list-inside">
            <li>Upload a clear voice recording (10-30 seconds).</li>
            <li><strong>No background music</strong> or constant noise.</li>
            <li>Speak at a <strong>moderate, natural pace</strong>.</li>
            <li>Use <strong>expressive intonation</strong> (avoid monotone).</li>
            </ul>
        </div>
      )}

      <style>{`
        @keyframes scan {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        .animate-scan {
            animation: scan 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default VoiceClonePanel;
