// Buffer construction and latency compensation for recordings.
// Handles latency trimming and punch-in/overdub merging.

import { MAX_COMPUTED_LATENCY_SECONDS } from './constants.js';
import { resampleLinear } from './resample.js';

export interface RecordingLatencyBreakdown {
  /** Mic capture pipeline latency (from `MediaStreamTrack.getSettings().latency`). */
  input: number;
  /** AudioContext processing latency (`baseLatency`). */
  base: number;
  /** Destination-to-hardware latency (`outputLatency`). */
  output: number;
  /** Sum of the above, clamped to a sane range. */
  total: number;
}

/**
 * Estimate the round trip between "what the player hears" and "where their
 * playing lands in the captured buffer": the backing track reaches the ears
 * `base + output` late, and the played note reaches the recorder worklet
 * `input` late. Every recorded sample is late by the sum.
 *
 * Browsers understate these values (WebKit especially), so this is a floor,
 * not an exact figure. Falls back to 30 ms if nothing is reported.
 */
export function measureRecordLatency(
  stream: MediaStream,
  ctx: AudioContext,
): RecordingLatencyBreakdown {
  let input = 0;
  const audioTrack = stream.getAudioTracks()[0];
  if (audioTrack) {
    const s = audioTrack.getSettings() as MediaTrackSettings & { latency?: number };
    if (typeof s.latency === 'number' && Number.isFinite(s.latency) && s.latency > 0) {
      input = s.latency;
    }
  }

  const base =
    typeof ctx.baseLatency === 'number' && Number.isFinite(ctx.baseLatency) && ctx.baseLatency > 0
      ? ctx.baseLatency
      : 0;

  const rawOutput = (ctx as AudioContext & { outputLatency?: number }).outputLatency;
  const output =
    typeof rawOutput === 'number' && Number.isFinite(rawOutput) && rawOutput > 0 ? rawOutput : 0;

  const sum = input + base + output;
  const total = sum > 0 ? Math.min(sum, MAX_COMPUTED_LATENCY_SECONDS) : 0.03;
  return { input, base, output, total };
}

/**
 * Pick the compensation to apply: an explicit override wins over the
 * computed default. Negative / non-finite values are clamped to 0.
 */
export function resolveRecordingLatency(
  computedSeconds: number,
  overrideSeconds: number | undefined,
): number {
  const chosen =
    typeof overrideSeconds === 'number' && Number.isFinite(overrideSeconds)
      ? overrideSeconds
      : computedSeconds;
  return Number.isFinite(chosen) && chosen > 0 ? chosen : 0;
}

// Concatenate PCM chunks into a single Float32Array, skipping
// the first `trimSamples` to compensate for round-trip latency.
// Never drops more samples than the chunks contain.
function trimAndConcat(chunks: Float32Array[], trimSamples: number): Float32Array | null {
  const totalSamples = chunks.reduce((sum, c) => sum + c.length, 0);
  const skipTotal = Math.min(totalSamples, Math.max(0, Math.round(trimSamples)));
  const length = totalSamples - skipTotal;
  if (length === 0) return null;

  const result = new Float32Array(length);
  let offset = 0;
  let skip = skipTotal;

  for (const c of chunks) {
    if (skip > 0) {
      const take = Math.min(c.length, skip);
      skip -= take;
      if (skip === 0 && take < c.length) {
        result.set(c.subarray(take), offset);
        offset += c.length - take;
      }
    } else {
      result.set(c, offset);
      offset += c.length;
    }
  }

  return result;
}

// Merge a new recording into a track's existing buffer at a punch-in point.
// Preserves audio before and after the recorded region (A-B-C splice).
// If no existing buffer, creates a fresh one at the punch-in offset.
// The recording chunks are at `ctx.sampleRate`; an existing buffer at a
// different rate is brought to the context rate first so sample indices line up.
export function mergeRecordingIntoBuffer(
  ctx: AudioContext,
  chunks: Float32Array[],
  trimSamples: number,
  existingBuffer: AudioBuffer | null,
  existingTrimStart: number,
  punchInSeconds: number,
): AudioBuffer | null {
  const newPCM = trimAndConcat(chunks, trimSamples);
  if (!newPCM) return null;

  const punchInSample = Math.max(
    0,
    Math.round((punchInSeconds + (existingBuffer ? existingTrimStart : 0)) * ctx.sampleRate),
  );

  let existingData: Float32Array | null = null;
  if (existingBuffer) {
    existingData = existingBuffer.getChannelData(0);
    if (existingBuffer.sampleRate !== ctx.sampleRate) {
      existingData = resampleLinear(existingData, existingBuffer.sampleRate, ctx.sampleRate);
    }
  }

  const existingLength = existingData ? existingData.length : 0;
  const resultLength = Math.max(existingLength, punchInSample + newPCM.length);
  const resultBuffer = ctx.createBuffer(1, resultLength, ctx.sampleRate);
  const resultChannel = resultBuffer.getChannelData(0);

  if (existingData) {
    // Region A: existing audio before the punch-in point
    const regionAEnd = Math.min(punchInSample, existingLength);
    if (regionAEnd > 0) {
      resultChannel.set(existingData.subarray(0, regionAEnd));
    }

    // Region B: the new recording
    resultChannel.set(newPCM, punchInSample);

    // Region C: existing audio after the new recording ends
    const regionCStart = punchInSample + newPCM.length;
    if (regionCStart < existingLength) {
      resultChannel.set(existingData.subarray(regionCStart), regionCStart);
    }
  } else {
    resultChannel.set(newPCM, punchInSample);
  }

  return resultBuffer;
}
