<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_missing_attribute -->
<script lang="ts">
  let { timestamp } = $props()
  import { playFx } from "$lib/fx/soundfx"
  import { Tween } from "svelte/motion"
  import DigitRoller from "./DigitRoller.svelte"
  import counterBgImg from "../../assets/counter_bg.png"

  const correction = new Tween(0)

  let corrected = $derived.by(() => {
    let v = timestamp - correction.current
    if (v < 0) v += 1000
    return v % 1000
  })

  function reset() {
    playFx("counter")
    correction.set(timestamp, { duration: 400 })
  }
</script>

<!-- <div>{count_to_str(timestamp)}</div> -->

<div class="wrapper" style:--bg-counter="url({counterBgImg})">
  <div class="counter">
    <a onmousedown={() => reset()}>&nbsp;</a>
    <div class="number-ticker">
      <DigitRoller timestamp={corrected} index={0} />
      <DigitRoller timestamp={corrected} index={1} />
      <DigitRoller timestamp={corrected} index={2} />
    </div>
  </div>
</div>

<style>
  .number-ticker {
    display: flex;
    height: 17cqw;
    overflow: hidden;
  }

  .wrapper {
    container-type: size;
    height: 8cqh;
    aspect-ratio: 180 / 80;
  }
  .counter {
    padding: 15.2cqw 17cqh 13.8cqw;
    color: rgb(216, 216, 216);
    background-image: var(--bg-counter);
    background-size: 100% 100%;
    background-repeat: no-repeat;
    width: 100cqw;
    height: 100cqh;
    position: relative;
    user-select: none;

    box-sizing: border-box;
  }
  a {
    width: 11cqw;
    height: 25cqh;
    background-color: rgb(34, 34, 34);
    border-radius: 50%;
    position: absolute;
    right: 16.7cqw;
    top: 50%;
    transform: translateY(-15cqh);
    cursor: pointer;
    box-shadow:
      6cqw 15cqh 5.5cqw rgba(0, 0, 0, 0.8),
      inset 1cqw 2.5cqh 1.7cqw rgba(255, 255, 255, 0.4);

    &:active {
      box-shadow:
        5.5cqw 13.75cqh 6cqw rgba(0, 0, 0, 0.8),
        inset 1cqw 2.5cqh 1.7cqw rgba(255, 255, 255, 0.4);
    }
  }
</style>
