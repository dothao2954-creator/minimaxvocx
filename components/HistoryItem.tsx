import React from 'react';
import { GeneratedAudio } from '../types';
import { bufferToWave } from '../utils/audio';
import { Play, Pause, Download, Trash2, Mic2, FileAudio } from 'lucide-react';

interface HistoryItemProps {
  item: GeneratedAudio;
  isPlaying: boolean;
  onPlay: (item: GeneratedAudio) => void;
  onPause: () => void;
  onDelete: (id: string) => void;
}

const HistoryItem: React.FC<HistoryItemProps> = ({ item, isPlaying, onPlay, onPause, onDelete }) => {
  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleDownload = () => {
    if (!item.audioBuffer) return;
    
    try {
      // Create WAV blob
      const blob = bufferToWave(item.audioBuffer, item.audioBuffer.length);
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      // Clean filename
      const safeText = item.text.slice(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `minivox_${safeText}_${Date.now()}.wav`;
      
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (e) {
      console.error("Download failed", e);
      alert("Failed to generate download file.");
    }
  };

  return (
    <div className={`
      group flex items-center justify-between p-4 rounded-lg mb-2 transition-all
      ${isPlaying ? 'bg-zinc-800/80 border border-zinc-700' : 'bg-zinc-900/40 border border-transparent hover:bg-zinc-900'}
    `}>
      <div className="flex items-center space-x-4 flex-1 overflow-hidden">
        <button
          onClick={() => isPlaying ? onPause() : onPlay(item)}
          className={`
            w-10 h-10 rounded-full flex items-center justify-center transition-colors flex-shrink-0
            ${isPlaying ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700 group-hover:text-zinc-200'}
          `}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        
        <div className="flex-1 min-w-0">
          <p className="text-zinc-200 text-sm font-medium truncate pr-4">{item.text}</p>
          <div className="flex items-center space-x-2 mt-1">
             <span className={`
               flex items-center text-xs px-2 py-0.5 rounded-full border 
               ${item.voiceId === 'cloned' 
                 ? 'text-emerald-400 bg-emerald-900/20 border-emerald-900/50' 
                 : 'text-zinc-500 bg-zinc-800/50 border-zinc-800'}
             `}>
               {item.voiceId === 'cloned' ? <FileAudio size={10} className="mr-1" /> : <Mic2 size={10} className="mr-1" />}
               {item.voiceName}
             </span>
             <span className="text-xs text-zinc-600">{formatTime(item.timestamp)}</span>
             <span className="text-xs text-zinc-600">• {item.duration.toFixed(1)}s</span>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-1">
        <button 
          onClick={handleDownload}
          title="Download WAV"
          className="p-2 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-colors"
        >
          <Download size={16} />
        </button>
        <button 
          onClick={() => onDelete(item.id)}
          title="Delete"
          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

export default HistoryItem;