<script lang="ts">
  import type { AudioEngine } from "$lib"
  import Button from "./els/recorder/Button.svelte"
  import Cassette from "./Cassette.svelte"
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
  let speed = $state(0)

  $effect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    if (speed != 0) {
      timer = setInterval(() => {
        var newpos = Math.max(0, engine.position + speed / 50)
        newpos = Math.min(newpos, engine.duration)
        engine.seek(newpos)
      }, 10)
    }

    return () => {
      // cleanup: runs before re-run AND on destroy
      clearInterval(timer)
    }
  })

  // onDestroy(() => {
  //   clearInterval(timer)
  // })

  // function shuttle(on: boolean, speed: number = 1) {
  //   if (on) {
  //     clearInterval(timer)
  //     timer = setInterval(() => {
  //       var newpos = Math.max(0, engine.position + speed / 50)
  //       newpos = Math.min(newpos, engine.duration)
  //       engine.seek(newpos)
  //     }, 10) //Update every 10ms instead of each ms
  //   } else {
  //     clearInterval(timer)
  //     engine.stop()
  //   }
  // }

  function reset() {
    // Stop Rew/Fwd
    // shuttle(false)
    engine.stop()
    speed = 0

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
        // shuttle(true, -4)
        speed = -8
        break
      case "fwd":
        reset()
        btns.fwd.pressed = true
        // shuttle(true, 4)
        speed = 8
        break
    }
  }
</script>

<div style="grid-area: 1 / 8 / 2 / 9">
  <Timestamp timestamp={engine.position} />
</div>

<div style="grid-area: 2 / 8 / 5 / 9">
  <Cassette
    {speed}
    time={engine.position}
    max={engine.duration || 180}
    onchange={(ts) => engine.seek(ts)}
    isRecording={engine.playState === "recording"}
  />
</div>

<div style="grid-area: 5 / 8 / 7 / 9">
  <div class="ctrlButtons">
    <div class="btnLabels">
      {#each Object.entries(btns) as [type, btn]}
        <div class="btnLabel ui-label">{type}</div>
      {/each}
    </div>
    <div class="controlBtns">
      <div class="imgBtns">
        {#each Object.entries(btns) as [type, btn]}
          <button
            type="button"
            class="btn {type}"
            class:active={btn.pressed}
            onmousedown={() => clicky(type)}
          >
          </button>
        {/each}
      </div>
      <div class="after">&nbsp;</div>
    </div>
  </div>
</div>

<style>
  .ctrlButtons {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 100px;
  }
  .controlBtns {
    background: linear-gradient(to bottom right, #3d3c43, #646468);
    width: 440px;
    height: 120px;
    border-radius: 4px;
    box-shadow:
      inset 2px 2px 6px rgba(0, 0, 0, 0.6),
      inset -1px -1px 2px rgba(255, 255, 255, 0.5);
    display: flex;
    flex-direction: column;
    padding-top: 1px;
    padding-right: 2px;
    perspective: 800px;
  }
  .imgBtns {
    padding: 3px;
    border-radius: 2px;
    background-color: #212121;
  }
  .btnLabels {
    display: flex;
    width: 436px;
    div {
      flex: 1;
      text-align: center;
      padding-bottom: 6px;
    }
  }
  .btn {
    appearance: none;
    border: none;
    padding: 0;
    cursor: pointer;
    background-color: transparent;
    background-image: url("/btn_normal.png");
    background-size: cover;
    background-position: center;
    width: 70px;
    height: 87px;
    margin-right: 2px;
    box-shadow: 15px 15px 22px rgba(0, 0, 0, 0.6);
    position: relative;

    &:before {
      display: block;
      content: " ";
      position: absolute;
      top: 16px;
      width: 100%;
      height: 15px;
      background-size: contain;
      background-position: center;
      mix-blend-mode: overlay;
      background-repeat: no-repeat;
    }
    &.rec:before {
      background-image: url("/btn_rec.svg");
    }
    &.play:before {
      background-image: url("/btn_play.svg");
    }
    &.pause:before {
      background-image: url("/btn_pause.svg");
    }
    &.rew:before {
      background-image: url("/btn_rew.svg");
    }
    &.fwd:before {
      background-image: url("/btn_fwd.svg");
    }
    &.stop:before {
      background-image: url("/btn_stop.svg");
    }
  }
  .btn.active,
  .btn:active {
    background-image: url("/btn_pressed.png");
    box-shadow:
      inset 5px 0px 15px rgba(0, 0, 0, 0.4),
      10px 10px 20px rgba(0, 0, 0, 0.6);

    &:before {
      top: 27px;
      transform: rotateX(32deg);
    }
  }
  .btn.active + .btn.active {
    box-shadow: 10px 10px 20px rgba(0, 0, 0, 0.6);
  }
  .top {
    height: 22cqh;
  }

  .transport {
    display: flex;
    flex-direction: column;
    height: 100%;
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
