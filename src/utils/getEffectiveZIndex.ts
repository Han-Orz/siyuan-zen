/**
 * 从目标元素向上遍历祖先链，返回祖先链中最高的显式 z-index。
 * 用于替代硬编码的 window.siyuan.zIndex。
 *
 * 层叠上下文条件（CSS spec 完整列表的子集，覆盖常见 case）：
 * 注意：opacity/transform 会创建 stacking context，但 z-index 为 auto 时
 * 不应截断向上查找。Ripple 会给块设置 opacity，如果在这里返回 0，
 * 就会看不到外层 .fullscreen { z-index: 8 }，导致全屏模式下光标被盖住。
 *
 * 参考 参考/顺滑光标验证版.js:645-679（仅实现 1+2，扩展了 3+4）。
 */

export function getEffectiveZIndex(targetElement: Element): number {
  let current: Element | null = targetElement;
  let maxZIndex = 0;

  while (current && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const zIndex = style.zIndex;

    if (zIndex !== "auto") {
      const parsed = parseInt(zIndex, 10);
      if (!Number.isNaN(parsed)) maxZIndex = Math.max(maxZIndex, parsed);
    }

    current = current.parentElement;
  }

  return maxZIndex;
}
