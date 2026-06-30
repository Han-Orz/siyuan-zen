import { getCursorRect } from "../utils/getCursorRect";
import { findClosestScrollableElement } from "../utils/scroll";
import { TYPEWRITER_CONFIG } from "../config";
import { shouldPauseTypewriter } from "../utils/edgeCases";
import * as inputMode from "./inputMode";
import { isInAllowElements } from "./cursor/boundary";

const { COMFORT_ZONE, SCROLL_DURATION_TIERS, SCROLL_CURVE } = TYPEWRITER_CONFIG;

let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];
let pendingScroll: number | null = null;
let pendingScrollTarget: HTMLElement | null = null;
let pendingScrollEnd: number = 0;
let pendingCheck: number | null = null;
let cachedContainer: HTMLElement | null = null;
let cachedCursorElement: Element | null = null;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function durationForDistance(dist: number): number {
  // 从 config 查表（SCROLL_DURATION_TIERS: [120, 180, 260, 360, 500]）
  // 分档阈值与旧版一致：[0-20)→120, [20-60)→180, [60-150)→260, [150-400)→360, [400+∞)→500
  if (dist < 20) return SCROLL_DURATION_TIERS[0];
  if (dist < 60) return SCROLL_DURATION_TIERS[1];
  if (dist < 150) return SCROLL_DURATION_TIERS[2];
  if (dist < 400) return SCROLL_DURATION_TIERS[3];
  return SCROLL_DURATION_TIERS[4];
}

interface SmoothScrollOptions {
  deltaY: number;
  /** 覆盖 config 分档（可选）。 */
  duration?: number;
  /** 覆盖 SCROLL_CURVE（可选，用于 FLIP 等特殊场景）。当前 rAF 路径暂未接入。 */
  curve?: string;
}

function smoothScroll(target: HTMLElement, options: SmoothScrollOptions): void {
  const { deltaY, duration, curve } = options;
  // curve 暂存以备未来 CSS scroll-behavior 或 animateNaturalReflow 使用；
  // 当前 rAF 路径仍使用 easeInOutCubic 作为缓动函数。
  const _curve = curve ?? SCROLL_CURVE;

  // 续接：同一 target 且动画进行中，仅追加 deltaY，动画继续
  if (pendingScroll !== null && pendingScrollTarget === target) {
    pendingScrollEnd += deltaY;
    return;
  }

  // 否则取消旧动画（新 target 或旧动画完成）
  if (pendingScroll !== null) cancelAnimationFrame(pendingScroll);

  pendingScrollTarget = target;
  pendingScrollEnd = target.scrollTop + deltaY;

  const startScroll = target.scrollTop;
  const startTime = performance.now();
  const dur = duration ?? durationForDistance(Math.abs(deltaY));

  function step() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / dur, 1);
    const eased = easeInOutCubic(t);
    const maxScroll = target.scrollHeight - target.clientHeight;
    const currentEnd = pendingScrollEnd; // read latest
    target.scrollTop = Math.max(0, Math.min(
        startScroll + (currentEnd - startScroll) * eased,
        maxScroll
    ));
    if (t < 1) {
      pendingScroll = requestAnimationFrame(step);
    } else {
      pendingScroll = null;
      pendingScrollTarget = null;
    }
  }
  pendingScroll = requestAnimationFrame(step);
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

  const rect = getCursorRect();
  if (!rect) return;

  // 使用 isInAllowElements 复用 cursor 模块验证过的选择器逻辑
  // 内部使用 cursorElement.closest(".protyle:not(.fn__none) .protyle-content")
  // 正确找到当前活跃编辑器的 protyle-content（包括分屏场景）
  const result = isInAllowElements({ x: rect.x, y: rect.y });

  // allowed 为 false 时，如果 editorRect 不可用，说明光标不在有效编辑区域
  // （标题区域在 boundary.ts 返回 allowed:true 但没有 editorRect，此处也会被过滤）
  if (!result.editorRect) return;
  if (!result.cursorElement) return;

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

  // 使用 editorRect（protyle-content 的 bounding rect）作为滚动锚点
  // 而非 container.getBoundingClientRect()（可能是更大的祖先元素）
  // 注：AllowResult.editorRect 只有 top/bottom/left/right，无 height 字段（不像 DOMRect）
  const editorHeight = result.editorRect.bottom - result.editorRect.top;
  const cursorPct = (rect.y - result.editorRect.top) / editorHeight;

  // v2.3.0：舒适区间 [COMFORT_ZONE[0], COMFORT_ZONE[1]]，区间内不滚
  let deltaY = 0;
  if (cursorPct < COMFORT_ZONE[0]) {
    // 光标在舒适区上方 → 滚到 COMFORT_ZONE[0]
    deltaY = (COMFORT_ZONE[0] - cursorPct) * editorHeight;
  } else if (cursorPct > COMFORT_ZONE[1]) {
    // 光标在舒适区下方 → 滚到 COMFORT_ZONE[1]
    deltaY = (COMFORT_ZONE[1] - cursorPct) * editorHeight;
  }
  // else: 舒适区内，deltaY = 0，不滚

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
  pendingScrollTarget = null;
  pendingScrollEnd = 0;
}
