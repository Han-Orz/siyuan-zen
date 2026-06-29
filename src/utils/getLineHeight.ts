/**
 * 获取指定节点所在可编辑行的 computed line-height。
 * 向上查找 [contenteditable="true"] 或 .protyle-title__input，取其 lineHeight；
 * lineHeight 为 normal/auto 时回退 fontSize × 1.625；最终 fallback 26。
 */
export function getLineHeight(node: Node): number {
  let el: Element | null =
    node.nodeType === Node.TEXT_NODE
      ? node.parentElement
      : (node as Element);

  while (el) {
    const editable = el.closest(
      '[contenteditable="true"]',
    ) as HTMLElement | null;
    if (editable) {
      return parseLineHeight(editable);
    }
    const title = el.closest(
      ".protyle-title__input",
    ) as HTMLElement | null;
    if (title) {
      return parseLineHeight(title);
    }
    el = el.parentElement;
  }
  return 26;
}

function parseLineHeight(el: HTMLElement): number {
  const style = window.getComputedStyle(el);
  const lh = parseFloat(style.lineHeight);
  if (!isNaN(lh) && lh > 0) return lh;
  const fs = parseFloat(style.fontSize);
  if (!isNaN(fs) && fs > 0) return fs * 1.625;
  return 26;
}