<!-- svelte-ignore a11y_no_static_element_interactions -->
<script>
  let { type, pressed, onClick } = $props()
</script>

<div>
  <button onclick={onClick} aria-pressed={pressed}>
    {type}
  </button>
</div>

<style>
  button {
    cursor: pointer;
  }
  button[aria-pressed="true"] {
    /* your pressed styles */
    background: #222;
    transform: scale(0.96);
  }
</style>
