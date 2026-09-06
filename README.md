# 4track

A browser-based 4-track audio recorder built with the Web Audio API and SvelteKit. Designed for low-latency recording with overdub support, latency compensation, and sample-accurate multi-track playback — all running entirely client-side with no server required.

![4-Track Recorder](img/4track.png)

## Give it a try

You can try out the 4 track recorder on [4track.cc](https://www.4track.cc)

## Installation

```bash
npm install 4-track-recorder
```

## Basic Usage

```svelte
<script>
  import { FourTrack } from "4-track-recorder"
</script>

<FourTrack />
```

## Saving and Loading Projects

The component uses a custom `.4trk` binary format that stores all track audio data and mixer settings (volume, pan, master volume).

### Bind `save` and `load` functions

Use `bind:save` and `bind:load` to get functions you can call from your own UI:

```svelte
<script>
  import { FourTrack } from "4-track-recorder"

  let save
  let load

  function handleSave() {
    const blob = save()
    // Download as file
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "my-song.4trk"
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleLoad(event) {
    const file = event.target.files?.[0]
    if (file) load(file)
  }

  // Or load directly from a URL
  function loadFromUrl() {
    load("https://example.com/songs/demo.4trk")
  }
</script>

<FourTrack bind:save bind:load />

<button onclick={handleSave}>Save Project</button>
<input type="file" accept=".4trk" onchange={handleLoad} />
```

### Load a project on mount

Pass a URL or `File` to `initialProject` to auto-load a project when the component mounts:

```svelte
<FourTrack initialProject="/songs/demo.4trk" />
```

## Props

| Prop             | Type                                                   | Description                                                       |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| `hiddenTracks`   | `HiddenTrackConfig[]`                                  | Background audio tracks (e.g. cassette hiss)                      |
| `onready`        | `(detail: { engine: AudioEngine }) => void`            | Callback when the engine is initialized                           |
| `save`           | `() => Blob` (bindable)                                | Bind to get a function that exports the project as a `.4trk` blob |
| `load`           | `(source: File \| string) => Promise<void>` (bindable) | Bind to get a function that imports a `.4trk` file or URL         |
| `initialProject` | `string \| File`                                       | URL or File to auto-load on mount                                 |
| `config`         | `Partial<AudioEngineConfig>`                           | Extra engine config passed through to `AudioEngine` (see below)   |

## Engine configuration

`FourTrack` creates an `AudioEngine` internally; pass extra options via the
`config` prop, or construct `new AudioEngine(config)` yourself.

| Option                   | Type                                                | Default | Description                                                                                                                                             |
| ------------------------ | --------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sampleRate`             | `number`                                            | `32000` | **Storage/export** rate. The live graph always runs at the hardware's native rate; tracks are resampled to this rate on export. `0` = export at native. |
| `bitDepth`               | `8 \| 16 \| 32`                                     | `16`    | PCM bit depth in exported `.4trk` files                                                                                                                 |
| `audioConstraints`       | `MediaTrackConstraints`                             |         | Merged over the engine's `getUserMedia` defaults (echo cancellation, noise suppression and AGC off)                                                     |
| `captureStream`          | `(constraints) => MediaStream \| Promise<...>`      |         | Supplies the mic stream instead of the engine calling `getUserMedia`                                                                                    |
| `persistentCapture`      | `boolean`                                           | `false` | Acquire the mic once and record each take from a `clone()`; avoids WebKit's level ramp at take start. Release with `engine.releaseCapture()`           |
| `monitoringAdapter`      | `{ start(detail), stop() }`                         |         | Takes over the live mic-to-speakers pass-through (e.g. a native audio path). Capture, meters, playback and export stay on Web Audio                    |
| `recordingLatencyOffset` | `number` (seconds)                                  |         | Overrides the computed recording latency compensation. Also settable at runtime via `engine.recordingLatencyOffset`                                    |

### Recording latency compensation

When you overdub, the backing track reaches your ears after the output
latency and your playing reaches the recorder after the input latency, so
every recorded sample lands late by roughly the sum. The engine shifts each
take earlier by `outputLatency + baseLatency + mic latency` as advertised by
the browser. Browsers (WebKit especially) understate these values, so if takes
still land late, measure the real round trip (a loopback click test works) and
set `recordingLatencyOffset`:

```svelte
<FourTrack config={{ recordingLatencyOffset: 0.045 }} />
```

### External monitoring

If your host can monitor the mic with lower latency than Web Audio (for
example a native audio path in a desktop wrapper), hand it the pass-through:

```ts
const config = {
  monitoringAdapter: {
    start: ({ stream, trackIndex, context }) => native.startMonitoring(),
    stop: () => native.stopMonitoring(),
  },
  captureStream: (constraints) => navigator.mediaDevices.getUserMedia({ audio: constraints }),
  recordingLatencyOffset: 0.012,
}
```

## License

4track is dual-licensed under [GPL-3.0-only](./LICENSE) or a
[commercial license](./LICENSE-COMMERCIAL.md). Use it under the GPL for free,
or reach out for a commercial license if you need to embed it in a
closed-source product (e.g. an App Store app).
