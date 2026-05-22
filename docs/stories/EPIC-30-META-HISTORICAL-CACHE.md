# Epic 30 — Meta Historical Cache

**Status:** Approved
**Owner:** @pm (Morgan) / @dev (Dex)
**Criado em:** 2026-05-22
**Estimativa:** 8 pts (2 stories)

## Goal

Permitir que dashboards do Loyola exibam histórico de **até 365 dias** de campanhas Meta — especialmente perpetuals que rodam há meses/anos —, com o cache DB segurando tudo pra consultas instantâneas. Hoje, os routes limitam `?days≤90` e o cache só é populado on-demand do que o user pediu. Pra um perpetual de 1 ano, o histórico nunca foi puxado.

## Por que agora

1. Lucas pediu — perpétuos da Loyola rodam há mais de 90 dias e dashboards "no tempo" ficam capados.
2. Schema `meta_campaign_insights_daily` (Story 18.26 Fase 3) já existe e tem TTL infinito pra dias antigos — só falta popular e expor.

## Escopo (IN)

- Aumentar max de `days` de 90 → 365 nas rotas que tocam insights diários de campanha
- Chunked fetch: quando range > 90 dias, splitter automático em chunks de 90 dias, paralelo, upsert no cache
- Background sync ao vincular nova campanha a um funnel: dispara lifetime backfill (365 dias retroativos) fire-and-forget
- Frontend: DayRangePicker ganha presets até 365 dias

## Escopo (OUT)

- Sync de `meta_ad_insights_daily` (granularidade por ad) — fica pra epic futuro (Lucas autorizou só campaign-level por ora)
- Sync histórico de adsets — não pedido
- Job queue/worker formal (Bull, BullMQ) — fire-and-forget no event loop é suficiente pro volume atual
- UI de progresso do background sync — invisível pro user (cache "frio" cai pro fetch on-demand)
- Períodos > 365 dias — limite intencional (Meta API tem teto histórico próprio)

## Stories

| # | Story | Pts | Depende de |
|---|---|---|---|
| 30.1 | Chunked fetch + max 365 dias | 5 | — |
| 30.2 | Background sync ao vincular campanha | 3 | 30.1 |

## Métricas de sucesso

- Dashboard perpetual com range "365 dias" responde em <2s na 2ª consulta (já cacheada)
- 1ª consulta de range grande retorna sem erro (chunks de 90d) em <30s
- Vincular campanha nova → 30s depois cache já está populado com lifetime

## Change Log

| Data | Quem | Mudança |
|---|---|---|
| 2026-05-22 | @pm Morgan | Epic criado |
