/**
 * 涟漪聚焦模块 (Ripple Focus) — v2.5.0 重写 (CSS Custom Highlight API)
 *
 * 效果（DESIGN.md §4.1）：
 *   当前输入句 opacity = 1.0，当前块其他句 = 0.88（用 CSS Highlight color 模拟）
 *   相邻块按距离 5 档衰减 [0.72, 0.55, 0.42]
 *   列表块按视觉权重 x 深度系数修正
 *
 * 设计要点：
 *   - 句级粒度：按 .?!。？！ 切句，用 CSS Custom Highlight API 标记（零 DOM 突变）
 *   - 块级粒度：JS 直接 style.opacity
 *   - 默认 OFF，输入后 ON（inputMode.setBothOn 触发）
 *   - 暂停：选中 / 悬浮窗 -> 清除所有 opacity 覆盖 + Highlight
 *   - 单事件驱动：selectionchange + inputMode 订阅
 *
 * v2.5.0 变更：废弃 span 包裹（extractContents + insertNode），改用 CSS Custom Highlight API。
 *   原因：span 包裹分裂文本节点，SiYuan 的 input/transaction 处理器在突变后重新查选区时
 *   选区语义改变 → 光标飘走 + 内容丢失。Highlight API 不修改 DOM，彻底消除此冲突。
 *   trade-off：::highlight 不支持 opacity，句级 dimming 用 color 模拟（对纯文字视觉等效）。
 */

import { getCursorElement } from "../utils/getCursorElement";
import { shouldPauseFocusAndTypewriter } from "../utils/edgeCases";
import { RIPPLE_CONFIG } from "../config";
import * as inputMode from "./inputMode";

const { SENTENCE_LEVELS, DEPTH_FACTOR, WEIGHT_MIN } = RIPPLE_CONFIG;

const RIPPLE_TARGET_BLOCK_TYPES = new Set([
  "NodeParagraph", "NodeHeading", "NodeListItem", "NodeBlockquote",
]);
const RIPPLE_SKIP_BLOCK_TYPES = new Set([
  "NodeCodeBlock", "NodeBlockQueryEmbed", "NodeAttributeView",
  "NodeTable", "NodeMathBlock", "NodeSuperBlock",
]);
const RIPPLE_SKIP_SELECTORS = [".av", ".av__mask", "code", "pre"];

/** CSS Custom Highlight API 注册名。 */
const SENTENCE_DIM_HIGHLIGHT = "zt-sentence-dim";

// --- State ---

let active = false;
let pendingFrame: number | null = null;
let eventListeners: Array<[string, EventListener]> = [];
const modifiedBlocks = new Set<HTMLElement>();
let unsubInputMode: (() => void) | null = null;

// --- Block helpers ---

function getCurrentBlock(): HTMLElement | null {
  const cursor = getCursorElement();
  return (cursor?.closest("[data-node-id]") as HTMLElement) ?? null;
}

function isRippleTargetBlock(block: HTMLElement): boolean {
  const type = block.dataset?.type;
  if (!type) return false;
  if (RIPPLE_SKIP_BLOCK_TYPES.has(type)) return false;
  if (!RIPPLE_TARGET_BLOCK_TYPES.has(type)) return false;
  if (RIPPLE_SKIP_SELECTORS.some((sel) => !!block.closest(sel))) return false;
  return true;
}

function depthOf(block: HTMLElement): number {
  let depth = 0;
  let el: HTMLElement | null = block;
  while (el && el !== document.body) {
    const st = el.dataset?.subtype;
    if (st === "o" || st === "t" || st === "u") depth++;
    el = el.parentElement;
  }
  return depth;
}

function visualWeightOf(block: HTMLElement, editorRect: DOMRect): number {
  const r = block.getBoundingClientRect();
  const visTop = Math.max(r.top, editorRect.top);
  const visBot = Math.min(r.bottom, editorRect.bottom);
  return Math.max(0, Math.min(1, Math.max(0, visBot - visTop) / (editorRect.height || 1)));
}

// --- Caret offset helpers ---

/** Normalize startContainer/startOffset to a Text node + character offset. */
function pickClosestTextNode(container: Node, offset: number): { textNode: Text; offset: number } | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const textNode = container as Text;
    const len = textNode.nodeValue?.length ?? 0;
    return { textNode, offset: Math.max(0, Math.min(len, offset)) };
  }
  if (container.nodeType === Node.ELEMENT_NODE) {
    const el = container as Element;
    const child = el.childNodes[offset] ?? el.lastChild ?? null;
    if (!child) return null;
    if (child.nodeType === Node.TEXT_NODE) return { textNode: child as Text, offset: 0 };
    return pickClosestTextNode(child, 0);
  }
  return null;
}

/** Forward DOM walk to find the Text node containing global charOffset. */
function findCurrentTextNodeAt(root: HTMLElement, charOffset: number): { node: Text; localOffset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let lastNode: Text | null = null;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const len = node.nodeValue?.length ?? 0;
    if (charOffset < consumed + len) return { node, localOffset: charOffset - consumed };
    lastNode = node;
    consumed += len;
  }
  if (lastNode && charOffset === consumed) {
    return { node: lastNode, localOffset: lastNode.nodeValue?.length ?? 0 };
  }
  return null;
}

/** Get the caret's global character offset within root. Returns null if caret is not within root. */
function getCaretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  const resolved = pickClosestTextNode(range.startContainer, range.startOffset);
  if (!resolved) return null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let n: Text | null;
  while ((n = walker.nextNode() as Text | null)) {
    if (n === resolved.textNode) return consumed + resolved.offset;
    consumed += n.nodeValue?.length ?? 0;
  }
  return null;
}

// --- Sentence highlight (CSS Custom Highlight API) ---

/**
 * Apply sentence-level dimming via CSS Custom Highlight API.
 * Zero DOM mutation — builds Range objects on existing text nodes and registers
 * them in CSS.highlights. SiYuan's input/transaction handlers are unaffected.
 */
function applySentenceHighlight(block: HTMLElement, caretOffset: number): void {
  if (!("highlights" in CSS)) return; // CSS Custom Highlight API not supported

  const text = block.textContent ?? "";
  if (!text) {
    CSS.highlights.delete(SENTENCE_DIM_HIGHLIGHT);
    return;
  }

  // Split by sentence-ending punctuation
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
  if (lastIndex < text.length) matches.push({ start: lastIndex, end: text.length });
  if (matches.length === 0) matches.push({ start: 0, end: text.length });

  // Build Ranges for all sentences EXCEPT the current one (the one containing the caret)
  const dimRanges: Range[] = [];
  for (const { start, end } of matches) {
    if (caretOffset >= start && caretOffset <= end) continue;

    const startLoc = findCurrentTextNodeAt(block, start);
    const endLoc = findCurrentTextNodeAt(block, end);
    if (!startLoc || !endLoc) continue;

    try {
      const range = new Range();
      range.setStart(startLoc.node, startLoc.localOffset);
      range.setEnd(endLoc.node, endLoc.localOffset);
      dimRanges.push(range);
    } catch { /* skip invalid range */ }
  }

  if (dimRanges.length > 0) {
    CSS.highlights.set(SENTENCE_DIM_HIGHLIGHT, new Highlight(...dimRanges));
  } else {
    CSS.highlights.delete(SENTENCE_DIM_HIGHLIGHT);
  }
}

// --- Block-level opacity ---

function applyBlockOpacity(container: HTMLElement, currentBlock: HTMLElement): void {
  const currentParent = currentBlock.parentElement;
  const indexMap = new Map<Element, number>();
  let fromIndex = 0;
  if (currentParent) {
    Array.from(currentParent.children).forEach((el, i) => {
      indexMap.set(el, i);
      if (el === currentBlock) fromIndex = i;
    });
  }

  const allBlocks = container.querySelectorAll<HTMLElement>('[data-node-id], iframe, video');
  const editorRect = container.getBoundingClientRect();

  allBlocks.forEach((block) => {
    if (!isRippleTargetBlock(block)) return;
    const toIndex = indexMap.get(block);
    const distance = toIndex === undefined ? fromIndex + 1 : Math.abs(fromIndex - toIndex);
    const baseLevel = SENTENCE_LEVELS[Math.min(distance, SENTENCE_LEVELS.length - 1)];
    const weight = visualWeightOf(block, editorRect);
    const weightFactor = WEIGHT_MIN + weight * (1 - WEIGHT_MIN);
    const depthFactor = Math.max(0.7, 1.0 - depthOf(block) * DEPTH_FACTOR);
    // TODO(DESIGN.md §4.1): 嵌入块 dimming 未生效——isRippleTargetBlock 排除了
    // iframe/video/NodeIFrame/NodeVideo/NodePDF/NodeBlockQueryEmbed，需重构 applyBlockOpacity
    // 让 embed 块进入处理后再恢复 EMBED_MULTIPLIER 乘数。
    block.style.opacity = String(baseLevel * weightFactor * depthFactor);
    modifiedBlocks.add(block);
  });

  if (isRippleTargetBlock(currentBlock)) currentBlock.style.opacity = "1";
}

// --- Main apply ---

function applyRipple(): void {
  if (pendingFrame !== null) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;

    if (!inputMode.isFocusActive() || shouldPauseFocusAndTypewriter()) {
      clearAll();
      return;
    }

    const currentBlock = getCurrentBlock();
    if (!currentBlock) return;

    const container = currentBlock.closest(".protyle-wysiwyg") as HTMLElement | null;
    if (!container) return;

    applyBlockOpacity(container, currentBlock);

    const caretOffset = getCaretOffset(currentBlock);
    if (caretOffset !== null) {
      applySentenceHighlight(currentBlock, caretOffset);
    } else if ("highlights" in CSS) {
      CSS.highlights.delete(SENTENCE_DIM_HIGHLIGHT);
    }
  });
}

function clearAll(): void {
  modifiedBlocks.forEach((block) => { block.style.opacity = ""; });
  modifiedBlocks.clear();
  if ("highlights" in CSS) CSS.highlights.delete(SENTENCE_DIM_HIGHLIGHT);
}

// --- Lifecycle ---

function onSelectionChange(): void {
  applyRipple();
}

export function initRipple(): void {
  active = true;
  pendingFrame = null;

  const handler: EventListener = onSelectionChange;
  document.addEventListener("selectionchange", handler);
  eventListeners = [["selectionchange", handler]];

  // P1-1: 订阅 inputMode。wheel/touchmove/blur/click 等退出事件不触发 selectionchange，
  // 旧版仅靠 selectionchange → clearAll 会让 ripple opacity 在滚动/失焦后残留。
  unsubInputMode = inputMode.subscribe((state) => {
    if (!state.focusActive && active) clearAll();
  });

  applyRipple();
}

export function destroyRipple(): void {
  active = false;
  eventListeners.forEach(([event, handler]) => {
    document.removeEventListener(event, handler);
  });
  eventListeners = [];

  if (unsubInputMode) {
    unsubInputMode();
    unsubInputMode = null;
  }

  if (pendingFrame !== null) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }

  clearAll();
}
