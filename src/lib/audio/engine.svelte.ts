// The audio engine: owns reactive state, the Web Audio context,
// and the transport state machine (play/pause/stop/record).
// Delegates DSP, metering, and I/O to focused submodules.

import type { AudioEngineConfig, MicStatus, PlayState, TrimFxConfig } from "../types.js"
import { Track } from "./track.svelte.js"
import {
  DEFAULT_CONFIG,
  AUDIO_CONSTRAINTS,
  PLAYBACK_TICK_MS,
} from "./constants.js"
import { buildInputFxChain, applyTrim } from "./input-fx.js"
import { measureRecordLatency, mergeRecordingIntoBuffer } from "./recording.js"
import { updateMeterLevels } from "./metering.js"
import {
  exportProject as _exportProject,
  importProject as _importProject,
} from "./project-io.js"

export class AudioEngine {
  // ─── Reactive state (read by UI) ────────────────────────────────────

  playState = $state<PlayState>("stopped")
  micStatus = $state<MicStatus>("unsupported")
  position = $state(0)
  masterVolume = $state(1.5)
  latencyInfo = $state("")
  trimValue = $state(-1)
  recordingVolume = $state(0.75)

  tracks: Track[]

  // ─── Private state ──────────────────────────────────────────────────

  private config: AudioEngineConfig

  // Web Audio graph
  private audioContext: AudioContext | null = null
  private masterGainNode: GainNode | null = null

  // Playback
  private activePlaybackSources: AudioBufferSourceNode[] = []
  private monitoringSources: AudioBufferSourceNode[] = []
  private playbackStartTime = 0
  private playbackOffset = 0
  private playbackTickId: number | null = null

  // Recording
  private recorderWorkletNode: AudioWorkletNode | null = null
  private recorderSourceNode: MediaStreamAudioSourceNode | null = null
  private recordedChunks: Float32Array[] = []
  private recordingTrackIndex: number | null = null
  private recordingLatencySeconds = 0
  private punchInOffset = 0
  private timerId: number | null = null

  // Input FX chain (created per recording, torn down on stop)
  private inputGainNode: GainNode | null = null
  private trimGainNode: GainNode | null = null
  private waveShaperNode: WaveShaperNode | null = null
  private recVolNode: GainNode | null = null
  private inputFxNodes: AudioNode[] = []

  // Metering
  private meterRafId: number | null = null

  // Initialization guard
  private audioContextInitialized = false

  // ─── Constructor ────────────────────────────────────────────────────

  constructor(config: Partial<AudioEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    if (config.inputFx) this.config.inputFx = config.inputFx

    const trimCfg = this.config.inputFx.find((fx) => fx.type === "trim")
    if (trimCfg) this.trimValue = trimCfg.default

    this.tracks = Array.from(
      { length: this.config.trackCount },
      () => new Track(),
    )

    for (const ht of this.config.hiddenTracks ?? []) {
      const track = new Track(true)
      track.volume = ht.volume
      track.pan = ht.pan ?? 0
      this.tracks.push(track)
    }
  }

  // ─── Context / Channel Strips ───────────────────────────────────────

  /** Lazily creates the AudioContext and wires up channel strips. Requires a user gesture. */
  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({
        latencyHint: "interactive",
        sampleRate: this.config.sampleRate,
      })
    }
    this.ensureChannelStrips()
    return this.audioContext
  }

  /** Creates per-track gain, analyser, and panner nodes routed to the master bus. Runs once. */
  private ensureChannelStrips(): void {
    if (this.tracks[0]?.gainNode) return
    const ctx = this.audioContext!

    this.masterGainNode = ctx.createGain()
    this.masterGainNode.gain.value = this.masterVolume
    this.masterGainNode.connect(ctx.destination)

    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i]
      const gain = ctx.createGain()
      gain.gain.value = track.volume
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      const pan = ctx.createStereoPanner()
      pan.pan.value = track.pan

      gain.connect(analyser)
      analyser.connect(pan)
      pan.connect(this.masterGainNode)

      track.gainNode = gain
      track.analyserNode = analyser
      track.panNode = pan
    }

    this.startMeters()
  }

  // ─── Audio Context Initialization ─────────────────────────────────

  /** Initializes the AudioContext and fetches hidden track audio (e.g. cassette hiss). Idempotent. */
  async initAudioContext(): Promise<void> {
    if (this.audioContextInitialized) return
    this.audioContextInitialized = true
    const ctx = this.ensureContext()

    // Determine initial mic status
    if (!navigator.mediaDevices?.getUserMedia) {
      this.micStatus = "unsupported"
    } else {
      try {
        const perm = await navigator.permissions.query({ name: "microphone" as PermissionName })
        if (perm.state === "denied") this.micStatus = "denied"
        else if (perm.state === "granted") this.micStatus = "inactive"
        else this.micStatus = "prompt"

        perm.addEventListener("change", () => {
          if (perm.state === "denied") this.micStatus = "denied"
          else if (perm.state === "granted" && this.micStatus !== "active") this.micStatus = "inactive"
          else if (perm.state === "prompt") this.micStatus = "prompt"
        })
      } catch {
        // Permissions API not supported for microphone — assume prompt
        this.micStatus = "prompt"
      }
    }
    const configs = this.config.hiddenTracks ?? []
    const hiddenTracks = this.tracks.filter((t) => t.hidden)

    await Promise.all(
      configs.map(async (ht, i) => {
        try {
          const response = await fetch(ht.url)
          const data = await response.arrayBuffer()
          const audioBuffer = await ctx.decodeAudioData(data)
          hiddenTracks[i].buffer = audioBuffer
          hiddenTracks[i].hasContent = true
        } catch (e) {
          console.warn(`Failed to load hidden track "${ht.url}":`, e)
        }
      }),
    )
  }

  // ─── Transport ──────────────────────────────────────────────────────

  /** Returns the longest track buffer duration in seconds. */
  private getMaxDuration(): number {
    let max = 0
    for (const track of this.tracks) {
      if (
        track.buffer &&
        Number.isFinite(track.buffer.duration) &&
        track.buffer.duration > max
      ) {
        max = track.buffer.duration
      }
    }
    return max
  }

  hasContent = $derived(this.tracks.some((t) => t.hasContent))

  get duration(): number {
    return this.getMaxDuration()
  }

  /** Jumps the playhead to a position in seconds. Restarts playback if currently playing. */
  seek(seconds: number): void {
    if (this.playState === "recording") return
    const max = this.getMaxDuration()
    const clamped = Math.max(0, Math.min(seconds, max))
    this.playbackOffset = clamped
    this.position = Math.round(clamped * 10) / 10
    if (this.playState === "playing") {
      this.stopSources(this.activePlaybackSources)
      this.clearPlaybackTick()
      this.startPlayback(clamped)
    }
  }

  /** Starts playback from the current position. No-op if already playing or recording. */
  async play(): Promise<void> {
    if (this.playState === "playing" || this.playState === "recording") return
    await this.initAudioContext()
    const maxDuration = this.getMaxDuration()
    if (maxDuration <= 0) return
    this.startPlayback(this.playbackOffset)
  }

  /** Schedules all track buffers for playback and starts the position tick timer. */
  private startPlayback(offsetSeconds: number): void {
    const ctx = this.ensureContext()
    ctx.resume()
    const startTime = ctx.currentTime + 0.02
    const maxDuration = this.getMaxDuration()
    if (maxDuration <= 0) return
    const effectiveDuration = maxDuration - offsetSeconds

    this.activePlaybackSources = []
    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i]
      const buf = track.buffer
      if (!buf) continue
      const trim = track.trimStart
      const startOffset = offsetSeconds + trim
      if (startOffset >= buf.duration) continue
      const playDuration = Math.min(
        buf.duration - startOffset,
        effectiveDuration,
      )
      if (playDuration <= 0) continue
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(track.gainNode!)
      src.start(startTime, startOffset, playDuration)
      this.activePlaybackSources.push(src)
    }

    this.playbackStartTime = startTime
    this.playbackOffset = offsetSeconds
    this.position = Math.round(offsetSeconds * 10) / 10
    this.playState = "playing"

    this.playbackTickId = window.setInterval(() => {
      const elapsed = ctx.currentTime - this.playbackStartTime
      this.position = Math.round((this.playbackOffset + elapsed) * 10) / 10
      if (elapsed >= effectiveDuration) {
        this.playbackOffset = maxDuration
        this.position = Math.round(maxDuration * 10) / 10
        this.clearPlaybackTick()
        this.playState = "stopped"
      }
    }, PLAYBACK_TICK_MS)
  }

  /** Pauses playback, preserving the current position for resuming. */
  pause(): void {
    if (this.playState !== "playing") return
    const ctx = this.audioContext
    if (ctx && this.activePlaybackSources.length > 0) {
      this.playbackOffset = Math.min(
        this.playbackOffset + (ctx.currentTime - this.playbackStartTime),
        this.getMaxDuration(),
      )
      this.stopSources(this.activePlaybackSources)
    }
    this.clearPlaybackTick()
    this.position = Math.round(this.playbackOffset * 10) / 10
    this.playState = "paused"
  }

  /** Stops playback or recording. If recording, finalizes and merges the recorded audio. */
  stop(): void {
    if (this.playState === "recording") {
      this.stopRecording()
      return
    }
    if (this.playState === "playing") {
      const ctx = this.audioContext
      if (ctx && this.activePlaybackSources.length > 0) {
        this.playbackOffset = Math.min(
          this.playbackOffset + (ctx.currentTime - this.playbackStartTime),
          this.getMaxDuration(),
        )
        this.stopSources(this.activePlaybackSources)
      }
      this.clearPlaybackTick()
      this.position = Math.round(this.playbackOffset * 10) / 10
    }
    this.playState = "stopped"
  }

  /** Resets the playhead to the beginning and stops all playback. */
  rewind(): void {
    this.stopSources(this.activePlaybackSources)
    this.playbackStartTime = 0
    this.playbackOffset = 0
    this.position = 0
    this.clearPlaybackTick()
    this.playState = "stopped"
  }

  // ─── Playback helpers ──────────────────────────────────────────────

  /** Plays all tracks except the one being recorded, so the musician can hear the mix. */
  private playOtherTracksForMonitoring(
    excludeIndex: number,
    offsetSeconds: number = 0,
  ): void {
    const ctx = this.ensureContext()
    ctx.resume()
    const startTime = ctx.currentTime + 0.02
    this.monitoringSources = []
    for (let i = 0; i < this.tracks.length; i++) {
      if (i === excludeIndex) continue
      const track = this.tracks[i]
      const buf = track.buffer
      if (!buf) continue
      const trim = track.trimStart
      const startOffset = offsetSeconds + trim
      if (startOffset >= buf.duration) continue
      const playDuration = buf.duration - startOffset
      if (playDuration <= 0) continue
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(track.gainNode!)
      src.start(startTime, startOffset, playDuration)
      this.monitoringSources.push(src)
    }
  }

  /** Stops and clears an array of active AudioBufferSourceNodes. */
  private stopSources(sources: AudioBufferSourceNode[]): void {
    const ctx = this.audioContext
    if (!ctx) return
    const when = ctx.currentTime
    for (const src of sources) {
      try {
        src.stop(when)
      } catch {
        /* already stopped */
      }
    }
    sources.length = 0
  }

  /** Stops both active playback and monitoring sources, resets playback position. */
  private stopAllPlayback(): void {
    this.stopSources(this.activePlaybackSources)
    this.stopSources(this.monitoringSources)
    this.clearPlaybackTick()
    // this.playbackStartTime = 0;
    // this.playbackOffset = 0;
  }

  private clearPlaybackTick(): void {
    if (this.playbackTickId !== null) {
      clearInterval(this.playbackTickId)
      this.playbackTickId = null
    }
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  }

  // ─── Monitoring ─────────────────────────────────────────────────────

  /** Sets up mic input chain for live monitoring (pass-through to speakers).
   *  Can be called independently of recording (e.g. record armed + paused). */
  async startMonitoring(trackIndex: number): Promise<void> {
    // Already monitoring — nothing to do
    if (this.recorderSourceNode) return

    if (trackIndex < -1 || trackIndex >= this.tracks.length) return
    if (trackIndex >= 0 && this.tracks[trackIndex].hidden) return

    if (!navigator.mediaDevices?.getUserMedia) {
      this.micStatus = "unsupported"
      throw new Error("Recording requires a secure context (HTTPS). Please access this app over HTTPS.")
    }

    // Acquire mic — must be the FIRST await to stay within the
    // user-gesture window that iOS Safari enforces for getUserMedia.
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...AUDIO_CONSTRAINTS,
          sampleRate: { ideal: this.config.sampleRate },
        },
      })
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") this.micStatus = "denied"
        else if (err.name === "NotFoundError") this.micStatus = "no-device"
        else this.micStatus = "error"
      } else {
        this.micStatus = "error"
      }
      throw err
    }

    this.micStatus = "active"

    await this.initAudioContext()
    const ctx = this.ensureContext()
    await ctx.resume()

    // Build input chain: mic → inputGain → [FX] → recVol → worklet → destination
    // The worklet passes audio through to destination for live monitoring.
    await ctx.audioWorklet.addModule(this.config.workletUrl)
    const source = ctx.createMediaStreamSource(stream)
    const worklet = new AudioWorkletNode(ctx, "recorder")

    this.inputGainNode = ctx.createGain()
    this.inputGainNode.gain.value = 1.0

    this.recVolNode = ctx.createGain()
    this.recVolNode.gain.value = this.recordingVolume

    const { nodes, trimGainNode, waveShaperNode } = buildInputFxChain(
      ctx,
      this.config.inputFx,
      this.trimValue,
    )
    this.inputFxNodes = nodes
    this.trimGainNode = trimGainNode
    this.waveShaperNode = waveShaperNode

    source.connect(this.inputGainNode)
    let prev: AudioNode = this.inputGainNode
    for (const node of this.inputFxNodes) {
      prev.connect(node)
      prev = node
    }
    prev.connect(this.recVolNode)
    this.recVolNode.connect(worklet)
    if (trackIndex >= 0) {
      const track = this.tracks[trackIndex]
      worklet.connect(track.gainNode!)
    } else {
      worklet.connect(this.masterGainNode!)
    }

    this.recorderSourceNode = source
    this.recorderWorkletNode = worklet
  }

  /** Tears down the mic input chain and releases the microphone. */
  stopMonitoring(): void {
    // Disconnect input processing chain
    this.inputGainNode?.disconnect()
    for (const node of this.inputFxNodes) node.disconnect()
    this.inputFxNodes = []
    this.recVolNode?.disconnect()
    this.inputGainNode = null
    this.trimGainNode = null
    this.waveShaperNode = null
    this.recVolNode = null

    const source = this.recorderSourceNode
    const worklet = this.recorderWorkletNode
    this.recorderSourceNode = null
    this.recorderWorkletNode = null

    if (source) source.disconnect()
    if (worklet) worklet.port.onmessage = null
    worklet?.disconnect()
    if (source?.mediaStream)
      source.mediaStream.getTracks().forEach((t) => t.stop())

    this.micStatus = "inactive"
  }

  // ─── Recording ──────────────────────────────────────────────────────

  /** Arms and starts recording on the given track. Reuses monitoring if already active. */
  async record(trackIndex: number): Promise<void> {
    if (this.playState === "recording") return

    // Ensure mic input chain is set up (no-op if already monitoring)
    await this.startMonitoring(trackIndex)

    const ctx = this.ensureContext()
    const stream = this.recorderSourceNode!.mediaStream

    // Measure round-trip latency for alignment when merging
    const recordLatencySeconds = measureRecordLatency(stream, ctx)
    this.updateLatencyDisplay(recordLatencySeconds)

    // Start collecting PCM chunks from the worklet
    this.recordedChunks = []
    this.recorderWorkletNode!.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "pcm" && e.data.data)
        this.recordedChunks.push(e.data.data)
    }

    // Store state needed by stopRecording to merge audio into the track
    this.recordingTrackIndex = trackIndex
    this.recordingLatencySeconds = recordLatencySeconds
    this.punchInOffset = this.playbackOffset

    this.position = Math.round(this.punchInOffset * 10) / 10
    this.playState = "recording"

    // Play other tracks for overdub monitoring, start meters and position timer
    this.playOtherTracksForMonitoring(trackIndex, this.punchInOffset)

    this.timerId = window.setInterval(() => {
      const next = this.position + 1
      if (next >= this.getMaxDuration()) {
        this.stop()
        return
      }
      this.position = next
    }, 1000)
  }

  /** Stops recording and merges captured audio. Keeps mic monitoring alive. */
  private stopRecording(): void {
    const selectedTrackIndex = this.recordingTrackIndex ?? -1
    const recordLatencySeconds = this.recordingLatencySeconds
    this.recordingTrackIndex = null

    const ctx = this.audioContext

    // Stop PCM collection (but keep worklet connected for pass-through monitoring)
    if (this.recorderWorkletNode) {
      this.recorderWorkletNode.port.onmessage = null
    }

    // Stop all tracks from playing
    if (ctx && this.activePlaybackSources.length > 0) {
      this.stopSources(this.activePlaybackSources)
    }

    // Store the playbackposition - so it can resume at this time later.
    // TODO: at the moment it doesnt have granularity we need (1s) but we are doing that later
    this.playbackOffset = this.position

    this.stopAllPlayback()
    this.clearTimer()

    // Merge recorded audio into the track buffer with latency compensation
    const trimSamples = Math.max(
      0,
      Math.round(
        (ctx?.sampleRate ?? this.config.sampleRate) * recordLatencySeconds,
      ),
    )

    if (selectedTrackIndex >= 0 && this.recordedChunks.length && ctx) {
      const track = this.tracks[selectedTrackIndex]
      const hadExistingBuffer = track.buffer !== null

      const newBuffer = mergeRecordingIntoBuffer(
        ctx,
        this.recordedChunks,
        trimSamples,
        track.buffer,
        track.trimStart,
        this.punchInOffset,
      )

      if (newBuffer) {
        track.buffer = newBuffer
        track.hasContent = true
      }

      if (!hadExistingBuffer) {
        track.trimStart = recordLatencySeconds
      }
      this.latencyInfo = `Latency: ~${Math.round(recordLatencySeconds * 1000)} ms (compensated)`
    }

    this.recordedChunks = []
    this.playState = "stopped"
  }

  /** Updates the latencyInfo reactive state with a human-readable breakdown. */
  private updateLatencyDisplay(recordLatencySeconds: number): void {
    const ctx = this.audioContext
    const baseMs =
      ctx && typeof ctx.baseLatency === "number" ? ctx.baseLatency * 1000 : 0
    const outMs =
      ctx && typeof (ctx as any).outputLatency === "number"
        ? (ctx as any).outputLatency * 1000
        : 0
    const totalMs = Math.round(recordLatencySeconds * 1000)
    this.latencyInfo = `Target <20ms \u2022 Round-trip ~${totalMs} ms (base ${Math.round(baseMs)} ms, out ${Math.round(outMs)} ms)`
  }

  // ─── Mixer Controls ─────────────────────────────────────────────────

  setTrackVolume(index: number, value: number): void {
    const track = this.tracks[index]
    if (!track) return
    track.volume = value
    if (track.gainNode) track.gainNode.gain.value = value
  }

  setTrackPan(index: number, value: number): void {
    const track = this.tracks[index]
    if (!track) return
    track.pan = value
    if (track.panNode) track.panNode.pan.value = value
  }

  setMasterVolume(value: number): void {
    this.masterVolume = value
    if (this.masterGainNode) this.masterGainNode.gain.value = value
  }

  setTrim(value: number): void {
    this.trimValue = value
    const cfg = this.config.inputFx.find((fx) => fx.type === "trim")
    if (cfg) applyTrim(value, cfg, this.trimGainNode, this.waveShaperNode)
  }

  setRecordingVolume(value: number): void {
    this.recordingVolume = value
    if (this.recVolNode) this.recVolNode.gain.value = value
  }

  setInputGain(value: number): void {
    if (this.inputGainNode) this.inputGainNode.gain.value = value
  }

  // ─── Metering ───────────────────────────────────────────────────────

  private startMeters(): void {
    if (this.meterRafId !== null) return
    const tick = () => {
      updateMeterLevels(this.tracks, this.masterGainNode?.gain.value ?? 1)
      this.meterRafId = requestAnimationFrame(tick)
    }
    this.meterRafId = requestAnimationFrame(tick)
  }

  private stopMeters(): void {
    if (this.meterRafId !== null) {
      cancelAnimationFrame(this.meterRafId)
      this.meterRafId = null
    }
  }

  // ─── Save / Load ────────────────────────────────────────────────────

  /** Serializes all tracks and settings into a .4trk binary blob. */
  exportProject(): Blob {
    return _exportProject(this.tracks, this.config, this.masterVolume)
  }

  /** Loads a .4trk file, restoring all track buffers, mixer settings, and master volume. */
  async importProject(file: File | Blob): Promise<void> {
    const { masterVolume } = await _importProject(file, this.tracks, () =>
      this.ensureContext(),
    )
    this.setMasterVolume(masterVolume)
    this.rewind()
  }

  // ─── Cleanup ────────────────────────────────────────────────────────

  /** Disconnects all audio nodes, closes the AudioContext, and releases media streams. */
  dispose(): void {
    this.stopAllPlayback()
    this.clearTimer()
    this.stopMeters()
    this.stopMonitoring()

    for (const track of this.tracks) {
      track.gainNode?.disconnect()
      track.analyserNode?.disconnect()
      track.panNode?.disconnect()
    }
    this.masterGainNode?.disconnect()

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.playState = "stopped"
    this.position = 0
  }
}
