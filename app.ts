const MAX_SECONDS = 60;
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
let timerId: number | null = null;
let playbackTickId: number | null = null;
let seconds = 0;
const tracks: (string | null)[] = [null, null, null, null];
/** Decoded buffers for sample-accurate playback; same index as tracks. */
const buffers: (AudioBuffer | null)[] = [null, null, null, null];
/** Per-track trim: skip this many seconds at start of buffer (latency compensation). */
const trimStart: number[] = [0, 0, 0, 0];

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
      sampleRate: 48000,
    });
  }
  return audioContext;
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
    src.connect(ctx.destination);
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

/** Play all tracks except excludeIndex at the same time (for monitoring during overdub). */
function playOtherTracksForMonitoring(excludeIndex: number): void {
  const ctx = getAudioContext();
  ctx.resume();
  const startTime = ctx.currentTime + 0.02;
  monitoringSources = [];
  for (let i = 0; i < buffers.length; i++) {
    if (i === excludeIndex) continue;
    const buf = buffers[i];
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(startTime);
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
  sampleRate: { ideal: 48000 },
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
    source.connect(worklet);
    worklet.connect(ctx.destination); // pass-through = low-latency monitoring

    recordedChunks = [];
    worklet.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "pcm" && e.data.data) recordedChunks.push(e.data.data);
    };

    recorderSourceNode = source;
    recorderWorkletNode = worklet;
    recordingTrackIndex = selectedTrackIndex;
    recordingLatencySeconds = recordLatencySeconds;

    setTime(0);
    playOtherTracksForMonitoring(selectedTrackIndex);
    timerId = window.setInterval(() => {
      const next = seconds + 1;
      if (next >= MAX_SECONDS) {
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

  // Stop old worklet from receiving input and from posting into recordedChunks
  // (otherwise the next recording would get mixed with this worklet’s ongoing output)
  if (source && worklet) source.disconnect(worklet);
  if (worklet) worklet.port.onmessage = null;
  worklet?.disconnect();
  if (source?.mediaStream) source.mediaStream.getTracks().forEach((t) => t.stop());

  stopAllPlayback();
  clearTimer();

  const trimSamples = Math.max(
    0,
    Math.round((ctx?.sampleRate ?? 48000) * recordLatencySeconds)
  );

  if (recordedChunks.length && ctx) {
    trimStart[selectedTrackIndex] = recordLatencySeconds;
    buildBufferFromPCM(ctx, recordedChunks, trimSamples, selectedTrackIndex);
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

updatePlayButtonState();
