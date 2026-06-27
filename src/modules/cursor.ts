import { getCursorRect } from "../utils/getCursorRect";
import { addStyle, removeStyle } from "../utils/styleManager";

// 思源笔记全局对象类型（src/types/index.d.ts 中的全局 Window 增强
// 因同目录存在 index.ts，未被作为 ambient 加载；此处局部声明以满足 strict 模式）
declare global {
  interface Window {
    siyuan?: {
      ws?: {
        ws?: WebSocket;
      };
    };
  }
}

const STYLE_ID = "cursor";
const CURSOR_ID = "zentype-cursor";
const BLINK_DELAY = 500;

let cursorEl: HTMLDivElement | null = null;
let blinkTimer: number | null = null;
let pendingFrame: number | null = null;
let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];

function createCursorElement(): HTMLDivElement {
  let el = document.getElementById(CURSOR_ID) as HTMLDivElement | null;
  if (el) return el;

  el = document.createElement("div");
  el.id = CURSOR_ID;
  el.classList.add("hidden");
  document.body.appendChild(el);
  return el;
}

function updateCursor(): void {
  if (!cursorEl || pendingFrame !== null) return;

  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    if (!cursorEl) return;

    const rect = getCursorRect();
    if (!rect || rect.width === 0) {
      cursorEl.classList.add("hidden");
      return;
    }

    cursorEl.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    cursorEl.style.height = `${rect.height}px`;
    cursorEl.classList.remove("hidden");
  });
}

function startBlink(): void {
  if (!cursorEl) return;
  if (blinkTimer !== null) clearTimeout(blinkTimer);
  blinkTimer = window.setTimeout(() => {
    cursorEl?.classList.add("breathing");
  }, BLINK_DELAY);
}

function stopBlink(): void {
  if (blinkTimer !== null) {
    clearTimeout(blinkTimer);
    blinkTimer = null;
  }
  cursorEl?.classList.remove("breathing");
}

export function initCursor(): void {
  // 创建 DOM
  cursorEl = createCursorElement();

  // 绑定事件
  const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
    ["selectionchange", updateCursor],
    ["keyup", updateCursor],
    ["keydown", updateCursor],
    ["mouseup", updateCursor],
    ["click", updateCursor],
    ["scroll", updateCursor, { passive: true }],
    ["wheel", updateCursor, { passive: true }],
    ["resize", updateCursor],
  ];

  handlers.forEach(([event, handler]) => {
    document.addEventListener(event, handler as EventListener);
  });
  eventListeners = handlers;

  // 闪烁控制
  document.addEventListener("selectionchange", stopBlink);
  document.addEventListener("keydown", stopBlink);
  document.addEventListener("mousedown", stopBlink);

  // WS 监听 transactions
  if (window.siyuan?.ws?.ws) {
    window.siyuan.ws.ws.addEventListener("message", (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.cmd === "transactions") {
          updateCursor();
        }
      } catch {}
    });
  }

  startBlink();
  updateCursor();
}

export function destroyCursor(): void {
  eventListeners.forEach(([event, handler]) => {
    document.removeEventListener(event, handler);
  });
  eventListeners = [];

  stopBlink();

  if (pendingFrame !== null) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }

  if (cursorEl) {
    cursorEl.remove();
    cursorEl = null;
  }

  removeStyle(STYLE_ID);
}

export function isCursorEnabled(): boolean {
  return cursorEl !== null;
}