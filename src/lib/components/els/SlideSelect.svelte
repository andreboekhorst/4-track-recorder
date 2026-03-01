<!-- svelte-ignore a11y_role_has_required_aria_props -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<script>
  let xpos_percentage = $state(0) // 0–100
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

  let { value = $bindable() } = $props()

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
    const adjusted_scrollarea = 1 - btnHeight
    const scrollHeight = rect.height * adjusted_scrollarea
    const stepHeight = scrollHeight / steps
    const deltaSteps = Math.round((event.clientY - startY) / stepHeight)

    selected_i = Math.max(0, Math.min(startIndex + deltaSteps, steps))

    // This is the bindable value
    value = selections[selected_i]?.val

    // Render
    staggeredx = selected_i / steps
    xpos_percentage = Math.round(staggeredx * adjusted_scrollarea * 100)
  }

  const stop = (event) => {
    dragging = false
    event.target.releasePointerCapture?.(event.pointerId)
  }
</script>

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
  <div
    class="slot"
    style="height: {(1 - btnHeight) * 100}%; top: {(btnHeight / 2) * 100}%"
  ></div>
</div>

<style>
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
