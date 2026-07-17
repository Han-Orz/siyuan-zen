# Documentation consistency review

## Goal

Bring user-facing and maintainer-facing documentation into agreement with the v2.6.3 source tree, without changing plugin behavior, release artifacts, or historical release records.

## Source of truth

- `package.json` and `plugin.json` establish the released version: `2.6.3`.
- `src/modules/inputMode.ts` establishes the initial mode state: smooth cursor is independent; typewriter mode and ripple focus both start off and are enabled together by text input or IME completion.
- The current `src/` tree establishes module locations and names.

## Changes

1. Update both READMEs to describe the initial state and the activation trigger accurately, using equivalent Chinese and English wording.
2. Update `docs/DESIGN.md` to v2.6.3 and reconcile its module tree, module references, and version appendix with the current source layout.
3. Review `docs/CHANGELOG.md` and `docs/TODO.md` for contradictory current-version or release-status wording. Preserve completed history and only correct present-tense status or cross-references.
4. Check README links, documented configuration names, and Chinese/English section parity. Correct factual discrepancies only; do not add features or rewrite product copy unnecessarily.

## Verification

- Search the affected documents for stale `v2.6.2` current-version assertions, the obsolete `cursor/boundary.ts` path, and the old "all features enabled by default" claim.
- Compare documented configuration identifiers against `src/config.ts`.
- Review the final diff and run the project build because only documentation should change and the existing build must remain unaffected.

## Non-goals

- No TypeScript, SCSS, build, package, tag, release, marketplace, or branch changes.
- No alteration of release-history facts.
