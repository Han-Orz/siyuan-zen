import { getActiveEditor } from "siyuan";
import { getCursorRect } from "../utils/getCursorRect";
import { TYPEWRITER_CONFIG } from "../config";
import { shouldPauseTypewriter } from "../utils/edgeCases";
import * as inputMode from "./inputMode";

const { TARGET_RATIO, THRESHOLD, DURATION } = TYPEWRITER_CONFIG;

let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];
let pendingScroll: number | null = null;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getEditorContainer(): HTMLElement | null {
  // P2: 改用官方 getActiveEditor() 替代 .protyle:not(.fn__none) DOM 遍历
  // 分屏时正确找到活跃编辑器的 .protyle-content
  const activeEditor = getActiveEditor();
  if (!activeEditor) return null;
  return activeEditor.protyle.element.querySelector(
    ".protyle-content",
  ) as HTMLElement | null;
}

function smoothScroll(target: HTMLElement, deltaY: number): void {
  if (pendingScroll !== null) cancelAnimationFrame(pendingScroll);

  const startScroll = target.scrollTop;
  const endScroll = startScroll + deltaY;
  const startTime = performance.now();

  function step() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / DURATION, 1);
    const eased = easeInOutCubic(t);
    target.scrollTop = startScroll + (endScroll - startScroll) * eased;
    if (t < 1) {
      pendingScroll = requestAnimationFrame(step);
    } else {
      pendingScroll = null;
    }
  }
  pendingScroll = requestAnimationFrame(step);
}

function checkAndScroll(): void {
  // 打字机模式关闭时：不自动滚动
  if (!inputMode.isTypewriterActive()) return;

  // 暂停场景（悬浮窗 / 只读 / 嵌入块）：不滚动
  if (shouldPauseTypewriter()) return;

  const rect = getCursorRect();
  if (!rect) return;

  const container = getEditorContainer();
  if (!container) return;

  // 计算距离并决定是否滚动
  const containerRect = container.getBoundingClientRect();
  const targetY = containerRect.top + containerRect.height * TARGET_RATIO;
  const offset = rect.y - targetY;

  if (Math.abs(offset) >= THRESHOLD) {
    smoothScroll(container, offset);
  }
}

export function initTypewriter(): void {
  // 事件数组使用三元组以便保留 options
  const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
    ["selectionchange", checkAndScroll],
    ["keyup", checkAndScroll],
    ["keydown", checkAndScroll],
    ["click", checkAndScroll],
    ["mouseup", checkAndScroll],
    ["resize", checkAndScroll],
  ];

  // 解构必须包含第三个元素，否则 passive 等选项会被丢弃
  handlers.forEach(([event, handler, options]) => {
    document.addEventListener(event, handler as EventListener, options);
  });
  eventListeners = handlers;
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
}
