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

<div class="srtrip">
  <div class="row line-in">&nbsp;</div>
  <div class="row trim-knob">
    <Knob
      min={-1}
      max={1}
      bind:value={engine.trimValue}
      onchange={(trim) => engine.setTrim(trim)}
      labelLeft="LINE"
      labelRight="MIC"
      color="red"
    />
  </div>
  <div class="row sliders">
    <div class="slideSelect">
      <SlideSelect bind:value={selectedTrack} />
    </div>
    <div>
      <Slider />
    </div>
  </div>
  <div class="row label">
    <span class="ui-label">Input</span>
  </div>
</div>

<style>
  .line-in {
    height: 22cqh;
  }
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

  .sliders {
    display: flex;
    height: 30cqw;

    div {
      width: 50%;
      justify-content: center;
      align-items: center;
      display: flex;
    }
  }

  .row {
  }
  .trim-knob {
    height: 10cqw;
  }

  .slideSelect {
    /* height: 200px; */
    padding-top: 50%;
  }
  .label {
    text-align: center;
  }
</style>
