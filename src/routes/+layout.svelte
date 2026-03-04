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
    outline: none;
  }

  :global(html) {
    overflow: hidden;
    position: fixed;
    width: 100%;
    height: 100%;
    overscroll-behavior: none;
  }

  :global(body) {
    font-family: system-ui, sans-serif;
    margin: 0;
    min-height: 100vh;
    background: radial-gradient(ellipse at top left, #ffffff, #b7b7b7);
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: none;
  }

  :global(.cell-center) {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.cell-bottom) {
    display: flex;
    align-items: end;
    justify-content: center;
  }
  :global(.cell-right) {
    display: flex;
    align-items: center;
    justify-content: right;
  }

  :global(.ui-label) {
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    /* letter-spacing: 0.1vw; */
    font-size: 1.8cqh;
  }
</style>
