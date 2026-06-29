/**
 * 顺滑光标主模块。
 *
 * P0 修复 4 个 BUG：
 *   1. 呼吸感 —— 反向 idle 暂停/恢复（见 ./cursor/breathing.ts）
 *   2. 光标高度 —— lineHeight × 1.1（见 ../utils/getCursorRect.ts :: getCursorRect）
 *   3. 移动动画 —— no-transition / no-animation 在操作时启用，下一帧恢复
 *   4. 边界检测 —— isInAllowElements() 4 重检测（见 ./cursor/boundary.ts）
 *
 * P2 重构：
 *   - 8 个 EventBus 生命周期回调导出（由 index.ts 订阅）
 *   - WS 监听从手动 addEventListener 迁移到 ws-main EventBus
 *   - hasScroll/findAllScrollableAncestors 去重到 ../utils/scroll
 *
 * 注意：曾尝试用 activeProtyleIds Set 防止切 Tab 闪现，但发现 .protyle 元素的
 * data-id（Tab.id）与 IProtyle.id（Protyle.id）是不同的 UUID，匹配不上，
 * 导致光标永久隐藏。已删除该 gate——boundary.ts 第一重
 * getActiveEditor().protyle.element.contains() 已天然防止非活跃编辑器内显示。
 *
 * 性能硬指标：每帧 < 1ms。
 *   - rAF 节流（pendingFrame 标志，每帧最多一次 doUpdateCursor）
 *   - passive 事件（scroll/wheel/touchmove 不阻塞滚动）
 *   - keydown/input 事件用 rAF 包裹（替代 P0 时的三阶段 throttle）
 *   - transform 不用 top/left（合成层加速）
 *   - 批量读、批量写（getClientRects → getComputedStyle → style.transform/height）
 */

import type { IProtyle, IWebSocketData } from "siyuan/types";
import { CURSOR_CONFIG } from "../config";
import { getCursorRect } from "../utils/getCursorRect";
import { findAllScrollableAncestors } from "../utils/scroll";
import { isInAllowElements } from "./cursor/boundary";
import { isMobile } from "../utils/isMobile";
import { getEffectiveZIndex } from "../utils/getEffectiveZIndex";
import {
  initBreathing,
  pauseBreathe,
  resumeBreathe,
  destroyBreathing,
} from "./cursor/breathing";
import * as inputMode from "./inputMode";

const CURSOR_ID = "zentype-cursor";

let cursorEl: HTMLDivElement | null = null;
let pendingFrame: number | null = null;
let isFirstMove = true; // round 3：首次移动跳过 transition（避免从默认位置"飞来"）
let pendingKeyboardUpdate = false; // round 4 fix：Enter 触发滚动时跳过 .no-transition，保留 0.15s 跳移动画
let keyboardCooldownTimer: ReturnType<typeof setTimeout> | null = null; // round 4 fix（capture + cooldown）：键盘事件后 150ms 内 scroll/ResizeObserver 知道本次更新是键盘驱动
let resumeBreatheTimer: ReturnType<typeof setTimeout> | null = null; // commit A fix：复用 setTimeout，避免堆叠；destroy 时清理

function markKeyboardPending(): void {
  pendingKeyboardUpdate = true;
  if (keyboardCooldownTimer !== null) clearTimeout(keyboardCooldownTimer);
  keyboardCooldownTimer = setTimeout(() => {
    pendingKeyboardUpdate = false;
    keyboardCooldownTimer = null;
  }, 150);
}
let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];

// round 3 P1: ResizeObserver / Popover 拖动 / 滚动容器事件
let protyleContentObserver: ResizeObserver | null = null;
let protyleWysiwygObserver: ResizeObserver | null = null;
let lastBoundProtyleContent: HTMLElement | null = null;
let lastBoundProtyleWysiwyg: HTMLElement | null = null;

// ── 聚焦/打字机模式辅助状态 ──
let isPasting = false;
let unsubInputMode: (() => void) | null = null;

interface MouseDownInfo {
  selectionText: string;
}
let mouseDownInfo: MouseDownInfo | null = null;

interface ScrollEventBinding {
  el: HTMLElement;
  handler: EventListener;
}
const scrollEventBindings: ScrollEventBinding[] = [];

interface PopoverDragBinding {
  blockPopover: HTMLElement;
  dragEl: HTMLElement;
  onMouseDown: EventListener;
  onMouseMove: EventListener;
  onMouseUp: EventListener;
}
let popoverDragBinding: PopoverDragBinding | null = null;

function createCursorElement(): HTMLDivElement {
  let el = document.getElementById(CURSOR_ID) as HTMLDivElement | null;
  if (el) return el;

  el = document.createElement("div");
  el.id = CURSOR_ID;
  // commit D：DOM 刚创建时 transform 还未设置，默认在 (0,0)。
  // 直接把 transform 设到屏幕外，避免 initCursor 末端的 queueUpdate → 首次
  // doUpdateCursor 之间约 16ms 窗口内光标在视口左上角闪现。
  // doUpdateCursor 首帧会无条件覆盖 transform + 加 .no-transition 关闭过渡。
  el.style.transform = "translate3d(-9999px, -9999px, 0)";
  document.body.appendChild(el);
  return el;
}

/** rAF 节流入口：每帧最多执行一次 doUpdateCursor() */
function queueUpdate(): void {
  if (pendingFrame !== null) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    doUpdateCursor();
  });
}

/**
 * 核心更新逻辑。
 * 时序：
 *   1. 暂停呼吸（操作中）
 *   2. 读取选区 → getCursorRect（lineHeight × 1.05）
 *   3. 边界检测 → 不通过则 pauseBreathe + return（光标保留在最后位置，停在 Phase 1）
 *   4. 计算 zIndex（基于 window.siyuan.zIndex + 1）
 *   5. 写 transform / height / zIndex
 *   6. 强制布局同步 → rAF 移除 no-transition
 *   7. setTimeout 1500ms 后恢复呼吸
 */
function doUpdateCursor(): void {
  if (!cursorEl) return;

  // 1) 暂停呼吸（操作中不需要呼吸感）
  pauseBreathe();

  // 2) 读取选区 → 显示矩形
  const rect = getCursorRect();
  if (!rect || rect.height === 0) {
    // commit D：光标不消失 —— 让呼吸停在 Phase 1（静态），停留在上一位置
    pauseBreathe();
    return;
  }

  // 3) 边界检测（3 重，round 3 移除第 3 重弹窗硬性排除）
  const allowed = isInAllowElements({ x: rect.x, y: rect.y });
  if (!allowed.allowed) {
    // commit D + m0115 fix：区分两种边界失败
    //   isOuterElement = false → 光标在编辑器 DOM 内但已滚出视口 → 隐藏
    //   isOuterElement = true  → 光标确实离开了编辑器（侧栏/AV/失焦）→ 保留在最后位置，静态
    if (!allowed.isOuterElement && cursorEl) {
      cursorEl.classList.add("hidden");
    }
    pauseBreathe();
    // 即使隐藏也要恢复呼吸（避免下次显示时呼吸态错乱）
    scheduleResumeBreathe();
    return;
  }

  // 移动端标题：可选跳过光标显示（避免移动端键盘弹出时视觉噪音）
  if (isMobile() && allowed.cursorElement?.closest(".protyle-title__input")) {
    // commit D：标题区域也算"非主编辑区"，光标停在 Phase 1（静态）
    pauseBreathe();
    scheduleResumeBreathe();
    return;
  }

  // 4) zIndex：取编辑器祖先链上最近的层叠上下文 + 1，再与思源全局 zIndex + 1 取大值
  //    保证光标在嵌套编辑器/弹窗中也位于最上层
  const effectiveZ = getEffectiveZIndex(allowed.cursorElement!);
  const siyuanZ = window.siyuan?.zIndex ?? 0;
  cursorEl.style.zIndex = String(Math.max(effectiveZ + 1, siyuanZ + 1));

  // 5) 写 transform + height
  //   yOffset：光标上移 N 像素，让光标视觉重心偏到行中线之上（用户偏好）。
  //   HEIGHT_RATIO > 1 时光标下沿超出 lineHeight，光标看起来仍偏下；微调上移抵消。
  const yOffset = 2;
  cursorEl.style.transform = `translate3d(${rect.x}px, ${rect.y - yOffset}px, 0)`;
  cursorEl.style.height = `${rect.height}px`;

  // 首次移动跳过过渡（避免从 (0,0) 滑到实际位置的"飞来"动画）
  if (isFirstMove) {
    cursorEl.classList.add("no-transition");
    isFirstMove = false;
  }
  // 文本选中时跳过顺滑过渡（光标应瞬间跳到选区末尾）
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && sel.toString()) {
    cursorEl.classList.add("no-transition");
  }

  // 显示光标
  cursorEl.classList.remove("hidden");

  // 6) 强制布局同步（让 no-transition 时也能立即更新位置）
  void cursorEl.offsetHeight;

  // 下一帧恢复 transition（transform / height 过渡）
  requestAnimationFrame(() => {
    cursorEl?.classList.remove("no-transition");
  });

  // 7) 恢复呼吸（光标始终呼吸，与聚焦模式解耦）
  scheduleResumeBreathe();

  // 8) round 3 P1：绑定 ResizeObserver / Popover 拖动 / 滚动容器事件
  //    这些 bind 函数内部有"已绑定"去重（lastBound / scrollEventBindings 包含检查 / popoverDragBinding）
  bindResizeObservers(allowed.cursorElement);
  bindPopoverDrag(allowed.cursorElement);
  bindScrollContainerEvents(allowed.cursorElement);

  // round 4 fix（capture + cooldown）：键盘标志由 markKeyboardPending 启动的 150ms 倒计时负责清零，
  // 不再在 doUpdateCursor 末尾同步清掉——倒计时窗口内 SiYuan 同步触发的 scroll/ResizeObserver
  // 仍能读到 pendingKeyboardUpdate=true，从而跳过 .no-transition 保留 0.15s 跳移动画
}

function scheduleResumeBreathe(): void {
  if (resumeBreatheTimer !== null) clearTimeout(resumeBreatheTimer);
  resumeBreatheTimer = setTimeout(() => {
    resumeBreatheTimer = null;
    resumeBreathe();
  }, CURSOR_CONFIG.BLINK_DELAY_MS);
}

/** 滚动 / 滚轮处理：暂停呼吸 + 停止过渡 + 立即更新 */
function onScrollOrWheel(): void {
  if (!cursorEl) return;
  pauseBreathe();
  // round 4 fix：Enter 触发的 SiYuan 自动滚动会同步到这里；
  // 此时 pendingKeyboardUpdate=true，跳过加 .no-transition 保留 0.15s 跳移动画
  if (!pendingKeyboardUpdate) {
    cursorEl.classList.add("no-transition");
    cursorEl.classList.add("no-animation");
  }
  queueUpdate();
}

// ============== round 3 P1：ResizeObserver / Popover 拖动 / 滚动容器 ==============

// P2: hasScroll / findAllScrollableAncestors 已迁移到 ../utils/scroll（统一去重）

/** 绑定 ResizeObserver 到 protyle-content / protyle-wysiwyg，protyle 切换时自动重绑 */
function bindResizeObservers(cursorElement: Element | null): void {
  if (!cursorElement) return;
  if (typeof ResizeObserver === "undefined") return;

  const protyleContent = cursorElement.closest(
    ".protyle:not(.fn__none) .protyle-content",
  ) as HTMLElement | null;

  if (protyleContent && protyleContent !== lastBoundProtyleContent) {
    protyleContentObserver?.disconnect();
    protyleContentObserver = new ResizeObserver(() => {
      if (!cursorEl) return;
      // round 4 fix：键盘触发的 ResizeObserver（Enter 新建段落等）不强制无过渡
      if (!pendingKeyboardUpdate) cursorEl.classList.add("no-transition");
      queueUpdate();
    });
    protyleContentObserver.observe(protyleContent);
    lastBoundProtyleContent = protyleContent;
  }

  const protyleWysiwyg = cursorElement.closest(
    ".protyle:not(.fn__none) .protyle-wysiwyg",
  ) as HTMLElement | null;

  if (protyleWysiwyg && protyleWysiwyg !== lastBoundProtyleWysiwyg) {
    protyleWysiwygObserver?.disconnect();
    protyleWysiwygObserver = new ResizeObserver(() => {
      if (!cursorEl) return;
      // round 4 fix：键盘触发的 ResizeObserver（Enter 新建段落等）不强制无过渡
      if (!pendingKeyboardUpdate) cursorEl.classList.add("no-transition");
      queueUpdate();
    });
    protyleWysiwygObserver.observe(protyleWysiwyg);
    lastBoundProtyleWysiwyg = protyleWysiwyg;
  }
}

/** 绑定 block__popover 拖动手柄（.resize__move）的 mousedown/mousemove/mouseup */
function bindPopoverDrag(cursorElement: Element | null): void {
  if (!cursorElement) return;
  if (popoverDragBinding) return; // 已绑定，跳过（弹窗通常单实例）

  const blockPopover = cursorElement.closest(
    ".block__popover",
  ) as HTMLElement | null;
  if (!blockPopover) return;

  const dragEl = blockPopover.querySelector(
    ".resize__move",
  ) as HTMLElement | null;
  if (!dragEl) return;

  let isDragging = false;
  const onMouseDown: EventListener = () => {
    isDragging = true;
  };
  const onMouseMove: EventListener = () => {
    if (isDragging && cursorEl) {
      cursorEl.classList.add("no-transition");
      queueUpdate();
    }
  };
  const onMouseUp: EventListener = () => {
    isDragging = false;
  };

  // mousedown 绑在拖动手柄上（只有点击拖手才进入拖动状态）
  // mousemove/mouseup 绑在 document 上（保证鼠标移出手柄时仍能跟踪）
  dragEl.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove, { passive: true });
  document.addEventListener("mouseup", onMouseUp);

  popoverDragBinding = {
    blockPopover,
    dragEl,
    onMouseDown,
    onMouseMove,
    onMouseUp,
  };
}

/** 嵌套滚动容器：给所有可滚动祖先绑 scroll/wheel 监听（passive） */
function bindScrollContainerEvents(cursorElement: Element | null): void {
  if (!cursorElement) return;

  const scrollEls = findAllScrollableAncestors(cursorElement);
  scrollEls.forEach((scrollEl) => {
    if ((scrollEl as any).__zentypeScrollBound) return;
    (scrollEl as any).__zentypeScrollBound = true;

    const handler: EventListener = () => {
      if (!cursorEl) return;
      pauseBreathe();
      // round 4 fix：键盘触发的嵌套滚动容器滚动（如 Enter 自动滚屏）保留过渡动画
      if (!pendingKeyboardUpdate) {
        cursorEl.classList.add("no-transition");
        cursorEl.classList.add("no-animation");
      }
      queueUpdate();
    };

    scrollEl.addEventListener("scroll", handler, { passive: true });
    scrollEl.addEventListener("wheel", handler, { passive: true });

    scrollEventBindings.push({ el: scrollEl, handler });
  });
}

export function initCursor(): void {
  // 创建 DOM
  cursorEl = createCursorElement();
  initBreathing(cursorEl);

  // commit C fix：呼吸与聚焦模式解耦，光标始终呼吸；仅在聚焦模式开启时
  // 通过 inputMode.subscribe 触发 scheduleResumeBreathe 同步开启瞬间。
  unsubInputMode = inputMode.subscribe((state) => {
    if (!cursorEl) return;
    if (state.focusActive) scheduleResumeBreathe();
  });

  // 聚焦/打字机模式：wheel/touchmove 退出处理（不涉及 scroll，避免程序滚动误退出）
  const onWheelExit: EventListener = () => {
    inputMode.setBothOff();
    onScrollOrWheel();
  };

  // 聚焦/打字机模式：鼠标拖蓝检测（mouseup 时比对比 selection 变化）
  const onMouseUpWithDragCheck: EventListener = () => {
    if (mouseDownInfo) {
      const currentSel = window.getSelection()?.toString() ?? "";
      if (currentSel !== mouseDownInfo.selectionText && currentSel.length > 0) {
        inputMode.setBothOff();
      }
      mouseDownInfo = null;
    }
    queueUpdate();
  };

  // DOM 事件绑定（passive 提升滚动性能）
  // round 3：移除三阶段 throttle（200/400/600ms），改用 keydown/input 配 rAF 包裹。
  // compositionend + input 已覆盖 IME / 自动换行延迟场景。
  const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
    ["selectionchange", queueUpdate],
    // keydown + input 用 rAF 包裹（参考版做法），替代三阶段 throttle
    // round 4 fix：先 set flag，下一次 doUpdateCursor 末尾 reset；
    // 让 Enter 触发的 scroll/ResizeObserver 知道本次更新是键盘驱动，不加 .no-transition
    // 聚焦/打字机模式：↑↓/PageUp/PageDown 退出；←→/Home/End/Escape 保持
    // round 4 fix（capture + cooldown）：capture 阶段先于 SiYuan handler 跑，
    // markKeyboardPending 启动 150ms 倒计时，期间 scroll/ResizeObserver 不加 .no-transition
    ["keydown", (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "ArrowUp" || ke.key === "ArrowDown" ||
          ke.key === "PageUp" || ke.key === "PageDown") {
        inputMode.setBothOff();
      }
      markKeyboardPending(); requestAnimationFrame(queueUpdate);
    }, { capture: true }],
    // 聚焦/打字机模式：输入事件开启（粘贴时跳过）
    ["input", () => {
      if (!isPasting) inputMode.setBothOn();
      isPasting = false;
      markKeyboardPending(); requestAnimationFrame(queueUpdate);
    }, { capture: true }],
    // mouseup：已有 cursor 更新 + 拖蓝检测
    ["mouseup", onMouseUpWithDragCheck],
    // 聚焦/打字机模式：鼠标点击退出
    ["click", () => {
      inputMode.setBothOff();
      queueUpdate();
    }],
    [
      "scroll",
      onScrollOrWheel as EventListener,
      { capture: true, passive: true },
    ],
    // 聚焦/打字机模式：wheel/touchmove 退出
    ["wheel", onWheelExit, { passive: true }],
    ["touchmove", onWheelExit, { passive: true }],
    // 聚焦/打字机模式：IME 完成开启
    ["compositionend", () => {
      inputMode.setBothOn();
      queueUpdate();
    }],
    // resize 时刷新（思源侧边栏拖动会触发）
    ["resize", queueUpdate, { passive: true }],
    // 聚焦/打字机模式：粘贴标记（跳过 input 开启）
    ["paste", () => { isPasting = true; }],
    // 聚焦/打字机模式：拖蓝起点记录
    ["mousedown", (e) => {
      mouseDownInfo = { selectionText: window.getSelection()?.toString() ?? "" };
    }],
    // 聚焦/打字机模式：失焦退出
    ["blur", () => { inputMode.setBothOff(); }],
  ];

  handlers.forEach(([event, handler, options]) => {
    document.addEventListener(event, handler, options);
  });
  eventListeners = handlers;

  // P2: WS 监听已迁移到 ws-main EventBus（由 index.ts 订阅，destroy 时由 eventBusOffFns 清理）
  // 不再手动 addEventListener("message", ...) + JSON.parse。

  // 首次定位
  queueUpdate();
}

export function destroyCursor(): void {
  // round 4 fix（capture + cooldown）：清理键盘冷却定时器
  if (keyboardCooldownTimer !== null) {
    clearTimeout(keyboardCooldownTimer);
    keyboardCooldownTimer = null;
  }
  pendingKeyboardUpdate = false;

  // 清理 DOM 事件
  eventListeners.forEach(([event, handler, options]) => {
    document.removeEventListener(event, handler, options);
  });
  eventListeners = [];

  // P2: 退订聚焦模式变化
  if (unsubInputMode) {
    unsubInputMode();
    unsubInputMode = null;
  }

  // P2: WS 监听已迁移到 EventBus（由 index.ts 的 eventBusOffFns 在 onunload 时清理）

  // 清理呼吸状态机
  destroyBreathing();

  // 清理 rAF
  if (pendingFrame !== null) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }

  // 移除 DOM 元素
  if (cursorEl) {
    cursorEl.remove();
    cursorEl = null;
  }

  // 重置首次移动标志
  isFirstMove = true;

  // round 3 P1 清理：ResizeObserver / Popover 拖动 / 滚动容器事件
  protyleContentObserver?.disconnect();
  protyleContentObserver = null;
  protyleWysiwygObserver?.disconnect();
  protyleWysiwygObserver = null;
  lastBoundProtyleContent = null;
  lastBoundProtyleWysiwyg = null;

  if (popoverDragBinding) {
    const { dragEl, onMouseDown, onMouseMove, onMouseUp } = popoverDragBinding;
    dragEl.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    popoverDragBinding = null;
  }

  scrollEventBindings.forEach(({ el, handler }) => {
    el.removeEventListener("scroll", handler);
    el.removeEventListener("wheel", handler);
    delete (el as any).__zentypeScrollBound;
  });
  scrollEventBindings.length = 0;

  // commit A fix：重置聚焦/打字机模式辅助状态 + 清理呼吸恢复定时器
  isPasting = false;
  mouseDownInfo = null;
  if (resumeBreatheTimer !== null) {
    clearTimeout(resumeBreatheTimer);
    resumeBreatheTimer = null;
  }
}

// ============== P2: EventBus 回调（由 index.ts 订阅并调用） ==============

/** loaded-protyle-static / loaded-protyle-dynamic 回调：新编辑器加载完成时触发更新 */
export function onProtyleLoaded(_protyle: IProtyle): void {
  queueUpdate();
}

/** switch-protyle 回调：切换 tab 时刷新光标位置 */
export function onProtyleSwitched(_protyle: IProtyle): void {
  queueUpdate();
}

/** click-editorcontent 回调：用户点击了编辑器内容 */
export function onEditorContentClicked(_protyle: IProtyle): void {
  // 点击后可能触发 selectionchange，队列更新
  queueUpdate();
}

/** open-menu-content 回调：右键菜单弹出时光标停在 Phase 1（静态），保留在最后位置 */
export function onMenuOpened(): void {
  if (!cursorEl) return;
  pauseBreathe();
}

/** ws-main 回调：替代手动 WS 监听 + JSON.parse（EventBus 已自动解析） */
export function onWsMain(data: IWebSocketData): void {
  if (data.cmd === "transactions") {
    queueUpdate();
  }
}

/** mobile-keyboard-show 回调：移动端键盘弹出，重定位光标 */
export function onMobileKeyboardShow(): void {
  queueUpdate();
}

/** mobile-keyboard-hide 回调：移动端键盘收起，重定位光标 */
export function onMobileKeyboardHide(): void {
  queueUpdate();
}