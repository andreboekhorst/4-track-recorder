// Peak metering: reads analyser nodes and updates track levels for the UI.

import type { Track } from './track.svelte.js';

export interface MeterOverride {
  track: Track;
  analyser: AnalyserNode;
}

// `override` lets one track be metered from a different analyser, e.g. the
// input tap used while an external monitoring adapter mutes the built-in
// pass-through (the track's own analyser would then read silence).
export function updateMeterLevels(
  tracks: Track[],
  masterGain: number,
  override?: MeterOverride,
): void {
  const buf = new Float32Array(tracks[0]?.analyserNode?.fftSize ?? 256);

  for (const track of tracks) {
    const analyser = override && override.track === track ? override.analyser : track.analyserNode;
    if (!analyser) continue;
    analyser.getFloatTimeDomainData(buf);

    let peak = 0;
    for (let j = 0; j < buf.length; j++) {
      const abs = Math.abs(buf[j]);
      if (abs > peak) peak = abs;
    }

    track.level = Math.min(100, Math.round(peak * masterGain * 100));
  }
}

export function resetMeterLevels(tracks: Track[]): void {
  for (const track of tracks) track.level = 0;
}
