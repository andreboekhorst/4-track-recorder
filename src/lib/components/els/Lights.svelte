<script>
  let { level } = $props()
</script>

<div class="indicators">
  <div class="labels">
    <div class="left">+6</div>
    <div class="right">0</div>
  </div>
  <div class="lights">
    <div class="inner">
      <div class="light-bevel">
        <div class="light high active" class:active={level > 3}>&nbsp;</div>
      </div>
      <div class="light-bevel">
        <div class="light low active" class:active={level > 1}>&nbsp;</div>
      </div>
      <!-- <div class="light low" class:active={level > 0.5}>&nbsp;</div> -->
    </div>
  </div>
</div>

<style>
  .indicators {
    container-type: size;
    width: 100%;
    height: 100%;
  }
  .labels {
    color: white;
    display: flex;
    font-size: 20cqw;
    opacity: 0.8;
    .left {
      flex: 1;
    }
    .right {
      flex: 1;
      text-align: right;
      transform: translate(-4cqw, 20cqh);
    }
  }
  .lights {
    height: 70cqh;
    width: 50cqw;
    background: #46474a;
    box-shadow:
      inset 4cqw -2cqw 12cqw rgba(0, 0, 0, 0.6),
      inset 4cqw -4cqw 4cqw rgba(255, 255, 255, 0.5);
    position: relative;
    border-radius: 40cqw;
    transform: rotate(-60deg) translate(20cqw, 12.5cqh);
  }
  .inner {
    position: relative;
    top: 2.5cqh;
    left: 4cqw;
    height: 65cqh;
    width: 44cqw;
    background: #46474a;
    border-radius: 40cqw;
  }
  .light-bevel {
    background: linear-gradient(to bottom, #101010, #6b6b6b);
    top: 2.5cqh;
    left: 4cqw;
    height: 36cqw;
    width: 36cqw;
    margin-bottom: 15cqh;
    border-radius: 50%;
    position: relative;
  }
  .light {
    position: absolute;
    width: 32cqw;
    height: 32cqw;
    top: 2cqw;
    left: 2cqw;
    border-radius: 50%;
    &.low {
      background: #628615;
      box-shadow: inset 2cqw -2cqw 8cqw 6cqw rgba(32, 40, 0, 0.8);
    }
    &.low.active {
      background: #bbff00;
      box-shadow:
        inset 0 0 12cqw rgba(45, 53, 2, 0.9),
        0 0 32cqw 32cqw rgba(176, 240, 2, 0.1);
    }
    &.high {
      background: #8f3333;
      box-shadow: inset 2cqw -2cqw 8cqw 6cqw rgba(62, 2, 2, 0.7);
    }
    &.high.active {
      background: #ff0000;
      box-shadow:
        inset 0 0 12cqw rgba(32, 1, 1, 0.9),
        0 0 32cqw 32cqw rgba(209, 24, 24, 0.1);
    }
  }
</style>
