---
name: line-refs-drift-validation
description: When validating stories with file:line refs, verify structure existence via grep, not exact line numbers — merges shift lines
metadata:
  type: feedback
---

During anti-hallucination checks (Artigo IV), treat `file.tsx:NNN` references in stories as pointers to structures, not exact coordinates.

**Why:** Stories in this repo are drafted from direct user requests and cite line numbers that drift when parallel branches merge (e.g., 18.57 cited pre-18.56-merge positions; post-merge they matched within 1 line, but the lead explicitly instructed tolerance). What matters is that the named component/block/prop exists where described.

**How to apply:** Grep for the symbol names (component, prop, condition like `subtype === "capture"`), read the surrounding block, and confirm the structure. Log verified positions in the Change Log so @dev has fresh coordinates. Also check ALL call sites of any component gaining a new prop (grep `<ComponentName`), not just the ones the story lists — sales-stage-view.tsx had 3 StageSalesSection call sites plus lookalike StageSalesSpreadsheetSection usages that could confuse a quick reader.
