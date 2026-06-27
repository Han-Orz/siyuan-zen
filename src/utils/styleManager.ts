/**
 * 样式管理器。
 * 用于注入和清理模块所需的 <style> 标签。
 */

const styleMap = new Map<string, HTMLStyleElement>();

export function addStyle(id: string, css: string): void {
  if (styleMap.has(id)) {
    console.warn(`[zenType] style "${id}" already added`);
    return;
  }

  const style = document.createElement("style");
  style.id = `zentype-${id}`;
  style.textContent = css;
  document.head.appendChild(style);
  styleMap.set(id, style);
}

export function removeStyle(id: string): void {
  const style = styleMap.get(id);
  if (style) {
    style.remove();
    styleMap.delete(id);
  }
}