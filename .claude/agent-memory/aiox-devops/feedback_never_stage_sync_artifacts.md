---
name: never-stage-sync-artifacts
description: Never stage the `" 2"` duplicate files this repo accumulates from file sync — always stage selectively by category, never `git add -A`
metadata:
  type: feedback
---

This working tree chronically accumulates duplicate files with a `" 2"` suffix (e.g. `campaign-attribution 2.ts`, `44.2-connectrate-antes-depois 2.md`) produced by an external file-sync process. They are **never** part of any story. Stage selectively, file by file or by explicit path — never `git add -A`.

**Why:** Story 44.12 shipped a commit (`5a1189be`) declaring 1214 insertions of which ~1120 were sync artifacts swept in by a `git add -A packages/api`. QA opened it as a blocking item (QA-4412-05) and it cost a `git rm` commit (`c25c1164`) plus a gate round-trip. The real hazard was not cosmetic: `campaign-attribution 2.ts` sat inside `src/`, the tsconfig includes `["src"]`, so a stale pre-story copy of the module would have been emitted to `dist/`.

**How to apply:** Before every commit, run `git status --short` and visually reject any path containing `" 2"`. Before opening a PR, confirm with `git diff --name-only origin/main...HEAD | grep " 2"` — it must return nothing. Also leave `.claude/agent-memory/` out of story commits; it is not story scope.

See also [[commit-qa-gate-before-pr]], [[loyola-api-deploy-is-manual-and-lags]].
