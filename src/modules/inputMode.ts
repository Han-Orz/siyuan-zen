/**
 * 聚焦 / 打字机模式状态管理。
 *
 * 两个独立状态（focusActive / typewriterActive），共享同一套 ON/OFF 触发规则。
 * 设计决策：Option A（全局状态 + 订阅机制，无 EventBus）。
 * 参见 docs/FOCUS_TYPEWRITER_DESIGN.md §3。
 *
 * 触发规则（§2.2 / §2.6）：
 *   ON  ← keyboard input、IME compositionend
 *   OFF ← wheel、↑/↓、PageUp/Down、鼠标 click、鼠标 drag-select、切 tab、blur
 *   Keep ON：←/→、Home、End、Escape
 */

// ── 状态 ──────────────────────────────────────────────────────────────
let focusActive = false;
let typewriterActive = false;

// ── 订阅 ──────────────────────────────────────────────────────────────
type Subscriber = (state: { focusActive: boolean; typewriterActive: boolean }) => void;
const subscribers = new Set<Subscriber>();

function notify(): void {
  const state = { focusActive, typewriterActive };
  subscribers.forEach((cb) => {
    try { cb(state); } catch (e) { console.error("[zenType] inputMode subscriber threw:", e); }
  });
}

/** 订阅状态变化；返回退订函数。 */
export function subscribe(cb: Subscriber): () => void {
  subscribers.add(cb);
  cb({ focusActive, typewriterActive });
  return () => { subscribers.delete(cb); };
}

// ── 外部触发 API ──────────────────────────────────────────────────────

/** 键盘输入 / IME 完成 → 同时开启两者 */
export function setBothOn(): void {
  if (focusActive && typewriterActive) return; // 无变化
  focusActive = true;
  typewriterActive = true;
  notify();
}

/** 退出事件 → 同时关闭两者 */
export function setBothOff(): void {
  if (!focusActive && !typewriterActive) return; // 已关闭
  focusActive = false;
  typewriterActive = false;
  notify();
}

/** 命令："模拟一次输入" → 仅开启聚焦模式 */
export function simulateFocusInput(): void {
  if (focusActive) return;
  focusActive = true;
  notify();
}

/** 命令："模拟一次输入" → 仅开启打字机模式 */
export function simulateTypewriterInput(): void {
  if (typewriterActive) return;
  typewriterActive = true;
  notify();
}

/** 命令："手动关闭聚焦模式" → 仅关闭聚焦模式 */
export function disableFocus(): void {
  if (!focusActive) return;
  focusActive = false;
  notify();
}

/** 命令："手动关闭打字机模式" → 仅关闭打字机模式 */
export function disableTypewriter(): void {
  if (!typewriterActive) return;
  typewriterActive = false;
  notify();
}

// ── 查询 API ──────────────────────────────────────────────────────────

export function isFocusActive(): boolean {
  return focusActive;
}

export function isTypewriterActive(): boolean {
  return typewriterActive;
}

/** 任一模式激活 */
export function isEitherActive(): boolean {
  return focusActive || typewriterActive;
}

// ── 重置（onunload） ─────────────────────────────────────────────────

export function reset(): void {
  focusActive = false;
  typewriterActive = false;
  subscribers.clear();
}
