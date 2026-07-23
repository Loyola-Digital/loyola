# EPIC-39 — MCP Loyola X × Metodologia de Lançamento (gaps da auditoria)

**Origem:** auditoria da metodologia rodada via MCP (jul/2026) — mapa de gaps por tier, com legenda de esforço: 🟢 resolve no Loyola X · 🟠 depende do time de dados/conexão · 🔴 desenvolvimento de produto.

**Status:** tranches 1, 2 e 3 (Resumão v4) entregues. Pendentes: 39.3 (classificador fino — próxima), 39.4 (datas-chave), 39.5 restante (bump keywords + meio de pagamento), 39.10 (preview_link), 39.11 (connect real WhatsApp — decisão de fonte de dado), 39.12 (hasLandingPage).

---

## Stories (produto — 🔴/🟢 de código)

| Story | Tier | Título | Status |
|-------|------|--------|--------|
| 39.1 | 1.2 | **Mídia por etapa**: `GET .../stages/:stageId/daily` + tool `get_stage_daily` (agrega SÓ campanhas da etapa — mata a contaminação PG02+PG03+evergreen) | ✅ Done (tranche 1) |
| 39.2 | 2.1 | **UTMs completas**: leads-summary agora resolve as 5 UTMs (aliases + fuzzy) e expõe `byUtm` (distribuição por valor de source/medium/campaign/content/term, top 30) — matéria-prima do classificador. Cache recalculado em prod. | ✅ Done (tranche 2) |
| 39.3 | 2.2+2.3 | **Classificador fino + fallback** — v1 entregue (ver linha 39.3 na seção Inácio abaixo: byCanal/porCanal com regras default). Pendente: regras configuráveis por projeto (nomes de Closer) e fallback UTM-da-venda pro "Sem Track". | 🔶 Parcial |
| 39.4 | 1.3 | **Datas-chave por etapa**: marcos reais (abertura/fim de carrinho, reabertura, downsell) em `funnel_stages` (jsonb `key_dates`) + UI na etapa + expor em `list_stages`. Corrigir `leadGoal` residual do PG02 (799 → 1.952). | Backlog |
| 39.5 | 3.1+3.2 | **Produto + meio de pagamento nas vendas**: `porProduto` (top 30 por vendas/bruto) exposto no sales-daily ✅. Pendente: bump keywords (config) e coluna Plataforma/meio de pagamento pra excluir valor TMB. | 🔶 Parcial (tranche 2) |
| 39.6 | 3.3 | **Dedup na etapa Vendas**: sales-daily agora exclui planilhas `capture` (era a fonte das 2.283 "vendas") e dedupa por `txId+produto` — MESMA chave do dashboard. `subtypesConsidered` no payload pra auditar. | ✅ Done (tranche 2) |
| 39.7 | 4.1 | **Faixa (lead score A→D)**: `mapping.faixa` (Story 18.17, já existia no columnMapping) agora agregada no survey como pergunta "Faixa (lead score)" — com origem e byAdId de graça. | ✅ Done (tranche 2) |
| 39.8 | 6.1 | **Retenção/backfill do daily**: o script já existia (36.4) — backfill de 120 dias RODADO (7.316 ad-rows; 1 conta com erro transitório da Meta, reprocessável). Cache é append-only → histórico retido. | ✅ Done (tranche 2) |
| 39.9 | 6.2 | **linkClicks no público**: `linkClicks`/`ctrLink`/`cpcLink` em todos os endpoints Meta públicos (daily, stage-daily, campaigns, creatives). | ✅ Done (tranche 2) |
| 39.R1 | v4 #1 | **Elegibilidade do leads-summary**: cache de leads pra QUALQUER etapa com planilha de pesquisa (Lead Scoring deixou de ser pré-requisito) — 4 etapas `semDados` do PG02 resolvidas (3 → 9 stages com cache). | ✅ Done (Resumão v4) |
| 39.R2 | v4 #2 | **byQuestionByTerm**: os 5 blocos da metodologia (pagoHot/pagoCold/pagoTotal/organico/total) por utm_term no survey + `termDenominators`. ⚠️ pagoTotal ≠ hot+cold. | ✅ Done (Resumão v4) |
| 39.R3 | v4 #3 | **porOrigemTemperatura**: matriz Origem × Temperatura (utm_term da venda) no sales-daily — ROAS hot vs cold. | ✅ Done (Resumão v4) |
| 39.R4 | v4 #5/#7 | **lpRate + checkouts/checkoutRate**: alias honesto de connectRate (chegada na LP) + `initiate_checkout` do pixel e purchases÷checkouts em todos os objetos Meta. | ✅ Done (Resumão v4) |
| 39.R5 | v4 #6 | **surveyResponseRate**: survey cruza com cache de leads do mesmo stage → `totalLeads` + `totalResponses÷totalLeads×100` (null sem denominador). Meta: ≥75%. | ✅ Done (Resumão v4) |
| 39.B1 | v5 #1 | **Vendas manuais no sales-daily**: vendas lançadas no app (Evento Presencial/Vendas) entram na conta (`manualSalesIncluded`); reembolsadas fora; liquido = valor recebido (Caixa). Etapa de evento deixou de ser `semDados` (fa37ff0f: 9 vendas, R$ 270k). | ✅ Done (Brief v5) |
| 39.B2 | v5 #2 | **Custos operacionais da etapa**: tabela `stage_operational_costs` (venue/staff/logistica/hospedagem/alimentacao/marketing/outros) + CRUD interno + aba "Custos" no Evento Presencial + endpoint público `/operational-costs` + tool `get_stage_operational_costs`. Denominador do ROAS REAL do evento. | ✅ Done (Brief v5) |
| 39.B3 | v5 #3 | **Leads da Captação gratuita BBE**: já resolvido pela 39.R1 (elegibilidade ampliada) — stage 2b8bff9a com 214 leads no cache. | ✅ Done (via 39.R1) |
| 39.I1 | Inácio M1 | **Vendas do PERPÉTUO no sales-daily**: etapa free/paid de funil perpétuo herda a planilha `perpetual_sales` (n8n-Kiwify) do funil + reembolso sai via status. Os 4 perpétuos deixaram de ser `semDados` (bbe-fc1 27 vendas/R$9.369; pps1 213/R$14.535; dg-a1 2.141/R$170.748; fz-a1 1.501/R$85.487). Backfill rodado. | ✅ Done (Inácio jul/22) |
| 39.I2 | Inácio RS-02 | **metaCampaignCount** no list_funnels: contava só campanhas do funil (vinha 0 com campanhas na etapa) — agora é união distinct funil+etapas. | ✅ Done (Inácio jul/22) |
| 39.I3 | Inácio M2 | **Row-level de venda**: `GET .../stages/:id/sales-rows` + tool `get_stage_sales_rows` — 1 linha/transação com emailHash (sha256, zero PII), 5 UTMs, statusBucket, dataVendaRaw (fuso UTC do n8n preservado), plataforma (TMB filtrável) e amarração lead↔venda (leadCreatedAt → coorte D+x). | ✅ Done (aprovado 22/07) |
| 39.I4 | Inácio M-cross | **Cross-launch**: `GET .../projects/:id/cross-launch` + tool `get_cross_launch` — recompra entre funis por hash de e-mail server-side (buyers/funil, multiFunnelBuyers, overlaps direcionais). Cache diário no scheduler; backfill rodado (DG: 2.520 únicos, 105 multi-funil). Listas cumulativas Front/Comunidade seguem pendentes (precisam de feature pra conectar essas planilhas como entidade). | ✅ Done (aprovado 22/07) |
| 39.3 | 2.2+2.3 | **Classificador fino v1**: `byCanal` (leads-summary) + `porCanal` (sales-daily) com canais nomeados default (Closer, WhatsApp, ManyChat, Instagram, E-mail, YouTube, Meta/Google Ads) por utm_source+utm_medium. Backfill rodado — já ao vivo. Pendente da 39.3 original: config por projeto + fallback UTM-da-venda pro "Sem Track". | 🔶 Parcial (v1 22/07) |
| 39.B4 | v6 #1 | **get_stage_daily sem from/to = série completa**: default de 30d devolvia `days:[]` pra lançamento encerrado (BBE mar/26 tinha 1.140 ad-rows no cache, fora da janela). `range` retorna o intervalo efetivo. | ✅ Done (Brief v6) |
| 39.B5 | v6 #6 | **porPlataforma + porProdutoPlataforma** no sales-daily: plataforma = subtype da planilha (tmb separável sem depender do nome do produto) ou "manual". | ✅ Done (Brief v6) |
| 39.B6 | v6 #5 | **Dedup por email_sha256** (LGPD): alias com prioridade sobre coluna email vazia — FZ destrava uniqueLeads quando a Fernanda adicionar a coluna. | ✅ Done (Brief v6) |
| 39.B7 | v6 #7 | **spendIncludesMetaTax: true** em todas as respostas Meta — selo anti-dupla-taxação (o auditor tentou reaplicar ÷0,8785 duas vezes). | ✅ Done (Brief v6) |
| 39.10 | v4 #4 | **preview_link nos criativos**: Graph API `/{ad-id}/previews` no sync de criativos + expor em `get_creative_performance` (link clicável do anúncio). | Backlog |
| 39.11 | v4 #5b | **Connect real de WhatsApp**: taxa de resposta/atendimento de fato. O dado NÃO entra no Loyola X por nenhuma integração hoje — precisa decidir a fonte (Evolution API? planilha do comercial? webhook ManyChat?) antes de codar. | Backlog (decisão) |
| 39.12 | v4 #8 | **hasLandingPage**: flag no funil/etapa dizendo se há LP no fluxo (define se lpRate/CPL de LP se aplicam ou se o funil é clique-direto-WhatsApp). | Backlog |
| 39.13 | v5 #5 | **Endpoint especializado de evento**: attendees, no_show_rate, comparecimento × venda. Depende de o dado de presença entrar no app (lista de presença/check-in). | Backlog (decisão) |
| 39.14 | v5 #11 | **Scoring B2B derivado** (A/B/C/D por faturamento+funcionários) quando stageType=event. | Backlog |

## Respostas 6.2 (autoritativas, do código)

- **Imposto no spend:** gross-up de **12,15% "por dentro"** (`spend / (1 − 0,1215)`), aplicado SÓ a datas ≥ 2026-01-01 (`utils/meta-tax.ts`, `META_TAX_RATE = 0.1215`). O spend dos endpoints públicos **já vem com imposto** — ⚠️ nunca reaplicar ×1,13 (dupla razão: reaplicaria, e 13% nem é a taxa).
- **clicks no `get_daily`:** cliques **totais** da Meta (campo `clicks` cru), não `link_click`. CTR/CPC públicos derivam do total. (No dashboard interno, o Detalhamento usa link clicks com fallback — Story 29.20.) Ação → story 39.9.

## Checklist operacional (🟢 sem código — time)

- [ ] **1.1** Criar funis `dg-pg01` e `dg-pg03` no app (dg-pg03 tem campanhas na conta sem funil); decidir o que é nativo vs fixture.
- [ ] **2.4** Padronizar `hot`/`cold` no nome de TODA campanha de captação (sem isso vira "Pago indefinido").
- [ ] **4.3** Limpar tracking com `{{ad.id}}` literal no `utm_content` (macro não resolvida no Meta Ads).
- [ ] **1.3** Levantar os marcos reais do PG02 pra popular quando a 39.4 entrar.

## Dependentes externos (🟠/🔴 fora do app)

- **5.1–5.3** Coorte D+x, listas Front/Comunidade, cross-launch — exigem row-level/PII: decisão de produto (Loyola X passa a calcular ou seguem via arquivo).
- **3.3** parte 🟠: garantir que a planilha de vendas tenha chave de transação consistente.

## Princípios (herdados da auditoria)

- `get_stage_*` é a família canônica — análises de lançamento NUNCA devem usar os endpoints de projeto inteiro quando existir variante por etapa.
- Gate Fase 8: nunca inventar dimensão que a pesquisa não tem (4.2) — o `get_stage_survey` já lista as perguntas existentes; manter.
