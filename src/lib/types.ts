export interface HiddenTrackConfig {
  url: string;
  volume: number;
  pan?: number;
}

/**
 * Supplies the microphone stream the engine records from, instead of the
 * engine calling `getUserMedia` itself. Receives the audio constraints the
 * engine would have used. May return a clone of a long-lived stream.
 */
export type CaptureStreamFactory = (
  constraints: MediaTrackConstraints,
) => MediaStream | Promise<MediaStream>;

export interface MonitoringDetail {
  /** The mic stream the engine is capturing from. */
  stream: MediaStream;
  /** Track being monitored/recorded, or -1 for master. */
  trackIndex: number;
  /** The live AudioContext (runs at the hardware's native sample rate). */
  context: AudioContext;
}

/**
 * Takes over the live mic-to-speakers pass-through. When set, the engine
 * mutes its own Web Audio monitoring path while recording capture, meters,
 * mixing, playback and export stay on the Web Audio graph.
 */
export interface MonitoringAdapter {
  start(detail: MonitoringDetail): void | Promise<void>;
  stop(): void | Promise<void>;
}

export interface AudioEngineConfig {
  /**
   * Storage/export sample rate in Hz. The live graph (playback, monitoring,
   * mic capture) always runs at the hardware's native rate for minimal
   * latency; recorded audio is resampled to this rate only when exporting a
   * `.4trk` file. Set to 0 to export at the native rate.
   */
  sampleRate: number;
  bitDepth: number;
  maxSeconds: number;
  trackCount: number;
  inputFx: TrimFxConfig[];
  workletUrl: string;
  hiddenTracks?: HiddenTrackConfig[];
  /** Extra `getUserMedia` audio constraints merged over the engine defaults. */
  audioConstraints?: MediaTrackConstraints;
  /** Supplies the mic stream instead of the engine calling `getUserMedia`. */
  captureStream?: CaptureStreamFactory;
  /**
   * Acquire the mic once and keep it warm for the session, handing each take
   * a clone. Avoids WebKit's level ramp / sample-rate switch at capture start.
   * The OS mic-in-use indicator stays on until `releaseCapture()`/`dispose()`.
   */
  persistentCapture?: boolean;
  /** Replaces the built-in live monitoring pass-through. */
  monitoringAdapter?: MonitoringAdapter;
  /**
   * Recording latency compensation in seconds. Overrides the value computed
   * from the AudioContext/mic latency properties when set. Values below 0
   * are treated as 0.
   */
  recordingLatencyOffset?: number;
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
