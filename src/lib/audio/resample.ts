// Sample-rate conversion helpers.
// The live AudioContext runs at the hardware's native rate; project files
// are stored at `config.sampleRate`. These bridge the two.

/** High-quality async resample via an OfflineAudioContext render pass. */
export async function resampleBuffer(
  buffer: AudioBuffer,
  targetRate: number,
): Promise<AudioBuffer> {
  if (!Number.isFinite(targetRate) || targetRate <= 0) return buffer;
  if (buffer.sampleRate === targetRate) return buffer;

  const length = Math.max(1, Math.ceil(buffer.duration * targetRate));
  const offline = new OfflineAudioContext(buffer.numberOfChannels, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

/**
 * Synchronous linear-interpolation resample. Lower quality than
 * `resampleBuffer`; used only as a fallback where an async render pass is
 * not possible (e.g. splicing into a buffer whose rate no longer matches
 * the context).
 */
export function resampleLinear(
  data: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate || data.length === 0) return data;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.round(data.length / ratio));
  const out = new Float32Array(outLength);
  const last = data.length - 1;
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.min(last, Math.floor(pos));
    const i1 = Math.min(last, i0 + 1);
    const frac = pos - i0;
    out[i] = data[i0] + (data[i1] - data[i0]) * frac;
  }
  return out;
}
