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

  :global(.cell-center) {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.ui-label) {
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    /* letter-spacing: 0.1vw; */
    font-size: 1vw;
  }
</style>
