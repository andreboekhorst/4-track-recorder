# Changelog

## 0.2.0

Latency-focused release. Behavior changes, no API breaks.

### Live audio now runs at the hardware's native sample rate

- The `AudioContext` is no longer created with a forced `sampleRate`, and the
  mic capture no longer requests one. Forcing a non-native rate (32 kHz by
  default) made WebKit/Safari resample the live path continuously and added
  audible monitoring latency. Chrome is unaffected.
- `config.sampleRate` now means the **storage/export rate** only. Recording,
  playback and monitoring happen at whatever rate the hardware runs (typically
  44.1/48 kHz). On `exportProject()` every track is resampled to
  `config.sampleRate` with an `OfflineAudioContext` render pass, so `.4trk`
  file sizes and the lo-fi 32 kHz default are unchanged. Set `sampleRate: 0`
  to export at the native rate instead.
- `.4trk` metadata is tagged with the rate the PCM data was actually written
  at (previously it always wrote the config value, which misstated the rate
  whenever the browser did not honor the requested one).
- On import, tracks are resampled to the live context's rate so later
  punch-ins splice sample-accurately. Projects exported by older versions
  (tagged 32 kHz) load unchanged.
- New read-only `engine.liveSampleRate`.

### Monitoring and capture seam

- `monitoringAdapter` (config or `engine.monitoringAdapter`): an object with
  `start({ stream, trackIndex, context })` and `stop()` that takes over the
  live mic-to-speakers pass-through. While an adapter is active the engine's
  own pass-through is muted; capture, meters, mixing, playback and export stay
  on the Web Audio graph. Default (no adapter) is unchanged.
- `captureStream` (config): a factory `(constraints) => MediaStream |
  Promise<MediaStream>` that supplies the mic stream instead of the engine
  calling `getUserMedia`. Receives the constraints the engine would have used.
- `audioConstraints` (config): extra `getUserMedia` audio constraints merged
  over the engine defaults (`echoCancellation`, `noiseSuppression`,
  `autoGainControl` all off).
- `persistentCapture` (config, opt-in): acquire the mic once and keep it warm
  for the session; each take records from a `clone()`. Avoids WebKit's
  level ramp and mid-capture sample-rate switch at take start. The OS
  mic-in-use indicator stays on until `engine.releaseCapture()` or
  `dispose()`.
- `FourTrack` accepts a `config` prop (`Partial<AudioEngineConfig>`) that is
  passed through to the engine.

### Recording latency compensation

- The computed compensation is now `outputLatency + baseLatency + mic
  latency` (previously `outputLatency` *or* `baseLatency`, plus mic latency).
  Advertised values above 500 ms are treated as bogus; if nothing is reported
  the fallback stays 30 ms.
- New `recordingLatencyOffset` (config or `engine.recordingLatencyOffset`,
  seconds) overrides the computed default. It is read when a take is
  finalized, so it can be calibrated at any point before `stop()`. Negative
  or non-finite values clamp to 0; the engine never drops more samples than
  the take contains.
- Fixed double compensation on a track's first take: the latency was both
  trimmed from the front of the buffer *and* written to `trimStart`, shifting
  the take earlier twice. New first takes now get `trimStart = 0`. Existing
  projects are untouched (their stored `trimStart` is still honored).
- `latencyInfo` now shows the input latency and whether an override is in use.
