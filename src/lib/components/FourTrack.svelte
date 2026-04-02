<script lang="ts">
  import { AudioEngine } from "$lib/audio/engine.svelte.js"
  import type { HiddenTrackConfig, LoadStatus } from "$lib/types.js"
  import casetteHissUrl from "../assets/casette_hiss.mp3"
  import noiseImg from "../assets/noise_50.jpg"
  import logoImg from "../assets/logo.svg?url"
  import openstudioImg from "../assets/openstudio.svg?url"
  import { onMount } from "svelte"
  import Knob from "$lib/components/els/Knob.svelte"
  import Light from "$lib/components/els/Light.svelte"
  import Lights from "$lib/components/els/Lights.svelte"
  import Slider from "$lib/components/els/Slider.svelte"
  import SlideSelect from "$lib/components/els/SlideSelect.svelte"
  import Timestamp from "$lib/components/els/Timestamp.svelte"
  import Cassette from "$lib/components/Cassette.svelte"
  import TransportButtons from "$lib/components/TransportButtons.svelte"

  let {
    hiddenTracks = [{ url: casetteHissUrl, volume: 0.08 }],
    onready,
    save = $bindable(),
    load = $bindable(),
    initialProject,
    status = $bindable<LoadStatus>("idle"),
    loadProgress = $bindable(0),
  }: {
    hiddenTracks?: HiddenTrackConfig[]
    onready?: (detail: { engine: AudioEngine }) => void
    save?: () => Blob
    load?: (source: File | string) => Promise<void>
    initialProject?: string | File
    status?: LoadStatus
    loadProgress?: number
  } = $props()

  let engine: AudioEngine | null = $state(null)
  let selectedTrack = $state(0)
  let speed = $state(0)
  let recordEngaged = $state(false)
  let resetTransport: (() => void) | undefined = $state()

  async function fetchWithProgress(url: string): Promise<File> {
    const response = await fetch(url)
    const contentLength = response.headers.get("Content-Length")

    if (!contentLength || !response.body) {
      const buffer = await response.arrayBuffer()
      loadProgress = 1
      return new File([buffer], "project.4trk")
    }

    const total = parseInt(contentLength, 10)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      loadProgress = received / total
    }

    const buffer = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.length
    }

    return new File([buffer], "project.4trk")
  }

  onMount(async () => {
    engine = new AudioEngine({ hiddenTracks })
    engine.initAudioContext()

    save = () => engine!.exportProject()
    load = async (source: File | string) => {
      status = "loading"
      loadProgress = 0
      try {
        const file =
          typeof source === "string" ? await fetchWithProgress(source) : source
        await engine!.importProject(file)
        resetTransport?.()
        status = "ready"
      } catch (e) {
        status = "error"
        throw e
      }
    }

    if (initialProject) {
      await load(initialProject)
    } else {
      status = "ready"
    }

    onready?.({ engine })
    return () => engine?.dispose()
  })
</script>

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

  <div
    class="fourtrack"
    style:--bg-noise="url({noiseImg})"
    style:--bg-logo="url({logoImg})"
    style:--bg-openstudio="url({openstudioImg})"
  >
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
          <div class="cell-center" style="grid-area: 8 / 3 / 9 / 5">
            <span class="output ui-label">└── Output ──┘</span>
          </div>

          <div class="cell-center" style="grid-area: 1 / 5 / 9 / 6">
            <div class="separator"></div>
          </div>

          <div class="cell-center" style="grid-area: 5 / 6 / 7 / 7">
            <SlideSelect bind:value={selectedTrack} disabled={recordEngaged} />
          </div>

          <div
            class="ui-label cell-right"
            style="grid-area: 7 / 6 / 8 / 7; text-align: right"
          >
            Track
          </div>

          <div class="cell-center" style="grid-area: 2 / 6 / 3 / 8">
            <div class="mic-status">
              <div class="ui-label">mic status XXX22</div>
              <div
                class="mic-status-light"
                title="Microphone status: {engine.micStatus}"
              >
                <Light
                  color={engine.micStatus === "prompt" ||
                  engine.micStatus === "active"
                    ? "green"
                    : "red"}
                  active={engine.micStatus === "active"}
                  pulsing={engine.micStatus === "no-device"
                    ? "fast"
                    : engine.micStatus === "inactive" ||
                        engine.micStatus === "active"
                      ? false
                      : "slow"}
                />
              </div>
            </div>
          </div>

          <!-- Input Controls -->
          <div class="cell-center" style="grid-area: 3 / 6 / 4 / 8">
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

          <div class="cell-center" style="grid-area: 4 / 7 / 7 / 8">
            <Slider
              min={0}
              max={1.5}
              bind:value={engine.recordingVolume}
              onchange={(vol) => engine.setRecordingVolume(vol)}
            />
          </div>

          <div class="ui-label cell-center" style="grid-area: 7 / 7 / 8 / 8">
            Volume
          </div>

          <div class="ui-label cell-center" style="grid-area: 8 / 6 / 9 / 8">
            └─ Input ─┘
          </div>

          <div class="cell-center" style="grid-area: 1 / 8 / 9 / 9">
            <div class="separator"></div>
          </div>

          <div class="cell-center" style="grid-area: 2 / 9 / 3 / 10">
            <div class="mic-status">
              <div class="ui-label">power</div>
              <div class="mic-status-light" title="Cassette status: xx">
                <Light color="green" active={true} pulsing={false} />
              </div>
            </div>
          </div>

          <div class="cell-timestamp" style="grid-area: 2 / 10 / 3 / 11">
            <Timestamp timestamp={engine.position} />
          </div>

          <div class="logos" style="grid-area: 2 / 11 / 3 / 12">
            <div class="logo"></div>
            <div class="logo-tag"></div>
          </div>

          <div style="grid-area: 3 / 9 / 6 / 13">
            <Cassette
              {speed}
              time={engine.position}
              max={engine.duration || 180}
              onchange={(ts) => engine.seek(ts)}
              isRecording={engine.playState === "recording"}
            />
          </div>

          <div class="cell-bottom" style="grid-area: 6 / 9 / 9 / 12">
            <TransportButtons
              {engine}
              {selectedTrack}
              bind:speed
              bind:recordEngaged
              bind:resetTransport
            />
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Scoped utility classes */
  .fourtrack :global(.cell-center) {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .fourtrack :global(.cell-bottom) {
    display: flex;
    align-items: end;
    justify-content: center;
  }

  .fourtrack :global(.cell-right) {
    display: flex;
    align-items: center;
    justify-content: right;
  }

  .fourtrack :global(.ui-label) {
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    font-size: 1.8cqh;
    font-family: sans-serif;
  }

  .fourtrack {
    container-type: size;
    aspect-ratio: 1 / 0.6;
    width: 100%;
    /* max-height: 75dvh; */
    /* max-width: min(90vw, calc(75dvh / 0.6)); */
    user-select: none;

    @media (max-width: 1024px) {
      max-height: 90dvh;
      /* max-width: min(95vw, calc(90dvh / 0.6)); */
    }
  }

  .separator {
    height: 100%;
    width: 0.45cqw;
    border-radius: 0 0 0.15cqw 0.15cqw;
    box-shadow:
      inset 2px 2px 1px rgb(19 18 18 / 75%),
      inset 1px 1px 1px rgba(31, 31, 31, 0.45),
      inset -1px -1px 1px rgba(255, 252, 252, 0.35);
  }

  .parent {
    display: grid;
    grid-template-columns: 4cqw 4cqw 10cqw 10cqw 4cqw 4cqw 8cqw 5cqw 10cqw 1fr 1fr 4cqw;
    grid-template-rows: 3cqw 9cqw 1fr 1fr 1fr 1fr 2.4cqw 2.4cqw 4.8cqw;
    grid-column-gap: 0px;
    grid-row-gap: 0px;
    height: 100%;
  }

  .frame {
    background: linear-gradient(to bottom, #616161, #3b3b3b);
    padding: 1px;
    border-radius: 1cqw 1cqw 2.5cqw 2.5cqw;
    height: 100%;

    box-shadow: 30px 20px 30px 0px rgb(33 34 36 / 31%);
    position: relative;
    &:before {
      position: absolute;
      content: " ";
      width: 96%;
      height: 0.5cqw;
      margin: 0 2%;
      background: linear-gradient(to right, #6f7074, #505252);
      top: -0.5cqw;
      border-radius: 10cqw 10cqw 0 0;
      box-shadow: inset 0cqw 0.3cqh 0.2cqw rgb(225 225 225 / 40%);
      border: 1px solid #686868;
    }
  }

  .app {
    background: radial-gradient(ellipse at top left, #686b71, #383840);
    border-radius: 1cqw 1cqw 3cqw 3cqw;
    height: 100cqh;
    box-shadow:
      inset 0.2cqw 0.5cqh 0.4cqw rgb(225 225 225 / 50%),
      inset -0.2cqw -1.5cqh 0.2cqw rgb(0 0 0 / 26.6%);

    position: relative;
  }

  .app:before {
    content: " ";
    width: 100%;
    height: 100%;
    display: block;
    background: var(--bg-noise);
    background-size: 50px;
    mix-blend-mode: multiply;
    position: absolute;
    opacity: 0.9;
    border-radius: 10px 10px 36px 36px;
  }

  .logos {
    display: flex;
    flex-direction: column;
    gap: 5cqh;
  }
  .logo {
    background: var(--bg-logo);
    background-repeat: no-repeat;
    background-size: contain;
    background-position: top right;
    width: 100%;
    height: 2.75cqh;
  }

  .logo-tag {
    background: var(--bg-openstudio);
    background-repeat: no-repeat;
    background-size: contain;
    background-position: top right;
    width: 100%;
    height: 2.75cqh;
    opacity: 0.6;
  }

  .mic-status {
    text-align: center;
    cursor: help;
    transform: translateY(-2cqh);
    .ui-label {
      margin-bottom: 2cqh;
    }
    .mic-status-light {
      display: flex;
      justify-content: center;
    }
  }

  .cell-timestamp {
    padding-top: 3cqh;
    padding-left: 2cqw;
  }
</style>
