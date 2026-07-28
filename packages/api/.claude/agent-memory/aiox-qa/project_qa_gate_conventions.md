---
name: qa-gate-conventions-loyola
description: Loyola repo QA gate conventions — extended gate YAML schema, standing waivers (coderabbit/TEST-001), Meta API rate-limit check, status update authority
metadata:
  type: project
---

QA gates in this repo follow an extended YAML schema beyond the minimal qa-gate template (see `docs/qa/gates/18.56-lp-links-manual.yml` as canonical example): `coverage` (per-AC PASS), `quality_checks` (the 7 checks), `anti_hallucination` (each code claim verified with file:line), `technical_gates`, `meta_api_impact`, `blast_radius`, `commit`, `branch`, `coderabbit_status`, `recommended_action`.

**Why:** the team uses gates as audit artifacts (PO does anti-hallucination passes too); a minimal gate would be rejected as incomplete.

**How to apply:**
- `coderabbit_status: SKIPPED` is standing practice — the CLI is WSL/Windows-only and this environment is macOS (pattern since 18.54).
- `TEST-001` (no vitest/jest in packages/web) is an inherited low debt cited in every web gate — never a blocker, always documented.
- EVERY gate must confirm `meta_api_impact.adds_meta_calls: NO` — team directive on Meta API rate limits; check that `packages/api` has zero diff or that no new sync/fetch to Meta is introduced.
- On PASS/CONCERNS, @qa updates story Status InReview → **Done** AND appends a Change Log row, in addition to the QA Results section (story-lifecycle rule overrides the generic "QA Results only" constraint).
- ClickUp: PASS → PUT status "ready to ship" + comment; FAIL → "in progress" + comment. Task id lives in story as `<!-- clickup:ID -->`. Token in `.claude/rules/clickup-workflow.md`.
- Technical gate: `cd packages/web && npx tsc --noEmit` (run it yourself); `next build` SKIPPED if dev validated and no concrete suspicion.
- Gate file naming: `docs/qa/gates/{epic}.{story}-{slug}.yml`, slug in kebab-case.
