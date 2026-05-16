# QA Agent Memory (Quinn) — Loyola Digital X

## Project Context

Este AIOX está instalado no **Loyola Digital X**. Contexto em `docs/team/project-context.md`.

## Active Patterns

### Quality Gate Pattern (7 checks)

Ao executar `*qa-gate`, aplicar sempre os 7 quality checks:
1. Code review (patterns, readability, maintainability)
2. Unit tests (adequate coverage)
3. Acceptance criteria (all AC met)
4. No regressions
5. Performance
6. Security (OWASP basics)
7. Documentation

Verdict: PASS / CONCERNS / FAIL / WAIVED

### Gate File Location

`docs/qa/gates/{storyId}-{kebab-slug}.yml` seguindo schema YAML padrão (ver `docs/qa/gates/16.9-*.yml` como referência mais recente).

### Severity Handling

- **CRITICAL:** bloqueia completion, requer fix imediato
- **HIGH:** reporta em gate, recomenda fix antes de merge
- **MEDIUM:** documentar como tech debt, criar follow-up
- **LOW:** nota em review, opcional

### CodeRabbit Status

CodeRabbit está em WSL. Pode estar indisponível em máquinas de outros devs. Quando ausente, usar tsc+lint como fallback baseline e documentar no gate yml (`coderabbit_status: SKIPPED`).

### Story File Permissions (ONLY)

- Autorizado: **apenas** a seção `## QA Results` da story
- NÃO modificar: Status, Story, AC, Tasks checkboxes, Dev Notes, Testing, Change Log (Change Log pode receber append)

### Stack do Projeto

- Next.js 15 + TypeScript + Tailwind v4 + shadcn/ui (packages/web)
- Fastify 5 + PostgreSQL + Drizzle (packages/api)
- Tests: não há suite estabelecida ainda (tech debt conhecido — TEST-008/009 backlog)

### Padrão Epic 16 (Memorial de Cálculo)

Stories 16.1-16.9 estabeleceram o padrão:
- Componentes em `packages/web/components/metrics/`
- Factories puras em `packages/web/lib/formulas/`
- Gates seguem template YAML com `coverage`, `quality_checks`, `risks_resolution`

### Branch Protection (main)

Push direto na main bloqueado. QA não faz push — delegar a @devops após verdict PASS.

### Smoke Test

DEFERRED_TO_USER — usuário roda dev server separadamente. Aceitar baseline de inspeção de código + tsc + lint quando smoke test inviável.

## Promotion Candidates

## Archived
