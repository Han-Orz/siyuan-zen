import { getActiveEditor } from "siyuan";
import { getCursorRect } from "../utils/getCursorRect";
import type { CursorRect } from "../types";
import { TYPEWRITER_CONFIG } from "../config";
import { shouldPauseTypewriter } from "../utils/edgeCases";
import { getEffectiveZIndex } from "../utils/getEffectiveZIndex";
import * as inputMode from "./inputMode";

const HIGHLIGHT_ID = "zentype-highlight-line";
const { TARGET_RATIO, THRESHOLD, DURATION } = TYPEWRITER_CONFIG;

let highlightEl: HTMLDivElement | null = null;
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

function createHighlightElement(): HTMLDivElement {
  let el = document.getElementById(HIGHLIGHT_ID) as HTMLDivElement | null;
  if (el) return el;
  el = document.createElement("div");
  el.id = HIGHLIGHT_ID;
  document.body.appendChild(el);
  return el;
}

function updateHighlight(rect: CursorRect): void {
  if (!highlightEl) return;
  // 思源全屏模式会给容器一个高 z-index；用 getEffectiveZIndex 沿祖先链取最大层叠上下文 z-index
  const container = getEditorContainer();
  const editorZ = container ? getEffectiveZIndex(container) : 0;
  highlightEl.style.zIndex = String(Math.max(editorZ + 1, 1000));
  highlightEl.style.transform = `translate3d(0, ${rect.y - 4}px, 0)`;
  highlightEl.style.height = `${rect.height + 8}px`;
  highlightEl.style.left = `${rect.x}px`;
  highlightEl.style.width = `${rect.width || 100}px`;
  highlightEl.classList.add("visible");
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
  // 打字机模式关闭时：不显示高亮条，不自动滚动
  if (!inputMode.isTypewriterActive()) {
    highlightEl?.classList.remove("visible");
    return;
  }

  if (shouldPauseTypewriter()) {
    highlightEl?.classList.remove("visible");
    return;
  }

  const rect = getCursorRect();
  if (!rect) {
    highlightEl?.classList.remove("visible");
    return;
  }

  const container = getEditorContainer();
  if (!container) return;

  // 更新高亮条（总是更新）
  updateHighlight(rect);

  // 计算距离并决定是否滚动
  const containerRect = container.getBoundingClientRect();
  const targetY = containerRect.top + containerRect.height * TARGET_RATIO;
  const offset = rect.y - targetY;

  if (Math.abs(offset) >= THRESHOLD) {
    smoothScroll(container, offset);
  }
}

export function initTypewriter(): void {
  // 创建 DOM（CSS 由 index.ts 在插件加载时统一注入）
  highlightEl = createHighlightElement();

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

  if (highlightEl) {
    highlightEl.remove();
    highlightEl = null;
  }
}
