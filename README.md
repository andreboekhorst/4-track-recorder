# 4track

A browser-based 4-track audio recorder built with the Web Audio API and SvelteKit. Designed for low-latency recording with overdub support, latency compensation, and sample-accurate multi-track playback — all running entirely client-side with no server required.

## Project Structure

```
4track/
  src/
    app.html                        - SvelteKit HTML shell
    app.d.ts                        - Global type definitions
    lib/
      audio-engine.svelte.ts        - Core audio engine (AudioEngine class)
      types.ts                      - TypeScript interfaces
      index.ts                      - Library barrel exports
      assets/
        favicon.svg
    routes/
      +layout.svelte                - Root layout (dark theme, global styles)
      +page.svelte                  - Main recorder UI (controls, mixer, transport)
  static/
    recorder-worklet.js             - AudioWorklet processor for low-latency PCM capture
  package.json                      - Dependencies and scripts
  svelte.config.js                  - SvelteKit adapter configuration
  vite.config.ts                    - Vite build configuration
  tsconfig.json                     - TypeScript compiler configuration
```

## How It Works

### Overview

The app emulates a classic 4-track tape recorder. The user selects a track (1-4), hits Record, and the microphone input is captured as raw PCM data via an AudioWorklet. When recording stops, the PCM data is assembled into an `AudioBuffer` with latency compensation applied. During playback, all recorded tracks are scheduled to start at exactly the same `AudioContext` time, producing sample-accurate synchronization.

### Architecture

The application is split across three layers:

- **`src/lib/audio-engine.svelte.ts`** (main thread) — The `AudioEngine` class handles all audio state management, recording lifecycle, playback scheduling, mixing, and save/load. Uses Svelte 5 reactive primitives (`$state`) for UI-bindable properties like `playState`, `position`, `masterVolume`, and per-track `volume`/`pan`/`level`.
- **`static/recorder-worklet.js`** (audio thread) — A lightweight `AudioWorkletProcessor` that captures PCM samples and provides pass-through monitoring. Runs on a dedicated real-time audio thread, so recording and monitoring are never blocked by UI work.
- **`src/routes/+page.svelte`** (UI) — The Svelte component that renders transport controls, channel strips, and the mixer. Instantiates `AudioEngine` on mount and binds reactive state to the DOM.

The `Track` class (inside the audio engine) represents each of the 4 tracks with reactive state (`volume`, `pan`, `level`, `hasContent`) and owns its audio nodes (`GainNode`, `StereoPannerNode`, `AnalyserNode`).

---

## Detailed Walkthrough

### 1. AudioContext Setup (`getAudioContext`)

#### What is an AudioContext?

An `AudioContext` is the central object of the Web Audio API. It represents an audio processing graph — every audio node (sources, effects, destinations) must be created from and connected within a context. It owns the audio rendering thread, manages timing (`ctx.currentTime`), and controls the sample rate and buffer size used for all processing. You need exactly one context for an application; creating multiple contexts wastes resources and makes synchronisation between them impossible.

#### Why not use `<audio>` elements or `HTMLMediaElement` instead?

The app uses the Web Audio API exclusively because:

- **`<audio>` elements cannot synchronise precisely.** Calling `.play()` on multiple elements relies on the main-thread event loop, so tracks drift apart by milliseconds. Web Audio's `source.start(exactTime)` schedules playback on the audio thread at sample-level precision.
- **No real-time input processing.** `<audio>` elements can only play back files/streams. They can't capture microphone input, apply latency trimming, or build audio buffers from raw PCM. The Web Audio API provides `AudioWorklet`, `MediaStreamSource`, and `AudioBuffer` for all of this.
- **No buffer-level control.** With `<audio>` you can't control buffer sizes, sample rates, or routing. The Web Audio API lets us force a specific sample rate, choose a latency hint, and wire arbitrary audio graphs (mic → worklet → destination).

#### Why a lazy singleton?

```js
function getAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext({
      latencyHint: "interactive",
      sampleRate: 48000,
    });
  }
  return audioContext;
}
```

The context is created **lazily** (on first call, not at page load) for two reasons:

1. **Browser autoplay policy.** Browsers block `AudioContext` creation (or immediately suspend it) unless it happens inside a user gesture (click/tap). By deferring creation until the user clicks Record or Play, the context starts in the `"running"` state without requiring a separate `.resume()` workaround.
2. **Resource efficiency.** An `AudioContext` spins up a dedicated audio rendering thread and claims exclusive low-latency access to audio hardware. Creating it at page load would waste resources if the user never interacts.

It's a **singleton** because all nodes (recording worklets, playback sources, monitoring sources) must share the same `currentTime` clock and destination to stay synchronised. A second context would have an independent clock, making sample-accurate multi-track playback impossible.

#### Constructor parameters

The `AudioContext` constructor accepts an `AudioContextOptions` object. Here's what we set and what we leave as defaults:

**Explicitly set:**

- **`latencyHint: "interactive"`** — This is the most important setting for a recording app. It tells the browser to use the **smallest possible audio buffer size** (typically 128 or 256 samples), prioritising low latency over power efficiency. The alternatives are:
  - `"balanced"` (default) — A compromise between latency and power. Buffer sizes are typically 512-1024 samples (~10-20ms at 48 kHz). Too slow for real-time monitoring — the musician would hear a noticeable echo of their own playing.
  - `"playback"` — Optimised for battery life and smooth playback of pre-rendered audio. Buffer sizes can be 2048+ samples (~40ms+). Completely unsuitable for live input.
  - A number (seconds, e.g. `0.01`) — Requests a specific latency in seconds. We use `"interactive"` instead because it lets the browser pick the lowest latency its hardware and driver can sustain, rather than us guessing a value that might not be achievable.

  With `"interactive"`, Chrome typically achieves a base latency of ~2.67ms (128 samples at 48 kHz). This means the musician hears their microphone input through the pass-through worklet in under 6ms total, which is imperceptible.

- **`sampleRate: 48000`** — Forces the context to operate at 48 kHz. Why this specific value:
  - **48 kHz is the native rate of most audio interfaces and built-in sound hardware.** When the context's sample rate matches the hardware, no sample-rate conversion is needed. Resampling adds latency (a filter delay of several samples) and can introduce subtle artifacts.
  - **44100 Hz** (CD quality) would also work, but most modern hardware runs at 48 kHz natively, so 44.1 kHz would actually trigger resampling on most systems.
  - **96 kHz or higher** would double memory usage and CPU load with no audible benefit for a browser-based recorder (the microphone and DAC are the quality bottleneck, not the sample rate).
  - If omitted, the browser picks the hardware's default rate, which is usually 48 kHz anyway — but explicitly setting it guarantees consistent behaviour and makes the latency-compensation math (converting seconds to sample counts) predictable.

**Left as defaults (not set):**

- **`sinkId`** (default: `""`, the system default output device) — We don't specify an output device; the system default is fine. This parameter is useful for apps that need to route audio to a specific device (e.g. a USB audio interface), but for a general-purpose recorder the default output is appropriate.
- **`renderSizeHint`** (non-standard, Chrome-only, default: browser-chosen) — Hints at the preferred render quantum size. The Web Audio spec defines a fixed render quantum of 128 samples, and `"interactive"` already drives the browser toward the smallest possible buffer, so there's no benefit in setting this.

### 2. The Recorder Worklet (`static/recorder-worklet.js`)

```js
class RecorderWorkletProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const channelIn = input[0];
    const channelOut = output[0];
    // 1. Copy input to output (pass-through monitoring)
    channelOut.set(channelIn.subarray(0, length));
    // 2. Send PCM copy to main thread
    const copy = new Float32Array(length);
    copy.set(channelIn.subarray(0, length));
    this.port.postMessage({ type: "pcm", data: copy }, [copy.buffer]);
    return true;
  }
}
registerProcessor("recorder", RecorderWorkletProcessor);
```

This worklet does two things per audio frame (~128 samples at 48 kHz):

1. **Pass-through monitoring** — Copies the microphone input directly to the output. Because the worklet is connected to `ctx.destination`, the musician hears their own input through speakers/headphones with minimal latency (the audio buffer round-trip, typically <10ms).

2. **PCM capture** — Creates a copy of each input buffer as a `Float32Array` and posts it to the main thread via `MessagePort`. The `[copy.buffer]` transfer list hands ownership of the underlying `ArrayBuffer` to the main thread (zero-copy transfer), avoiding expensive memory copies.

**Why not use `MediaRecorder`?** `MediaRecorder` encodes audio into a compressed format (like Opus/WebM) and buffers data before delivering chunks. This adds encoding latency, and the chunk boundaries don't align precisely with recording start/stop. By capturing raw PCM directly from the worklet, we get sample-precise recording with zero encoding overhead.

### 3. Recording Flow

When the user clicks **Record**, the `AudioEngine.startRecording()` method executes:

#### a. Microphone Access

```js
const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
```

The constraints disable all voice-oriented processing:

```js
const AUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  sampleRate: { ideal: 48000 },
  latency: { ideal: 0 },
};
```

- **Echo cancellation, noise suppression, and auto gain control** are disabled because they're designed for voice calls and degrade music quality. Echo cancellation in particular adds significant latency.
- **`latency: { ideal: 0 }`** — Asks Chrome for the smallest possible capture buffer. Not all browsers respect this, but where supported it further reduces input latency.

#### b. Input Effects Chain & Worklet Setup

The full recording signal chain is:

```
Mic → inputGain → trimGain → waveShaper (saturation) → recVol → worklet → speakers
```

- **trimGain** — Adjusts input level based on the Trim slider (LINE to MIC). At LINE (-1), it applies a lower gain for clean signals. At MIC (+1), it drives harder into the waveshaper.
- **waveShaper** — Applies a configurable saturation curve that crossfades from linear (clean) to `tanh` (driven), mimicking the character of a real tape recorder. The curve is generated by `makeSaturationCurve()` based on the trim position.
- **recVol** — Recording volume control, baked into the captured audio.

The input FX chain is configurable via `CONFIG.inputFx` and built dynamically by `buildInputFxChain()`. Effects can be enabled/disabled individually. The chain is created on Record and torn down on Stop.

#### c. PCM Collection

```js
worklet.port.onmessage = (e) => {
  if (e.data?.type === "pcm" && e.data.data) recordedChunks.push(e.data.data);
};
```

Each ~128-sample chunk from the worklet is pushed into the `recordedChunks` array. At 48 kHz, a 10-second recording produces roughly 3,750 chunks.

#### d. Overdub Monitoring

When recording to track 2 (for example), tracks 1, 3, and 4 are played back simultaneously so the musician can hear the existing material while recording their overdub. All monitoring tracks are scheduled at the same `AudioContext` time for precise sync.

#### e. Timer & Max Duration

A 1-second interval timer updates the on-screen time display. Recording automatically stops at 60 seconds (`MAX_SECONDS`).

### 4. Latency Measurement & Compensation

#### Measuring Latency (`measureRecordLatency`)

```js
function measureRecordLatency(stream) {
  // Input latency from the audio track settings
  let inputLatency = audioTrack.getSettings().latency;
  // Output latency from AudioContext
  let outputLatency = ctx.outputLatency ?? ctx.baseLatency;
  return inputLatency + outputLatency;
}
```

The total round-trip latency is the sum of:

- **Input latency** — Time from sound hitting the microphone to the audio data being available in the worklet. Reported by `MediaStreamTrack.getSettings().latency` (Chrome).
- **Output latency** — Time from the `AudioContext` scheduling a sample to it actually reaching the speakers. `AudioContext.outputLatency` (Chrome) or `AudioContext.baseLatency` (fallback).

If neither value is available, a conservative default of 30ms is used. The total is capped at 200ms to prevent clearly wrong values from breaking things.

#### Applying Compensation (`buildBufferFromPCM`)

```js
const trimSamples = Math.round(ctx.sampleRate * recordLatencySeconds);
```

When recording stops, the measured latency is converted to a sample count. That many samples are **trimmed from the start** of the recording. This compensates for the fact that when the user hears the playback cue and plays along, their recorded audio is delayed by the round-trip latency. Trimming the beginning aligns the overdub with the original tracks.

The trimming is done sample-by-sample across chunk boundaries, so no audio data is wasted even if a chunk straddles the trim point.

### 5. Punch-In Merging (`mergeRecordingIntoBuffer`)

When recording an overdub onto a track that already has audio, the new recording is spliced into the existing buffer at the punch-in point. The result is three regions:

```
[original before punchIn] [new recording] [original after punchIn + newLen]
```

1. **Region A** — Original audio from the start of the buffer up to `punchInSample` is preserved.
2. **Region B** — The new PCM recording (with latency trimming applied) is written at the punch-in position.
3. **Region C** — Original audio after the new recording ends is preserved.

The `punchInOffset` is captured when Record is pressed (from the current `playbackOffset`), converted to an exact sample position using `Math.round(punchInSeconds * ctx.sampleRate)`, giving sub-millisecond accuracy.

If the new recording extends beyond the original buffer length, the result buffer is expanded. If the track was previously empty, silence fills the gap before the punch-in point.

### 6. Stopping a Recording

When **Stop** is clicked during recording:

1. The microphone source is disconnected from the worklet (prevents further PCM messages).
2. The worklet's `onmessage` handler is nulled out.
3. The worklet and source are disconnected and the media stream tracks are stopped.
4. Any monitoring playback is stopped.
5. The recording timer is cleared.
6. The PCM chunks are assembled into an `AudioBuffer` with latency trimming applied.
7. UI buttons are re-enabled via reactive `playState` updates.

The careful ordering of disconnect-before-build ensures no stale PCM data leaks into the next recording session.

### 7. Mixer Channel Strips (Track class)

Each `Track` instance owns a persistent signal chain created when the `AudioEngine` initialises:

```
buffer → GainNode (volume) → AnalyserNode (level meter) → StereoPannerNode (L/R) → masterGain → speakers
```

- **GainNode** — Per-track volume control (0–1), driven by the Vol slider in each channel strip.
- **AnalyserNode** — Reads peak audio levels in real-time via `getFloatTimeDomainData()`. The `updateMeters()` method runs on `requestAnimationFrame` and updates the reactive `level` property on each Track.
- **StereoPannerNode** — Positions audio in the stereo field (-1 = full left, 0 = center, +1 = full right).
- **masterGain** — A single global `GainNode` that all four tracks feed into before reaching `ctx.destination`.

### 8. Playback

```js
const startTime = ctx.currentTime + 0.02; // 20ms lookahead

for (let i = 0; i < buffers.length; i++) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(gainNodes[i]); // routes through the mixer channel strip
  src.start(startTime, startOffset, startTime + playDuration);
  activePlaybackSources.push(src);
}
```

All tracks are scheduled to start at the exact same future `AudioContext` time. This is what makes multi-track playback **sample-accurate** — the browser's audio scheduler handles the precise timing, not JavaScript `setTimeout`.

The 20ms lookahead (`+ 0.02`) gives the audio system time to prepare all sources before they need to start, preventing glitches from scheduling too close to "now."

Each `BufferSourceNode` supports an offset parameter, which is used for:
- **Resume after pause** — if the user paused at 5.3 seconds, playback resumes from exactly 5.3 seconds.
- **Per-track trim** — each track's latency compensation trim is added to the offset, so the audio plays back correctly aligned.

### 9. Pause & Resume

**Pause** captures the current playback position, then all source nodes are stopped. **Play** then resumes from the saved position.

Note: `AudioBufferSourceNode` is a one-shot — once stopped, it cannot be restarted. New source nodes are created on each play/resume.

### 10. Reactive State (Svelte 5)

The `AudioEngine` and `Track` classes use Svelte 5's `$state()` rune for reactive properties. This means UI updates happen automatically when state changes — no manual DOM manipulation or event dispatching is needed.

Key reactive properties on `AudioEngine`:
- `playState` — `'stopped' | 'playing' | 'paused' | 'recording'`
- `position` — Current playback position in seconds
- `masterVolume`, `trimValue`, `recordingVolume`
- `latencyInfo` — Measured input/output latency

Key reactive properties on `Track`:
- `volume`, `pan` — Mixer controls
- `level` — Real-time peak meter reading
- `hasContent` — Whether the track has recorded audio

The UI component (`+page.svelte`) reads these properties directly, and Svelte's reactivity system ensures the DOM stays in sync.

### 11. Save / Load (`.4trk` File Format)

Projects are exported as binary `.4trk` files by `exportProject()` and restored by `importProject()`.

**File structure:**

```
[4 bytes: metadata length (Uint32LE)]
[N bytes: JSON metadata]
[PCM data for track 0]
[PCM data for track 1]
[PCM data for track 2]
[PCM data for track 3]
```

**Metadata** includes: sample rate, bit depth, master volume, and per-track volume, pan, trim, and sample count.

**PCM data** is quantized from Float32 to the configured bit depth (8/16/32) via `quantizePCM()` to reduce file size. On load, `dequantizePCM()` converts back to Float32 for `AudioBuffer` creation. All mixer slider positions are restored from the metadata.

### UI Sections

The UI in `+page.svelte` is organized into these functional areas:

1. **Time display** — current position in seconds
2. **Input config** — track selector, trim slider (LINE/MIC saturation), recording volume
3. **Transport controls** — Record, Stop, Play, Pause, Rewind
4. **Mixer** — 4 channel strips, each with volume, pan, and level meter
5. **Master** — global volume control
6. **File controls** — Save/Load project buttons

## Building

The app uses SvelteKit with Vite:

```bash
npm install
npm run build      # Production build via Vite + SvelteKit
npm run preview    # Preview the production build
```

## Developing

```bash
npm run dev        # Start Vite dev server with HMR
npm run check      # Run svelte-check for type errors
```

## Browser Compatibility

- Requires a modern browser with `AudioWorklet` support (Chrome, Edge, Firefox, Safari 14.1+).
- `outputLatency` and track-level `latency` settings are Chrome-specific; the app gracefully falls back on other browsers.
- Must be served over HTTPS (or localhost) for `getUserMedia` access.
