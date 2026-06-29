/**
 * 从当前选区获取光标所在的 DOM 元素。
 * 与 legacy / Neo-Plus 一致：取 range.startContainer；文本节点回退到 parentElement。
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