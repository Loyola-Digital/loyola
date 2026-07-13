# MCP Loyola X — Guia de consumo das novidades (Epic 39, jul/2026)

> Doc voltado pra **outra IA** que consome o MCP `@loyola-x/mcp` (ou a API pública direto).
> Referência completa da API: `docs/llms.txt` (atualizada). Aqui: **o que mudou, por quê, e receitas**.
> Contexto: estas melhorias respondem à auditoria da metodologia de lançamento (EPIC-39,
> `docs/stories/epics/epic-39-mcp-methodology-gaps.md`).

---

## Regra de ouro nova: ETAPA PRIMEIRO

Os endpoints de projeto (`get_daily`, `list_campaigns`, `get_creative_performance`) misturam
**todos os funis + campanhas evergreen** do projeto no mesmo balde. Para qualquer análise de
lançamento/etapa, use a família `get_stage_*`:

| Pergunta | Tool |
|---|---|
| Investimento/tráfego da etapa por dia | `get_stage_daily(projectId, stageId, from?, to?)` **← NOVO** |
| Leads por origem/temperatura + UTMs cruas | `get_stage_leads_summary(projectId, stageId)` |
| Qualificação (perguntas, Faixa A→D, por criativo) | `get_stage_survey(projectId, stageId)` |
| Vendas/faturamento por dia/origem/produto | `get_stage_sales_daily(projectId, stageId)` |

Descoberta de IDs: `list_projects` → `list_funnels(projectId)` → `list_stages(funnelId)`. Não adivinhe IDs.

---

## O que há de novo, tool a tool

### 1. `get_stage_daily` — NOVO (mata a contaminação de mídia)

Série diária Meta agregada **só das campanhas vinculadas à etapa**. O retorno traz
`campaignIds: [...]` — confira esse array pra saber exatamente o que entrou no balde.
Etapa sem campanha vinculada → `days: []` (não é erro; é etapa orgânica ou sem vínculo).

```
get_stage_daily(projectId, stageId, from="2026-04-01", to="2026-05-31")
→ { stageId, stageName, campaignIds, range, partial, lastSyncedAt,
    days: [{ date, spend, impressions, clicks, linkClicks, ctrLink, cpcLink,
             leads, cpl, landingPageViews, connectRate, ... }] }
```

### 2. `get_stage_leads_summary` — ganhou `byUtm` + `columnsResolved` completo

- `columnsResolved` agora reporta as **5 UTMs**: `{ utmSource, utmTerm, utmMedium, utmContent, utmCampaign, email, phone }`.
- **`byUtm`** = distribuição crua de leads por valor de cada UTM (top 30 + `"(outros)"`;
  vazio = `"(vazio)"`; valores lowercase):

```
byUtm: {
  source:   [{ value: "meta", leads: 1420 }, { value: "closer-joao", leads: 22 }, ...],
  medium:   [...], campaign: [...], content: [...], term: [...]
}
```

- **`identifiersFilled: {email, phone}`** (QA jul/13): quantas linhas têm o identificador
  PREENCHIDO. `uniqueLeads: 0` com `identifiersFilled: {email:0, phone:0}` = planilha
  anônima (colunas existem, valores não) — limitação do dado, não bug.
- `range` agora vem em ISO (o bug do range invertido com datas DD/MM foi corrigido).

**Uso correto:** os 3 baldes de `byOrigin` (Pago/Orgânico/Sem Track) são grosseiros.
Antes de afirmar que um canal "não existe" (Closer, ManyChat, WhatsApp, IG bio...),
**inspecione `byUtm.source` e `byUtm.medium`** — é lá que os canais finos aparecem.
O classificador fino configurável (39.3) ainda não existe; até lá, classifique você a partir do `byUtm`.

### 3. `get_stage_survey` — Faixa (lead score A→D)

Quando a etapa tem a coluna Faixa mapeada, ela entra como pergunta:

```
questions: [..., { key: "faixa", label: "Faixa (lead score)" }]
byQuestion.faixa: [{ label: "C", count, pct }, { label: "B", ... }, ...]
byQuestionByOrigin.pago.faixa / organico.faixa   ← Faixa × origem
byAdId.<adId>.faixa                              ← Faixa × criativo (Fase 9!)
```

Se `"faixa"` NÃO estiver em `questions`, a etapa não tem a coluna mapeada — reporte isso, não invente.
Gate da Fase 8 continua: só use as perguntas listadas em `questions`.
QA jul/13: dedupe SEMÂNTICO da Faixa — com `mapping.faixa` configurado ele é a fonte
canônica; qualquer pergunta chamada "Faixa" sai do payload (planilhas reais têm duas
colunas de faixa, uma incompleta). Só a chave `faixa` existe. `byAdId` só com ad ids
reais (numéricos ≥10 dígitos — "org"/"link_in_bio"/"{{ad.id}}" ficam fora).

### 4. `get_stage_sales_daily` — dedup real + produto

- **`totalVendas` agora é dedupado por `transactionId + produto`** (mesma chave do dashboard
  interno): order bump do mesmo pedido = venda separada; retry literal = colapsado.
- **Planilhas de captação ficam FORA** — só subtypes de venda contam (`subtypesConsidered`
  no payload mostra quais entraram: `main_product`/`sales`/`tmb`/`event_sales`).
  Se historicamente você viu milhares de "vendas" numa etapa, era captação contaminando.
- **`porProduto`** (novo): `[{ produto, vendas, bruto, liquido }]` top 30 — separe
  ingresso × order bump pelas keywords do nome do produto. `"(sem produto)"` = coluna não mapeada.
- Origem da venda = `utm_source` **da própria linha de venda** (não do lead).

### 5. Todos os endpoints Meta — `linkClicks`/`ctrLink`/`cpcLink`

- `clicks` (e `ctr`/`cpc`) = cliques **TOTAIS** da Meta (inclui curtida, clique no perfil...).
- `linkClicks` = evento `link_click` (tráfego real) · `ctrLink` = linkClicks/impressões ·
  `cpcLink` = spend/linkClicks. **Para análise de tráfego, use as variantes link.**

### 6. Histórico do `get_daily`/`get_stage_daily`

Backfill de 120 dias executado (abr/mai cobertos) e o cache é **append-only** — o histórico
carregado fica retido. `partial: true` continua significando "há dias sem dado no cache" —
confie no flag, não assuma.

---

## Regras de interpretação (reforço — erram sempre)

1. **`spend` JÁ inclui o imposto Meta**: gross-up de **12,15% "por dentro"** (`spend ÷ (1−0,1215)`),
   só para datas ≥ 2026-01-01. **NUNCA reaplique** (nem ×1,13 — não é a taxa nem o método).
2. **`roas` dos endpoints Meta é do PIXEL.** ROAS real = `faturamentoBruto` (get_stage_sales_daily)
   ÷ `spend` (get_stage_daily), combinando por `date`.
3. Métricas derivadas vêm `null` com denominador 0; `reach` é soma diária (não alcance único).
4. `computedAt` (caches de leads/survey/vendas) e `lastSyncedAt` (Meta) dizem o frescor — cite-os.

## Receitas prontas

**ROAS real de uma etapa, por dia:**
```
A = get_stage_daily(p, s, from, to)          → spend por date
B = get_stage_sales_daily(p, s)              → faturamentoBruto por date
ROAS_real[date] = B.byDay[date].faturamentoBruto / A.days[date].spend
```

**Achar vendas do Closer (enquanto o classificador 39.3 não existe):**
```
L = get_stage_leads_summary(p, s)
candidatos = valores de L.byUtm.source + L.byUtm.medium que casem /closer|nome-do-closer/i
→ reporte a contagem desses valores; NÃO use byOrigin pra isso (Closer cai em "Orgânico"/"Sem Track")
```

**Qualificação por criativo (Fase 9):**
```
S = get_stage_survey(p, s)         → S.byAdId.<adId>.faixa (distribuição A→D por criativo)
C = get_creative_performance(p)    → cruzar pelo adId (nome, spend, cpl do criativo)
```

**Vendas do principal (sem contaminação):**
```
V = get_stage_sales_daily(p, s)
→ V.totalVendas já é dedupado e sem captação; confira V.subtypesConsidered no relatório
→ ingresso × bump: particione V.porProduto pelas keywords de produto
```

## Ainda NÃO existe (não invente)

- **Classificador fino configurável** (Closer/IG/WPP/ManyChat como baldes nomeados) e
  **fallback UTM-da-venda para "Sem Track"** — 39.3, em backlog. Use `byUtm` manualmente.
- **Datas-chave da etapa** (abertura/fim de carrinho, reabertura) — 39.4.
- **Meio de pagamento** (excluir valor TMB) e **bump keywords** como config — resto da 39.5.
- Coorte D+x, listas Front/Comunidade, cross-launch (PII row-level) — decisão de produto pendente.
