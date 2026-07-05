# ZenType Architecture Refactor Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue the "small steps, preserve behavior, clarify architecture" refactor without losing the original intent from `docs/BROOKS_SWEEP_REPORT.md`.

**Architecture:** Keep `src/index.ts` as the plugin composition root, keep user-visible modules under `src/modules/`, move cursor-private responsibilities into `src/modules/cursor/`, and reserve `src/utils/` for helpers shared by more than one user-visible module. Each slice moves one responsibility or one trigger family only.

**Tech Stack:** TypeScript, SiYuan plugin API, browser DOM APIs, esbuild, Sass, current repo dependencies only.

---

## Non-Negotiable Guardrails

These rules override convenience during every task in this plan.

- Do not change existing user behavior unless the user explicitly approves a behavior task.
- Do not rewrite modules. Prefer moving code, renaming narrow helpers, tightening interfaces, and adding short clarifying comments.
- Do not add dependencies.
- Do not change config defaults.
- Do not delete defensive code unless its lack of callers is proven and all verification passes.
- Do not combine unrelated slices. Each implementation turn should finish one structural slice.
- Pause before changing high-risk behavior: scrolling strategy, typewriter mode, Enter/Backspace boundaries, MutationObserver behavior, selection timing, or rAF ordering.
- Treat `src` and current README files as the short-term facts. Do not rewrite `docs/DESIGN.md` until the code structure is more stable.
- Every code slice must run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\tsc.cmd --noEmit --noUnusedLocals --noUnusedParameters
npm run build
git diff --check
```

If a new untracked source file is part of the slice, include it in whitespace checking by staging intent or by another equivalent Git diff check before claiming completion.

## Current State Snapshot

Date: 2026-07-05.

Already completed before this plan:

- `src/modules/cursor/edgeArrow.ts` exists and owns edge-arrow DOM state.
- `src/modules/cursor/scrollBindings.ts` has been created in the current worktree. It owns scroll ancestor binding, dedupe, stale binding release, and destroy cleanup.
- `src/modules/cursor.ts` still owns cursor DOM, update loop, switch-settle flow, ResizeObserver, popover drag binding, document events, EventBus callback exports, and inputMode trigger calls.
- Environment repair is intentionally postponed. Current known issues:
  - `pnpm-workspace.yaml` contains `allowBuilds` but no `packages` field, so some `pnpm` versions reject `pnpm install` and `pnpm run`.
  - `package.json` allows `siyuan` with `^1.0.4`, while the existing lockfile resolves `siyuan@1.2.1`. Installing with npm can drift to a newer `siyuan` whose exports break `siyuan/types`.
  - Codex sandbox may require elevated execution for Node and Git commands because of user-directory and `safe.directory` restrictions.

## Intended Module Boundaries

Use this boundary map when deciding where future code belongs.

- `src/index.ts`: plugin lifecycle, topbar commands, persistent enable state, SiYuan EventBus wiring, module initialization and teardown.
- `src/modules/inputMode.ts`: state store for `focusActive` and `typewriterActive`, with subscribe/query/set/reset APIs.
- `src/modules/inputModeTriggers.ts`: planned adapter layer for "what user/system event turns inputMode on or off". It should call `inputMode`, not own state.
- `src/modules/cursor.ts`: smooth cursor public module API, core update loop, exported EventBus callbacks, and orchestration of cursor-private helpers.
- `src/modules/cursor/*`: cursor-private responsibilities. These files may depend on cursor context callbacks, browser DOM APIs, and shared utils. They should not be imported by `typewriter` or `ripple`.
- `src/modules/typewriter.ts`: typewriter scrolling, click centering, Enter/Backspace FLIP, IME scroll pause behavior.
- `src/modules/ripple.ts`: ripple visual effect, sentence highlight, block opacity, MutationObserver.
- `src/utils/*`: shared helpers used by two or more modules, such as cursor rect, scroll ancestor lookup, boundary checks, and edge cases.
- `src/types/*`: shared type definitions that are not tied to one module's private state.

Rule of thumb: if only cursor needs it, put it under `src/modules/cursor/`. If cursor and typewriter or ripple both need it, put it under `src/utils/`.

## Manual SiYuan Test Matrix

Run this after each code slice when possible.

- Basic typing: smooth cursor follows caret, does not flash at viewport origin, breathing pauses and resumes.
- Wheel or trackpad scroll: cursor pauses animation during scroll and catches up cleanly.
- Enter new paragraph near viewport edge: typewriter scroll still centers or keeps the caret visible, and cursor movement is not a hard instant jump when keyboard-driven scroll occurs.
- Backspace at block start: block merge animation and typewriter alignment still feel unchanged.
- Long document edge fade: cursor fades near editor boundaries and returns smoothly.
- Tab switching and split panes: old editor position should not flash; new editor cursor appears after layout stabilizes.
- Embedded or nested scroll areas: cursor responds when the active caret is inside a scrollable ancestor.
- Popover drag: cursor updates while dragging a block popover resize/move handle.
- Mouse click, drag selection, blur, wheel, ArrowUp/ArrowDown/PageUp/PageDown: inputMode exits as before.
- IME composition: candidate window should not be dragged by typewriter scrolling; compositionend should restore expected mode behavior.
- Plugin unload/reload: no duplicate event handlers, stale cursor DOM, or residual ripple opacity.

## Task 0: Finish Current Scroll Binding Slice

**Status:** In progress in the current worktree. Finish and verify before starting Task 1.

**Files:**
- Created: `src/modules/cursor/scrollBindings.ts`
- Modified: `src/modules/cursor.ts`

- [ ] **Step 1: Confirm the slice is only scroll binding extraction**

Run:

```powershell
$repo = 'C:/Users/Han/.codex/worktrees/4ca1/zenType'
git -c safe.directory=$repo diff -- src/modules/cursor.ts src/modules/cursor/scrollBindings.ts
```

Expected:
- `src/modules/cursor.ts` imports `bindScrollContainerEvents` and `destroyScrollContainerEvents`.
- `src/modules/cursor.ts` no longer imports `findAllScrollableAncestors`.
- `src/modules/cursor.ts` still calls scroll binding from the same `doUpdateCursor()` phase.
- `src/modules/cursor.ts` still destroys scroll bindings during `destroyCursor()`.

- [ ] **Step 2: Run verification**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\tsc.cmd --noEmit --noUnusedLocals --noUnusedParameters
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Manual test focus**

Use the Manual SiYuan Test Matrix, focusing on:
- wheel or trackpad scroll
- nested scroll areas
- Enter-triggered automatic scroll
- plugin unload/reload

Expected: no duplicate scroll response, no stale cursor, no regression in keyboard-driven cursor transition.

## Task 1: Extract `cursor/switchSettle.ts`

**Goal:** Move switch-protyle hide, settle sampling, and reveal logic out of `src/modules/cursor.ts` without changing timing or visual behavior.

**Risk Level:** Medium. This touches tab switching and rAF/selection timing. Do not change constants or ordering.

**Files:**
- Create: `src/modules/cursor/switchSettle.ts`
- Modify: `src/modules/cursor.ts`

**Keep unchanged:**
- `minDurationMs = 240`
- `maxDurationMs = 700`
- `stableFrameTarget = 8`
- `epsilonPx = 0.35`
- `requestAnimationFrame` layering
- `opacity = "0"` while hidden
- `.no-transition` and `.no-animation` class order
- the guard in `doUpdateCursor()` that avoids clearing opacity while switch hidden or reveal pending

- [ ] **Step 1: Create `switchSettle.ts` with the existing state machine**

Create a module that owns:

```ts
type SwitchTarget = { x: number; y: number; height: number };

export interface SwitchSettleContext {
  getCursorElement: () => HTMLDivElement | null;
  sampleTarget: () => SwitchTarget | null;
  cancelRemoveTransitionFrame: () => void;
  pauseBreathe: () => void;
  queueUpdate: () => void;
  scheduleResumeBreathe: () => void;
}
```

The module should export:

```ts
export function startSwitchSettle(context: SwitchSettleContext): void;
export function stopSwitchSettle(): void;
export function isSwitchHiddenActive(): boolean;
export function isSwitchRevealPending(): boolean;
```

Implementation must be the moved body of the current `sampleSwitchTarget`, `hideCursorForSwitch`, `stopSwitchSettle`, `finishAnimatedSwitch`, and `startAnimatedSwitchSettle` logic, except `sampleTarget` comes from the context.

- [ ] **Step 2: Modify `cursor.ts` to provide context**

Keep `sampleSwitchTarget()` in `cursor.ts` if that keeps `getCursorRect()` ownership clearer, or inline it as a context callback. Use this exact behavior:

```ts
const switchSettleContext = {
  getCursorElement: () => cursorEl,
  sampleTarget: sampleSwitchTarget,
  cancelRemoveTransitionFrame,
  pauseBreathe,
  queueUpdate,
  scheduleResumeBreathe,
};
```

If `cancelRemoveTransitionFrame` is introduced, it must only move the existing block:

```ts
if (removeTransitionFrame !== null) {
  cancelAnimationFrame(removeTransitionFrame);
  removeTransitionFrame = null;
}
```

- [ ] **Step 3: Replace state reads in `doUpdateCursor()`**

Replace direct reads of `switchHiddenActive` and `switchRevealPending` with:

```ts
!isSwitchHiddenActive() &&
!isSwitchRevealPending() &&
cursorEl.style.opacity !== ""
```

Expected: `cursor.ts` no longer owns `switchSettleFrame`, `switchHiddenActive`, or `switchRevealPending`.

- [ ] **Step 4: Replace switch and destroy calls**

Use:

```ts
startSwitchSettle(switchSettleContext);
stopSwitchSettle();
```

Expected:
- `onProtyleSwitched()` still starts the settle flow.
- `destroyCursor()` still stops any pending settle rAF before removing the cursor DOM.

- [ ] **Step 5: Run verification**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\tsc.cmd --noEmit --noUnusedLocals --noUnusedParameters
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 6: Manual test focus**

In SiYuan:
- open two tabs and switch quickly several times
- switch between split panes
- switch while cursor is near top or bottom editor edge
- switch after selecting text
- switch after plugin reload

Expected: no old-position flash, no permanent hidden cursor, no broken fade-in.

## Task 2: Extract Cursor Document Event Bindings

**Goal:** Move document event registration and cleanup from `cursor.ts` into `src/modules/cursor/events.ts`, while preserving handler behavior and inputMode calls for now.

**Risk Level:** Medium. This touches input, scroll, wheel, click, drag-select, blur, and IME events.

**Files:**
- Create: `src/modules/cursor/events.ts`
- Modify: `src/modules/cursor.ts`

**Do not do in this task:**
- Do not introduce `inputModeTriggers` yet.
- Do not change which events use capture or passive.
- Do not change the list or order of handler registration.
- Do not change keyboard pending cooldown logic.

- [ ] **Step 1: Create `events.ts` with register/destroy functions**

The new module should export:

```ts
export interface CursorEventContext {
  markKeyboardPending: () => void;
  onScrollOrWheel: () => void;
  queueUpdate: () => void;
  inputModeSetBothOn: () => void;
  inputModeSetBothOff: () => void;
}

export function bindCursorDocumentEvents(context: CursorEventContext): void;
export function destroyCursorDocumentEvents(): void;
```

Keep local state that belongs only to document-event handling:

```ts
let isPasting = false;
let mouseDownInfo: { selectionText: string } | null = null;
let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];
```

- [ ] **Step 2: Move the handlers array exactly**

Move the existing `handlers` array from `initCursor()` to `bindCursorDocumentEvents()`.

Expected preservation:
- `keydown` remains `{ capture: true }`
- `input` remains `{ capture: true }`
- `scroll` remains `{ capture: true, passive: true }`
- `wheel` and `touchmove` remain `{ capture: true, passive: true }`
- `resize` remains `{ passive: true }`

- [ ] **Step 3: Keep cursor.ts as the orchestrator**

In `initCursor()`, call:

```ts
bindCursorDocumentEvents(cursorEventContext);
```

In `destroyCursor()`, call:

```ts
destroyCursorDocumentEvents();
```

Expected: `cursor.ts` no longer owns `eventListeners`, `isPasting`, or `mouseDownInfo`.

- [ ] **Step 4: Run verification and manual tests**

Run the standard verification commands.

Manual focus:
- input turns focus/typewriter on
- paste does not immediately turn both on through the skipped input path
- click exits inputMode
- wheel/touchmove exits inputMode
- drag-select exits inputMode on mouseup
- blur exits inputMode

## Task 3: Extract Cursor Resize and Popover Bindings

**Goal:** Move ResizeObserver and block popover drag binding from `cursor.ts` into cursor-private modules.

**Risk Level:** Medium. ResizeObserver and popover drag interact with cursor transition timing.

**Files:**
- Create: `src/modules/cursor/resizeBindings.ts`
- Create: `src/modules/cursor/popoverDrag.ts`
- Modify: `src/modules/cursor.ts`

**Do not do in this task:**
- Do not merge ResizeObserver with scroll bindings.
- Do not change observer target selectors.
- Do not change popover drag event targets or passive options.

- [ ] **Step 1: Extract ResizeObserver logic**

New API:

```ts
export interface ResizeBindingContext {
  getCursorElement: () => HTMLDivElement | null;
  isKeyboardUpdatePending: () => boolean;
  queueUpdate: () => void;
}

export function bindResizeObservers(cursorElement: Element | null, context: ResizeBindingContext): void;
export function destroyResizeObservers(): void;
```

Move existing state:

```ts
let protyleContentObserver: ResizeObserver | null = null;
let protyleWysiwygObserver: ResizeObserver | null = null;
let lastBoundProtyleContent: HTMLElement | null = null;
let lastBoundProtyleWysiwyg: HTMLElement | null = null;
```

- [ ] **Step 2: Extract popover drag logic**

New API:

```ts
export interface PopoverDragContext {
  getCursorElement: () => HTMLDivElement | null;
  queueUpdate: () => void;
}

export function bindPopoverDrag(cursorElement: Element | null, context: PopoverDragContext): void;
export function unbindPopoverDrag(): void;
```

Move `PopoverDragBinding` and `popoverDragBinding` into the new file.

- [ ] **Step 3: Run verification and manual tests**

Run the standard verification commands.

Manual focus:
- editor content resize
- side panel resize
- popover drag and release
- plugin unload/reload

## Task 4: Introduce `inputModeTriggers.ts`

**Goal:** Centralize the meaning of user and system triggers that turn focus/typewriter modes on and off.

**Risk Level:** Medium to high. This touches focus/typewriter semantics across `index.ts`, `cursor.ts`, and `typewriter.ts`.

**Files:**
- Create: `src/modules/inputModeTriggers.ts`
- Modify: `src/index.ts`
- Modify: `src/modules/cursor.ts` or `src/modules/cursor/events.ts` if Task 2 is complete
- Modify: `src/modules/typewriter.ts`

**Do not do in this task:**
- Do not change `inputMode.ts` state shape.
- Do not change trigger semantics.
- Do not combine focus and typewriter into one boolean.
- Do not change topbar enable/disable semantics.

- [ ] **Step 1: Create trigger adapter names**

Create wrapper functions with names that encode intent:

```ts
export function onTextInput(): void;
export function onCompositionEnd(): void;
export function onEnterOrBackspaceEdit(): void;
export function onWheelOrTouchMove(): void;
export function onVerticalNavigationKey(): void;
export function onMouseClick(): void;
export function onDragSelection(): void;
export function onSwitchProtyle(): void;
export function onBlur(): void;
```

Initial implementation should delegate directly:

```ts
inputMode.setBothOn();
inputMode.setBothOff();
```

Expected: behavior remains unchanged, but call sites become semantically searchable.

- [ ] **Step 2: Replace direct inputMode calls one trigger family at a time**

Move call sites in this order:

1. `src/index.ts` switch-protyle off
2. cursor document events off triggers
3. cursor document events on triggers
4. typewriter Enter/Backspace activation

After each family, run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit --noUnusedLocals --noUnusedParameters
```

Expected: no direct `inputMode.setBothOn()` or `inputMode.setBothOff()` remains outside `inputModeTriggers.ts`, except inside tests if tests are later added.

- [ ] **Step 3: Run full verification and manual tests**

Run the standard verification commands.

Manual focus:
- text input and IME compositionend activate both modes
- wheel, click, blur, tab switch, vertical navigation, drag selection deactivate both modes
- ArrowLeft/ArrowRight/Home/End/Escape preserve modes
- topbar still toggles module enable state rather than inputMode active state

## Task 5: Characterization Tests for Pure or Semi-Pure Helpers

**Goal:** Add a small safety net before larger behavior changes, without trying to fully simulate SiYuan.

**Risk Level:** Low to medium. This may require choosing a test runner, so it should wait until environment repair is done or be explicitly approved as its own task.

**Files:**
- Read: `src/utils/edgeProximity.ts`
- Read: `src/modules/ripple.ts`
- Read: `src/modules/typewriter.ts`
- Create only after approval: `docs/superpowers/plans/2026-07-05-characterization-tests-proposal.md`
- No production or test source files should be modified in this task until the proposal is approved.

**Do not do in this task without approval:**
- Do not add a new test dependency.
- Do not create brittle DOM tests that pretend to fully emulate SiYuan.

- [ ] **Step 1: Identify candidates that need no SiYuan runtime**

Candidate functions:
- `src/utils/edgeProximity.ts`
- selected text/range helpers in `src/modules/ripple.ts` if they can be exported without leaking production API
- selected typewriter duration and block-window helpers only if extracting them first makes the tests clearer

- [ ] **Step 2: Propose the smallest test setup**

Prepare a short proposal before implementation:
- test runner
- dependencies, if any
- how commands fit existing `npm run` scripts
- which behavior each test characterizes

Expected: user approval before adding dependencies.

## Task 6: Synchronize Documentation After Code Structure Stabilizes

**Goal:** Update docs to describe the current architecture instead of patching old design assumptions.

**Risk Level:** Low for runtime, medium for future maintenance if written incorrectly.

**Files:**
- Modify: `docs/DESIGN.md`
- Modify: `docs/BROOKS_SWEEP_REPORT.md`
- Modify only if current behavior text is affected: `README.md`
- Modify only if current behavior text is affected: `README_zh-CN.md`

**Do not do before Tasks 1 through 4 are complete.**

- [ ] **Step 1: Update architecture snapshot**

Describe:
- cursor core loop
- cursor-private helper modules
- inputMode state and trigger adapter
- typewriter scroll and FLIP behavior
- ripple Highlight API and MutationObserver scope

- [ ] **Step 2: Remove stale claims**

Remove or rewrite claims about:
- old default state
- old file paths
- old full-editor FLIP scanning
- removed highlighter bar behavior

- [ ] **Step 3: Run documentation review**

Check each docs claim against `src`.

Expected: no docs claim should require guessing or contradict current code.

## Task 7: Environment Repair, Last

**Goal:** Make local and agent verification repeatable without changing runtime behavior.

**Risk Level:** Medium because package-manager and lockfile changes can affect everyone.

**Files:**
- Modify only after explicit review: `pnpm-workspace.yaml`, `package.json`, lockfile, or contributor docs.

**Do not mix with code refactors.**

- [ ] **Step 1: Diagnose package manager intent**

Check:
- whether this repo is intended to be a single-package pnpm workspace
- whether `allowBuilds` syntax is expected by the installed pnpm version
- whether `packages: ['.']` or removing workspace config is the smaller fix

- [ ] **Step 2: Pin dependency expectations**

Check:
- whether `siyuan@1.2.1` is required because `siyuan/types` is exported or resolvable there
- whether `package.json` should narrow `siyuan` from `^1.0.4`
- whether npm should be documented as unsupported for dependency install

- [ ] **Step 3: Propose one environment-only change**

Before editing package manager files, present:
- exact file changes
- expected command behavior before and after
- risk to current users

Expected: user approval before applying.

## Execution Rules for Future Agents

Before doing any future slice:

- Read this plan.
- Read `docs/BROOKS_SWEEP_REPORT.md`.
- Read the files named in the chosen task.
- Check `git status --short`.
- If uncommitted changes exist, identify whether they are from a prior slice or unrelated user work.
- Update this plan's task checkboxes only if the user asks to maintain progress in the document. Otherwise report progress in the chat.

When a slice is complete, report in Chinese:

- what changed
- why behavior should be unchanged
- verification results with command names
- manual SiYuan test suggestions
- recommended next slice
