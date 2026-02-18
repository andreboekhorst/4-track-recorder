// The audio engine: owns reactive state, the Web Audio context,
// and the transport state machine (play/pause/stop/record).
// Delegates DSP, metering, and I/O to focused submodules.

import type { AudioEngineConfig, PlayState, TrimFxConfig } from '../types.js';
import { Track } from './track.svelte.js';
import { DEFAULT_CONFIG, AUDIO_CONSTRAINTS, PLAYBACK_TICK_MS } from './constants.js';
import { buildInputFxChain, applyTrim } from './input-fx.js';
import { measureRecordLatency, mergeRecordingIntoBuffer } from './recording.js';
import { updateMeterLevels, resetMeterLevels } from './metering.js';
import { exportProject as _exportProject, importProject as _importProject } from './project-io.js';

export class AudioEngine {
  // ─── Reactive state (read by UI) ────────────────────────────────────

  playState = $state<PlayState>('stopped');
  position = $state(0);
  masterVolume = $state(0.5);
  latencyInfo = $state('');
  trimValue = $state(-1);
  recordingVolume = $state(0.75);

  tracks: Track[];

  // ─── Private state ──────────────────────────────────────────────────

  private config: AudioEngineConfig;

  // Web Audio graph
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

  // ─── Constructor ────────────────────────────────────────────────────

  constructor(config: Partial<AudioEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config.inputFx) this.config.inputFx = config.inputFx;

    const trimCfg = this.config.inputFx.find((fx) => fx.type === 'trim');
    if (trimCfg) this.trimValue = trimCfg.default;

    this.tracks = Array.from({ length: this.config.trackCount }, () => new Track());
  }

  // ─── Context / Channel Strips ───────────────────────────────────────

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

  // ─── Transport ──────────────────────────────────────────────────────

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

  get duration(): number {
    return this.getMaxDuration();
  }

  seek(seconds: number): void {
    if (this.playState === 'recording') return;
    const max = this.getMaxDuration();
    const clamped = Math.max(0, Math.min(seconds, max));
    this.playbackOffset = clamped;
    this.position = Math.round(clamped * 10) / 10;
    if (this.playState === 'playing') {
      this.stopSources(this.activePlaybackSources);
      this.clearPlaybackTick();
      this.stopMeters();
      this.startPlayback(clamped);
    }
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
    this.position = Math.round(offsetSeconds * 10) / 10;
    this.playState = 'playing';

    this.startMeters();
    this.playbackTickId = window.setInterval(() => {
      const elapsed = ctx.currentTime - this.playbackStartTime;
      this.position = Math.round((this.playbackOffset + elapsed) * 10) / 10;
      if (elapsed >= effectiveDuration) {
        this.playbackOffset = maxDuration;
        this.position = Math.round(maxDuration * 10) / 10;
        this.clearPlaybackTick();
        this.stopMeters();
        this.playState = 'stopped';
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
    this.position = Math.round(this.playbackOffset * 10) / 10;
    this.playState = 'paused';
  }

  stop(): void {
    if (this.recorderWorkletNode) {
      this.stopRecording();
      return;
    }
    if (this.playState === 'playing') {
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
      this.position = Math.round(this.playbackOffset * 10) / 10;
    }
    this.playState = 'stopped';
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

  // ─── Playback helpers ──────────────────────────────────────────────

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

  // ─── Recording ──────────────────────────────────────────────────────

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

    // Input chain: source → inputGain → [fx nodes] → recVol → worklet → destination
    this.inputGainNode = ctx.createGain();
    this.inputGainNode.gain.value = 1.0;

    this.recVolNode = ctx.createGain();
    this.recVolNode.gain.value = this.recordingVolume;

    const { nodes, trimGainNode, waveShaperNode } = buildInputFxChain(
      ctx,
      this.config.inputFx,
      this.trimValue,
    );
    this.inputFxNodes = nodes;
    this.trimGainNode = trimGainNode;
    this.waveShaperNode = waveShaperNode;

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

    this.position = Math.round(this.punchInOffset * 10) / 10;
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

      const newBuffer = mergeRecordingIntoBuffer(
        ctx,
        this.recordedChunks,
        trimSamples,
        track.buffer,
        track.trimStart,
        this.punchInOffset,
      );

      if (newBuffer) {
        track.buffer = newBuffer;
        track.hasContent = true;
      }

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

  // ─── Mixer Controls ─────────────────────────────────────────────────

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
    const cfg = this.config.inputFx.find((fx) => fx.type === 'trim');
    if (cfg) applyTrim(value, cfg, this.trimGainNode, this.waveShaperNode);
  }

  setRecordingVolume(value: number): void {
    this.recordingVolume = value;
    if (this.recVolNode) this.recVolNode.gain.value = value;
  }

  setInputGain(value: number): void {
    if (this.inputGainNode) this.inputGainNode.gain.value = value;
  }

  // ─── Metering ───────────────────────────────────────────────────────

  private startMeters(): void {
    if (this.meterRafId !== null) return;
    const tick = () => {
      updateMeterLevels(this.tracks, this.masterGainNode?.gain.value ?? 1);
      this.meterRafId = requestAnimationFrame(tick);
    };
    this.meterRafId = requestAnimationFrame(tick);
  }

  private stopMeters(): void {
    if (this.meterRafId !== null) {
      cancelAnimationFrame(this.meterRafId);
      this.meterRafId = null;
    }
    resetMeterLevels(this.tracks);
  }

  // ─── Save / Load ────────────────────────────────────────────────────

  exportProject(): Blob {
    return _exportProject(this.tracks, this.config, this.masterVolume);
  }

  async importProject(file: File): Promise<void> {
    const { masterVolume } = await _importProject(
      file,
      this.tracks,
      this.config,
      () => this.ensureContext(),
    );
    this.setMasterVolume(masterVolume);
    this.rewind();
  }

  // ─── Cleanup ────────────────────────────────────────────────────────

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
