# EPIC-39 — MCP Loyola X × Metodologia de Lançamento (gaps da auditoria)

**Origem:** auditoria da metodologia rodada via MCP (jul/2026) — mapa de gaps por tier, com legenda de esforço: 🟢 resolve no Loyola X · 🟠 depende do time de dados/conexão · 🔴 desenvolvimento de produto.

**Status:** 39.1 entregue (tranche 1). Demais em backlog priorizado.

---

## Stories (produto — 🔴/🟢 de código)

| Story | Tier | Título | Status |
|-------|------|--------|--------|
| 39.1 | 1.2 | **Mídia por etapa**: `GET .../stages/:stageId/daily` + tool `get_stage_daily` (agrega SÓ campanhas da etapa — mata a contaminação PG02+PG03+evergreen) | ✅ Done (tranche 1) |
| 39.2 | 2.1 | **UTMs completas**: `lead-origin-sync` lê só `utm_source`/`utm_term` (confirmado no código, linha 30-31) → ler/mapear `utm_medium`, `utm_content`, `utm_campaign` nas planilhas de leads e vendas; expor nos summaries. Pré-requisito do 39.3. | Backlog |
| 39.3 | 2.2+2.3 | **Classificador fino + fallback**: regras configuráveis (Closer, IG, WhatsApp, ManyChat...) além dos 3 baldes Pago/Orgânico/Sem Track; "Sem Track" classificado pela UTM do lead e, se vazia, pela UTM da venda (real PG02 = 10, não 31). Nomes de Closer vindos de config do projeto/expert. | Backlog |
| 39.4 | 1.3 | **Datas-chave por etapa**: marcos reais (abertura/fim de carrinho, reabertura, downsell) em `funnel_stages` (jsonb `key_dates`) + UI na etapa + expor em `list_stages`. Corrigir `leadGoal` residual do PG02 (799 → 1.952). | Backlog |
| 39.5 | 3.1+3.2 | **Produto + meio de pagamento nas vendas**: coluna Produto + classificação bump/ingresso (bump keywords); coluna Plataforma/meio de pagamento pra excluir valor TMB mantendo a venda. | Backlog |
| 39.6 | 3.3 | **Dedup na etapa Vendas**: garantir chave de transação no summary público (2.283 linhas → 70 vendas principais dedupadas). O dedup por `transactionId+produto` já existe no all-sales interno — replicar no público. | Backlog |
| 39.7 | 4.1 | **Faixa (lead score A→D)** no mapeamento da pesquisa + exposta no `get_stage_survey` (destrava a Fase 9). | Backlog |
| 39.8 | 6.1 | **Retenção/backfill do daily**: `get_daily` voltou vazio pra abr/mai (janela histórica fora do cache). Backfill do lançamento + política de retenção. | Backlog |
| 39.9 | 6.2 | **linkClicks no público**: expor `linkClicks`/`ctrLink` nos endpoints públicos (hoje `clicks` = cliques TOTAIS da Meta, não link_click). | Backlog |

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
