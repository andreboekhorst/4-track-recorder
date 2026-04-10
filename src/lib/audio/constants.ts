// Default configuration and constraints for the audio engine.

import type { AudioEngineConfig } from "../types.js"
import workletUrl from "../assets/recorder-worklet.js?url"

export const PLAYBACK_TICK_MS = 32 // 30 fps

export const DEFAULT_CONFIG: AudioEngineConfig = {
  sampleRate: 32000, // 44100 | 48000 | 96000
  bitDepth: 16, // 8 = lo-fi, 16 = CD quality, 32 = float (uncompressed)
  maxSeconds: 180, // max recording length per track (seconds)
  trackCount: 4, // number of mixer tracks
  workletUrl,
  inputFx: [
    {
      type: "trim",
      enabled: true,
      default: -1, // initial slider position: -1 (clean) → 1 (full saturation)
      gainMin: 0.2, // gain at slider -1; lower = quieter clean tone (0.1–1.0)
      gainRange: 1, // extra gain added at slider +1; higher = louder boost (0.5–3.0)
      curveBase: 0.8, // waveshaper base curvature; lower = softer onset (0.1–2.0)
      curveRange: 8, // extra curvature at full trim; higher = more aggressive distortion (2–20)
    },
  ],
}

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  latency: { ideal: 0 },
} as MediaTrackConstraints
