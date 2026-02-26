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
  .labels {
    color: white;
    display: flex;
    font-size: 10px;
    opacity: 0.8;
    .left {
      flex: 1;
    }
    .right {
      flex: 1;
      text-align: right;
      transform: translate(-2px, 16px);
    }
  }
  .lights {
    height: 56px;
    width: 25px;
    background: #46474a;
    box-shadow:
      inset 2px -1px 6px rgba(0, 0, 0, 0.6),
      inset 2px -2px 2px rgba(255, 255, 255, 0.5);
    position: relative;
    border-radius: 20px;
    transform: rotate(-60deg) translate(10px, 10px);
  }
  .inner {
    position: relative;
    top: 2px;
    left: 2px;
    height: 52px;
    width: 22px;
    background: #46474a;
    border-radius: 20px;
  }
  .light-bevel {
    background: linear-gradient(to bottom, #101010, #6b6b6b);
    top: 2px;
    left: 2px;
    height: 18px;
    width: 18px;
    margin-bottom: 12px;
    border-radius: 15px;
    position: relative;
  }
  .light {
    position: absolute;
    width: 16px;
    height: 16px;
    top: 1px;
    left: 1px;
    border-radius: 16px;
    &.low {
      background: #628615;
      box-shadow: inset 1px -1px 4px 3px rgba(32, 40, 0, 0.8);
    }
    &.low.active {
      background: #bbff00;
      box-shadow:
        inset 0px 0px 6px rgba(45, 53, 2, 0.9),
        0px 0px 16px 16px rgba(176, 240, 2, 0.1);
    }
    &.high {
      background: #8f3333;
      box-shadow: inset 1px -1px 4px 3px rgba(62, 2, 2, 0.7);
    }
    &.high.active {
      background: #ff0000;
      box-shadow:
        inset 0px 0px 6px rgba(32, 1, 1, 0.9),
        0px 0px 16px 16px rgba(209, 24, 24, 0.1);
    }
  }
</style>
