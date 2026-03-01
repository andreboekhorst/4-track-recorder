<script lang="ts">
  import type { AudioEngine } from "$lib"
  import Knob from "./els/Knob.svelte"
  import Lights from "./els/Lights.svelte"
  let { engine }: { engine: AudioEngine } = $props()

  let mVolume = $state(0)
</script>

<div class="row master">
  <!-- <span class="col1 ui-label">Phones</span> -->
  <div class="col2 phonos-button">
    <Knob
      min={0}
      max={1.5}
      value={engine.masterVolume}
      onchange={(vol) => engine.setMasterVolume(vol)}
      color="green"
    />
  </div>
</div>

{#snippet channelStrip(track, i)}
  <div class="col1 channel-lights" style="grid-area: {i + 2} / 2 / {i + 3} / 3">
    <Lights level={track.level} />
  </div>

  <div class="col2 channel-knob" style="grid-area: {i + 2} / 3 / {i + 3} / 4">
    <Knob
      min={0}
      max={1.5}
      bind:value={track.volume}
      onchange={(vol) => engine.setTrackVolume(i, vol)}
    />
  </div>

  <div class="col3 channel-knob" style="grid-area: {i + 2} / 4 / {i + 3} / 5">
    <Knob
      min={-1}
      max={1}
      bind:value={track.pan}
      onchange={(pan) => engine.setTrackPan(i, pan)}
      labelLeft="L"
      labelRight="R"
      color="pink"
    />
  </div>
{/snippet}

<!-- Not sure if sunippets are most useful here, but wanted to ttry them -->
{#each engine.tracks as track, i}
  {#if !track.hidden}
    {@render channelStrip(track, i)}
  {/if}
{/each}

<div class="ui-label" style="grid-area: 6 / 3 / 7 / 6">Level</div>
<div class="ui-label" style="grid-area: 6 / 4 / 7 / 7">Pan</div>

<style>
  .master {
    height: 14cqw;
    padding-top: 5cqw;
    aspect-ratio: 1 / 1;
    grid-area: 1 / 3 / 2 / 4;
  }
  .channel-strip {
    /* align-items: center; */
    height: 10cqw;
  }

  .channel-knob {
    /* width: 7cqw; */
    align-items: center;
    justify-content: center;
  }

  .bg {
    background: rgba(46, 46, 46, 0.5);
    width: 20px;
    height: 40px;
    transform: rotate(-50deg);
    border-radius: 20px;
    outline: 1px solid rgb(36, 36, 36);
    padding: 2px;
  }

  .light {
    border-radius: 50%;
    /* margin: 40%; */
    width: 1cqw;
    height: 1cqw;
    aspect-ratio: 1 / 1;
    opacity: 0.4;
    &.low {
      background-color: rgb(166, 255, 0);
    }
    &.high {
      background-color: red;
    }
    &.active {
      opacity: 1;
    }
  }
</style>
