<script lang="ts">
  let { timestamp = 0, index = 0 } = $props()

  let roller: HTMLDivElement
  const step = 100 / 12

  const pos = (d: number) => `translateY(${-step * (1 + d)}%)`

  $effect(() => {
    if (!roller) return

    // Get the value at this digit position (index 0=hundreds, 1=tens, 2=ones)
    const divisor = Math.pow(10, 2 - index)
    const value = (timestamp / divisor) % 10

    // Split into whole digit and fractional part for smooth rolling
    const digit = Math.floor(value)
    const fraction = value - digit

    roller.style.transform = pos(digit + fraction)
  })
</script>

<div class="digits">
  <div class="roller" bind:this={roller}>
    {#each [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as n}
      <div class="digit"><span>{n}</span></div>
    {/each}
  </div>
</div>

<style>
  .digits {
    overflow: hidden;
    height: 20cqw;
    width: 17cqw;
    text-align: center;
    color: #cfcdd3;
    background: linear-gradient(to bottom, #474748, #000000, #545454);
    border-right: 2px solid rgb(33, 33, 33);
    font-family: sans-serif;
    &:nth-child(1) {
      transform: translateY(-1.5cqw);
    }
    &:nth-child(2) {
      transform: translateY(-0.5cqw);
    }
    &:nth-child(3) {
      transform: translateY(-2cqw);
    }
  }
  /* .roller {
    transition: 0.4s ease transform;
  } */
  .digit {
    font-size: 35cqh;
    /* letter-spacing: 7cqw; */
  }
  .span {
    padding-left: 1cqw;
  }
</style>
