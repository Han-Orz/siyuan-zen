import { getCursorElement } from "../utils/getCursorElement";
import { shouldPauseFocusAndTypewriter, isReadMode } from "../utils/edgeCases";
import type { RippleMode } from "../types";
import { RIPPLE_CONFIG } from "../config";
import * as inputMode from "./inputMode";

/**
 * 涟漪聚焦模块 - 文本/鼠标双模式状态机
 *
 * 三种模式：
 *  - text   : 默认。涟漪以光标所在块为中心。
 *  - mouse  : 只读模式 / 空闲 2s / 鼠标进入其他块时触发，涟漪以鼠标所在块为中心。
 *  - paused : 多行选中 / 悬浮窗编辑。清除所有 opacity 覆盖。
 *
 * 设计：
 *  - 不注入 CSS（直接通过 JS 设置 style.opacity），所以本模块无样式注入问题。
 *  - 鼠标相关事件用 passive 提升编辑器滚动性能。
 *  - 所有事件监听器存入三元组数组，destroy 时统一清理（继承自 Task 3 经验）。
 */

const {
  OPACITY_LEVELS,
  MOUSE_THROTTLE,
  IDLE_THRESHOLD,
  SENTENCE_LEVELS,
  EMBED_MULTIPLIER,
  DEPTH_FACTOR,
  WEIGHT_MIN,
} = RIPPLE_CONFIG;
const SCROLLBAR_MARGIN = 20; // px

let mode: RippleMode = "text";
let lastTextCursorChange = 0;
let lastMouseBlock: Element | null = null;
let lastTextBlock: Element | null = null;
let pendingFrame: number | null = null;
let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];
let lastMouseMove = 0;

function getCurrentBlock(): Element | null {
  // 鼠标聚焦模式已停用（用户暂未决定此功能该出现在什么场景）。
  // 保留 RippleMode union 中的 "mouse" 以便未来恢复时不破坏类型契约。
  // if (mode === "mouse" && lastMouseBlock) return lastMouseBlock;
  const cursor = getCursorElement();
  return cursor?.closest("[data-node-id]") ?? null;
}

function calculateBlockDistance(from: Element, to: Element): number {
  const fromParent = from.parentElement;
  if (!fromParent) return 0;
  const siblings = Array.from(fromParent.children);
  const fromIndex = siblings.indexOf(from);
  const toIndex = siblings.indexOf(to);
  return Math.abs(fromIndex - toIndex);
}

function isOverScrollbar(e: MouseEvent): boolean {
  // 简化判断：检测视口边缘（20px 缓冲带）
  const w = window.innerWidth;
  const h = window.innerHeight;
  return e.clientX > w - SCROLLBAR_MARGIN || e.clientY > h - SCROLLBAR_MARGIN;
}

function applyRipple(): void {
  if (pendingFrame !== null) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;

    // 聚焦模式关闭时：涟漪完全不工作（包括 mouse 模式）
    if (!inputMode.isFocusActive()) {
      clearAllOpacity();
      return;
    }

    if (shouldPauseFocusAndTypewriter()) {
      // 暂停时清除所有 opacity 覆盖，恢复默认
      clearAllOpacity();
      return;
    }

    const currentBlock = getCurrentBlock();
    if (!currentBlock) return;

    const container = currentBlock.closest(".protyle-wysiwyg");
    if (!container) return;

    const allBlocks = Array.from(
      container.querySelectorAll('[data-node-id], iframe, video')
    );

    allBlocks.forEach((block) => {
      const distance = calculateBlockDistance(currentBlock, block as Element);
      const opacity = OPACITY_LEVELS[Math.min(distance, OPACITY_LEVELS.length - 1)];
      (block as HTMLElement).style.opacity = String(opacity);
    });

    (currentBlock as HTMLElement).style.opacity = "1";
  });
}

function clearAllOpacity(): void {
  const blocks = document.querySelectorAll(
    '.protyle-wysiwyg [data-node-id], .protyle-wysiwyg iframe, .protyle-wysiwyg video'
  );
  blocks.forEach((block) => {
    (block as HTMLElement).style.opacity = "";
  });
}

function onSelectionChange(): void {
  lastTextCursorChange = Date.now();
  const cursor = getCursorElement();
  lastTextBlock = cursor?.closest("[data-node-id]") ?? null;

  // 文本事件：切回 text 模式（如果未在 paused），并重应用涟漪
  if (mode !== "paused") {
    mode = "text";
    applyRipple();
  }
}

function onMouseMove(e: MouseEvent): void {
  const now = Date.now();
  if (now - lastMouseMove < MOUSE_THROTTLE) return;
  lastMouseMove = now;

  // 鼠标聚焦模式已停用（用户暂未决定此功能该出现在什么场景）。
  // 下方整段 mouse 模式逻辑被注释保留，未来如需恢复可整段还原。
  // 鼠标在编辑器外：mouse → text
  // const target = e.target as Element | null;
  // if (!target?.closest(".protyle-wysiwyg")) {
  //   if (mode === "mouse") {
  //     mode = "text";
  //     applyRipple();
  //   }
  //   return;
  // }

  // 鼠标在滚动条上：忽略
  // if (isOverScrollbar(e)) return;

  // const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
  // if (!elementAtPoint) return;

  // const mouseBlock = elementAtPoint.closest("[data-node-id], iframe, video");
  // if (!mouseBlock) return;
  // lastMouseBlock = mouseBlock as Element;

  // 决定是否切到 mouse 模式
  // const readMode = isReadMode();
  // const idleTooLong = now - lastTextCursorChange > IDLE_THRESHOLD;
  // const mouseInDifferentBlock =
  //   lastTextBlock &&
  //   !mouseBlock.contains(lastTextBlock) &&
  //   !lastTextBlock.contains(mouseBlock);

  // if (readMode || idleTooLong || mouseInDifferentBlock) {
  //   if (mode !== "mouse") {
  //     mode = "mouse";
  //   }
  //   applyRipple();
  // }
}

export function initRipple(): void {
  mode = "text";
  lastTextCursorChange = Date.now();
  lastMouseBlock = null;
  lastTextBlock = null;
  pendingFrame = null;
  lastMouseMove = 0;

  // 事件数组使用三元组以便保留 options（鼠标聚焦模式已停用 → 不再注册 mousemove）
  const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
    ["selectionchange", onSelectionChange],
    ["click", onSelectionChange],
    ["keyup", onSelectionChange],
  ];

  // 解构必须包含第三个元素，否则 { passive: true } 会被丢弃
  handlers.forEach(([event, handler, options]) => {
    document.addEventListener(event, handler, options);
  });
  eventListeners = handlers;

  applyRipple();
}

export function destroyRipple(): void {
  eventListeners.forEach(([event, handler]) => {
    document.removeEventListener(event, handler);
  });
  eventListeners = [];

  if (pendingFrame !== null) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }

  clearAllOpacity();

  mode = "text";
  lastMouseBlock = null;
  lastTextBlock = null;
}

/* ---------------------------------------------------------------------------
 * v2.3.0：句级分割（sentence parsing）— Step 4a
 *
 * 关键技术决策（DESIGN.md §4.3.3，参考 docs/research/2026-06-30-siyuan-editor-dom.md）：
 *   1. block type 白名单：只处理 NodeParagraph/NodeHeading/NodeListItem/NodeBlockquote，
 *      跳过 NodeCodeBlock/NodeBlockQueryEmbed/NodeAttributeView/NodeTable/NodeMathBlock/NodeSuperBlock。
 *   2. 不用 range.surroundContents()（跨 inline 元素 strong/em/a 会抛 BAD_BOUNDARYPOINTS_ERR）。
 *      改用 range.extractContents() + span.appendChild(fragment) + range.insertNode(span)。
 *   3. 临时 span 样式：visibility:hidden + pointer-events:none
 *      （临时隐藏、不被命中测试；不设 position:absolute — abs span 无 top/left 偏移时
 *      会脱离文档流导致句级文本覆盖在段落原文本上，layout 不重流入；wrap 在单个 rAF 内
 *      完成，浏览器在 wrap 结束后才绘制）。
 *   4. 必须保存/恢复 window.getSelection()，否则光标会跳到块尾。
 *   5. 临时生命周期：当前帧创建，下一帧 removeSentenceSpans 清理
 *      （不污染 WYSIWYG.lastHTMLs，不影响 undo/redo）。
 * ------------------------------------------------------------------------- */

const SENTENCE_SPAN_CLASS = "zt-sentence-span";

/** v2.3.0：可被句级分割的块类型白名单。 */
export const RIPPLE_TARGET_BLOCK_TYPES = new Set<string>([
  "NodeParagraph",
  "NodeHeading",
  "NodeListItem",
  "NodeBlockquote",
]);

/** v2.3.0：永远跳过（不可读 / 嵌入 / 数据库）。 */
export const RIPPLE_SKIP_BLOCK_TYPES = new Set<string>([
  "NodeCodeBlock",
  "NodeBlockQueryEmbed",
  "NodeAttributeView",
  "NodeTable",
  "NodeMathBlock",
  "NodeSuperBlock",
]);

/** v2.3.0：HTML 层级过滤 — AV 视图、原始代码块。 */
export const RIPPLE_SKIP_SELECTORS = [".av", ".av__mask", "code", "pre"];

/**
 * v2.3.0：判断块是否在句级分割的目标范围内。
 * 要求 `data-type` 在白名单且不在跳过集，且不被 AV / 代码 / pre 包裹。
 */
export function isRippleTargetBlock(block: HTMLElement): boolean {
  const type = block.dataset?.type;
  if (!type) return false;
  if (RIPPLE_SKIP_BLOCK_TYPES.has(type)) return false;
  if (!RIPPLE_TARGET_BLOCK_TYPES.has(type)) return false;
  if (RIPPLE_SKIP_SELECTORS.some((sel) => !!block.closest(sel))) return false;
  return true;
}

function saveSelection(): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  try {
    return sel.getRangeAt(0).cloneRange();
  } catch {
    return null;
  }
}

function restoreSelection(saved: Range | null): void {
  if (!saved) return;
  const sel = window.getSelection();
  if (!sel) return;
  try {
    sel.removeAllRanges();
    sel.addRange(saved);
  } catch {
    /* range may no longer be valid — best effort */
  }
}

/** 沿文本节点向上找最近的 [data-node-id] 块祖先。 */
function getSentenceRoot(textNode: Node): HTMLElement | null {
  let el: Node | null = textNode;
  while (el && el !== document.body) {
    if (el.nodeType === Node.ELEMENT_NODE) {
      const elHtml = el as HTMLElement;
      if (elHtml.dataset?.nodeId) return elHtml;
    }
    el = el.parentNode;
  }
  return null;
}

/**
 * v2.3.0：把单个文本节点按 .?!。？！ 切成多个 Range，返回每个句子的 Range 数组。
 * 纯计算 — 不修改 DOM，可在 typing 期间被频繁调用。
 */
export function getSentencesForTextNode(textNode: Text): Range[] {
  const text = textNode.nodeValue ?? "";
  if (!text) return [];

  const ranges: Range[] = [];
  const pattern = /[.?!。？！]+/g;
  let lastIndex = 0;
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const end = match.index + match[0].length;
    if (end <= lastIndex) continue; // 重叠跳过
    try {
      const range = document.createRange();
      range.setStart(textNode, lastIndex);
      range.setEnd(textNode, end);
      ranges.push(range);
      lastIndex = end;
    } catch {
      lastIndex = end; // 跳过非法 Range，继续推进
    }
  }

  if (lastIndex < text.length) {
    try {
      const tail = document.createRange();
      tail.setStart(textNode, lastIndex);
      tail.setEnd(textNode, text.length);
      ranges.push(tail);
    } catch {
      /* node 已经被 detach — 跳过 */
    }
  }

  // 兜底：无任何标点（如纯中文标题）→ 整段算一个句子
  if (ranges.length === 0) {
    try {
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, text.length);
      ranges.push(range);
    } catch {
      /* ignore */
    }
  }

  return ranges;
}

/**
 * v2.3.0：在 root 内向前 DOM walk，找到包含全局字符偏移 charOffset 的 Text 节点。
 * 返回 { node, localOffset } — localOffset 是相对于 node 自身的字符偏移。
 *
 * 必要性：每次 wrapTextRange 后，原 Text 节点被 Range.extractContents() 切短，新 span
 * 会被插入到原位置。预存的 (textNode, start) 元组会立即失效。每次匹配都重新 walk
 * 才能拿到"当前 live 的 text node"。这也是 Bug #1（offset staleness）的修复核心。
 *
 * block.textContent 与 walker 遍历顺序一致（document order、depth-first），因此
 * 全局偏移能稳定映射到 walker 路径上的某个节点：累加 Text 节点长度，直到 charOffset
 * 落在某段 [consumed, consumed + len) 区间里。
 */
function findCurrentTextNodeAt(
  root: HTMLElement,
  charOffset: number,
): { node: Text; localOffset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let lastNode: Text | null = null;
  let lastConsumed = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const len = node.nodeValue?.length ?? 0;
    if (charOffset < consumed + len) {
      return { node, localOffset: charOffset - consumed };
    }
    lastNode = node;
    lastConsumed = consumed;
    consumed += len;
  }
  // charOffset 已经走完所有 text node — 可能正好等于 consumed（块末尾）
  if (lastNode && charOffset === consumed) {
    const len = lastNode.nodeValue?.length ?? 0;
    return { node: lastNode, localOffset: len };
  }
  return null;
}

/**
 * v2.3.0：把当前块按 .?!。？！ 切成句，用临时 span（.zt-sentence-span）标记每一段。
 * 返回 Map<block, HTMLElement[]> — 仅包含 currentBlock 一项；元素是 .zt-sentence-span span。
 *
 * Bug #1 修复要点：不再预收集 Range，而是在每次 wrap 前通过 findCurrentTextNodeAt
 * 重新 walk DOM 取 live 的 text node。这样即使上一次 wrap 已经把原文本节点切短并
 * 插入了 span，下一次 wrap 仍能拿到正确的引用。
 *
 * 跨 inline 元素的 sentence（start 与 end 落在不同 Text 节点）会被跳过，
 * 与 wrapTextRange 的"单 Text 节点"约束保持一致。
 */
export function getSentences(
  container: HTMLElement,
  currentBlock: HTMLElement | null,
): Map<HTMLElement, HTMLElement[]> {
  const result = new Map<HTMLElement, HTMLElement[]>();
  if (!currentBlock || !container) return result;
  if (!container.contains(currentBlock)) return result;
  if (!isRippleTargetBlock(currentBlock)) return result;

  // 1. 清旧 span（防累积 + 兜底 — clearAllOpacity 也调一次）
  removeSentenceSpans(currentBlock);

  // 2. 用原始 block.textContent 提切分点（全局偏移）
  const text = currentBlock.textContent ?? "";
  if (!text) return result;
  const matches: Array<{ start: number; end: number }> = [];
  const pattern = /[.?!。？！]+/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (end <= lastIndex) continue;
    matches.push({ start: lastIndex, end });
    lastIndex = end;
  }
  if (lastIndex < text.length) {
    matches.push({ start: lastIndex, end: text.length });
  }
  // 兜底：无标点（纯中文标题等）→ 整段算一个句子
  if (matches.length === 0) {
    matches.push({ start: 0, end: text.length });
  }

  // 3. 逐句包裹 — 每轮用 forward DOM walk 重新定位 text node
  const spans: HTMLElement[] = [];
  const savedSelection = saveSelection();
  for (const { start, end } of matches) {
    const startLoc = findCurrentTextNodeAt(currentBlock, start);
    const endLoc = findCurrentTextNodeAt(currentBlock, end);
    if (!startLoc || !endLoc) continue;
    if (startLoc.node !== endLoc.node) continue; // 跨 inline 节点的句子跳过
    const span = wrapTextRange(startLoc.node, startLoc.localOffset, endLoc.localOffset);
    if (span) spans.push(span);
  }
  restoreSelection(savedSelection);

  // 4. 把临时 span 从 visibility:hidden 切到 visible，让 Step 5 的 opacity 生效
  revealSentenceSpans(currentBlock);

  result.set(currentBlock, spans);
  return result;
}

/**
 * v2.3.0：在 Text 节点的 [start, end) 区间包裹一个临时 span（.zt-sentence-span）。
 * 用 extractContents + insertNode 模式（避开 surroundContents 的 BAD_BOUNDARYPOINTS_ERR）。
 */
export function wrapTextRange(
  textNode: Text,
  start: number,
  end: number,
): HTMLSpanElement | null {
  if (textNode.nodeType !== Node.TEXT_NODE) return null;
  const len = textNode.nodeValue?.length ?? 0;
  if (start < 0 || end > len || start >= end) return null;

  const root = getSentenceRoot(textNode);
  if (!root || !isRippleTargetBlock(root)) return null;

  const savedSelection = saveSelection();
  const span = document.createElement("span");
  span.className = SENTENCE_SPAN_CLASS;
  // visibility: hidden + pointer-events: none — 临时隐藏 + 不被命中测试
  // 不使用 position: absolute：absolutely-positioned span 没有 top/left 偏移时会渲染在
  // static position 但脱离文档流，导致句级文本覆盖在段落原文本上（layout 不重新流入）。
  // wrap 在单个 rAF 内完成，浏览器在 wrap 结束后才绘制，光标稳定性靠 saveSelection/
  // restoreSelection 在 wrapTextRange 调用前后维持（见 L431、L440）。
  span.style.cssText = "visibility: hidden; pointer-events: none;";

  try {
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);

    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);

    restoreSelection(savedSelection);
    return span;
  } catch {
    /* 极端情况：跨 AV / 嵌入块边界等。extractContents 失败时文档未改动，直接丢弃 span。 */
    restoreSelection(savedSelection);
    return null;
  }
}

/**
 * v2.3.0：找到光标所在句的 .zt-sentence-span 元素。
 * 优先用 caretRangeFromPoint(x, y)（基于视觉坐标的原生 caret hit-test），
 * 退化到 window.getSelection()。拿到 text node 后向上 closest 查找最近的句子 span。
 *
 * 修复 Bug #2：原实现返回 Range，与 Step 5 计划的 .style.opacity 消费者类型不匹配
 * （Range 没有 style 属性）。改返回包裹当前 cursor text node 的 .zt-sentence-span，
 * Step 5 的 applyRipple 可直接对其设 opacity。
 *
 * 返回 null：光标所在文本未被任何 .zt-sentence-span 包裹
 * （例如在非目标块、或在 inline 元素内尚未包裹的文本节点上）。
 */
export function getCurrentSentence(
  container: HTMLElement,
  cursorRect: DOMRect | null,
): HTMLElement | null {
  let textNode: Text | null = null;

  if (cursorRect && typeof document.caretRangeFromPoint === "function") {
    try {
      const x = cursorRect.x;
      const y = cursorRect.y + cursorRect.height / 2;
      const pointRange = document.caretRangeFromPoint(x, y);
      if (pointRange) {
        const resolved = pickClosestTextNode(pointRange.startContainer, pointRange.startOffset);
        if (resolved) {
          textNode = resolved.textNode;
        }
      }
    } catch {
      /* fall through to selection-based detection */
    }
  }

  if (!textNode) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    try {
      const range = sel.getRangeAt(0);
      const resolved = pickClosestTextNode(range.startContainer, range.startOffset);
      if (resolved) {
        textNode = resolved.textNode;
      }
    } catch {
      return null;
    }
  }

  if (!textNode || !container.contains(textNode)) return null;

  // 向上找到包含此 text node 的 .zt-sentence-span（最近的句子 span）。
  // 未被包裹的 text（如 inline 元素内尚未由 getSentences 包裹的文本节点）→ 返回 null。
  return (
    textNode.parentElement?.closest<HTMLElement>(`.${SENTENCE_SPAN_CLASS}`) ?? null
  );
}

/**
 * 把 startContainer / startOffset 规范到一个 Text 节点 + 字符偏移。
 *
 * 两种容器语义：
 *   - Text 容器：offset 已经是相对于 nodeValue 的字符偏移，直接返回（clamp 到长度）。
 *   - Element 容器：offset 是 childNodes 索引，caret 位于 childNodes[offset] 之前。
 *     若 child 是 Text → 返回 { textNode: child, offset: 0 }（caret 处于文本节点开头）。
 *     若 child 是 Element → 递归下降（offset=0）。
 *     若 offset 越界（child 为 undefined）→ 回退到 lastChild。
 */
function pickClosestTextNode(
  container: Node,
  offset: number,
): { textNode: Text; offset: number } | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const textNode = container as Text;
    const len = textNode.nodeValue?.length ?? 0;
    return { textNode, offset: Math.max(0, Math.min(len, offset)) };
  }
  if (container.nodeType === Node.ELEMENT_NODE) {
    const el = container as Element;
    const child = el.childNodes[offset] ?? el.lastChild ?? null;
    if (!child) return null;
    if (child.nodeType === Node.TEXT_NODE) {
      return { textNode: child as Text, offset: 0 };
    }
    return pickClosestTextNode(child, 0);
  }
  return null;
}

/**
 * v2.3.0：清理容器内所有句级临时 span，恢复原始文本结构。
 * 在 clearAllOpacity / 下一次 getSentences 之前调用，避免污染 WYSIWYG.lastHTMLs undo 历史。
 */
export function removeSentenceSpans(container: HTMLElement): void {
  const spans = container.querySelectorAll<HTMLElement>(`.${SENTENCE_SPAN_CLASS}`);
  if (spans.length === 0) return;

  const savedSelection = saveSelection();

  spans.forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    // 把所有子节点（Text + 嵌套 element）迁回到 span 原来的位置
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
  });

  restoreSelection(savedSelection);
}

/**
 * v2.3.0：把容器内所有 .zt-sentence-span 从 visibility:hidden 切到 visible，
 * 让 Step 5 的 style.opacity 设定生效。仍保留 pointer-events:none 防止命中测试干扰。
 *
 * 临时隐藏（wrap 阶段）→ 可见（reveal 阶段）→ 移除（下一帧前）是三段式生命周期，
 * 与 DESIGN.md §4.3.2 / §4.3.3 的句级 opacity 设计保持一致。
 */
export function revealSentenceSpans(container: HTMLElement): void {
  const spans = container.querySelectorAll<HTMLElement>(`.${SENTENCE_SPAN_CLASS}`);
  spans.forEach((s) => {
    s.style.visibility = "visible";
  });
}

/* ---------------------------------------------------------------------------
 * v2.3.0：动态算法（dynamic algorithm）— Step 4b
 *
 * Q5 = C 决策：列表项按"视觉权重 × 深度系数"动态计算 opacity，
 * 匹配人眼"看起来多大"的感知。
 *
 * 由 Step 5 的 applyRipple 在计算每块 opacity 时调用：
 *   opacity = baseOpacity × lerp(WEIGHT_MIN, 1.0, visualWeightOf(block))
 *             × (isEmbedBlock(block) ? EMBED_MULTIPLIER : 1)
 *             × calculateDepthFactor(depthOf(block))
 * ------------------------------------------------------------------------- */

/**
 * v2.3.0：块的视觉权重 = 块在编辑器可视区内的可见高度 / 编辑器高度。
 * weight=1.0 → 块占满可视区；weight=0 → 块完全在视窗外。
 */
export function visualWeightOf(block: HTMLElement): number {
  if (!block) return 1.0;
  const rect = block.getBoundingClientRect();
  const editor = block.closest<HTMLElement>(".protyle-wysiwyg");
  if (!editor) return 1.0;
  const editorRect = editor.getBoundingClientRect();
  const visibleTop = Math.max(rect.top, editorRect.top);
  const visibleBottom = Math.min(rect.bottom, editorRect.bottom);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  const editorHeight = editorRect.height || 1;
  return Math.max(0, Math.min(1, visibleHeight / editorHeight));
}

/**
 * v2.3.0：列表嵌套深度 — 数 [data-subtype="o|t|u"] 的祖先元素个数。
 * depth=0 → 根级块；depth=1 → 在 1 层列表内；depth=N → 嵌套 N 层。
 */
export function depthOf(block: HTMLElement): number {
  if (!block) return 0;
  let depth = 0;
  let el: HTMLElement | null = block;
  while (el && el !== document.body) {
    const subtype = el.dataset?.subtype;
    if (subtype === "o" || subtype === "t" || subtype === "u") {
      depth++;
    }
    el = el.parentElement;
  }
  return depth;
}

/**
 * v2.3.0：深度系数 — 每深一层 opacity × (1 - DEPTH_FACTOR)，下限 WEIGHT_MIN。
 * depth=0 → 1.0, depth=1 → 0.95, depth=2 → 0.90, ... 最低 WEIGHT_MIN（0.85）。
 */
export function calculateDepthFactor(depth: number): number {
  return Math.max(WEIGHT_MIN, 1.0 - depth * DEPTH_FACTOR);
}

/**
 * v2.3.0：判定块是否为嵌入内容（iframe / video / PDF / 嵌入块 / 嵌入 IFrame）。
 * 嵌入块基础值 × EMBED_MULTIPLIER（0.85）。
 */
export function isEmbedBlock(block: Element): boolean {
  if (!block) return false;
  const tag = block.tagName?.toLowerCase();
  if (tag === "iframe" || tag === "video") return true;
  const dataType = (block as HTMLElement).dataset?.type;
  return (
    dataType === "NodeIFrame" ||
    dataType === "NodeVideo" ||
    dataType === "NodePDF" ||
    dataType === "NodeBlockQueryEmbed"
  );
}