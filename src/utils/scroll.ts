/**
 * 滚动容器检测工具 —— P2 去重。
 * hasScroll / findAllScrollableAncestors / findClosestScrollableElement
 * 统一从此文件导入。
 *
 * 之前这些函数在 cursor.ts 和 boundary.ts 中各有一份实现：
 *   - cursor.ts:hasScroll / findAllScrollableAncestors（被 bindScrollContainerEvents 使用）
 *   - boundary.ts:findClosestScrollableElement（被 AABB 第 3 重回退检测使用）
 *
 * 现在合并到此处，未来 CSS 规范变化（如新增 overflow: clip）只需改一处。
 */

/** 判断元素是否可滚动（overflow: scroll/auto 且有实际溢出内容） */
export function hasScroll(el: Element): boolean {
  const style = window.getComputedStyle(el);
  const canY =
    (style.overflowY === "scroll" || style.overflowY === "auto") &&
    el.scrollHeight > el.clientHeight;
  const canX =
    (style.overflowX === "scroll" || style.overflowX === "auto") &&
    el.scrollWidth > el.clientWidth;
  return canY || canX;
}

/** 找到从 el 向上（直到 documentElement）所有可滚动祖先 + body/html */
export function findAllScrollableAncestors(el: Element): HTMLElement[] {
  const result: HTMLElement[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    if (hasScroll(current)) result.push(current as HTMLElement);
    current = current.parentElement;
  }
  [document.body, document.documentElement].forEach((root) => {
    if (root && hasScroll(root)) result.push(root as HTMLElement);
  });
  return result;
}

/** 找到最近的含滚动条的祖先元素（用于 boundary.ts AABB 回退检测） */
export function findClosestScrollableElement(el: Element): HTMLElement | null {
  let current: Element | null = el;
  while (
    current &&
    current !== document.body &&
    current !== document.documentElement
  ) {
    if (hasScroll(current)) return current as HTMLElement;
    current = current.parentElement;
  }

  // 检查根元素
  const roots: HTMLElement[] = [document.body, document.documentElement];
  for (const root of roots) {
    const style = window.getComputedStyle(root);
    const canScrollY =
      (style.overflowY === "scroll" || style.overflowY === "auto") &&
      root.scrollHeight > root.clientHeight;
    const canScrollX =
      (style.overflowX === "scroll" || style.overflowX === "auto") &&
      root.scrollWidth > root.clientWidth;
    if (canScrollY || canScrollX) return root;
  }
  return null;
}
