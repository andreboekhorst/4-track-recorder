<script lang="ts">
  import type { AudioEngine } from "$lib"
  import Knob from "./els/Knob.svelte"
  import Lights from "./els/Lights.svelte"
  let { engine }: { engine: AudioEngine } = $props()

  let mVolume = $state(0)
</script>

<div class="row master">
  <span class="col1 ui-label">Phones</span>
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

{#each engine.tracks as track, i}
  {#if !track.hidden}
    <div class="row channel-strip">
      <div class="col1 channel-lights">
        <Lights level={track.level} />
      </div>
      <div class="col2 channel-knob">
        <Knob
          min={0}
          max={1.5}
          bind:value={track.volume}
          onchange={(vol) => engine.setTrackVolume(i, vol)}
        />
      </div>
      <div class="col3 channel-knob">
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
    </div>
  {/if}
{/each}

<div class="row labels">
  <span class="col1"></span>
  <span class="col2 ui-label">Level</span>
  <span class="col3 ui-label">Pan</span>
  <span class="col4 ui-label">Master</span>
</div>

<style>
  .row {
    display: flex;
  }
  .col1 {
    width: 4.5cqw;
    margin-left: 4.5cqw;
  }
  .col2 {
    width: 7.5cqw;
    justify-content: center;
  }
  .col3 {
    width: 7.5cqw;
    justify-content: center;
  }
  .col4 {
  }
  .master {
    height: 14cqw;
    padding-top: 5cqw;
    aspect-ratio: 1 / 1;
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
  .ui-label {
    text-align: center;
  }
</style>
