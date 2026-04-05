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
