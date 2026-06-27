import { getCursorElement } from "./getCursorRect";

/**
 * 边界场景判定工具集。
 * 每个函数独立无副作用，便于在模块中按需调用。
 */

/** 选中了任意文本（拖蓝） */
export function hasSelection(): boolean {
  const sel = window.getSelection();
  return (sel?.toString().length ?? 0) > 0;
}

/** 思源编辑器处于只读状态 */
export function isReadMode(): boolean {
  // 思源 `.protyle-content` 始终是 HTMLElement；querySelector 可能返回 null。
  const editor = document.querySelector(".protyle-content") as HTMLElement | null;
  return !editor || !editor.isContentEditable;
}

/** 悬浮窗（block__popover）处于打开状态 */
export function isInPopup(): boolean {
  return !!document.querySelector(".block__popover--open");
}

/** 文本光标在嵌入块里（iframe / video / PDF） */
export function isInEmbedBlock(): boolean {
  const cursor = getCursorElement();
  if (!cursor) return false;
  return !!cursor.closest(
    "iframe, video, [data-type='NodeIFrame'], [data-type='NodeVideo'], [data-type='NodePDF']"
  );
}

/** 文本光标在思源主编辑器内（不在悬浮窗/对话框里） */
export function isInMainEditor(): boolean {
  const cursor = getCursorElement();
  if (!cursor) return false;
  return !!cursor.closest(".protyle:not(.fn__none) .protyle-content");
}

/**
 * 顺滑光标不暂停。它总是返回 false。
 * 保留此函数以保持 API 一致性。
 */
export function shouldPauseCursor(): boolean {
  return false;
}

/**
 * 聚焦 + 打字机需要暂停的场景。
 * 包含：选中多行、悬浮窗编辑。
 */
export function shouldPauseFocusAndTypewriter(): boolean {
  if (hasSelection()) return true;
  if (isInPopup()) return true;
  return false;
}

/**
 * 打字机模式额外需要暂停的场景。
 * 包含：悬浮窗、只读、嵌入块。
 */
export function shouldPauseTypewriter(): boolean {
  if (isInPopup()) return true;
  if (isReadMode()) return true;
  if (isInEmbedBlock()) return true;
  return false;
}