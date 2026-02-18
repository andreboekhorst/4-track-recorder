// Binary project format (.4trk):
// [4 bytes meta length][JSON metadata][PCM track data...]
// Uses integer quantization from ./pcm.ts for compact storage.

import type { Track } from './track.svelte.js';
import type { AudioEngineConfig, ProjectMetadata } from '../types.js';
import { quantizePCM, dequantizePCM } from './pcm.js';

export function exportProject(
  tracks: Track[],
  config: AudioEngineConfig,
  masterVolume: number,
): Blob {
  const trackMeta: { samples: number; volume: number; pan: number; trimStart: number }[] = [];
  const pcmParts: ArrayBuffer[] = [];

  for (let i = 0; i < config.trackCount; i++) {
    const track = tracks[i];
    if (track.buffer) {
      const float32 = track.buffer.getChannelData(0);
      const quantized = quantizePCM(float32, config.bitDepth);
      pcmParts.push(quantized);
      trackMeta.push({
        samples: float32.length,
        volume: track.volume,
        pan: track.pan,
        trimStart: track.trimStart,
      });
    } else {
      pcmParts.push(new ArrayBuffer(0));
      trackMeta.push({
        samples: 0,
        volume: track.volume,
        pan: track.pan,
        trimStart: track.trimStart,
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

  return new Blob([metaLength, metaBytes, ...pcmParts], { type: 'application/octet-stream' });
}

export async function importProject(
  file: File,
  tracks: Track[],
  config: AudioEngineConfig,
  ensureContext: () => AudioContext,
): Promise<{ masterVolume: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const view = new DataView(arrayBuffer);

  const metaLength = view.getUint32(0, true);
  const metaBytes = new Uint8Array(arrayBuffer, 4, metaLength);
  const metadata: ProjectMetadata = JSON.parse(new TextDecoder().decode(metaBytes));

  const ctx = ensureContext();
  const bytesPerSample = metadata.bitDepth / 8;
  let offset = 4 + metaLength;

  for (let i = 0; i < metadata.tracks.length && i < config.trackCount; i++) {
    const t = metadata.tracks[i];
    const track = tracks[i];

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
    track.volume = t.volume ?? 0.5;
    track.pan = t.pan ?? 0;

    if (track.gainNode) track.gainNode.gain.value = track.volume;
    if (track.panNode) track.panNode.pan.value = track.pan;
  }

  return { masterVolume: metadata.masterVolume ?? 0.5 };
}
