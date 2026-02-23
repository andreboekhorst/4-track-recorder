<script lang="ts">
  import { AudioEngine } from "$lib"
  import { onMount } from "svelte"
  import InputControls from "$lib/components/InputControls.svelte"
  import Transport from "$lib/components/Transport.svelte"
  import Mixer from "$lib/components/Mixer.svelte"

  let engine: AudioEngine | null = $state(null)
  let selectedTrack = $state(0)
  let fileInput = $state<HTMLInputElement>(undefined!)

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
  <div class="frame">
    <div class="app">
      <div class="section"><Mixer {engine} /></div>
      <div class="divider">&nbsp;</div>
      <div class="section input">
        <InputControls {engine} bind:selectedTrack />
      </div>
      <div class="divider">&nbsp;</div>
      <div class="section"><Transport {engine} {selectedTrack} /></div>
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
  .frame {
    background: linear-gradient(to bottom, #616161, #3b3b3b);
    padding: 4px;
    border-radius: 20px 20px 40px 40px;
  }
  .app {
    background: linear-gradient(to bottom, #898989, #464646);
    border-radius: 20px 20px 36px 36px;
    display: flex;

    &:before {
      content: " ";
      display: block;
      width: 100%;
      height: 8px;
      background: rgba(255, 255, 255, 0.5);
      filter: blur(4px);
      position: absolute;
    }
  }

  .section {
    flex-direction: column;
    flex: 1;
    padding: 40px;

    &.input {
      flex: 0.1;
    }
  }

  .divider {
    align-self: stretch;
    /* flex: 1; */
    flex-direction: column;

    background: rgba(46, 46, 46, 0.5);
    border-right: 2px solid rgba(0, 0, 0, 0.7);
    border-right: 1px solid rgba(210, 210, 210, 0.4);
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
