# AUDITORIA-ABA-CAC — Fase 0

**Executado por:** @architect (Aria), com apoio de @data-engineer nas contagens
**Data:** 2026-08-17
**Escopo:** só auditoria. Nenhum arquivo de aplicação criado ou alterado, nenhuma migration, nenhuma mudança de schema.

> **Resumo em uma linha:** o dado bruto por campanha **existe e é diário** — expor série por campanha é filtro, não ingest novo. Mas há **quatro divergências entre a especificação e o que o código já calcula**, um bloqueio de atribuição de venda, e o teto de Conv. Checkout **nasce vazio na maioria dos grupos**.

---

## 1. Tabela de campos

### 1.1 Mídia por campanha

Fonte de verdade: **`meta_campaign_insights_daily`** (`packages/api/src/db/schema.ts:1963`).
PK `(project_id, campaign_id, date_start)` — **grão diário por campanha**.

| campo | existe? | onde | granularidade | como é calculado |
|---|---|---|---|---|
| `spend` | ✅ | `meta_campaign_insights_daily.spend` | campanha · diário | bruto da Meta; gross-up em `accumulate()` — ver 2.4 |
| `impressions` | ✅ | idem | campanha · diário | soma direta |
| `reach` | ✅ | idem | campanha · diário | soma direta |
| `clicks` | ✅ | idem | campanha · diário | **cliques TOTAIS** (inclui curtida/perfil) |
| `linkClicks` | ✅ derivado | `actions[].link_click` | campanha · diário | `parseActionCount(row.actions,"link_click")` — `public-meta.ts:166` |
| `landingPageViews` | ✅ derivado | `actions[].landing_page_view` | campanha · diário | `public-meta.ts:172` |
| `checkouts` | ✅ derivado | `actions[].initiate_checkout` | campanha · diário | `public-meta.ts:173` |
| `leads` | ✅ derivado | `parseLeads(row.actions)` — **pixel** | campanha · diário | `public-meta.ts:168` |
| `purchases` | ✅ derivado | `parsePurchases(row.actions)` — **pixel** | campanha · diário | `public-meta.ts:169` |
| `revenue` | ✅ derivado | `parsePurchaseRevenue(row.actionValues)` — **pixel** | campanha · diário | `public-meta.ts:170` |
| `cpm` | ✅ calculado | `deriveMetrics()` — `public-meta.ts:196` | agregado do período | `(spend ÷ impressions) × 1000` |
| `ctrLink` | ✅ calculado | `public-meta.ts:194` | agregado | `linkClicks ÷ impressions × 100` |
| `cpcLink` | ✅ calculado | `public-meta.ts:195` | agregado | `spend ÷ linkClicks` |
| `lpRate` | ⚠️ **existe com outro significado** | `public-meta.ts:205` | agregado | `lpViews ÷ **clicks** × 100` — ver Bloqueio B2 |
| `connectRate` | ⚠️ idem | `public-meta.ts:204` | agregado | mesmo valor de `lpRate` |
| `checkoutRate` | ⚠️ **pixel** | `public-meta.ts:208` | agregado | `purchases(pixel) ÷ checkouts` — ver Bloqueio B3 |

### 1.2 A pergunta decisiva — o bruto carrega `campaignId`?

**Sim. A agregação por etapa acontece na leitura, não na persistência.**

- `meta_campaign_insights_daily` guarda por `(projectId, campaignId, dateStart)`.
- `meta_ad_insights_daily` (`schema.ts:1986`) guarda por `(projectId, adId, dateStart)` **e carrega `campaignId` + `adsetId`**, com índice `idx_meta_ad_insights_campaign`.
- `get_stage_daily` → `GET /api/public/meta/v1/projects/:projectId/stages/:stageId/daily` (`public-meta.ts:603`) filtra pelas campanhas vinculadas à etapa e agrega **em tempo de request**.

**Conclusão: expor série por campanha é FILTRO, não ingest novo.** Esforço baixo.

### 1.3 Série diária por campanha

**Existe.** `meta_campaign_insights_daily`, grão diário, populada pelo sync (`meta-insights-cache.ts`). Não é só cache de período — `list_campaigns` (agregado) lê dessa mesma tabela.

### 1.4 Métricas de vídeo por anúncio

Persistidas em **`meta_ad_insights_daily.video_metrics`** (jsonb). Tipo `VideoMetrics` (`meta-ads.ts:339`):

| campo | existe no banco? | exposto no `get_creative_performance`? |
|---|---|---|
| `views3s` | ✅ | ✅ `videoViews3s` (`stage-creative-performance.ts:735`) |
| `p25` | ✅ | ❌ **não exposto** |
| `p50` | ✅ | ❌ não exposto |
| `p75` | ✅ | ✅ `videoViews75` (`:736`) |
| `p100` | ✅ | ❌ não exposto |
| `thruplay` | ✅ | ❌ não exposto |

O ingest **coleta** `video_p25/p50/p75/p100_watched_actions` (`meta-ads.ts:797-800`, `extractVideoMetrics`).

⚠️ **`video_3_sec_watched_actions` NÃO existe na API da Meta.** O 3s vem de `actions[].video_view` — está documentado em `meta-ads.ts:325` e foi decidido na Story 43.3. O brief pressupõe o campo `video_3_sec_*`; ele não existe.

---

## 2. Semântica dos campos (confirmada na origem)

### 2.1 `checkouts`
`actions[].initiate_checkout` do pixel — `public-meta.ts:173`. Corresponde ao `InitiateCheckout`, como o brief supõe. ✅

### 2.2 `leads` (pixel) vs `leads` (Loyola)
| | `get_stage_daily` | `get_stage_leads_summary` |
|---|---|---|
| origem | `parseLeads(row.actions)` — **pixel Meta** | planilha de leads do Loyola (`public-leads.ts`) |
| dedup | ❌ não | ✅ por e-mail/telefone ("leads únicos") |
| atribuição | evento do pixel na campanha | UTM da linha da planilha |

São números diferentes por construção. A regra 1 do brief manda usar o do Loyola.

### 2.3 Razão de somas ou média de médias?
**Razão de somas** — e isso está correto para o que o brief precisa.

`accumulate()` (`public-meta.ts:159-177`) soma os numeradores e denominadores dia a dia; `deriveMetrics()` (`public-meta.ts:180-211`) divide **depois**. Nenhuma média de médias diárias.

### 2.4 `spend` — gross-up
`applyMetaTax(parseFloat(row.spend), row.dateStart)` em `public-meta.ts:160`.
`packages/api/src/utils/meta-tax.ts:24` → `spend / (1 - 0.1215)` **quando `dateStart >= "2026-01-01"`**.

Confirma a regra 3 do brief: **nunca reaplicar**. Já houve bug de dupla cobrança (Story 29.27).

---

## 3. Venda e lead reais, por campanha

### 3.1 Venda por campanha — **não existe diretamente; é derivável**

Não há `campaignId` em `stage-sales-data.ts` nem em `public-funnel-sales.ts` (grep vazio).

O que existe: a venda carrega **`utmContent`** (`stage-sales-data.ts:485,525`), que é o **Ad ID**. E `meta_ad_insights_daily` tem `adId` **e** `campaignId`, com índice.

**Cadeia possível:** `venda.utm_content` → `adId` → `meta_ad_insights_daily.campaignId` → campanha.

**Nível mais fino disponível: anúncio (`adId`)** — mais fino que campanha, portanto.

> ⚠️ A cadeia tem perda conhecida: venda sem `utm_content` (orgânico, direto, recuperação, manual) fica **inatribuível**. Na tabela de LPs isso é ~20% das linhas em alguns funis. A Conv. Checkout por campanha só cobre a fração atribuída — ver Bloqueio **B1**.

### 3.2 Lead único por campanha
Mesmo mecanismo: a planilha de leads tem as 5 UTMs, incluindo `utm_content`. **Derivável pela mesma cadeia, com a mesma perda.**

---

## 4. Configuração e UI

### 4.1 Config de etapa
`funnel_stages` (`schema.ts:648`). Campos existentes relevantes: `campaigns` (jsonb `[{id,name}]`), `stageType`, `metaAccountId`, `lpLinks`, `leadGoal`, `projectionEndDate`, `dayNotes`, `googleAdsCampaigns`, `switchyFolderIds`.

**Não existe** nenhum campo de "campanha de referência".

### 4.2 Campanha de comparação — **não existe**
O que existe é **`funnels.compareFunnelId`** (`schema.ts:604`) — comparação **funil × funil**, não campanha × campanha. Usada em `stage-applications.ts` e no dashboard de lançamento.

**Para "campanha de referência" seria campo novo.** Esforço baixo (uma coluna), mas é decisão de produto — ver Pergunta P4.

### 4.3 Abas da tela de etapa
`packages/web/app/(app)/projects/[id]/funnels/[funnelId]/stages/[stageId]/page.tsx`, componente `Tabs` do shadcn. Cada aba é um `<TabsTrigger value="…">` (linhas 503-560) + `<TabsContent>`. Hoje: `meta-ads`, `analise-mvp`, `meta-ads-teste`, `youtube-ads`, `surveys`, `spreadsheets`, `switchy-links`, `lead-scoring`, `organic-media`, `mautic`, `ga4`, `nps`.

A visibilidade de várias abas é condicionada por `stageType`. A aba nova entra nesse padrão.

### 4.4 Cálculo de CAC já existente — **sim, e diverge**
`packages/api/src/services/traffic-analytics.ts:452`:

```ts
cac: totalPurchases > 0 ? totalSpend / totalPurchases : null
```

**É CAC por divisão simples (spend ÷ compras), não a cadeia multiplicativa do brief.** Os dois números não coincidem em geral. Ver Bloqueio **B4**.

Há também `perpetual-report-config.ts` com inputs de **"CAC alvo"** (Story 29.35) — outro conceito, terceiro lugar onde a sigla aparece.

Não encontrado: benchmark, teto, ranking de prioridade. Seriam novos.

---

## 5. Lacunas

| # | Lacuna | O que é preciso | Onde | Esforço |
|---|---|---|---|---|
| L1 | Série por campanha não é exposta | Novo endpoint/param filtrando por `campaignId` | `public-meta.ts` | **Baixo** — o dado já é diário por campanha |
| L2 | `p25` e `p100` não expostos | Ler do `video_metrics` já persistido | `stage-creative-performance.ts:735` | **Baixo** |
| L3 | "Conversão do hook" (25%÷3s) não existe | Métrica nova sobre dado existente | rota de criativos | **Baixo** |
| L4 | Venda por campanha não é derivada em lugar nenhum | Join `utm_content → adId → campaignId` | serviço novo | **Médio** — precisa lidar com a perda de atribuição |
| L5 | Campanha de referência não existe | Coluna nova + UI de seleção | `funnel_stages` + tela | **Médio** |
| L6 | Teto / piso / ranking não existem | Serviço de cálculo + persistência ou cache | novo | **Alto** |
| L7 | Aba nova | `TabsTrigger` + `TabsContent` + componente | `stages/[stageId]/page.tsx` | **Baixo** |
| L8 | Spec única aba ↔ Inácio | O cálculo precisa morar num só lugar consumido pelos dois | `shared` ou serviço da API | **Médio** — é decisão de arquitetura, ver P6 |

---

## 6. Bloqueios

### B1 — Conv. Checkout por campanha depende de atribuição parcial
A venda real só é atribuível por `utm_content`. Vendas sem UTM ficam de fora, e **a Conv. Checkout por campanha ficaria calculada sobre um numerador incompleto** enquanto o denominador (`initiate_checkout` do pixel) é completo. Isso **subestima** a conversão, e o erro varia por campanha.

*Alternativas (sem escolher):* (a) usar só a fração atribuída e rotular a cobertura; (b) usar `purchases` do pixel e rotular "proxy pixel", violando a regra 1; (c) excluir Conv. Checkout do CAC por campanha e calcular só até Conv. LP; (d) exigir cobertura mínima de atribuição para a campanha concorrer.

### B2 — `connectRate`/`lpRate` do endpoint usam `clicks`, não `linkClicks`
`public-meta.ts:204-205` divide por `a.clicks` (cliques totais). **O brief define Connect Rate = LP views ÷ cliques no link**, e a própria regra 2 do brief proíbe `clicks`.

Consumir o campo como está entrega um Connect Rate **sistematicamente menor** que o especificado. E o `lpRate` do payload **não é** o `Conv. LP` do brief (que é checkouts ÷ LP views) — os nomes colidem.

*Alternativas:* (a) calcular na aba a partir dos brutos, ignorando o campo; (b) corrigir o campo no endpoint (muda número já consumido pelo Inácio e por outras telas); (c) adicionar campo novo com nome distinto.

### B3 — `checkoutRate` do endpoint é pixel ÷ pixel
`public-meta.ts:208` = `purchases(pixel) ÷ checkouts`. O brief exige venda real do Loyola no numerador. Ver B1.

### B4 — Já existe um CAC com outra definição
`traffic-analytics.ts:452` calcula `spend ÷ purchases`. Se a aba nova produzir outro número sob o mesmo nome, o produto passa a ter **dois CACs divergentes**. O brief exige especificação única.

*Alternativas:* (a) migrar `traffic-analytics` para a cadeia nova; (b) renomear um dos dois; (c) manter os dois com rótulos explícitos.

### B5 — `stageType` do brief está incompleto
O brief cobre `free|cpl` e `paid|sales`. O tipo real (`packages/shared/src/types/funnel.ts:31`) tem **nove**: `paid · free · sales · cpl · event · event_capture · debriefing · comercial · lyrio`.

**`event_capture`** é captação com tráfego e venda de ingresso — comporta-se como `paid` (helper `ehCaptacaoPaga()` em `@loyola-x/shared/src/stage-types`). `lyrio` tem 7 campanhas ativas e ficaria fora de qualquer agrupamento.

Sem decidir isso, o teto agrupa errado. Ver P1.

---

## 7. Contagem de viabilidade do teto

### 7.1 Cobertura histórica

| projeto | mais antiga | mais recente | campanhas |
|---|---|---|---|
| FZ & MFB | 2025-08-25 | 2026-08-13 | 36 |
| BBE | 2026-03-13 | 2026-08-17 | 37 |
| DG & CPDF | 2026-04-17 | 2026-08-15 | 119 |
| Lyrio | 2026-06-22 | 2026-08-17 | 7 |
| PP | 2026-07-09 | 2026-08-17 | 4 |

### 7.2 Campanhas que passam cada piso — **por projeto + stageType**

| projeto | stageType | campanhas | ≥30k impr | ≥300 link clicks | ≥300 LPV | ≥50 checkouts |
|---|---|---:|---:|---:|---:|---:|
| BBE | **event_capture** | 6 | **0** | **0** | **0** | **0** |
| BBE | free | 18 | 11 | 11 | 9 | **2** |
| BBE | paid | 7 | 7 | 7 | 3 | **1** |
| DG & CPDF | free | 5 | 2 | 4 | 4 | **0** |
| DG & CPDF | paid | 87 | 20 | 29 | 22 | 17 |
| DG & CPDF | sales | 14 | 5 | 4 | 3 | **0** |
| FZ & MFB | free | 13 | 9 | 10 | 10 | **3** |
| FZ & MFB | paid | 10 | 2 | 2 | 1 | **1** |
| FZ & MFB | sales | 4 | 4 | 4 | 3 | **2** |
| Lyrio | lyrio | 7 | 5 | 5 | 1 | **1** |
| PP | free | 4 | 4 | 4 | 4 | 4 |

### 7.3 Leitura — **a régua não sobrevive como está**

**O piso de Conv. Checkout (≥50 `initiate_checkout`) elimina quase tudo.** Em 7 dos 11 grupos sobram **0, 1 ou 2** campanhas. Um teto calculado sobre 1 campanha **é a própria campanha** — a comparação não informa nada. Só `DG & CPDF / paid` (17) tem base real.

**`event_capture` do BBE não passa nenhum piso** — 6 campanhas, zero em todas as métricas. A única etapa desse tipo em produção nasceria sem teto.

**`Conv. LP` também aperta:** `BBE/paid` cai de 7 para 3, `FZ/paid` de 10 para 1.

Conforme o próprio brief prevê: *"se a resposta for 'quase nenhuma', o teto nasce vazio e precisamos rediscutir a régua antes de construir."* **É o caso.** Ver P7.

### 7.4 Estabilidade do `campaignId`

`campaign_id` é `varchar(64)` e a PK é `(project_id, campaign_id, date_start)` — **o histórico é por id, não por nome**. O nome vive em `meta_entity_names_cache` (`schema.ts:1897`), separado.

**Consequência:** campanha **renomeada** mantém o histórico (o id não muda) ✅. Campanha **duplicada** na Meta gera **id novo** e o histórico não se junta ❌.

**Não encontrado** qualquer mecanismo de identidade lógica de campanha ao longo do tempo (agrupamento por nome normalizado, chave canônica, tabela de aliases). Ver P5.

---

## 8. Perguntas

**P1 — Como os 9 `stageType` entram no agrupamento do teto?** `event_capture` se comporta como `paid` (helper existe), mas `event`, `comercial`, `lyrio` e `debriefing` não estão no brief. `lyrio` tem 7 campanhas ativas. Agrupar por tipo bruto ou por família (`ehCaptacaoPaga`)?

**P2 — Connect Rate: qual denominador vale?** O brief diz "cliques no link"; o endpoint usa cliques totais. Corrigir o endpoint (muda número que o Inácio já reporta) ou calcular à parte na aba?

**P3 — Conv. Checkout com atribuição parcial: o que é aceitável?** Numerador só da fração com `utm_content`, contra denominador completo do pixel. Rotular cobertura, exigir mínimo, ou não calcular?

**P4 — Campanha de referência: escopo e persistência.** É por etapa, por funil ou por projeto? Uma só ou várias? Onde o usuário escolhe?

**P5 — Identidade de campanha no histórico.** Campanha duplicada na Meta gera id novo. O teto deve considerar as duas como a mesma? Se sim, por qual chave — nome normalizado?

**P6 — Onde mora a "especificação única"?** A aba (web) e o Inácio (MCP → REST) precisam do mesmo número. O cálculo vai para `@loyola-x/shared` (consumido pelos dois), para um endpoint que a aba também consome, ou duplicado com teste de paridade?

**P7 — A régua do piso muda?** Com os números de 7.2, Conv. Checkout inviabiliza o teto em 7 de 11 grupos. Baixar o piso, usar janela histórica maior, tornar o piso relativo à base do projeto, ou aceitar teto ausente com rótulo?

**P8 — Hook Rate: qual alvo vale?** O brief diz **> 90%**; o código implementado diz **≥ 25%** (`stage-creative-performance.ts:144`). A fórmula bate (3s ÷ impressões), o alvo não.

**P9 — "Conversão do hook" (25% ÷ 3s) é métrica nova.** Confirma que deve ser criada, ou o pretendido era o Hold Rate (75% ÷ 3s) que já existe?

**P10 — Que janela de tempo a aba usa?** O brief não define período: últimos N dias, lançamento inteiro, range configurável? Isso muda o piso (7.2 foi contado sobre **todo** o histórico).

**P11 — `traffic-analytics.ts:452` deve ser migrado?** Ele calcula CAC por divisão simples hoje e alimenta outras telas.

---

## Critério de aceite — conferência

- ✅ Nenhum arquivo de aplicação criado ou alterado; nenhuma migration; nenhuma mudança de schema. Só este relatório.
- ✅ Toda afirmação aponta para identificador real (arquivo:linha, tabela, coluna, função).
- ✅ Campo não encontrado aparece como "não encontrado" (campanha de referência, identidade de campanha, benchmark/teto/ranking).
- ✅ Seção de perguntas não vazia — 11 perguntas.
