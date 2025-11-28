import React from 'react';
import { VOICES } from '../services/gemini';
import { VoiceOption } from '../types';
import { Mic, Check } from 'lucide-react';

interface VoiceSelectorProps {
  selectedVoiceId: string;
  onSelect: (voiceId: string) => void;
}

const VoiceSelector: React.FC<VoiceSelectorProps> = ({ selectedVoiceId, onSelect }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {VOICES.map((voice) => {
        const isSelected = selectedVoiceId === voice.id;
        return (
          <button
            key={voice.id}
            onClick={() => onSelect(voice.id)}
            className={`
              relative flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200
              ${isSelected 
                ? 'bg-indigo-600/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
                : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'}
            `}
          >
            <div className={`
              w-12 h-12 rounded-full flex items-center justify-center mb-3
              ${isSelected ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400'}
            `}>
              <Mic size={20} />
            </div>
            
            <span className="text-sm font-semibold text-zinc-100">{voice.name}</span>
            <span className="text-xs text-zinc-500 mt-1">{voice.gender} • {voice.style}</span>

            {isSelected && (
              <div className="absolute top-2 right-2 text-indigo-400">
                <Check size={14} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default VoiceSelector;
