import { getCursorRect } from "../utils/getCursorRect";
import { findClosestScrollableElement } from "../utils/scroll";
import { TYPEWRITER_CONFIG } from "../config";
import { shouldPauseTypewriter } from "../utils/edgeCases";
import * as inputMode from "./inputMode";
import { isInAllowElements } from "../utils/boundary";
import { Debug } from "../utils/debug";

const { COMFORT_ZONE, SCROLL_DURATION_TIERS, SCROLL_CURVE } = TYPEWRITER_CONFIG;

const dbg = Debug.namespace("typewriter");

let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];
let pendingScroll: number | null = null;
let pendingScrollTarget: HTMLElement | null = null;
let pendingScrollEnd: number = 0;
let isScrolling = false;
let pendingCheck: number | null = null;
let cachedContainer: HTMLElement | null = null;
let cachedCursorElement: Element | null = null;
let lastCheckRect: { x: number; y: number; width: number; height: number } | null = null;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 精简 FLIP 动画：Enter / Backspace 块变更后，下方块平滑过渡回原位。
 *
 * 三阶段批量执行：
 *   Phase 1 (Invert): 所有块一次性写完 transform+transition:none，不读 offsetHeight
 *   Phase 2 (Commit):  读 editor.offsetHeight 一次，唯一 layout — 所有 Invert 一起生效
 *   Phase 3 (Play):    一个 rAF 统一启动所有 transition，一个 setTimeout 集中清理
 *
 * 对比旧版：不逐元素 reflow、不逐元素内层 rAF → 无中间帧残影，定时器从 N×2 降到 2。
 */
function animateBlockShift(editor: HTMLElement): void {
  // First: 捕获阶段同步快照所有块的旧位置（在 Enter 的 capture handler 中调用，
  // 此时 SiYuan bubble handler 尚未改 DOM）
  const first = new Map<HTMLElement, number>();
  editor.querySelectorAll<HTMLElement>('[data-node-id]').forEach(el => {
    first.set(el, el.getBoundingClientRect().top);
  });

  // 等一帧让 SiYuan 完成 DOM 变更
  requestAnimationFrame(() => {
    const modifiedElements: HTMLElement[] = [];

    // Phase 1 (Invert): 批量写
    for (const [el, y0] of first) {
      if (!el.isConnected) continue;
      const y1 = el.getBoundingClientRect().top;
      const delta = y0 - y1;
      if (Math.abs(delta) < 2) continue;

      el.style.transform = `translateY(${delta}px)`;
      el.style.transition = 'none';
      modifiedElements.push(el);
    }

    if (modifiedElements.length === 0) return;

    // Phase 2 (Commit): 唯一一次 layout
    void editor.offsetHeight;

    // Phase 3 (Play): 一个 rAF 统一启动
    requestAnimationFrame(() => {
      for (const el of modifiedElements) {
        el.style.transition = `transform 250ms ${SCROLL_CURVE}`;
        el.style.transform = '';
      }
      setTimeout(() => {
        modifiedElements.forEach(el => {
          el.style.transform = '';
          el.style.transition = '';
        });
      }, 300);
    });
  });
}

function durationForDistance(dist: number): number {
  if (dist < 20) return SCROLL_DURATION_TIERS[0];
  if (dist < 60) return SCROLL_DURATION_TIERS[1];
  if (dist < 150) return SCROLL_DURATION_TIERS[2];
  if (dist < 400) return SCROLL_DURATION_TIERS[3];
  return SCROLL_DURATION_TIERS[4];
}

interface SmoothScrollOptions {
  deltaY: number;
  duration?: number;
}

function smoothScroll(target: HTMLElement, options: SmoothScrollOptions): void {
  const { deltaY, duration } = options;

  isScrolling = true;
  dbg.setField("isScrolling", true);

  if (pendingScroll !== null && pendingScrollTarget === target) {
    pendingScrollEnd = target.scrollTop + deltaY;
    dbg.setField("pendingScrollEnd", pendingScrollEnd);
    return;
  }

  if (pendingScroll !== null) cancelAnimationFrame(pendingScroll);

  pendingScrollTarget = target;
  pendingScrollEnd = target.scrollTop + deltaY;

  const startScroll = target.scrollTop;
  const startTime = performance.now();
  const dur = duration ?? durationForDistance(Math.abs(deltaY));

  dbg.push("smoothScroll:start", {
    startScrollTop: startScroll,
    targetScrollTop: pendingScrollEnd,
    duration: dur,
  });

  function step() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / dur, 1);
    const eased = easeOutCubic(t);
    const maxScroll = target.scrollHeight - target.clientHeight;
    const currentEnd = pendingScrollEnd;
    target.scrollTop = Math.max(0, Math.min(
        startScroll + (currentEnd - startScroll) * eased,
        maxScroll
    ));
    dbg.setField("scrollTop", target.scrollTop);
    if (dbg.isEnabled()) {
      dbg.push("raf", { progress: t.toFixed(3), scrollTop: target.scrollTop });
    }
    if (t < 1) {
      pendingScroll = requestAnimationFrame(step);
      dbg.setField("scrollRafId", pendingScroll);
    } else {
      pendingScroll = null;
      pendingScrollTarget = null;
      dbg.setField("isScrolling", false);
      dbg.setField("scrollTop", target.scrollTop);
      dbg.push("smoothScroll:end", { finalScrollTop: target.scrollTop });
      setTimeout(() => { isScrolling = false; }, 100);
    }
  }
  pendingScroll = requestAnimationFrame(step);
  dbg.setField("scrollRafId", pendingScroll);
}

function scheduleCheck(): void {
  if (pendingCheck !== null) return; // already scheduled, merge
  pendingCheck = requestAnimationFrame(() => {
    pendingCheck = null;
    checkAndScroll();
  });
}

function checkAndScroll(): void {
  // 打字机模式关闭时：不自动滚动
  if (!inputMode.isTypewriterActive()) return;

  // 暂停场景（悬浮窗 / 只读 / 嵌入块）：不滚动
  if (shouldPauseTypewriter()) return;

  // 动画进行中：不触发新 scroll，防止连续 keystroke 雪崩到 clamp 边界
  if (isScrolling) return;

  const rect = getCursorRect();
  if (!rect) return;

  // 光标未移动则跳过：浏览器可能在 caret blink / IME 更新时反复触发
  // selectionchange，但 getClientRects 返回的 viewport 坐标不变。
  // 避免无意义的 DOM 遍历 + debug 噪声。
  const prevY = lastCheckRect?.y;
  if (
    lastCheckRect &&
    Math.abs(rect.x - lastCheckRect.x) < 1 &&
    Math.abs(rect.y - lastCheckRect.y) < 1 &&
    Math.abs(rect.width - lastCheckRect.width) < 1 &&
    Math.abs(rect.height - lastCheckRect.height) < 1
  ) {
    return;
  }
  lastCheckRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };

  // 光标垂直跳跃（>3px）→ 块插入/删除后 SiYuan 布局未收敛，"弹跳"到错误位置
  // 再纠正回来。推迟一帧等布局稳定。正常打字（同行 x 变 y 不变）不触发。
  if (prevY !== undefined && Math.abs(rect.y - prevY) > 3) {
    requestAnimationFrame(() => checkAndScroll());
    return;
  }

  // 使用 isInAllowElements 复用 cursor 模块验证过的选择器逻辑
  // 内部使用 cursorElement.closest(".protyle:not(.fn__none) .protyle-content")
  // 正确找到当前活跃编辑器的 protyle-content（包括分屏场景）
  const result = isInAllowElements({ x: rect.x, y: rect.y });

  // allowed 为 false 时，如果 editorRect 不可用，说明光标不在有效编辑区域
  // （标题区域在 boundary.ts 返回 allowed:true 但没有 editorRect，此处也会被过滤）
  if (!result.editorRect) return;
  if (!result.cursorElement) return;

  // 新增：空块守卫。光标在空块时 typewriter scroll 无意义（块高近 0，cursor
  // 在块顶），且 getCursorRect 已走非突变 fallback 也无 cursorPct 可言。
  // 同时这是防御层：即使未来 fallback 路径再次突变 DOM，空块也直接退出。
  const cursorBlock = result.cursorElement.closest('[data-node-id]');
  if (cursorBlock) {
    const text = cursorBlock.textContent?.trim() ?? '';
    const isEmptyBlock = text === ''
      && !cursorBlock.querySelector(
        'img, iframe, [data-type^="NodeMathBlock"], [data-type^="NodeCodeBlock"]',
      );
    if (isEmptyBlock) return;
  }

  // 缓存命中：同一 cursorElement 复用上次的 scroll container，避免每次都 DOM 遍历
  let container: HTMLElement | null;
  if (result.cursorElement === cachedCursorElement && cachedContainer) {
    container = cachedContainer;
  } else {
    container = findClosestScrollableElement(result.cursorElement);
    cachedContainer = container;
    cachedCursorElement = result.cursorElement;
  }
  if (!container) return;

  dbg.setField("cursor", rect);
  dbg.setField("editor", result.editorRect);
  dbg.setField("container", container);
  dbg.setField("scrollTop", container.scrollTop);
  dbg.setField("scrollHeight", container.scrollHeight);
  dbg.setField("clientHeight", container.clientHeight);
  dbg.setField("pendingScrollEnd", pendingScrollEnd);

  // 使用 editorRect（protyle-content 的 bounding rect）作为滚动锚点
  // 而非 container.getBoundingClientRect()（可能是更大的祖先元素）
  // 注：AllowResult.editorRect 只有 top/bottom/left/right，无 height 字段（不像 DOMRect）
  const editorHeight = result.editorRect.bottom - result.editorRect.top;
  const cursorPct = (rect.y - result.editorRect.top) / editorHeight;

  // v2.3.0：舒适区间 [COMFORT_ZONE[0], COMFORT_ZONE[1]]，区间内不滚
  // 符号约定：smoothScroll 中 deltaY > 0 = scrollTop 增加 = 页面/视口向下滚
  // 因此要让 cursor 在视口里"下移"（cursor 在顶部时），需要 deltaY < 0（向上滚）
  let deltaY = 0;
  if (cursorPct < COMFORT_ZONE[0]) {
    // 光标在舒适区上方 → deltaY 负（向上滚）→ cursor 在视口里下移到 COMFORT_ZONE[0]
    deltaY = (cursorPct - COMFORT_ZONE[0]) * editorHeight;
  } else if (cursorPct > COMFORT_ZONE[1]) {
    // 光标在舒适区下方 → deltaY 正（向下滚）→ cursor 在视口里上移到 COMFORT_ZONE[1]
    deltaY = (cursorPct - COMFORT_ZONE[1]) * editorHeight;
  }
  // else: 舒适区内，deltaY = 0，不滚

  dbg.setField("cursorPct", cursorPct);
  dbg.setField("deltaY", deltaY);
  // 全量记录：保留完整 cursorPct/deltaY 历史，state() 快照可读
  dbg.push("checkAndScroll", { cursorPct, deltaY, comfortZone: COMFORT_ZONE });

  // 仅重要事件 push 到 events + console：光标偏离舒适区且 deltaY 非零
  // （即真正触发 scroll 的时刻），过滤掉舒适区内 deltaY=0 的循环噪音
  const isOutsideComfortZone = cursorPct < COMFORT_ZONE[0] || cursorPct > COMFORT_ZONE[1];
  dbg.push(
    "checkAndScroll:important",
    { cursorPct, deltaY },
    isOutsideComfortZone && deltaY !== 0,
  );

  if (Math.abs(deltaY) >= 1) {
    smoothScroll(container, { deltaY });
  }
}

export function initTypewriter(): void {
  // 事件数组使用三元组以便保留 options
  const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
    ["selectionchange", scheduleCheck],
    ["keyup", scheduleCheck],
    ["keydown", scheduleCheck],
    ["click", scheduleCheck],
    ["mouseup", scheduleCheck],
    ["resize", scheduleCheck],
    // Enter / Backspace 块变更 → 块级 FLIP 过渡动画
    // capture 阶段：先于 SiYuan bubble handler，在 DOM 变更前快照块位置
    [
      "keydown",
      (e) => {
        const ke = e as KeyboardEvent;
        if (ke.key !== "Enter" && ke.key !== "Backspace") return;
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const editor = sel.anchorNode?.parentElement?.closest(
          ".protyle-wysiwyg",
        ) as HTMLElement | null;
        if (editor) animateBlockShift(editor);
      },
      { capture: true },
    ],
  ];

  // 解构必须包含第三个元素，否则 passive 等选项会被丢弃
  handlers.forEach(([event, handler, options]) => {
    document.addEventListener(event, handler as EventListener, options);
  });
  eventListeners = handlers;

  // 初始化时立即激活打字机模式状态
  // setBothOn 是幂等的，多次调用安全；cursor 模块也会在 input 事件中调用
  inputMode.setBothOn();
}

export function destroyTypewriter(): void {
  eventListeners.forEach(([event, handler]) => {
    document.removeEventListener(event, handler);
  });
  eventListeners = [];

  if (pendingScroll !== null) {
    cancelAnimationFrame(pendingScroll);
    pendingScroll = null;
  }

  if (pendingCheck !== null) {
    cancelAnimationFrame(pendingCheck);
    pendingCheck = null;
  }
  cachedContainer = null;
  cachedCursorElement = null;
  lastCheckRect = null;
  pendingScrollTarget = null;
  pendingScrollEnd = 0;
  isScrolling = false;

  dbg.clearFields();
}
