/**
 * 顺滑光标定位工具。
 *
 * getCursorRect()    — 应用 lineHeight × 1.1，返回 CursorRect { x, y, width, height }
 * getCursorElement() — 当前选区所在的 DOM 元素（见 ./getCursorElement.ts）
 *
 * 算法借鉴 Neo-Plus getselection.ts：
 *   1) 浏览器原生 Range.getClientRects()
 *   2) 空时用父 [data-node-id] 块的 bounding rect 作为 fallback（非突变）
 *
 * 设计决策：返回精简的 CursorRect 而不是 DOMRect——消费方只需要 x/y/width/height。
 * typewriter.ts / cursor.ts 直接消费，无需额外转换。
 */

import type { CursorRect } from "../types";
import { CURSOR_CONFIG } from "../config";
import { getCursorElement } from "./getCursorElement";
import { getLineHeight } from "./getLineHeight";

/** 用户可配置：见 src/config.ts :: CURSOR_CONFIG.HEIGHT_RATIO */
export const LINE_HEIGHT_RATIO = CURSOR_CONFIG.HEIGHT_RATIO;

/**
 * 获取光标的显示矩形。
 * 已应用 lineHeight × LINE_HEIGHT_RATIO，x/y 是 viewport 坐标。
 */
export function getCursorRect(): CursorRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);

  const rects = Array.from(range.getClientRects());
  let baseRect: DOMRect | null = null;
  if (rects.length > 0 && rects[0].height > 0) {
    // 取最后一个 rect（最接近光标位置，兼容多行选择）
    baseRect = rects[rects.length - 1];
  } else {
    baseRect = getEmptyBlockRect(range);
    if (!baseRect) return null;
  }

  const lineHeight = getLineHeight(range.startContainer);
  const height = lineHeight * LINE_HEIGHT_RATIO;

  // 垂直居中（rect.top 是 baseline，向上偏移让光标在行高中部）
  const gap = (baseRect.height - height) / 2;
  const y = baseRect.top + gap;
  // 光标在字符末尾：right 边缘就是下一个字符的起点
  const x = baseRect.right;

  return { x, y, width: baseRect.width, height };
}

/**
 * 非突变 fallback：当 Range.getClientRects() 返回 0-height rect（典型场景：
 * 光标在空块）时，沿 startContainer 向上找 [data-node-id] 块，用块的
 * bounding rect + lineHeight 构造虚拟光标 rect。
 *
 * 不插入 DOM，避免触发 selectionchange 级联（参考 PR 之前的 debug log
 * spam 226+ 行的根因）。
 *
 * @param range 已 collapse(true) 的 Range
 * @returns DOMRect 或 null（找不到块时）
 */
function getEmptyBlockRect(range: Range): DOMRect | null {
  let node: Node | null = range.startContainer;
  if (node.nodeType !== Node.ELEMENT_NODE) {
    node = node.parentNode;
  }
  if (!node) return null;
  const block = (node as Element).closest('[data-node-id]');
  if (!block) return null;

  // Walk up from startContainer to the direct child of [data-node-id].
  // The direct child's rect reflects the content-area position (accounting for
  // padding / inner containers), not the block's outer edge which may be offset.
  let contentEl: Element = node as Element;
  while (contentEl.parentElement && contentEl.parentElement !== block) {
    contentEl = contentEl.parentElement;
  }

  const rect = contentEl.getBoundingClientRect();
  const lineHeight = getLineHeight(range.startContainer);
  // 空块光标视为在内容区顶部，占据 lineHeight 高度
  return new DOMRect(rect.left, rect.top, 0, lineHeight);
}
