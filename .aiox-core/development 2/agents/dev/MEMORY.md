# Dev Agent Memory (Dex) — Loyola Digital X

## Project Context

Este AIOX está instalado no **Loyola Digital X** — plataforma web interna da Loyola Digital. Contexto completo em `docs/team/project-context.md` (leitura obrigatória ao ativar).

## Active Patterns

### Stack Real do Projeto

- **Monorepo:** Turborepo + **pnpm** (NÃO npm). Workspaces em `packages/web`, `packages/api`, `packages/shared`
- **Frontend:** **Next.js 15 App Router** + **TypeScript** (ESM, NÃO CommonJS) + Tailwind v4 + shadcn/ui + zustand 5
- **Backend:** Fastify 5 + PostgreSQL (Railway) + Drizzle ORM
- **Auth:** Clerk
- **LLM:** Anthropic SDK direto (claude-sonnet-4-6) com SSE streaming
- **Hosts:** Vercel (web) + Railway (api)

### Convenções de Código

- TypeScript estrito — evitar `any`, usar `satisfies` quando útil
- ESM imports (`import ... from`) — o repo é puro ESM
- **Absolute imports** via `@/` (ex: `@/components/metrics/metric-tooltip`) — ver `tsconfig.json`
- kebab-case pra nomes de arquivo (`metric-tooltip.tsx`, `use-traffic-analytics.ts`)
- PascalCase pra componentes React
- Tailwind classes inline — se ficar grande, `cn()` de `@/lib/utils` pra compor condicionais
- Usar `"use client"` no topo de componentes client-side

### Comandos Comuns (pnpm)

- `pnpm --filter @loyola-x/web dev` — subir frontend
- `pnpm --filter @loyola-x/api dev` — subir API
- Typecheck: `cd packages/web && npx tsc --noEmit` (ou no `packages/api`)
- Lint: `cd packages/web && npx next lint`
- NUNCA iniciar dev server sem autorização explícita do usuário (ele roda em paralelo)

### Git Rules

- NEVER push — delegar a @devops (ele é o único autorizado)
- `git commit` local permitido
- Branch protection ativa em `main` — push direto bloqueado
- Conventional commits: `feat(scope):`, `fix(scope):`, `docs(scope):` etc
- Referenciar story: `feat(web/funnels): X [Story Y.Z]`

### Story Workflow (Epic 16 é padrão de referência)

- Read task → Implement → Typecheck + Lint → Marcar checkbox `[x]`
- ONLY update: Tasks checkboxes, File List, Change Log, Status
- NEVER modify: Story, AC, Dev Notes, Testing sections
- CodeRabbit self-healing: max 2 iterações antes de Ready for Review (skip se binário indisponível, documentar)

### Padrões do Epic 16 (Memorial de Cálculo — CLOSED)

Ao criar nova métrica em qualquer dashboard:
- **SEMPRE** envolver valor com `<MetricTooltip label={...} value={...} formula={factory(...)}>`
- Factory **pura** em `packages/web/lib/formulas/{domain}.ts` que retorna `undefined` em divisão por zero
- Pra gráficos Recharts: `<Tooltip content={<FormulaChartTooltip />} />` com `formulasByKey` ou `formula` no datapoint
- Pra visual hint que é hover-able: `cursor-help` + `underline decoration-dotted decoration-muted-foreground/40 underline-offset-4`

### Gotchas Conhecidos

- Windows: usar forward slashes em paths de código, bash shell (não cmd)
- CodeRabbit está em WSL — binário em `~/.local/bin/coderabbit`; pode estar indisponível em máquinas de outros devs → usar tsc+lint como fallback documentado
- Perpetual vs Launch: funis têm MODO (`launch` | `perpetual`), dashboards divergem — sempre tratar separadamente
- `MetricFormula` NÃO precisa campo `entityName` — usar `note` enriquecido via `enrichFormulaForEntity` (padrão 16.8)
- UI em pt-BR: "Empresa" (não "Projeto") ao se referir à entidade `Project`

### ClickUp Integration

List APP - Loyola X: `901326639417`. Ver `.claude/rules/clickup-workflow.md` — cada fase do story cycle atualiza status da task no ClickUp.

## Promotion Candidates
<!-- Patterns vistos em 3+ agentes — candidatos a CLAUDE.md -->

## Archived
<!-- Patterns antigos mantidos como história -->
