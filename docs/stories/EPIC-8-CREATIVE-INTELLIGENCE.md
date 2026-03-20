# EPIC-8: Creative Intelligence — Criativos, Filtros Avancados e Insights Visuais

> Evoluir o dashboard de trafego para mostrar os criativos reais dos anuncios (imagem/video), adicionar filtros por campanha, ranking visual comparativo com thumbnails, metricas de video, breakdown por posicionamento, periodo customizado e export de dados.

**Status:** Draft
**Created:** 2026-03-20
**Author:** Morgan (PM Agent)
**Product:** Loyola Digital X
**Parent:** EPIC-1
**Depends on:** EPIC-7 (Traffic Analytics — dashboard, cruzamento UTM, top performers ja funcionando)

---

## Epic Goal

Transformar o dashboard de trafego em uma ferramenta de inteligencia criativa — onde o gestor nao apenas ve numeros, mas **ve os criativos** que performaram, compara visualmente anuncios lado a lado, e filtra por qualquer nivel da hierarquia (campanha, adset, ad). O foco principal e responder a pergunta: **"qual criativo esta vendendo mais?"** com evidencia visual.

## Business Value

- **Decisao visual de criativos:** Ver o thumbnail do ad junto com metricas elimina a ida ao Meta Business Manager
- **Velocidade de analise:** Filtro por campanha + ranking visual = gestor identifica winners em segundos
- **Otimizacao de video:** Metricas de retencao mostram onde o publico desiste — informa producao de conteudo
- **Posicionamento inteligente:** Saber se Feed, Stories ou Reels performa melhor por criativo
- **Autonomia do gestor:** Export CSV permite analise offline e compartilhamento com equipe
- **UX profissional:** Dashboard compete com ferramentas pagas (AdEspresso, Revealbot, etc.)

## Modelo de Dados — Novas Capacidades

### Creative Data (Meta Ads API — `adcreatives` endpoint)

| Campo | Endpoint | Uso |
|-------|----------|-----|
| `thumbnail_url` | `adcreatives?fields=thumbnail_url` | Preview da imagem do criativo |
| `image_url` | `adcreatives?fields=image_url` | Imagem full do criativo |
| `video_id` | `adcreatives?fields=video_id` | ID do video (se video ad) |
| `title` | `adcreatives?fields=title` | Titulo do anuncio |
| `body` | `adcreatives?fields=body` | Texto do anuncio |
| `link_url` | `adcreatives?fields=link_url` | URL de destino |
| `call_to_action_type` | `adcreatives?fields=call_to_action_type` | CTA do anuncio |
| `object_type` | `adcreatives?fields=object_type` | Tipo: VIDEO, PHOTO, CAROUSEL |

### Video Metrics (Meta Ads API — insights com action breakdowns)

| Metrica | Campo API | Uso |
|---------|-----------|-----|
| Video views (3s) | `video_avg_time_watched_actions` | Engajamento basico |
| 25% watched | `video_p25_watched_actions` | Retencao 25% |
| 50% watched | `video_p50_watched_actions` | Retencao 50% |
| 75% watched | `video_p75_watched_actions` | Retencao 75% |
| 100% watched | `video_p100_watched_actions` | Retencao completa |
| ThruPlays | `video_thruplay_watched_actions` | Assistiu 15s+ ou completo |

### Placement Breakdown (Meta Ads API — breakdown param)

| Breakdown | Valores | Uso |
|-----------|---------|-----|
| `publisher_platform` | facebook, instagram, audience_network, messenger | Plataforma |
| `platform_position` | feed, story, reels, explore, right_hand_column, etc. | Posicao |

---

## Stories

### Story 8.1: Ad Creative Data — API + Backend Service (MUST)

> Puxar dados de criativos dos anuncios via Meta Ads API (thumbnail, tipo, titulo, body) e retorna-los junto com as metricas de ads existentes.

- **Executor:** `@dev`
- **Quality Gate:** `@qa`
- **Scope:** meta-ads.ts service, traffic-analytics.ts, rotas API, tipos
- **Depends on:** EPIC-7 completo
- **AC:**
  1. Nova funcao `fetchAdCreatives(metaAccountId, accessToken, adIds[])` em `meta-ads.ts` — busca `/{adId}/adcreatives?fields=thumbnail_url,image_url,title,body,link_url,call_to_action_type,object_type,video_id` para cada ad
  2. Novo tipo `MetaAdCreative`: `{ adId, thumbnailUrl, imageUrl, title, body, linkUrl, ctaType, objectType, videoId }`
  3. Batching: agrupar ate 50 ad IDs por request usando batch API do Meta (ou requests paralelos com rate limit)
  4. `getTopPerformers()` atualizado — retorna campo `creative: MetaAdCreative | null` junto com cada TopPerformerAd
  5. `getProjectAdAnalytics()` atualizado — retorna `creative` junto com cada ad no drill-down
  6. Nova rota `GET /api/traffic/analytics/:projectId/ad-creatives?adIds=id1,id2,...` — fallback para buscar criativos sob demanda
  7. Cache de criativos separado com TTL 1h (criativos mudam raramente)
  8. Tratamento graceful: se criativo nao encontrado, retorna `creative: null` (nunca quebra o fluxo)
  9. Rate limit respeitado: criativos sao puxados APENAS quando necessario (top performers, drill-down ads), nunca em batch de todas campanhas
  10. Tipos exportados no hook `use-traffic-analytics.ts`: `TopPerformerAd` ganha campo `creative`
  11. `pnpm typecheck` e `pnpm lint` passam

---

### Story 8.2: Creative Preview no Top Performers (MUST)

> Exibir thumbnail do criativo nos cards de Top Performers, transformando o ranking de "nomes com numeros" em "galeria visual de winners".

- **Executor:** `@dev`
- **Quality Gate:** `@qa`
- **Scope:** TopPerformersSection no traffic/page.tsx, hook update
- **Depends on:** 8.1
- **AC:**
  1. Card de Top Performer redesenhado: thumbnail ocupa topo do card (aspect ratio 1:1 ou 4:5, max 200px), metricas abaixo
  2. Se `creative.objectType === 'VIDEO'`: overlay de icone play sobre o thumbnail
  3. Se `creative === null`: mostrar placeholder generico com icone de imagem
  4. Tooltip no hover do card: mostra `creative.title` e `creative.body` (texto do anuncio)
  5. Badge no card indicando tipo: "Imagem", "Video", "Carousel"
  6. Grid responsivo: 5 colunas desktop, 2 colunas mobile (mantendo cards clicaveis)
  7. Loading state: skeleton com aspecto de card + thumbnail
  8. Ranking visual: borda/highlight mais forte no #1, degrade sutil ate #5
  9. `pnpm typecheck` e `pnpm lint` passam

---

### Story 8.3: Filtro por Campanha (MUST)

> Adicionar dropdown de filtro por campanha no dashboard, permitindo visualizar metricas apenas de uma campanha especifica (seus adsets e ads).

- **Executor:** `@dev`
- **Quality Gate:** `@qa`
- **Scope:** traffic/page.tsx, novos componentes de filtro
- **Depends on:** EPIC-7 completo
- **AC:**
  1. Novo dropdown "Campanha" ao lado do filtro de AdSet existente — lista todas campanhas ativas
  2. Selecionar campanha filtra: SummaryCards (totais apenas daquela campanha), tabela (mostra apenas aquela campanha expandida com adsets/ads)
  3. DailyChart filtrado: quando campanha selecionada, grafico mostra spend/clicks apenas daquela campanha
  4. Nova rota `GET /api/traffic/analytics/:projectId/campaign-daily?campaignId=X&days=30` — daily insights filtrados por campanha
  5. Hook `useCampaignDailyInsights(projectId, campaignId, days)` — habilitado apenas quando campanha selecionada
  6. FunnelChart recalculado para campanha selecionada (nao totais gerais)
  7. TopPerformers filtrado: quando campanha selecionada, mostra top ads APENAS daquela campanha
  8. Filtro de AdSet continua funcionando — pode combinar: campanha X + adset Y
  9. Reset: botao "Limpar filtros" ou selecionar "Todas as campanhas"
  10. URL state: filtros persistidos na URL via query params (`?campaign=X&adset=Y`) para compartilhamento
  11. `pnpm typecheck` e `pnpm lint` passam

---

### Story 8.4: Creative Preview no Drill-Down de Ads (MUST)

> Mostrar thumbnail do criativo na tabela de drill-down quando o usuario expande ate o nivel de Ad, permitindo ver o criativo junto com suas metricas na propria tabela.

- **Executor:** `@dev`
- **Quality Gate:** `@qa`
- **Scope:** DrillDownAds component, traffic/page.tsx
- **Depends on:** 8.1
- **AC:**
  1. Na linha de Ad (nivel 2 do drill-down), adicionar mini-thumbnail (40x40px) antes do nome do ad
  2. Thumbnail clicavel: abre modal/lightbox com imagem full + titulo + body do criativo
  3. Se video: modal mostra thumbnail + link "Ver no Meta" (link para o ad no Business Manager, se disponivel)
  4. Badge de tipo (Imagem/Video/Carousel) na linha do ad
  5. Layout da linha nao quebra com thumbnail — imagem alinhada com texto do nome
  6. Fallback: se sem criativo, mostra icone generico pequeno
  7. Lightbox com botao de fechar, click fora fecha, ESC fecha
  8. `pnpm typecheck` e `pnpm lint` passam

---

### Story 8.5: Ranking Visual Comparativo (SHOULD)

> Criar secao de comparacao visual de criativos com grafico de barras horizontal onde cada barra tem o thumbnail do criativo, permitindo comparacao rapida de performance.

- **Executor:** `@dev`
- **Quality Gate:** `@qa`
- **Scope:** Novo componente CreativeRanking, traffic/page.tsx
- **Depends on:** 8.1, 8.2
- **AC:**
  1. Nova secao "Comparativo de Criativos" abaixo do Top Performers
  2. Grafico de barras horizontal (Recharts): cada barra = 1 ad, com thumbnail (32x32) como label no eixo Y
  3. Metrica da barra selecionavel: mesmo seletor do Top Performers (ROAS, CPL, Leads, etc.)
  4. Top 10 ads (nao apenas 5) no comparativo
  5. Cores das barras: gradiente de verde (melhor) a vermelho (pior)
  6. Hover na barra: tooltip com nome do ad, adset, campanha, metrica formatada, spend
  7. Filtravel por campanha (integra com filtro 8.3): se campanha selecionada, mostra apenas ads daquela campanha
  8. Toggle: "Mostrar apenas com criativos" para esconder ads sem thumbnail
  9. Loading skeleton enquanto carrega criativos
  10. `pnpm typecheck` e `pnpm lint` passam

---

### Story 8.6: Video Retention Metrics (SHOULD)

> Puxar metricas de retencao de video da Meta API e exibir mini-grafico de retencao para ads de video no dashboard.

- **Executor:** `@dev`
- **Quality Gate:** `@qa`
- **Scope:** meta-ads.ts, traffic-analytics.ts, componente VideoRetention
- **Depends on:** 8.1
- **AC:**
  1. `fetchAdInsights()` atualizado — campos adicionais: `video_p25_watched_actions`, `video_p50_watched_actions`, `video_p75_watched_actions`, `video_p100_watched_actions`, `video_thruplay_watched_actions`
  2. Novo tipo `VideoMetrics`: `{ views3s, p25, p50, p75, p100, thruplay }`
  3. `MetaAdInsight` expandido com campo opcional `videoMetrics: VideoMetrics | null`
  4. Componente `VideoRetentionChart`: mini area chart (Recharts) mostrando curva 25% → 50% → 75% → 100% — sparkline inline
  5. No drill-down de ads: se ad e video, mostrar sparkline de retencao na linha (ao lado do thumbnail)
  6. No Top Performers: se ad e video, mostrar sparkline dentro do card
  7. Tooltip no sparkline: "25%: 5.2K views → 50%: 3.1K → 75%: 1.8K → 100%: 900"
  8. Video metrics so sao puxadas para ads com `objectType === 'VIDEO'` (nao desperdicar requests)
  9. `pnpm typecheck` e `pnpm lint` passam

---

### Story 8.7: Placement Breakdown (COULD)

> Mostrar performance por posicionamento (Feed, Stories, Reels, etc.) para entender onde cada criativo performa melhor.

- **Executor:** `@dev`
- **Quality Gate:** `@qa`
- **Scope:** meta-ads.ts, nova rota, componente PlacementBreakdown
- **Depends on:** EPIC-7 completo
- **AC:**
  1. Nova funcao `fetchPlacementBreakdown(metaAccountId, accessToken, days)` — `/act_{id}/insights?breakdowns=publisher_platform,platform_position&fields=spend,impressions,clicks,ctr,cpc,cpm&date_preset=X`
  2. Novo tipo `PlacementInsight`: `{ platform, position, spend, impressions, clicks, ctr, cpc, cpm }`
  3. Nova rota `GET /api/traffic/analytics/:projectId/placements?days=30`
  4. Hook `usePlacementBreakdown(projectId, days)`
  5. Nova secao "Performance por Posicionamento" no dashboard
  6. Tabela: Posicao | Spend | Impressoes | Cliques | CTR | CPC | CPM
  7. Agrupamento visual: Facebook (Feed, Stories, Reels) | Instagram (Feed, Stories, Reels, Explore) | Audience Network
  8. Highlight: melhor posicao por CPC e CTR
  9. Cache com mesmo TTL (15min)
  10. `pnpm typecheck` e `pnpm lint` passam

---

### Story 8.8: Periodo Customizado + Export CSV (COULD)

> Adicionar date picker com range customizado e botao de export CSV dos dados filtrados.

- **Executor:** `@dev`
- **Quality Gate:** `@qa`
- **Scope:** traffic/page.tsx, rotas API (date range params), util de export
- **Depends on:** EPIC-7 completo
- **AC:**
  1. Date picker (usar componente de calendario existente ou adicionar `react-day-picker`): selecionar data inicio e fim
  2. Periodos pre-definidos mantidos (7d/14d/30d/90d) como atalhos dentro do date picker
  3. Rotas API atualizadas: aceitar `startDate` e `endDate` como alternativa a `days` — usar `time_range` param da Meta API ao inves de `date_preset`
  4. Botao "Exportar CSV" no header do dashboard
  5. Export inclui: dados da tabela de campanhas (com todas colunas visiveis) + filtros aplicados
  6. Nome do arquivo: `loyola-traffic-{projectName}-{startDate}-{endDate}.csv`
  7. CSV em formato BR: separador `;`, decimais com `,`
  8. Export client-side (nao precisa de rota dedicada — gera CSV dos dados ja carregados)
  9. Loading state durante geracao do CSV (para datasets grandes)
  10. `pnpm typecheck` e `pnpm lint` passam

---

## Technical Approach

### Meta Ads API — Ad Creatives

```
GET /{ad-id}?fields=creative{thumbnail_url,image_url,title,body,link_url,call_to_action_type,object_type,video_id}
```

- **Rate limit consideration:** Cada ad requer 1 request para criativo. Para top performers (5-10 ads), sao 5-10 requests extras. Para drill-down de todos ads de um adset, pode ser 10-50+ requests.
- **Strategy:** Puxar criativos sob demanda (lazy load), nao em bulk. Cache agressivo (1h TTL).
- **Batch option:** Meta Graph API suporta batch requests (`POST /` com `batch` param) — ate 50 requests por batch.

### Impacto no Rate Limit Existente

| Cenario | Requests atuais | Requests com criativos | Delta |
|---------|----------------|----------------------|-------|
| Dashboard load | ~5-10 | ~5-10 (sem mudanca) | 0 |
| Top Performers | ~15-30 | ~20-40 (+5-10 criativos) | +33% |
| Drill-down ads | ~3-5 | ~8-25 (+5-20 criativos) | +100% |
| Placements | 0 | ~1-3 | +3 |

Total maximo por sessao: ~60-80 requests (dentro do limite de 200/hora).

### Componentes UI Novos

| Componente | Descricao | Lib |
|------------|-----------|-----|
| `CreativeCard` | Card com thumbnail + metricas + badge de tipo | shadcn/ui |
| `CreativeLightbox` | Modal full-size com titulo/body | shadcn Dialog |
| `VideoRetentionChart` | Sparkline de retencao de video | Recharts AreaChart |
| `CreativeRankingChart` | Barras horizontais com thumbnails | Recharts BarChart |
| `PlacementTable` | Tabela de performance por posicao | HTML table (pattern existente) |
| `CampaignFilterDropdown` | Dropdown de filtro por campanha | shadcn Select |
| `DateRangePicker` | Date picker com range customizado | react-day-picker |

### Arquivos Impactados

| Arquivo | Mudancas |
|---------|----------|
| `packages/api/src/services/meta-ads.ts` | +fetchAdCreatives, +fetchPlacementBreakdown, expand fetchAdInsights |
| `packages/api/src/services/traffic-analytics.ts` | +creative data in top performers/ads, +placement analytics |
| `packages/api/src/routes/traffic-analytics.ts` | +novas rotas (creatives, placements, campaign-daily) |
| `packages/web/lib/hooks/use-traffic-analytics.ts` | +tipos com creative, +novos hooks |
| `packages/web/app/(app)/traffic/page.tsx` | +componentes novos, +filtro campanha, +creative previews |

---

## Execution Order (Waves)

### Wave 1 — Foundation (MUST, parallelizable)
- **8.1** Ad Creative Data — API + Backend (backend work)
- **8.3** Filtro por Campanha (frontend work, independente de criativos)

### Wave 2 — Creative Visuals (MUST, depende de 8.1)
- **8.2** Creative Preview no Top Performers
- **8.4** Creative Preview no Drill-Down

### Wave 3 — Advanced Insights (SHOULD)
- **8.5** Ranking Visual Comparativo (depende de 8.1, 8.2)
- **8.6** Video Retention Metrics (depende de 8.1)

### Wave 4 — Nice to Have (COULD, independentes)
- **8.7** Placement Breakdown
- **8.8** Periodo Customizado + Export CSV

---

## Risk Mitigation

- **Primary Risk:** Rate limit da Meta API estourado com requests de criativos
  - **Mitigation:** Cache agressivo (1h para criativos), lazy loading, batch requests, nunca puxar criativos em bulk
- **Secondary Risk:** Thumbnails podem ser URLs temporarias que expiram
  - **Mitigation:** Cache de URLs com TTL menor (30min), fallback para placeholder se 404
- **Tertiary Risk:** Video metrics indisponiveis para ads antigos ou com pouca veiculacao
  - **Mitigation:** Campos opcionais (`VideoMetrics | null`), graceful degradation
- **Rollback Plan:** Cada story e aditiva — pode ser revertida individualmente sem quebrar o dashboard existente

## Compatibility Requirements

- [x] EPIC-7 intacto — dashboard existente nao e quebrado, stories sao aditivas
- [x] Rate limit atual (200 req/h) respeitado com margem de seguranca
- [x] Padroes de UI consistentes (shadcn/ui, Recharts, hooks pattern)
- [x] Types exportados para futuro uso por Minds (tool de analytics)

## Definition of Done

**Wave 1 (MUST — Foundation):**
- [ ] Creative data disponivel via API com cache
- [ ] Filtro por campanha funcionando no dashboard

**Wave 2 (MUST — Visual):**
- [ ] Thumbnails de criativos visiveis no Top Performers
- [ ] Thumbnails visiveis no drill-down de ads
- [ ] Lightbox funcional para ver criativo em detalhe

**Wave 3 (SHOULD — Advanced):**
- [ ] Ranking visual comparativo com barras + thumbnails
- [ ] Metricas de retencao de video com sparklines

**Wave 4 (COULD — Polish):**
- [ ] Breakdown por posicionamento
- [ ] Periodo customizado + export CSV
