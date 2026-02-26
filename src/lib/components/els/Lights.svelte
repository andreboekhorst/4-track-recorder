<script>
  let { level } = $props()
</script>

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

<style>
  .lights {
    height: 60px;
    width: 30px;
    box-shadow:
      inset 2px 2px 6px rgba(0, 0, 0, 0.6),
      inset -1px -1px 2px rgba(255, 255, 255, 0.5);
    position: relative;
    border-radius: 20px;
  }
  .inner {
    position: relative;
    top: 2px;
    left: 2px;
    height: 56px;
    width: 26px;
    background: #46474a;
    border-radius: 20px;
  }
  .light-bevel {
    background: linear-gradient(to bottom, #101010, #6b6b6b);
    top: 2px;
    left: 2px;
    height: 22px;
    width: 22px;
    margin-bottom: 8px;
    border-radius: 15px;
    position: relative;
  }
  .light {
    position: absolute;
    width: 16px;
    height: 16px;
    top: 3px;
    left: 3px;
    border-radius: 14px;
    &.low {
      background: #158626;
      box-shadow: inset 0px 0px 6px rgba(2, 56, 3, 0.9);
    }
    &.low.active {
      background: #00ff04;
      box-shadow:
        inset 0px 0px 6px rgba(2, 53, 2, 0.9),
        0px 0px 16px 16px rgba(2, 240, 30, 0.1);
    }
    &.high {
      background: #8f3333;
      box-shadow: inset 0px 0px 6px rgba(32, 1, 1, 0.9);
    }
    &.high.active {
      background: #ff0000;
      box-shadow:
        inset 0px 0px 6px rgba(32, 1, 1, 0.9),
        0px 0px 16px 16px rgba(209, 24, 24, 0.1);
    }
  }
</style>
