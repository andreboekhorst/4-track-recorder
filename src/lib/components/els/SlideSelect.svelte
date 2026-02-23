<!-- svelte-ignore a11y_role_has_required_aria_props -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<script>
  let xpos_percentage = $state(0) // 0–100
  let dragging = $state(false)
  let trackEl = $state()
  let staggeredx = $state()
  let selected_i = $state(0)
  let selections = [
    { lbl: "TRK 1", val: "0" },
    { lbl: "2", val: "1" },
    { lbl: "3", val: "2" },
    { lbl: "4", val: "3" },
    // { lbl: "SAFE", val: "0" },
  ]
  let btnHeight = $state(0.33)

  let { value = $bindable() } = $props()

  const start = (event) => {
    dragging = true
    event.target.setPointerCapture(event.pointerId)
  }

  const move = (event) => {
    if (!dragging) return
    const rect = trackEl.getBoundingClientRect()
    const x = event.clientY - rect.top
    const adjusted_scrollarea = 1 - btnHeight
    const scrollHeight = rect.height * adjusted_scrollarea
    const percent = Math.max(0, Math.min(x / scrollHeight, 1))

    // Map to the 4 selections.
    let steps = selections.length - 1
    selected_i = Math.round(percent * steps)

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
</div>

<p>{value}</p>

<style>
  .track {
    width: 10px;
    height: 300px;
    background: #272727;
    position: relative;
    border-radius: 5px;
  }

  .thumb {
    width: 20px;
    background: rgb(98, 98, 98);
    /* border-radius: 50%; */
    position: absolute;
    top: 0%;
    left: 5px;
    transform: translate(-50%, 0);
    cursor: grab;
  }
  .thumb.dragging {
    cursor: grabbing;
  }
</style>
