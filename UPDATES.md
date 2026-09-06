# 4track package: latency-related changes

Context: the 4track-tauri desktop wrapper has ~100ms more monitoring latency
(mic-in to speakers while recording) than the same `4track` package running in
Chrome. Root cause investigation (in the 4track-tauri repo, not here) found:

- It's a genuine WebKit-vs-Chromium engine difference — confirmed by hearing
  the same delay in real Safari, not just the Tauri-wrapped WKWebView.
- `AudioContext.baseLatency`/`.outputLatency` and
  `MediaStreamTrack.getSettings().latency` read almost identically between
  Chrome and WebKit (~15-20ms both sides), so the advertised latency
  properties don't explain the audible gap — something below the Web Audio
  API is adding it.
- Forcing the `AudioContext` and mic capture to a non-native sample rate
  (32000 Hz, see below) makes WebKit do continuous real-time resampling
  against the hardware's actual rate (typically 44.1/48kHz on macOS). A
  throwaway local test removing that forcing made the monitoring delay
  audibly better. This is change 1 below.
- The remaining gap is a WebKit engine ceiling that can't be closed from
  config alone; the real fix (native audio monitoring path in the Tauri
  wrapper) has since shipped in that repo, not this package. This
  document only covers what should change in `4track` itself, in a way that
  stays backward compatible for the website and any other consumer.

Everything below references the current **published dist** output (what's in
`node_modules/4track/dist` from the consuming repo), since that's all the
investigation had visibility into. Map these to the actual source files in
this repo (likely `.svelte.ts`/`.ts` under `src/audio/`) — the dist filenames
mirror the source structure closely (`engine.svelte.js` ↔
`engine.svelte.ts`, etc.).

## Change 1 (required): decouple live sample rate from storage sample rate

**Current behavior:** `DEFAULT_CONFIG.sampleRate` (in `constants.js`,
currently `32000`) is used for three different purposes that shouldn't be
coupled:

1. Forced onto the live `AudioContext`: `new AudioContext({ sampleRate:
config.sampleRate, latencyHint: "interactive" })` (`engine.svelte.js`,
   `ensureContext()`).
2. Requested as an `ideal` constraint on `getUserMedia` mic capture
   (`engine.svelte.js`, `startMonitoring()`).
3. Written into exported `.4trk` project file metadata (`project-io.js`,
   `exportProject()`, `sampleRate: config.sampleRate`).

(1) and (2) are almost certainly the cause of the added monitoring latency —
they force the browser to resample in real time against the hardware's
native rate on every buffer. (3) is a separate, unrelated concern (what rate
the _stored_ PCM data is nominally tagged as).

**Also a latent correctness bug independent of any latency work:** because
(3) always writes the _static config value_ rather than the AudioContext's
_actual runtime rate_, if the live context ever ends up running at a
different rate than `config.sampleRate` (which happens today whenever a
browser doesn't honor the exact requested rate, and would happen more often
if change below is made), an exported project's metadata would misstate the
sample rate of its own PCM data, and reimporting would play it back at the
wrong pitch/speed. `engine.svelte.js` line ~498 already gets this right
elsewhere: `ctx?.sampleRate ?? this.config.sampleRate`. `project-io.js`
should do the same.

**Proposed fix:**

- Stop forcing `sampleRate` on `AudioContext` creation and on the
  `getUserMedia` constraint. Let the browser pick the hardware's native rate
  for the _live_ graph (both playback and mic capture) unconditionally —
  there's no case where forcing a non-native rate on the real-time path is
  desirable, it only costs latency.
- Fix `project-io.js` `exportProject()` to tag the file with the
  AudioContext's actual `ctx.sampleRate` at export time, not
  `config.sampleRate`.
- Decide what `config.sampleRate` (and the `44100 | 48000 | 96000` comment
  in `constants.js`) is actually _for_ now that it's disconnected from the
  live graph — two options:
  - **(a) Remove it entirely** if nothing else in the app needs a
    lower/alternate storage rate — simplest, but changes recorded file size
    (previously-recorded audio was effectively downsampled to 32kHz; new
    recordings will be at whatever the hardware runs, e.g. 48kHz — larger
    `.4trk` files, but not lossy).
  - **(b) Keep it as an explicit export-time resample step** — if the
    32kHz default was a deliberate lo-fi/size choice (cassette-authenticity
    or storage budget), keep recording/monitoring at native rate for
    latency, but resample down to `config.sampleRate` only when finalizing
    a recorded buffer or exporting, via an `OfflineAudioContext` render
    pass. This preserves today's file-size/lo-fi behavior for existing
    consumers while still fixing the latency issue.
  - Whoever owns this package should pick based on why 32000 was chosen
    originally — that context wasn't available during this investigation.

**Backward compatibility:** Whichever option is chosen, `DEFAULT_CONFIG`'s
public shape (`AudioEngineConfig`) shouldn't need to change, and no existing
consumer's explicit `config.sampleRate` override should stop working — it
should just mean "storage/export rate" going forward instead of also forcing
the live graph. This should ship as a minor version bump (behavior change,
not an API break) with a changelog note that recorded audio's actual
sample rate now follows hardware, not the configured value, unless option
(b) is implemented.

## Change 2 (validated by the wrapper's shipped native monitoring): a monitoring + capture seam

**Status update (September 2026):** the native (Rust/cpal) monitoring path
described below has since shipped in the Tauri wrapper — working, and
measurably lower-latency than Chrome (~10ms mic-to-speakers round trip).
But because the package has no seam, the wrapper had to do it with two
workarounds that reach into internals, both of which will break silently if
the package refactors:

1. **Silencing the built-in pass-through:** `engine.record()` always wires
   its own monitoring with no opt-out, so the wrapper disconnects
   `engine.recorderWorkletNode` (a private field) after recording starts.
   The node is created asynchronously after `playState` flips to
   `"recording"`, so this even needs a retry loop to win the race.
2. **Controlling capture:** the package calls `getUserMedia` internally with
   no way to pass constraints or supply a stream, so the wrapper
   monkey-patches `navigator.mediaDevices.getUserMedia` (see findings
   below for why that was necessary).

So the seam is no longer speculative — its required shape is now known from
a working implementation:

- **Monitoring adapter** (as originally proposed): an optional
  prop/config on `AudioEngine`/`FourTrack` that takes over the live
  mic-to-speakers pass-through (`startMonitoring`/`stopMonitoring`), while
  recording capture, meters, mixing, playback, and export stay on the
  existing Web Audio path. Default (no adapter) must remain today's
  behavior so the website is unaffected.
- **Capture control**: a way to influence the mic stream the engine
  records from — either audio-constraint pass-through, or (more useful)
  accepting a caller-supplied `MediaStream`/stream factory. This is what
  the wrapper's `getUserMedia` patch fakes today.

**Findings from the wrapper work that motivate capture control (and are
directly relevant to website-on-Safari, same engine):**

- WebKit's default capture (echoCancellation on) goes through Apple's
  voice-processing unit, which at capture start mutes/ramps the mic
  hardware for several seconds (recordings start near-silent then jump to
  full level) and switches the device sample rate mid-capture (audible as
  a pitch glide at the start of takes that converges over a few seconds).
  Observed and logged at the device level via the native path's
  instrumentation.
- For instrument recording the package should request
  `echoCancellation: false, noiseSuppression: false, autoGainControl:
false` — echo cancellation actively subtracts the monitored signal from
  the recording. Caveat: WKWebView was observed engaging voice processing
  despite the constraint at least once, so constraints alone are not a
  complete fix there.
- The robust fix, engine-independent: acquire the mic **once** and keep the
  stream warm for the session, handing each take a `clone()` of it —
  clones share the underlying capture, so takes start at full level with
  the device already configured. The package could adopt this internally
  (or it falls out naturally from accepting a caller-supplied stream).
  Cost: the OS mic-in-use indicator stays on.

## Change 3 (required for usable overdubbing): recording latency compensation

**Symptom (observed in the Tauri wrapper once native monitoring landed):**
the player hears themselves with near-zero latency and plays in time with
the backing tracks, but the _recorded_ take lands audibly late on the
timeline relative to those backing tracks. The same shift exists in Chrome
on the website, just smaller and easier to miss when monitoring latency was
already masking it.

**Mechanism:** two latencies stack between "where the player thinks a note
belongs" and "where its samples land in the recorded buffer":

1. _Output latency_ — the backing track's beat reaches the player's ears
   `outputLatency` after the engine's timeline says it played.
2. _Input latency_ — the note the player plays takes the capture pipeline's
   input latency to arrive at `recorderWorkletNode`, which stamps it into
   the buffer on arrival.

The player aligns to what they hear, so every recorded sample is late by
roughly `(output latency + input latency)` — tens of ms even in Chrome,
more under WebKit. Every DAW compensates for this; the package currently
doesn't (nothing in `engine.svelte.js`'s record-finalize path shifts the
captured buffer).

**Proposed fix:** when finalizing a take (or when placing it on the track
timeline), shift the recorded audio _earlier_ by a compensation offset —
i.e. drop `round(offset * ctx.sampleRate)` samples from the front of the
captured buffer, or offset its placement equivalently.

- Default offset: `ctx.outputLatency + ctx.baseLatency +
(micTrack.getSettings().latency ?? 0)` computed at record start. This is
  imperfect (the investigation found WebKit's advertised values understate
  reality) but strictly better than zero, and correct-ish in Chrome.
- Additionally expose a `recordingLatencyOffset` (seconds) config/prop that
  _overrides_ the computed default when set. This is the seam the Tauri
  wrapper needs: with native monitoring the wrapper knows the player's
  actual monitoring path (~10ms round trip) and can calibrate the real
  end-to-end offset per machine (a loopback click test would nail it
  exactly; even a hand-tuned constant beats the advertised values under
  WebKit).
- Guard against over-compensation: never drop more samples than the buffer
  has, and clamp negative/nonsense values to 0.

**Backward compatibility:** the computed default changes recorded-take
placement for all consumers, but in the direction of objectively correct
timing; existing projects are untouched (compensation applies at record
time only, nothing stored changes shape). Ship with change 1's minor bump
or as its own.

## Suggested verification before releasing change 1

- Website: record, play back, export, and reimport a project — confirm
  audio still round-trips correctly (this is the scenario the
  `project-io.js` fix directly protects).
- Confirm a project exported _before_ this change (tagged `sampleRate:
32000`) still imports and plays back correctly (metadata-driven, should be
  unaffected — just confirming no regression).
- Spot-check monitoring latency subjectively improved on Safari/WebKit; Chrome
  behavior should be unchanged (it wasn't meaningfully affected by the forced
  rate to begin with).
