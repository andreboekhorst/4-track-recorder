export interface HiddenTrackConfig {
  url: string;
  volume: number;
  pan?: number;
}

export interface AudioEngineConfig {
  sampleRate: number;
  bitDepth: number;
  maxSeconds: number;
  trackCount: number;
  inputFx: TrimFxConfig[];
  workletUrl: string;
  hiddenTracks?: HiddenTrackConfig[];
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
  hidden?: boolean;
}

export interface ProjectMetadata {
  filetypeVersion?: number;
  sampleRate: number;
  bitDepth: number;
  masterVolume: number;
  tracks: TrackMeta[];
  artist?: string;
  title?: string;
  comment?: string;
}

export interface ProjectMeta {
  artist: string;
  title: string;
  comment: string;
}

export type PlayState = 'stopped' | 'playing' | 'paused' | 'recording';

export type MicStatus = 'unsupported' | 'prompt' | 'denied' | 'no-device' | 'inactive' | 'active' | 'error';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
