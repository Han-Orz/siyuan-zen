import { getCursorRect } from "../utils/getCursorRect";
import { findClosestScrollableElement } from "../utils/scroll";
import { TYPEWRITER_CONFIG } from "../config";
import { shouldPauseTypewriter } from "../utils/edgeCases";
import * as inputMode from "./inputMode";
import { isInAllowElements } from "./cursor/boundary";
import { recompute } from "./ripple";

const { COMFORT_ZONE, SCROLL_DURATION_TIERS, SCROLL_CURVE } = TYPEWRITER_CONFIG;

// ===== DEBUG INSTRUMENTATION (TEMPORARY — REMOVE AFTER FIX) =====
// v2.3.1 测试用：暴露打字机运行时状态到 window.__ztTypewriter，供 DevTools 调试。
// 默认 enabled = false，对生产零性能影响。
// Console API（DevTools 输入）：
//   __ztTypewriter.state()  实时快照（对象，含 cursor/editor/container/…）
//   __ztTypewriter.on()     开启 console.log 自动输出
//   __ztTypewriter.off()    关闭自动输出
//   __ztTypewriter.log()    console.table 打印最近 20 事件
//   __ztTypewriter.clear()  清空事件 buffer
// 字段：cursor(CursorRect)/editor({top,bottom,left,right}|null)/container/scrollTop/
//       scrollHeight/clientHeight/cursorPct/deltaY/isScrolling/pendingScrollEnd/
//       scrollRafId/comfortZone/shouldPause/events(最近 50 个 {t, type, data})
// 删除方法：bug 修复确认后，整体删除本 banner 以及 banner 之间的所有调试代码。
//           Step 2-6 的 update 调用都在本文件中以「DEBUG:」单行注释标记，可全文搜索 "DEBUG:" 定位。
// ----------------------------------------------------------------

interface __ztDebugEditorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const __ztDebug = {
  enabled: false,
  cursor: null as (ReturnType<typeof getCursorRect> | null),
  editor: null as __ztDebugEditorRect | null,
  container: null as HTMLElement | null,
  cursorPct: 0,
  deltaY: 0,
  isScrolling: false,
  scrollTop: 0,
  scrollHeight: 0,
  clientHeight: 0,
  pendingScrollEnd: 0,
  scrollRafId: null as number | null,
  comfortZone: COMFORT_ZONE,
  shouldPause: { isReadMode: false, isInPopup: false, isInEmbedBlock: false },
  events: [] as Array<{ t: number; type: string; data?: unknown }>,
  maxEvents: 50,
};

// DEBUG 内部：仅暴露给 step() 等模块内函数读取；外部走 window.__ztTypewriter。
export const typewriteDebug = __ztDebug;

// expose 到 window（DevTools console 用）
// DEBUG: 测试用 — 调试期保留，bug 修复后随 banner 一起删除。
if (typeof window !== "undefined") {
  (window as unknown as { __ztTypewriter: unknown }).__ztTypewriter = {
    state: () => ({ ...__ztDebug, events: __ztDebug.events.slice() }),
    on: () => {
      __ztDebug.enabled = true;
      console.log("[zt-typewriter] debug ON — call __ztTypewriter.off() to disable");
    },
    off: () => {
      __ztDebug.enabled = false;
      console.log("[zt-typewriter] debug OFF");
    },
    log: () => console.table(__ztDebug.events.slice(-20)),
    clear: () => {
      __ztDebug.events = [];
      console.log("[zt-typewriter] events cleared");
    },
  };
}

// DEBUG helper：事件 buffer 记录 + enabled 时 console.log。
// important = true 时无视 enabled 状态必 push + log（关键事件必捕获）；
// important = false 时仅 enabled 状态下记录（避免 disabled 时 buffer 被噪音灌满）。
// 测试用 — bug 修复后随 banner 一起删除。
function __ztDebugPush(type: string, data?: unknown, important = false): void {
  // 非重要事件 + debug 关闭 → 完全跳过（不入 events、不 log），生产零开销
  if (!important && !__ztDebug.enabled) return;

  const ev = { t: Date.now(), type, data };
  __ztDebug.events.push(ev);
  if (__ztDebug.events.length > __ztDebug.maxEvents) {
    __ztDebug.events.shift();
  }
  // important 事件：log
  // non-important 事件：仅在 events 数组里累积（state() 可读），不 log
  // 跟 enabled 状态无关——on() 不应该把噪音灌到 console
  if (important) {
    console.log("[zt-typewriter]", type, data ?? "");
  }
}

// ===== END DEBUG INSTRUMENTATION =====

let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];
let pendingScroll: number | null = null;
let pendingScrollTarget: HTMLElement | null = null;
let pendingScrollEnd: number = 0;
let isScrolling = false;
let pendingCheck: number | null = null;
let cachedContainer: HTMLElement | null = null;
let cachedCursorElement: Element | null = null;

// v2.3.0 block insertion: FLIP animation state
let pendingBlockInsert = false;
let blockInsertCooldownTimer: ReturnType<typeof setTimeout> | null = null;
let lastBlockInsertTime = 0;

/**
 * 标记块级插入已发生（Enter / Backspace / paste 多行）。
 * 调用后 300ms 内 typewriter 主循环跳过 transition 关闭，
 * 覆盖 FLIP + smoothScroll 总时长。
 */
function markBlockInsertPending(): void {
  pendingBlockInsert = true;
  if (blockInsertCooldownTimer !== null) clearTimeout(blockInsertCooldownTimer);
  blockInsertCooldownTimer = setTimeout(() => {
    pendingBlockInsert = false;
    blockInsertCooldownTimer = null;
  }, 300);
}

/**
 * FLIP 动画：让块级插入后的"下方块被推下去"视觉上平滑过渡。
 * First: 快照所有块位置 → Invert: 反推到旧位置 → Play: 取消 transform 平滑过渡。
 *
 * 位移幅度 = 块实际被推的距离（编辑器原生 reflow delta），不做 opacity。
 */
function animateNaturalReflow(
  editor: HTMLElement,
  preSnapshot?: Map<HTMLElement, number>,
): void {
  const now = performance.now();
  // 跳过条件：距离上次块级变化 < 100ms（连续 Enter / 快速 paste）
  if (now - lastBlockInsertTime < 100) return;
  lastBlockInsertTime = now;

  // First：快照所有块位置。preSnapshot 来自 capture 阶段调用方同步采集（DOM 变更前的旧位置），
  // 未提供时回退到此处的 rAF 入口快照（paste 场景仍走此路径）。
  const first = preSnapshot ?? (() => {
    const m = new Map<HTMLElement, number>();
    editor.querySelectorAll<HTMLElement>('[data-node-id]').forEach(el => {
      m.set(el, el.getBoundingClientRect().top);
    });
    return m;
  })();

  // 让浏览器重新布局（此时 DOM 已变），下一帧读新位置
  requestAnimationFrame(() => {
    for (const [el, y0] of first) {
      const y1 = el.getBoundingClientRect().top;
      const delta = y0 - y1; // 正 = 被推下去
      if (Math.abs(delta) < 2) continue; // 微动跳过

      // Invert：推到旧位置
      el.style.transform = `translateY(${delta}px)`;
      el.style.transition = 'none';

      // 强制 reflow（让 Invert 立即生效）
      void el.offsetHeight;

      // Play：平滑过渡回原位
      requestAnimationFrame(() => {
        el.style.transition = `transform 250ms ${SCROLL_CURVE}`;
        el.style.transform = '';
        // 动画结束后清理 inline style
        setTimeout(() => {
          el.style.transition = '';
        }, 300);
      });
    }
  });
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function durationForDistance(dist: number): number {
  // 从 config 查表（SCROLL_DURATION_TIERS: [120, 180, 260, 360, 500]）
  // 分档阈值与旧版一致：[0-20)→120, [20-60)→180, [60-150)→260, [150-400)→360, [400+∞)→500
  if (dist < 20) return SCROLL_DURATION_TIERS[0];
  if (dist < 60) return SCROLL_DURATION_TIERS[1];
  if (dist < 150) return SCROLL_DURATION_TIERS[2];
  if (dist < 400) return SCROLL_DURATION_TIERS[3];
  return SCROLL_DURATION_TIERS[4];
}

interface SmoothScrollOptions {
  deltaY: number;
  /** 覆盖 config 分档（可选）。 */
  duration?: number;
  /** 覆盖 SCROLL_CURVE（可选，用于 FLIP 等特殊场景）。当前 rAF 路径暂未接入。 */
  curve?: string;
}

function smoothScroll(target: HTMLElement, options: SmoothScrollOptions): void {
  const { deltaY, duration, curve } = options;
  // curve 暂存以备未来 CSS scroll-behavior 或 animateNaturalReflow 使用；
  // 当前 rAF 路径仍使用 easeInOutCubic 作为缓动函数。
  const _curve = curve ?? SCROLL_CURVE;

  isScrolling = true;
  // DEBUG: smoothScroll 进入 — 测试用，bug 修复后随 banner 一起删除。
  __ztDebug.isScrolling = true;

  // 续接：同一 target 且动画进行中，从当前 scrollTop 重算 target，避免连续 keystroke 雪崩
  if (pendingScroll !== null && pendingScrollTarget === target) {
    pendingScrollEnd = target.scrollTop + deltaY;
    // DEBUG: 续接场景 — 测试用，bug 修复后随 banner 一起删除。
    __ztDebug.pendingScrollEnd = pendingScrollEnd;
    return;
  }

  // 否则取消旧动画（新 target 或旧动画完成）
  if (pendingScroll !== null) cancelAnimationFrame(pendingScroll);

  pendingScrollTarget = target;
  pendingScrollEnd = target.scrollTop + deltaY;

  const startScroll = target.scrollTop;
  const startTime = performance.now();
  const dur = duration ?? durationForDistance(Math.abs(deltaY));

  // DEBUG: smoothScroll 启动日志 — 测试用，bug 修复后随 banner 一起删除。
  __ztDebugPush("smoothScroll:start", {
    startScrollTop: startScroll,
    targetScrollTop: pendingScrollEnd,
    duration: dur,
  });

  function step() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / dur, 1);
    const eased = easeInOutCubic(t);
    const maxScroll = target.scrollHeight - target.clientHeight;
    const currentEnd = pendingScrollEnd; // read latest
    target.scrollTop = Math.max(0, Math.min(
        startScroll + (currentEnd - startScroll) * eased,
        maxScroll
    ));
    // DEBUG: rAF tick — 仅 enabled 时 push，避免事件 buffer 爆炸。测试用，bug 修复后随 banner 删除。
    __ztDebug.scrollTop = target.scrollTop;
    if (__ztDebug.enabled) {
      __ztDebugPush("raf", { progress: t.toFixed(3), scrollTop: target.scrollTop });
    }
    if (t < 1) {
      pendingScroll = requestAnimationFrame(step);
      // DEBUG: 跟踪当前 rAF id — 测试用，bug 修复后随 banner 删除。
      __ztDebug.scrollRafId = pendingScroll;
    } else {
      pendingScroll = null;
      pendingScrollTarget = null;
      // DEBUG: smoothScroll 结束 — 测试用，bug 修复后随 banner 一起删除。
      __ztDebug.isScrolling = false;
      __ztDebug.scrollTop = target.scrollTop;
      __ztDebugPush("smoothScroll:end", { finalScrollTop: target.scrollTop });
      // 动画结束后 100ms 冷却，防止 concurrent 触发新 scroll
      setTimeout(() => { isScrolling = false; }, 100);
    }
  }
  pendingScroll = requestAnimationFrame(step);
  // DEBUG: 跟踪初始 rAF id — 测试用，bug 修复后随 banner 删除。
  __ztDebug.scrollRafId = pendingScroll;
}

function scheduleCheck(): void {
  if (pendingCheck !== null) return; // already scheduled, merge
  pendingCheck = requestAnimationFrame(() => {
    pendingCheck = null;
    checkAndScroll();
  });
}

function checkAndScroll(): void {
  // 打字机模式关闭时：不自动滚动
  if (!inputMode.isTypewriterActive()) return;

  // 暂停场景（悬浮窗 / 只读 / 嵌入块）：不滚动
  if (shouldPauseTypewriter()) return;

  // 动画进行中：不触发新 scroll，防止连续 keystroke 雪崩到 clamp 边界
  if (isScrolling) return;

  const rect = getCursorRect();
  if (!rect) return;

  // 使用 isInAllowElements 复用 cursor 模块验证过的选择器逻辑
  // 内部使用 cursorElement.closest(".protyle:not(.fn__none) .protyle-content")
  // 正确找到当前活跃编辑器的 protyle-content（包括分屏场景）
  const result = isInAllowElements({ x: rect.x, y: rect.y });

  // allowed 为 false 时，如果 editorRect 不可用，说明光标不在有效编辑区域
  // （标题区域在 boundary.ts 返回 allowed:true 但没有 editorRect，此处也会被过滤）
  if (!result.editorRect) return;
  if (!result.cursorElement) return;

  // 新增：空块守卫。光标在空块时 typewriter scroll 无意义（块高近 0，cursor
  // 在块顶），且 getCursorRect 已走非突变 fallback 也无 cursorPct 可言。
  // 同时这是防御层：即使未来 fallback 路径再次突变 DOM，空块也直接退出。
  const cursorBlock = result.cursorElement.closest('[data-node-id]');
  if (cursorBlock) {
    const text = cursorBlock.textContent?.trim() ?? '';
    const isEmptyBlock = text === ''
      && !cursorBlock.querySelector(
        'img, iframe, [data-type^="NodeMathBlock"], [data-type^="NodeCodeBlock"]',
      );
    if (isEmptyBlock) return;
  }

  // 缓存命中：同一 cursorElement 复用上次的 scroll container，避免每次都 DOM 遍历
  let container: HTMLElement | null;
  if (result.cursorElement === cachedCursorElement && cachedContainer) {
    container = cachedContainer;
  } else {
    container = findClosestScrollableElement(result.cursorElement);
    cachedContainer = container;
    cachedCursorElement = result.cursorElement;
  }
  if (!container) return;

  // DEBUG: snapshot before scroll decision — 测试用，bug 修复后随 banner 一起删除。
  __ztDebug.cursor = rect;
  __ztDebug.editor = result.editorRect;
  __ztDebug.container = container;
  __ztDebug.scrollTop = container.scrollTop;
  __ztDebug.scrollHeight = container.scrollHeight;
  __ztDebug.clientHeight = container.clientHeight;
  __ztDebug.pendingScrollEnd = pendingScrollEnd;

  // 使用 editorRect（protyle-content 的 bounding rect）作为滚动锚点
  // 而非 container.getBoundingClientRect()（可能是更大的祖先元素）
  // 注：AllowResult.editorRect 只有 top/bottom/left/right，无 height 字段（不像 DOMRect）
  const editorHeight = result.editorRect.bottom - result.editorRect.top;
  const cursorPct = (rect.y - result.editorRect.top) / editorHeight;

  // v2.3.0：舒适区间 [COMFORT_ZONE[0], COMFORT_ZONE[1]]，区间内不滚
  // 符号约定：smoothScroll 中 deltaY > 0 = scrollTop 增加 = 页面/视口向下滚
  // 因此要让 cursor 在视口里"下移"（cursor 在顶部时），需要 deltaY < 0（向上滚）
  let deltaY = 0;
  if (cursorPct < COMFORT_ZONE[0]) {
    // 光标在舒适区上方 → deltaY 负（向上滚）→ cursor 在视口里下移到 COMFORT_ZONE[0]
    deltaY = (cursorPct - COMFORT_ZONE[0]) * editorHeight;
  } else if (cursorPct > COMFORT_ZONE[1]) {
    // 光标在舒适区下方 → deltaY 正（向下滚）→ cursor 在视口里上移到 COMFORT_ZONE[1]
    deltaY = (cursorPct - COMFORT_ZONE[1]) * editorHeight;
  }
  // else: 舒适区内，deltaY = 0，不滚

  // DEBUG: log scroll decision — 测试用，bug 修复后随 banner 一起删除。
  __ztDebug.cursorPct = cursorPct;
  __ztDebug.deltaY = deltaY;
  // 全量记录：保留完整 cursorPct/deltaY 历史，state() 快照可读
  __ztDebugPush("checkAndScroll", { cursorPct, deltaY, comfortZone: COMFORT_ZONE });

  // 仅重要事件 push 到 events + console：光标偏离舒适区且 deltaY 非零
  // （即真正触发 scroll 的时刻），过滤掉舒适区内 deltaY=0 的循环噪音
  const isOutsideComfortZone = cursorPct < COMFORT_ZONE[0] || cursorPct > COMFORT_ZONE[1];
  __ztDebugPush(
    "checkAndScroll:important",
    { cursorPct, deltaY },
    isOutsideComfortZone && deltaY !== 0,
  );

  if (Math.abs(deltaY) >= 1) {
    smoothScroll(container, { deltaY });
    // v2.3.0：块级插入后 300ms 让 ripple 重算（Step 5 接 recompute 导出）
    if (pendingBlockInsert) {
      const currentBlock = result.cursorElement?.closest('[data-node-id]') as HTMLElement | null;
      if (currentBlock) {
        setTimeout(() => {
          recompute(currentBlock);
        }, 300);
      }
    }
  }
}

export function initTypewriter(): void {
  // 事件数组使用三元组以便保留 options
  const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
    ["selectionchange", scheduleCheck],
    ["keyup", scheduleCheck],
    ["keydown", scheduleCheck],
    ["click", scheduleCheck],
    ["mouseup", scheduleCheck],
    ["resize", scheduleCheck],
    // v2.3.0：块级插入动画（Enter / 行首 Backspace）
    // capture 阶段：先于 SiYuan 自身的 keydown 监听；包 rAF 等 DOM 更新完
    [
      "keydown",
      (e) => {
        const ke = e as KeyboardEvent;
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        // 提前取出当前编辑器（capture 阶段，先于 SiYuan 自身 keydown 改 DOM）
        const cursor = sel.anchorNode?.parentElement?.closest(
          ".protyle-wysiwyg",
        ) as HTMLElement | null;
        if (!cursor) return;

        if (ke.key === "Enter") {
          // Enter 在行尾或行中 → 创建新块
          // 同步快照：当前在 capture 阶段，SiYuan bubble handler 尚未改 DOM，preSnapshot 是"旧位置"
          const preSnapshot = new Map<HTMLElement, number>();
          cursor.querySelectorAll<HTMLElement>('[data-node-id]').forEach(el => {
            preSnapshot.set(el, el.getBoundingClientRect().top);
          });
          markBlockInsertPending();
          // 延迟一帧等 DOM 更新
          requestAnimationFrame(() => animateNaturalReflow(cursor, preSnapshot));
        } else if (ke.key === "Backspace") {
          // Backspace 在行首 → 合并到上一块
          const range = sel.getRangeAt(0);
          if (range.collapsed && range.startOffset === 0) {
            // 同步快照（同 Enter 分支）
            const preSnapshot = new Map<HTMLElement, number>();
            cursor.querySelectorAll<HTMLElement>('[data-node-id]').forEach(el => {
              preSnapshot.set(el, el.getBoundingClientRect().top);
            });
            markBlockInsertPending();
            requestAnimationFrame(() => animateNaturalReflow(cursor, preSnapshot));
          }
        }
      },
      { capture: true },
    ],
    // v2.3.0：多行粘贴 → FLIP 补位
    [
      "paste",
      () => {
        markBlockInsertPending();
        // 延迟一帧等粘贴内容进 DOM
        requestAnimationFrame(() => {
          const sel = window.getSelection();
          const editor = sel?.anchorNode?.parentElement?.closest(
            ".protyle-wysiwyg",
          ) as HTMLElement | null;
          if (editor) animateNaturalReflow(editor);
        });
      },
    ],
  ];

  // 解构必须包含第三个元素，否则 passive 等选项会被丢弃
  handlers.forEach(([event, handler, options]) => {
    document.addEventListener(event, handler as EventListener, options);
  });
  eventListeners = handlers;

  // 初始化时立即激活打字机模式状态
  // setBothOn 是幂等的，多次调用安全；cursor 模块也会在 input 事件中调用
  inputMode.setBothOn();
}

export function destroyTypewriter(): void {
  eventListeners.forEach(([event, handler]) => {
    document.removeEventListener(event, handler);
  });
  eventListeners = [];

  if (pendingScroll !== null) {
    cancelAnimationFrame(pendingScroll);
    pendingScroll = null;
  }

  if (pendingCheck !== null) {
    cancelAnimationFrame(pendingCheck);
    pendingCheck = null;
  }
  cachedContainer = null;
  cachedCursorElement = null;
  pendingScrollTarget = null;
  pendingScrollEnd = 0;
  isScrolling = false;

  // DEBUG: reset state on destroy — 测试用，bug 修复后随 banner 一起删除。
  __ztDebug.scrollTop = 0;
  __ztDebug.pendingScrollEnd = 0;
  __ztDebug.isScrolling = false;
  __ztDebug.scrollRafId = null;

  if (blockInsertCooldownTimer !== null) {
    clearTimeout(blockInsertCooldownTimer);
    blockInsertCooldownTimer = null;
  }
}
