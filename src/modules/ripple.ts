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
 *   trade-off：::highlight 不支持 opacity/transition，句级切换用 color + rAF 插值模拟。
 */

import { getCursorElement } from "../utils/getCursorElement";
import { shouldPauseFocusAndTypewriter } from "../utils/edgeCases";
import { RIPPLE_CONFIG } from "../config";
import * as inputMode from "./inputMode";

const { BLOCK_LEVELS, SENTENCE_DIM_ALPHA, TRANSITION_SEC, WEIGHT_MIN } = RIPPLE_CONFIG;

/** CSS Custom Highlight API 注册名。 */
const SENTENCE_DIM_HIGHLIGHT = "zt-sentence-dim";
const SENTENCE_FADE_IN_HIGHLIGHT = "zt-sentence-fade-in";
const SENTENCE_FADE_OUT_HIGHLIGHT = "zt-sentence-fade-out";
const SENTENCE_FADE_MS = Math.round(TRANSITION_SEC * 1000);

// --- State ---

let active = false;
let pendingFrame: number | null = null;
let eventListeners: Array<[string, EventListener]> = [];
const modifiedBlocks = new Set<HTMLElement>();
let unsubInputMode: (() => void) | null = null;

// P0-3: 块级 opacity 缓存——同一顶层块 + 无滚动 + 无块增删时跳过整个 applyBlockOpacity。
// containerTop（rect.top）捕获祖先滚动；scrollTop 捕获 container 自身滚动。
let lastBlockOpacityBlockId: string | null = null;
let lastBlockOpacityContainerTop: number | null = null;
let lastBlockOpacityScrollTop: number | null = null;
let lastBlockOpacityChildCount: number | null = null;

// P1-2: 句级 dim 色 CSS 变量仅在 OFF→ON 或主题切换时设置，避免每帧重写。
let rippleColorActive = false;
let lastThemeMode: string | null = null;

// --- Block helpers ---

function getCurrentBlock(): HTMLElement | null {
  const cursor = getCursorElement();
  return (cursor?.closest("[data-node-id]") as HTMLElement) ?? null;
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

type TextNodeEntry = { node: Text; start: number; len: number };
type SentenceRange = { start: number; end: number };
type Rgba = { r: number; g: number; b: number; a: number };

/** Single forward TreeWalker pass — collects all text nodes with cumulative offsets. */
function buildTextNodeMap(root: HTMLElement): TextNodeEntry[] {
  const map: TextNodeEntry[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let n: Text | null;
  while ((n = walker.nextNode() as Text | null)) {
    const len = n.nodeValue?.length ?? 0;
    map.push({ node: n, start: consumed, len });
    consumed += len;
  }
  return map;
}

/** Resolve a global char offset to a Text node + local offset via binary search on the map. */
function resolveTextNodeAt(map: TextNodeEntry[], charOffset: number): { node: Text; localOffset: number } | null {
  const n = map.length;
  if (n === 0) return null;
  const last = map[n - 1];
  const total = last.start + last.len;
  if (charOffset >= total) {
    return charOffset === total ? { node: last.node, localOffset: last.len } : null;
  }
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (map[mid].start + map[mid].len > charOffset) hi = mid;
    else lo = mid + 1;
  }
  const e = map[lo];
  return { node: e.node, localOffset: charOffset - e.start };
}

/** Get the caret's global character offset within root. Returns null if caret is not within root. */
function getCaretOffset(root: HTMLElement, textNodeMap?: TextNodeEntry[]): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  const resolved = pickClosestTextNode(range.startContainer, range.startOffset);
  if (!resolved) return null;

  const map = textNodeMap ?? buildTextNodeMap(root);
  for (const entry of map) {
    if (entry.node === resolved.textNode) return entry.start + resolved.offset;
  }
  return null;
}

// --- Sentence highlight (CSS Custom Highlight API) ---

// Cache for same-sentence short-circuit: selectionchange fires on cursor movement
// (arrow keys / clicks) without text changes — dim ranges are identical, skip rebuild.
let lastDimBlockId: string | null = null;
let lastDimText = "";
let lastCaretSentenceRange: SentenceRange | null = null;
let lastHadDimRanges = false;
let lastDimFirstNode: Text | null = null;
let sentenceFadeFrame: number | null = null;
let sentenceFadeToken = 0;

function sentenceHighlightSupported(): boolean {
  return "highlights" in CSS && typeof Highlight !== "undefined";
}

function rangesEqual(a: SentenceRange | null, b: SentenceRange | null): boolean {
  return !!a && !!b && a.start === b.start && a.end === b.end;
}

function splitSentences(text: string): SentenceRange[] {
  const matches: SentenceRange[] = [];
  const pattern = /(?<!\d)[.?!。？！…]+(?!\d)/g;
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
  return matches;
}

function rangeFromOffsets(textNodeMap: TextNodeEntry[], start: number, end: number): Range | null {
  const startLoc = resolveTextNodeAt(textNodeMap, start);
  const endLoc = resolveTextNodeAt(textNodeMap, end);
  if (!startLoc || !endLoc) return null;

  try {
    const range = new Range();
    range.setStart(startLoc.node, startLoc.localOffset);
    range.setEnd(endLoc.node, endLoc.localOffset);
    return range;
  } catch {
    return null;
  }
}

function setSentenceHighlight(name: string, ranges: Range[]): void {
  if (ranges.length > 0) {
    CSS.highlights.set(name, new Highlight(...ranges));
  } else {
    CSS.highlights.delete(name);
  }
}

function buildDimRanges(
  sentenceRanges: SentenceRange[],
  textNodeMap: TextNodeEntry[],
  excludedRanges: SentenceRange[],
): Range[] {
  const dimRanges: Range[] = [];
  for (const sentenceRange of sentenceRanges) {
    if (excludedRanges.some((excluded) => sentenceRange.start === excluded.start)) continue;
    const range = rangeFromOffsets(textNodeMap, sentenceRange.start, sentenceRange.end);
    if (range) dimRanges.push(range);
  }
  return dimRanges;
}

function resetSentenceCache(): void {
  lastDimBlockId = null;
  lastDimText = "";
  lastCaretSentenceRange = null;
  lastHadDimRanges = false;
  lastDimFirstNode = null;
}

function cancelSentenceFade(): void {
  sentenceFadeToken += 1;
  if (sentenceFadeFrame !== null) {
    cancelAnimationFrame(sentenceFadeFrame);
    sentenceFadeFrame = null;
  }
  if (sentenceHighlightSupported()) {
    CSS.highlights.delete(SENTENCE_FADE_IN_HIGHLIGHT);
    CSS.highlights.delete(SENTENCE_FADE_OUT_HIGHLIGHT);
  }
}

function colorToCss(color: Rgba): string {
  return `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${Math.max(0, Math.min(1, color.a))})`;
}

function mixColor(from: Rgba, to: Rgba, t: number): Rgba {
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
    a: from.a + (to.a - from.a) * t,
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function parseRgbColor(value: string): Rgba | null {
  const match = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function getThemeDimColor(): Rgba {
  const themeMode = document.documentElement.getAttribute("data-theme-mode");
  const value = themeMode === "dark" ? 255 : 0;
  return { r: value, g: value, b: value, a: SENTENCE_DIM_ALPHA };
}

function getBlockTextColor(block: HTMLElement): Rgba {
  const parsed = parseRgbColor(getComputedStyle(block).color);
  if (parsed) return parsed;
  const fallback = document.documentElement.getAttribute("data-theme-mode") === "dark" ? 255 : 0;
  return { r: fallback, g: fallback, b: fallback, a: 1 };
}

function startSentenceFade(
  block: HTMLElement,
  textNodeMap: TextNodeEntry[],
  sentenceRanges: SentenceRange[],
  oldCaretRange: SentenceRange,
  newCaretRange: SentenceRange,
): boolean {
  cancelSentenceFade();

  if (SENTENCE_FADE_MS <= 0) return false;

  const fadeOutSource = sentenceRanges.find((range) => range.start === oldCaretRange.start) ?? oldCaretRange;
  const fadeInSource = sentenceRanges.find((range) => range.start === newCaretRange.start) ?? newCaretRange;
  const fadeOutRange = rangeFromOffsets(textNodeMap, fadeOutSource.start, fadeOutSource.end);
  const fadeInRange = rangeFromOffsets(textNodeMap, fadeInSource.start, fadeInSource.end);
  if (!fadeOutRange || !fadeInRange) return false;

  const token = sentenceFadeToken;
  const startTime = performance.now();
  const firstNode = textNodeMap.length > 0 ? textNodeMap[0].node : null;
  const blockId = block.dataset?.nodeId ?? null;
  const text = block.textContent ?? "";
  const textColor = getBlockTextColor(block);
  const dimColor = getThemeDimColor();
  document.documentElement.style.setProperty("--zt-sentence-fade-out-color", colorToCss(textColor));
  document.documentElement.style.setProperty("--zt-sentence-fade-in-color", colorToCss(dimColor));

  setSentenceHighlight(SENTENCE_FADE_OUT_HIGHLIGHT, [fadeOutRange]);
  setSentenceHighlight(SENTENCE_FADE_IN_HIGHLIGHT, [fadeInRange]);

  const finish = () => {
    if (token !== sentenceFadeToken) return;
    sentenceFadeFrame = null;
    CSS.highlights.delete(SENTENCE_FADE_OUT_HIGHLIGHT);
    CSS.highlights.delete(SENTENCE_FADE_IN_HIGHLIGHT);

    if (
      active &&
      block.isConnected &&
      firstNode !== null &&
      block.contains(firstNode) &&
      blockId === lastDimBlockId &&
      text === lastDimText &&
      rangesEqual(lastCaretSentenceRange, newCaretRange)
    ) {
      const finalDimRanges = buildDimRanges(sentenceRanges, textNodeMap, [newCaretRange]);
      setSentenceHighlight(
        SENTENCE_DIM_HIGHLIGHT,
        finalDimRanges,
      );
      lastHadDimRanges = finalDimRanges.length > 0;
    }
  };

  const step = (now: number) => {
    if (token !== sentenceFadeToken) return;

    const raw = Math.min(1, (now - startTime) / SENTENCE_FADE_MS);
    const t = easeInOutCubic(raw);
    document.documentElement.style.setProperty(
      "--zt-sentence-fade-out-color",
      colorToCss(mixColor(textColor, dimColor, t)),
    );
    document.documentElement.style.setProperty(
      "--zt-sentence-fade-in-color",
      colorToCss(mixColor(dimColor, textColor, t)),
    );

    if (raw < 1) {
      sentenceFadeFrame = requestAnimationFrame(step);
      return;
    }

    finish();
  };

  sentenceFadeFrame = requestAnimationFrame(step);
  return true;
}

/**
 * Apply sentence-level dimming via CSS Custom Highlight API.
 * Zero DOM mutation — builds Range objects on existing text nodes and registers
 * them in CSS.highlights. SiYuan's input/transaction handlers are unaffected.
 */
function applySentenceHighlight(block: HTMLElement, caretOffset: number, textNodeMap: TextNodeEntry[]): void {
  if (!sentenceHighlightSupported()) return; // CSS Custom Highlight API not supported

  const text = block.textContent ?? "";
  if (!text) {
    cancelSentenceFade();
    CSS.highlights.delete(SENTENCE_DIM_HIGHLIGHT);
    resetSentenceCache();
    return;
  }

  const blockId = block.dataset?.nodeId ?? null;

  // Short-circuit: cursor moved within the same sentence of the same block (no text change).
  // has() catches external Highlight clears (clearAll / destroyRipple); contains() catches
  // DOM restructuring with identical textContent (SiYuan block re-render).
  if (
    blockId !== null &&
    blockId === lastDimBlockId &&
    text === lastDimText &&
    lastCaretSentenceRange !== null &&
    lastDimFirstNode !== null &&
    block.contains(lastDimFirstNode) &&
    caretOffset >= lastCaretSentenceRange.start &&
    caretOffset <= lastCaretSentenceRange.end &&
    (!lastHadDimRanges || CSS.highlights.has(SENTENCE_DIM_HIGHLIGHT))
  ) {
    return;
  }

  // Split by sentence-ending punctuation (含中文省略号 …)。
  // 跳过数字间的英文句点（小数点 3.14 不分割）：lookbehind/lookahead 排除 \d.\d。
  const matches = splitSentences(text);

  // Build Ranges for all sentences EXCEPT the current one (the one containing the caret)
  let caretRange: SentenceRange | null = null;
  for (const { start, end } of matches) {
    if (caretOffset >= start && caretOffset <= end) {
      caretRange = { start, end };
      break;
    }
  }

  const previousCaretRange = lastCaretSentenceRange;
  const canAnimate =
    SENTENCE_FADE_MS > 0 &&
    blockId !== null &&
    blockId === lastDimBlockId &&
    previousCaretRange !== null &&
    caretRange !== null &&
    previousCaretRange.start !== caretRange.start &&
    lastDimFirstNode !== null &&
    block.contains(lastDimFirstNode);

  const dimRanges = buildDimRanges(
    matches,
    textNodeMap,
    canAnimate && previousCaretRange && caretRange
      ? [previousCaretRange, caretRange]
      : caretRange
        ? [caretRange]
        : [],
  );

  if (dimRanges.length > 0) {
    setSentenceHighlight(SENTENCE_DIM_HIGHLIGHT, dimRanges);
  } else {
    CSS.highlights.delete(SENTENCE_DIM_HIGHLIGHT);
  }

  // Update cache
  lastDimBlockId = blockId;
  lastDimText = text;
  lastCaretSentenceRange = caretRange;
  lastHadDimRanges = dimRanges.length > 0;
  lastDimFirstNode = textNodeMap.length > 0 ? textNodeMap[0].node : null;

  if (canAnimate && previousCaretRange && caretRange) {
    const started = startSentenceFade(block, textNodeMap, matches, previousCaretRange, caretRange);
    if (!started) {
      const fallbackRanges = buildDimRanges(matches, textNodeMap, [caretRange]);
      setSentenceHighlight(SENTENCE_DIM_HIGHLIGHT, fallbackRanges);
      lastHadDimRanges = fallbackRanges.length > 0;
    }
  } else {
    cancelSentenceFade();
  }
}

// --- Block-level opacity ---

function applyBlockOpacity(container: HTMLElement, currentBlock: HTMLElement): void {
  // 找 currentBlock 的顶层块（container 的直接子级）。
  // 嵌套块（列表项、列表内段落等）不单独设 opacity，继承父级——
  // 避免嵌套 opacity 叠加（父 0.5 × 子 0.5 = 0.25 不可见）。
  let topBlock: HTMLElement = currentBlock;
  let parent: HTMLElement | null = currentBlock.parentElement;
  while (parent && parent !== container) {
    topBlock = parent;
    parent = parent.parentElement;
  }

  const editorRect = container.getBoundingClientRect();
  const blockId = topBlock.dataset?.nodeId ?? null;
  const containerTop = Math.round(editorRect.top);
  const scrollTop = container.scrollTop;
  const childCount = container.childElementCount;

  // P0-3: 同一顶层块 + 无滚动 + 无块增删 → distance/weight/opacity 与上一帧完全相同，跳过。
  if (
    blockId !== null &&
    blockId === lastBlockOpacityBlockId &&
    containerTop === lastBlockOpacityContainerTop &&
    scrollTop === lastBlockOpacityScrollTop &&
    childCount === lastBlockOpacityChildCount
  ) {
    return;
  }

  // 只遍历 container 的直接子级（顶层块），不 querySelectorAll 嵌套块。
  const siblings = Array.from(container.children) as HTMLElement[];
  const fromIndex = siblings.indexOf(topBlock);
  if (fromIndex === -1) return;

  // 缓存仅在成功应用后更新——fromIndex===-1 时不缓存，下次重试。
  lastBlockOpacityBlockId = blockId;
  lastBlockOpacityContainerTop = containerTop;
  lastBlockOpacityScrollTop = scrollTop;
  lastBlockOpacityChildCount = childCount;

  const newBlocks = new Set<HTMLElement>();

  siblings.forEach((block, i) => {
    if (!block.hasAttribute("data-node-id")) return; // 跳过非块元素
    const distance = Math.abs(fromIndex - i);
    const baseLevel = BLOCK_LEVELS[Math.min(distance, BLOCK_LEVELS.length - 1)];
    // P1-1: distance≥2 的远块 weight 差异不可感知，跳过 getBoundingClientRect。
    const weightFactor = distance === 0
      ? 1.0
      : distance >= 2
      ? 1.0
      : WEIGHT_MIN + visualWeightOf(block, editorRect) * (1 - WEIGHT_MIN);
    block.style.transition = `opacity ${TRANSITION_SEC}s ease`;
    block.style.opacity = String(baseLevel * weightFactor);
    newBlocks.add(block);
  });

  // 不在新列表里的旧块：清 opacity（transition 仍在，淡出到 1）
  modifiedBlocks.forEach((block) => {
    if (!newBlocks.has(block)) {
      block.style.opacity = "";
    }
  });

  modifiedBlocks.clear();
  newBlocks.forEach((b) => modifiedBlocks.add(b));
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

    // 句级 dim color：仅在 OFF→ON 或主题切换时设 CSS 变量（避免每帧重写）。
    const themeMode = document.documentElement.getAttribute("data-theme-mode");
    if (!rippleColorActive || themeMode !== lastThemeMode) {
      const dimRgb = themeMode === "dark" ? "255,255,255" : "0,0,0";
      document.documentElement.style.setProperty(
        "--zt-sentence-dim-color",
        `rgba(${dimRgb},${SENTENCE_DIM_ALPHA})`,
      );
      rippleColorActive = true;
      lastThemeMode = themeMode;
    }

    applyBlockOpacity(container, currentBlock);

    const textNodeMap = buildTextNodeMap(currentBlock);
    const caretOffset = getCaretOffset(currentBlock, textNodeMap);
    if (caretOffset !== null) {
      applySentenceHighlight(currentBlock, caretOffset, textNodeMap);
    } else if (sentenceHighlightSupported()) {
      cancelSentenceFade();
      CSS.highlights.delete(SENTENCE_DIM_HIGHLIGHT);
      resetSentenceCache();
    }
  });
}

function clearAll(): void {
  // 清 opacity 但不清 transition / modifiedBlocks——
  // transition 保留让淡出有动画；modifiedBlocks 保留供下次 applyBlockOpacity 交替。
  modifiedBlocks.forEach((block) => {
    block.style.opacity = "";
  });
  // 兜底：清理已脱离 modifiedBlocks 追踪的残留块（v2.6.0 的 isConnected 检查曾导致漏清）
  document.querySelectorAll('.protyle-wysiwyg [data-node-id]').forEach((el: Element) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.style.opacity) htmlEl.style.opacity = "";
  });
  cancelSentenceFade();
  if (sentenceHighlightSupported()) CSS.highlights.delete(SENTENCE_DIM_HIGHLIGHT);
  document.documentElement.style.removeProperty("--zt-sentence-dim-color");
  document.documentElement.style.removeProperty("--zt-sentence-fade-in-color");
  document.documentElement.style.removeProperty("--zt-sentence-fade-out-color");
  resetSentenceCache();
  // 重置缓存：视觉状态已清，下次 apply 必须重建。
  lastBlockOpacityBlockId = null;
  lastBlockOpacityContainerTop = null;
  lastBlockOpacityScrollTop = null;
  lastBlockOpacityChildCount = null;
  rippleColorActive = false;
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

  // clearAll 只清 opacity（保留淡出动画），destroy 时彻底清 transition + modifiedBlocks
  modifiedBlocks.forEach((block) => {
    block.style.transition = "";
    block.style.opacity = "";
  });
  // 兜底：清理所有编辑器中的残留（脱离追踪的块）
  document.querySelectorAll('.protyle-wysiwyg [data-node-id]').forEach((el: Element) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.transition = "";
    htmlEl.style.opacity = "";
  });
  modifiedBlocks.clear();
}
