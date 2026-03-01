<script lang="ts">
  import { AudioEngine } from "$lib"
  import { onMount } from "svelte"
  import Knob from "$lib/components/els/Knob.svelte"
  import Lights from "$lib/components/els/Lights.svelte"
  import Slider from "$lib/components/els/Slider.svelte"
  import SlideSelect from "$lib/components/els/SlideSelect.svelte"
  import Timestamp from "$lib/components/els/Timestamp.svelte"
  import Cassette from "$lib/components/Cassette.svelte"
  import TransportButtons from "$lib/components/TransportButtons.svelte"

  let engine: AudioEngine | null = $state(null)
  let selectedTrack = $state(0)
  let fileInput = $state<HTMLInputElement>(undefined!)
  let speed = $state(0)

  onMount(() => {
    engine = new AudioEngine({
      hiddenTracks: [{ url: "casette_hiss.opus", volume: 0.08 }],
    })
    engine.initAudioContext()
    return () => engine?.dispose()
  })

  function handleSave() {
    if (!engine) return
    const blob = engine.exportProject()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "recording.4trk"
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleLoad() {
    fileInput?.click()
  }

  function handleFileChange() {
    const file = fileInput?.files?.[0]
    if (file && engine) {
      engine.importProject(file)
      fileInput.value = ""
    }
  }
</script>

<svelte:head>
  <title>4track – Record</title>
</svelte:head>

{#if engine}
  {@const tracks = engine.tracks}

  {#snippet channelStrip(track, i)}
    <div
      class="channel-lights cell-center"
      style="grid-area: {i + 3} / 2 / {i + 4} / 3"
    >
      <Lights level={track.level} />
    </div>

    <div class="cell-center" style="grid-area: {i + 3} / 3 / {i + 4} / 4">
      <Knob
        min={0}
        max={1.5}
        bind:value={track.volume}
        onchange={(vol) => engine.setTrackVolume(i, vol)}
      />
    </div>

    <div class="cell-center" style="grid-area: {i + 3} / 4 / {i + 4} / 5">
      <Knob
        min={-1}
        max={1}
        bind:value={track.pan}
        onchange={(pan) => engine.setTrackPan(i, pan)}
        label={"TRK " + (i + 1)}
        labelLeft="L"
        labelRight="R"
        color="pink"
      />
    </div>
  {/snippet}

  <div class="frame">
    <div class="app">
      <div class="parent">
        <div class="cell-center" style="grid-area: 2 / 2 / 3 / 3">
          <span class="ui-label">Phones</span>
        </div>

        <div class="master cell-center" style="grid-area: 2 / 3 / 3 / 4">
          <div class="phonos-button">
            <Knob
              min={0}
              max={1.5}
              value={engine.masterVolume}
              onchange={(vol) => engine.setMasterVolume(vol)}
              color="green"
            />
          </div>
        </div>

        <!-- Mixer: Channel strips -->
        {#each tracks as track, i}
          {#if !track.hidden}
            {@render channelStrip(track, i)}
          {/if}
        {/each}

        <div class="ui-label cell-center" style="grid-area: 7 / 3 / 8 / 4">
          Level
        </div>
        <div class="ui-label cell-center" style="grid-area: 7 / 4 / 8 / 5">
          Pan
        </div>
        <div class="ui-label cell-center" style="grid-area: 8 / 3 / 9 / 5">
          -- Output --
        </div>

        <div class="cell-center" style="grid-area: 1 / 5 / 9 / 6">
          <div class="separator"></div>
        </div>

        <div class="cell-center" style="grid-area: 5 / 6 / 7 / 7">
          <SlideSelect />
        </div>

        <div class="ui-label cell-center" style="grid-area: 8 / 6 / 9 / 7">
          Track
        </div>

        <div class="cell-center" style="grid-area: 1 / 7 / 9 / 8">
          <div class="separator"></div>
        </div>

        <!-- Input Controls -->
        <div class="cell-center" style="grid-area: 3 / 8 / 4 / 9">
          <Knob
            min={-1}
            max={1}
            bind:value={engine.trimValue}
            onchange={(trim) => engine.setTrim(trim)}
            label="TRIM"
            labelLeft="LINE"
            labelRight="MIC"
            color="red"
          />
        </div>

        <div class="cell-center" style="grid-area: 4 / 8 / 7 / 9">
          <Slider />
        </div>

        <div class="ui-label cell-center" style="grid-area: 8 / 8 / 9 / 9">
          Input
        </div>

        <div class="cell-center" style="grid-area: 1 / 9 / 9 / 10">
          <div class="separator"></div>
        </div>

        <div class="cell-center" style="grid-area: 2 / 10 / 3 / 11">
          <Timestamp timestamp={engine.position} />
        </div>

        <div style="grid-area: 3 / 10 / 6 / 13">
          <Cassette
            {speed}
            time={engine.position}
            max={engine.duration || 180}
            onchange={(ts) => engine.seek(ts)}
            isRecording={engine.playState === "recording"}
          />
        </div>

        <div style="grid-area: 6 / 10 / 9 / 12">
          <TransportButtons {engine} {selectedTrack} bind:speed />
        </div>
      </div>
    </div>
  </div>

  <div class="file-controls">
    <button onclick={handleSave} disabled={!engine.hasContent}>Save</button>
    <button onclick={handleLoad}>Load</button>
    <input
      type="file"
      accept=".4trk"
      bind:this={fileInput}
      onchange={handleFileChange}
      hidden
    />
  </div>
{/if}

<style>
  .separator {
    height: 100%;
    width: 20px;
    width: 0.45cqw;
    border-radius: 0 0 0.15cqw 0.15cqw;
    box-shadow:
      inset 2px 2px 1px rgb(19 18 18 / 75%),
      inset 1px 1px 1px rgba(31, 31, 31, 0.45),
      inset -1px -1px 1px rgba(255, 252, 252, 0.35);
  }
  .parent {
    display: grid;
    grid-template-columns: 4cqw 1fr 1fr 1fr 1fr 1fr 4cqw 1fr 4cqw 20cqw 20cqw 4cqw;
    grid-template-rows: 6cqh 1fr 1fr 1fr 1fr 1fr 6cqh 6cqh 6cqh;
    grid-column-gap: 0px;
    grid-row-gap: 0px;
    height: 100%;
  }

  .frame {
    container-type: size;
    background: linear-gradient(to bottom, #616161, #3b3b3b);
    padding: 4px;
    border-radius: 12px 12px 40px 40px;
    aspect-ratio: 1 / 0.6;
    max-height: 80vh;
    max-width: 85nvw;
    margin: 0 auto;
  }

  .app {
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='0.6'/%3E%3C/svg%3E"),
      radial-gradient(ellipse at top left, #686b71, #383840);
    background-blend-mode: multiply;
    border-radius: 10px 10px 36px 36px;
    height: 100cqh;
    box-shadow:
      inset 1px 1px 4px rgba(255, 255, 255, 0.8),
      inset -2px -2px 4px rgba(0, 0, 0, 0.3);
  }

  .master {
  }

  .file-controls {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 1rem;
  }

  button {
    padding: 0.5rem 1rem;
    font-size: 1rem;
    border: 1px solid #444;
    border-radius: 4px;
    background: #333;
    color: #eee;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #444;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
