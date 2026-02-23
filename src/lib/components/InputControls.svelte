<script lang="ts">
  import type { AudioEngine } from "$lib"
  import SlideSelect from "./els/SlideSelect.svelte"
  import Slider from "./els/Slider.svelte"
  import Knob from "./els/Knob.svelte"
  let {
    engine,
    selectedTrack = $bindable(),
  }: { engine: AudioEngine; selectedTrack: number } = $props()
</script>

<div class="trim-knob">
  <Knob
    min={-1}
    max={1}
    bind:value={engine.trimValue}
    onchange={(trim) => engine.setTrim(trim)}
    leftLabel="LINE"
    rightLabel="MIC"
  />
</div>
<div class="sliders">
  <div>
    <SlideSelect bind:value={selectedTrack} />
  </div>
  <div>
    <Slider />
  </div>
</div>

<!-- <label class="trim-label">
  Trim
  <span class="trim-range">LINE</span>
  <input
    type="range"
    min="-1"
    max="1"
    step="0.01"
    value={engine.trimValue}
    oninput={(e) => engine.setTrim(Number(e.currentTarget.value))}
  />
  <span class="trim-range">MIC</span>
</label>

<label class="trim-label">
  Volume
  <input
    type="range"
    min="0"
    max="1"
    step="0.01"
    value={engine.recordingVolume}
    oninput={(e) => engine.setRecordingVolume(Number(e.currentTarget.value))}
  />
</label>

<div class="latency">{engine.latencyInfo}</div> -->

<style>
  .track-label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
    color: #aaa;
  }

  .track-select {
    margin-bottom: 1rem;
    padding: 0.5rem 1rem;
    font-size: 1rem;
    border: 1px solid #444;
    border-radius: 4px;
    background: #333;
    color: #eee;
    cursor: pointer;
  }

  .track-select:hover,
  .track-select:focus {
    background: #444;
    outline: none;
  }

  .trim-label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin-bottom: 1rem;
    font-size: 0.75rem;
    color: #4e4e4e;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .trim-knob {
    height: 40px;
    aspect-ratio: 1 / 1;
  }

  .trim-label input[type="range"] {
    width: 100px;
    accent-color: #f90;
  }

  .trim-range {
    font-size: 0.6rem;
    color: #666;
    min-width: 2em;
    text-align: center;
  }

  .latency {
    font-size: 0.75rem;
    color: #888;
    margin-bottom: 0.5rem;
    min-height: 1.25rem;
  }

  .sliders {
    display: flex;

    div {
      width: 50%;
    }
  }
</style>
