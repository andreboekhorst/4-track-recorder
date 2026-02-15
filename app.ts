/** Tweak these values and refresh to compare quality / file-size trade-offs. */
const CONFIG = {
  sampleRate: 48000,   // 44100 | 48000
  bitDepth: 16,        // 8 | 16 | 32 (affects future export size)
  maxSeconds: 180,     // max recording length per track
  tracks: 4,           // number of tracks
  trim: {
    default: -1,       // initial slider position. -1 (LINE/clean) to 1 (MIC/driven).
    gainMin: 1.4,      // gain at LINE (-1). Min 0.1, max ~3.0. Lower = quieter clean signal. Higher = louder clean signal.
    gainRange: 1.6,    // extra gain at MIC (+1). Min 0, max ~8.0. Higher = more drive into saturation. Lower = subtler.
    curveBase: 0.8,      // waveshaper k at LINE. Min 0.5, max ~5. Higher = saturation even at LINE. Lower = cleaner.
    curveRange: 12,    // extra k at MIC. Min 5, max ~50. Higher = harder saturation at MIC. Lower = gentler.
  },
};

/** How often we update the time display and check for playback end (UI only; audio is sample-accurate). */
const PLAYBACK_TICK_MS = 50;

const timeEl = document.getElementById("time") as HTMLDivElement;
const recordBtn = document.getElementById("record") as HTMLButtonElement;
const stopBtn = document.getElementById("stop") as HTMLButtonElement;
const playBtn = document.getElementById("play") as HTMLButtonElement;
const pauseBtn = document.getElementById("pause") as HTMLButtonElement;
const rewindBtn = document.getElementById("rewind") as HTMLButtonElement;
const trackSelect = document.getElementById("track-select") as HTMLSelectElement;
const latencyEl = document.getElementById("latency") as HTMLDivElement | null;
const audioElements: HTMLAudioElement[] = [
  document.getElementById("audio-1") as HTMLAudioElement,
  document.getElementById("audio-2") as HTMLAudioElement,
  document.getElementById("audio-3") as HTMLAudioElement,
  document.getElementById("audio-4") as HTMLAudioElement,
];

let audioContext: AudioContext | null = null;
/** Worklet-based recording (low latency); when null, not recording. */
let recorderWorkletNode: AudioWorkletNode | null = null;
let recorderSourceNode: MediaStreamAudioSourceNode | null = null;
/** PCM chunks from worklet; merged into AudioBuffer on stop. */
let recordedChunks: Float32Array[] = [];
/** Track index and latency for the current worklet recording (for stop). */
let recordingTrackIndex: number | null = null;
let recordingLatencySeconds = 0;
/** Playback position (in seconds) where the current punch-in recording starts. */
let punchInOffset = 0;
let timerId: number | null = null;
let playbackTickId: number | null = null;
let seconds = 0;
const tracks: (string | null)[] = [null, null, null, null];
/** Decoded buffers for sample-accurate playback; same index as tracks. */
const buffers: (AudioBuffer | null)[] = [null, null, null, null];
/** Per-track trim: skip this many seconds at start of buffer (latency compensation). */
const trimStart: number[] = [0, 0, 0, 0];
/** Persistent per-track gain nodes for volume control. */
const gainNodes: GainNode[] = [];
/** Persistent per-track panner nodes for stereo panning. */
const panNodes: StereoPannerNode[] = [];
/** Master gain node for global volume control. */
let masterGain: GainNode | null = null;
/** Input processing chain nodes (global, not per-track). Created on record, torn down on stop. */
let inputGainNode: GainNode | null = null;
let trimGainNode: GainNode | null = null;
let waveShaperNode: WaveShaperNode | null = null;
/** Recording volume node – sits after the waveshaper; baked into the track. */
let recVolNode: GainNode | null = null;

/** Playback state when using Web Audio (so we can pause/resume and know if we're playing). */
let playbackStartTime = 0;
let playbackOffset = 0;
let activePlaybackSources: AudioBufferSourceNode[] = [];
let monitoringSources: AudioBufferSourceNode[] = [];

/** Interactive hint + 48k for <20ms round-trip; critical for monitoring + recording. */
function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext({
      latencyHint: "interactive",
      sampleRate: CONFIG.sampleRate,
    });
  }
  ensureChannelStrips();
  return audioContext;
}

/** Create persistent GainNode + StereoPannerNode per track (idempotent). */
function ensureChannelStrips(): void {
  if (gainNodes.length > 0) return;
  const ctx = audioContext!;
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.5;
  masterGain.connect(ctx.destination);
  for (let i = 0; i < CONFIG.tracks; i++) {
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;
    gain.connect(pan);
    pan.connect(masterGain);
    gainNodes.push(gain);
    panNodes.push(pan);
  }
}

/** Generate a saturation curve that crossfades from linear (intensity=0) to tanh (intensity=1). */
function makeSaturationCurve(intensity: number): Float32Array {
  const n = 8192;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = CONFIG.trim.curveBase + intensity * CONFIG.trim.curveRange;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1; // map to -1..+1
    curve[i] = x + (Math.tanh(k * x) - x) * intensity; // linear at 0, tanh at 1
  }
  return curve;
}

/** Apply current trim slider value to the input processing chain. */
function applyTrim(sliderValue: number): void {
  const norm = (sliderValue + 1) / 2; // -1..+1 → 0..1
  if (trimGainNode) {
    trimGainNode.gain.value = CONFIG.trim.gainMin + norm * CONFIG.trim.gainRange;
  }
  if (waveShaperNode) {
    waveShaperNode.curve = makeSaturationCurve(norm) as Float32Array<ArrayBuffer>;
  }
}

function setTime(s: number) {
  seconds = s;
  timeEl.textContent = `${s}s`;
}

function clearTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function clearPlaybackTick() {
  if (playbackTickId !== null) {
    clearInterval(playbackTickId);
    playbackTickId = null;
  }
}

function getMaxDuration(): number {
  let max = 0;
  for (const buf of buffers) {
    if (buf && Number.isFinite(buf.duration) && buf.duration > max) max = buf.duration;
  }
  return max;
}

function isPlaying(): boolean {
  return activePlaybackSources.length > 0;
}

function updatePlayButtonState() {
  const hasContent = getMaxDuration() > 0;
  playBtn.disabled = !hasContent || isPlaying();
  rewindBtn.disabled = !hasContent || (!isPlaying() && seconds === 0);
}

function stopAllPlaybackSources(sources: AudioBufferSourceNode[]) {
  const ctx = audioContext;
  if (!ctx) return;
  const when = ctx.currentTime;
  for (const src of sources) {
    try {
      src.stop(when);
    } catch {
      /* already stopped */
    }
  }
  sources.length = 0;
}

function rewindAll() {
  stopAllPlaybackSources(activePlaybackSources);
  playbackStartTime = 0;
  playbackOffset = 0;
  setTime(0);
  clearPlaybackTick();
  pauseBtn.disabled = true;
  updatePlayButtonState();
}

/** Decode a blob into an AudioBuffer and cache it at the given track index. */
function decodeAndCacheTrack(blob: Blob, trackIndex: number): void {
  const ctx = getAudioContext();
  blob.arrayBuffer().then((ab) => ctx.decodeAudioData(ab)).then((buf) => {
    buffers[trackIndex] = buf;
    updatePlayButtonState();
  }).catch((err) => console.error("Decode failed:", err));
}

/** Build AudioBuffer from PCM chunks and cache at track index; applies trim (latency comp). */
function buildBufferFromPCM(
  ctx: AudioContext,
  chunks: Float32Array[],
  trimSamples: number,
  trackIndex: number
): void {
  const totalSamples = chunks.reduce((sum, c) => sum + c.length, 0);
  const length = Math.max(0, totalSamples - trimSamples);
  if (length === 0) return;
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const channel = buf.getChannelData(0);
  let offset = 0;
  let skip = trimSamples;
  for (const c of chunks) {
    if (skip > 0) {
      const take = Math.min(c.length, skip);
      skip -= take;
      if (skip === 0 && take < c.length) {
        channel.set(c.subarray(take), offset);
        offset += c.length - take;
      }
    } else {
      channel.set(c, offset);
      offset += c.length;
    }
  }
  buffers[trackIndex] = buf;
  updatePlayButtonState();
}

/**
 * Merge new PCM recording into an existing track buffer at the punch-in point.
 * Result: [original before punchIn] [new recording] [original after punchIn+newLen]
 */
function mergeRecordingIntoBuffer(
  ctx: AudioContext,
  chunks: Float32Array[],
  trimSamples: number,
  trackIndex: number,
  punchInSeconds: number,
  latencySeconds: number,
): void {
  // 1. Flatten new PCM chunks with latency trim (same logic as buildBufferFromPCM)
  const totalRawSamples = chunks.reduce((sum, c) => sum + c.length, 0);
  const newLength = Math.max(0, totalRawSamples - trimSamples);
  if (newLength === 0) return;

  const newPCM = new Float32Array(newLength);
  let writeOffset = 0;
  let skip = trimSamples;
  for (const c of chunks) {
    if (skip > 0) {
      const take = Math.min(c.length, skip);
      skip -= take;
      if (skip === 0 && take < c.length) {
        newPCM.set(c.subarray(take), writeOffset);
        writeOffset += c.length - take;
      }
    } else {
      newPCM.set(c, writeOffset);
      writeOffset += c.length;
    }
  }

  // 2. Determine punch-in sample position in the buffer
  const existingBuffer = buffers[trackIndex];
  const existingTrim = trimStart[trackIndex] ?? 0;
  const punchInSample = Math.max(
    0,
    Math.round((punchInSeconds + (existingBuffer ? existingTrim : latencySeconds)) * ctx.sampleRate)
  );

  // 3. Create result buffer
  const existingLength = existingBuffer ? existingBuffer.length : 0;
  const resultLength = Math.max(existingLength, punchInSample + newLength);
  const resultBuffer = ctx.createBuffer(1, resultLength, ctx.sampleRate);
  const resultChannel = resultBuffer.getChannelData(0);

  if (existingBuffer) {
    const existingData = existingBuffer.getChannelData(0);
    // Region A: original audio before punch-in
    const regionAEnd = Math.min(punchInSample, existingLength);
    if (regionAEnd > 0) {
      resultChannel.set(existingData.subarray(0, regionAEnd));
    }
    // Region B: new recording
    resultChannel.set(newPCM, punchInSample);
    // Region C: original audio after new recording
    const regionCStart = punchInSample + newLength;
    if (regionCStart < existingLength) {
      resultChannel.set(existingData.subarray(regionCStart), regionCStart);
    }
  } else {
    // Empty track: silence before punch-in (zero-initialized), then new recording
    resultChannel.set(newPCM, punchInSample);
  }

  buffers[trackIndex] = resultBuffer;
  updatePlayButtonState();
}

/** Convert Float32 PCM [-1,1] to the target bit depth for export. */
function quantizePCM(float32: Float32Array, bitDepth: number): ArrayBuffer {
  if (bitDepth === 32) {
    const out = new Float32Array(float32.length);
    out.set(float32);
    return out.buffer as ArrayBuffer;
  }
  if (bitDepth === 16) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out.buffer;
  }
  // 8-bit unsigned, center at 128
  const out = new Uint8Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = Math.round((s + 1) * 0.5 * 255);
  }
  return out.buffer;
}

/** Convert quantized PCM data back to Float32 [-1,1] for AudioBuffer. */
function dequantizePCM(data: ArrayBuffer, bitDepth: number): Float32Array {
  if (bitDepth === 32) return new Float32Array(data);
  if (bitDepth === 16) {
    const int16 = new Int16Array(data);
    const out = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      out[i] = int16[i] < 0 ? int16[i] / 0x8000 : int16[i] / 0x7FFF;
    }
    return out;
  }
  // 8-bit unsigned, center at 128
  const uint8 = new Uint8Array(data);
  const out = new Float32Array(uint8.length);
  for (let i = 0; i < uint8.length; i++) {
    out[i] = (uint8[i] / 255) * 2 - 1;
  }
  return out;
}

/** Export all tracks + mixer settings as a downloadable .4trk file. */
function exportProject(): void {
  const trackMeta: { samples: number; volume: number; pan: number; trimStart: number }[] = [];
  const pcmParts: ArrayBuffer[] = [];

  for (let i = 0; i < CONFIG.tracks; i++) {
    const buf = buffers[i];
    if (buf) {
      const float32 = buf.getChannelData(0);
      const quantized = quantizePCM(float32, CONFIG.bitDepth);
      pcmParts.push(quantized);
      trackMeta.push({
        samples: float32.length,
        volume: gainNodes[i]?.gain.value ?? 0.5,
        pan: panNodes[i]?.pan.value ?? 0,
        trimStart: trimStart[i] ?? 0,
      });
    } else {
      pcmParts.push(new ArrayBuffer(0));
      trackMeta.push({
        samples: 0,
        volume: gainNodes[i]?.gain.value ?? 0.5,
        pan: panNodes[i]?.pan.value ?? 0,
        trimStart: trimStart[i] ?? 0,
      });
    }
  }

  const metadata = JSON.stringify({
    sampleRate: CONFIG.sampleRate,
    bitDepth: CONFIG.bitDepth,
    masterVolume: masterGain?.gain.value ?? 0.5,
    tracks: trackMeta,
  });

  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(metadata);
  const metaLength = new Uint32Array([metaBytes.length]);

  const blob = new Blob([metaLength, metaBytes, ...pcmParts], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "recording.4trk";
  a.click();
  URL.revokeObjectURL(url);
}

/** Load a .4trk file and restore all tracks + mixer settings. */
async function importProject(file: File): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();
  const view = new DataView(arrayBuffer);

  // Read metadata
  const metaLength = view.getUint32(0, true);
  const metaBytes = new Uint8Array(arrayBuffer, 4, metaLength);
  const metadata = JSON.parse(new TextDecoder().decode(metaBytes));

  const ctx = getAudioContext();
  const bytesPerSample = metadata.bitDepth / 8;
  let offset = 4 + metaLength;

  // Restore each track
  for (let i = 0; i < metadata.tracks.length && i < CONFIG.tracks; i++) {
    const t = metadata.tracks[i];
    if (t.samples > 0) {
      const byteLen = t.samples * bytesPerSample;
      const pcmSlice = arrayBuffer.slice(offset, offset + byteLen);
      offset += byteLen;
      const float32 = dequantizePCM(pcmSlice, metadata.bitDepth);
      const audioBuf = ctx.createBuffer(1, float32.length, metadata.sampleRate);
      audioBuf.getChannelData(0).set(float32);
      buffers[i] = audioBuf;
    } else {
      buffers[i] = null;
    }

    // Restore mixer settings
    trimStart[i] = t.trimStart ?? 0;
    ensureChannelStrips();
    gainNodes[i].gain.value = t.volume ?? 0.5;
    panNodes[i].pan.value = t.pan ?? 0;

    // Update UI sliders
    const volSlider = document.getElementById(`vol-${i}`) as HTMLInputElement | null;
    const panSlider = document.getElementById(`pan-${i}`) as HTMLInputElement | null;
    if (volSlider) volSlider.value = String(t.volume ?? 0.5);
    if (panSlider) panSlider.value = String(t.pan ?? 0);
  }

  // Restore master volume
  ensureChannelStrips();
  if (masterGain) masterGain.gain.value = metadata.masterVolume ?? 0.5;
  const masterSlider = document.getElementById("master-vol") as HTMLInputElement | null;
  if (masterSlider) masterSlider.value = String(metadata.masterVolume ?? 0.5);

  rewindAll();
  updatePlayButtonState();
}

/**
 * Start playback of all tracks that have buffers, at a single scheduled time
 * so they are sample-accurate (no latency between tracks).
 * If offsetSeconds > 0, each buffer starts from that offset (for resume after pause).
 */
function startWebAudioPlayback(offsetSeconds: number): void {
  const ctx = getAudioContext();
  ctx.resume();
  const startTime = ctx.currentTime + 0.02; // small lookahead to avoid glitches
  const maxDuration = getMaxDuration();
  if (maxDuration <= 0) return;
  const effectiveDuration = maxDuration - offsetSeconds;

  activePlaybackSources = [];
  for (let i = 0; i < buffers.length; i++) {
    const buf = buffers[i];
    if (!buf) continue;
    const trim = trimStart[i] ?? 0;
    const startOffset = offsetSeconds + trim;
    if (startOffset >= buf.duration) continue;
    const playDuration = Math.min(buf.duration - startOffset, effectiveDuration);
    if (playDuration <= 0) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gainNodes[i]);
    src.start(startTime, startOffset, startTime + playDuration);
    activePlaybackSources.push(src);
  }
  playbackStartTime = startTime;
  playbackOffset = offsetSeconds;
  setTime(Math.floor(offsetSeconds));
  playBtn.disabled = true;
  pauseBtn.disabled = false;
  rewindBtn.disabled = false;

  playbackTickId = window.setInterval(() => {
    const elapsed = ctx.currentTime - playbackStartTime;
    setTime(Math.floor(playbackOffset + elapsed));
    if (elapsed >= effectiveDuration) {
      rewindAll();
    }
  }, PLAYBACK_TICK_MS);
}

/** Play all tracks except excludeIndex at the same time (for monitoring during overdub).
 *  offsetSeconds: where in the timeline to start (for punch-in). */
function playOtherTracksForMonitoring(excludeIndex: number, offsetSeconds: number = 0): void {
  const ctx = getAudioContext();
  ctx.resume();
  const startTime = ctx.currentTime + 0.02;
  monitoringSources = [];
  for (let i = 0; i < buffers.length; i++) {
    if (i === excludeIndex) continue;
    const buf = buffers[i];
    if (!buf) continue;
    const trim = trimStart[i] ?? 0;
    const startOffset = offsetSeconds + trim;
    if (startOffset >= buf.duration) continue;
    const playDuration = buf.duration - startOffset;
    if (playDuration <= 0) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gainNodes[i]);
    src.start(startTime, startOffset, playDuration);
    monitoringSources.push(src);
  }
}

function stopAllPlayback() {
  stopAllPlaybackSources(activePlaybackSources);
  stopAllPlaybackSources(monitoringSources);
  clearPlaybackTick();
  playbackStartTime = 0;
  playbackOffset = 0;
}

trackSelect.addEventListener("change", () => {});

/** Microphone constraints: disable voice optimizations and ask for minimal latency. */
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  sampleRate: { ideal: CONFIG.sampleRate },
  // Chrome: request low capture latency (seconds). Ignored where not supported.
  latency: { ideal: 0 },
} as MediaTrackConstraints;

/** Higher bitrate for music; default is often tuned for voice. */
const RECORDING_BITRATE = 192000;

/** Estimate recording start latency (input + optional output for alignment). Returns seconds. */
function measureRecordLatency(stream: MediaStream): number {
  let inputLatency = 0;
  const audioTrack = stream.getAudioTracks()[0];
  if (audioTrack) {
    const s = audioTrack.getSettings() as MediaTrackSettings & { latency?: number };
    if (typeof s.latency === "number" && s.latency > 0) inputLatency = s.latency;
  }
  let outputLatency = 0;
  const ctx = audioContext;
  if (ctx && typeof (ctx as AudioContext & { outputLatency?: number }).outputLatency === "number") {
    outputLatency = (ctx as AudioContext & { outputLatency: number }).outputLatency;
  } else if (ctx && typeof ctx.baseLatency === "number") {
    outputLatency = ctx.baseLatency;
  }
  const total = inputLatency + outputLatency;
  return total > 0 ? Math.min(total, 0.2) : 0.03;
}

recordBtn.addEventListener("click", async () => {
  try {
    const selectedTrackIndex = Number(trackSelect.value) as 0 | 1 | 2 | 3;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
    const ctx = getAudioContext();
    await ctx.resume();
    const recordLatencySeconds = measureRecordLatency(stream);
    updateLatencyDisplay(recordLatencySeconds);

    const workletUrl = new URL("recorder-worklet.js", document.baseURI || window.location.href).href;
    await ctx.audioWorklet.addModule(workletUrl);
    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, "recorder");

    // Input processing chain: source → inputGain → trimGain → waveShaper → worklet
    inputGainNode = ctx.createGain();
    inputGainNode.gain.value = 1.0;
    trimGainNode = ctx.createGain();
    waveShaperNode = ctx.createWaveShaper();
    waveShaperNode.oversample = "4x";

    recVolNode = ctx.createGain();
    const recVolSlider = document.getElementById("rec-vol") as HTMLInputElement | null;
    recVolNode.gain.value = parseFloat(recVolSlider?.value ?? "0.75");

    const trimSlider = document.getElementById("trim") as HTMLInputElement | null;
    applyTrim(parseFloat(trimSlider?.value ?? "0"));

    source.connect(inputGainNode);
    inputGainNode.connect(trimGainNode);
    trimGainNode.connect(waveShaperNode);
    waveShaperNode.connect(recVolNode);
    recVolNode.connect(worklet);
    worklet.connect(ctx.destination); // pass-through = low-latency monitoring

    recordedChunks = [];
    worklet.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "pcm" && e.data.data) recordedChunks.push(e.data.data);
    };

    recorderSourceNode = source;
    recorderWorkletNode = worklet;
    recordingTrackIndex = selectedTrackIndex;
    recordingLatencySeconds = recordLatencySeconds;
    punchInOffset = playbackOffset;

    setTime(Math.floor(punchInOffset));
    playOtherTracksForMonitoring(selectedTrackIndex, punchInOffset);
    timerId = window.setInterval(() => {
      const next = seconds + 1;
      if (next >= CONFIG.maxSeconds) {
        stopBtn.click();
        return;
      }
      setTime(next);
    }, 1000);

    recordBtn.disabled = true;
    stopBtn.disabled = false;
    rewindBtn.disabled = true;
  } catch (err) {
    console.error(err);
    recordBtn.disabled = false;
  }
});

/** Called when stopping a worklet-based recording. */
function stopWorkletRecording(): void {
  const selectedTrackIndex = recordingTrackIndex ?? 0;
  const recordLatencySeconds = recordingLatencySeconds;
  recordingTrackIndex = null;

  const ctx = audioContext;
  const worklet = recorderWorkletNode;
  const source = recorderSourceNode;
  recorderWorkletNode = null;
  recorderSourceNode = null;

  // Tear down input processing chain
  inputGainNode?.disconnect();
  trimGainNode?.disconnect();
  waveShaperNode?.disconnect();
  recVolNode?.disconnect();
  inputGainNode = null;
  trimGainNode = null;
  waveShaperNode = null;
  recVolNode = null;

  // Stop old worklet from receiving input and from posting into recordedChunks
  if (source) source.disconnect();
  if (worklet) worklet.port.onmessage = null;
  worklet?.disconnect();
  if (source?.mediaStream) source.mediaStream.getTracks().forEach((t) => t.stop());

  stopAllPlayback();
  clearTimer();

  const trimSamples = Math.max(
    0,
    Math.round((ctx?.sampleRate ?? CONFIG.sampleRate) * recordLatencySeconds)
  );

  if (recordedChunks.length && ctx) {
    const hadExistingBuffer = buffers[selectedTrackIndex] !== null;
    mergeRecordingIntoBuffer(
      ctx, recordedChunks, trimSamples, selectedTrackIndex,
      punchInOffset, recordLatencySeconds,
    );
    if (!hadExistingBuffer) {
      trimStart[selectedTrackIndex] = recordLatencySeconds;
    }
    if (latencyEl)
      latencyEl.textContent = `Latency: ~${Math.round(recordLatencySeconds * 1000)} ms (compensated)`;
  }
  recordedChunks = [];
  recordBtn.disabled = false;
  stopBtn.disabled = true;
  updatePlayButtonState();
}

function updateLatencyDisplay(recordLatencySeconds: number): void {
  if (!latencyEl) return;
  const ctx = audioContext;
  const baseMs = ctx && typeof ctx.baseLatency === "number" ? ctx.baseLatency * 1000 : 0;
  const outMs =
    ctx && typeof (ctx as AudioContext & { outputLatency?: number }).outputLatency === "number"
      ? (ctx as AudioContext & { outputLatency: number }).outputLatency * 1000
      : 0;
  const totalMs = Math.round(recordLatencySeconds * 1000);
  latencyEl.textContent = `Target <20ms • Round-trip ~${totalMs} ms (base ${Math.round(baseMs)} ms, out ${Math.round(outMs)} ms)`;
}

playBtn.addEventListener("click", () => {
  const maxDuration = getMaxDuration();
  if (maxDuration <= 0) return;
  startWebAudioPlayback(playbackOffset);
});

pauseBtn.addEventListener("click", () => {
  const ctx = audioContext;
  if (ctx && activePlaybackSources.length > 0) {
    playbackOffset = Math.min(playbackOffset + (ctx.currentTime - playbackStartTime), getMaxDuration());
    stopAllPlaybackSources(activePlaybackSources);
  }
  clearPlaybackTick();
  setTime(Math.floor(playbackOffset));
  playBtn.disabled = false;
  pauseBtn.disabled = true;
  updatePlayButtonState();
});

rewindBtn.addEventListener("click", () => {
  rewindAll();
});

stopBtn.addEventListener("click", () => {
  if (recorderWorkletNode) {
    stopWorkletRecording();
  } else {
    rewindAll();
  }
});

/** Wire up mixer slider event listeners for volume and pan controls. */
(function initMixerControls(): void {
  for (let i = 0; i < CONFIG.tracks; i++) {
    const volSlider = document.getElementById(`vol-${i}`) as HTMLInputElement | null;
    const panSlider = document.getElementById(`pan-${i}`) as HTMLInputElement | null;
    volSlider?.addEventListener("input", () => {
      ensureChannelStrips();
      gainNodes[i].gain.value = parseFloat(volSlider.value);
    });
    panSlider?.addEventListener("input", () => {
      ensureChannelStrips();
      panNodes[i].pan.value = parseFloat(panSlider.value);
    });
  }
  const masterSlider = document.getElementById("master-vol") as HTMLInputElement | null;
  masterSlider?.addEventListener("input", () => {
    ensureChannelStrips();
    masterGain!.gain.value = parseFloat(masterSlider.value);
  });
  const trimSlider = document.getElementById("trim") as HTMLInputElement | null;
  if (trimSlider) trimSlider.value = String(CONFIG.trim.default);
  trimSlider?.addEventListener("input", () => {
    applyTrim(parseFloat(trimSlider.value));
  });
  const recVolSlider = document.getElementById("rec-vol") as HTMLInputElement | null;
  recVolSlider?.addEventListener("input", () => {
    if (recVolNode) recVolNode.gain.value = parseFloat(recVolSlider.value);
  });
})();

updatePlayButtonState();

// Save / Load project file
const saveBtn = document.getElementById("save-project") as HTMLButtonElement | null;
const loadBtn = document.getElementById("load-project") as HTMLButtonElement | null;
const fileInput = document.getElementById("file-input") as HTMLInputElement | null;
saveBtn?.addEventListener("click", () => exportProject());
loadBtn?.addEventListener("click", () => fileInput?.click());
fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) {
    importProject(file).catch((err) => console.error("Import failed:", err));
    fileInput.value = ""; // allow re-selecting same file
  }
});

// Log estimated file size based on CONFIG so you can compare trade-offs.
{
  const bytesPerSample = CONFIG.bitDepth / 8;
  const totalBytes = CONFIG.tracks * CONFIG.maxSeconds * CONFIG.sampleRate * bytesPerSample;
  const mb = (totalBytes / (1024 * 1024)).toFixed(2);
  console.log(
    `[4track] Estimated max file size: ${CONFIG.tracks} tracks × ${CONFIG.maxSeconds}s × ${CONFIG.sampleRate} Hz × ${bytesPerSample} bytes = ${mb} MB`
  );
}
