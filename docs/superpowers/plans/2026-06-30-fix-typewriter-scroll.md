# Fix Typewriter Scrolling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typewriter scrolls the caret to ~38% of the editor viewport on every keystroke (and on click/selection-change), matching `TYPEWRITER_CONFIG.TARGET_RATIO`.

**Architecture:** Single-file refactor of `src/modules/typewriter.ts` to reuse the proven `isInAllowElements()` from the cursor module for editor detection and scroll-anchor (`editorRect`), and to call `inputMode.setBothOn()` at init so `typewriterActive` is true when the flag is checked by the event handlers.

**Tech Stack:** TypeScript (SiYuan plugin), DOM APIs, no new dependencies.

## Global Constraints

- Only `src/modules/typewriter.ts` is modified — no other files
- Do not touch `src/modules/cursor.ts` or `src/modules/cursor/boundary.ts`
- No new dependencies or models
- Smallest change that fully solves the task
- Reuse existing primitives: `isInAllowElements`, `inputMode`, `getCursorRect`, `findClosestScrollableElement`, `smoothScroll`
- Follow existing patterns and conventions in the codebase

---

### Task 1: Fix all three root-cause layers in typewriter.ts

**Files:**
- Modify: `src/modules/typewriter.ts` (entire file, 105 lines)

**Interfaces:**
- Consumes: `isInAllowElements(pos)` from `../modules/cursor/boundary` (returns `AllowResult { allowed, cursorElement, editorRect?, ... }`)
- Consumes: `inputMode.setBothOn()` from `./inputMode` (idempotent — safe to call when already on)
- Consumes: `getCursorRect()` from `../utils/getCursorRect` (returns `{x, y, width, height} | null`)
- Consumes: `findClosestScrollableElement(el)` from `../utils/scroll` (returns `HTMLElement | null`)
- Consumes: `shouldPauseTypewriter()` from `../utils/edgeCases`
- Produces: `initTypewriter()`, `destroyTypewriter()` — signatures unchanged

#### Step 1: Add import for `isInAllowElements`

Add one import line after the existing imports. The function is already exported from `src/modules/cursor/boundary.ts` and already used by `src/modules/cursor.ts` (line 32). No modification to boundary.ts is needed.

- [ ] **Step 1: Add import**

**Action:** Insert after line 6 (`import * as inputMode from "./inputMode";`):

```typescript
import { isInAllowElements } from "./cursor/boundary";
```

**Verification:** `npx tsc --noEmit` — should pass (import resolves).

#### Step 2: Remove `getEditorContainer()` function and unused imports

The `getEditorContainer()` function (lines 17-27) is the root cause of Layer 1 (wrong scroll target selector). Replace it entirely with inline logic in `checkAndScroll()` that uses `isInAllowElements`. Also remove `getActiveEditor` import since it was only used by `getEditorContainer()`.

- [ ] **Step 2a: Remove `getActiveEditor` import**

**Action:** Delete line 1:
```typescript
- import { getActiveEditor } from "siyuan";
```

(The `findClosestScrollableElement` import on line 3 is still needed — it will be used in the rewritten `checkAndScroll()`.)

- [ ] **Step 2b: Remove `getEditorContainer()` function**

**Action:** Delete lines 17-27 (the entire function):
```typescript
function getEditorContainer(): HTMLElement | null {
  // P2: 改用官方 getActiveEditor() 替代 .protyle:not(.fn__none) DOM 遍历
  // 分屏时正确找到活跃编辑器的可滚动祖先
  const activeEditor = getActiveEditor();
  if (!activeEditor) return null;
  const contentEl = activeEditor.protyle.element.querySelector(
    ".protyle-content",
  ) as HTMLElement | null;
  if (!contentEl) return null;
  return findClosestScrollableElement(contentEl);
}
```

**Verification:** `npx tsc --noEmit` — `getActiveEditor` should now show as unused import (already removed in 2a). `findClosestScrollableElement` should show as unused import — but it will be used in the rewritten `checkAndScroll()` (Step 4). Temporarily ignore for this step.

#### Step 3: Add `inputMode.setBothOn()` to `initTypewriter()`

This fixes Layer 3: `typewriterActive` is never true because no code sets it. `setBothOn()` is idempotent (line 40 of inputMode.ts: `if (focusActive && typewriterActive) return;`), so calling it in `initTypewriter()` is safe even if cursor module later calls it too. It also sets `focusActive`, but since typewriter doesn't read `focusActive`, this is a harmless side effect.

- [ ] **Step 3: Add `setBothOn()` call**

**Action:** Insert after `eventListeners = handlers;` (line 92):

```typescript
eventListeners = handlers;

// 初始化时立即激活打字机模式状态
// setBothOn 是幂等的，多次调用安全；cursor 模块也会在 input 事件中调用
inputMode.setBothOn();
```

**Verification:** `npx tsc --noEmit` — should pass.

**Full `initTypewriter()` after this step:**
```typescript
export function initTypewriter(): void {
  // 事件数组使用三元组以便保留 options
  const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
    ["selectionchange", checkAndScroll],
    ["keyup", checkAndScroll],
    ["keydown", checkAndScroll],
    ["click", checkAndScroll],
    ["mouseup", checkAndScroll],
    ["resize", checkAndScroll],
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
```

#### Step 4: Rewrite `checkAndScroll()` to use `isInAllowElements` and `editorRect`

This fixes Layer 1 (wrong scroll target selector) and Layer 2 (no scroll anchor). The rewritten function:

1. Uses `isInAllowElements()` to find the correct `cursorElement` (proven selector `.protyle:not(.fn__none) .protyle-content` from boundary.ts:79-81) instead of the broken `getEditorContainer()`.
2. Uses `result.editorRect` (from boundary.ts:96 — the `.protyle-content` bounding rect) as the scroll anchor for `targetY` instead of the wrong `container.getBoundingClientRect()`.
3. Finds the scroll target via `findClosestScrollableElement()` starting from the correct `cursorElement`.

- [ ] **Step 4: Replace `checkAndScroll()` function body**

**Action:** Replace the current `checkAndScroll()` function (lines 54-75) with the full rewritten version:

```typescript
function checkAndScroll(): void {
  // 打字机模式关闭时：不自动滚动
  if (!inputMode.isTypewriterActive()) return;

  // 暂停场景（悬浮窗 / 只读 / 嵌入块）：不滚动
  if (shouldPauseTypewriter()) return;

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

  // 从正确的 cursorElement 向上查找可滚动祖先（而非错误的 .protyle-content querySelector）
  const container = findClosestScrollableElement(result.cursorElement);
  if (!container) return;

  // 使用 editorRect（protyle-content 的 bounding rect）作为滚动锚点
  // 而非 container.getBoundingClientRect()（可能是更大的祖先元素）
  const targetY = result.editorRect.top + result.editorRect.height * TARGET_RATIO;
  const offset = rect.y - targetY;

  if (Math.abs(offset) >= THRESHOLD) {
    smoothScroll(container, offset);
  }
}
```

**Verification:** `npx tsc --noEmit` — should pass with no errors.

**Full file after all changes should be approximately 115 lines. Verify with:**
```powershell
(Get-Content "src\modules\typewriter.ts" | Measure-Object -Line).Lines
```

#### Step 4b: Add rAF debounce for performance

**Why (performance concern raised by user):** The 6 document-level events (especially `selectionchange` firing every ~500ms on caret blink) all synchronously call `checkAndScroll`. Each call performs:
- `getBoundingClientRect()` — forces layout flush
- `findClosestScrollableElement()` — walks ancestors calling `getComputedStyle` + reading `scrollHeight/clientHeight` — multiple layout flushes

When the user types one character, 4–5 events fire in the same tick (keydown → input → keyup → click → selectionchange), causing 4–5 full layout flushes per keystroke. This is wasteful and can stutter on large docs.

**Fix:** Introduce a `scheduleCheck()` wrapper that uses `requestAnimationFrame` to merge all event firings within the same frame into a single `checkAndScroll()` call. One frame's delay (≤16ms) is imperceptible to users.

**Additional optimization:** Cache the scroll container. The container is stable across the lifetime of a protyle (only changes on protyle switch / resize). Avoid re-walking the DOM on every check.

- [ ] **Step 4b: Add rAF debounce + container cache**

**Action 1:** Add `let pendingCheck: number | null = null;` after the existing module-level `let pendingScroll: number | null = null;` (line 11).

**Action 2:** Add a `scheduleCheck()` wrapper above `checkAndScroll()`:

```typescript
function scheduleCheck(): void {
  if (pendingCheck !== null) return; // already scheduled, merge
  pendingCheck = requestAnimationFrame(() => {
    pendingCheck = null;
    checkAndScroll();
  });
}
```

**Action 3:** In `initTypewriter()` (the handlers array, lines 79-86), replace every `checkAndScroll` reference with `scheduleCheck`:

```typescript
const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
  ["selectionchange", scheduleCheck],
  ["keyup", scheduleCheck],
  ["keydown", scheduleCheck],
  ["click", scheduleCheck],
  ["mouseup", scheduleCheck],
  ["resize", scheduleCheck],
];
```

**Action 4:** In `destroyTypewriter()` (lines 95-105), cancel `pendingCheck` and clear the container cache (and pendingScrollTarget/End added in Step 4c):

```typescript
if (pendingCheck !== null) {
  cancelAnimationFrame(pendingCheck);
  pendingCheck = null;
}
cachedContainer = null;
cachedCursorElement = null;
pendingScrollTarget = null;
pendingScrollEnd = 0;
```

(Add these six lines right after the existing `if (pendingScroll !== null)` block.)

**Action 5: Cache the scroll container.** `findClosestScrollableElement(cursorElement)` walks DOM ancestors calling `hasScroll()` on each — each `hasScroll()` call does `window.getComputedStyle()` (style recalc) + reads `scrollHeight/clientHeight` (layout flush). On a typical SiYuan DOM with 6-8 ancestors between cursor and `<body>`, this is 6-8 layout flushes per `checkAndScroll()`. Even with rAF debounce, 60 calls/sec × 6-8 flushes = 360-480 layout flushes/sec during active typing.

Cache the result keyed by `cursorElement`. The container only changes when the cursor moves to a different scroll context (e.g., into an embed block). Add a 2-line cache near the top of `checkAndScroll()`:

```typescript
// 在 module 顶部添加（在 pendingCheck 旁边）
let cachedContainer: HTMLElement | null = null;
let cachedCursorElement: Element | null = null;
```

Inside `checkAndScroll()`, after the `result.cursorElement` null-check, replace `const container = findClosestScrollableElement(result.cursorElement);` with:

```typescript
let container: HTMLElement | null;
if (result.cursorElement === cachedCursorElement && cachedContainer) {
  container = cachedContainer; // hit cache, zero DOM walk
} else {
  container = findClosestScrollableElement(result.cursorElement);
  cachedContainer = container;
  cachedCursorElement = result.cursorElement;
}
if (!container) return;
```

The cache self-invalidates when `cursorElement` changes (which happens on every selection change, click, arrow key). The `resize` event triggers `scheduleCheck`, which calls `checkAndScroll`, which finds the same `cursorElement` → re-uses cache. **Stale-cache risk:** if `.protyle-content` becomes scrollable/non-scrollable due to a CSS change without the cursor moving, the cache is stale. Mitigations:
- Cache miss is cheap to recover from (next cursor move re-walks)
- Worst case: typewriter scrolls the wrong container until the next selection change — user-perceptible only in pathological cases

#### Step 4c: Make animation feel natural (continue + distance-based duration)

**Why (user concern):** The current `smoothScroll()` has three naturalness problems:

1. **Restart on every keystroke**: Every `checkAndScroll` calls `smoothScroll()`, which calls `cancelAnimationFrame(pendingScroll)` and starts a brand-new 400ms animation. When the user types continuously, each keystroke cancels the previous in-flight animation and restarts. The caret "stutters" instead of flowing smoothly.

2. **Fixed 400ms duration regardless of distance**: A 5-pixel nudge and a 2000-pixel page-jump both take 400ms. Small moves feel sluggish (light delay before caret arrives); large moves feel rushed (no time to anticipate).

3. **40px threshold is too strict**: The `Math.abs(offset) >= THRESHOLD` (40px) check in `checkAndScroll` means small cumulative drifts are ignored. The caret drifts to the edge of the editor, then suddenly snaps — feels mechanical.

**Fix (3 parts):**

**Part 1 — Animation continuation.** When `smoothScroll` is called while a scroll animation is in progress, **don't restart from scratch**. Instead, update the `endScroll` (and reset `startTime` if delta direction changed) so the existing rAF continues smoothly toward the new target. This is the single biggest naturalness improvement.

```typescript
function smoothScroll(target: HTMLElement, deltaY: number): void {
  // ... existing setup ...

  // 续接：如果动画进行中且方向相同，仅更新 endScroll，动画继续
  if (pendingScroll !== null && pendingScrollTarget === target) {
    endScroll += deltaY; // 在当前 endScroll 基础上追加
    // 不需要 cancelAnimationFrame，rAF 会用新 endScroll
    return;
  }

  // 否则取消旧动画（新 target 或旧动画完成）
  if (pendingScroll !== null) cancelAnimationFrame(pendingScroll);

  const startScroll = target.scrollTop;
  // ... rest of setup ...
}
```

This requires tracking `pendingScrollTarget` and `endScroll` as module-level state (currently `endScroll` is a closure-local). Implementation sketch:

```typescript
let pendingScroll: number | null = null;
let pendingScrollTarget: HTMLElement | null = null;
let pendingScrollEnd: number = 0;

function smoothScroll(target: HTMLElement, deltaY: number): void {
  // 续接：同一 target 且动画进行中
  if (pendingScroll !== null && pendingScrollTarget === target) {
    pendingScrollEnd += deltaY;
    return;
  }

  // 新动画
  if (pendingScroll !== null) cancelAnimationFrame(pendingScroll);
  pendingScrollTarget = target;
  pendingScrollEnd = target.scrollTop + deltaY;

  const startScroll = target.scrollTop;
  const startTime = performance.now();
  const duration = durationForDistance(Math.abs(deltaY)); // 基于距离的时长

  function step() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = easeInOutCubic(t);
    const maxScroll = target.scrollHeight - target.clientHeight;
    const currentEnd = pendingScrollEnd; // read latest
    target.scrollTop = Math.max(0, Math.min(
        startScroll + (currentEnd - startScroll) * eased,
        maxScroll
    ));
    if (t < 1) {
      pendingScroll = requestAnimationFrame(step);
    } else {
      pendingScroll = null;
      pendingScrollTarget = null;
    }
  }
  pendingScroll = requestAnimationFrame(step);
}
```

**Part 2 — Distance-based duration.** Borrow from cursor module's `transitionDurationForDistance` (cursor.ts:72-80). Use a tier table:

```typescript
function durationForDistance(dist: number): number {
  // dist 单位：px（绝对值）
  if (dist < 20) return 120;   // 微调：快速
  if (dist < 60) return 180;   // 短距：平滑
  if (dist < 150) return 260;  // 中距：跟手
  if (dist < 400) return 360;  // 长距：可观察
  return 500;                  // 远跳：留时间感知
}
```

Update the existing destructure at line 8 from `const { TARGET_RATIO, THRESHOLD, DURATION } = TYPEWRITER_CONFIG;` to `const { TARGET_RATIO } = TYPEWRITER_CONFIG;` — **drop `THRESHOLD` and `DURATION`** from destructure. They remain defined in `config.ts` (not touched) for API stability but are no longer used by typewriter.ts. tsconfig has no `noUnusedLocals` (verified), so no tsc warning.

**Part 3 — Smaller threshold + adaptive scroll.** Reduce `THRESHOLD` from 40px to **2px** so even tiny drift triggers a smooth scroll (which is fast for small distance due to Part 2). Or remove the threshold entirely and let the smallest scrolls happen.

Add a tiny "dead zone" instead (e.g., `< 1px` doesn't trigger) to avoid floating-point noise.

Update `checkAndScroll()`:

```typescript
// 旧：
if (Math.abs(offset) >= THRESHOLD) {
  smoothScroll(container, offset);
}

// 新：
if (Math.abs(offset) >= 1) {
  smoothScroll(container, offset);
}
```

**Effect on UX:**

| Scenario | Old behavior | New behavior |
|----------|--------------|--------------|
| Type 10 chars continuously, each caret move 5px | Each char: cancel 400ms animation, start new 5px animation → stutter | Each char: append 5px to in-flight animation → smooth continuous scroll |
| Click far away (2000px) | 400ms easeInOut | 500ms easeInOut — same speed, slightly more time to anticipate |
| Caret slowly drifts 1px at a time | 40px threshold ignored, scroll only at threshold → sudden snap at 40px | 1px triggers 120ms animation per step → continuous smooth follow |
| Pause typing mid-scroll | Animation completes from startScroll to whatever endScroll was at last call | Animation continues to whatever endScroll was at last call — caret lands smoothly |

**Why this is safe:**
- One rAF delay (≤16ms) is below human perception threshold for typewriter response.
- `smoothScroll()` already uses rAF internally; the debounced check fires once per frame, smooth scroll updates 60 times per second — no interference.
- `selectionchange` during caret blink (no actual selection change) will fire `scheduleCheck`, but the rAF merges it with the next real input — no extra computation since `getCursorRect` returns the same value.
- `destroyTypewriter()` cancels any pending check, so toggle-off is immediate.

**Verification:** `npx tsc --noEmit` — should pass. Optional manual verification in DevTools Performance tab: profile before/after typing in a long doc, confirm `Layout` events reduce.

#### Step 5: Verify full file compiles and review final state

- [ ] **Step 5a: Run TypeScript check**

```powershell
npx tsc --noEmit
```
Expected: exit code 0, no errors.

- [ ] **Step 5b: Review final file**

**Action:** Read `src/modules/typewriter.ts` and confirm:
- No `getActiveEditor` import
- No `getEditorContainer()` function
- `isInAllowElements` imported from `./cursor/boundary`
- `inputMode.setBothOn()` called in `initTypewriter()` after `eventListeners = handlers;`
- `checkAndScroll()` uses `isInAllowElements()` + `result.editorRect` + `result.cursorElement`
- `findClosestScrollableElement` import still present (used in new `checkAndScroll`)
- `durationForDistance()` tier table defined and used in `smoothScroll()`
- `scheduleCheck()` rAF debounce wrapper defined; event handlers in `initTypewriter()` use `scheduleCheck` (not `checkAndScroll`)
- `cachedContainer` / `cachedCursorElement` module-level state; `checkAndScroll()` uses cache hit path
- `pendingScrollTarget` / `pendingScrollEnd` module-level state; `smoothScroll()` continues animation when same target
- `THRESHOLD` / `DURATION` removed from destructure (line 8); only `TARGET_RATIO` destructured
- `destroyTypewriter()` cancels `pendingCheck`, clears `cachedContainer` / `cachedCursorElement`, clears `pendingScrollTarget` / `pendingScrollEnd`
- Threshold in `checkAndScroll()` is `Math.abs(offset) >= 1` (not the old `THRESHOLD` constant)

#### Step 6: Commit

- [ ] **Step 6: Commit the change**

```bash
git add src/modules/typewriter.ts docs/superpowers/plans/2026-06-30-fix-typewriter-scroll.md
git commit -m "fix(typewriter): refactor scroll logic for correctness, perf, and naturalness

Three root-cause fixes (typewriter did nothing before):
1. Replace broken getEditorContainer() with isInAllowElements() for
   correct .protyle-content selector (cursor module's proven
   closest('.protyle:not(.fn__none) .protyle-content'), handles
   split-screen correctly)
2. Use editorRect (protyle-content bounding rect) as scroll anchor
   instead of container.getBoundingClientRect() for correct targetY
3. Call inputMode.setBothOn() in initTypewriter() so typewriterActive
   is true when event handlers fire

Performance:
- rAF debounce: merge multiple events in same frame into one check
- Container cache: avoid findClosestScrollableElement DOM walk on
  every keystroke (cached by cursorElement)

Animation naturalness:
- Animation continuation: append to in-flight scroll instead of
  cancel+restart on every keystroke
- Distance-based duration (120-500ms tier table) instead of fixed 400ms
- Threshold lowered to 1px so small drifts scroll smoothly instead of
  waiting for 40px snap"
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `isInAllowElements` returns `allowed: false` but `editorRect` is populated (boundary.ts:128-138, nested-scroll fallback line 113-125) — the rewritten code uses `editorRect` regardless of `allowed`, so scrolling still works. If `editorRect` is undefined (title area, boundary.ts:86), the function correctly bails. | Medium | Low | The rewritten `checkAndScroll` uses `if (!result.editorRect) return;` instead of `if (!result.allowed) return;`. This means it scrolls even in edge cases where the cursor is slightly outside the protyle-content AABB but `editorRect` is available. This is intentional: the cursor module's `allowed` flag is for display logic, not scroll logic. If the user is editing near the edge of protyle-content, we still want to scroll. |
| `cursorElement` is null (boundary.ts:47-53) — the rewritten code bails with `if (!result.cursorElement) return;`. | Low | Low | Same behavior as the old `if (!container) return;`. No regression. |
| `protyle-content` closest returns null — `isInAllowElements` already handles this (boundary.ts:84-93, returns `allowed: false` with no `editorRect`). The rewritten code bails at `if (!result.editorRect) return;`. | Low | Low | Handled by existing validation in `isInAllowElements`. |
| `findClosestScrollableElement(result.cursorElement)` returns a different scroll container than the original `findClosestScrollableElement(contentEl)` — this is the *intended fix*. Starting from the cursor element and walking up finds the correct scroll container for the actual editor the cursor is in. | High (intentional) | Positive | This is the fix for Layer 1. The old code used `querySelector(".protyle-content")` which finds the first `.protyle-content` in the active editor's protyle element, not necessarily the one containing the cursor. |
| `setBothOn()` also sets `focusActive = true` — if cursor module is not enabled, `focusActive` is set but never read. | Low | None | `inputMode` is shared state; cursor module subscribes to changes. Setting `focusActive` when cursor module is disabled has no effect since no subscriber reacts to it harmfully. |
| After user clicks, `cursor.ts` click handler calls `setBothOff()` (cursor.ts:580), and the next keystroke's `keydown` fires before `input` handler calls `setBothOn()` (cursor.ts:572) — there is a 1-frame gap where `typewriterActive` is false during the `keydown` check. | Medium | Low | **Not fixed in this plan.** This is a separate timing issue between cursor.ts's bubbling `keydown` and capture `input` handlers. The `selectionchange` listener (also registered) will fire on the next frame and trigger a scroll, so the gap is only 1 frame. User-perceived impact is minimal. Listed in out-of-scope. |

---

## Out of Scope Confirmation

### Files NOT touched
- `src/modules/cursor.ts` — 8 commits stable, no changes
- `src/modules/cursor/boundary.ts` — inside cursor module dir, no changes (imported, not modified)
- `src/utils/scroll.ts` — no changes
- `src/utils/edgeCases.ts` — no changes
- `src/config.ts` — no changes
- `src/modules/inputMode.ts` — no changes (only call `setBothOn()`)
- `src/styles/` — no changes
- `src/index.ts` — no changes

### Issues NOT fixed
- **First-keystroke-after-click gap**: When cursor module is enabled, clicking calls `setBothOff()` (cursor.ts:580), causing the next keystroke's `keydown` handler to see `typewriterActive=false`. The `input` handler (cursor.ts:572) calls `setBothOn()` but runs after `keydown`. This 1-frame gap is a cursor module timing issue, not typewriter-specific. The `selectionchange` event will trigger a corrective scroll on the next frame.
- **`isReadMode` false-negative** in `shouldPauseTypewriter()` (edgeCases.ts:20-23): Uses `.querySelector(".protyle-content")` which has the same selector weakness as the old `getEditorContainer()`. Not fixed here — separate issue.
- **Silent failure logging**: `checkAndScroll()` bails silently on all guard clauses. No logging added — not a regression, existing behavior preserved.

---

## Verification

### Automated
```powershell
npx tsc --noEmit
```
Expected: exit code 0, no type errors.

### Manual (user test)
1. Open SiYuan with zenType plugin built from this branch
2. Toggle typewriter mode ON (ensure cursor module is OFF to isolate)
3. Place caret in a long document (multiple screens of content)
4. Type characters — observe the viewport scrolls to keep the caret at approximately 38% from the top of the editor content area
5. Click at different positions in the document — observe the viewport scrolls to keep the clicked position at ~38%
6. **Split-screen test**: Open two tabs side-by-side, type in each — verify scrolling targets the correct editor pane
7. Verify `destroyTypewriter()` still works: toggle typewriter OFF, type — no scrolling occurs
