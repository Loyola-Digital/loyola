# Epic 31 — Sprint Dashboard (ClickUp Integration)

**Status:** Approved
**Owner:** @pm (Morgan)
**Criado em:** 2026-05-26
**Estimativa:** 22 pts (6 stories — MVP)

---

## Goal

Substituir o processo manual "alguém manda no docs e pede pra virar dashboard de sprint" por uma **área global no app Loyola X** onde qualquer usuário não-guest monta e visualiza um dashboard configurável de sprint, integrado com ClickUp (pull dos dados + write-through das atualizações de status).

Modelo visual: `dashboard_sprint_v4.html` (3 views: Visão Geral / Timeline / Ações da Semana). MVP entrega **só Visão Geral**.

## Por que agora

1. Lucas pediu — processo manual é gargalo, time pede dashboard várias vezes por semana.
2. Toda a infra ClickUp já existe (MCP integration validado nas últimas sessões — `clickup_get_workspace_hierarchy` mapeou os 10 spaces, padrão `[CODIGO-TIPO-MES/ANO]` por folder de lançamento, listas por fase).
3. Já temos token Meta da Loyola no `.env` (mesma máquina) — token ClickUp também (`CLICKUP_API_TOKEN`).

## Escopo (IN — MVP)

- Área `/sprint-dashboard` global no app, **guest-blocked** (membro do projeto Loyola)
- 1 dashboard compartilhado por toda a Loyola (não há multi-dashboard nem permissões granulares)
- Builder UI: selecionar N listas/folders do ClickUp + por bloco definir filtros (status/tag/assignee) + agrupamento + cor + título
- View **Visão Geral**: cards de projeto com fases agregadas + métricas-resumo no header
- Pull on-demand do ClickUp com cache DB de 5min
- Write-through: toggle status no Loyola → `PUT` task status no ClickUp na hora

## Escopo (OUT — v2 futuro)

- View **Timeline (Gantt)** — visual complexo, escopo grande
- View **Ações da Semana** — segunda iteração depois de validar Visão Geral
- Webhooks ClickUp → Loyola (real-time bidirecional)
- Multi-dashboard (privado por user + globais + permissões)
- Edição inline de campos da task além do status (nome, due_date, assignee, descrição)
- Criação de tasks novas pelo dashboard

## Stories

| # | Story | Pts | Depende de |
|---|---|---|---|
| 31.1 | Schema + API CRUD `sprint_dashboard_config` (1 row global) | 3 | — |
| 31.2 | API proxy ClickUp — leitura `/clickup/tasks-from-lists` (cache DB 5min) | 5 | 31.1 |
| 31.3 | API proxy ClickUp — write-through `PUT /clickup/task/:id/status` | 2 | 31.1 |
| 31.4 | UI página `/sprint-dashboard` guest-blocked + render cards Visão Geral | 5 | 31.2 |
| 31.5 | Builder UI — list picker + filtros + agrupamento + cor/título | 5 | 31.1, 31.4 |
| 31.6 | Métricas-resumo do header (eventos próximos + projetos ativos) | 2 | 31.2 |

## Dependências externas

- **`CLICKUP_API_TOKEN`** (já existe no `.env` da API — usado pelo serviço Pedro Valério das rules atuais)
- Workspace ID: `9013556102`, Space Loyola: `901313244000`, List APP Loyola X: `901326639417` (mapeados)

## Decisões arquiteturais (Lucas validou)

| Decisão | Escolha | Razão |
|---|---|---|
| Quantos dashboards | 1 global compartilhado | MVP simples, todo mundo na mesma página |
| Sync strategy | Pull on-demand + write-through | Sem webhook, simples, real-time onde importa |
| Configurabilidade | Completa (filtros + agrupamento) | Time tem casos de uso diversos |
| Views MVP | Só Visão Geral | Entrega rápida, valida valor, depois Timeline/Ações |
| Acesso | Não-guests do projeto Loyola | Tela é interna do time, não cliente |

## Métricas de sucesso

- Time da Loyola para de pedir dashboard no docs (uso real ≥ 5 acessos/semana)
- Builder permite montar dashboard de qualquer lançamento em <2min
- Atualização de status no Loyola reflete no ClickUp em <5s
- Cache reduz chamadas ClickUp pra ≤ 12 reads/hora (1 por 5min)

## Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Token ClickUp rotacionado / sem permissão escrita | M | Settings page expõe status de auth + erro claro no UI |
| Rate limit ClickUp (100 req/min/user) | M | Cache 5min + write-through batched se múltiplos toggles |
| User altera status no ClickUp diretamente → dashboard fica stale | L | Refresh manual + auto-refresh a cada 5min |
| Builder com muitas opções confunde user | M | Defaults sensatos + preview ao vivo |

## Change Log

| Data | Quem | Mudança |
|---|---|---|
| 2026-05-26 | @pm Morgan | Epic criado, decisões validadas com Lucas |
