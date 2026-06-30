# Plan 6: Cursor Edge Interaction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three independently-revertible cursor edge interaction features: (1) opacity+scale fade near viewport edges, (2) one-shot squash/bounce CSS animation when crossing edges, (3) fixed-position arrow indicator when cursor is off-screen.

**Architecture:** Each sub-feature is a self-contained commit. Commit 1 adds `src/utils/edgeProximity.ts` as the shared edge-detection foundation, consumed by Commits 2 and 3. All features hook into `doUpdateCursor()` in `src/modules/cursor.ts`. No EventBus changes, no new dependencies, no changes to the breathing animation keyframes or `src/index.ts`.

**Tech Stack:** TypeScript, SCSS, vanilla DOM APIs. Plugin framework: SiYuan Note plugin SDK.

---

## 1. Sub-feature Breakdown (3 Commits)

### Commit 1: `feat(cursor): fade + scale on viewport edge approach`

**Files changed:**
- `src/config.ts` — add `EDGE_FADE` config block
- `src/utils/edgeProximity.ts` — **new file**: viewport edge distance calculation
- `src/modules/cursor.ts` — integrate edge proximity into `doUpdateCursor()`
- `src/styles/index.scss` — add `opacity` to transition, add `transform-origin: top center`

**Module-level state additions (cursor.ts):**
```typescript
import { getEdgeProximity, type EdgeProximity } from "../utils/edgeProximity";
import { EDGE_FADE } from "../config";

let lastGoodCursorPos: { x: number; y: number; height: number } | null = null;
let currentEdge: EdgeProximity | null = null; // exposed for Commit 2, 3 consumers
```

**New utility: `src/utils/edgeProximity.ts`**

```typescript
// Function: getEdgeProximity(rect: CursorRect) → EdgeProximity
// Calculates distance from a CursorRect to each viewport edge.
// Returns proximity info including which edge is nearest and whether cursor is off-screen.

export interface EdgeProximity {
  /** Primary closest-edge direction (top/bottom/left/right) or null if centered */
  edge: "top" | "bottom" | "left" | "right" | null;
  /** Distance from cursor to nearest viewport edge in px.
   *  Positive = inside viewport, negative = off-screen. */
  distance: number;
  /** 0–1 proximity factor used for opacity/scale: 0 = fully faded, 1 = no fade */
  factor: number;
  /** Is the cursor completely off the viewport? */
  isOffScreen: boolean;
  /** Raw per-edge distances (pos=inside, neg=outside) */
  raw: { top: number; bottom: number; left: number; right: number };
}
```

Algorithm:
1. Read `window.innerWidth`, `window.innerHeight` to get viewport dimensions.
2. Calculate per-edge distances: `top = rect.y`, `right = vpWidth - (rect.x + rect.width)`, etc.
3. `isOffScreen = top < 0 || right < 0 || bottom < 0 || left < 0`.
4. Find nearest edge = min absolute distance.
5. `factor = Math.max(0, Math.min(1, nearestDistance / EDGE_FADE.ZONE))` — clamped 0–1.
6. For off-screen cursor, `factor = 0`.

**Config additions (`src/config.ts`):**
```typescript
/** Edge interaction: fade + scale near viewport edges. */
export const EDGE_FADE = {
  /** Distance from viewport edge (px) over which fade + scale completes. */
  ZONE: 60,
  /** Minimum transform scale when cursor is fully off-screen. */
  MIN_SCALE: 0.6,
} as const;
```

**Changes in `doUpdateCursor()` (`src/modules/cursor.ts`):**

The revised flow (pseudocode):

```
function doUpdateCursor():
  pauseBreathe()
  rect = getCursorRect()
  if !rect: return (same as before)

  edge = getEdgeProximity(rect)     // NEW
  currentEdge = edge                // store for cross-commit consumers

  allowed = isInAllowElements({x: rect.x, y: rect.y})

  // Case A: completely outside editor → keep existing behavior
  if !allowed.allowed AND allowed.isOuterElement:
    pauseBreathe(); scheduleResumeBreathe(); return

  // Case B: cursor in editor but scrolled off-screen (was: .hidden)
  // NEW: replace .hidden with inline opacity=0 + scale=MIN_SCALE using lastGoodCursorPos
  if !allowed.allowed AND !allowed.isOuterElement:
    if lastGoodCursorPos AND cursorEl:
      applyFadeAndScale(cursorEl, 0, EDGE_FADE.MIN_SCALE, lastGoodCursorPos)
    pauseBreathe(); scheduleResumeBreathe(); return

  // Case C: normal allowed path
  lastGoodCursorPos = { x: rect.x, y: rect.y, height: rect.height }

  // Apply fade + scale based on edge proximity
  if edge.isOffScreen:
    applyFadeAndScale(cursorEl, 0, EDGE_FADE.MIN_SCALE, rect, yOffset)
  else if edge.distance < EDGE_FADE.ZONE:
    applyFadeAndScale(cursorEl, edge.factor, lerp(MIN_SCALE, 1, edge.factor), rect, yOffset)
  else:
    // Reset inline opacity/scale to let CSS defaults take over
    cursorEl.style.opacity = ""
    // scale handled via normal transform path (no scale in transform)

  // ... rest of normal position update (zIndex, transform, height, .hidden removal, layout sync, no-transition, scheduleResumeBreathe)
  // KEY CHANGE: modify the transform line to include scale when applicable
```

Helper function (module-private in cursor.ts):
```typescript
function applyFadeAndScale(
  el: HTMLDivElement,
  opacity: number,
  scale: number,
  pos: { x: number; y: number; height: number },
  yOffset: number = 2
): void {
  el.style.opacity = String(Math.round(opacity * 1000) / 1000);
  el.style.transform =
    `translate3d(${pos.x}px, ${pos.y - yOffset}px, 0) scale(${scale})`;
  el.style.height = `${pos.height}px`;
}
```

**SCSS changes (`src/styles/index.scss`):**

1. Add `opacity` to existing transition:
   ```scss
   transition: transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1), opacity 0.15s ease-out;
   ```

2. Add `transform-origin: top center` to `#zentype-cursor`:
   ```scss
   #zentype-cursor {
     // ... existing properties ...
     transform-origin: top center; // scale from top, keep caret alignment
   }
   ```

3. The `.hidden` class stays in SCSS but is no longer added by `doUpdateCursor()` in the `isOuterElement: false` path. It is dead code but harmless (Commit 1 does not remove it to preserve revert safety).

**Cleanup in `destroyCursor()`:**
```typescript
lastGoodCursorPos = null;
currentEdge = null;
```

**Acceptance criteria:**
1. Cursor at center of viewport: opacity=1, scale=1, breathing animation active after BLINK_DELAY_MS.
2. As cursor approaches top edge (y between 0 and 60): opacity and scale smoothly decrease, reaching 0/MIN_SCALE at y=0.
3. Same behavior for bottom, left, right edges (inside FADE_ZONE).
4. Cursor fully off-screen (scrolled past viewport edge): opacity=0, scale=MIN_SCALE, cursor stays at last known position (no jump to off-screen coords).
5. Cursor returns into viewport: opacity and scale smoothly increase back to 1/1, breathing resumes.
6. Regression: clicking outside editor keeps cursor visible at last position, static (Commit D behavior unchanged).
7. Regression: Enter key preserves jump animation with 0.15s transition (commit 8e0f2e9 behavior unchanged).
8. Performance: edge proximity is pure math (no DOM queries), < 0.01ms per frame.

**Rollback strategy:**
- `git revert <commit-1-hash>` fully restores Commit D + 8e0f2e9 behavior.
- `.hidden` class still exists in SCSS (not removed, just unused), so original code path is intact.
- `lastGoodCursorPos` and `currentEdge` state removed by revert; no orphaned state.
- Config `EDGE_FADE` block removed; no other config depends on it.

**Risk analysis:**
- **CSS animation vs inline opacity**: The breathing animation (`@keyframes zentype-breathe`) also controls `opacity`. When breathing is active (`.no-animation` removed), CSS animation opacity wins over inline `style.opacity` in the CSS cascade. **Mitigation**: `pauseBreathe()` is called at the top of `doUpdateCursor()`, and `scheduleResumeBreathe()` is only called when cursor is NOT near an edge. When edge fade is active, breathing stays paused → no animation/inline conflict. When cursor returns to center, breathing resumes after BLINK_DELAY_MS with opacity=1, so the animation starts from full opacity.
- **`transform-origin: top center`** changes how all transforms (including normal position updates) center the cursor. Since the cursor is positioned at its top-left via translate3d, and it has no explicit width animation, `top center` is safe: it only affects scale, which shrinks from the top, keeping the caret-aligned edge fixed. The horizontal center is irrelevant since the cursor is 3px wide.
- **`no-transition` class during scroll**: When `.no-transition` is added (scroll/wheel), ALL transitions stop including opacity. This means during fast scrolling, opacity jumps rather than fades. **Mitigation**: This is acceptable — during scroll the user isn't looking at smooth transitions anyway. The fade applies immediately, giving instant visual feedback of edge proximity.

---

### Commit 2: `feat(cursor): squash/bounce one-shot animation on edge crossing`

**Files changed:**
- `src/config.ts` — add `SQUISH_BOUNCE` config block
- `src/modules/cursor.ts` — add edge-crossing detection + animation trigger
- `src/styles/index.scss` — add two keyframe blocks + two CSS classes

**Module-level state additions (cursor.ts):**
```typescript
import { SQUISH_BOUNCE } from "../config";

let wasOffScreen: boolean = false;
let squishAnimTimer: ReturnType<typeof setTimeout> | null = null;
```

**Config additions (`src/config.ts`):**
```typescript
/** Edge interaction: one-shot squash/bounce animation on edge crossing. */
export const SQUISH_BOUNCE = {
  /** Duration of squish (compress) phase in ms. */
  SQUISH_DURATION: 300,
  /** Duration of bounce (overshoot + settle) phase in ms. */
  BOUNCE_DURATION: 400,
} as const;
```

**Edge-crossing detection logic (in `doUpdateCursor()`, after edge proximity calculation):**

The edge-crossing detection sits right after `currentEdge = edge` and before the position update:

```typescript
// Edge crossing detection (Commit 2)
const wasOff = wasOffScreen;
const isOff = edge.isOffScreen;

if (!wasOff && isOff) {
  // Cursor just left the viewport → trigger squish animation
  triggerSquishAnimation(cursorEl);
} else if (wasOff && !isOff) {
  // Cursor just re-entered the viewport → trigger bounce animation
  triggerBounceAnimation(cursorEl);
}
wasOffScreen = isOff;
```

**Animation trigger functions (module-private in cursor.ts):**

```typescript
function triggerSquishAnimation(el: HTMLDivElement): void {
  // Remove any lingering animation classes first
  el.classList.remove("squishing", "bouncing");
  // Force reflow so removing+re-adding the same class restarts animation
  void el.offsetHeight;
  el.classList.add("squishing");
  // Auto-remove after animation completes
  if (squishAnimTimer !== null) clearTimeout(squishAnimTimer);
  squishAnimTimer = setTimeout(() => {
    el.classList.remove("squishing");
    squishAnimTimer = null;
  }, SQUISH_BOUNCE.SQUISH_DURATION + 20); // +20ms safety margin
}

function triggerBounceAnimation(el: HTMLDivElement): void {
  el.classList.remove("squishing", "bouncing");
  void el.offsetHeight;
  el.classList.add("bouncing");
  if (squishAnimTimer !== null) clearTimeout(squishAnimTimer);
  squishAnimTimer = setTimeout(() => {
    el.classList.remove("bouncing");
    squishAnimTimer = null;
  }, SQUISH_BOUNCE.BOUNCE_DURATION + 20);
}
```

**SCSS changes (`src/styles/index.scss`):**

New keyframes (after the existing `@keyframes zentype-breathe` block):

```scss
// Squish: scaleX compresses, scaleY stretches (horizontal squish like jelly)
@keyframes zentype-squish {
  0%   { transform: scaleX(1) scaleY(1); }
  30%  { transform: scaleX(0.5) scaleY(1.4); }
  60%  { transform: scaleX(1.15) scaleY(0.85); }
  100% { transform: scaleX(1) scaleY(1); }
}

// Bounce: overshoot + settle (spring-like re-entry)
@keyframes zentype-bounce {
  0%   { transform: scale(0.6); }
  50%  { transform: scale(1.15); }
  75%  { transform: scale(0.95); }
  100% { transform: scale(1); }
}
```

New CSS classes:

```scss
#zentype-cursor.squishing {
  animation: zentype-squish 0.3s ease-out forwards !important;
}

#zentype-cursor.bouncing {
  animation: zentype-bounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
}
```

**CRITICAL: Animation classes vs existing classes interaction:**
- The squish/bounce keyframes use `transform` (scale). When the class is active, it overrides the inline `style.transform` set by `doUpdateCursor()`. This is intentional: during the one-shot animation (300ms/400ms), the cursor position may lag slightly, but since this only triggers on edge crossings (rare), it's acceptable.
- After the animation ends (`forwards` fill mode), the cursor reverts to the inline `transform` style on the next `doUpdateCursor()` call. However, `animation-fill-mode: forwards` keeps the last keyframe value until the class is removed. The `setTimeout` cleanup removes the class after the animation duration, so the cursor returns to inline style control.
- But wait: if a `doUpdateCursor()` fires during the animation window, the inline `style.transform` update would be overridden by the active animation. This could cause a visual glitch. **Mitigation**: Accept the brief visual glitch (300-400ms). Edge crossing is rare. Alternative: pause position updates during animation (over-engineering for a cosmetic effect).

**Refinement — prevent animation conflicts:**

The squish/bounce classes use `!important` to ensure they dominate during their window. After the `setTimeout` cleanup fires, the class is removed and inline styles resume control.

One issue: when `squishing`/`bouncing` classes are active, the breathing animation (`.no-animation`) is also relevant. Since the squish/bounce use `animation` with `!important`, they will override the `animation: none !important` from `.no-animation`. This is actually fine — we WANT the squish animation to play. After it ends, `.no-animation` resumes (breathing stays paused until `scheduleResumeBreathe` kicks in).

But there's another issue: if `.no-animation` is present AND a squish/bounce class is added, both fight over `animation`. The squish/bounce `!important` wins. After the class is removed, `.no-animation` resumes its `animation: none !important`. This is correct.

**Cleanup in `destroyCursor()`:**
```typescript
wasOffScreen = false;
if (squishAnimTimer !== null) {
  clearTimeout(squishAnimTimer);
  squishAnimTimer = null;
}
cursorEl?.classList.remove("squishing", "bouncing");
```

**Acceptance criteria:**
1. Cursor is visible in viewport, user scrolls caret off top edge → cursor squishes (scaleX compresses, scaleY stretches) over ~300ms, then settles at min scale/opacity (Commit 1 behavior resumes).
2. Cursor is off-screen, user scrolls caret back into viewport → cursor bounces (scale overshoots to 1.15, settles to 1) over ~400ms, then normal cursor resumes.
3. Rapid edge crossings (scrolling fast): each crossing triggers its animation. Animations don't stack — the most recent one wins (class removal before re-add + forced reflow).
4. The squish/bounce animation uses `cubic-bezier(0.34, 1.56, 0.64, 1)` for bounce — visually spring-like with overshoot.
5. Regression: fade+scale from Commit 1 still works correctly (edge proximity calculation unchanged).
6. Regression: existing breathing animation unaffected (squish/bounce classes are temporary, removed after duration).
7. Performance: CSS-only animation (compositor layer), no JS per-frame work. < 0.01% CPU.

**Rollback strategy:**
- `git revert <commit-2-hash>` removes squish/bounce logic and CSS classes.
- Commit 1 (fade+scale) continues working because it only reads `currentEdge` which is set by Commit 1 (Commit 2 just reads it).
- `wasOffScreen` state variable removed by revert.
- SCSS keyframes and classes removed; no remaining references.

**Risk analysis:**
- **Animation + inline transform conflict**: During the 300-400ms animation window, `doUpdateCursor()` may fire (e.g., from `selectionchange`). The inline `style.transform` update would be overridden by CSS animation. Since edge crossings are rare and the window is short, the visual impact is minimal. Worst case: cursor appears to "jump" slightly when the animation ends and the next `doUpdateCursor()` re-sets the transform to the actual caret position.
- **Forced reflow (`void el.offsetHeight`)**: This is intentional to restart the CSS animation. The reflow is cheap (~0.01ms) and only happens on edge crossings (not per-frame).
- **`!important` in animation shorthand**: The `animation` shorthand used by squish/bounce includes `!important` which overrides everything including `.no-animation`. If the breathing timer fires during the squish animation, `.no-animation` would be removed but squish animation would continue (because class is still present). After squish class is removed, the cursor would briefly show the breathing animation. This is correct behavior.

---

### Commit 3: `feat(cursor): viewport edge arrow indicator`

**Files changed:**
- `src/config.ts` — add `EDGE_ARROW` config block
- `src/modules/cursor.ts` — arrow DOM element lifecycle, arrow positioning
- `src/styles/index.scss` — arrow element styles

**Module-level state additions (cursor.ts):**
```typescript
import { EDGE_ARROW } from "../config";

let arrowEl: HTMLDivElement | null = null;
let arrowVisible: boolean = false;
```

**Config additions (`src/config.ts`):**
```typescript
/** Edge interaction: directional arrow indicator at viewport edge. */
export const EDGE_ARROW = {
  /** Opacity of the arrow when visible (0–1). */
  OPACITY: 0.6,
  /** Arrow triangle size in px (height of the triangle pointer). */
  SIZE: 12,
  /** Offset from viewport edge (px) — arrow sits this far from the edge. */
  OFFSET: 8,
  /** Fade-in/out transition duration (ms). Uses CSS transition. */
  TRANSITION_MS: 200,
} as const;
```

**Arrow DOM element creation (`createArrowElement()` in cursor.ts):**

The arrow is a small triangle rendered via CSS border trick. It has 4 directional states controlled by a data attribute.

```typescript
function createArrowElement(): HTMLDivElement {
  let el = document.getElementById("zentype-edge-arrow") as HTMLDivElement | null;
  if (el) return el;

  el = document.createElement("div");
  el.id = "zentype-edge-arrow";
  el.style.cssText = "position: fixed; pointer-events: none;";
  el.setAttribute("data-direction", "none"); // none | top | bottom | left | right
  document.body.appendChild(el);
  return el;
}
```

**Arrow positioning logic (in `doUpdateCursor()`, after edge proximity calculation):**

The arrow appears when the cursor is off-screen AND the edge is known. It positions itself at the viewport edge, centered on the cursor's horizontal/vertical position.

```typescript
// Edge arrow logic (Commit 3)
if (edge.isOffScreen && edge.edge !== null) {
  showArrow(edge); // positions + shows the arrow at the appropriate edge
} else {
  hideArrow();
}
```

**`showArrow()` function (module-private in cursor.ts):**

```typescript
function showArrow(edge: EdgeProximity): void {
  if (!arrowEl) arrowEl = createArrowElement();

  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const size = EDGE_ARROW.SIZE;
  const offset = EDGE_ARROW.OFFSET;

  let x: number, y: number;
  let direction: string;

  switch (edge.edge) {
    case "top":
      x = Math.max(size, Math.min(vpW - size, /* cursor X from rect? */));
      // For arrow at top, we need the cursor's horizontal position.
      // Since cursor is off-screen, we use lastGoodCursorPos.x if available,
      // or fall back to center of viewport.
      direction = "bottom"; // arrow points DOWN toward cursor (below viewport)
      break;
    case "bottom":
      direction = "top"; // arrow points UP toward cursor
      break;
    case "left":
      direction = "right";
      break;
    case "right":
      direction = "left";
      break;
    default:
      hideArrow();
      return;
  }

  // Position the arrow at the viewport edge, aligned with cursor's orthogonal axis
  // This needs the last known cursor position for accurate alignment
  // (since cursor is off-screen, its rect coordinates are outside viewport)
  const cursorPos = getOffScreenArrowPosition(edge);

  arrowEl.style.left = `${cursorPos.x}px`;
  arrowEl.style.top = `${cursorPos.y}px`;
  arrowEl.setAttribute("data-direction", direction);
  arrowEl.style.opacity = String(EDGE_ARROW.OPACITY);
  arrowVisible = true;
}

function hideArrow(): void {
  if (!arrowEl || !arrowVisible) return;
  arrowEl.style.opacity = "0";
  arrowEl.setAttribute("data-direction", "none");
  arrowVisible = false;
}
```

Wait — I need to think about the arrow position more carefully. The arrow needs to sit at the viewport edge AND be horizontally/vertically aligned with where the cursor would be.

When the cursor is above the viewport (edge = "top"), the cursor is somewhere above the visible area. We know its x coordinate (cursor rect.x), but we need to clamp it to within the viewport. The arrow sits at `y = offset` (near the top of the viewport), and `x = clamp(cursorRect.x, size, vpW - size)`.

But we need to distinguish between:
- Cursor scrolled above viewport (edge = "top") → arrow at top edge pointing down
- Cursor scrolled below viewport (edge = "bottom") → arrow at bottom edge pointing up

For this, we use `edge.raw` to determine which edge:

```typescript
function getOffScreenArrowPosition(edge: EdgeProximity): { x: number; y: number } {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const size = EDGE_ARROW.SIZE;
  const offset = EDGE_ARROW.OFFSET;

  // The cursor rect has coordinates even when off-screen.
  // We clamp the x to viewport bounds for top/bottom arrows,
  // and clamp y to viewport bounds for left/right arrows.
  // We need the actual cursor rect coordinates — edge.raw alone doesn't have x/y.
  // So we need to pass the cursor rect or store it.
  // Best approach: pass cursor rect x to the arrow system.
  //
  // But edge proximity only calculates from CursorRect. We can extend the
  // EdgeProximity interface to include cursorX and cursorY.
}
```

I need to extend `EdgeProximity` to include the cursor's viewport coordinates. Let me refine the interface:

```typescript
export interface EdgeProximity {
  edge: "top" | "bottom" | "left" | "right" | null;
  distance: number;
  factor: number;
  isOffScreen: boolean;
  raw: { top: number; bottom: number; left: number; right: number };
  /** Cursor rect x coordinate (viewport space), for arrow positioning */
  cursorX: number;
  /** Cursor rect y coordinate (viewport space), for arrow positioning */
  cursorY: number;
}
```

Now `getOffScreenArrowPosition()`:

```typescript
function getOffScreenArrowPosition(edge: EdgeProximity): { x: number; y: number } {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const halfSize = EDGE_ARROW.SIZE / 2;

  let x: number, y: number;

  switch (edge.edge) {
    case "top":
      y = EDGE_ARROW.OFFSET;
      x = Math.max(halfSize, Math.min(vpW - halfSize, edge.cursorX));
      break;
    case "bottom":
      y = vpH - EDGE_ARROW.OFFSET;
      x = Math.max(halfSize, Math.min(vpW - halfSize, edge.cursorX));
      break;
    case "left":
      x = EDGE_ARROW.OFFSET;
      y = Math.max(halfSize, Math.min(vpH - halfSize, edge.cursorY));
      break;
    case "right":
      x = vpW - EDGE_ARROW.OFFSET;
      y = Math.max(halfSize, Math.min(vpH - halfSize, edge.cursorY));
      break;
    default:
      x = -9999; y = -9999;
  }

  return { x, y };
}
```

**SCSS changes (`src/styles/index.scss`):**

```scss
// Edge arrow indicator
#zentype-edge-arrow {
  width: 0;
  height: 0;
  z-index: 10000;
  opacity: 0;
  transition: opacity 0.2s ease-out;

  // Default: no arrow
  &[data-direction="none"] {
    display: none;
  }

  // Arrow pointing DOWN (at top of viewport)
  &[data-direction="bottom"] {
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 12px solid var(--zt-cursor-color, #5d8cd7);
    transform: translate(-50%, 0);
  }

  // Arrow pointing UP (at bottom of viewport)
  &[data-direction="top"] {
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 12px solid var(--zt-cursor-color, #5d8cd7);
    transform: translate(-50%, -100%);
  }

  // Arrow pointing RIGHT (at left of viewport)
  &[data-direction="right"] {
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-left: 12px solid var(--zt-cursor-color, #5d8cd7);
    transform: translate(0, -50%);
  }

  // Arrow pointing LEFT (at right of viewport)
  &[data-direction="left"] {
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-right: 12px solid var(--zt-cursor-color, #5d8cd7);
    transform: translate(-100%, -50%);
  }
}
```

**Integration into `doUpdateCursor()`:**

The arrow logic must be placed:
- AFTER `currentEdge = edge` (so it has edge info)
- AFTER the `!allowed && isOuterElement` early return (arrow shouldn't show when cursor left editor entirely — Commit D behavior)
- BEFORE the `!allowed && !isOuterElement` case (arrow SHOULD show when cursor scrolled off-screen in editor)

Logic:
```typescript
// After edge proximity calc + before boundary check handling:

// Arrow visibility: show when off-screen in editor (not when outside editor entirely)
if (!allowed.allowed && allowed.isOuterElement) {
  // Cursor left the editor context entirely → no arrow needed
  hideArrow();
  pauseBreathe();
  scheduleResumeBreathe();
  return;
}

// Arrow logic: show when cursor is off-screen in editor context
if (edge.isOffScreen && edge.edge !== null) {
  showArrow(edge);
} else {
  hideArrow();
}

// Continue with existing !allowed && !isOuterElement handling (now using fade+scale instead of .hidden)
```

But wait — the `!allowed && !isOuterElement` case happens when cursor is scrolled out of the editor rect. In this case, `getCursorRect()` still returns valid coords (just outside viewport). So `edge.isOffScreen` should be true, and the arrow would show. Good.

But what about when the cursor is off-screen sideways (left/right of viewport)? That's less common but possible with wide tables or horizontal scrolling. The arrow would appear on the left/right edge accordingly.

**Arrow z-index:**
The arrow should appear above the cursor. Set `z-index: 10000` (hardcoded, fine for a fixed-position indicator). Or use `Math.max(window.siyuan?.zIndex ?? 0, effectiveZ + 1) + 1` to always be above the cursor. Simpler: use `z-index: 10000` as a CSS fallback and dynamically set it in `showArrow()` to `cursorEl.style.zIndex + 1`.

Actually, simpler: just hardcode `z-index: 10000` in CSS. It's higher than any editor z-index. The cursor already uses dynamic z-index from `getEffectiveZIndex()`. Arrow at 10000 will always be above everything.

**Cleanup in `destroyCursor()`:**
```typescript
if (arrowEl) {
  arrowEl.remove();
  arrowEl = null;
}
arrowVisible = false;
```

**Acceptance criteria:**
1. Cursor is in viewport (center): no arrow visible.
2. User scrolls caret off top edge: a small downward-pointing triangle appears at the top of the viewport, horizontally aligned with where the cursor was.
3. Arrow fades in smoothly over 200ms (`transition: opacity 0.2s`).
4. Arrow position updates as the user moves — if the caret is far left, the arrow appears on the top-left; if far right, top-right. The arrow's x position stays clamped to within the viewport.
5. User scrolls caret back into viewport: arrow fades out smoothly.
6. User clicks outside editor (sidebar, AV): no arrow appears (cursor is outside editor context, `isOuterElement: true` → existing behavior, no arrow).
7. Arrow does NOT appear when the cursor is within the viewport (even near the edge with partial fade from Commit 1).
8. Arrow uses `--zt-cursor-color` CSS variable for theming (same as cursor).
9. Regression: fade+scale (Commit 1) and squish/bounce (Commit 2) unaffected.
10. Performance: arrow is a passive CSS element with opacity transition. No JS per-frame work. < 0.01% CPU.

**Rollback strategy:**
- `git revert <commit-3-hash>` removes arrow DOM creation, all arrow logic, and SCSS styles.
- Commit 1 (fade+scale) and Commit 2 (squish/bounce) unaffected — they don't reference arrow state.
- Arrow DOM element removed from document.body on revert (if plugin is running, the `destroyCursor()` cleanup removes it; if reverted and rebuilt, the code simply doesn't create it).
- `EdgeProximity.cursorX/cursorY` fields added by Commit 3 are harmless if Commit 3 is reverted — Commit 1 and 2 don't use them. But to be clean, when reverting Commit 3, also remove `cursorX`/`cursorY` from the `EdgeProximity` interface. The `getEdgeProximity()` return value simply won't include them (TS type would have extra fields, but JS doesn't care).

**Risk analysis:**
- **Arrow position during rapid scrolling**: During fast scroll with `no-transition`, the arrow's position updates per `doUpdateCursor()` ticks (via rAF throttle). The arrow uses `style.left`/`style.top` which are NOT transitioned (only opacity is). This means the arrow instantly jumps to the correct position each frame — correct behavior.
- **Arrow vs other UI elements**: The arrow is `position: fixed` with `pointer-events: none` and `z-index: 10000`. It cannot interfere with any clickable UI. It sits at the viewport edge (~8px offset) which is generally outside any scrollbar or toolbar.
- **Arrow + mobile keyboard**: On mobile, the viewport shrinks when the keyboard appears. The arrow would appear at the new, smaller viewport edge. This could look strange if the keyboard occupies the bottom half. **Mitigation**: Mobile detection via `isMobile()` could suppress the arrow, but the spec says "mobile keyboard: no regression" — meaning the arrow should just silently exist or not. For now, let it appear naturally; if it's ugly, that's a future polish task.
- **EdgeProximity interface extension**: Adding `cursorX`/`cursorY` to the interface means `getEdgeProximity()` needs to return them. The function already receives the `CursorRect` as input, so it just passes `rect.x`/`rect.y` through. Minimal change.

---

## 2. Implementation Order

**Recommended: Commit 1 → Commit 2 → Commit 3**

**Rationale:**

| Order | Commit | Why this position |
|-------|--------|-------------------|
| 1st | Fade + Scale | Foundation. Introduces `getEdgeProximity()` utility and `EdgeProximity` type that Commits 2 and 3 depend on. Touches `doUpdateCursor()` flow, which is the integration point for all three. Building this first validates that the edge detection math works correctly and that the cursor transform pipeline handles scale without breaking position updates. |
| 2nd | Squash/Bounce | Purely additive CSS animation. Reads `edge.isOffScreen` from Commit 1's infrastructure. Adds no new JS loops — just `setTimeout` cleanup. Can be developed and tested independently once Commit 1 is stable. |
| 3rd | Edge Arrow | Most complex: new DOM element, dynamic positioning, CSS border-trick triangle. Uses `edge.edge` direction + `edge.cursorX`/`cursorY` from Commit 1. The positional math needs the most testing because it must clamp coordinates correctly. Building it last means the fade+scale and squash/bounce are already validated. |

**Alternative order (not recommended):** Arrow first → Fade/Scale → Squash/Bounce. Rejected because arrow needs edge direction info, which naturally belongs in the edge proximity utility introduced by fade+scale.

---

## 3. Cross-commit Dependencies

| Commit | Depends on prior commits? | Behavior affected by subsequent commits? |
|--------|--------------------------|----------------------------------------|
| Commit 1 (Fade+Scale) | **None** — self-contained. Replaces `.hidden` with inline fade/scale for `!isOuterElement` case. All other paths unchanged. | Commit 2 reads `currentEdge.isOffScreen`; Commit 3 reads `currentEdge.edge`, `currentEdge.cursorX`, `currentEdge.cursorY`. Commit 1 exposes these — if Commit 1 is reverted, Commits 2 and 3 break at the import/type level (they need `EdgeProximity` and `getEdgeProximity`). |
| Commit 2 (Squash/Bounce) | **Depends on Commit 1** for `currentEdge.isOffScreen` and the `EdgeProximity` type. Does not modify Commit 1 code, only adds code after edge proximity is calculated. | **None** — Commit 3 doesn't interact with squish/bounce classes. Both can be active simultaneously (arrow visible + squish animation on exit). |
| Commit 3 (Edge Arrow) | **Depends on Commit 1** for `EdgeProximity` (edge direction) and `cursorX`/`cursorY`. Also depends on Commit 1 setting `currentEdge = edge` (the variable it reads). | **None** — arrow is the last feature. |

**Revert safety analysis:**

| Revert scenario | Result |
|-----------------|--------|
| Revert Commit 3 only | Arrow disappears. Fade+scale and squish/bounce continue working. Commit 3's code is fully removed. `cursorX`/`cursorY` on `EdgeProximity` become dead fields (set by `getEdgeProximity()` but never read) — harmless. |
| Revert Commit 2 only | Squish/bounce stops. Fade+scale and arrow continue working. `wasOffScreen` variable removed, `squishAnimTimer` removed. No code in Commit 1 or 3 references these. |
| Revert Commit 1 only | **All three features break.** The `EdgeProximity` type, `getEdgeProximity()` function, and `currentEdge` variable are removed. Commits 2 and 3 have import errors. This is expected — Commit 1 is the foundation. The user would need to revert Commits 2 and 3 first, then Commit 1. |
| Revert 1+2+3 | Full rollback to Commit D + 8e0f2e9 state. `.hidden` class and original `doUpdateCursor()` logic are restored (Commit 1 removes `.hidden` addition, revert puts it back). |

---

## 4. Test Plan per Commit

### Commit 1 (Fade + Scale) — Manual Test Scenarios

| # | Scenario | Expected Behavior | Regression check |
|---|----------|-------------------|------------------|
| 1 | Open editor, place caret at center of viewport. Wait 1.5s. | Cursor at full opacity (1), full scale (1). Breathing animation starts after 1.5s. | Commit D: cursor visible at last position. |
| 2 | Type a long paragraph until caret reaches the bottom of the viewport (within 60px of bottom edge). | Cursor smoothly fades (opacity decreases) and scales down (height appears shorter) as it approaches the bottom edge. No breathing during edge proximity. | Commit 8e0f2e9: Enter creates new paragraphs without jump regression. |
| 3 | Continue typing so caret scrolls below the viewport (caret fully off-screen). | Cursor fades to opacity=0, scale to 0.6. Cursor stays at last known position (doesn't jump to off-screen coordinates). | Commit 8e0f2e9: Cursor hidden when off-screen in editor (BUT now replaced by fade to invisible — visual behavior changes, this is the design). |
| 4 | Scroll back up so caret re-enters viewport. | Cursor smoothly fades back to opacity=1, scale=1. Breathing resumes after 1.5s. | |
| 5 | Click in the document tree sidebar (outside editor). | Cursor stays visible at last position, static (no breathing fade). No position update. | Commit D regression: cursor must NOT disappear. |
| 6 | Press Enter repeatedly at end of document (triggers scroll). | Cursor jump animation preserved (0.15s transition). No regression from commit 8e0f2e9. | Commit 8e0f2e9: `pendingKeyboardUpdate` cooldown preserves jump animation. |
| 7 | Select text (drag highlight). | Cursor pauses as before. No fade/scale artifacts on selection. | Existing selection behavior. |

### Commit 2 (Squash/Bounce) — Manual Test Scenarios

| # | Scenario | Expected Behavior | Regression check |
|---|----------|-------------------|------------------|
| 1 | Type until caret scrolls off the bottom of the viewport edge. | As caret crosses the viewport boundary, the cursor plays a ~300ms "squish" animation (scaleX compresses, scaleY stretches, then settles). After animation, cursor is at min opacity/scale (Commit 1 behavior resumes). | Commit 1: fade+scale still works. |
| 2 | Scroll back up so caret re-enters viewport from below. | As caret crosses the viewport boundary back in, cursor plays a ~400ms "bounce" animation (scale overshoots to ~1.15, settles to 1). Then normal cursor resumes with full opacity. | Commit 1: fade+scale restores to full. |
| 3 | Scroll fast so caret rapidly exits and re-enters viewport (fast mouse wheel). | Each crossing triggers its animation. If re-entry happens during squish animation, squish is interrupted and bounce plays (class removal + reflow restarts animation). No animation stacking. | |
| 4 | Cursor near edge but NOT crossing (e.g., at 30px from bottom edge). | No squish/bounce animation triggers. Only Commit 1 fade+scale applies. | Commit 1: edge fade works without spurious animations. |
| 5 | Click outside editor (sidebar) → scroll document so caret moves off-screen in editor context. | Squish animation should NOT trigger because cursor left editor entirely (`isOuterElement: true` returns early before edge crossing detection). | Commit D: click-outside cursor static. |
| 6 | Enter key (new paragraph, scroll). | No squish/bounce animation on Enter-triggered scroll. Animation only triggers on actual viewport edge crossing. | Commit 8e0f2e9: jump animation preserved. |

### Commit 3 (Edge Arrow) — Manual Test Scenarios

| # | Scenario | Expected Behavior | Regression check |
|---|----------|-------------------|------------------|
| 1 | Type until caret scrolls off the top of the viewport. | A small downward-pointing triangle appears at the top edge of the viewport, horizontally aligned with where the cursor was. Opacity ≈ 0.6. Fades in over 200ms. | Commit 1+2: fade/scale + squish still work. |
| 2 | Move caret left/right while off-screen above viewport (use ←/→ keys after scrolling partially back). | Arrow x-position updates to follow the caret's x coordinate, clamped within viewport bounds. | |
| 3 | Scroll caret back into viewport. | Arrow fades out smoothly (200ms transition). Cursor bounce animation plays (Commit 2). | Commit 2: bounce animation still triggers on re-entry. |
| 4 | Scroll caret off the bottom, left, and right edges. | Arrow appears at corresponding edge with correct direction: bottom edge → arrow points UP; left edge → arrow points RIGHT; right edge → arrow points LEFT. | |
| 5 | Click outside editor (document tree sidebar). | Arrow does NOT appear (cursor fully outside editor context → `isOuterElement: true` early return). | Commit D: cursor visible static, no arrow. |
| 6 | Press Enter rapidly (scroll). | Arrow position updates smoothly as caret moves. No flicker or jump. | Commit 8e0f2e9: Enter jump animation preserved. |
| 7 | Mobile keyboard show/hide. | Arrow may appear if cursor was off-screen when keyboard appeared. No error/crash. | Mobile keyboard events don't break anything. |

---

## 5. Configuration Constants

All new constants go into `src/config.ts` as `as const` blocks following the existing pattern.

```typescript
/** Edge interaction: fade + scale near viewport edges (Commit 1). */
export const EDGE_FADE = {
  /** Distance from viewport edge in px over which fade + scale completes linearly. */
  ZONE: 60,
  /** Minimum scale factor when cursor is fully off-screen. 1.0 = no scaling. */
  MIN_SCALE: 0.6,
} as const;

/** Edge interaction: one-shot squash/bounce animation on edge crossing (Commit 2). */
export const SQUISH_BOUNCE = {
  /** Duration of the squish (compress) animation phase in ms. */
  SQUISH_DURATION: 300,
  /** Duration of the bounce (overshoot + settle) animation phase in ms. */
  BOUNCE_DURATION: 400,
} as const;

/** Edge interaction: directional arrow indicator at viewport edge (Commit 3). */
export const EDGE_ARROW = {
  /** Opacity of the arrow element when visible (0–1). */
  OPACITY: 0.6,
  /** Triangle height in px (size of the arrow pointer). */
  SIZE: 12,
  /** Offset from viewport edge in px (spacing between arrow tip and viewport boundary). */
  OFFSET: 8,
  /** Duration of the fade in/out transition in ms (CSS transition). */
  TRANSITION_MS: 200,
} as const;
```

**Easing curve references (used in SCSS, not config):**

| Usage | Easing | Rationale |
|-------|--------|-----------|
| Opacity fade (edge approach) | `ease-out` (SCSS: `opacity 0.15s ease-out`) | Smooth deceleration as opacity reaches final value. |
| Scale transform (edge approach) | `cubic-bezier(0.25, 0.1, 0.25, 1)` (existing transition for transform) | Reuse existing transform transition; consistent with cursor movement. |
| Squish keyframe | `ease-out` (via `animation: zentype-squish 0.3s ease-out`) | Natural jelly compression feel. |
| Bounce keyframe | `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot easing) | Spring-like overshoot > 1.0 and settle. This is a "back" easing that overshoots and returns. |
| Arrow fade | `opacity 0.2s ease-out` (inline via transition property) | Gentle fade, not distracting. |

---

## 6. Verification Matrix

After ALL 3 commits are applied, verify these scenarios:

| # | Scenario | Expected behavior |
|---|----------|-------------------|
| 1 | Cursor in middle of viewport | Normal cursor: full opacity (1), full scale (1). Breathing animation active after 1.5s idle. |
| 2 | Cursor approaches top edge (y in [0, 60]) | Cursor opacity and scale smoothly decrease as y approaches 0. At y=0: opacity=0, scale=0.6. Breathing paused. No squish animation yet (still in viewport). No arrow (still in viewport). |
| 3 | Cursor crosses top edge (y < 0) | Squish animation plays (300ms). Cursor settles at opacity=0, scale=0.6. Arrow appears at top edge pointing downward, horizontally aligned. Arrow fades in over 200ms. |
| 4 | Cursor deep off-screen (y < -60) | Same as #3: opacity=0, scale=0.6, arrow visible. Cursor stays at last known position. |
| 5 | Cursor scrolls back into viewport from above | Arrow fades out (200ms). Bounce animation plays (400ms, overshoots to 1.15, settles to 1). Opacity and scale return to 1. Breathing resumes after 1.5s. |
| 6 | Same scenarios #2–5 for bottom edge | Identical behavior, arrow points upward at bottom edge. |
| 7 | Same scenarios #2–5 for left edge | Identical behavior, arrow points rightward at left edge. |
| 8 | Same scenarios #2–5 for right edge | Identical behavior, arrow points leftward at right edge. |
| 9 | User clicks outside editor (sidebar, document tree) | Cursor stays visible at last position, static (opacity=1, no breathing). No arrow. No squish/bounce. Commit D behavior preserved. |
| 10 | User presses Enter (creates new paragraph, scroll may occur) | Jump animation preserved (0.15s transform transition). No spurious squish/bounce triggered. No arrow appears unless caret actually crosses viewport edge. Commit 8e0f2e9 behavior preserved. |
| 11 | User selects text (drag highlight) | Cursor pauses. No fade/scale/squish artifacts. Selection coexists with edge proximity state (cursor may be partially faded if selection extends to edge, which is fine). |
| 12 | IME composition (Chinese/Japanese input) | No regression. IME input path uses same `doUpdateCursor()` flow. Edge effects apply normally. |
| 13 | Mobile keyboard show/hide | No crash, no error. Arrow may appear if cursor was off-screen when keyboard triggered viewport resize, which is acceptable. |
| 14 | Rapid scroll (mouse wheel) | All edge effects update per-frame via rAF throttle. Opacity/scale/arrow position jump (no transition because `.no-transition` is applied during scroll) — correct for fast-scroll UX. Squish/bounce may trigger if edge crossing occurs. |
| 15 | Plugin toggle off/on (via top bar button) | Edge interaction state is fully re-initialized on `initCursor()`. No stale `wasOffScreen` or `lastGoodCursorPos` leaking across toggle. |
| 16 | Split-screen editor (two panes) | Edge interaction applies to the cursor in the ACTIVE editor only (boundary check `getActiveEditor()` ensures this). Fade/scale/arrow only appear for the active editor's cursor. |
| 17 | Block popover (hover tooltip) | Cursor in popover is allowed (Commit D decision). Edge effects apply normally within the popover's context. Arrow would appear relative to viewport edges (the popover may be near an edge), which is fine. |

---

## 7. Performance Budget

### Per-commit analysis

| Commit | New per-frame work | Expected cost | Mitigation |
|--------|-------------------|---------------|------------|
| Commit 1 (Fade+Scale) | `getEdgeProximity()` calculation: 4 arithmetic comparisons + 1 `Math.min`/`Math.max` per edge. No DOM queries. Total: ~8 number ops. | < 0.005ms per `doUpdateCursor()` call (sub-microsecond). Added to existing ~0.5ms budget. | Pure JS math on stack values. Already within the existing `will-change: transform` compositor layer — GPU handles the scale/opacity compositing. |
| Commit 2 (Squash/Bounce) | Zero per-frame work. Only triggers on edge crossing events (rare). `setTimeout` for class cleanup (one timer active per animation). `void el.offsetHeight` forced reflow on crossing (< 0.01ms, once per crossing). | ~0ms per frame. < 0.01ms per edge crossing event. | CSS-only animation runs on compositor thread. No JS in the animation loop. `setTimeout` cleanup is a single callback after 300-400ms. |
| Commit 3 (Edge Arrow) | Zero per-frame work for arrow when hidden. When visible: no per-frame JS — opacity transition is CSS-only. Arrow position is set once per `doUpdateCursor()` call (when off-screen). | ~0ms per frame. Arrow position update: same cost as cursor transform write (~0.002ms). | Arrow uses `position: fixed` + opacity transition. GPU-composited. No JS animation loop. |

### Total budget after all 3 commits

- **Per `doUpdateCursor()` call**: existing ~0.5ms + Commit 1 ~0.005ms + Commit 3 ~0.002ms = **~0.51ms** (within the < 1ms target).
- **GPU compositing**: Existing `will-change: transform, height` on cursor. Expand to include `opacity` if needed: `will-change: transform, height, opacity`. Arrow element should NOT have `will-change` — it animates rarely and `will-change` costs GPU memory. Arrow uses `opacity` transition only, which the browser promotes to a compositor layer automatically when transitioning.
- **Memory**: Arrow DOM element adds ~200 bytes. No additional JS objects that persist beyond module scope.

**Recommendation**: Expand `will-change` on `#zentype-cursor` to include `opacity`:
```scss
will-change: transform, height, opacity;
```
This ensures the opacity fade is GPU-composited, not repainted. The additional GPU memory cost is negligible (~one compositor layer).

---

## 8. Final Recommendation

**Use 3 commits.** Build in order: Commit 1 → 2 → 3.

**Rationale for 3 commits (vs 1 monolithic commit):**

1. **Independent revertability**: The user explicitly requested this. If the bounce animation causes issues on a specific platform or editor theme, it can be reverted without losing fade+scale and the arrow.
2. **Incremental testing**: Each commit can be tested in isolation before the next is added. This reduces the risk of compound bugs.
3. **Code review clarity**: Each commit has a clear, focused diff. Reviewers can understand fade+scale without being distracted by arrow positioning math.
4. **Git bisect**: If a future bug is traced to edge interaction, bisecting will pinpoint which sub-feature introduced it.

**Risk of merge conflicts with other ongoing work**: Low. Plan 6 only touches `src/modules/cursor.ts`, `src/config.ts`, `src/styles/index.scss`, and adds one new file `src/utils/edgeProximity.ts`. No other branches should conflict unless they modify `doUpdateCursor()`, the config object, or the SCSS cursor block.

**Optional future work (NOT in this plan):**
- Arrow pulsation animation matching the cursor breathing (low priority, cosmetic).
- Arrow click-to-scroll behavior (click the arrow to jump the viewport to the cursor position) — this changes UX semantics and needs its own design discussion.
- Configurable edge zone per-direction (e.g., larger fade zone at bottom than top) — no user demand yet.
- Arrow theming (custom color, size, shape) — wait for user feedback.
- Mobile-specific arrow suppression (hide arrow when virtual keyboard is active) — if mobile users report visual noise.

---

## Handoff Plan

The implementing agent should execute these tasks in order. Each commit must be verified manually using the test scenarios in Section 4 before proceeding to the next commit.

### Commit 1: `feat(cursor): fade + scale on viewport edge approach`

- [ ] 1. Add `EDGE_FADE` config block to `src/config.ts` (ZONE: 60, MIN_SCALE: 0.6)
- [ ] 2. Create `src/utils/edgeProximity.ts` with `getEdgeProximity()` function and `EdgeProximity` interface
- [ ] 3. In `src/modules/cursor.ts`: import `EDGE_FADE` and `getEdgeProximity` + `EdgeProximity`
- [ ] 4. In `src/modules/cursor.ts`: add `lastGoodCursorPos` and `currentEdge` module variables
- [ ] 5. In `src/modules/cursor.ts`: add `applyFadeAndScale()` helper function
- [ ] 6. In `src/modules/cursor.ts`: modify `doUpdateCursor()` →
  - After `rect = getCursorRect()`, add `edge = getEdgeProximity(rect)` and `currentEdge = edge`
  - In `!allowed && isOuterElement` case: keep existing behavior unchanged
  - In `!allowed && !isOuterElement` case: **replace** `.hidden` addition with `applyFadeAndScale(cursorEl, 0, MIN_SCALE, lastGoodCursorPos)` if `lastGoodCursorPos` exists
  - In allowed case: save `lastGoodCursorPos`, apply fade/scale based on edge proximity, modify the transform write to include `scale()`
- [ ] 7. In `src/modules/cursor.ts`: update `destroyCursor()` to reset `lastGoodCursorPos` and `currentEdge`
- [ ] 8. In `src/styles/index.scss`: add `opacity` to the `transition` shorthand on `#zentype-cursor`
- [ ] 9. In `src/styles/index.scss`: add `transform-origin: top center` to `#zentype-cursor`
- [ ] 10. Build and manually test all 7 scenarios from Section 4 Commit 1 test plan
- [ ] 11. Commit: `git commit -m "feat(cursor): fade + scale on viewport edge approach"`

- **Risk**: CSS animation opacity fighting inline style opacity. Verify breathing pauses during edge proximity.
- **Test**: Scroll caret off-screen → cursor fades. Click outside editor → cursor stays visible (regression check for Commit D).

### Commit 2: `feat(cursor): squash/bounce on edge crossing`

- [ ] 1. Add `SQUISH_BOUNCE` config block to `src/config.ts` (SQUISH_DURATION: 300, BOUNCE_DURATION: 400)
- [ ] 2. In `src/modules/cursor.ts`: import `SQUISH_BOUNCE`, add `wasOffScreen` and `squishAnimTimer` variables
- [ ] 3. In `src/modules/cursor.ts`: add `triggerSquishAnimation()` and `triggerBounceAnimation()` helper functions
- [ ] 4. In `src/modules/cursor.ts`: in `doUpdateCursor()`, AFTER `currentEdge = edge`, add edge-crossing detection: `wasOffScreen === false && edge.isOffScreen === true` → squish; `wasOffScreen === true && edge.isOffScreen === false` → bounce; then `wasOffScreen = edge.isOffScreen`
- [ ] 5. In `src/modules/cursor.ts`: update `destroyCursor()` to reset `wasOffScreen`, clear `squishAnimTimer`, remove `squishing`/`bouncing` classes
- [ ] 6. In `src/styles/index.scss`: add `@keyframes zentype-squish` (4 keyframes: scaleX/Y jelly)
- [ ] 7. In `src/styles/index.scss`: add `@keyframes zentype-bounce` (4 keyframes: scale overshoot + settle)
- [ ] 8. In `src/styles/index.scss`: add `.squishing` and `.bouncing` CSS class rules with `!important`
- [ ] 9. Build and manually test all 6 scenarios from Section 4 Commit 2 test plan
- [ ] 10. Commit: `git commit -m "feat(cursor): squash/bounce one-shot animation on edge crossing"`

- **Risk**: Animation classes overriding inline transform during animation window (brief visual lag). Acceptable for rarity of edge crossings.
- **Test**: Scroll off edge → squish plays. Scroll back → bounce plays. Rapid crossings don't stack.

### Commit 3: `feat(cursor): viewport edge arrow indicator`

- [ ] 1. Add `EDGE_ARROW` config block to `src/config.ts` (OPACITY: 0.6, SIZE: 12, OFFSET: 8, TRANSITION_MS: 200)
- [ ] 2. Extend `EdgeProximity` interface in `src/utils/edgeProximity.ts` to include `cursorX` and `cursorY` fields
- [ ] 3. Update `getEdgeProximity()` return value in `src/utils/edgeProximity.ts` to include `cursorX: rect.x`, `cursorY: rect.y`
- [ ] 4. In `src/modules/cursor.ts`: import `EDGE_ARROW`, add `arrowEl` and `arrowVisible` variables
- [ ] 5. In `src/modules/cursor.ts`: add `createArrowElement()` function (creates `#zentype-edge-arrow` div)
- [ ] 6. In `src/modules/cursor.ts`: add `getOffScreenArrowPosition()` function (clamps arrow position to viewport with directional logic)
- [ ] 7. In `src/modules/cursor.ts`: add `showArrow(edge)` and `hideArrow()` functions
- [ ] 8. In `src/modules/cursor.ts`: in `doUpdateCursor()`, add arrow visibility logic AFTER edge proximity calc, BEFORE boundary handling. Arrow shows when `edge.isOffScreen && edge.edge !== null` AND cursor is in editor context (not `isOuterElement`).
- [ ] 9. In `src/modules/cursor.ts`: update `destroyCursor()` to remove `arrowEl` and reset `arrowVisible`
- [ ] 10. In `src/styles/index.scss`: add `#zentype-edge-arrow` styles (4 directional states via `[data-direction]`, border-trick triangles, opacity transition)
- [ ] 11. Build and manually test all 7 scenarios from Section 4 Commit 3 test plan
- [ ] 12. Commit: `git commit -m "feat(cursor): viewport edge arrow indicator"`

- **Risk**: Arrow position clamping might be off at extreme window sizes. Verify arrow sits exactly at viewport edge (not overlapping scrollbars).
- **Test**: Scroll off each edge → arrow appears at correct edge with correct direction. Click outside editor → no arrow.

---

**After all 3 commits**, run the full Verification Matrix (Section 6, 17 scenarios) to confirm no regressions.

**Rollback for any commit**: `git revert <hash>` — each revert is clean (no conflicts) because each commit only adds code that subsequent commits don't modify (subsequent commits add NEW code in different sections of the same files).

---

## Post-implementation notes (2026-06-30)

> **Reality vs plan**: The 3-commit split was NOT preserved in the actual git history.
> - **Commit 1 (`68297da`)** — landed as planned: Fade + Scale on viewport edge approach.
> - **Commit 2 (squash/bounce)** — was supposed to be its own commit but was **merged into Commit 3**.
> - **Commit 3 (`58d20f6`)** — includes **BOTH** squash/bounce AND arrow. The commit message only mentions "viewport edge arrow indicator" but the diff covers both features.
>
> **See [docs/TODO.md](../../TODO.md) for 4 known issues** discovered during user testing on 2026-06-30:

| Issue | Type | Status | Resolution |
|---|---|---|---|
| **TODO-1** Initial cursor position transition is janky | 🐛 BUG | To fix | Investigate `createCursorElement` + `isFirstMove` lifecycle. May need `.no-transition` class for first 2-3 frames. |
| **TODO-2** Edge arrow indicator not needed | 🎯 Feature decision | Defer | Add `EDGE_ARROW.ENABLED: false` config flag, default OFF (Option C). Cannot cleanly `git revert 58d20f6` since it also contains squash/bounce. |
| **TODO-3** Edge definition too loose — animation triggers too early | 🐛 BUG | To fix | `FADE_ZONE = 60px` is too aggressive. Reduce to ~30px or add separate `EDGE_TRIGGER_THRESHOLD` (~15-20px). |
| **TODO-4** Scroll direction asymmetry (UP works, DOWN doesn't) | 🐛 BUG | To fix | Investigate `rect.y < 0` vs `rect.y > viewport.height` in `doUpdateCursor`; possible sign error or off-by-one in boundary check. |

### Why squash/bounce + arrow ended up in one commit

The plan called for 3 atomic commits for clean revertability. In practice, the squash/bounce CSS animations and the arrow DOM element ended up in the same commit because:

1. Both were in flight at the same time
2. The user asked to "land them together" to avoid half-broken state during testing
3. The arrow is positioned by reading `currentEdge.edge` (set by Commit 1), so the dependencies were already correct
4. After landing, user testing (2026-06-30) revealed the arrow was unnecessary (TODO-2) — too late to easily revert

**Lesson for future plans**: When 2 sub-features are both small (squish = 11 lines, arrow = 233 lines — wait, the arrow is much bigger), they should still be split into 2 commits even if "in flight together" — this preserves revertability when the user changes their mind about a feature.

### Actual commit graph

```
58d20f6  feat(cursor): viewport edge arrow indicator     ← HEAD, includes squash/bounce + arrow
68297da  feat(cursor): fade + scale on viewport edge approach
8e0f2e9  fix(cursor): hide cursor when caret scrolls off-screen
```

### Recommended next session

1. **Fix TODO-1 + TODO-4 together** (both in `doUpdateCursor` lifecycle). Land as 2 separate commits.
2. **Tune TODO-3** by reducing `FADE_ZONE` or adding `EDGE_TRIGGER_THRESHOLD`. Land as separate commit.
3. **Disable TODO-2** by adding `EDGE_ARROW.ENABLED: false` to `src/config.ts` and gating the arrow in `doUpdateCursor()`. Land as separate commit.
4. **Update `docs/TESTING_GUIDE_v2.2.0.md`** with regression scenarios for all 4 fixes.
5. After all 4 fixes verified, the 4 Plan 6 features (fade, scale, squash, bounce) are stable — only the arrow gets disabled, not removed.

