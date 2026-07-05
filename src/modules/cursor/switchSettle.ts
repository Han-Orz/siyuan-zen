type SwitchTarget = { x: number; y: number; height: number };

export interface SwitchSettleContext {
  getCursorElement: () => HTMLDivElement | null;
  sampleTarget: () => SwitchTarget | null;
  cancelRemoveTransitionFrame: () => void;
  pauseBreathe: () => void;
  queueUpdate: () => void;
  scheduleResumeBreathe: () => void;
}

let switchSettleFrame: number | null = null;
let switchRevealFrame: number | null = null;
let switchHiddenActive = false;
let switchRevealPending = false;

function hideCursorForSwitch(ctx: SwitchSettleContext): void {
  const el = ctx.getCursorElement();
  if (!el) return;
  ctx.pauseBreathe();
  ctx.cancelRemoveTransitionFrame();
  el.classList.remove("hidden");
  el.classList.remove("no-transition");
  el.classList.add("no-animation");
  switchHiddenActive = true;
  el.style.opacity = "0";
}

export function stopSwitchSettle(): void {
  if (switchSettleFrame !== null) {
    cancelAnimationFrame(switchSettleFrame);
    switchSettleFrame = null;
  }
  if (switchRevealFrame !== null) {
    cancelAnimationFrame(switchRevealFrame);
    switchRevealFrame = null;
  }
  switchRevealPending = false;
  switchHiddenActive = false;
}

function finishAnimatedSwitch(ctx: SwitchSettleContext): void {
  stopSwitchSettle();
  const el = ctx.getCursorElement();
  if (!el) {
    ctx.queueUpdate();
    return;
  }

  el.classList.add("no-transition");
  switchRevealPending = true;
  ctx.queueUpdate();

  switchRevealFrame = requestAnimationFrame(() => {
    switchRevealFrame = null;
    const current = ctx.getCursorElement();
    if (!current) {
      switchRevealPending = false;
      switchHiddenActive = false;
      return;
    }
    void current.offsetHeight;
    switchRevealPending = false;
    switchHiddenActive = false;
    current.classList.remove("no-transition");
    current.classList.remove("no-animation");
    current.style.opacity = "";
    ctx.scheduleResumeBreathe();
  });
}

export function startSwitchSettle(ctx: SwitchSettleContext): void {
  stopSwitchSettle();
  hideCursorForSwitch(ctx);

  let lastTarget = ctx.sampleTarget();
  let stableFrames = 0;
  const startedAt = performance.now();
  const minDurationMs = 240;
  const maxDurationMs = 700;
  const stableFrameTarget = 8;
  const epsilonPx = 0.35;

  const tick = () => {
    switchSettleFrame = null;

    const elapsedMs = performance.now() - startedAt;
    const target = ctx.sampleTarget();
    if (!target) {
      if (elapsedMs >= maxDurationMs) {
        finishAnimatedSwitch(ctx);
        return;
      }
      switchSettleFrame = requestAnimationFrame(tick);
      return;
    }

    const targetMoved =
      lastTarget === null ||
      Math.abs(target.x - lastTarget.x) > epsilonPx ||
      Math.abs(target.y - lastTarget.y) > epsilonPx ||
      Math.abs(target.height - lastTarget.height) > epsilonPx;

    stableFrames = targetMoved ? 0 : stableFrames + 1;
    lastTarget = target;

    if (
      elapsedMs >= maxDurationMs ||
      (elapsedMs >= minDurationMs && stableFrames >= stableFrameTarget)
    ) {
      finishAnimatedSwitch(ctx);
      return;
    }

    switchSettleFrame = requestAnimationFrame(tick);
  };

  switchSettleFrame = requestAnimationFrame(tick);
}

export function isSwitchHiddenActive(): boolean {
  return switchHiddenActive;
}

export function isSwitchRevealPending(): boolean {
  return switchRevealPending;
}
