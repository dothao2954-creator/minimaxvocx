
import React from 'react';
import { Loader2, Wand2, Sparkles } from 'lucide-react';

interface ProcessingItemProps {
  mode: 'standard' | 'clone';
}

const ProcessingItem: React.FC<ProcessingItemProps> = ({ mode }) => {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg mb-2 bg-zinc-900/40 border border-indigo-500/30 animate-pulse">
      <div className="flex items-center space-x-4 flex-1 overflow-hidden">
        {/* Loading Icon Circle */}
        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-indigo-500/10 text-indigo-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Status Text */}
          <p className="text-zinc-300 text-sm font-medium truncate flex items-center">
            {mode === 'clone' ? 'Cloning Voice & Synthesizing...' : 'Generating Speech...'}
          </p>
          
          {/* Sub-status badges */}
          <div className="flex items-center space-x-2 mt-1">
             <span className="flex items-center text-xs px-2 py-0.5 rounded-full border border-indigo-500/20 text-indigo-300 bg-indigo-500/5">
               {mode === 'clone' ? <Wand2 size={10} className="mr-1" /> : <Sparkles size={10} className="mr-1" />}
               Processing
             </span>
             <span className="text-xs text-zinc-500">Just now</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcessingItem;
