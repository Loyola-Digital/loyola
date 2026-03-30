# Epic 10: Expert Funnel Architecture

## Vision

Refatorar a estrutura de projetos para suportar **Funis** dentro de cada Expert (projeto). Cada funil vincula uma campanha específica do Meta Ads e tem dashboard próprio baseado no tipo: **Lançamento** ou **Perpétuo**.

Instagram permanece no nível do projeto (fora dos funis).

## Structure

```
Expert (Projeto)
├── Funil A (tipo: lançamento) → Campanha "BF_2026"
│   └── Dashboard Lançamento
├── Funil B (tipo: perpétuo) → Campanha "EVERGREEN_X"
│   └── Dashboard Perpétuo
├── Instagram (global do expert)
└── Conversations
```

## Stories

| Story | Title | Priority | Estimate |
|-------|-------|----------|----------|
| 10.1 | Schema & API — Funnels | P0 | M |
| 10.2 | Campaign Picker — Listar campanhas para vincular | P0 | S |
| 10.3 | Funnel Creation Wizard | P1 | L |
| 10.4 | Sidebar — Funis por Projeto | P1 | M |
| 10.5 | Dashboard Lançamento | P1 | L |
| 10.6 | Dashboard Perpétuo | P1 | L |
| 10.7 | Traffic Hooks — Filtro por Campanha | P0 | M |

## Dependencies

- Epic 6 (Meta Ads Traffic) — conta Meta Ads já conectada
- Epic 7 (Traffic Analytics) — hooks de dados existentes
- Epic 4 (Multi-Project) — estrutura de projetos

## Key Decisions

- "Expert" = Projeto existente (não cria nova entidade)
- Funil é uma entidade nova vinculada a project + campaign
- Dashboard muda completamente baseado no tipo do funil
- Instagram fica no nível do projeto, não do funil
