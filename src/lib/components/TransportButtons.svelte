<script lang="ts">
  import type { AudioEngine } from "$lib"
  import Light from "$lib/components/els/Light.svelte"

  let {
    engine,
    selectedTrack,
    speed = $bindable(0),
    recordEngaged = $bindable(false),
  }: {
    engine: AudioEngine
    selectedTrack: number
    speed: number
    recordEngaged: boolean
  } = $props()

  let btns = $state({
    record: { pressed: false },
    play: { pressed: false },
    rew: { pressed: false },
    ffwd: { pressed: false },
    stop: { pressed: false },
    pause: { pressed: false },
  })

  let isPaused = $state(false)

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
      clearInterval(timer)
    }
  })

  function reset() {
    engine.stop()
    engine.stopMonitoring()
    speed = 0
    recordEngaged = false

    Object.entries(btns).forEach(([type, btn]) => {
      if (type == "pause") return
      btn.pressed = false
    })
  }

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
          if (btns.record.pressed) {
            engine.startMonitoring(selectedTrack)
          }
        } else {
          if (btns.record.pressed) {
            engine.record(selectedTrack)
          } else if (btns.play.pressed) {
            engine.play()
          }
        }
        break
      case "record":
        reset()
        btns.record.pressed = true
        btns.play.pressed = true
        recordEngaged = true
        if (isPaused) {
          engine.startMonitoring(selectedTrack)
        } else {
          engine.record(selectedTrack)
        }
        break
      case "rew":
        reset()
        btns.rew.pressed = true
        speed = -8
        break
      case "ffwd":
        reset()
        btns.ffwd.pressed = true
        speed = 8
        break
    }
  }
</script>

<div class="ctrlButtons">
  <div class="rec-light">
    <Light
      color="red"
      active={btns.record.pressed}
      pulsing={btns.record.pressed && isPaused ? "slow" : false}
    />
  </div>
  <div class="btnLabels">
    {#each Object.entries(btns) as [type, btn]}
      <div class="btnLabel ui-label {type}">{type}</div>
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

<style>
  .rec-light {
    position: absolute;
    height: 3cqw;
    width: 3cqw;
    left: -0.5cqw;
    &.active {
      opacity: 1;
    }
    /* &:before {
      display: block;
      content: " ";
      border-top: 2px solid white;
      width: 10px;
    } */
  }

  .ctrlButtons {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* container-type: size; */
    flex: 1; /* if parent container is flex */
    padding: 0 0 0 2cqw;
    position: relative;
  }
  .controlBtns {
    background: linear-gradient(to bottom right, #3d3c43, #646468);
    width: 100%;
    border-radius: 0.5cqw;
    box-shadow:
      inset 0.45cqw 0.45cqw 1.4cqw rgba(0, 0, 0, 0.6),
      inset -0.01cqw -0.1cqw 0.1cqw rgba(255, 255, 255, 0.5);
    display: flex;
    flex-direction: column;
    padding-top: 0.23cqw;
    padding-left: 0.15cqw;
    padding-right: 0.15cqw;
    perspective: 182cqw;
  }
  .imgBtns {
    padding: 0.1cqw;
    border-radius: 0.45cqw;
    background-color: #212121;
    display: flex;
  }
  .btnLabels {
    display: flex;
    width: 99%;
    div {
      flex: 1;
      text-align: center;
      padding-bottom: 0.5cqw;
    }
    .record {
      color: rgb(200, 60, 35);
      text-shadow: 0px 0px 2px #0000007d;
      transform: translateX(-0.8cqw);
      &:before {
        content: "─ ";
        color: white;
        opacity: 0.4;
      }
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
    flex: 1;
    aspect-ratio: 70 / 87;
    margin-right: 0.2cqw;
    box-shadow: 3.4cqw 3.4cqw 5cqw rgba(0, 0, 0, 0.6);
    position: relative;

    &:before {
      display: block;
      content: " ";
      position: absolute;
      top: 18%;
      width: 100%;
      height: 17%;
      background-size: contain;
      background-position: center;
      mix-blend-mode: overlay;
      background-repeat: no-repeat;
    }
    &.record:before {
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
    &.ffwd:before {
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
      inset 1.1cqw 0 3.4cqw rgba(0, 0, 0, 0.4),
      2.3cqw 2.3cqw 4.5cqw rgba(0, 0, 0, 0.6);

    &:before {
      top: 31%;
      transform: rotateX(32deg);
    }
  }
  .btn.active + .btn.active {
    box-shadow: 2.3cqw 2.3cqw 4.5cqw rgba(0, 0, 0, 0.6);
  }
  .after {
    height: 5cqh;
  }
</style>
