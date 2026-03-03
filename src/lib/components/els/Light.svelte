<script lang="ts">
  let { color = "green", active = false, pulsing = false }: {
    color?: "red" | "green",
    active?: boolean,
    pulsing?: false | "slow" | "fast"
  } = $props()
</script>

<div class="light-bevel">
  <div
    class="light {color}"
    class:active
    class:pulsing-slow={pulsing === "slow" || pulsing === true}
    class:pulsing-fast={pulsing === "fast"}
  >
    &nbsp;
  </div>
</div>

<style>
  .light-bevel {
    background: linear-gradient(to bottom right, #101010, #a2a1a1);
    height: 18px;
    width: 18px;
    border-radius: 50%;
    container-type: size;
  }

  .light {
    border-radius: 89cqw;
    width: 66cqw;
    height: 66cqh;
    margin-top: 22cqh;
    margin-left: 20cqw;
    background: #645855;
    box-shadow: inset 6cqw -6cqh 22cqw 17cqw rgba(62, 2, 2, 0.7);

    /* &.red {
      background: #8f3333;
      box-shadow: inset 6cqw -6cqh 22cqw 17cqw rgba(62, 2, 2, 0.7);
    } */
    &.red.active {
      background: #ff0000;
      box-shadow:
        inset 0 0 33cqw rgba(32, 1, 1, 0.9),
        0 0 89cqw 89cqw rgba(209, 24, 24, 0.1);
    }
    &.red.pulsing-slow {
      animation: pulse-red 2s ease-in-out infinite;
    }
    &.red.pulsing-fast {
      animation: pulse-red 0.5s ease-in-out infinite;
    }

    &.green {
      background: #628615;
      box-shadow: inset 6cqw -6cqh 22cqw 17cqw rgba(32, 40, 0, 0.8);
    }
    &.green.active {
      background: #bbff00;
      box-shadow:
        inset 0 0 33cqw rgba(45, 53, 2, 0.9),
        0 0 89cqw 89cqw rgba(176, 240, 2, 0.1);
    }
    &.green.pulsing-slow {
      animation: pulse-green 2s ease-in-out infinite;
    }
    &.green.pulsing-fast {
      animation: pulse-green 0.5s ease-in-out infinite;
    }
  }

  @keyframes pulse-red {
    0%,
    100% {
      background: #645855;
      box-shadow: inset 6cqw -6cqh 22cqw 17cqw rgba(62, 2, 2, 0.7);
    }
    50% {
      background: #ff0000;
      box-shadow:
        inset 0 0 33cqw rgba(32, 1, 1, 0.9),
        0 0 89cqw 89cqw rgba(209, 24, 24, 0.1);
    }
  }

  @keyframes pulse-green {
    0%,
    100% {
      background: #645855;
      box-shadow: inset 6cqw -6cqh 22cqw 17cqw rgba(32, 40, 0, 0.8);
    }
    50% {
      background: #bbff00;
      box-shadow:
        inset 0 0 33cqw rgba(45, 53, 2, 0.9),
        0 0 89cqw 89cqw rgba(176, 240, 2, 0.1);
    }
  }
</style>
