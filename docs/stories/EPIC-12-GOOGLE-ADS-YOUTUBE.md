# EPIC-12: Google Ads / YouTube Ads Integration

## Objetivo

Integrar contas de anuncio do Google Ads (YouTube Ads) ao Loyola X, permitindo conectar contas, visualizar metricas de campanhas de video e analisar performance de criativos do YouTube — seguindo o mesmo padrao ja estabelecido pelo Meta Ads (Epic 6-8).

## Contexto

YouTube Ads sao gerenciados pelo Google Ads API. A autenticacao sera por token manual (Developer Token + OAuth refresh token), mesmo padrao do Meta Ads atual. O dashboard seguira a mesma estrutura visual e UX do dashboard de trafego existente.

## Metricas Chave

| Metrica | Campo Google Ads | Descricao |
|---------|-----------------|-----------|
| Investimento | metrics.cost_micros | Gasto total (convertido de micros) |
| Visualizacoes | metrics.video_views | Views do video |
| CPV | cost / views | Custo por view |
| View Rate | views / impressions | Taxa de visualizacao |
| Impressoes | metrics.impressions | Total de impressoes |
| Cliques | metrics.clicks | Cliques no CTA/link |
| CTR | metrics.ctr | Click-through rate |
| CPC | metrics.average_cpc | Custo por clique |
| CPM | metrics.average_cpm | Custo por mil impressoes |
| Conversoes | metrics.conversions | Acoes de conversao |
| Custo/Conversao | metrics.cost_per_conversion | Eficiencia de conversao |
| Retencao 25% | metrics.video_quartile_p25_rate | % que assistiu 25% |
| Retencao 50% | metrics.video_quartile_p50_rate | % que assistiu 50% |
| Retencao 75% | metrics.video_quartile_p75_rate | % que assistiu 75% |
| Retencao 100% | metrics.video_quartile_p100_rate | % que assistiu 100% |

## Stories

| # | Story | Descricao |
|---|-------|-----------|
| 12.1 | Settings: Conectar conta Google Ads | Schema DB, API routes, UI em /settings/google-ads |
| 12.2 | Dashboard: KPIs + grafico diario | Cards de metricas + line chart spend/views |
| 12.3 | Dashboard: Tabela de campanhas com drill-down | Campaign > Ad Group > Ad com metricas |
| 12.4 | Dashboard: Galeria de criativos YouTube | Thumbnails dos videos + lightbox com player |

## Dependencias

- Google Ads API v18 (REST)
- Autenticacao: Developer Token + Customer ID + Refresh Token (manual)
- Padrao existente: Meta Ads (Epic 6-8) como referencia de arquitetura

<!-- clickup:86agp6yne -->
## Status: Draft
