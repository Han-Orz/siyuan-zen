/**
 * 获取文本光标的视口坐标。
 * 基于 Neo-Plus `getselection.ts` 算法：
 * 1. 优先用浏览器原生 Range.getClientRects()
 * 2. 空时插入零宽字符作为 fallback
 */
export function getCursorRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);

  const rects = Array.from(range.getClientRects());
  if (rects.length > 0) {
    return rects[rects.length - 1];
  }

  // Fallback: 插入零宽字符作为占位
  try {
    const marker = document.createTextNode("\u200B");
    range.insertNode(marker);
    // Text 节点本身没有 getBoundingClientRect，但作为 Element 子类运行时存在。
    const rect = (marker as unknown as Element).getBoundingClientRect();
    marker.remove();
    return rect;
  } catch {
    return null;
  }
}

/**
 * 获取当前 selection 所在的 DOM 元素。
 */
export function getCursorElement(): Element | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const container = range.startContainer;
  return container.nodeType === Node.TEXT_NODE
    ? container.parentElement
    : (container as Element);
}