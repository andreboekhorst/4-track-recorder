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

<div class="counter">
  {count_to_str(timestamp)}
  <a onclick={() => reset()}>&nbsp;</a>
</div>

<style>
  .counter {
    padding: 20px;
    color: white;
    background-image: url("/counter_bg.png");
    background-size: 100%;
    background-repeat: no-repeat;
    width: 180px;
    height: 80px;
    position: relative;
    user-select: none;
    line-height: 40px;
    font-size: 22px;
    letter-spacing: 16px;
  }
  a {
    width: 20px;
    height: 20px;
    background-color: rgb(34, 34, 34);
    border-radius: 50%;
    position: absolute;
    right: 30px;
    top: 50%;
    transform: translateY(-12px);
    cursor: pointer;
    box-shadow:
      11px 12px 10px rgba(0, 0, 0, 0.8),
      inset 2px 2px 3px rgba(255, 255, 255, 0.4);

    &:active {
      box-shadow:
        10px 11px 11px rgba(0, 0, 0, 0.8),
        inset 2px 2px 3px rgba(255, 255, 255, 0.4);
    }
  }
</style>
