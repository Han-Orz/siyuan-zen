# TODO — Known Issues

> Discovered during user testing on 2026-06-30 (after commit 58d20f6).
> All 4 issues are related to Plan 6 (cursor edge interaction).

## [TODO-1] Initial cursor position transition is janky

**Symptom**: When the plugin loads or the cursor element is first created, the cursor visibly "whooshes" from the viewport edge to the current caret position.

**Likely cause**: 
- `createCursorElement()` initializes the cursor with `transform: translate3d(-9999px, -9999px, 0)` to hide it offscreen
- First `doUpdateCursor()` sets the actual position
- The `isFirstMove` flag is supposed to suppress the transition for the first move, but either:
  - The flag is being cleared too early
  - Or there's a race between the offscreen-init and the first update
  - Or Fade+Scale (Commit 1) overwrote the `isFirstMove` logic

**Fix direction**: Investigate `createCursorElement` + `isFirstMove` lifecycle. May need to add `.no-transition` class for the first 2-3 frames.

## [TODO-2] Edge arrow indicator not needed

**Decision**: Revert the edge arrow indicator feature (Plan 6 part 3, currently in commit 58d20f6).

**Rationale**: User tested and feels the arrow adds visual noise without clear value. The fade+scale already conveys "cursor is off-screen" effectively.

**How to revert**: 
- Option A: `git revert 58d20f6` (loses squish/bounce too — they're combined in this commit)
- Option B: Manually extract arrow code from current working tree and delete it, then split Commit 3 into Commit 2 (squish/bounce) + Commit 3 (arrow-only-then-revert) — too much work
- Option C: Accept current state (squish/bounce + arrow combined), add `enabled: boolean` config flag for arrow and default to OFF — easiest

**Recommendation**: Option C. Add `EDGE_ARROW.ENABLED: false` to config, hide arrow div by default.

## [TODO-3] Edge definition too loose — animation triggers too early

**Symptom**: The fade/scale/squish/bounce animations trigger when the caret is at the last visible line, before the caret actually scrolls off-screen.

**Current behavior**: `FADE_ZONE = 60px` — animation starts 60px from the viewport edge. User finds this too aggressive.

**Desired behavior**: Edge animation should only trigger when caret is within 15-20px of the viewport edge (very close to being off-screen).

**Fix direction**: 
- Reduce `FADE_ZONE` from 60px to ~30px (so animation finishes at 30px from edge, rather than 60px)
- OR add a separate `EDGE_TRIGGER_THRESHOLD` (~15-20px) that gates whether any animation starts at all
- Recommend the threshold approach — keeps fade zone smooth but only animates near the edge

## [TODO-4] Scroll direction asymmetry

**Symptom**: Scrolling UP triggers the edge animation (fade/scale/squish/bounce), but scrolling DOWN does not.

**Likely cause**: 
- The `currentEdge` / edge detection logic uses `rect.y < 0` (above viewport) vs `rect.y > viewport.height` (below viewport) 
- One of these conditions may have a sign error or off-by-one
- Or the boundary check in `doUpdateCursor` is rejecting the "below viewport" case earlier than the "above viewport" case

**Fix direction**: Add unit-test-style logging to `doUpdateCursor` for both scroll directions. Compare `rect.y` vs viewport bounds and `currentEdge` assignment.

---

## Priority order
1. TODO-1 (janky initial) — most visible, fix ASAP
2. TODO-4 (asymmetry) — correctness bug, fix ASAP
3. TODO-3 (edge too loose) — UX tuning, fix soon
4. TODO-2 (arrow disabled) — easy config flag, defer

## Next session plan
- Investigate TODO-1 and TODO-4 together (both in `doUpdateCursor` lifecycle)
- Tune TODO-3 by reducing FADE_ZONE
- Add `EDGE_ARROW.ENABLED: false` for TODO-2
- Land as separate commits for clean rollback
- Update TESTING_GUIDE_v2.2.0.md with new test scenarios
