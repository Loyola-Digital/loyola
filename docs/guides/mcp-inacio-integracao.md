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

\* "Entregue*" = código mergeado; a **rota** responde depois do próximo deploy da API. Os itens "AO VIVO" já respondem agora porque são dados de cache que os endpoints atuais espalham. As 2 **tools novas** exigem o bundle MCP atualizado no teu gateway (Lucas providencia). Como fazer isso, e como saber que o gateway está atrás da `main`, está em [`mcp-gateway.md`](./mcp-gateway.md) — esta frase sozinha já falhou uma vez: escrita em julho, o rebuild só aconteceu em 28/08.

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

## 7.5. A Cadeia de CAC agora é uma chamada (Story 44.14 — ago/2026)

**Pare de recompor a cadeia à mão.** A tool `get_stage_cadeia_cac(projectId, stageId, from?, to?)` devolve **o mesmo payload que a aba "Inácio" do painel renderiza**: CPM, CTR, CPC, Connect Rate, Conv. LP, os tetos por janela de 7 dias, o ranking do gargalo, os benchmarks e os criativos **da etapa**.

Contrato completo em [`docs/llms.txt`](../llms.txt), seção `GET .../stages/{stageId}/cadeia-cac`.

### Por que isto virou uma nota de virada

No laudo de 2026-08-27 a cadeia foi reconstruída a partir de `get_stage_daily`. As cinco métricas de mídia bateram na casa decimal — e três conclusões saíram erradas, todas pela mesma causa: **os campos que responderiam estavam num payload que não tinha como ser lido**.

| Conclusão do laudo | O campo que responde |
|---|---|
| "Conv. LP 2,39% não tem lastro" | `agregado.leadsAtribuidos` — existe no payload |
| "O bloco de criativos mistura outros funis" | `criativos` do `/cadeia-cac` é **só da etapa**; `get_creative_performance` é do projeto |
| Pedido de print da tela, duas vezes | o payload responde sozinho |

Recompor por fora não é só retrabalho: produz **uma segunda régua**. Foi assim que o `connectRate` ficou 18 a 35 p.p. errado por mais de um ano, e o Epic 44 inteiro existe para que exista uma régua só.

#### Criativos da etapa: use os dois feeds, por junção (Story 44.18)

O `/cadeia-cac` traz `criativos` **só da etapa**, com `{ nome, ehId, adIds, spend, impressions, linkClicks, ctr, cpc, hookRate, holdRate }`. Não traz CPM, Connect Rate, compras/CPA/ROAS, campanha, adset, thumbnail nem permalink.

**Isso não é lacuna — é junção.** `adIds[]` é o recorte autoritativo da etapa:

1. pegue os `adIds[]` das linhas de `criativos`;
2. cruze com `get_creative_performance` / `get_creative_timeseries` **por `adId`**, filtrando por esse conjunto;
3. **expanda `adIds[]` antes de somar** — a linha daqui é um Ad Name e agrupa N `adId`; a de lá é um `adId`. Casar linha com linha erra;
4. ⚠️ **`ctr`, `cpc` e `connectRate` existem nos DOIS feeds com o mesmo nome e NÃO são a mesma coisa.** Não compare nem substitua um pelo outro:

   | campo | `/cadeia-cac` (`criativos`) | `/creatives` |
   |---|---|---|
   | `ctr` | `linkClicks ÷ impressions` — **decimal**, clique no **LINK** (0,0149 = 1,49%) | `(clicks ÷ impressions) × 100` — **percentual**, clique **TOTAL** |
   | `cpc` | `spend ÷ linkClicks` | `spend ÷ clicks` |
   | `connectRate` | decimal | percentual (×100) |

   O comparável do outro feed chama-se **`ctrLink`** e **`cpcLink`**, não `ctr`/`cpc`. Trocar um pelo outro erra por ~100× **e** por definição — é a mesma classe do `connectRate` que ficou 18 a 35 p.p. errado por mais de um ano;
5. o **`spend` autoritativo é o do `/cadeia-cac`**. O outro feed arredonda em ponto diferente e diverge em centavos — **não some os dois**;
6. `cpm` é conta, não busca: `spend ÷ impressions × 1000`. E `roas`/`cpa` do outro feed são **de pixel** — a régua de receita continua sendo `sales-daily ÷ investimento`.

⚠️ **Limite prático conhecido:** a tool de `/creatives` corta em 200 itens e não expõe `offset`, enquanto a rota aceita até 500. Em projeto com muitos criativos na janela você recebe `truncated: true` **sem como buscar a cauda** — nesse caso, declare a limitação em vez de tratar o recorte como completo.

**Decisão registrada (44.18, AC0, 2026-08-29):** criativos por etapa **têm dono** — é o `/cadeia-cac`. Os campos de mídia extras se obtêm por junção, e **não** por rota nova. Se você sentir falta de um endpoint `get_stage_creative_performance`, a resposta é esta receita; a story que o criaria foi avaliada e fechada sem código.

### As cinco armadilhas ao ler o payload

1. **Não existe default de 30 dias aqui.** Sem `from`/`to` a resposta cobre o **histórico inteiro da etapa**, e `range` vem `{from: null, to: null}` declarando isso. `agregado.dias` diz quantos dias foram somados — uma etapa com 160 dias devolve o CPL de 160 dias. Publicar isso como "nos últimos 30 dias" é número certo com significado errado. As rotas irmãs (`/daily`, `/creatives`) **têm** o default de 30 dias; esta é a exceção do arquivo.
2. **O número principal muda de métrica com a família.** `cacReal` na paga (`paid`/`sales`/`event_capture`/`event`), `cplReal` na gratuita (`free`/`cpl`). **Numa etapa gratuita o principal NÃO é CAC** — chamar o CPL de CAC é o erro que a rota existe para impedir.
3. **Taxas em decimal.** `0.0192` é 1,92%. O payload declara em `unidadeDasTaxas`.
4. **`spend` já inclui o imposto Meta**, como gross-up (`spend ÷ (1 − 0,1215)`). Não reaplicar, não reverter.
5. **`familia: null` não é erro.** É etapa fora da aba (`lyrio`, `comercial`, `debriefing`), com `200` e `motivo: "foraDaAba"`.

### O que continua não existindo — e agora está declarado

- **`bodyConv`** (leads ÷ visualizações de 75%): exige lead por `ad_id`, que o cache não guarda. O payload traz `bodyConvIndisponivel.motivo`. `hookRate` e `holdRate` estão completos.
- **`atribuicao.coberturaVendas`**: sempre `null` — o sync de vendas não mapeia `utm_content`.
- **CAC por campanha ou por criativo**: não existe. O CAC é **por etapa**.

---

## 8. Ainda NÃO existe (não invente)

- **Listas cumulativas Front/Comunidade** — o app não tem onde "conectar" essas planilhas como entidade; feature de produto pendente.
- **Config de canal por projeto** (nomes de Closer) e **fallback UTM-da-venda** — 39.3 restante.
- **Coorte server-side** — o D+x é cálculo teu em cima do row-level (de propósito: a regra de corte é tua).
- E-mail/telefone crus — nunca; só hash.
