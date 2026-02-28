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
    let _dragPercentage = xMove / rect.width / 8

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
    height: 100%;
    container-type: inline-size;
    border: 0.75cqw solid #1c1c1f;
    border-radius: 1cqw;
    box-shadow: inset 0.25cqw 0.25cqw 0 0 rgb(136 132 132);
  }

  .window {
    background-color: #212124;
    border-radius: 1cqw;
    width: 85%;
    margin: 25cqw auto;
    padding: 2.5cqw 0;
    position: relative;
    cursor: ew-resize;

    &:active {
      cursor: col-resize;
    }

    .window_inset {
      background: url("/tape.jpg");
      background-size: 125%;
      background-position: -10cqw -28.75cqw;
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
      gap: 20cqw;
      overflow: hidden;
      height: 15cqw;
      justify-content: center;
    }

    .rotater {
      width: 20cqw;
      height: 20cqw;
      background: url("/rotator.png");
      background-size: contain;
      background-repeat: no-repeat;
      margin-top: -2.5cqw;
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
