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
        speed = -4
        break
      case "fwd":
        reset()
        btns.fwd.pressed = true
        // shuttle(true, 4)
        speed = 4
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
  <div class="casette">
    <div class="casette_1">
      <div class="casette_2">
        <div class="inset">
          <div class="shadow"></div>
          <div class="rotaters">
            <div class="rotater rot1" class:paused={speed == 0}></div>
            <div class="rotater rot2" class:paused={speed == 0}></div>
          </div>
        </div>
      </div>
    </div>
  </div>
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
  }
  .controlBtns {
    /*  */
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
    /* flex: 1; */
    height: 100%;
    /* div {
      flex: 1; */
    /* } */
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
  .casette_1 {
  }

  .casette_2 {
    background-color: #212124;
    /* padding: 40px; */
    border-radius: 4px;
    /* margin-left: 100px; */
    width: 85%;
    margin: 100px auto;
    padding: 10px 0;
    position: relative;
    /* display: flex; */
    /* align-items: center; */

    &:before {
      position: absolute;
      content: " ";
      display: block;
      width: 100%;
      height: 100%;
      left: 0;
      top: 0;
      background: linear-gradient(-45deg, #000000 60%, #ffffff 61%);
      z-index: 100;
      opacity: 0.1;
      mix-blend-mode: screen;
      border-radius: 5px;
    }
  }

  .casette {
    height: 300px;
    width: 100%;
    border: 4px solid #131313;
    border-radius: 4px;
    margin-bottom: 10px;

    .inset {
      background: url("/tape.jpg");
      background-size: 125%;
      background-position: -45px -115px;
      border-radius: 10px;
      width: 340px;
      height: 60px;
      position: relative;
      margin: 0 auto;
    }

    .rotaters {
      display: flex;
      gap: 50px;
      overflow: hidden;
      height: 60px;
    }
    .shadow {
      position: absolute;
      width: 100%;
      height: 100%;
      box-shadow:
        inset 1px 1px 0px 0px rgb(0 0 0),
        inset 40px 20px 20px rgb(0 0 0 / 95%),
        inset -5px -10px 10px rgb(0 0 0 / 25%),
        inset -1px -1px 1px 0px rgba(255, 255, 255, 0.25);
      border: 1px solid #171718;
      z-index: 1;
      border-radius: 5px;
    }

    .rotater {
      background-color: red;
      width: 120px;
      height: 120px;
      display: none;

      background: url("/rotator.png");
      background-size: contain;
      background-repeat: no-repeat;
      /* filter: blur(2px); */
    }
    .rot1 {
      animation: spin 4s linear infinite;
    }
    .rot2 {
      animation: spin 12s linear infinite;
    }
    .paused {
      animation-play-state: paused !important;
    }
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
