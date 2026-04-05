// Binary project format (.4trk):
// [4 bytes meta length][JSON metadata][PCM track data...]
// Uses integer quantization from ./pcm.ts for compact storage.

import { Track } from './track.svelte.js';
import type { AudioEngineConfig, ProjectMetadata, TrackMeta } from '../types.js';
import { quantizePCM, dequantizePCM } from './pcm.js';

export async function exportProject(
  tracks: Track[],
  config: AudioEngineConfig,
  masterVolume: number,
): Promise<Blob> {
  const trackMeta: TrackMeta[] = [];
  const pcmParts: ArrayBuffer[] = [];

  for (const track of tracks) {
    if (track.buffer) {
      const float32 = track.buffer.getChannelData(0);
      const quantized = quantizePCM(float32, config.bitDepth);
      pcmParts.push(quantized);
      trackMeta.push({
        samples: float32.length,
        volume: track.volume,
        pan: track.pan,
        trimStart: track.trimStart,
        hidden: track.hidden || undefined,
      });
    } else {
      pcmParts.push(new ArrayBuffer(0));
      trackMeta.push({
        samples: 0,
        volume: track.volume,
        pan: track.pan,
        trimStart: track.trimStart,
        hidden: track.hidden || undefined,
      });
    }
  }

  const metadata: ProjectMetadata = {
    filetypeVersion: 1,
    sampleRate: config.sampleRate,
    bitDepth: config.bitDepth,
    masterVolume,
    tracks: trackMeta,
  };

  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(JSON.stringify(metadata));
  const metaLength = new Uint32Array([metaBytes.length]);

  const raw = new Blob([metaLength, metaBytes, ...pcmParts]);
  const compressed = raw.stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(compressed).blob();
}

export async function importProject(
  file: File | Blob,
  tracks: Track[],
  ensureContext: () => AudioContext,
): Promise<{ masterVolume: number }> {
  const decompressed = new Blob([file]).stream().pipeThrough(new DecompressionStream('gzip'));
  const arrayBuffer = await new Response(decompressed).arrayBuffer();
  const view = new DataView(arrayBuffer);

  const metaLength = view.getUint32(0, true);
  const metaBytes = new Uint8Array(arrayBuffer, 4, metaLength);
  const metadata: ProjectMetadata = JSON.parse(new TextDecoder().decode(metaBytes));

  const ctx = ensureContext();
  const bytesPerSample = metadata.bitDepth / 8;
  let offset = 4 + metaLength;

  for (let i = 0; i < metadata.tracks.length; i++) {
    const t = metadata.tracks[i];

    // Grow the tracks array if the file has more tracks than the engine
    while (i >= tracks.length) {
      tracks.push(new Track(t.hidden ?? false));
    }

    const track = tracks[i];
    track.hidden = t.hidden ?? false;

    if (t.samples > 0) {
      const byteLen = t.samples * bytesPerSample;
      const pcmSlice = arrayBuffer.slice(offset, offset + byteLen);
      offset += byteLen;
      const float32 = dequantizePCM(pcmSlice, metadata.bitDepth);
      const audioBuf = ctx.createBuffer(1, float32.length, metadata.sampleRate);
      audioBuf.getChannelData(0).set(float32);
      track.buffer = audioBuf;
      track.hasContent = true;
    } else {
      track.buffer = null;
      track.hasContent = false;
    }

    track.trimStart = t.trimStart ?? 0;
    track.volume = t.volume ?? 1.0;
    track.pan = t.pan ?? 0;

    if (track.gainNode) track.gainNode.gain.value = track.volume;
    if (track.panNode) track.panNode.pan.value = track.pan;
  }

  return { masterVolume: metadata.masterVolume ?? 1.0 };
}
