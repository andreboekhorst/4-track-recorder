<script lang="ts">
  import type { AudioEngine } from "$lib"
  import Button from "./els/recorder/Button.svelte"
  import Timestamp from "./els/Timestamp.svelte"
  import { onDestroy } from "svelte"

  let {
    engine,
    selectedTrack,
  }: { engine: AudioEngine; selectedTrack: number } = $props()

  let btns = $state({
    rec: { pressed: false },
    play: { pressed: false },
    rew: { pressed: false },
    fwd: { pressed: false },
    stop: { pressed: false },
    pause: { pressed: false },
  })

  let isPaused = $state(false)

  let timer: ReturnType<typeof setInterval> | undefined

  onDestroy(() => {
    clearInterval(timer)
  })

  function shuttle(on: boolean, speed: number = 1) {
    if (on) {
      clearInterval(timer)
      timer = setInterval(() => {
        var newpos = Math.max(0, engine.position + speed / 50)
        newpos = Math.min(newpos, engine.duration)
        engine.seek(newpos)
      }, 10) //Update every 10ms instead of each ms
    } else {
      clearInterval(timer)
      engine.stop()
    }
  }

  function reset() {
    // Stop Rew/Fwd
    shuttle(false)

    Object.entries(btns).forEach(([type, btn]) => {
      if (type == "pause") return // Pause has a mind of it's own
      btn.pressed = false
    })
  }

  // TODO: When we have pressed record, but it's on pause. we might still needt
  // to enable the monitor...
  function clicky(btnType: string) {
    switch (btnType) {
      case "play":
        reset()
        btns.play.pressed = true
        if (!isPaused) engine.play()
        break
      case "stop":
        reset()
        break
      case "pause":
        isPaused = !isPaused
        btns.pause.pressed = isPaused
        if (isPaused) {
          engine.stop()
        } else {
          if (btns.rec.pressed) {
            // How do we deal with switching tracks in the middle of a recording?
            engine.record(selectedTrack)
          } else if (btns.play.pressed) {
            engine.play()
          }
        }
        break
      case "rec":
        reset()
        btns.rec.pressed = true
        btns.play.pressed = true
        engine.stop()
        if (!isPaused) engine.record(selectedTrack)
        break
      case "rew":
        reset()
        btns.rew.pressed = true
        shuttle(true, -4)
        break
      case "fwd":
        reset()
        btns.fwd.pressed = true
        shuttle(true, 4)
        break
    }
  }
</script>

<div class="transport">
  <div class="top">
    <Timestamp timestamp={engine.position} />
  </div>
  <div>
    <input
      type="range"
      class="time-slider"
      min="0"
      max={engine.duration || 180}
      step="0.1"
      value={engine.position}
      oninput={(e) => engine.seek(Number(e.currentTarget.value))}
      disabled={engine.playState === "recording" || !engine.hasContent}
    />
  </div>
  <div class="controls">
    {#each Object.entries(btns) as [type, btn]}
      <Button {type} pressed={btn.pressed} onClick={() => clicky(type)} />
    {/each}
  </div>
</div>

<style>
  .top {
    height: 22cqh;
  }

  .transport {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    div {
      flex: 1;
    }
  }

  .time {
    font-size: 2rem;
    margin-bottom: 0.25rem;
    font-variant-numeric: tabular-nums;
  }

  .time-slider {
    display: block;
    width: 80%;
    margin: 0 auto 1rem;
    accent-color: #f90;
  }

  .controls {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    flex-wrap: wrap;
  }
</style>
