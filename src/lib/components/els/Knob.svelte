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
    label,
    labelLeft,
    labelRight,
    color,
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
  // Deliberately a bit extended at start and end.
  function mapToKnob(val: number) {
    return val * 0.73 - 0.37
  }
</script>

<div class="knob-frame {color}">
  <div class="knob-label">{label}</div>
  <div class="knobx">
    <div
      class="knobcontainer"
      bind:this={containerEl}
      onpointermove={rotate}
      onpointerup={stopRotate}
      onpointerleave={stopRotate}
    >
      <div class="knob" onpointerdown={startRotate} class:dragging={rotating}>
        <div class="layer1">
          <div class="layer2">
            <div class="layer3">
              <div
                class="layer4"
                style="rotate: {mapToKnob(normalizeValue(value))}turn"
              >
                <div class="layer5">
                  <div class="line1"></div>
                  <div class="line2"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="labels">
      <span class="ui-label">&nbsp;{labelLeft}</span>
      <span class="ui-label">&nbsp;{labelRight}</span>
    </div>
  </div>
</div>

<style>
  .knobx {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    user-select: none;
    container-type: inline-size;
    width: 12cqh;
  }
  .knob-label {
    position: absolute;
    margin-top: -2.5cqh;
    margin-left: -2.8cqw;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
    font-size: 1.8cqh;
    letter-spacing: 0.1cqh;
    text-align: right;
    font-weight: bold;
  }
  .knobcontainer {
    width: 90cqw;
    aspect-ratio: 1 / 1;
    display: flex;
    user-select: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    margin-bottom: -5cqw;

    &:before {
      content: " ";
      position: absolute;
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: conic-gradient(
        from 0deg at 50% 50%,
        /* 12 o'clock (0°) */ rgba(255, 255, 255, 0.5) 0deg 1deg,
        transparent 1deg 29deg,
        /* 13:00 (30°) */ rgba(255, 255, 255, 0.5) 29deg 31deg,
        transparent 31deg 59deg,
        /* 14:00 (60°) */ rgba(255, 255, 255, 0.5) 59deg 61deg,
        transparent 61deg 89deg,
        /* 15:00 (90°) */ rgba(255, 255, 255, 0.5) 89deg 91deg,
        transparent 91deg 119deg,
        /* 16:00 (120°) */ rgba(255, 255, 255, 0.5) 119deg 121deg,
        transparent 121deg 239deg,
        /* 8:00 (240°) */ rgba(255, 255, 255, 0.5) 239deg 241deg,
        transparent 241deg 269deg,
        /* 9:00 (270°) */ rgba(255, 255, 255, 0.5) 269deg 271deg,
        transparent 271deg 299deg,
        /* 10:00 (300°) */ rgba(255, 255, 255, 0.5) 299deg 301deg,
        transparent 301deg 329deg,
        /* 11:00 (330°) */ rgba(255, 255, 255, 0.5) 329deg 331deg,
        transparent 331deg 359deg,
        /* 12 o'clock wrap */ rgba(255, 255, 255, 0.5) 359deg 360deg
      );
    }
  }
  .knob {
    width: 66cqw;
    aspect-ratio: 1 / 1;
    border-radius: 100%;
    background-color: rgb(32, 32, 32);
    cursor: grab;
    display: flex;
    justify-content: center;
    align-items: center;
    position: absolute;

    .layer1 {
      position: absolute;
      display: block;
      width: 90%;
      height: 90%;
      border-radius: 100%;
      background: linear-gradient(to right, #a9a9a9, #5c5c5c);
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .layer2 {
      display: block;
      width: 85%;
      height: 85%;
      border-radius: 100%;
      background: linear-gradient(to bottom right, #8e8e8e 35%, #4a4a4a 65%);
      display: flex;
      justify-content: center;
      align-items: center;
      box-shadow: 30cqw 23cqw 25cqw rgba(0, 0, 0, 0.4);
    }

    .layer3 {
      border-radius: 100%;
      display: block;
      width: 80%;
      height: 80%;
      background-color: #979797;
      box-shadow:
        inset 3cqw 3cqw 3cqw rgba(255, 255, 255, 0.5),
        inset -1.5cqw -1.5cqw 3cqw rgba(50, 50, 50, 0.7);
    }
    .layer4 {
      position: relative;
      width: 100%;
      height: 100%;
      /* mix-blend-mode: overlay; */

      .line1 {
        position: absolute;
        background-color: #ededed;
        width: 6cqw;
        height: 15cqw;
        left: calc(50% - 3cqw);
        border-radius: 5cqw;
      }
      .line2 {
        position: absolute;
        background-color: #ededed;
        width: 6cqw;
        height: 6cqw;
        left: calc(50% - 3cqw);
        top: -12cqw;
        border-radius: 1.5cqw;
      }
    }
  }
  .knob.dragging {
    cursor: grabbing;
  }

  .labels {
    display: flex;
    width: 100%;
    span {
      flex: 1;
      text-align: center;
    }
  }

  .green .line1,
  .green .line2 {
    background-color: #60ac8f !important;
  }

  .pink .line1,
  .pink .line2 {
    background-color: #f5c68b !important;
  }

  .red .line1,
  .red .line2 {
    background-color: #b04a4a !important;
  }
</style>
