import type { AudioEngineConfig, PlayState, TrimFxConfig, ProjectMetadata } from './types.js';

const PLAYBACK_TICK_MS = 50;

const DEFAULT_CONFIG: AudioEngineConfig = {
  sampleRate: 48000,
  bitDepth: 16,
  maxSeconds: 180,
  trackCount: 4,
  workletUrl: 'recorder-worklet.js',
  inputFx: [
    {
      type: 'trim',
      enabled: true,
      default: -1,
      gainMin: 0.2,
      gainRange: 1,
      curveBase: 0.8,
      curveRange: 8,
    },
  ],
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  latency: { ideal: 0 },
} as MediaTrackConstraints;

// ─── Track ────────────────────────────────────────────────────────────────────

export class Track {
  volume = $state(0.5);
  pan = $state(0);
  level = $state(0);
  hasContent = $state(false);

  buffer: AudioBuffer | null = null;
  trimStart = 0;
  gainNode: GainNode | null = null;
  panNode: StereoPannerNode | null = null;
  analyserNode: AnalyserNode | null = null;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function makeSaturationCurve(intensity: number, curveBase: number, curveRange: number): Float32Array<ArrayBuffer> {
  const n = 8192;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = curveBase + intensity * curveRange;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = x + (Math.tanh(k * x) - x) * intensity;
  }
  return curve;
}

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
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out.buffer;
  }
  const out = new Uint8Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = Math.round((s + 1) * 0.5 * 255);
  }
  return out.buffer;
}

function dequantizePCM(data: ArrayBuffer, bitDepth: number): Float32Array {
  if (bitDepth === 32) return new Float32Array(data);
  if (bitDepth === 16) {
    const int16 = new Int16Array(data);
    const out = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      out[i] = int16[i] < 0 ? int16[i] / 0x8000 : int16[i] / 0x7fff;
    }
    return out;
  }
  const uint8 = new Uint8Array(data);
  const out = new Float32Array(uint8.length);
  for (let i = 0; i < uint8.length; i++) {
    out[i] = (uint8[i] / 255) * 2 - 1;
  }
  return out;
}

function measureRecordLatency(stream: MediaStream, ctx: AudioContext): number {
  let inputLatency = 0;
  const audioTrack = stream.getAudioTracks()[0];
  if (audioTrack) {
    const s = audioTrack.getSettings() as MediaTrackSettings & { latency?: number };
    if (typeof s.latency === 'number' && s.latency > 0) inputLatency = s.latency;
  }
  let outputLatency = 0;
  if (typeof (ctx as any).outputLatency === 'number') {
    outputLatency = (ctx as any).outputLatency;
  } else if (typeof ctx.baseLatency === 'number') {
    outputLatency = ctx.baseLatency;
  }
  const total = inputLatency + outputLatency;
  return total > 0 ? Math.min(total, 0.2) : 0.03;
}

// ─── AudioEngine ──────────────────────────────────────────────────────────────

export class AudioEngine {
  // --- Reactive state ---
  playState = $state<PlayState>('stopped');
  position = $state(0);
  masterVolume = $state(0.5);
  latencyInfo = $state('');
  trimValue = $state(-1);
  recordingVolume = $state(0.75);

  // --- Per-track state ---
  tracks: Track[];

  // --- Config ---
  private config: AudioEngineConfig;

  // --- Web Audio internals ---
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;

  // Playback
  private activePlaybackSources: AudioBufferSourceNode[] = [];
  private monitoringSources: AudioBufferSourceNode[] = [];
  private playbackStartTime = 0;
  private playbackOffset = 0;
  private playbackTickId: number | null = null;

  // Recording
  private recorderWorkletNode: AudioWorkletNode | null = null;
  private recorderSourceNode: MediaStreamAudioSourceNode | null = null;
  private recordedChunks: Float32Array[] = [];
  private recordingTrackIndex: number | null = null;
  private recordingLatencySeconds = 0;
  private punchInOffset = 0;
  private timerId: number | null = null;

  // Input FX chain (created per recording, torn down on stop)
  private inputGainNode: GainNode | null = null;
  private trimGainNode: GainNode | null = null;
  private waveShaperNode: WaveShaperNode | null = null;
  private recVolNode: GainNode | null = null;
  private inputFxNodes: AudioNode[] = [];

  // Metering
  private meterRafId: number | null = null;

  // ─── Constructor ──────────────────────────────────────────────────────

  constructor(config: Partial<AudioEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config.inputFx) this.config.inputFx = config.inputFx;

    const trimCfg = this.config.inputFx.find((fx) => fx.type === 'trim');
    if (trimCfg) this.trimValue = trimCfg.default;

    this.tracks = Array.from({ length: this.config.trackCount }, () => new Track());
  }

  // ─── Context / Channel Strips ─────────────────────────────────────────

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({
        latencyHint: 'interactive',
        sampleRate: this.config.sampleRate,
      });
    }
    this.ensureChannelStrips();
    return this.audioContext;
  }

  private ensureChannelStrips(): void {
    if (this.tracks[0]?.gainNode) return;
    const ctx = this.audioContext!;

    this.masterGainNode = ctx.createGain();
    this.masterGainNode.gain.value = this.masterVolume;
    this.masterGainNode.connect(ctx.destination);

    for (let i = 0; i < this.config.trackCount; i++) {
      const track = this.tracks[i];
      const gain = ctx.createGain();
      gain.gain.value = track.volume;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const pan = ctx.createStereoPanner();
      pan.pan.value = track.pan;

      gain.connect(analyser);
      analyser.connect(pan);
      pan.connect(this.masterGainNode);

      track.gainNode = gain;
      track.analyserNode = analyser;
      track.panNode = pan;
    }
  }

  // ─── Input FX Chain ───────────────────────────────────────────────────

  private buildInputFxChain(ctx: AudioContext): AudioNode[] {
    return this.config.inputFx
      .filter((fx) => fx.enabled)
      .flatMap((fx) => this.buildFxNodes(ctx, fx));
  }

  private buildFxNodes(ctx: AudioContext, cfg: TrimFxConfig): AudioNode[] {
    if (cfg.type === 'trim') {
      this.trimGainNode = ctx.createGain();
      this.waveShaperNode = ctx.createWaveShaper();
      this.waveShaperNode.oversample = '4x';
      this.applyTrimInternal(this.trimValue);
      return [this.trimGainNode, this.waveShaperNode];
    }
    return [];
  }

  private applyTrimInternal(sliderValue: number): void {
    const cfg = this.config.inputFx.find((fx) => fx.type === 'trim');
    if (!cfg) return;
    const norm = (sliderValue + 1) / 2;
    if (this.trimGainNode) {
      this.trimGainNode.gain.value = cfg.gainMin + norm * cfg.gainRange;
    }
    if (this.waveShaperNode) {
      this.waveShaperNode.curve = makeSaturationCurve(norm, cfg.curveBase, cfg.curveRange);
    }
  }

  // ─── Buffer helpers ───────────────────────────────────────────────────

  private buildBufferFromPCM(
    ctx: AudioContext,
    chunks: Float32Array[],
    trimSamples: number,
    trackIndex: number,
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
    const track = this.tracks[trackIndex];
    track.buffer = buf;
    track.hasContent = true;
  }

  private mergeRecordingIntoBuffer(
    ctx: AudioContext,
    chunks: Float32Array[],
    trimSamples: number,
    trackIndex: number,
    punchInSeconds: number,
  ): void {
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

    const track = this.tracks[trackIndex];
    const existingBuffer = track.buffer;
    const existingTrim = track.trimStart;
    const punchInSample = Math.max(
      0,
      Math.round((punchInSeconds + (existingBuffer ? existingTrim : 0)) * ctx.sampleRate),
    );

    const existingLength = existingBuffer ? existingBuffer.length : 0;
    const resultLength = Math.max(existingLength, punchInSample + newLength);
    const resultBuffer = ctx.createBuffer(1, resultLength, ctx.sampleRate);
    const resultChannel = resultBuffer.getChannelData(0);

    if (existingBuffer) {
      const existingData = existingBuffer.getChannelData(0);
      const regionAEnd = Math.min(punchInSample, existingLength);
      if (regionAEnd > 0) {
        resultChannel.set(existingData.subarray(0, regionAEnd));
      }
      resultChannel.set(newPCM, punchInSample);
      const regionCStart = punchInSample + newLength;
      if (regionCStart < existingLength) {
        resultChannel.set(existingData.subarray(regionCStart), regionCStart);
      }
    } else {
      resultChannel.set(newPCM, punchInSample);
    }

    track.buffer = resultBuffer;
    track.hasContent = true;
  }

  // ─── Playback ─────────────────────────────────────────────────────────

  private getMaxDuration(): number {
    let max = 0;
    for (const track of this.tracks) {
      if (track.buffer && Number.isFinite(track.buffer.duration) && track.buffer.duration > max) {
        max = track.buffer.duration;
      }
    }
    return max;
  }

  get hasContent(): boolean {
    return this.getMaxDuration() > 0;
  }

  play(): void {
    if (this.playState === 'playing' || this.playState === 'recording') return;
    const maxDuration = this.getMaxDuration();
    if (maxDuration <= 0) return;
    this.startPlayback(this.playbackOffset);
  }

  private startPlayback(offsetSeconds: number): void {
    const ctx = this.ensureContext();
    ctx.resume();
    const startTime = ctx.currentTime + 0.02;
    const maxDuration = this.getMaxDuration();
    if (maxDuration <= 0) return;
    const effectiveDuration = maxDuration - offsetSeconds;

    this.activePlaybackSources = [];
    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      const buf = track.buffer;
      if (!buf) continue;
      const trim = track.trimStart;
      const startOffset = offsetSeconds + trim;
      if (startOffset >= buf.duration) continue;
      const playDuration = Math.min(buf.duration - startOffset, effectiveDuration);
      if (playDuration <= 0) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(track.gainNode!);
      src.start(startTime, startOffset, playDuration);
      this.activePlaybackSources.push(src);
    }

    this.playbackStartTime = startTime;
    this.playbackOffset = offsetSeconds;
    this.position = Math.floor(offsetSeconds);
    this.playState = 'playing';

    this.startMeters();
    this.playbackTickId = window.setInterval(() => {
      const elapsed = ctx.currentTime - this.playbackStartTime;
      this.position = Math.floor(this.playbackOffset + elapsed);
      if (elapsed >= effectiveDuration) {
        this.rewind();
      }
    }, PLAYBACK_TICK_MS);
  }

  pause(): void {
    if (this.playState !== 'playing') return;
    const ctx = this.audioContext;
    if (ctx && this.activePlaybackSources.length > 0) {
      this.playbackOffset = Math.min(
        this.playbackOffset + (ctx.currentTime - this.playbackStartTime),
        this.getMaxDuration(),
      );
      this.stopSources(this.activePlaybackSources);
    }
    this.clearPlaybackTick();
    this.stopMeters();
    this.position = Math.floor(this.playbackOffset);
    this.playState = 'paused';
  }

  stop(): void {
    if (this.recorderWorkletNode) {
      this.stopRecording();
    } else {
      this.rewind();
    }
  }

  rewind(): void {
    this.stopSources(this.activePlaybackSources);
    this.playbackStartTime = 0;
    this.playbackOffset = 0;
    this.position = 0;
    this.clearPlaybackTick();
    this.stopMeters();
    this.playState = 'stopped';
  }

  private playOtherTracksForMonitoring(excludeIndex: number, offsetSeconds: number = 0): void {
    const ctx = this.ensureContext();
    ctx.resume();
    const startTime = ctx.currentTime + 0.02;
    this.monitoringSources = [];
    for (let i = 0; i < this.tracks.length; i++) {
      if (i === excludeIndex) continue;
      const track = this.tracks[i];
      const buf = track.buffer;
      if (!buf) continue;
      const trim = track.trimStart;
      const startOffset = offsetSeconds + trim;
      if (startOffset >= buf.duration) continue;
      const playDuration = buf.duration - startOffset;
      if (playDuration <= 0) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(track.gainNode!);
      src.start(startTime, startOffset, playDuration);
      this.monitoringSources.push(src);
    }
  }

  private stopSources(sources: AudioBufferSourceNode[]): void {
    const ctx = this.audioContext;
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

  private stopAllPlayback(): void {
    this.stopSources(this.activePlaybackSources);
    this.stopSources(this.monitoringSources);
    this.clearPlaybackTick();
    this.playbackStartTime = 0;
    this.playbackOffset = 0;
  }

  private clearPlaybackTick(): void {
    if (this.playbackTickId !== null) {
      clearInterval(this.playbackTickId);
      this.playbackTickId = null;
    }
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  // ─── Recording ────────────────────────────────────────────────────────

  async record(trackIndex: number): Promise<void> {
    if (this.playState === 'recording') return;
    if (trackIndex < 0 || trackIndex >= this.config.trackCount) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...AUDIO_CONSTRAINTS,
        sampleRate: { ideal: this.config.sampleRate },
      },
    });

    const ctx = this.ensureContext();
    await ctx.resume();

    const recordLatencySeconds = measureRecordLatency(stream, ctx);
    this.updateLatencyDisplay(recordLatencySeconds);

    await ctx.audioWorklet.addModule(this.config.workletUrl);
    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, 'recorder');

    // Input processing chain: source → inputGain → [fx nodes] → recVol → worklet
    this.inputGainNode = ctx.createGain();
    this.inputGainNode.gain.value = 1.0;

    this.recVolNode = ctx.createGain();
    this.recVolNode.gain.value = this.recordingVolume;

    this.inputFxNodes = this.buildInputFxChain(ctx);

    source.connect(this.inputGainNode);
    let prev: AudioNode = this.inputGainNode;
    for (const node of this.inputFxNodes) {
      prev.connect(node);
      prev = node;
    }
    prev.connect(this.recVolNode);
    this.recVolNode.connect(worklet);
    worklet.connect(ctx.destination);

    this.recordedChunks = [];
    worklet.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'pcm' && e.data.data) this.recordedChunks.push(e.data.data);
    };

    this.recorderSourceNode = source;
    this.recorderWorkletNode = worklet;
    this.recordingTrackIndex = trackIndex;
    this.recordingLatencySeconds = recordLatencySeconds;
    this.punchInOffset = this.playbackOffset;

    this.position = Math.floor(this.punchInOffset);
    this.playState = 'recording';

    this.playOtherTracksForMonitoring(trackIndex, this.punchInOffset);
    this.startMeters();

    this.timerId = window.setInterval(() => {
      const next = this.position + 1;
      if (next >= this.config.maxSeconds) {
        this.stop();
        return;
      }
      this.position = next;
    }, 1000);
  }

  private stopRecording(): void {
    const selectedTrackIndex = this.recordingTrackIndex ?? 0;
    const recordLatencySeconds = this.recordingLatencySeconds;
    this.recordingTrackIndex = null;

    const ctx = this.audioContext;
    const worklet = this.recorderWorkletNode;
    const source = this.recorderSourceNode;
    this.recorderWorkletNode = null;
    this.recorderSourceNode = null;

    // Tear down input processing chain
    this.inputGainNode?.disconnect();
    for (const node of this.inputFxNodes) node.disconnect();
    this.inputFxNodes = [];
    this.recVolNode?.disconnect();
    this.inputGainNode = null;
    this.trimGainNode = null;
    this.waveShaperNode = null;
    this.recVolNode = null;

    if (source) source.disconnect();
    if (worklet) worklet.port.onmessage = null;
    worklet?.disconnect();
    if (source?.mediaStream) source.mediaStream.getTracks().forEach((t) => t.stop());

    this.stopAllPlayback();
    this.clearTimer();
    this.stopMeters();

    const trimSamples = Math.max(
      0,
      Math.round((ctx?.sampleRate ?? this.config.sampleRate) * recordLatencySeconds),
    );

    if (this.recordedChunks.length && ctx) {
      const track = this.tracks[selectedTrackIndex];
      const hadExistingBuffer = track.buffer !== null;
      this.mergeRecordingIntoBuffer(
        ctx,
        this.recordedChunks,
        trimSamples,
        selectedTrackIndex,
        this.punchInOffset,
      );
      if (!hadExistingBuffer) {
        track.trimStart = recordLatencySeconds;
      }
      this.latencyInfo = `Latency: ~${Math.round(recordLatencySeconds * 1000)} ms (compensated)`;
    }

    this.recordedChunks = [];
    this.playState = 'stopped';
  }

  private updateLatencyDisplay(recordLatencySeconds: number): void {
    const ctx = this.audioContext;
    const baseMs = ctx && typeof ctx.baseLatency === 'number' ? ctx.baseLatency * 1000 : 0;
    const outMs =
      ctx && typeof (ctx as any).outputLatency === 'number'
        ? (ctx as any).outputLatency * 1000
        : 0;
    const totalMs = Math.round(recordLatencySeconds * 1000);
    this.latencyInfo = `Target <20ms \u2022 Round-trip ~${totalMs} ms (base ${Math.round(baseMs)} ms, out ${Math.round(outMs)} ms)`;
  }

  // ─── Mixer Controls ──────────────────────────────────────────────────

  setTrackVolume(index: number, value: number): void {
    const track = this.tracks[index];
    if (!track) return;
    track.volume = value;
    if (track.gainNode) track.gainNode.gain.value = value;
  }

  setTrackPan(index: number, value: number): void {
    const track = this.tracks[index];
    if (!track) return;
    track.pan = value;
    if (track.panNode) track.panNode.pan.value = value;
  }

  setMasterVolume(value: number): void {
    this.masterVolume = value;
    if (this.masterGainNode) this.masterGainNode.gain.value = value;
  }

  setTrim(value: number): void {
    this.trimValue = value;
    this.applyTrimInternal(value);
  }

  setRecordingVolume(value: number): void {
    this.recordingVolume = value;
    if (this.recVolNode) this.recVolNode.gain.value = value;
  }

  setInputGain(value: number): void {
    if (this.inputGainNode) this.inputGainNode.gain.value = value;
  }

  // ─── Metering ─────────────────────────────────────────────────────────

  private startMeters(): void {
    if (this.meterRafId !== null) return;
    this.meterRafId = requestAnimationFrame(() => this.updateMeters());
  }

  private stopMeters(): void {
    if (this.meterRafId !== null) {
      cancelAnimationFrame(this.meterRafId);
      this.meterRafId = null;
    }
    for (const track of this.tracks) {
      track.level = 0;
    }
  }

  private updateMeters(): void {
    const buf = new Float32Array(this.tracks[0]?.analyserNode?.fftSize ?? 256);
    for (const track of this.tracks) {
      if (!track.analyserNode) continue;
      track.analyserNode.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let j = 0; j < buf.length; j++) {
        const abs = Math.abs(buf[j]);
        if (abs > peak) peak = abs;
      }
      const master = this.masterGainNode?.gain.value ?? 1;
      track.level = Math.min(100, Math.round(peak * master * 100));
    }
    this.meterRafId = requestAnimationFrame(() => this.updateMeters());
  }

  // ─── Save / Load ─────────────────────────────────────────────────────

  exportProject(): Blob {
    const trackMeta: { samples: number; volume: number; pan: number; trimStart: number }[] = [];
    const pcmParts: ArrayBuffer[] = [];

    for (let i = 0; i < this.config.trackCount; i++) {
      const track = this.tracks[i];
      if (track.buffer) {
        const float32 = track.buffer.getChannelData(0);
        const quantized = quantizePCM(float32, this.config.bitDepth);
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
      sampleRate: this.config.sampleRate,
      bitDepth: this.config.bitDepth,
      masterVolume: this.masterVolume,
      tracks: trackMeta,
    };

    const encoder = new TextEncoder();
    const metaBytes = encoder.encode(JSON.stringify(metadata));
    const metaLength = new Uint32Array([metaBytes.length]);

    return new Blob([metaLength, metaBytes, ...pcmParts], { type: 'application/octet-stream' });
  }

  async importProject(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const view = new DataView(arrayBuffer);

    const metaLength = view.getUint32(0, true);
    const metaBytes = new Uint8Array(arrayBuffer, 4, metaLength);
    const metadata: ProjectMetadata = JSON.parse(new TextDecoder().decode(metaBytes));

    const ctx = this.ensureContext();
    const bytesPerSample = metadata.bitDepth / 8;
    let offset = 4 + metaLength;

    for (let i = 0; i < metadata.tracks.length && i < this.config.trackCount; i++) {
      const t = metadata.tracks[i];
      const track = this.tracks[i];

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

    this.setMasterVolume(metadata.masterVolume ?? 0.5);
    this.rewind();
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  dispose(): void {
    this.stopAllPlayback();
    this.clearTimer();
    this.stopMeters();

    if (this.recorderWorkletNode) {
      this.recorderWorkletNode.disconnect();
      this.recorderWorkletNode = null;
    }
    if (this.recorderSourceNode) {
      this.recorderSourceNode.mediaStream.getTracks().forEach((t) => t.stop());
      this.recorderSourceNode.disconnect();
      this.recorderSourceNode = null;
    }

    this.inputGainNode?.disconnect();
    this.trimGainNode = null;
    this.waveShaperNode = null;
    this.recVolNode?.disconnect();
    this.inputFxNodes = [];

    for (const track of this.tracks) {
      track.gainNode?.disconnect();
      track.analyserNode?.disconnect();
      track.panNode?.disconnect();
    }
    this.masterGainNode?.disconnect();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.playState = 'stopped';
    this.position = 0;
  }
}
