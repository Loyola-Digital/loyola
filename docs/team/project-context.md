# Loyola Digital X — Project Context

Este documento é a fonte versionada de contexto do produto. A IA do AIOX carrega este arquivo automaticamente ao trabalhar no repo, e qualquer integrante do time (ver `members.md`) herda esse conhecimento ao clonar.

> **Nota:** memórias pessoais do Claude Code (preferências individuais) NÃO vêm neste arquivo — elas vivem em `~/.claude/` de cada dev. Aqui fica apenas o que vale pro projeto inteiro.

---

## O que é Loyola Digital X (Central de Mentes)

Plataforma web interna da Loyola Digital para que funcionários acessem 27+ **minds clonadas** (squads de especialistas em persona completa via AI), deleguem tarefas ao ClickUp, e operem dashboards unificados de:

- **Instagram** (engajamento, alcance, métricas orgânicas)
- **Meta Ads** (tráfego pago)
- **Google / YouTube Ads**
- **Vendas** (via Google Sheets com column_mapping customizado)
- **Funis** (tipo `launch` ou `perpetual`, agregam Meta + Google Ads + CRM)
- **Conversas** (persistidas em DB, streaming SSE)

**Status:** Em desenvolvimento ativo, produto em produção com iteração contínua.

---

## Arquitetura (decisões estáveis — não mudar sem discussão)

- **Monorepo:** Turborepo + pnpm
  - `packages/web` — Next.js 15 App Router
  - `packages/api` — Fastify 5
  - `packages/shared` — tipos e helpers compartilhados
- **Frontend:** Next.js 15 App Router + Tailwind v4 + shadcn/ui + zustand 5
- **Backend:** Fastify 5 + PostgreSQL (hosted no Railway) + Drizzle ORM
- **Auth:** Clerk
- **LLM:** Anthropic SDK direto (claude-sonnet-4-6), streaming via SSE
- **Task Management:** ClickUp API v2 — List `APP - Loyola X` id `901326639417`
- **Hosts:** Vercel (web) + Railway (api)

---

## Domínios principais

| Entidade | Tabela(s) | Notas |
|----------|-----------|-------|
| **Minds** | registry em filesystem | loaded por mind-engine, avatar via `avatarUrl` |
| **Projects** (UI: "Empresas") | `projects`, `project_members` | many-to-many com contas Instagram/Meta/Google/YouTube |
| **Conversations / Messages** | `conversations`, `messages` | streaming SSE, persistência em DB |
| **Funnels** | `funnels`, `funnel_campaigns` | type `launch` \| `perpetual`; agregam Meta + Google Ads |
| **Sales** | — | Google Sheets via `column_mapping` customizado |

> **UI convention:** em pt-BR, usamos **"Empresa"** (nunca "Projeto") ao se referir à entidade `Project`.

---

## Epics importantes

Os epics vivem em `docs/stories/EPIC-*.md`. Marcos atuais:

| Epic | Escopo | Status |
|------|--------|--------|
| Epic 1 | MVP | done |
| Epic 10 | Funnel architecture | done |
| Epic 14 | Google Sheets · Pesquisas de Funil | done |
| Epic 16 | Memorial de Cálculo em Dashboards | **CLOSED** (2026-04-15) |

### Epic 16 — Highlights (referência pra quem trabalha em tráfego)

Toda métrica numérica dos dashboards tem **tooltip de memorial ao hover** mostrando fórmula + valores que entraram + fonte. Componentes:

- `packages/web/components/metrics/<MetricWithTooltip>` — wrapper completo
- `packages/web/components/metrics/<MetricTooltip>` — wrapper-only (passthrough se `formula=undefined`)
- `packages/web/components/metrics/<FormulaChartTooltip>` — tooltip Recharts com lookup `formulasByKey[dataKey] ?? formula`

Factories puras por domínio em `packages/web/lib/formulas/`:
- `instagram.ts` (10 factories)
- `meta-ads.ts` (14)
- `youtube-ads.ts` (12)
- `sales.ts` (11)
- `funnels.ts` (19 — inclui helpers cross como `enrichFormulaForEntity`, `buildFunnelStageFormula`, `buildFunnelStageConversionFormula`)

**Padrão ao criar nova métrica num dashboard:** SEMPRE envolver o card/valor com `<MetricTooltip>` e passar `formula` vinda de uma factory pura. Nunca construir `MetricFormula` inline sem factory.

---

## Integrações externas (quem precisa saber)

- **Meta Ads Graph API** — tráfego pago (Meta/Facebook Ads) → routes em `packages/api/src/routes/meta-ads.ts`
- **Google Ads API** — campanhas Google
- **YouTube Data/Analytics API** — YouTube Ads
- **Google Sheets API** — vendas, pesquisas
- **Instagram Graph API** — métricas orgânicas
- **Clerk** — autenticação
- **ClickUp API v2** — tarefas do time (ver `.claude/rules/clickup-workflow.md`)

---

## Regras de negócio relevantes

1. **Launch vs Perpetual** — ao trabalhar em funis ou dashboards de tráfego, sempre considere os dois modos separadamente. Launch tem datas fixas, Perpetual é rolling window.
2. **Filtros de campanhas** — funis filtram por conjuntos de `campaignIds`; se vazio, mostrar `EmptyState`.
3. **Divisão por zero** — factories de fórmula devem retornar `undefined` (o `<MetricTooltip>` faz passthrough).
4. **Período em pt-BR** — datas exibidas como `dd/MM` ou intervalo `20/03 — 17/06`.

---

## GitHub

- **Remote:** `origin` → `https://github.com/Loyola-Digital/loyola.git`
- **Branch principal:** `main` (protegida — ver `docs/team/collaboration.md`)
- **Fluxo:** feature branch + PR + squash merge

---

## Onde aprender mais

- `docs/stories/` — todas as stories (passadas e em andamento)
- `docs/qa/gates/` — gate files de cada story (padrão de qualidade do projeto)
- `docs/team/members.md` — quem faz o quê
- `docs/team/collaboration.md` — fluxo git
- `.claude/rules/` — regras da IA (carregadas automaticamente)
