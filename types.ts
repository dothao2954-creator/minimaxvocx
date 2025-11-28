
export interface VoiceOption {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  style: string;
  description: string;
}

export interface GeneratedAudio {
  id: string;
  text: string;
  voiceId: string;
  voiceName: string;
  timestamp: number;
  audioBuffer: AudioBuffer | null;
  duration: number;
}

export interface SavedVoice {
  id: string;
  name: string;
  file: File;
  createdAt: number;
}

export enum TTSStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR'
}
