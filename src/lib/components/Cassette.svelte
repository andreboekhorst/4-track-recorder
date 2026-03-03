<script lang="ts">
  let { speed, time, max, onchange, isRecording } = $props()
  let containerEl = $state()
  let dragging = $state(false)
  let startPos = $state()
  let _dragPercentage = $state(0)
  let xPos = $state()

  // should be disabled whern ffwding...

  function startDrag(e) {
    dragging = true
    _dragPercentage = 0
    xPos = e.clientX
    startPos = time
    // needed to keep tracking pointermove, even if it is outside
    e.target.setPointerCapture(e.pointerId)
  }

  const drag = (e) => {
    // trigggered continously
    if (!dragging) return
    if (isRecording) return
    if (speed > 1 || speed < 0) return //disable when ffwd

    const rect = containerEl.getBoundingClientRect()
    const xMove = e.clientX - xPos // it should be the difference from where it initially started.

    // never drag more than 1, altought we later also need to
    let _dragPercentage = xMove / rect.width / 16

    let _time = Math.max(0, Math.min(startPos + _dragPercentage * max, max))
    onchange?.(_time)
  }

  const stopDrag = (e) => {
    dragging = false
    e.target.releasePointerCapture?.(e.pointerId)
  }
</script>

<div class="casette">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="window"
    onpointerdown={startDrag}
    onpointermove={drag}
    onpointerup={stopDrag}
    onpointerleave={stopDrag}
    bind:this={containerEl}
  >
    <div class="window_inset">
      <div class="shadow"></div>
      <div class="rotaters">
        <div
          class="rotater rot1"
          style:transform={"rotate(" + (time * 270) / 10 + "deg)"}
        ></div>
        <div
          class="rotater rot2"
          style:transform={"rotate(" + (time * 180) / 10 + "deg)"}
        ></div>
      </div>
    </div>
  </div>
</div>

<style>
  .casette {
    height: 95%;
    container-type: size;
    border-top: 0.8cqh solid #1a1a1b;
    border-left: 0.3cqw solid #1a1a1b;
    border-bottom: 0.8cqh solid #1a1a1b;
    border-radius: 0.8cqw 0 0 0.8cqw;
    box-shadow: inset 0.15cqw 0.15cqw 0 0 rgb(136 132 132);
    background: radial-gradient(ellipse at top left, #5d6066, #383840);
  }

  .window {
    background-color: #212124;
    border-radius: 1cqw;
    width: 85%;
    margin: 36cqh 10cqw 20cqh 5cqw;
    padding: 1.5cqw 8cqw;
    position: relative;
    cursor: ew-resize;
    box-shadow:
      inset 0.2cqw 0.2cqw 0.2cqw 0 rgba(0, 0, 0, 0.5),
      inset -0.1cqw -0.1cqw 0.2cqw 0 rgba(255, 255, 255, 0.5);
    &:active {
      cursor: col-resize;
    }

    .window_inset {
      background: url("/cassette.jpg");
      background-size: 109%;
      background-position: -5cqh -15cqw;
      border-radius: 2.5cqw;
      width: 100%;
      aspect-ratio: 5.7 / 1;
      position: relative;
      margin: 0 auto;
    }

    .shadow {
      position: absolute;
      width: 100%;
      height: 100%;
      box-shadow:
        inset 0.25cqw 0.25cqw 0 0 rgb(0 0 0),
        inset 10cqw 5cqw 5cqw rgb(0 0 0 / 95%),
        inset -1.25cqw -2.5cqw 2.5cqw rgb(0 0 0 / 25%),
        inset -0.25cqw -0.25cqw 0.25cqw 0 rgba(255, 255, 255, 0.25);
      border: 0.25cqw solid #171718;
      z-index: 1;
      border-radius: 1.25cqw;
    }

    .rotaters {
      display: flex;
      gap: 16cqw;
      overflow: hidden;
      height: 22cqh;
      justify-content: center;
    }

    .rotater {
      width: 16cqw;
      height: 16cqw;
      background: url("/rotator.png");
      background-size: contain;
      background-repeat: no-repeat;
      margin-top: -2.5cqh;
    }

    &:after {
      position: absolute;
      content: " ";
      display: block;
      width: 100%;
      height: 100%;
      left: 0;
      top: 0;
      background: linear-gradient(-35deg, #000000 70%, #ffffff 71%);
      z-index: 100;
      opacity: 0.05;
      mix-blend-mode: screen;
      border-radius: 1.25cqw;
    }
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
      border-radius: 1.25cqw;
    }
  }
</style>
