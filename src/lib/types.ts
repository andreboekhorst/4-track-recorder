export interface AudioEngineConfig {
  sampleRate: number;
  bitDepth: number;
  maxSeconds: number;
  trackCount: number;
  inputFx: TrimFxConfig[];
  workletUrl: string;
}

export interface TrimFxConfig {
  type: 'trim';
  enabled: boolean;
  default: number;
  gainMin: number;
  gainRange: number;
  curveBase: number;
  curveRange: number;
}

export interface TrackMeta {
  samples: number;
  volume: number;
  pan: number;
  trimStart: number;
}

export interface ProjectMetadata {
  filetypeVersion?: number;
  sampleRate: number;
  bitDepth: number;
  masterVolume: number;
  tracks: TrackMeta[];
}

export type PlayState = 'stopped' | 'playing' | 'paused' | 'recording';
