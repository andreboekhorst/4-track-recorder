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
    -webkit-user-select: none;
    user-select: none;
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
    min-height: 100dvh;
    background: radial-gradient(ellipse at top left, #f2f5f7, #b2b6bc);
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: none;
    height: 100%;
    padding: env(safe-area-inset-top) env(safe-area-inset-right)
      env(safe-area-inset-bottom) env(safe-area-inset-left);
    &:before {
      content: " ";
      position: absolute;
      display: block;
      width: 100%;
      height: 100%;
      background: url("/noise_50.jpg");
      background-size: 125px;
      mix-blend-mode: multiply;
      opacity: 0.5;
      z-index: -1;
    }
  }

  :global(header) {
    height: 10cqh;
    display: flex;
    justify-content: right;
    padding: 20px;
    position: absolute;
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
