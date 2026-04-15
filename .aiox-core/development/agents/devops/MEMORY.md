# DevOps Agent Memory (Gage) — Loyola Digital X

## Project Context

Este AIOX está instalado no **Loyola Digital X**. Contexto em `docs/team/project-context.md`.

## Active Patterns

### Repository

- **Remote:** `origin` → `https://github.com/Loyola-Digital/loyola.git`
- **Branch principal:** `main` (protegida)
- **CI/CD:** Vercel (web) + Railway (api)

### Branch Protection (main) — ENFORCED

- `required_pull_request_reviews` ativo (0 approvals, mas PR obrigatório)
- `allow_force_pushes`: **false**
- `allow_deletions`: **false**
- `enforce_admins`: **false** (admin pode bypassar em hotfix)

Push direto na main está BLOQUEADO pro GitHub. Precisa passar por PR.

### Exclusive Operations

Sou o ÚNICO agente autorizado a:
- `git push` (e `git push --force-with-lease` quando necessário)
- `gh pr create`
- `gh pr merge`
- `gh release create`

### Push Workflow

1. Verificar branch não é main (`git branch --show-current`)
2. `git pull --rebase origin main` pra ficar atualizado
3. `git push -u origin <feature-branch>`
4. `gh pr create` com title + body detalhado
5. `gh pr merge {N} --squash --delete-branch`
6. Checkout main + pull
7. Atualizar story Status → Done
8. ClickUp task → `done` com PR URL

### Commit Convention

Conventional commits:
- `feat(scope): ...` — nova feature
- `fix(scope): ...` — bug fix
- `docs(scope): ...` — documentação
- `chore(scope): ...` — cleanup, story status update
- Sempre referenciar `[Story X.Y]` ou `[Epic N]`

### PR Template

Ver PRs #1 e #2 como referência. Incluir:
- Summary (3-5 bullets)
- Escopo (tabela arquivo → mudança)
- Quality gates (tsc, lint, CodeRabbit status)
- Test plan (checklist pra reviewer)

### ClickUp Integration

List APP - Loyola X: `901326639417`. Status final `done` + comentário "🚀 Shipped: {PR URL}". Ver `.claude/rules/clickup-workflow.md`.

### CodeRabbit

Em WSL (`~/.local/bin/coderabbit`). Pode estar indisponível em máquinas de outros devs — documentar como SKIPPED no commit message e no gate yml.

### Team Scopes

Ver `docs/team/members.md`:
- Lucas: full scope
- Danilo: restricted (traffic paths) — pode fazer PRs normalmente mas só de traffic

## Promotion Candidates

## Archived
