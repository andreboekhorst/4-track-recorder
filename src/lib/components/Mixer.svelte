<script lang="ts">
  import type { AudioEngine } from "$lib"
  import Knob from "./els/Knob.svelte"
  let { engine }: { engine: AudioEngine } = $props()

  let mVolume = $state(0)
</script>

<div class="master">
  <span class="ui-label">Phones</span>
  <!-- <label class="master-label"> -->
  <!-- <input
      type="range"
      min="0"
      max="1.5"
      step="0.01"
      value={engine.masterVolume}
      oninput={(e) => engine.setMasterVolume(Number(e.currentTarget.value))}
    />
    O{Math.floor(engine.masterVolume * 100)}O -->
  <div class="top">
    <Knob
      min={0}
      max={1.5}
      value={engine.masterVolume}
      onchange={(vol) => engine.setMasterVolume(vol)}
    />
  </div>
  <!-- </label> -->
</div>

<div class="mixer">
  {#each engine.tracks as track, i}
    {#if !track.hidden}
      <div class="channel-strip">
        <!-- <span class="channel-label">Track {i + 1}</span> -->
        <div class="knob-holder">
          <!-- <input
						type="range"
						min="0"
						max="1.5"
						step="0.01"
						value={track.volume}
						oninput={(e) => engine.setTrackVolume(i, Number(e.currentTarget.value))}
					/> -->
          <Knob
            min={0}
            max={1.5}
            bind:value={track.volume}
            onchange={(vol) => engine.setTrackVolume(i, vol)}
          />
        </div>
        <div class="knob-holder">
          <!-- <input
					type="range"
					min="-1"
					max="1"
					step="0.01"
					value={track.pan}
					oninput={(e) => engine.setTrackPan(i, Number(e.currentTarget.value))}
					/> -->
          <Knob
            min={-1}
            max={1}
            bind:value={track.pan}
            onchange={(pan) => engine.setTrackPan(i, pan)}
            labelLeft="L"
            labelRight="R"
          />
        </div>
        <!-- <span class="channel-level">{track.level}</span> -->
      </div>
    {/if}
  {/each}
</div>

<style>
  .channel-strip {
    display: flex;
    /* flex-direction: column; */
    align-items: center;
    /* gap: 20px; */
    /* padding: 30px; */
  }

  .knob-holder {
    /* width: 5cqw; */
    /* aspect-ratio: 1 / 1; */
  }

  .master {
    height: 10vw;
    aspect-ratio: 1 / 1;
  }

  .master-label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: #aaa;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .master-label input[type="range"] {
    width: 120px;
    accent-color: #6cf;
  }

  .master {
    padding-left: 6.25cqw;
  }

  .mixer {
    padding-left: 6.25cqw;
  }

  .top {
    /* width: 5cqw; */
    height: 22cqh;
    /* aspect-ratio: 1 / 1; */
  }
</style>
