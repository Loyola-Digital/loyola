# EPIC-13: YouTube Organic Analytics

## Objetivo

Integrar dados organicos do YouTube ao Loyola X, permitindo conectar canais do YouTube e visualizar metricas de performance organica (views, watch time, inscritos, engajamento) — complementando os dados pagos do Epic 12 (Google Ads/YouTube Ads).

## Contexto

YouTube organico usa duas APIs:
- **YouTube Data API v3** — listar videos, thumbnails, metadados do canal
- **YouTube Analytics API** — metricas de performance (views, watch time, retencao, origens)

Autenticacao via OAuth2 (reaproveitando o flow do Google Ads, adicionando scopes `youtube.readonly` e `yt-analytics.readonly`).

## Metricas Chave

| Metrica | API | Campo |
|---------|-----|-------|
| Views | Analytics | views |
| Watch Time (horas) | Analytics | estimatedMinutesWatched / 60 |
| Inscritos ganhos | Analytics | subscribersGained |
| Inscritos perdidos | Analytics | subscribersLost |
| Likes | Analytics | likes |
| Comentarios | Analytics | comments |
| Shares | Analytics | shares |
| CTR de Impressao | Analytics | annotationClickThroughRate |
| Impressoes | Analytics | impressions |
| Retencao media | Analytics | averageViewPercentage |
| Origens de trafego | Analytics | insightTrafficSourceType (dimension) |
| Top videos | Data API + Analytics | video list + metrics per video |
| Demographics | Analytics | ageGroup, gender (dimensions) |

## Stories

| # | Story | Descricao |
|---|-------|-----------|
| 13.1 | Settings: Conectar canal YouTube | OAuth com scope youtube, listar canais, salvar |
| 13.2 | Dashboard: Overview do canal | Inscritos, views, watch time, top videos |
| 13.3 | Dashboard: Analytics por video | Metricas individuais, retencao, origens trafego |
| 13.4 | Integracao no projeto + sidebar | YouTube organico dentro de Social (ao lado do Instagram) |

## Dependencias

- YouTube Data API v3
- YouTube Analytics API v2
- OAuth2 (reaproveitando credenciais do Google Ads — mesmo Client ID/Secret)
- Scopes adicionais: `youtube.readonly`, `yt-analytics.readonly`

## Status: Draft
