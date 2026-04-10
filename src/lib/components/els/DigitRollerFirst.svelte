<script lang="ts">
  let { digit = 0 } = $props()

  let roller: HTMLDivElement
  let prev = -1
  let wrapping = false
  const step = 100 / 12
  const pos = (d: number) => `translateY(${-step * (1 + d)}%)`

  function jumpTo(transform: string) {
    roller.style.transition = "none"
    roller.style.transform = transform
    roller.offsetHeight
    roller.style.transition = ""
  }

  $effect(() => {
    const d = +digit
    if (!roller) return

    if (prev === -1) {
      jumpTo(pos(d))
    } else if (prev === 9 && d === 0) {
      wrapping = true
      roller.style.transform = `translateY(${-step * 11}%)`
    } else if (prev === 0 && d === 9) {
      wrapping = true
      roller.style.transform = `translateY(0%)`
    } else {
      wrapping = false
      roller.style.transform = pos(d)
    }

    prev = d
  })

  function onTransitionEnd() {
    if (!wrapping) return
    wrapping = false
    jumpTo(pos(+digit))
  }
</script>

<div class="digits">
  <div class="roller" bind:this={roller} ontransitionend={onTransitionEnd}>
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
  .roller {
    transition: 0.4s ease transform;
  }
  .digit {
    font-size: 35cqh;
    /* letter-spacing: 7cqw; */
  }
  .span {
    padding-left: 1cqw;
  }
</style>
