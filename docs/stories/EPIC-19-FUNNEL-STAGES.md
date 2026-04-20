# EPIC-19 — Funnel Stages (Etapas do Funil)

**Status:** In Progress
**Owner:** Lucas / Danilo
**Epic Goal:** Permitir que cada funil seja dividido em **etapas independentes** (ex: "Captação Paga", "Captação Gratuita", "Modelado"). Cada etapa tem sua própria configuração (campanhas Meta, Google Ads, Switchy, planilha de leads, pesquisa Tally) e exibe o dashboard completo com seus próprios dados.

---

## Motivação

Hoje um funil = uma configuração única de campanhas. Na prática, um gestor opera várias frentes dentro de um mesmo funil (pago vs orgânico, diferentes segmentos de público, fases do lançamento). Etapas eliminam a necessidade de criar múltiplos funis para o mesmo produto.

## Histórico de Decisões

- **Navegação:** Funil → Lista de etapas → Clicar na etapa → Dashboard da etapa
- **Retrocompatibilidade:** Funnels existentes recebem automaticamente uma etapa "Principal" na migration, com toda a config atual do funil copiada. Nome editável.
- **Métricas consolidadas:** OUT do escopo inicial. Cada etapa é independente.
- **Reordenação:** OUT do escopo. Etapas listadas por ordem de criação.
- **Planilhas/Pesquisa per-stage:** Story 19.4 (após foundation estar estável).

## Stories

| Story | Título | Status | Depends |
|-------|--------|--------|---------|
| 19.1 | Fundação Backend — DB + API + Migration | Draft | — |
| 19.2 | Web — Navegação de Etapas + CRUD | Draft | 19.1 |
| 19.3 | Web — Dashboard Wired à Etapa | Draft | 19.2 |
| 19.4 | Per-Stage Planilhas e Pesquisa | Draft | 19.3 |

## Arquitetura

```
Funnel (name, type, projectId)
  └── FunnelStage[] (name, metaAccountId, campaigns, googleAdsAccountId,
                     googleAdsCampaigns, switchyFolderIds, switchyLinkedLinks)

Route: /projects/:id/funnels/:funnelId/stages/:stageId
```

O dashboard (LaunchDashboard / PerpetualDashboard) passa a receber `FunnelStage` como config de campanhas em vez de `Funnel`.
