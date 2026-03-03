<script lang="ts">
  import type { AudioEngine } from "$lib"

  let {
    engine,
    selectedTrack,
    speed = $bindable(0),
  }: { engine: AudioEngine; selectedTrack: number; speed: number } = $props()

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
    speed = 0

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
        engine.stop()
        if (!isPaused) engine.record(selectedTrack)
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
    <div class="light-bevel">
      <div class="light high" class:active={btns.record.pressed}>&nbsp;</div>
    </div>
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
    height: 20px;
    width: 45px;
    left: -10px;
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

  .light-bevel {
    background: linear-gradient(to bottom, #101010, #6b6b6b);
    top: 2px;
    left: 2px;
    height: 18px;
    width: 18px;
    margin-bottom: 12px;
    border-radius: 15px;
    position: relative;
  }

  .light {
    position: absolute;
    width: 16px;
    height: 16px;
    top: 1px;
    left: 1px;
    border-radius: 16px;
    background: #8f3333;
    box-shadow: inset 1px -1px 4px 3px rgba(62, 2, 2, 0.7);

    &.active {
      background: #ff0000;
      box-shadow:
        inset 0px 0px 6px rgba(32, 1, 1, 0.9),
        0px 0px 16px 16px rgba(209, 24, 24, 0.1);
    }
  }

  .ctrlButtons {
    display: flex;
    flex-direction: column;
    align-items: center;
    container-type: inline-size;
    flex: 1; /* if parent container is flex */
    padding: 0 0 0 2cqw;
    position: relative;
  }
  .controlBtns {
    background: linear-gradient(to bottom right, #3d3c43, #646468);
    width: 100%;
    border-radius: 0.9cqw;
    box-shadow:
      inset 0.45cqw 0.45cqw 1.4cqw rgba(0, 0, 0, 0.6),
      inset -0.23cqw -0.23cqw 0.45cqw rgba(255, 255, 255, 0.5);
    display: flex;
    flex-direction: column;
    padding-top: 0.23cqw;
    padding-right: 0.45cqw;
    perspective: 182cqw;
  }
  .imgBtns {
    padding: 0.7cqw;
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
      padding-bottom: 1.4cqw;
    }
    .record {
      color: rgb(200, 60, 35);
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
    margin-right: 0.45cqw;
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
