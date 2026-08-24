---
name: commit-qa-gate-before-pr
description: QA gate YAMLs under docs/qa/gates/ are version-controlled here, but @qa often leaves them untracked — check and commit the gate before opening the PR
metadata:
  type: feedback
---

Every QA gate in `docs/qa/gates/*.yml` is tracked in this repo (43.x, 44.x, etc. are all committed). But @qa frequently writes the gate file and never stages it, so it shows up as untracked when @devops arrives.

**Why:** The PR body references the gate by path as the evidence for the CONCERNS/PASS verdict. If the gate is untracked, a reviewer clicking that path on GitHub finds nothing, and the story's QA trail is lost on merge. Hit on Story 44.12 — `docs/qa/gates/44.12-produtor-de-cobertura-diaria.yml` was untracked at PR time.

**How to apply:** Before pushing, run `git status --short -- docs/qa/gates/` . If the current story's gate is untracked, stage just that file and commit it as `docs(qa): gate {story} — {verdict}, ... [Story X.Y]`. Do not sweep in the neighbouring `" 2"` duplicates — see [[never-stage-sync-artifacts]].
