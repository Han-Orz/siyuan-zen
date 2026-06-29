import { getCursorElement } from "../utils/getCursorElement";
import { shouldPauseFocusAndTypewriter, isReadMode } from "../utils/edgeCases";
import type { RippleMode } from "../types";
import { RIPPLE_CONFIG } from "../config";
import * as inputMode from "./inputMode";

/**
 * 涟漪聚焦模块 - 文本/鼠标双模式状态机
 *
 * 三种模式：
 *  - text   : 默认。涟漪以光标所在块为中心。
 *  - mouse  : 只读模式 / 空闲 2s / 鼠标进入其他块时触发，涟漪以鼠标所在块为中心。
 *  - paused : 多行选中 / 悬浮窗编辑。清除所有 opacity 覆盖。
 *
 * 设计：
 *  - 不注入 CSS（直接通过 JS 设置 style.opacity），所以本模块无样式注入问题。
 *  - 鼠标相关事件用 passive 提升编辑器滚动性能。
 *  - 所有事件监听器存入三元组数组，destroy 时统一清理（继承自 Task 3 经验）。
 */

const { OPACITY_LEVELS, MOUSE_THROTTLE, IDLE_THRESHOLD } = RIPPLE_CONFIG;
const SCROLLBAR_MARGIN = 20; // px

let mode: RippleMode = "text";
let lastTextCursorChange = 0;
let lastMouseBlock: Element | null = null;
let lastTextBlock: Element | null = null;
let pendingFrame: number | null = null;
let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];
let lastMouseMove = 0;

function getCurrentBlock(): Element | null {
  if (mode === "mouse" && lastMouseBlock) return lastMouseBlock;
  const cursor = getCursorElement();
  return cursor?.closest("[data-node-id]") ?? null;
}

function calculateBlockDistance(from: Element, to: Element): number {
  const fromParent = from.parentElement;
  if (!fromParent) return 0;
  const siblings = Array.from(fromParent.children);
  const fromIndex = siblings.indexOf(from);
  const toIndex = siblings.indexOf(to);
  return Math.abs(fromIndex - toIndex);
}

function isOverScrollbar(e: MouseEvent): boolean {
  // 简化判断：检测视口边缘（20px 缓冲带）
  const w = window.innerWidth;
  const h = window.innerHeight;
  return e.clientX > w - SCROLLBAR_MARGIN || e.clientY > h - SCROLLBAR_MARGIN;
}

function applyRipple(): void {
  if (pendingFrame !== null) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;

    // 聚焦模式关闭时：涟漪完全不工作（包括 mouse 模式）
    if (!inputMode.isFocusActive()) {
      clearAllOpacity();
      return;
    }

    if (shouldPauseFocusAndTypewriter()) {
      // 暂停时清除所有 opacity 覆盖，恢复默认
      clearAllOpacity();
      return;
    }

    const currentBlock = getCurrentBlock();
    if (!currentBlock) return;

    const container = currentBlock.closest(".protyle-wysiwyg");
    if (!container) return;

    const allBlocks = Array.from(
      container.querySelectorAll('[data-node-id], iframe, video')
    );

    allBlocks.forEach((block) => {
      const distance = calculateBlockDistance(currentBlock, block as Element);
      const opacity = OPACITY_LEVELS[Math.min(distance, OPACITY_LEVELS.length - 1)];
      (block as HTMLElement).style.opacity = String(opacity);
    });

    (currentBlock as HTMLElement).style.opacity = "1";
  });
}

function clearAllOpacity(): void {
  const blocks = document.querySelectorAll(
    '.protyle-wysiwyg [data-node-id], .protyle-wysiwyg iframe, .protyle-wysiwyg video'
  );
  blocks.forEach((block) => {
    (block as HTMLElement).style.opacity = "";
  });
}

function onSelectionChange(): void {
  lastTextCursorChange = Date.now();
  const cursor = getCursorElement();
  lastTextBlock = cursor?.closest("[data-node-id]") ?? null;

  // 文本事件：切回 text 模式（如果未在 paused），并重应用涟漪
  if (mode !== "paused") {
    mode = "text";
    applyRipple();
  }
}

function onMouseMove(e: MouseEvent): void {
  const now = Date.now();
  if (now - lastMouseMove < MOUSE_THROTTLE) return;
  lastMouseMove = now;

  // 鼠标在编辑器外：mouse → text
  const target = e.target as Element | null;
  if (!target?.closest(".protyle-wysiwyg")) {
    if (mode === "mouse") {
      mode = "text";
      applyRipple();
    }
    return;
  }

  // 鼠标在滚动条上：忽略
  if (isOverScrollbar(e)) return;

  const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
  if (!elementAtPoint) return;

  const mouseBlock = elementAtPoint.closest("[data-node-id], iframe, video");
  if (!mouseBlock) return;
  lastMouseBlock = mouseBlock as Element;

  // 决定是否切到 mouse 模式
  const readMode = isReadMode();
  const idleTooLong = now - lastTextCursorChange > IDLE_THRESHOLD;
  const mouseInDifferentBlock =
    lastTextBlock &&
    !mouseBlock.contains(lastTextBlock) &&
    !lastTextBlock.contains(mouseBlock);

  if (readMode || idleTooLong || mouseInDifferentBlock) {
    if (mode !== "mouse") {
      mode = "mouse";
    }
    applyRipple();
  }
}

export function initRipple(): void {
  mode = "text";
  lastTextCursorChange = Date.now();
  lastMouseBlock = null;
  lastTextBlock = null;
  pendingFrame = null;
  lastMouseMove = 0;

  // 事件数组使用三元组以便保留 options（mousemove 用 passive 提高滚动性能）
  const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
    ["selectionchange", onSelectionChange],
    ["mousemove", onMouseMove as EventListener, { passive: true }],
    ["click", onSelectionChange],
    ["keyup", onSelectionChange],
  ];

  // 解构必须包含第三个元素，否则 { passive: true } 会被丢弃
  handlers.forEach(([event, handler, options]) => {
    document.addEventListener(event, handler, options);
  });
  eventListeners = handlers;

  applyRipple();
}

export function destroyRipple(): void {
  eventListeners.forEach(([event, handler]) => {
    document.removeEventListener(event, handler);
  });
  eventListeners = [];

  if (pendingFrame !== null) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }

  clearAllOpacity();

  mode = "text";
  lastMouseBlock = null;
  lastTextBlock = null;
}