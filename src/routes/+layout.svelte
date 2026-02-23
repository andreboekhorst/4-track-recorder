<script lang="ts">
  import favicon from "$lib/assets/favicon.svg"

  let { children } = $props()
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    font-family: system-ui, sans-serif;
    margin: 0;
    min-height: 100vh;
    padding: 60px;
    background-color: #ababab;
  }
</style>
