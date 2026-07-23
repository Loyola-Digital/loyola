# Loyola X → Inácio: resposta ao mapeamento de consultas (jul/2026)

> **Doc de integração — como consumir o que foi entregue e como foi construído.**
> Autor: Dex (dev Loyola X) · Data: 2026-07-22 · Responde ao doc "Consultas de dados do Inácio → Integração com o Loyola X" (40 fichas, M1–M25).
> Referência canônica da API: `docs/llms.txt`. Guia anterior (Epic 39): `docs/guides/mcp-epic39-consumo.md`.
> ⚠️ Anti-invenção mantida: o que NÃO está neste doc ou no llms.txt não existe — não deduza endpoint.

---

## 1. Resumo executivo — o que mudou pra você

| Sua necessidade | Estado | Tool/Campo |
|---|---|---|
| **M1** Vendas reais n8n-Kiwify (perpétuo `semDados`) | ✅ **AO VIVO** | `get_stage_sales_daily` agora cobre os 4 perpétuos |
| **M2** Row-level de venda (transação a transação) | ✅ Entregue* | `get_stage_sales_rows` (novo) |
| Cross-launch (recompra entre funis) | ✅ Entregue* | `get_cross_launch` (novo) — cache já populado |
| Classificador fino de canal (Closer/WPP/ManyChat/IG) | ✅ v1 **AO VIVO** | `byCanal` (leads-summary) + `porCanal` (sales-daily) |
| **RS-02** `metaCampaignCount` = 0 | ✅ Corrigido* | `list_funnels` conta funil+etapas (distinct) |
| Faixa A→D + byAdId | ✅ Já existia | `get_stage_survey` (39.7) |
| Custos de evento + vendas de evento | ✅ Já existia | `get_stage_operational_costs` + vendas manuais no sales-daily |
| Separação ingresso × bump × TMB | ✅ Já existia | `porProduto` + `porPlataforma`/`porProdutoPlataforma` |
| Listas cumulativas Front/Comunidade | ❌ Pendente | Precisa de feature de conectar essas planilhas como entidade |
| Config de canal por projeto + fallback UTM-da-venda | ❌ Pendente | 39.3 restante |

\* "Entregue*" = código mergeado; a **rota** responde depois do próximo deploy da API. Os itens "AO VIVO" já respondem agora porque são dados de cache que os endpoints atuais espalham. As 2 **tools novas** exigem o bundle MCP atualizado no teu gateway (Lucas providencia).

---

## 2. M1 — Vendas do perpétuo no `get_stage_sales_daily` (AO VIVO)

**Causa raiz do teu `semDados`:** funil perpétuo guarda as vendas na planilha do **FUNIL** (`perpetual_sales` — a n8n-Kiwify), não em planilha de etapa. O sync só olhava etapas. Corrigido: a etapa de dashboard (`free`/`paid`) **herda a planilha do funil**.

Verificado em prod (22/07):

| Funil | Stage | Resultado |
|---|---|---|
| bbe-fc1-mai-26 | `a08ccc49…` (o teu exemplo) | 27 vendas · R$ 9.369 |
| pps1 / Aquisição | `bf028a9e…` | 213 vendas · R$ 14.535 |
| dg-a1 | `abaeb32e…` | 2.141 vendas · R$ 170.748 |
| fz-a1 | `fd2d424f…` | 1.501 vendas · R$ 85.487 |

**Regras:** `subtypesConsidered: ["perpetual_sales"]` sinaliza a fonte; reembolso/chargeback SAEM quando a coluna status está mapeada (mesmo critério do dashboard); esse faturamento é a fonte de verdade transacional — **não** o `roas` do pixel.

---

## 3. `get_stage_sales_rows` — row-level de venda (39.I3)

`GET /api/public/v1/projects/{projectId}/stages/{stageId}/sales-rows` — **1 linha por TRANSAÇÃO**, mesmas fontes do sales-daily (`resolveSalesSheetsForStage`: subtypes de venda + capture-fallback em paid + herança do perpétuo). Leitura AO VIVO da planilha (cache de 30s).

```jsonc
{
  "projectId": "…", "stageId": "…", "stageName": "…",
  "sheetSources": [{ "subtype": "perpetual_sales", "sheetName": "n8n-kiwify", "rows": 213 }],
  "totalRows": 213,
  "rows": [{
    "txId": "abc123",
    "emailHash": "sha256-hex",          // NUNCA e-mail cru — LGPD
    "produto": "…", "plataforma": "perpetual_sales",
    "valorBruto": 297, "valorLiquido": 267.3,
    "dataVendaRaw": "2026-07-15T14:03:22.000Z",  // célula CRUA (n8n grava UTC!)
    "dataVenda": "2026-07-15",                    // só a data, parseada
    "statusBucket": "paid",             // paid | refunded | chargeback | other
    "utmSource": "…", "utmMedium": "…", "utmCampaign": "…", "utmContent": "…", "utmTerm": "…",
    "origem": "Pago", "canal": "Meta Ads", "temperatura": "frio",
    "leadMatch": true,
    "leadUtmSource": "…", "leadUtmTerm": "…",
    "leadCreatedAt": "2026-07-10"       // → coorte D+x
  }]
}
```

### Regras de leitura (importam — erram sempre)

1. **SEM dedup.** As linhas vêm cruas. A chave de dedup do dashboard é `txId + produto` (order bump do mesmo pedido = venda separada; retry literal = duplicata a descartar). Deduplique você.
2. **Reembolsos INCLUÍDOS.** `statusBucket` diz o que é (`refunded`/`chargeback`) — filtre pra bater com o faturamento do agregado. Estão aí de propósito, pro teu teste de dedup/estorno.
3. **Fuso é problema teu (de propósito).** `dataVendaRaw` preserva a célula como está — o n8n grava UTC (`…Z`), a Meta reporta em BRT (UTC−3). O corte UTC→BRT que muda 11→9 vendas no teu gabarito é feito por você com o raw. `dataVenda` é só a data parseada, sem promessa de fuso.
4. **TMB sai por `plataforma !== "tmb"`** — não pelo nome do produto (o TMB pode vir com o MESMO nome do principal).
5. **Coorte D+x** = `dataVenda − leadCreatedAt` quando `leadMatch: true`. A amarração lead↔venda é por e-mail (server-side) contra a pesquisa da etapa (mesma elegibilidade do leads-summary: lead scoring > survey da etapa). `leadMatch: false` = comprador que não está na pesquisa — não invente coorte pra ele.
6. **UTMs**: mapping da planilha primeiro; fallback pros headers curtos do n8n (`s=`, `m=`, `c=`, `co=`, `t=`), com match exato pra `co=` não engolir `t=`.
7. **`emailHash`** = sha256 do e-mail lowercase — a MESMA chave do cross-launch e do `email_sha256` do dedup de leads. Junte datasets por ela; e-mail cru não existe na API.

---

## 4. `get_cross_launch` — recompra entre funis (39.I4)

`GET /api/public/v1/projects/{projectId}/cross-launch` — pré-computado (cache diário no scheduler; `semDados` = sync pendente). Match por sha256 de e-mail **server-side** — zero PII trafega.

```jsonc
{
  "projectId": "…", "computedAt": "…",
  "funnels": [{ "funnelId": "…", "name": "dg-pg02", "type": "launch", "buyers": 2222, "faturamentoBruto": 233572.94 }],
  "totalUniqueBuyers": 2520,
  "multiFunnelBuyers": 105,
  "overlaps": [{ "funnelA": "dg-pg02", "funnelB": "dg-a1", "sharedBuyers": 105, "aThenB": 71, "bThenA": 30 }]
}
```

**Semântica:** `sharedBuyers` = compradores nos DOIS funis. `aThenB` = quantos têm a **1ª compra** em A antes da 1ª em B (recompra direcional A→B). `aThenB + bThenA` pode ser < `sharedBuyers` (compras sem data ou no mesmo dia não entram na direção). Vendas reembolsadas ficam fora; dedup por txId+produto por planilha.

Números reais já no cache (22/07): DG = 2.520 únicos / **105 multi-funil** · PPS = 1.814 / 29 · BBE = 52 / 0.

---

## 5. Classificador fino v1 — `byCanal` / `porCanal` (39.3, AO VIVO)

- `get_stage_leads_summary` → **`byCanal`**: `[{canal, leads, uniqueLeads}]`
- `get_stage_sales_daily` → **`porCanal`**: `[{canal, vendas, bruto, liquido}]`

Canais: `Meta Ads · Google Ads · Closer · ManyChat · WhatsApp · Instagram · E-mail · YouTube · Outros · Sem Track`.

**Regras default (ordem importa; utm_source+utm_medium concatenados):** `closer|vendedor` → Closer · `manychat` → ManyChat · `whats|wpp|zap` → WhatsApp · `instagram|bio|link_in_bio|ig` → Instagram · `e-mail|mautic|activecampaign` → E-mail · `youtube|yt` → YouTube · source pago conhecido → Meta/Google Ads · qualquer outro preenchido → Outros · vazio → Sem Track.

**Limites do v1 (não invente):** regras são hardcoded — nomes específicos de Closer por projeto e o fallback UTM-da-venda pro "Sem Track" (o teu "real PG02 = 10, não 31") ainda NÃO existem. `byOrigin` continua existindo pra compatibilidade; pro canal fino use `byCanal`.

---

## 6. RS-02 — `metaCampaignCount` corrigido

Era bug: contava só `funnels.campaigns` (nível funil), e as campanhas hoje vivem nas **etapas** → vinha 0. Agora é a **união distinct** (funil + todas as etapas). Continua valendo a tua checagem: compare com `get_stage_daily.campaignIds` pra achar campanha shadow.

---

## 7. Como foi construído (pra você confiar no número)

- **Fontes**: exatamente as MESMAS do dashboard interno — `resolveSalesSheetsForStage` é compartilhado entre o agregado (sales-daily), o row-level e o cross-launch. Não há pipeline paralelo: se divergir do dashboard, é bug, reporte.
- **Dedup** replicado do all-sales do dashboard (`txId+produto`, por planilha).
- **Reembolso** via `classifyRefundStatus` (sinônimos PT/EN + substring — "reembolsado", "estorno", "chargeback"...), mesmo módulo do dashboard.
- **Hash**: sha256 de `trim(lowercase(email))` — determinístico, junta com o `email_sha256` do dedup de leads e entre quaisquer respostas da API.
- **Caches** em `public_metrics_cache`: sales-daily e cross-launch são pré-computados (scheduler diário + backfill manual); sales-rows é leitura ao vivo (dado quente, sem cache além dos 30s do Sheets).

## 8. Ainda NÃO existe (não invente)

- **Listas cumulativas Front/Comunidade** — o app não tem onde "conectar" essas planilhas como entidade; feature de produto pendente.
- **Config de canal por projeto** (nomes de Closer) e **fallback UTM-da-venda** — 39.3 restante.
- **Coorte server-side** — o D+x é cálculo teu em cima do row-level (de propósito: a regra de corte é tua).
- E-mail/telefone crus — nunca; só hash.
