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
  <a onclick={() => reset()}>✸</a>
</div>

<style>
  .counter {
    padding: 20px;
    color: white;
  }
</style>
