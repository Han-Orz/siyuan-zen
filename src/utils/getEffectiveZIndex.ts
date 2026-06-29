/**
 * 从目标元素向上遍历祖先链，找到第一个创建层叠上下文的元素，
 * 返回其 z-index 数值。用于替代硬编码的 window.siyuan.zIndex。
 *
 * 层叠上下文条件（CSS spec 完整列表的子集，覆盖常见 case）：
 *   1. position: fixed / sticky（自动创建，即使 z-index 为 auto）
 *   2. position: absolute / relative 且 z-index 非 auto
 *   3. opacity < 1
 *   4. transform 不为 none
 *
 * 参考 参考/顺滑光标验证版.js:645-679（仅实现 1+2，扩展了 3+4）。
 */

export function getEffectiveZIndex(targetElement: Element): number {
  let current: Element | null = targetElement;

  while (current && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const zIndex = style.zIndex;
    const position = style.position;

    // 条件 1：fixed / sticky 自动创建层叠上下文
    if (position === "fixed" || position === "sticky") {
      return zIndex === "auto" ? 0 : parseInt(zIndex, 10) || 0;
    }

    // 条件 2：absolute / relative + 非 auto z-index
    if (
      (position === "absolute" || position === "relative") &&
      zIndex !== "auto"
    ) {
      return parseInt(zIndex, 10) || 0;
    }

    // 条件 3：opacity < 1 创建层叠上下文
    if (parseFloat(style.opacity) < 1) {
      return 0;
    }

    // 条件 4：transform 非 none 创建层叠上下文
    if (style.transform !== "none") {
      return zIndex === "auto" ? 0 : parseInt(zIndex, 10) || 0;
    }

    current = current.parentElement;
  }

  return 0;
}
