/**
 * 顺滑光标呼吸动画状态机。
 *
 * 修复 P0 BUG 1：原实现仅 initCursor() 末尾调用一次 startBlink()，
 * 每次 selectionchange/keydown/mousedown 都 stopBlink()，
 * 导致 .breathing 加上后永远不会再被加上 → 呼吸感丢失。
 *
 * 新设计（参考 legacy 顺滑光标.js）：
 *   - CSS 默认带 animation: zentype-breathe infinite
 *   - initBreathing() 时给 cursorEl 加 .no-animation（暂停）
 *   - resumeBreathe() 设 500ms 定时器，到期移除 .no-animation（恢复呼吸）
 *   - pauseBreathe() 立即加 .no-animation（停止呼吸）
 *   - updateCursor() 每次操作时 pauseBreathe()，然后 resumeBreathe()
 *   - destroyBreathing() 清理 timer + 移除 class
 */

import { CURSOR_CONFIG } from "../../config";

let cursorEl: HTMLElement | null = null;
let breatheTimer: number | null = null;

export function initBreathing(cursor: HTMLElement): void {
  cursorEl = cursor;
  // 默认 pause，等首次 updateCursor 后再 resume（避免 init 时一闪而过）
  cursorEl.classList.add("no-animation");
  // 不主动启动 resume，由 caller 在第一次 updateCursor 后调用
}

export function pauseBreathe(): void {
  if (!cursorEl) return;
  clearBreatheTimer();
  cursorEl.classList.add("no-animation");
}

export function resumeBreathe(): void {
  if (!cursorEl) return;
  clearBreatheTimer();
  breatheTimer = window.setTimeout(() => {
    if (!cursorEl) return;
    cursorEl.classList.remove("no-animation");
  }, CURSOR_CONFIG.BLINK_DELAY_MS);
}

export function destroyBreathing(): void {
  clearBreatheTimer();
  cursorEl?.classList.remove("no-animation");
  cursorEl = null;
}

function clearBreatheTimer(): void {
  if (breatheTimer !== null) {
    clearTimeout(breatheTimer);
    breatheTimer = null;
  }
}