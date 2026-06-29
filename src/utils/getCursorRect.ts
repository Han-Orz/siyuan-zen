/**
 * 顺滑光标定位工具。
 *
 * getCursorRect()    — 应用 lineHeight × 1.1，返回 CursorRect { x, y, width, height }
 * getCursorElement() — 当前选区所在的 DOM 元素（见 ./getCursorElement.ts）
 *
 * 算法借鉴 Neo-Plus getselection.ts：
 *   1) 浏览器原生 Range.getClientRects()
 *   2) 空时插入零宽字符（ZWSP \u200B）作为 fallback
 *
 * 设计决策：返回精简的 CursorRect 而不是 DOMRect——消费方只需要 x/y/width/height。
 * typewriter.ts / cursor.ts 直接消费，无需额外转换。
 */

import type { CursorRect } from "../types";
import { getCursorElement } from "./getCursorElement";
import { getLineHeight } from "./getLineHeight";

/**
 * 全局复用 ZWSP marker —— 避免每次 fallback 新建 DOM 节点（round 3 优化）。
 * 参考 参考/顺滑光标验证版.js:142-149。
 * 用 span 而非 TextNode，因为孤立 TextNode 无法 getBoundingClientRect。
 */
const globalZWSPMarker = (() => {
  const span = document.createElement("span");
  span.textContent = "\u200B";
  span.style.cssText =
    "position: absolute; visibility: hidden; pointer-events: none;";
  return span;
})();

import { CURSOR_CONFIG } from "../config";

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
    baseRect = getZWSPRect(range);
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

/** ZWSP 降级：复用模块级 marker（不再每次新建），取完立即移除 */
function getZWSPRect(range: Range): DOMRect | null {
  try {
    range.insertNode(globalZWSPMarker);
    range.selectNode(globalZWSPMarker);
    const rect = range.getBoundingClientRect();
    globalZWSPMarker.remove();
    return rect;
  } catch {
    return null;
  }
}
