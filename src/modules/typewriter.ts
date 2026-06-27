import { getCursorRect } from "../utils/getCursorRect";
import { shouldPauseTypewriter } from "../utils/edgeCases";
import { addStyle, removeStyle } from "../utils/styleManager";
import typewriterCss from "../styles/index.scss";

const STYLE_ID = "typewriter";
const HIGHLIGHT_ID = "zentype-highlight-line";
const TARGET_RATIO = 0.38; // 38% 高度
const THRESHOLD = 40; // 触发阈值（px）
const DURATION = 400; // 滚动时长（ms）

let highlightEl: HTMLDivElement | null = null;
let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];
let pendingScroll: number | null = null;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getEditorContainer(): HTMLElement | null {
  return document.querySelector(".protyle:not(.fn__none) .protyle-content");
}

function createHighlightElement(): HTMLDivElement {
  let el = document.getElementById(HIGHLIGHT_ID) as HTMLDivElement | null;
  if (el) return el;
  el = document.createElement("div");
  el.id = HIGHLIGHT_ID;
  document.body.appendChild(el);
  return el;
}

function updateHighlight(rect: DOMRect): void {
  if (!highlightEl) return;
  highlightEl.style.transform = `translate3d(0, ${rect.top - 4}px, 0)`;
  highlightEl.style.height = `${rect.height + 8}px`;
  highlightEl.style.left = `${rect.left}px`;
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
  const offset = rect.top - targetY;

  if (Math.abs(offset) >= THRESHOLD) {
    smoothScroll(container, offset);
  }
}

export function initTypewriter(): void {
  // 创建 DOM + 注入 CSS（避免依赖 cursor 模块的样式注入）
  highlightEl = createHighlightElement();
  addStyle(STYLE_ID, typewriterCss);

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

  removeStyle(STYLE_ID);
}
