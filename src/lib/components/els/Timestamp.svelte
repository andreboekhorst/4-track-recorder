<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_missing_attribute -->
<script lang="ts">
  let { timestamp } = $props()

  // We set the correction to the current state each time the button is pressed
  // Mimicing a reset of the index.
  let correction = $state(0)
  function count_to_str(nr: number) {
    var cor_nr = Math.floor(nr - correction)
    if (cor_nr < 0) cor_nr += 1000

    if (cor_nr > 99) {
      return cor_nr.toString()
    } else if (cor_nr > 9) {
      return "0" + cor_nr.toString()
    } else {
      return "00" + cor_nr.toString()
    }
  }

  function reset() {
    correction = timestamp
  }
</script>

<div class="wrapper">
  <div class="counter">
    {count_to_str(timestamp)}
    <a onclick={() => reset()}>&nbsp;</a>
  </div>
</div>

<style>
  .wrapper {
    container-type: size;
    height: 9cqh;
    aspect-ratio: 180 / 80;
  }
  .counter {
    padding: 11cqw 25cqh;
    color: rgb(216, 216, 216);
    background-image: url("/counter_bg.png");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    width: 100cqw;
    height: 100cqh;
    position: relative;
    user-select: none;
    line-height: 50cqh;
    font-size: 35cqh;
    letter-spacing: 7cqw;
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
