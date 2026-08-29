---
name: loyola-pr-conventions
description: PR conventions for this repo — conventional-commit title + [Story X.Y] suffix, narrative Portuguese body, main is PR-protected, no force push
metadata:
  type: reference
---

Conventions verified against merged PRs (`gh pr list --state merged --limit 5`) as of 2026-08-19:

- **Title:** conventional commit, no scope, em-dash subtitle, `[Story X.Y]` suffix. Example: `feat: aba Cadeia de CAC — a primeira superfície visível do Epic 44 [Story 44.9]`.
- **Body:** narrative Portuguese, findings-first. Sections use `##` headers that state a *conclusion*, not a label ("O plano combinado teria produzido efeito ZERO", not "Summary"). Code blocks for reproduced evidence, tables for measured results, `⚠️` for caveats the reviewer must not miss, and a closing `## ⚠️ Depois do merge` for deploy consequences. Footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Branch protection:** `main` requires a PR; direct push is blocked. Feature branches push normally with `git push -u origin <branch>` — **no force push** here (the `git push -f origin main` rule in the DevOps spawn prompt belongs to the separate /app Vercel repo, not this one).
- **CI on PR:** `lint`, `typecheck`, `test` (GitHub Actions) plus Vercel preview deploy.
- **ClickUp:** stories carry `<!-- clickup:{task_id} -->` at the bottom of the story file. Move the card to `done` **on PR creation**, with a comment carrying the PR URL — that is what `.claude/rules/clickup-workflow.md` specifies for @devops ("*push / PR criado") and what the Story 45.1 spawn asked for. An earlier note here said to wait for the merge; that was wrong. The flow is unidirectional, so `done` is terminal — put everything the card still needs (pending visual validation, open findings) in the comment, not in a later status change.

See also [[loyola-api-deploy-is-manual-and-lags]].
