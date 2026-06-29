# Focus / Typewriter Mode — Design Specification

**Status**: ✅ **Implemented 2026-06-30** (commit `63ab96b`). See **Implementation status** section below. Design decisions Q1–Q7 are LOCKED and the implementation follows them. See **Continuation prompt** at bottom for any future work.

**Related**: `docs/CONTINUATION.md` (workflow), `docs/TESTING_GUIDE_v2.2.0.md` (existing features), `docs/TODO.md` (Plan 6 follow-up issues)

---

## 0. Implementation status (post-`63ab96b`)

The focus/typewriter design was implemented as **Option A (global `inputMode` state)** per §3's tie-breaker hint. Subsequent commits refined the behavior:

| Commit | Change | Notes |
|---|---|---|
| `63ab96b` | `feat: focus mode and typewriter mode (Option A - global state)` | Initial implementation; new `src/modules/inputMode.ts` with global state, ON/OFF transitions, subscription mechanism; 2 commands registered in `src/index.ts:onload()` |
| `5a0251d` | `feat(inputMode): fire subscriber on subscribe + isolate exceptions` | Subscribers get current state immediately on subscribe; per-subscriber try/catch prevents one bad subscriber from breaking others |
| `48e7e9d` | `fix(cursor): decouple breathing from focus mode` | Breathing animation no longer tied to focus mode state; per design Q7 "no UI feedback" — breathing is independent of the input mode |
| `53dfb55` | `refactor: rename toggle-focus/toggle-typewriter to enable- + add disable- commands` | Commands renamed for clarity; 4 commands total (2 enable + 2 disable) instead of 2 toggle commands |

### Design decisions — final mapping

| Design Q | Decision | Implemented as |
|---|---|---|
| Q1 (state model) | B: manual command = simulate one input | `inputMode.simulateInput()` API |
| Q2 (typing trigger) | C, C-1: keyboard + IME compositionend | Listeners in `inputMode.ts` |
| Q3 (idle timeout) | A-1: no idle timeout | None — removed from spec |
| Q4 (independence) | B, A1: independent + ripple stops | Separate `focusActive` / `typewriterActive` flags |
| Q5 (sticky toggle) | A: no sticky | Per-trigger semantics |
| Q6 (exit conditions) | Final table in §2.6 | Exit triggers wired in `inputMode.ts` |
| Q7 (defaults) | OFF, per-session, no UI | Defaults match design |
| Q8 (architecture) | A (global state) | `src/modules/inputMode.ts` |

All 7 design questions (Q1–Q7) + the §3 architecture choice (Q8 = Option A) are reflected in the implementation. No design changes were made during implementation.

---

---

## 1. Background

zenType v2.2.0 ships with typewriter scrolling and ripple focus that are **always-on**. The user wants:
- Default OFF — these modes activate only when actively typing or via explicit command
- Predictable behavior across input sources
- Independent control of focus and typewriter

This document captures the locked design decisions so they survive context loss.

---

## 2. Design decisions

### 2.1 State model (Q1: **B**)
**Manual command = "simulate one input"**. The same rule applies regardless of trigger source: ON → exit on scroll/arrow/etc.

**Rationale**: predictable, single rule. No special treatment for command vs. real input.

### 2.2 Typing trigger (Q2: **C, C-1**)
- **Triggers**: keyboard input event, IME `compositionend`
- **Does NOT trigger**: paste event, selection-only changes
- **Threshold**: dropped (3-char threshold removed). First keystroke = ON, stays ON until exit trigger.

**Rationale**:
- Paste is "整理" (consolidation), not active writing
- IME compositionend means user has selected characters → content is being added
- Threshold creates unwanted delay before focus kicks in

### 2.3 Idle timeout (Q3: **A-1**)
**No idle timeout.** Typewriter naturally stops when cursor doesn't move.

**Tradeoff**: large paragraph insertion (paste-like burst) may trigger typewriter scroll → good visibility, but potentially annoying if user is doing structural edits.

### 2.4 Focus/typewriter independence (Q4: **B, A1**)
- Focus and typewriter are **independent** (2 commands, can be combined).
- When focus is OFF, **ripple's mouse mode also stops completely**.

**Rationale**: "focus" means "be fully present"; when user breaks focus, the whole ripple ecosystem goes quiet (not partially dimmed).

### 2.5 Sticky toggle (Q5: **A**)
**No sticky mode.** Commands = simulate one input only. 2 commands total.

**Rationale**: sticky mode would violate the "active editing only" goal. Sticky also doesn't make sense semantically: focus is a state, not a mode.

### 2.6 Exit conditions (Q6 final)

| Action | Result |
|---|---|
| 滚轮 (scroll wheel) | OFF |
| 上下方向键 (up/down arrow) | OFF |
| Page Up / Page Down | OFF |
| Home / End | **Keep ON** |
| 左/右方向键 (left/right arrow) | **Keep ON** |
| Escape | **Keep ON** |
| 鼠标单击 (mouse click, moves cursor) | OFF |
| 鼠标拖蓝选文本 (mouse drag-select) | OFF |
| 切 tab (tab switch) | OFF |
| 失焦 (blur, click outside editor / switch app) | OFF |

**Keep ON actions** are about *horizontal navigation within current position* — they don't change the user's focus intent. Exit actions are about *vertical navigation or breaking engagement*.

### 2.7 Design defaults (Q7)
- **Default state**: OFF (both focus and typewriter)
- **Persistence**: per-session (no localStorage)
- **UI feedback**: none (ripple + highlight bar are natural feedback; no need for extra status icon)

---

## 3. Deferred: State machine architecture (Q8)

Two options for the single source of truth on "input mode active":

- **Option A**: Global `inputMode: 'on' | 'off'` state. Each module reads it.
- **Option B**: Per-mode state (focus/typewriter), coordinated via shared event bus.

**Not yet decided.** Defer to implementation phase — pick one based on the implementation's natural shape.

**Tie-breaker hint**: Option A is simpler if focus and typewriter share 90% of trigger/exit logic. Option B is better if they diverge significantly. The current design has them sharing most logic → lean A.

---

## 4. Files to modify (when implementing)

| File | Change |
|---|---|
| `src/utils/edgeCases.ts` | `shouldPauseFocusAndTypewriter` may need to read new state |
| `src/modules/ripple.ts` | Add ON/OFF state gate (currently always on). Mouse mode also stops when focus OFF. |
| `src/modules/typewriter.ts` | Add ON/OFF state gate (currently always on) |
| `src/modules/cursor.ts` | Breathing should turn off when focus OFF |
| `src/index.ts` | Register 2 new commands: "Toggle Focus Mode" / "Toggle Typewriter Mode" |
| `src/config.ts` | Optional: add `FOCUS_TYPEWRITER_CONFIG` constants (no idle threshold) |

No new dependencies. No CSS changes (visual behavior already exists; just needs gating).

---

## 5. Suggested implementation order

1. **Decide A vs B** (Q8). Document the choice in commit message.
2. **Add state** to a new module `src/modules/inputMode.ts` OR extend `src/utils/edgeCases.ts`.
3. **Wire triggers** (keyboard input + compositionend) to set state ON.
4. **Wire exits** (scroll/arrow/click/etc.) to set state OFF.
5. **Gate modules** — read state in ripple.ts, typewriter.ts, cursor.ts. Each decides its own behavior.
6. **Register commands** in `src/index.ts:onload()`.
7. **Manual test** all 6 exit conditions + 4 keep conditions from §2.6.

---

## 6. Test plan

| # | Action | Expected | Notes |
|---|---|---|---|
| 1 | Open document, idle 5s | Focus OFF, typewriter OFF, ripple mouse OFF | Default state |
| 2 | Type "hello" | After "h": focus ON, typewriter starts centering line | First keystroke |
| 3 | Press ↑/↓ arrow | Focus OFF, typewriter stops | Exit trigger |
| 4 | Type, then press → (right arrow) | Focus stays ON | Keep trigger |
| 5 | Type, then press Esc | Focus stays ON | Keep trigger |
| 6 | Type, then click elsewhere | Focus OFF, typewriter stops | Exit trigger |
| 7 | Type, then drag-select | Focus OFF (not just pause) | Exit trigger |
| 8 | Type, then scroll wheel | Focus OFF, typewriter stops | Exit trigger |
| 9 | Type Chinese via IME, then compositionend | Focus ON | IME counts |
| 10 | Paste text | Focus stays OFF | Paste is not active writing |
| 11 | Run command "Toggle Focus Mode" | Simulates one input, focus ON | Manual override |
| 12 | Run command "Toggle Typewriter Mode" | Simulates one input, typewriter ON | Manual override |
| 13 | Switch tab to another doc | Focus OFF (when returning) | Tab switch exit |
| 14 | Click outside editor (lose blur) | Focus OFF | Blur exit |

---

## 7. Continuation prompt for next session

```text
Implement the focus mode and typewriter mode for the zenType plugin per the spec in
docs/FOCUS_TYPEWRITER_DESIGN.md (the full design has been preserved there).

CONTEXT
- Project at F:\Documents\GitHub\zenType, branch fix/v2.2.0-cursor-optimization
- SiYuan plugin (TypeScript strict, esbuild + esbuild-sass-plugin with type: 'css-text')
- Plugin folder name = siyuan-zen (NOT zenType — SiYuan marketplace requires name field == repo name)
- Dev sync: copy dev/* → F:\Documents\九畴\data\plugins\siyuan-zen\
- Build: npm run build:dev
- Type check: npx tsc --noEmit
- 9 EventBus events managed in src/index.ts via eventBusOffFns array
- Plugin commands registered via this.addCommand({...}) in onload()
- The SiYuan v3.7.0-beta.2 plugin manager strictly matches the on-disk folder name to
  the `name` field in plugin.json — do NOT change the name back to zenType
- A previous v2.2.0 P2 regression on the Set/activeProtyleIds gate is documented at
  src/modules/cursor.ts:15-18 — do NOT reintroduce it

REQUIRED BEHAVIORS (full table in spec §2.6)
1. Default state: focus OFF, typewriter OFF
2. Two new commands (one for each mode):
   - "Toggle Focus Mode" (simulates one keyboard input → ON; subject to exit rules)
   - "Toggle Typewriter Mode" (simulates one keyboard input → ON; subject to exit rules)
3. ON triggers: keyboard input event, IME compositionend
4. ON does NOT trigger: paste event, selection-only changes
5. Exit (set OFF) triggers: wheel, up/down arrow, PageUp/PageDown, mouse click,
   mouse drag-select, tab switch, blur (focus loss)
6. Keep ON: Home/End, left/right arrow, Escape
7. No idle timeout
8. When focus OFF, ripple's mouse mode also stops completely (per Q4 A1)
9. Per-session state (no localStorage)
10. No UI feedback (ripple + highlight bar are the visible cues)

ARCHITECTURE DECISION
Pick A (global inputMode state) or B (per-mode state with shared event bus).
The spec §3 leans A. Document your choice in the commit message.

SUGGESTED IMPLEMENTATION
1. Add a new module src/modules/inputMode.ts (or extend src/utils/edgeCases.ts)
   with the state, ON/OFF transitions, and a subscription mechanism.
2. Add the 2 commands in src/index.ts:onload() — each command calls the
   "simulate input" API on the new module.
3. Wire triggers/exits to existing event handlers in ripple.ts, typewriter.ts,
   cursor.ts. Update shouldPauseFocusAndTypewriter to read the new state.
4. For breathing-when-OFF: in src/modules/cursor/breathing.ts, when focus is OFF,
   call pauseBreathe() permanently (do not schedule resume).
5. Build, sync to F:\Documents\九畴\data\plugins\siyuan-zen\, manual test all
   14 scenarios in spec §6.
6. Commit on branch fix/v2.2.0-cursor-optimization with conventional-commits
   format. Do NOT push unless asked.

VERIFICATION
- npx tsc --noEmit (must exit 0)
- npm run build:dev (must exit 0)
- SHA256 of dev/* matches F:\Documents\九畴\data\plugins\siyuan-zen\/*
- All 14 test scenarios pass manually

RETURN
Final report with: commit hash(es), test results, any deviations from the spec
and why, any follow-up items.
```
