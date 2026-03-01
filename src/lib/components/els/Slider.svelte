<!-- svelte-ignore a11y_role_has_required_aria_props -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<script>
  let { value = $bindable(0), btnHeight = 0.35, padding = 1 } = $props() // value: 0–100, btnHeight: fraction of track, padding: % inset top/bottom
  let dragging = $state(false)
  let trackEl = $state()
  let startY = $state(0)
  let startValue = $state(0)

  let topPercent = $derived(
    padding + (value / 100) * (1 - btnHeight - (2 * padding) / 100) * 100,
  )

  const start = (event) => {
    dragging = true
    startY = event.clientY
    startValue = value
    trackEl.setPointerCapture(event.pointerId)
  }

  const move = (event) => {
    if (!dragging) return
    const rect = trackEl.getBoundingClientRect()
    const deltaY = event.clientY - startY
    const scrollHeight = rect.height * (1 - btnHeight)
    const deltaPercent = (deltaY / scrollHeight) * 100
    value = Math.round(Math.max(0, Math.min(startValue + deltaPercent, 100)))
  }

  const stop = (event) => {
    dragging = false
    trackEl.releasePointerCapture?.(event.pointerId)
  }
</script>

<div class="slider-holder">
  <div
    class="slider-indicator"
    style="height: {(1 - btnHeight) * 100}%; top: {(btnHeight / 2) * 100}%"
  ></div>
  <div
    bind:this={trackEl}
    class="track"
    onpointermove={move}
    onpointerup={stop}
    onpointerleave={stop}
    role="slider"
  >
    <div
      class="thumb"
      class:dragging
      onpointerdown={start}
      style="top: {topPercent}%; height: {btnHeight * 100}%"
    ></div>
    <div
      class="slot"
      style="height: {(1 - btnHeight) * 100}%; top: {(btnHeight / 2) * 100}%"
    ></div>
  </div>
</div>

<style>
  .slider-holder {
    height: 100%;
    display: flex;
  }

  .slider-indicator {
    position: relative;
    background: url("/slider-indicator.svg");
    background-repeat: no-repeat;
    background-size: contain;
    width: 36px;
    height: 100%;
    background-position: center;
    opacity: 0.7;
  }

  .track {
    width: 30px;
    height: 100%;
    position: relative;
    border-radius: 5px;
    box-shadow:
      inset 6px 12px 10px rgba(31, 31, 31, 0.75),
      inset 1px 1px 1px rgba(31, 31, 31, 0.45),
      inset -1px -1px 1px rgba(255, 252, 252, 0.35);

    .slot {
      display: block;
      content: " ";
      width: 50%;
      background-color: rgb(28, 28, 29);
      border-radius: 2px;
      position: absolute;
      margin: 0 auto;
      left: 50%;
      top: 50%;
      transform: translate(-50%);
    }
  }

  .thumb {
    width: 80%;
    margin: 0 10%;
    background: url("/slider.png");
    background-size: 100% 100%;
    position: absolute;
    top: 0%;
    left: 0px;
    cursor: grab;
    z-index: 1;
    border-radius: 7px;
    box-shadow: 10px 5px 5px rgba(0, 0, 0, 0.4);
  }
  .thumb.dragging {
    cursor: grabbing;
  }
</style>
