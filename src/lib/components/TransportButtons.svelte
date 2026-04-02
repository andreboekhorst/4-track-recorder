<script lang="ts">
  import type { AudioEngine } from "$lib"
  import Light from "$lib/components/els/Light.svelte"
  import { playFx, playLoop, stopLoop } from "$lib/fx/soundfx"
  import btnNormalImg from '../assets/btn_normal.png'
  import btnPressedImg from '../assets/btn_pressed.png'
  import { btnRecSvg, btnPlaySvg, btnPauseSvg, btnRewSvg, btnFwdSvg, btnStopSvg } from '../assets/svg-icons.js'

  const btnIcons: Record<string, string> = {
    record: btnRecSvg,
    play: btnPlaySvg,
    pause: btnPauseSvg,
    rew: btnRewSvg,
    ffwd: btnFwdSvg,
    stop: btnStopSvg,
  }

  let {
    engine,
    selectedTrack,
    speed = $bindable(0),
    recordEngaged = $bindable(false),
    resetTransport = $bindable<() => void>(),
  }: {
    engine: AudioEngine
    selectedTrack: number
    speed: number
    recordEngaged: boolean
    resetTransport?: () => void
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

    // Trigger stop when rewinding and reaching the end
    if (speed < 0 && engine.position + speed / 50 <= 0) {
      clicky("stop")
    }
    if (engine.position + speed / 50 > engine.duration) {
      clicky("stop")
    }

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

  resetTransport = reset

  function clicky(btnType: string) {
    switch (btnType) {
      case "play":
        if (btns.play.pressed) return
        playFx("play")
        if (btns.ffwd.pressed || btns.rew.pressed) {
          stopLoop("ffwd")
          playFx("stop")
        }
        reset()
        btns.play.pressed = true
        if (!isPaused) engine.play()
        break
      case "stop":
        reset()
        playFx("stop")
        stopLoop("ffwd")

        break
      case "pause":
        isPaused = !isPaused
        btns.pause.pressed = isPaused
        if (isPaused) {
          playFx("pause")

          engine.stop()
          if (btns.record.pressed) {
            engine.startMonitoring(selectedTrack)
          }
        } else {
          playFx("pause")

          if (btns.record.pressed) {
            engine.record(selectedTrack)
          } else if (btns.play.pressed) {
            engine.play()
          }
        }
        break
      case "record":
        if (btns.record.pressed) return
        playFx("record")
        if (btns.ffwd.pressed || btns.rew.pressed) {
          stopLoop("ffwd")
          playFx("stop")
        }
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
        if (btns.play.pressed || btns.ffwd.pressed) {
          playFx("stop")
        }
        reset()
        if (engine.position != 0) {
          playLoop("ffwd")
          btns.rew.pressed = true
          speed = -8
        }
        break
      case "ffwd":
        if (btns.play.pressed || btns.rew.pressed) {
          playFx("stop")
        }
        reset()
        playLoop("ffwd")
        btns.ffwd.pressed = true
        speed = 8
        break
    }
  }
</script>

<div class="ctrlButtons" style:--btn-normal="url({btnNormalImg})" style:--btn-pressed="url({btnPressedImg})">
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
          style:--btn-icon="url('{btnIcons[type]}')"
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
    background-image: var(--btn-normal);
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
      background-image: var(--btn-icon);
      background-size: contain;
      background-position: center;
      mix-blend-mode: overlay;
      background-repeat: no-repeat;
    }
  }
  .btn.active,
  .btn:active {
    background-image: var(--btn-pressed);
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
