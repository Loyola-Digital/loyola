# EPIC-41 — Gerador de Resumão e Comparativo (dois botões na etapa)

**Origem:** especificação técnica "Gerador de Resumão e Comparativo Loyola" (jul/2026), derivada da implementação validada que hoje roda **fora do app** — o Claude da gestora consome a API pública (Epic 36) via MCP (Epic 39) e publica o HTML em `sprint_reports`.

**Objetivo:** internalizar essa geração. Dois botões dentro da etapa do funil produzem, **deterministicamente a partir do banco**, o Resumão de 1 lançamento e o Comparativo entre 2 — com invariantes que bloqueiam número errado antes de renderizar.

**Criado:** 2026-07-27 (@sm — River)
**Status:** Draft (6 stories)

---

## 🎯 Por que este epic existe

Hoje o Resumão é um artefato de IA: alguém pede ao Claude, ele lê a API pública, calcula a metodologia **no prompt** e POSTa o HTML em `/api/public/v1/reports` (`packages/api/src/routes/sprint-reports.ts`). Isso tem três problemas que a spec ataca de frente:

1. **Não é reprodutível.** Duas rodadas podem divergir. A spec exige 9 invariantes que bloqueiam a geração (§8.1) e valores de conferência casa a casa (§10).
2. **Texto narrativo mente.** Caso real documentado na spec: o relatório continuou dizendo *"a conversão piorou de 1,74% para 1,98%"* depois de uma reclassificação — a conversão tinha **melhorado**, mas a frase estava fixa no template. §6 proíbe qualquer número ou adjetivo literal.
3. **Depende de alguém lembrar de rodar.** Vira botão.

## 🧭 Decisão arquitetural que atravessa o epic

**As "4 views" do §1 da spec NÃO são construídas do zero.** A metodologia já está implementada no backend — o epic monta a camada de relatório **em cima** dela:

| Contrato §1 | Fonte real no Loyola X |
|---|---|
| `v_campanhas` / `v_ads` | `public-meta.ts:533` (stage-daily — só campanhas da etapa), `stage-creative-performance.ts` (ad-level), `meta-insights-cache.ts` |
| `v_vendas` | `public-sales-rows.ts:88` (row-level: txId, produto, 5 UTMs, statusBucket, temperatura) + `stage-sales-data.ts` (agregado, ingressos únicos, order bump) |
| `v_pesquisa` | `survey-aggregation.ts:188` (`computeSurveyForStage` — 5 blocos `pagoHot/pagoCold/pagoTotal/organico/total`, Faixa A→D, `byAdId`) + `lead-origin-sync.ts:138` |
| `v_lancamento_config` | **não existe** → Story 41.1 |
| `v_expert_config` | **não existe** → Story 41.1 ("expert" = `projects`; "lançamento" = `funnels`; "etapa" = `funnel_stages`) |

O que **já está resolvido** e não deve ser reescrito: imposto 12,15% por gross-up (`utils/meta-tax.ts`), dedup de ingresso único pela compra mais recente (`stage-sales-data.ts:650-716`), order bump por `stageSalesSpreadsheets.orderBumpProducts` (`schema.ts:761`), origem Pago/Orgânico/Sem Track (`PAID_UTM_SOURCES`), hot/cold por substring (`funnel-metrics.ts:414-435`), classificação de etapa por prefixo (`services/stage-phase.ts:22-42`), Faixa por criativo (`byAdId`).

O que **não existe** e é o trabalho real: config por lançamento/expert + gate de escopo, reconciliação campaign×ad, detecção de preço contaminado/moeda estrangeira, os 9 invariantes, a agregação de destaques por anúncio com reescala, o render HTML sem literal narrativo, a decomposição de ROAS e os cenários hipotéticos, a persistência e os botões.

## ⚠️ Escopo de validação (§12) — inegociável

A spec inteira foi validada para **uma** combinação: expert **Danilo Gato**, tipo **Pago**, etapa **Captação** (`vendas-captacao`), lançamentos DG-PG02-ABR26 e DG-PG04-JUL26.

Qualquer outra combinação (Gratuito/FZ, Perpétuo/BBE, `vendas-principal`, downsell) **deve devolver 422 `COMBINACAO_NAO_VALIDADA`** até passar pelo checklist §12.7. Isso é uma story própria (41.1) e é pré-requisito das demais — não é uma flag opcional a ser adicionada depois.

## 📋 Stories

| Story | Título | Depende de | Estimativa |
|-------|--------|-----------|-----------|
| **41.1** | Config de lançamento/expert + gate de escopo não validado (§1.5, §1.6, §12) | — | M |
| **41.2** | Motor de cálculo do Resumão — pipeline §2 + catálogo §3 | 41.1 | L |
| **41.3** | Guardas de qualidade — 9 invariantes bloqueantes + 8 alertas (§8) | 41.2 | M |
| **41.4** | Destaques por anúncio — reescala de spend, filtro ≥1%, rankings (§3.8, §7.2) | 41.2 | M |
| **41.5** | Render do Resumão + persistência + botão na etapa (§4, §6, §7.4, §9.1) | 41.2, 41.3, 41.4 | L |
| **41.6** | Comparativo — decomposição de ROAS + cenários hipotéticos (§5, §7.3, §9.2) | 41.5 | L |

**Ordem de merge:** 41.1 → 41.2 → (41.3 ‖ 41.4) → 41.5 → 41.6.

## 🚧 Fora do escopo do epic

- Perpétuo (§12.5 — exige spec própria: CAC, margem de contribuição, janela móvel; a spec **recomenda** um terceiro botão separado).
- Gratuito (§12.3 — 🟡 PARCIAL; o `Connect Rate` não tem fonte no dado e precisa ser definido antes).
- Etapas `vendas-principal` / downsell (§12.6 — a atribuição de origem pode vir de etapa anterior; regra indefinida).
- Substituir a aba Sprint / `sprint_reports` (segue existindo para os relatórios de IA da gestora).
- Reescrever a metodologia já implementada (imposto, únicos, hot/cold, Faixa).

## 📌 Riscos de epic

- **R-E1 (alto) — Os números têm que bater com a §10.** Dois lançamentos reais com 20+ valores conferidos casa a casa. Se a implementação divergir, é bug, não "diferença de metodologia". Cobrir em AC de 41.2/41.4/41.6.
- **R-E2 (médio) — Rate limit da Meta.** Regra vigente do projeto: consultas Meta em lote, ler do banco, API só quando faltar dado recente. O gerador **não** pode virar um novo caminho de fan-out por criativo.
- **R-E3 (médio) — Escopo vaza.** É tentador "só habilitar pro FZ que é parecido". §12.2 existe exatamente para impedir isso; o gate é código, não convenção.
- **R-E4 (baixo) — HTML gigante.** `sprint_reports` já teve que colocar teto de 5MB. Herdar o mesmo limite.

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-07-27 | @sm (River) | Epic criado a partir da spec técnica. Decisão-chave: as 4 views do §1 mapeiam para serviços já existentes (survey-aggregation, lead-origin-sync, stage-sales-data, public-meta/sales-rows) — o epic entrega a camada de relatório, não a metodologia. Decisões de UI confirmadas com o usuário: botões **na etapa do funil**, HTML **persistido** (padrão `sprint_reports`), entrega em **6 stories fatiadas**. |
