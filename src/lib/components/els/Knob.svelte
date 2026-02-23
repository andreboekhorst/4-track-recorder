<!-- svelte-ignore a11y_no_static_element_interactions -->
<script lang="ts">
  let rotating = $state(false)
  let _dragStart = $state(0)
  let _dragDelta = $state(0)
  let containerEl = $state()
  let yStart = $state()

  let internalValue = $state(0) // always between 0-1, transalte later

  let {
    min,
    max,
    value = $bindable(),
    onchange,
    labelLeft,
    labelRight,
  } = $props()

  const startRotate = (e) => {
    // triggered once
    rotating = true
    _dragStart = normalizeValue(value) // is this copying the value or becoming a reference?
    _dragDelta = 0
    yStart = e.clientY

    // needed to keep tracking pointermove, even if it is outside
    e.target.setPointerCapture(e.pointerId)
  }

  const rotate = (e) => {
    // trigggered continously
    if (!rotating) return // not sure why/if its needed?

    const rect = containerEl.getBoundingClientRect()
    const yMove = yStart - e.clientY // it should be the difference from where it initially started.

    // max drag area is 4 times the height
    _dragDelta = yMove / rect.height / 4
    internalValue = Math.max(0, Math.min(_dragStart + _dragDelta, 1))

    // Trigger Callback
    onchange?.(denormalizeValue(internalValue))
  }

  const stopRotate = (e) => {
    rotating = false
    e.target.releasePointerCapture?.(e.pointerId)
  }

  // Take the value and put it on a 0-1 scale
  function denormalizeValue(internalValue: number) {
    var spread = max - min
    return min + internalValue * spread
  }

  function normalizeValue(val: number) {
    var spread = max - min
    return (val - min) / spread
  }

  // Ensures that the button goes from 8-4o'clock
  // The actual buttons go a bit further than the liness
  function mapToKnob(val: number) {
    return val * 0.8 - 0.4
  }
</script>

<div>
  <div
    class="knobcontainer"
    bind:this={containerEl}
    onpointermove={rotate}
    onpointerup={stopRotate}
    onpointerleave={stopRotate}
  >
    <div
      class="knob"
      onpointerdown={startRotate}
      class:dragging={rotating}
      style="rotate: {mapToKnob(normalizeValue(value))}turn"
    >
      <div class="line">&nbsp;</div>
    </div>
    <div class="labels">
      <span>{labelLeft}</span>
      <span>{labelRight}</span>
    </div>
  </div>
</div>

<style>
  .knobcontainer {
    width: 6.9cqw;
    aspect-ratio: 1 / 1;
    display: flex;
    user-select: none;
    /* background-color: pink; */
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .knob {
    width: 5cqw;
    aspect-ratio: 1 / 1;
    border-radius: 100%;
    background-color: rgb(111, 111, 111);
    /* rotate: 0.4turn; */
    cursor: grab;
  }
  .knob.dragging {
    cursor: grabbing;
  }
  .line {
    background-color: red;
    width: 2px;
    height: 20px;
    margin-left: 50%;
  }
</style>
