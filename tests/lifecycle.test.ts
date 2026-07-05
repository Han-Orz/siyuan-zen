import assert from "node:assert/strict";
import test from "node:test";
import { bindCursorDocumentEvents, destroyCursorDocumentEvents } from "../src/modules/cursor/events";
import { flushCursorTransitionIfNeeded } from "../src/modules/cursor";
import { bindPopoverDrag, unbindPopoverDrag } from "../src/modules/cursor/popoverDrag";
import * as inputMode from "../src/modules/inputMode";
import { isSameBlockOpacityCacheTarget } from "../src/modules/ripple";
import { startSwitchSettle, stopSwitchSettle, isSwitchHiddenActive, isSwitchRevealPending } from "../src/modules/cursor/switchSettle";
import { destroyTypewriter, initTypewriter } from "../src/modules/typewriter";
import { runLifecycleSteps } from "../src/utils/lifecycle";

type ListenerRecord = {
  event: string;
  handler: EventListener;
  options?: AddEventListenerOptions;
};

class FakeElement {
  closest(): Element | null {
    return null;
  }
}

class FakeCursorElement {
  readonly classList = {
    contains: (name: string) => this.classes.has(name),
  };
  private readonly classes = new Set<string>();
  offsetHeightReads = 0;

  constructor(classes: string[] = []) {
    classes.forEach((name) => this.classes.add(name));
  }

  get offsetHeight(): number {
    this.offsetHeightReads++;
    return 1;
  }
}

class FakeDragHandle {
  readonly records: ListenerRecord[] = [];

  addEventListener(event: string, handler: EventListener, options?: AddEventListenerOptions) {
    this.records.push({ event, handler, options });
  }

  removeEventListener(event: string, handler: EventListener, options?: AddEventListenerOptions) {
    const index = this.records.findIndex((record) =>
      record.event === event &&
      record.handler === handler &&
      record.options === options
    );
    if (index >= 0) this.records.splice(index, 1);
  }
}

class FakePopover {
  readonly dragHandle = new FakeDragHandle();
  readonly parentElement = {} as Element;
  isConnected = true;

  querySelector(selector: string): Element | null {
    return selector === ".resize__move"
      ? this.dragHandle as unknown as Element
      : null;
  }
}

class FakePopoverCursor {
  constructor(private readonly popover: FakePopover) {}

  closest(selector: string): Element | null {
    return selector === ".block__popover"
      ? this.popover as unknown as Element
      : null;
  }
}

function withFakeDocument(run: (records: ListenerRecord[]) => void): void {
  const originalDocument = globalThis.document;
  const records: ListenerRecord[] = [];
  const fakeDocument = {
    addEventListener(event: string, handler: EventListener, options?: AddEventListenerOptions) {
      records.push({ event, handler, options });
    },
    removeEventListener(event: string, handler: EventListener, options?: AddEventListenerOptions) {
      const index = records.findIndex((record) =>
        record.event === event &&
        record.handler === handler &&
        record.options === options
      );
      if (index >= 0) records.splice(index, 1);
    },
  } as unknown as Document;

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: fakeDocument,
  });

  try {
    run(records);
  } finally {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  }
}

function withFakeFrames(run: (frames: Map<number, FrameRequestCallback>) => void): void {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrame = 1;
  const frames = new Map<number, FrameRequestCallback>();

  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      const frame = nextFrame++;
      frames.set(frame, callback);
      return frame;
    },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: (frame: number) => {
      frames.delete(frame);
    },
  });

  try {
    run(frames);
  } finally {
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      value: originalRequest,
    });
    Object.defineProperty(globalThis, "cancelAnimationFrame", {
      configurable: true,
      value: originalCancel,
    });
  }
}

test("ripple block opacity cache is scoped to the editor container", () => {
  const containerA = {} as HTMLElement;
  const containerB = {} as HTMLElement;
  const cache = {
    container: containerA,
    blockId: "shared-block-id",
    containerTop: 12,
    scrollTop: 0,
    childCount: 3,
  };

  assert.equal(
    isSameBlockOpacityCacheTarget(cache, containerA, "shared-block-id", 12, 0, 3),
    true,
    "same container and metrics should hit the cache",
  );
  assert.equal(
    isSameBlockOpacityCacheTarget(cache, containerB, "shared-block-id", 12, 0, 3),
    false,
    "same block id and metrics in another editor container must not hit",
  );
});

test("popover drag binding releases document listeners when the popover is removed", () => {
  const originalMutationObserver = globalThis.MutationObserver;
  let observerCallback: MutationCallback | null = null;
  let disconnectCount = 0;

  Object.defineProperty(globalThis, "MutationObserver", {
    configurable: true,
    value: class {
      constructor(callback: MutationCallback) {
        observerCallback = callback;
      }

      observe() {
        // no-op fake
      }

      disconnect() {
        disconnectCount++;
      }
    },
  });

  try {
    withFakeDocument((records) => {
      try {
        const popover = new FakePopover();
        bindPopoverDrag(new FakePopoverCursor(popover) as unknown as Element, {
          getCursorElement: () => null,
          queueUpdate: () => undefined,
        });

        assert.equal(
          records.filter((record) => record.event === "mousemove" || record.event === "mouseup").length,
          2,
          "popover drag should bind document move/up listeners",
        );
        assert.ok(observerCallback, "popover drag should watch the popover removal");

        popover.isConnected = false;
        observerCallback([], {} as MutationObserver);

        assert.equal(
          records.some((record) => record.event === "mousemove" || record.event === "mouseup"),
          false,
          "document listeners should be released after popover removal",
        );
        assert.equal(popover.dragHandle.records.length, 0, "drag handle listener should be released");
        assert.equal(disconnectCount, 1, "removal observer should disconnect itself");
      } finally {
        unbindPopoverDrag();
      }
    });
  } finally {
    Object.defineProperty(globalThis, "MutationObserver", {
      configurable: true,
      value: originalMutationObserver,
    });
  }
});

test("cursor keydown activates input mode for structural edits without typewriter", () => {
  withFakeFrames(() => {
    withFakeDocument((records) => {
      inputMode.reset();
      bindCursorDocumentEvents({
        markKeyboardPending: () => undefined,
        onScrollOrWheel: () => undefined,
        queueUpdate: () => undefined,
      });

      const keydown = records.find((record) => record.event === "keydown");
      assert.ok(keydown, "expected cursor keydown listener");

      for (const key of ["Enter", "Backspace"]) {
        inputMode.reset();
        keydown.handler({ key } as unknown as Event);
        assert.equal(inputMode.isFocusActive(), true, `${key} should activate focus mode`);
        assert.equal(inputMode.isTypewriterActive(), true, `${key} should activate typewriter mode`);
      }

      destroyCursorDocumentEvents();
      inputMode.reset();
    });
  });
});

test("cursor transition flush only reads layout while transition is disabled", () => {
  const normal = new FakeCursorElement();
  assert.equal(flushCursorTransitionIfNeeded(normal as unknown as HTMLDivElement), false);
  assert.equal(normal.offsetHeightReads, 0, "normal cursor updates should not force layout");

  const disabled = new FakeCursorElement(["no-transition"]);
  assert.equal(flushCursorTransitionIfNeeded(disabled as unknown as HTMLDivElement), true);
  assert.equal(disabled.offsetHeightReads, 1, "disabled transition needs one layout flush");
});

test("typewriter destroy cancels deferred click centering frames", () => {
  const originalElement = globalThis.Element;

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: FakeElement,
  });

  try {
    withFakeFrames((frames) => {
      withFakeDocument((records) => {
        initTypewriter();
        const click = records.find((record) => record.event === "click");
        assert.ok(click, "expected typewriter click listener");

        click.handler({ target: new FakeElement() } as unknown as Event);
        assert.equal(frames.size, 1, "click should schedule deferred centering");

        destroyTypewriter();
        assert.equal(frames.size, 0, "destroy should cancel deferred centering");
      });
    });
  } finally {
    Object.defineProperty(globalThis, "Element", {
      configurable: true,
      value: originalElement,
    });
  }
});

test("switch settle stop cancels pending reveal frame", () => {
  const originalPerformance = globalThis.performance;
  let now = 0;

  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: { now: () => now },
  });

  try {
    withFakeFrames((frames) => {
      const classNames = new Set<string>();
      const element = {
        classList: {
          add: (name: string) => classNames.add(name),
          remove: (name: string) => classNames.delete(name),
        },
        style: { opacity: "" },
        get offsetHeight() {
          return 1;
        },
      } as unknown as HTMLDivElement;

      startSwitchSettle({
        getCursorElement: () => element,
        sampleTarget: () => null,
        cancelRemoveTransitionFrame: () => undefined,
        pauseBreathe: () => undefined,
        queueUpdate: () => undefined,
        scheduleResumeBreathe: () => undefined,
      });

      assert.equal(frames.size, 1, "settle should schedule its polling frame");
      const settleFrame = [...frames.entries()][0];
      frames.delete(settleFrame[0]);
      now = 1000;
      settleFrame[1](now);

      assert.equal(isSwitchRevealPending(), true, "finish should enter reveal phase");
      assert.equal(frames.size, 1, "finish should schedule reveal frame");

      stopSwitchSettle();

      assert.equal(frames.size, 0, "stop should cancel pending reveal frame");
      assert.equal(isSwitchRevealPending(), false);
      assert.equal(isSwitchHiddenActive(), false);
    });
  } finally {
    stopSwitchSettle();
    Object.defineProperty(globalThis, "performance", {
      configurable: true,
      value: originalPerformance,
    });
  }
});

test("lifecycle cleanup continues after a failing step", () => {
  const calls: string[] = [];
  const errors: Array<{ name: string; error: unknown }> = [];

  runLifecycleSteps([
    {
      name: "first",
      run: () => {
        calls.push("first");
        throw new Error("boom");
      },
    },
    {
      name: "second",
      run: () => {
        calls.push("second");
      },
    },
  ], (name, error) => {
    errors.push({ name, error });
  });

  assert.deepEqual(calls, ["first", "second"]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].name, "first");
  assert.ok(errors[0].error instanceof Error);
});
