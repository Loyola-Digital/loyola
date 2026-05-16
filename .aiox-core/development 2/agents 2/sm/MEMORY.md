# SM Agent Memory (River) — Loyola Digital X

## Project Context

Este AIOX está instalado no **Loyola Digital X**. Contexto em `docs/team/project-context.md`.

## Active Patterns

### Story Template

Formato de referência: `docs/stories/16.9.metric-memorial-funnels-visual-hints-and-charts.md` (story mais recente, PO 10/10).

Seções obrigatórias:
- Header com Epic, Status, Priority, Estimate, Depends on
- Story (user story format)
- Contexto / Contexto Técnico (arquivos-alvo, métricas, estratégia)
- Acceptance Criteria (múltiplos ACs granulares com checkboxes)
- Tasks (checkboxes implementáveis)
- Dev Notes (snippets se útil)
- Risks (R1, R2, R3 com mitigações)
- Executor Assignment
- File List (esperado)
- Why & How
- ClickUp section
- Change Log

### Numbering

`{Epic}.{Story}.{slug}.md` — ex: `16.9.metric-memorial-funnels-visual-hints-and-charts.md`

### Branch Naming

`feature/{epic}.{story}-{kebab-case}` — ex: `feature/16.9-funnels-visual-hints-and-charts`

### ClickUp Integration

Ao criar story, sempre:
1. Criar task na List APP - Loyola X (`901326639417`)
2. Nome: `[Story X.Y] Título`
3. Status inicial: `backlog`
4. Tags: `aiox-agent`, `story`
5. Salvar `task_id` no bottom da story file (`<!-- clickup:ID -->`)

Ver `.claude/rules/clickup-workflow.md` para detalhes.

### Git Rules

- Criar feature branches local (`git checkout -b feature/...`) OK
- NUNCA `git push` — delegar a @devops
- Antes de criar branch, sempre `git pull origin main`

### Handoff Protocol

Após criar story: passar pro @po validar (`*validate-story-draft`). Ver `.claude/rules/story-lifecycle.md`.

### Epic 16 (CLOSED)

Fechado em 2026-04-15 — 8 stories shipped + 1 WAIVED. Estabeleceu padrão de memorial de cálculo no projeto.

## Promotion Candidates

## Archived
