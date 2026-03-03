<!-- svelte-ignore a11y_role_has_required_aria_props -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<script>
  let xpos_percentage = $state(2) // 0–100
  let dragging = $state(false)
  let trackEl = $state()
  let staggeredx = $state()
  let selected_i = $state(0)
  let startY = $state(0)
  let startIndex = $state(0)
  let selections = [
    { lbl: "TRK 1", val: 0 },
    { lbl: "2", val: 1 },
    { lbl: "3", val: 2 },
    { lbl: "4", val: 3 },
    { lbl: "SAFE", val: "0" },
  ]
  let btnHeight = $state(0.55)

  let { value = $bindable(), padding = 2 } = $props() // padding: % inset top/bottom

  const start = (event) => {
    dragging = true
    startY = event.clientY
    startIndex = selected_i
    event.target.setPointerCapture(event.pointerId)
  }

  const move = (event) => {
    if (!dragging) return
    const rect = trackEl.getBoundingClientRect()
    const steps = selections.length - 1
    const adjusted_scrollarea = 1 - btnHeight - (2 * padding) / 100
    const scrollHeight = rect.height * adjusted_scrollarea
    const stepHeight = scrollHeight / steps
    const deltaSteps = Math.round((event.clientY - startY) / stepHeight)

    selected_i = Math.max(0, Math.min(startIndex + deltaSteps, steps))

    // This is the bindable value
    value = selections[selected_i]?.val

    // Render
    staggeredx = selected_i / steps
    xpos_percentage =
      padding + Math.round(staggeredx * adjusted_scrollarea * 100)
  }

  const stop = (event) => {
    dragging = false
    event.target.releasePointerCapture?.(event.pointerId)
  }
</script>

<div class="slider-holder">
  <div class="slideselect-indicator"></div>
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
      style="top: {xpos_percentage}%;  height: {btnHeight * 100}%"
    ></div>
    <!-- <div
      class="slot"
      style="height: {(1 - btnHeight) * 100}%; top: {(btnHeight / 2) * 100}%"
    ></div> -->
  </div>
</div>

<style>
  .slider-holder {
    height: 100%;
    width: 100%;
    display: flex;
    container-type: size;
    padding-top: 0cqh;
  }
  .slideselect-indicator {
    position: relative;
    background: url("/slideselect-indicator.svg");
    background-repeat: no-repeat;
    background-size: contain;
    width: 100%;
    height: 43cqh;
    background-position: top right;
    opacity: 0.7;
    top: 10%;
  }
  .track {
    width: 32cqw;
    height: 100%;
    position: relative;
    border-radius: 4cqw;
    background: rgb(100, 100, 100);
    box-shadow:
      inset 8cqw 1cqh 12cqw rgba(31, 31, 31, 0.75),
      inset 2cqw 0.2cqh 2cqw rgba(31, 31, 31, 0.45),
      inset -2cqw -0.2cqh 2cqw rgba(255, 252, 252, 0.35);

    .slot {
      display: block;
      content: " ";
      width: 50%;
      background-color: rgb(28, 28, 29);
      position: absolute;
      margin: 0 auto;
      left: 50%;
      top: 50%;
      transform: translate(-50%);
    }
  }

  .thumb {
    width: 75%;
    margin: 0 12%;
    background: url("/slideselect-thumb.png");
    background-size: 100% 100%;
    position: absolute;
    border-radius: 1cqh;
    top: 0%;
    left: 0;
    cursor: grab;
    z-index: 1;
    box-shadow:
      10cqw 0.5cqh 10cqw rgba(0, 0, 0, 0.4),
      inset 1.5cqw 0.5cqh 1cqw rgba(255, 252, 252, 0.35);
  }
  .thumb.dragging {
    cursor: grabbing;
  }
</style>
