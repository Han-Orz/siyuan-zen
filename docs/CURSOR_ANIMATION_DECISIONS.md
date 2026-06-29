# Cursor Animation — Decisions & Future Work

**Status**: Active. Last updated 2026-06-30 (post-`58d20f6`).

This document captures cursor animation design decisions, the rationale, and what's deliberately deferred.

---

## 0. Plan 6 (edge interaction) — current implementation

> **See [TODO.md](TODO.md) for 4 known issues** found during user testing on 2026-06-30.

Plan 6 added 3 cursor edge-interaction features. **The plan was 3 commits, but shipped as 2 git commits** (Commit 2 and Commit 3 were combined into `58d20f6`):

| Plan commit | Feature | Actual git commit | Files |
|---|---|---|---|
| Commit 1 | Fade + scale near viewport edges | `68297da` | `src/config.ts`, `src/modules/cursor.ts`, `src/styles/index.scss`, `src/utils/edgeProximity.ts` (new, 81 lines) |
| Commit 2 | Squash/bounce one-shot on edge crossing | **combined into `58d20f6`** | `src/config.ts`, `src/modules/cursor.ts`, `src/styles/index.scss` (keyframes + classes) |
| Commit 3 | Edge arrow indicator (off-screen) | `58d20f6` | `src/config.ts`, `src/modules/cursor.ts` (+147 lines), `src/styles/index.scss` (+61 lines), `src/utils/edgeProximity.ts` (+6 lines) |

**Why combined?** User testing feedback after Commit 1 suggested the arrow was unnecessary (TODO-2). The squash/bounce work was already in flight; rather than ship it as Commit 2 and then revert Commit 3, the implementation landed both in one commit. This means a clean `git revert 58d20f6` is NOT possible without losing squash/bounce.

**Recommendation (per TODO-2 Option C)**: Add `EDGE_ARROW.ENABLED: false` config flag, default OFF, instead of reverting. This is the cleanest path forward.

### Plan 6 commit graph
```
58d20f6  feat(cursor): viewport edge arrow indicator     ← HEAD (squash/bounce + arrow)
68297da  feat(cursor): fade + scale on viewport edge approach
8e0f2e9  fix(cursor): hide cursor when caret scrolls off-screen
```

---

## 1. Current state (v2.2.0 + Plan 6, post-`58d20f6`)

Cursor breathing animation in `src/styles/index.scss`:
- Keyframe: `zentype-breathe 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite`
- 4 keyframes: `0%{1} → 40%{0.85} → 70%{0.15} → 100%{0.6}`
- No delay (1.5s delay was removed)

**Plan 6 additions (commits 68297da + 58d20f6)**:
- **Fade + Scale** (Commit 1): Near viewport edges (within `FADE_ZONE = 60px`), cursor opacity + scale smoothly decrease. Fully off-screen → opacity=0, scale=0.6, position frozen at `lastGoodCursorPos`.
- **Squash + Bounce** (Commit 2, combined into 58d20f6): One-shot CSS animations on edge crossings. `scaleX(0.5)/scaleY(1.4)` squish (300ms ease-out) when leaving viewport; `scale(1.15)` overshoot bounce (400ms cubic-bezier(0.34, 1.56, 0.64, 1)) when re-entering.
- **Edge Arrow** (Commit 3, combined into 58d20f6): A small border-trick triangle at the viewport edge when cursor is off-screen, horizontally aligned with caret position. **`EDGE_ARROW.OPACITY = 0.6`**, `SIZE = 12px`, `OFFSET = 8px`, `TRANSITION_MS = 200ms`. **Note**: User wants this disabled — see TODO-2.

**User feedback (2026-06-29)**: breathing animation works but feels "stiff" / "jerky". 4 keyframes + 3.5s = visible plateau + abrupt loop boundary transition. "Worse than v2.2.0-pre."

**User feedback (2026-06-30, Plan 6)**: 4 issues found — see [TODO.md](TODO.md).

---

## 2. Open design questions

### Q1: More keyframes + brief `opacity: 0` dip
**Status**: TBD. Proposing options to user in next round.

The "stiff" feeling comes from too few keyframes. The user wants:
- More keyframes (sin-curve distribution)
- Include a brief `opacity: 0` dip (~3% of cycle, ~100ms)
- Result: smoother breathing, no harsh loop boundary

### Q2: Size breathing (cursor DIV scale change)
**Status**: ❌ **DEFERRED**. Will not be implemented in this iteration.

#### Why deferred — full consultant analysis (2026-06-29)

**Technical feasibility**: ✅ possible, BUT requires CSS `scale` property (NOT `transform: scaleY()`).
- Reason: `doUpdateCursor()` in `src/modules/cursor.ts:138` sets inline `transform: translate3d(x, y, 0)` every cursor-move frame. CSS `transform: scaleY()` animation would override it (CSS animation priority > inline style), causing cursor to lose its position.
- CSS `scale` property (Chrome 104+, 2022) is independent of `transform`, so they don't conflict. The two compose: `transform: translate3d(...)` positions; `scale: 1 0.7` resizes.

**Performance pressure**: 2/5 (minor)
- One additional compositor property when idle. Negligible.

**Implementation difficulty**: 1/5 (very simple)
- ~3-5 lines in 1 file (`src/styles/index.scss`)

**Change size**: S

**Risks**:
- ⚠️ **SiYuan desktop Electron Chromium version unknown**. If old (< 2022), `scale` property unsupported.
- Mitigation: use `@supports (scale: 1)` to feature-detect; fall back to opacity-only.
- Default `transform-origin: center` for vertical scale works for our 3px-wide element.

**Proposed keyframe (when implemented)**:
```css
@keyframes zentype-breathe {
  0%   { opacity: 1;    scale: 1; }
  40%  { opacity: 0.85; scale: 1; }
  70%  { opacity: 0.15; scale: 1 0.7; }
  100% { opacity: 0.6;  scale: 1; }
}
```

#### When to revisit
- After Q1 (more keyframes) is shipped and user evaluates.
- After SiYuan Electron version is verified to support `scale` property (user can test in F12: `CSS.supports('scale', '1')`).
- Probably v2.3.0 or later — not blocking v2.2.0 release.

### Q3: iA Writer reference findings
**Librarian research, 2026-06-29**:

iA Writer's cursor has **NO breathing animation**. The "feels good" quality comes from **physical design**, not animation:
- Wider, full-height, colored cursor (physical design)
- Magnetic precision — position never blurs
- OS-level blink (500ms hard toggle) — no custom animation
- Smooth dim transitions in Focus Mode (200-300ms ease-in-out, 20-30% opacity for dimmed text)

**Implication for zenType**: Physical design choices may matter more than animation. Possible future exploration (not committed):
- Wider cursor (3px → 4px)
- Adjust `HEIGHT_RATIO` for full-line coverage
- Brighter color contrast
- Adopt iA Writer's "magnetic precision" feel (no scale-based animation that could blur position)

---

## 3. Implementation log

| Date | Commit | Change | User feedback |
|---|---|---|---|
| 2026-06-29 | `b0c0c3c` | Initial Soft Pulse (4 keyframes, 3.5s) | "stiff / jerky" |
| 2026-06-30 | `68297da` | Plan 6 Commit 1: Fade + Scale (FADE_ZONE=60, MIN_SCALE=0.6) | "triggers too early" → TODO-3 |
| 2026-06-30 | `58d20f6` | Plan 6 Commits 2+3: Squash/Bounce + Arrow (combined) | 4 issues → see TODO.md |
| TBD | TBD | Add 6-10 keyframes with brief 0-dip | pending |

---

## 4. Future direction (priority order)

1. **Q1: Redesign keyframe** with 6-10 keyframes + brief `opacity: 0` dip (~3% of cycle)
2. **Q2: Size breathing** — deferred to future iteration
3. **Q3: Physical design** — possible future exploration (cursor width, color, height)

---

## 5. Continuation prompt (cursor animation)

```text
Continue cursor animation work for the zenType plugin per docs/CURSOR_ANIMATION_DECISIONS.md.

The current keyframe (commit b0c0c3c) is "stiff". Implement a redesigned keyframe with
6-10 keyframes on a sin-curve distribution, including a brief opacity: 0 dip (~3% of
cycle, ~100ms).

Implementation:
- File: src/styles/index.scss
- Replace @keyframes zentype-breathe block (lines 36-41)
- Keep duration 3.5s and cubic-bezier(0.4, 0, 0.6, 1) unless user specifies otherwise
- Loop boundary 0% and 100% must have identical values (no jump)
- The 0-dip should be at ~67-72% of cycle (between mid-fade and recover)
- Build with npm run build:dev, verify CSS keyframe in bundle, sync to
  F:\Documents\九畴\data\plugins\siyuan-zen\, commit on
  fix/v2.2.0-cursor-optimization.
```
