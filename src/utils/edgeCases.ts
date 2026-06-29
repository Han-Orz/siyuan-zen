import { getActiveEditor } from "siyuan";
import { getCursorElement } from "./getCursorElement";

/**
 * 边界场景判定工具集。
 * 每个函数独立无副作用，便于在模块中按需调用。
 */

/** 选中了任意文本（拖蓝） */
export function hasSelection(): boolean {
  const sel = window.getSelection();
  return (sel?.toString().length ?? 0) > 0;
}

/** 思源编辑器处于只读状态（P2 修复：用 getActiveEditor 定位到当前活跃编辑器） */
export function isReadMode(): boolean {
  const activeEditor = getActiveEditor();
  if (!activeEditor) return true; // 无活跃编辑器 → 视为只读
  // protyle.element 是编辑器根元素；查询其中的 .protyle-content 判定只读
  const contentEl = activeEditor.protyle.element.querySelector(
    ".protyle-content",
  ) as HTMLElement | null;
  return !contentEl || !contentEl.isContentEditable;
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