/**
 * 涟漪聚焦模块 (Ripple Focus) — v2.3.1 重写
 *
 * 效果（DESIGN.md §4.1）：
 *   当前输入句 opacity = 1.0，当前块其他句 = 0.88
 *   相邻块按距离 5 档衰减 [0.72, 0.55, 0.42]
 *   嵌入块 x0.85，列表块按视觉权重 x 深度系数修正
 *
 * 设计要点：
 *   - 句级粒度：按 .?!。？！ 切句，临时 span 标记（extractContents + insertNode）
 *   - JS 直接 style.opacity，不注入 CSS
 *   - 默认 OFF，输入后 ON（inputMode.setBothOn 触发）
 *   - 暂停：选中 / 悬浮窗 -> 清除所有 opacity 覆盖
 *   - span 缓存：块未变且文本未变时复用上次 span，避免每次 selectionchange 重建 DOM
 *   - 单事件驱动：仅 selectionchange
 */

import { getCursorElement } from "../utils/getCursorElement";
import { getCursorRect } from "../utils/getCursorRect";
import { shouldPauseFocusAndTypewriter } from "../utils/edgeCases";
import { RIPPLE_CONFIG } from "../config";
import * as inputMode from "./inputMode";

const { SENTENCE_LEVELS, EMBED_MULTIPLIER, DEPTH_FACTOR, WEIGHT_MIN } = RIPPLE_CONFIG;

const SENTENCE_SPAN_CLASS = "zt-sentence-span";

const RIPPLE_TARGET_BLOCK_TYPES = new Set([
  "NodeParagraph", "NodeHeading", "NodeListItem", "NodeBlockquote",
]);
const RIPPLE_SKIP_BLOCK_TYPES = new Set([
  "NodeCodeBlock", "NodeBlockQueryEmbed", "NodeAttributeView",
  "NodeTable", "NodeMathBlock", "NodeSuperBlock",
]);
const RIPPLE_SKIP_SELECTORS = [".av", ".av__mask", "code", "pre"];

// --- State ---

let active = false;
let pendingFrame: number | null = null;
let eventListeners: Array<[string, EventListener]> = [];
const modifiedBlocks = new Set<HTMLElement>();

// Span cache: rebuild only when block or text changes
let cachedBlock: HTMLElement | null = null;
let cachedText = "";
let cachedSpans: HTMLElement[] = [];

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

function isEmbedBlock(block: Element): boolean {
  const tag = block.tagName?.toLowerCase();
  if (tag === "iframe" || tag === "video") return true;
  const dt = (block as HTMLElement).dataset?.type;
  return dt === "NodeIFrame" || dt === "NodeVideo" || dt === "NodePDF" || dt === "NodeBlockQueryEmbed";
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

// --- Selection save / restore ---

function saveSelection(): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  try { return sel.getRangeAt(0).cloneRange(); } catch { return null; }
}

function restoreSelection(saved: Range | null): void {
  if (!saved) return;
  const sel = window.getSelection();
  if (!sel) return;
  try { sel.removeAllRanges(); sel.addRange(saved); } catch { /* range invalid */ }
}

// --- Sentence parsing ---

/** Walk up from textNode to find first [data-node-id] ancestor. */
function getSentenceRoot(textNode: Node): HTMLElement | null {
  let el: Node | null = textNode;
  while (el && el !== document.body) {
    if (el.nodeType === Node.ELEMENT_NODE && (el as HTMLElement).dataset?.nodeId) {
      return el as HTMLElement;
    }
    el = el.parentNode;
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

/** Wrap [start, end) in a temp span using extractContents + insertNode (avoids surroundContents BAD_BOUNDARYPOINTS_ERR). */
function wrapTextRange(textNode: Text, start: number, end: number): HTMLSpanElement | null {
  if (textNode.nodeType !== Node.TEXT_NODE) return null;
  const len = textNode.nodeValue?.length ?? 0;
  if (start < 0 || end > len || start >= end) return null;
  const root = getSentenceRoot(textNode);
  if (!root || !isRippleTargetBlock(root)) return null;

  const saved = saveSelection();
  const span = document.createElement("span");
  span.className = SENTENCE_SPAN_CLASS;
  span.style.cssText = "visibility: hidden; pointer-events: none;";

  try {
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const fragment = range.extractContents();
    span.appendChild(fragment);
    try {
      range.insertNode(span);
    } catch {
      while (span.firstChild) range.insertNode(span.firstChild);
      restoreSelection(saved);
      return null;
    }
    restoreSelection(saved);
    return span;
  } catch {
    restoreSelection(saved);
    return null;
  }
}

/** Remove all sentence spans from container, restoring original text structure. */
function removeSentenceSpans(container: HTMLElement): void {
  const spans = container.querySelectorAll<HTMLElement>(`.${SENTENCE_SPAN_CLASS}`);
  if (spans.length === 0) return;
  const saved = saveSelection();
  spans.forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  });
  restoreSelection(saved);
}

/**
 * Build sentence spans for the current block, with caching.
 * Rebuilds ONLY when block changes or textContent changes.
 * On cache hit (same block + same text), returns previous spans without DOM mutation.
 */
function buildSentences(block: HTMLElement): HTMLElement[] {
  const text = block.textContent ?? "";

  // Cache hit: same block, same text -> reuse
  if (block === cachedBlock && text === cachedText) {
    return cachedSpans;
  }

  // Cache miss: clean old block's spans
  if (cachedBlock && cachedBlock !== block) {
    removeSentenceSpans(cachedBlock);
  }
  // Also clean current block (stale spans from previous cycle)
  removeSentenceSpans(block);

  if (!text || !isRippleTargetBlock(block)) {
    cachedBlock = block;
    cachedText = text;
    cachedSpans = [];
    return [];
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

  // Wrap each sentence — re-walk DOM each time to get live text node refs
  const spans: HTMLElement[] = [];
  const saved = saveSelection();
  for (const { start, end } of matches) {
    const startLoc = findCurrentTextNodeAt(block, start);
    const endLoc = findCurrentTextNodeAt(block, end);
    if (!startLoc || !endLoc) continue;
    if (startLoc.node !== endLoc.node) continue;
    const span = wrapTextRange(startLoc.node, startLoc.localOffset, endLoc.localOffset);
    if (span) spans.push(span);
  }
  restoreSelection(saved);

  // Reveal spans (switch from hidden to visible so opacity takes effect)
  spans.forEach((s) => (s.style.visibility = "visible"));

  cachedBlock = block;
  cachedText = text;
  cachedSpans = spans;
  return spans;
}

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

/** Find the .zt-sentence-span containing the cursor, via caretRangeFromPoint or selection fallback. */
function findCurrentSentence(
  container: HTMLElement,
  cursorRect: { x: number; y: number; height: number } | null,
): HTMLElement | null {
  let textNode: Text | null = null;

  if (cursorRect && typeof document.caretRangeFromPoint === "function") {
    try {
      const x = cursorRect.x;
      const y = cursorRect.y + cursorRect.height / 2;
      const pointRange = document.caretRangeFromPoint(x, y);
      if (pointRange) {
        const resolved = pickClosestTextNode(pointRange.startContainer, pointRange.startOffset);
        if (resolved) textNode = resolved.textNode;
      }
    } catch { /* fall through to selection-based detection */ }
  }

  if (!textNode) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    try {
      const range = sel.getRangeAt(0);
      const resolved = pickClosestTextNode(range.startContainer, range.startOffset);
      if (resolved) textNode = resolved.textNode;
    } catch { return null; }
  }

  if (!textNode || !container.contains(textNode)) return null;
  return textNode.parentElement?.closest<HTMLElement>(`.${SENTENCE_SPAN_CLASS}`) ?? null;
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
    const embedMult = isEmbedBlock(block) ? EMBED_MULTIPLIER : 1;
    block.style.opacity = String(baseLevel * weightFactor * depthFactor * embedMult);
    modifiedBlocks.add(block);
  });

  currentBlock.style.opacity = "1";
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

    const spans = buildSentences(currentBlock);
    applyBlockOpacity(container, currentBlock);

    const cursorRect = getCursorRect();
    const currentSentence = findCurrentSentence(container, cursorRect);
    if (spans.length > 0) {
      spans.forEach((span) => {
        span.style.opacity = span === currentSentence ? "1" : "0.88";
      });
    }
  });
}

function clearAll(): void {
  modifiedBlocks.forEach((block) => { block.style.opacity = ""; });
  modifiedBlocks.clear();

  document.querySelectorAll<HTMLElement>(".protyle-wysiwyg").forEach((container) => {
    removeSentenceSpans(container);
  });

  cachedBlock = null;
  cachedText = "";
  cachedSpans = [];
}

// --- Lifecycle ---

function onSelectionChange(): void {
  applyRipple();
}

export function initRipple(): void {
  active = true;
  pendingFrame = null;
  cachedBlock = null;
  cachedText = "";
  cachedSpans = [];

  const handler: EventListener = onSelectionChange;
  document.addEventListener("selectionchange", handler);
  eventListeners = [["selectionchange", handler]];

  applyRipple();
}

export function destroyRipple(): void {
  active = false;
  eventListeners.forEach(([event, handler]) => {
    document.removeEventListener(event, handler);
  });
  eventListeners = [];

  if (pendingFrame !== null) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }

  clearAll();
}
