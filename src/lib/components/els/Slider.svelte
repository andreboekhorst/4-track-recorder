<!-- svelte-ignore a11y_role_has_required_aria_props -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<script>
  import sliderIndicatorImg from "../../assets/slider-indicator.svg?url"
  import sliderImg from "../../assets/slider.png"

  let {
    value = $bindable(0),
    min = 0,
    max = 1,
    onchange,
    btnHeight = 0.35,
    padding = 1,
  } = $props()
  let dragging = $state(false)
  let trackEl = $state()
  let startY = $state(0)
  let startNorm = $state(0)

  function normalizeValue(val) {
    return (val - min) / (max - min)
  }
  function denormalizeValue(norm) {
    return min + norm * (max - min)
  }

  // Inverted: top = max, bottom = min (like a real fader)
  let topPercent = $derived(
    padding +
      (1 - normalizeValue(value)) * (1 - btnHeight - (2 * padding) / 100) * 100,
  )

  const start = (event) => {
    dragging = true
    startY = event.clientY
    startNorm = normalizeValue(value)
    trackEl.setPointerCapture(event.pointerId)
  }

  const move = (event) => {
    if (!dragging) return
    const rect = trackEl.getBoundingClientRect()
    const deltaY = event.clientY - startY
    const scrollHeight = rect.height * (1 - btnHeight)
    // Inverted: dragging down decreases value
    const deltaNorm = -(deltaY / scrollHeight)
    const newNorm = Math.max(0, Math.min(startNorm + deltaNorm, 1))
    value = denormalizeValue(newNorm)
    onchange?.(value)
  }

  const stop = (event) => {
    dragging = false
    trackEl.releasePointerCapture?.(event.pointerId)
  }
</script>

<div
  class="slider-holder"
  style:--bg-slider-indicator="url({sliderIndicatorImg})"
  style:--bg-slider="url({sliderImg})"
>
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
    width: 5cqw;
    display: flex;
    container-type: size;
    padding-top: 2cqh;
  }

  .slider-indicator {
    position: relative;
    background: var(--bg-slider-indicator);
    background-repeat: no-repeat;
    background-size: contain;
    width: 55cqw;
    height: 100%;
    background-position: center;
    opacity: 0.7;
  }

  .track {
    width: 45cqw;
    height: 100%;
    position: relative;
    border-radius: 8cqw;
    touch-action: none;
    box-shadow:
      inset 9cqw 2cqh 15cqw rgba(31, 31, 31, 0.75),
      inset 1.5cqw 0.2cqh 1.5cqw rgba(31, 31, 31, 0.45),
      inset -1.5cqw -0.2cqh 1.5cqw rgba(255, 252, 252, 0.35);

    .slot {
      display: block;
      content: " ";
      width: 50%;
      background-color: rgb(28, 28, 29);
      border-radius: 3cqw;
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
    background: var(--bg-slider);
    background-size: 100% 100%;
    position: absolute;
    top: 0%;
    left: 0;
    cursor: grab;
    z-index: 1;
    border-radius: 10cqw;
    touch-action: none
    box-shadow:
      15cqw 1cqh 8cqw rgba(0, 0, 0, 0.4),
      inset 1.5cqw 0.5cqh 1cqw rgba(255, 252, 252, 0.35);
  }
  .thumb.dragging {
    cursor: grabbing;
  }
</style>
