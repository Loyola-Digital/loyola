# Loyola Digital X — Mapa de Dados do Funil End-to-End (API Pública para IA)

> **Propósito:** visão unificada de tudo que existe HOJE no código que poderia alimentar uma API pública read-only versionada (`/api/public/.../v1`) para uma IA/MCP consumir o funil inteiro do Loyola X.
>
> **Regra de ouro (Article IV — No Invention):** este documento reporta SOMENTE o que existe de fato no código (services, rotas, tabelas, métricas). Onde um dado NÃO existe ainda, está marcado explicitamente como **GAP**. Nenhum campo/métrica foi inventado.
>
> **Decisão de produto:** a API pública **LÊ DO CACHE**. Por isso, para cada métrica indicamos se já há tabela de cache no banco.
>
> **Fontes:** mapas de 11 domínios do funil + verificação direta no código (`packages/api/src`).
>
> **Data:** 2026-06-18 · **Status:** referência de arquitetura · **Branch base:** `feature/36.2-api-key-auth-middleware`

---

## 1. Estado da infraestrutura de API pública (verificado no código)

A infra do Epic 36 (Stories 36.1 + 36.2) **já está implementada e mergeada**. Verificado em:

| Item | Onde | Estado |
|------|------|--------|
| Tabela `api_keys` | `packages/api/src/db/schema.ts:89-110` | Existe. Campos: `id`, `name`, `keyPrefix`, `keyHash` (SHA-256), `scopes` (jsonb, default `["meta:read"]`), `createdBy`, `lastUsedAt`, `revokedAt`, `createdAt`. Unique index em `keyHash`. |
| Middleware X-API-Key | `packages/api/src/middleware/api-key-auth.ts` | Existe. Hook `onRequest` que protege `/api/public/*`. Valida hash constant-time, bloqueia revogadas, **exige GET/HEAD** (recusa escrita com 405), rate limit **120 req/min por chave** (in-memory), popula `request.apiKey = { id, scopes }`. |
| `requireScope(scope)` preHandler | `packages/api/src/middleware/api-key-auth.ts:44-52` | Existe. Para usar nas rotas: `{ preHandler: requireScope("meta:read") }`. Retorna 403 `SCOPE_REQUIRED` se faltar. |
| Utilidades de cripto de chave | `packages/api/src/services/api-key.ts` | `generateApiKey()`, `hashApiKey()`, `safeCompareHash()`. |
| Rotas admin de chaves (Clerk) | `packages/api/src/routes/api-keys.ts` | `POST/GET/DELETE /api/api-keys` (admin only). |
| **Rotas `/api/public/*`** | — | **GAP — NÃO EXISTEM AINDA.** Apenas o middleware está pronto. Stories 36.3–36.6 ainda em Draft. |

**Convenção de path confirmada (Story 36.3):** o padrão planejado para Meta é `/api/public/meta/v1/...`. Este documento adota o padrão `/api/public/{dominio}/v1/...` para os demais domínios, por simetria.

**Scope (MVP, alinhado à decisão "1 chave pra tudo"):** scope único de leitura pública (`public:read` recomendado) — a chave admin global recebe esse scope e todas as rotas `/api/public/*` usam `requireScope("public:read")`. Granularização por domínio (`sales:read`, `leads:read`...) fica para evolução, se houver acesso por cliente. **Ação:** ajustar o default de `api_keys.scopes` (hoje `["meta:read"]`) e a tela admin (36.1) para o novo scope.

---

## 2. Funil End-to-End do Loyola X

O Loyola X é uma plataforma de inteligência de marketing/vendas para infoprodutos. O "funil" não é uma entidade única; é **reconstruído a partir de domínios** que se cruzam por `projectId`, `funnelId`, `stageId` e por chaves de atribuição (`utm_*`, `ad_id`, `email`, `transactionId`).

**Espinha dorsal estrutural:** `projects` → `funnels` (tipo `launch` | `perpetual`) → `funnel_stages` (tipo `paid` | `free` | `sales` | `cpl`). Stages carregam `campaigns` (Meta) e `googleAdsCampaigns` em JSONB e se ligam a planilhas (`funnel_spreadsheets`, `stage_sales_spreadsheets`, `funnel_surveys`), eventos (Zoom) e snapshots de grupos (WhatsApp).

### Mapa visual (texto)

```
TOFU (Topo)                MOFU (Meio)              BOFU (Fundo)            PÓS-VENDA
─────────────────────────────────────────────────────────────────────────────────────
Meta Ads (alcance)    →    Meta/Google (tráfego)→  Meta/Google (conversão) Hotmart (MRR/LTV)
Google Ads / YouTube  →    Lead scoring A/B/C/D →  Vendas (planilha)       Kiwify (recorrência)
Orgânico IG/YT        →    Mautic (email)       →  Vendas manuais (PIX)    Ascensão de cliente
Switchy (links/UTM)   →    Zoom (webinar/CPL)   →  ROAS / CPA / ticket     Grupos WhatsApp
                           Grupos WhatsApp                                  (snapshots)
─────────────────────────────────────────────────────────────────────────────────────
        CROSS-FUNNEL: traffic-analytics (atribuição) · comparação de funnels · seller breakdown
```

### Tabela por estágio (fonte / métricas / cache)

#### TOFU — Awareness / Atração de tráfego

| Aspecto | Detalhe |
|---------|---------|
| **Domínios** | Tráfego Meta · Tráfego Google/YouTube · Criativos & Orgânico · Funis Estruturados · Traffic Analytics |
| **Fontes (services)** | `meta-ads.ts` (`fetchCampaigns`, `fetchDailyInsights`, `fetchAllAdInsights`, `fetchPlacementBreakdown`, `fetchAdCreatives`), `google-ads.ts` (`fetchGoogleAdsOverview`, `fetchGoogleAdsCampaigns`, `fetchGoogleAdsAds`), `youtube.ts` (`fetchChannelOverview`, `listChannelVideos`), `instagram.ts` (`getMediaList`, `getAccountInsights`), `switchy.ts` (shortlinks/UTM) |
| **Métricas** | Impressions, reach, clicks, spend, CTR, CPC, CPM (Meta+Google); video_views, viewRate, retenção p25/p50/p75/p100 (Google/YouTube); reach/views/likes/comments/saves/engagement_rate (IG); creative metadata; placement breakdown |
| **Cache** | **Meta: SIM** (`meta_campaign_insights_daily`, `meta_ad_insights_daily`, `meta_entity_names_cache`, `meta_ad_creatives_cache`). **Instagram: SIM** (`instagram_metrics_cache`). **Google Ads/YouTube: NÃO** (live a cada request — GAP). **CTR/CPC/CPM/frequency: derivados, NÃO cacheados** (recalculados de spend/clicks/impressions). **Placement: cache IN-MEMORY não-persistente** (`getPlacementBreakdown` em `traffic-analytics.ts:169` — `Map` com TTL; some no restart, não compartilhado entre instâncias). |

#### MOFU — Consideração / Qualificação / Nutrição

| Aspecto | Detalhe |
|---------|---------|
| **Domínios** | Leads & CRM · Funis Estruturados · Lançamentos/Zoom · Criativos & Orgânico |
| **Fontes (rotas/services)** | `lead-scoring.ts` (`/lead-scoring/results`, `/campaign-breakdown`, `/adset-breakdown`, `/ad-breakdown`), `mautic.ts` (`/mautic-emails`, `/mautic-metrics`) + `services/mautic.ts`, `zoom-stage.ts` + `services/zoom.ts` (participantes/sessões/chat), `funnel-groups.ts` (`/group-snapshots/daily`) |
| **Métricas** | total_leads_scored, leads_por_banda (A/B/C/D), % por banda, CPL real, CPL ideal; mautic sent/opens/openRate/clicks/clickRate/bounces/unsubscribes; leads por placement/temperatura/estratégia/criativo, top-20 utm_terms; zoom participants/sessions/chat; grupos WhatsApp participantes/entrada/saída/cheios×abertos |
| **Cache** | **Spend do breakdown: SIM** (`meta_campaign_insights_daily` via `applyMetaTax`). **utm_medium/term/content → nomes: SIM** (`meta_entity_names_cache`). **Lead scoring (computeBands): NÃO** (recalcula contra Google Sheets a cada request — GAP). **Mautic: NÃO** (live a cada request — GAP). **Zoom: SIM** (`funnel_stage_zoom_meetings.cachedData` JSONB). **Grupos WhatsApp: SIM** (`funnel_group_snapshots`). |

#### BOFU — Conversão / Receita

| Aspecto | Detalhe |
|---------|---------|
| **Domínios** | Vendas Hotmart/manuais/consolidado · Criativos & Orgânico · Traffic Analytics · Lançamentos/Stages |
| **Fontes (rotas)** | `stage-sales-data.ts` (`/sales-data`, `/sales-conversion`, `/hot-cold-buyers`, `/sales-data-daily`), `perpetual-sales-data.ts`, `manual-sales.ts` (`/manual-sales`, `/all-sales`), `sellers-breakdown.ts`, `creative-revenue.ts`, `stage-creative-performance.ts`, `sales.ts` (`/ascension`), `traffic-analytics.ts` (purchase/revenue de Meta) |
| **Métricas** | totalVendas, faturamentoBruto/Liquido, ticketMedio, ROAS, CPL, CPA/CPS, margin; por canal/forma de pagamento/utm_source/medium/content/term; revenue por criativo (ad_id via co= ou email); ingressosByDay (Pago/Orgânico/SemTrack); seller breakdown com bandas; ascensão (inferior→superior); landing_page_views; purchase/revenue de Meta (`action_values`) |
| **Cache** | **Vendas de planilha (sales-data, perpetual, sellers-breakdown, creative-revenue, ascension): NÃO** (recalcula de Google Sheets + agregação CPU-bound a cada request — GAP grande). **Spend para ROAS: SIM** (Meta cache). **Resolução de nomes Meta no breakdown de vendas: SIM** (`meta_entity_names_cache`). **purchase/revenue de Meta: SIM** (cacheado nos insights, em `actions`/`actionValues`). |

#### PÓS-VENDA — Recorrência / Retenção

| Aspecto | Detalhe |
|---------|---------|
| **Domínios** | Vendas Kiwify · Vendas Hotmart · Grupos WhatsApp |
| **Fontes (rotas/services)** | `kiwify.ts` (`/kiwify/products`, `/kiwify/dashboard`) + `services/kiwify.ts` (`computeKiwifyDashboard`, `aggregateKiwifyDashboard`), `hotmart.ts` (`/hotmart/products`, `/hotmart/dashboard`) + `services/hotmart.ts` (`computeHotmartDashboard`, `aggregateDashboard`) |
| **Métricas** | **Kiwify:** recurringRevenue, mrrApprox, charges por status (paid/refunded/chargeback/pending/refused), newVsRenewal, refundRate, chargebackRate, statusDistribution. **Hotmart:** totalSubscriptions, activeSubscriptions, cancelled/overdue, MRR, LTV, ltMonths, retentionRate, churnRate, nextMonthRenewals, statusDistribution (por moeda) |
| **Cache** | **SIM, totalmente cacheado (SWR L1 memória + L2 banco, TTL 30min):** `kiwify_cache` e `hotmart_cache`. Cache keys: `dashboard:<productId>:<months>` e `products:<months>`. **Estes são os quick-wins mais maduros do funil.** |

#### CROSS-FUNNEL — Atribuição / Comparação / Coordenação

| Aspecto | Detalhe |
|---------|---------|
| **Domínios** | Traffic Analytics · Tráfego Meta (comparação) · Funis · Modelo de Dados |
| **Fontes (rotas)** | `traffic-analytics.ts` (overview/campaigns/adsets/ads/top-performers/daily/placements/creatives/meta-names), `meta-ads-comparison.ts` (`/meta-ads-comparison`), `funnels.ts`, `switchy.ts` (`/links/history`, `/generate`, `/presets`) |
| **Métricas** | Overview agregado (spend/impressions/clicks/leads/sales/revenue/ROAS/CAC); top performers por roas/cpl/leads/sales/ctr/spend; comparação entre 2 funnels por dia (impressions/clicks/spend/reach); histórico de links Switchy (utm_*, shortUrl) |
| **Cache** | **Insights base: SIM** (Meta cache). **Comparação de funnels: SIM** (agrega do cache Meta). **Links Switchy (histórico): SIM** (`switchy_shortened_links` é tabela de domínio persistida). **Cliques reais dos shortlinks: NÃO** (Switchy não consultado para métricas — GAP). **Overview/top-performers: parcialmente** (lê do Meta cache mas mistura cache em memória não-determinístico). |

---

## 3. Inventário de tabelas de CACHE (fonte da API pública)

Confirmado em `packages/api/src/db/schema.ts`. Estas são as tabelas que a API pública pode ler diretamente sem chamar APIs externas ao vivo.

| Tabela | Path schema | Chave | TTL (aplicado no código) | Alimenta |
|--------|-------------|-------|--------------------------|----------|
| `meta_campaign_insights_daily` | `:1309-1329` | (projectId, campaignId, dateStart) | hoje 30min · 1-7d 24h · >7d indefinido | spend, impressions, reach, clicks, actions, actionValues por campanha/dia |
| `meta_ad_insights_daily` | `:1332-1358` | (projectId, adId, dateStart) | idem acima (date-aware) | mesmo que acima + adsetId/Name, campaignId/Name, adName, videoMetrics por ad/dia |
| `meta_entity_names_cache` | `:1257-1272` | (projectId, entityType, entityId) | 24h–30d (varia por relato; código aplica em JS) | nomes de ad/adset/campaign; backfill diário (`meta-names-backfill.ts`) |
| `meta_ad_creatives_cache` | `:1278-1303` | (projectId, adId) | 24h | imageUrl, thumbnailUrl, videoId, title, body, linkUrl, ctaType, objectType |
| `instagram_metrics_cache` | `:383-409` | (accountId, metricType, periodStart, periodEnd) + expiresAt | profile 5min · post 15min · account 30min · demographics 60min · stories 5min · reels 15min | reach/views/likes/comments/saves/engagement, demographics, stories, reels (legacy mas funcional) |
| `hotmart_cache` | `:1195-1206` | (projectId, cacheKey) | 30min (SWR L1+L2) | dashboard Hotmart (MRR/LTV/retenção/churn) + lista de produtos |
| `kiwify_cache` | `:1242-1253` | (projectId, cacheKey) | 30min (SWR L1+L2) | dashboard Kiwify (recurringRevenue/MRR/refund/chargeback) + lista de produtos |
| `funnel_group_snapshots` | `:1052-1076` | (funnel_id, campaign_id, snapshot_at) unique | snapshot diário (ingestão de planilha) | grupos WhatsApp: participants, input/output, groupFull/Open/Total, clicksTotal |
| `funnel_stage_zoom_meetings.cachedData` | `:1360` | (stageId, meetingUuid) unique | sob demanda (sync manual) | participants[], sessions, chat (JSONB) |

### NÃO cacheado (precisa de cache novo para virar quick-win) — GAPs

| Dado | Onde é calculado hoje | Recomendação de cache |
|------|----------------------|------------------------|
| Google Ads / YouTube metrics | `google-ads.ts`, `youtube.ts` (live) | criar `google_ads_metrics_cache`, `youtube_metrics_cache` (análogo a `instagram_metrics_cache`) — proposto nos mapas, NÃO existe |
| Vendas de stage (sales-data) | `stage-sales-data.ts` (live de Google Sheets) | criar `stage_sales_data_cache` (projectId, stageId, subtype, dateRange) |
| Vendas perpétuas | `perpetual-sales-data.ts` (live) | criar `perpetual_sales_data_cache` |
| Seller breakdown | `sellers-breakdown.ts` (live) | criar `sellers_breakdown_cache` |
| Lead scoring (bandas) | `lead-scoring.ts` `computeBands()` (live de Sheets) | cache assíncrono via job (proposto, NÃO existe) |
| Métricas Mautic | `services/mautic.ts` (live) | cache (projectId, cacheKey, data, computedAt) TTL 30min |
| Performance por criativo×dia×stage | `stage-creative-performance.ts` (memória, ad-hoc) | criar `stage_creative_performance_daily` (proposto, NÃO existe) |
| Cliques reais de shortlinks Switchy | não consultado | integração nova com Switchy API |

---

## 4. Contrato recomendado da API pública (`/api/public/{dominio}/v1`)

Organizado por estágio, com prioridade (quão valioso para a IA) e esforço (quanto código falta). Tudo read-only (GET), header `X-API-Key`, `requireScope(...)`. O `projectId` resolve via path/query (a chave hoje não é project-scoped — ver GAP em §6).

### 4.1 Meta Ads — ✅ IMPLEMENTADO (Lote 1, Story 36.3)

Lê dos caches Meta. **`projectId` no path** (decisão de produto — não `?accountId` como na spec original). `spend` já vem **com imposto Meta** (gross-up 12,15% para datas ≥2026, via `applyMetaTax`) porque não há frontend pra aplicar depois. Métricas derivadas: `ctr/cpc/cpm/cpl/cpa/roas` + `leads/purchases/revenue/landingPageViews` (reusa as funções de extração de `traffic-analytics` via `utils/meta-metrics.ts` → números batem com o dashboard). `partial: true` quando há dias do range sem dado no cache.

| Método | Path | Retorna | Fonte |
|--------|------|---------|-------|
| GET | `/api/public/meta/v1/projects/:projectId/campaigns` | campanhas agregadas + `activeCreatives` + métricas/derivadas. Query: `from`, `to` | `meta_campaign_insights_daily` + `meta_entity_names_cache` (+ `meta_ad_insights_daily` p/ contagem) |
| GET | `/api/public/meta/v1/projects/:projectId/creatives` | performance por criativo: metadata + video metrics + métricas/derivadas. Query: `campaignId`, `from`, `to`, `orderBy`, `limit` | `meta_ad_insights_daily` + `meta_ad_creatives_cache` |
| GET | `/api/public/meta/v1/projects/:projectId/creatives/:adId/timeseries` | série diária `{date, spend, impressions, clicks, leads, ctr, ...}`. 404 se adId desconhecido | `meta_ad_insights_daily` |
| GET | `/api/public/meta/v1/insights/placement` | breakdown por publisher_platform × platform_position | `getPlacementBreakdown` (cache in-memory não-persistente; considerar cache de banco se exposto) | baixa | medio |
| GET | `/api/public/meta/v1/funnels/:funnelId/comparison` | agregado por dia de funil de comparação (impressions/clicks/spend/reach + totals) | `meta-ads-comparison.ts` (Meta cache) | media | baixo |

### 4.2 Vendas (Kiwify + Hotmart) — quick wins maduros

Estes leem de `kiwify_cache` / `hotmart_cache` (já SWR L1+L2). **Menor esforço de todo o funil** — a lógica de compute já está em camada de serviço reutilizável (`computeKiwifyDashboard`, `computeHotmartDashboard`).

| Método | Path | Retorna | Fonte | Prioridade | Esforço |
|--------|------|---------|-------|-----------|---------|
| GET | `/api/public/kiwify/v1/products` | `{ products: [{id, name}] }` (recorrentes) | `kiwify_cache` | alta | baixo |
| GET | `/api/public/kiwify/v1/dashboard` | recurringRevenue, mrrApprox, charges por status, newVsRenewal, refundRate, chargebackRate, statusDistribution. Query: `projectId`, `productId`, `months` | `kiwify_cache` | alta | baixo |
| GET | `/api/public/hotmart/v1/products` | `{ products: [{id, name}] }`. Query: `months` | `hotmart_cache` | alta | baixo |
| GET | `/api/public/hotmart/v1/dashboard` | totalSubscriptions, activeSubscriptions, MRR, LTV, ltMonths, retentionRate, churnRate, nextMonthRenewals, statusDistribution. Query: `projectId`, `productId`, `months` | `hotmart_cache` | alta | baixo |

### 4.3 Discovery & estrutura — ✅ IMPLEMENTADO (Lote 1)

> **Camada de discovery (decisão Lucas):** o LLM começa em `projects`, desce para `funnels`, depois `stages`. Tudo lê tabela de domínio direto (sem agregação pesada). Sem `projectId` na chave — vem no path. Arquivo: `routes/public-discovery.ts`.

| Método | Path | Retorna | Fonte | Prioridade | Esforço |
|--------|------|---------|-------|-----------|---------|
| GET | `/api/public/v1/projects` | lista de projetos: `id`, `name`, `clientName`, `isActive` (LLM começa aqui) | tabela `projects` | alta | baixo |
| GET | `/api/public/funnels/v1/projects/:projectId/funnels` | lista de funnels (id, name, type, campaignCount) | tabela `funnels` | alta | baixo |
| GET | `/api/public/funnels/v1/funnels/:funnelId/stages` | etapas (id, name, stageType, campaigns, sortOrder, auditStatus, projectionEndDate, leadGoal) | tabela `funnel_stages` | alta | baixo |
| GET | `/api/public/funnels/v1/funnels/:funnelId/group-snapshots/daily` | série diária de grupos WhatsApp (campaigns[].series[{date, participants, input, output, groupFull, groupOpen, groupTotal}] + totals). Query: `from`, `to` | `funnel_group_snapshots` | media | baixo |

### 4.4 Leads & scoring

| Método | Path | Retorna | Fonte | Prioridade | Esforço |
|--------|------|---------|-------|-----------|---------|
| GET | `/api/public/leads/v1/funnels/:funnelId/stages/:stageId/scoring/results` | total_leads_scored, bands[] (id, leads_scored, %, cpl_ideal, recommended_action). Query: `startDate`, `endDate` | `stageLeadScoringSchemas` + Google Sheets (**precisa cache**) | alta | alto |
| GET | `/api/public/leads/v1/funnels/:funnelId/stages/:stageId/breakdown/campaign` | rows[]{utmCampaign, campaignName, spend, totalLeads, cpl, cplIdeal, bands{}}. Query: `days` | spend do Meta cache + Sheets (**parcial cache**) | alta | medio |
| GET | `/api/public/leads/v1/funnels/:funnelId/stages/:stageId/mautic/emails` | emails[]{id, name, sent, opens, openRate, clicks, clickRate, bounces, unsubscribes} + `statsAvailable` | `services/mautic.ts` live (**precisa cache**) | media | alto |

### 4.5 Vendas consolidadas (stages, perpétuo, sellers, ascensão)

Todos precisam de cache novo (CPU-bound + Google Sheets live). Prioridade alta porque é o que a IA pergunta ("vendas da SCA", "ROAS desse criativo"), mas esforço alto.

| Método | Path | Retorna | Fonte | Prioridade | Esforço |
|--------|------|---------|-------|-----------|---------|
| GET | `/api/public/sales/v1/projects/:projectId/stages/:stageId/sales-data` | totalVendas, faturamentoBruto/Liquido, ticketMedio, porCanal/formaPagamento/utmSource/Medium/Content, ingressosByDay. Query: `subtype` (CSV), `days` | `stage-sales-data.ts` (**precisa `stage_sales_data_cache`**) | alta | alto |
| GET | `/api/public/sales/v1/projects/:projectId/funnels/:funnelId/perpetual/sales-data` | totalVendas, faturamentoBruto/Liquido/Calculado (c/ fee), platform, feeRate, porUtmSource/Medium/Content/FormaPagamento | `perpetual-sales-data.ts` (**precisa cache**) | media | alto |
| GET | `/api/public/sales/v1/projects/:projectId/stages/:stageId/creative-revenue` | byAdId{faturamentoBruto/Liquido, vendas, emails} + totais | `creative-revenue.ts` (**precisa cache**) | alta | alto |
| GET | `/api/public/sales/v1/projects/:projectId/stages/:stageId/sellers-breakdown` | sellers[], coverage{matched, total, pct}, hasScoringConfig | `sellers-breakdown.ts` (**precisa cache**) | media | alto |
| GET | `/api/public/sales/v1/projects/:projectId/sales/ascension` | ascended[], conversionRate, avgDaysToAscend, distribution, ltvEstimado | `sales.ts` ascension (live, pesado) | baixa | alto |

### 4.6 Traffic analytics & atribuição (cross-funnel)

| Método | Path | Retorna | Fonte | Prioridade | Esforço |
|--------|------|---------|-------|-----------|---------|
| GET | `/api/public/traffic/v1/projects/:projectId/summary` | totalSpend, totalImpressions, totalClicks, totalReach, totalLeads, totalSales, totalRevenue, avgCpm, avgCpc, roas, cac, lastSyncedAt. Query: `days`, `source_classification` | `traffic-analytics.ts` + Meta cache | alta | medio |
| GET | `/api/public/traffic/v1/projects/:projectId/campaigns` | array{campaignId, campaignName, spend, impressions, linkClicks, lpViews, leads, sales, revenue, roas, cpl, cps} | Meta cache | alta | medio |
| GET | `/api/public/traffic/v1/projects/:projectId/creatives/performance` | top creatives por ROAS{adId, adName, metadata, spend, leads, vendas, roas}. Query: `top`, `order_by` | Meta cache + creatives cache | alta | medio |
| GET | `/api/public/traffic/v1/projects/:projectId/links/history` | array{linkId, channelLabel, utmCampaign, utmMedium, utmSource, shortUrl, fullUrl, createdAt} | `switchy_shortened_links` | baixa | baixo |

### 4.7 Google Ads / YouTube — bloqueado por falta de cache

| Método | Path | Retorna | Fonte | Prioridade | Esforço |
|--------|------|---------|-------|-----------|---------|
| GET | `/api/public/google-ads/v1/accounts/:accountId/overview` | totalSpend, totalViews, CPV, viewRate, conversions, costPerConversion, retention p25-p100 | `google-ads.ts` (**precisa `google_ads_metrics_cache`**) | media | alto |
| GET | `/api/public/google-ads/v1/accounts/:accountId/top-performers` | top criativos por views: id, name, CPV, retention, youtubeVideoId, thumbnailUrl | `google-ads.ts` (**precisa cache**) | media | alto |
| GET | `/api/public/youtube/v1/channels/:channelId/overview` | totalViews, watchTimeHours, netSubscribers, avgRetention | `youtube.ts` (**precisa cache**) | baixa | alto |

---

## 5. Tools MCP recomendadas (base para o `llms.txt` da Story 36.6)

Para a IA do Lucas consumir o funil. Nomes em `snake_case` (convenção MCP). Endpoint = onde a tool bate. Inclui o que a Story 36.6 já planeja para Meta + expansão para o resto do funil.

### Já planejadas (Story 36.6 — Meta)

| Tool | Quando usar | Endpoint |
|------|-------------|----------|
| `list_campaigns` | Listar campanhas Meta de um projeto com métricas agregadas | `GET /api/public/meta/v1/campaigns` |
| `get_creative_performance` | Comparar criativos de uma campanha por CTR/CPA/spend | `GET /api/public/meta/v1/creatives` |
| `get_creative_timeseries` | Ver evolução diária de um criativo específico | `GET /api/public/meta/v1/creatives/:adId/timeseries` |
| `get_real_roas` | ROAS real de criativo (quando Story 36.5 entregar; pode vir null) | `GET /api/public/meta/v1/creatives` (campos de ROAS) |

### Expansão recomendada (demais domínios)

| Tool | Quando usar | Endpoint |
|------|-------------|----------|
| `list_funnels` | Descobrir os funnels/lançamentos de um projeto antes de aprofundar | `GET /api/public/funnels/v1/projects/:projectId/funnels` |
| `list_stages` | Ver as etapas (TOFU/MOFU/BOFU) de um funnel | `GET /api/public/funnels/v1/funnels/:funnelId/stages` |
| `get_kiwify_dashboard` | Métricas de recorrência Kiwify (MRR, refund, chargeback) — cache pronto | `GET /api/public/kiwify/v1/dashboard` |
| `get_hotmart_dashboard` | Métricas de assinatura Hotmart (MRR, LTV, churn, retenção) — cache pronto | `GET /api/public/hotmart/v1/dashboard` |
| `get_stage_sales` | Faturamento/ticket/breakdown de UTM de uma etapa de vendas | `GET /api/public/sales/v1/projects/:projectId/stages/:stageId/sales-data` |
| `get_lead_scoring` | Distribuição de leads por banda A/B/C/D e CPL ideal vs real | `GET /api/public/leads/v1/funnels/:funnelId/stages/:stageId/scoring/results` |
| `get_traffic_summary` | KPI agregado de tráfego (spend/leads/sales/ROAS/CAC) do projeto | `GET /api/public/traffic/v1/projects/:projectId/summary` |
| `get_creative_revenue` | Faturamento atribuído por criativo (ad_id) para ROAS por anúncio | `GET /api/public/sales/v1/projects/:projectId/stages/:stageId/creative-revenue` |
| `get_sellers_breakdown` | Vendas por vendedor com distribuição de bandas | `GET /api/public/sales/v1/projects/:projectId/stages/:stageId/sellers-breakdown` |
| `get_group_snapshots` | Dinâmica diária de grupos WhatsApp do funnel | `GET /api/public/funnels/v1/funnels/:funnelId/group-snapshots/daily` |

---

## 6. Gaps & riscos consolidados

### Bloqueadores estruturais (afetam todo o funil)

1. **Nenhuma rota `/api/public/*` existe ainda.** Só o middleware (36.2). Stories 36.3–36.6 em Draft. Todo endpoint listado em §4 é trabalho a fazer.
2. ~~**`projectId` não vem da chave.**~~ **✅ DECIDIDO (Lucas, 2026-06-18):** uma **única chave admin global** dá acesso a todos os projetos; o `projectId` vem **no path** das rotas de dados. A API expõe uma **camada de discovery hierárquica** (`projects → funnels → stages`) para o LLM navegar de cima pra baixo sem adivinhar IDs. Consequência: **não precisa de migration em `api_keys`** (a chave segue só com `scopes`). Trade-off aceito: qualquer chave válida lê qualquer projeto — aceitável porque a chave é admin-only e revogável (36.1). Se um dia houver acesso por cliente, revisitar (chave project-scoped).
3. **Scope único `meta:read`.** Para expor vendas/leads/traffic, ou se reutiliza `meta:read` para tudo (simples, menos granular) ou criam-se `sales:read`, `leads:read`, `traffic:read` (recomendado para least-privilege).
4. **Rate limit in-memory não funciona em multi-instância** (`api-key-auth.ts:21-23`). Cada instância tem seu contador. Se houver load balancing, migrar para Redis/store compartilhado. Documentado na própria Story 36.2.

### Gaps de cache (impedem "ler do cache" — decisão de produto)

5. **Vendas (stage/perpetual/sellers/creative-revenue/ascension): sem cache.** Recalculam de Google Sheets + agregação CPU-bound a cada request. É o maior gap de prioridade alta. Precisa de tabelas de cache novas + job de refresh.
6. **Lead scoring: sem cache.** `computeBands()` roda contra Sheets a cada chamada; com 10k+ leads, latência sofre.
7. **Mautic: sem cache.** `getMauticCampaignEmailStats()` faz chamadas live; risco de rate limit Mautic + degradação.
8. **Google Ads / YouTube: sem cache persistente** (contrário do Meta). Live a cada request, risco de rate limit (Google Ads 125 req/min por dev token; YouTube quotas diárias).
9. **Performance por criativo×dia×stage: ad-hoc em memória** (`stage-creative-performance.ts`). Sem `stage_creative_performance_daily`.
10. **Cliques de shortlinks Switchy: não medidos.** `switchy_shortened_links` guarda shortUrl/uniq mas nunca consulta a Switchy API para click counts.

### Gaps de dado/semântica (a IA precisa saber)

11. **PII — não expor.** Mapas alertam: vendas/leads contêm email/phone/CPF de customer. A API pública deve agregar (por banda/campanha/criativo), **nunca** retornar PII individual. Kiwify/Hotmart já descartam PII.
12. **ROAS/CPA/CPL/CTR/CPM/frequency são derivados, não cacheados.** Vêm de divisões (revenue/spend, spend/leads...). O caller (IA) ou o endpoint deve calcular. Story 36.5 trata ROAS real (Meta × vendas).
13. **CPA não calculado no servidor para Meta** — `action_values` vem por `action_type` mas falta merge com spend. Caller agrega hoje.
14. **TTL transparente.** Cada cache tem TTL diferente (Meta date-aware; Kiwify/Hotmart 30min; nomes 24h-30d; IG por tipo). Endpoints devem expor `lastSyncedAt` / `partial` para a IA não confundir dado fresco com stale.
15. **Atribuição é complexa e acoplada às rotas.** Revenue por criativo tem 2 caminhos (utm_content `co=` da venda vs email do lead) com dedup por transactionId/email, hardcoded em rotas. Extrair para serviço reutilizável (a própria Story 36.3 pede isso para Meta).
16. **Sem tabela normalizada de leads/vendas.** Vivem em Google Sheets. Contagem é COUNT(DISTINCT email) ou COUNT(rows). Divergências entre Meta-reported e planilha não são reconciliadas.
17. **Nomes Meta podem estar stale** (cache 24h-30d). Rename no Ads Manager demora a refletir.
18. **Sem granularidade intra-diária** (só date-level). Sem dados por hora.
19. **Acoplamento a Clerk em todas as rotas atuais.** A API pública precisa de rotas paralelas `/api/public/*` desacopladas de Clerk (o middleware X-API-Key já cobre isso, mas nenhuma rota o usa ainda).
20. **Platform fee hardcoded** (Kiwify 20.99%, Hotmart 26%) e aplicado só em perpetual-sales-data, não em stage-sales-data — inconsistência se exposto sem documentar.

### Riscos de evolução

21. **Contrato do MCP é dependência externa.** Versionar `/v1/`, mudanças sempre aditivas, nunca remover campo sem `/v2/` (Story 36.3 já prevê).
22. **Divergência dashboard × API.** Story 36.3 exige números batendo com o dashboard interno (mesma agregação). Vale para todos os domínios.

---

## 7. Sequência recomendada (esforço crescente)

1. **Quick wins (baixo esforço, alta prioridade):** Meta (36.3, já especificado) + Kiwify/Hotmart dashboards (cache SWR pronto) + listagem de funnels/stages (leitura de tabela de domínio). Tudo lê de cache existente.
2. **Médio:** traffic summary/campaigns/creatives (lê do Meta cache, mas precisa flatten + remover cache em memória) + comparação de funnels + breakdown de campanha de leads (spend já cacheado).
3. **Alto (requer cache novo + job de refresh):** vendas consolidadas (stage/perpetual/creative-revenue/sellers), lead scoring completo, Mautic, Google Ads/YouTube. Aqui mora a decisão de produto "ler do cache": sem essas tabelas de cache, ou se aceita latência/risco de rate limit, ou se constrói o cache antes de expor.

---

## 8. Complementos do crítico de completude (verificados no código)

Itens que a varredura inicial omitiu ou subestimou. Cada um foi confirmado direto no código após a síntese (a cobertura passou de ~85% para ~100% do que existe hoje).

### 8.1 Landing Pages — `lp-campaigns.ts` (Story 18.44) — etapa TOFU→MOFU

- **Endpoint atual:** `GET /api/funnels/:funnelId/stages/:stageId/lp-campaigns` (Clerk).
- **Fonte:** `fetchAllAdInsights` (Meta) filtrando campanhas cujo nome contém `lpa/lpb/lpc...`; extrai `LPA/LPB/...` do `campaign_name` (`extractLPName`).
- **Retorna por LP:** `campaignName`, `lpName`, `spend`, `linkClicks`, `impressions`, `lpViews` (action `landing_page_view`) + summary. Frontend deriva CPM/CPC/CTR/**Connect Rate**.
- **Cache:** lê do **Meta cache** (via `fetchAllAdInsights`) → quick win.
- **Endpoint público sugerido:** `GET /api/public/traffic/v1/funnels/:funnelId/stages/:stageId/lp-campaigns` — **prioridade média, esforço baixo**.
- **MCP tool:** `get_lp_performance` — performance de landing pages (LPA/LPB...) por connect rate.

### 8.2 `stage-phase.ts` — serviço de atribuição (peça central, não exposta diretamente)

- `resolveStagePhaseSuffix()`, `findMatchingCampaignsForStage()` casam `campaign_name` com o tipo de stage (`paid`/`free`/`sales`). É a **cola que liga campanha Meta ↔ etapa do funil**; usado por `stage-sales-data.ts`, lead scoring e creative-revenue.
- Não vira endpoint, mas **todo** endpoint de vendas/leads por stage depende dele. Ao extrair a lógica reutilizável que a Story 36.3 pede, extrair este serviço junto.

### 8.3 Endpoints de vendas omitidos (adicionar ao bloco §4.5)

- `hot-cold-buyers` (`stage-sales-data.ts`) — classificação de compradores quentes/frios por stage.
- `sales-data-daily` — **série diária** de vendas (a §4.5 agregava tudo como "sales-data" sem o recorte diário).

### 8.4 PII em Google Sheets CRUD — alerta ampliado

- Além de vendas/leads, as rotas de planilha (`funnel-spreadsheets.ts`, `stage-sales-spreadsheets.ts`, `perpetual-spreadsheets.ts`) leem colunas cruas como `email`, `phone`, `status` via `readSheetData()` **sem sanitização**. `funnel_stage_zoom_meetings.cachedData` (JSONB) guarda chat/participantes (nomes, possíveis emails).
- **Regra reforçada:** nenhuma rota `/api/public/*` deve tocar essas planilhas/JSONB sem camada de **agregação/anonimização**. Nunca expor linha individual com PII.

### 8.5 Fontes a explorar antes de expor (não varridas a fundo)

- `funnel-groups.ts` (endpoints de gestão POST/PUT/DELETE além dos snapshots), `funnel-spreadsheets.ts` / `perpetual-spreadsheets.ts` / `stage-sales-spreadsheets.ts` (config de planilhas), e as funções `getTopPerformers()` / `getCampaignDailyInsights()` de `traffic-analytics.ts`.

---

*Documento factual. Toda métrica/fonte rastreia a um path real reportado pelos mapas de domínio ou verificado em `packages/api/src`. Gaps marcados explicitamente. Sem invenção de campos (Article IV). §8 incorpora as correções do crítico de completude, verificadas direto no código.*
