# Epic 41 — §10 Valores de conferência (Resumão / Comparativo)

> **Origem:** spec técnica "Gerador de Resumão e Comparativo Loyola" (jul/2026), §10.
> Fornecida pelo usuário em 2026-07-30 e versionada aqui porque a spec completa
> não está no repo. É o **oráculo** das stories 41.2–41.6: divergência é bug,
> não "metodologia diferente" (risco R-E1 do epic).
>
> A conferência do **perpétuo** (§C.10 — BBE-A1, PPS-A1, FZ-A1) vive em
> `epic-41-complemento-perpetuo.md`, não aqui.

---

## DG-PG02-ABR26 · etapa `vendas-captacao` · 17/04 a 11/05/2026

| Métrica | Valor |
|---|---|
| campanhas | 33 |
| investimento bruto | R$ 111.188,35 *(reconciliado — 2 campanhas com valor corrompido)* |
| investimento c/ imposto | R$ 126.566,14 |
| — quente | R$ 73.453,36 (58,0%) |
| — frio | R$ 53.112,77 (42,0%) |
| impressões | 2.391.255 |
| cliques | 43.932 |
| CTR | 1,84% |
| CPM | R$ 52,93 |
| ingressos únicos | 1.410 |
| vendas totais | 2.222 (captação 1.597 + order bump 625) |
| faturamento | R$ 233.572,94 (captação 90.388,74 + OB 143.184,20) |
| — pago | R$ 122.089,47 (766 ingressos) |
| — orgânico | R$ 105.128,20 (612 ingressos) |
| CPV pago | R$ 165,23 |
| ROAS pago | 0,96 |
| ROAS total | 1,85 |
| ticket pago | R$ 159,39 |
| conversão clique→venda | 1,744% |

**Produtos**
- Captação: *Imersão Equipe de Agentes Claude*; *Curso / Gravação da Imersão*
- Order bump: *Combo 3 em 1: Gravação da Imersão + GPT Para Negócios completo + pacote de assistentes GPT*; *GPT para Negócios*

---

## DG-PG04-JUL26 · etapa `vendas-captacao` · 09/07 a 27/07/2026

| Métrica | Valor |
|---|---|
| campanhas | 33 |
| investimento bruto | R$ 38.040,25 |
| investimento c/ imposto | R$ 43.301,37 |
| — quente | R$ 29.980,57 (69,2%) |
| — frio | R$ 13.320,80 (30,8%) |
| impressões | 559.250 |
| cliques | 11.086 |
| CTR | 1,98% |
| CPM | R$ 77,43 |
| ingressos únicos | 732 |
| vendas totais | 921 (captação 741 + order bump 180) |
| faturamento | R$ 69.951,86 (captação 31.947,97 + OB 38.003,89) |
| — pago | R$ 19.298,36 (220 ingressos) |
| CPV pago | R$ 196,82 |
| ROAS pago | 0,45 |
| ROAS total | 1,62 |
| ticket pago | R$ 87,72 |
| conversão clique→venda | 1,984% |

**Produtos**
- Captação: *Imersão Super Funcionário com Claude*; *Combo 3 em 1: Gravação da Imersão + Claude para Negócios*
- Order bump: os outros 7

---

## Decomposição PG02 → PG04 (valida §7.3 / Story 41.6 AC8)

| Fator | ratio | efeito | peso | direção |
|---|---|---|---|---|
| CPM | 0,684 | −31,6% | +49% | puxou pra baixo |
| CTR | 1,079 | +7,9% | −10% | ajudou |
| Conversão | 1,138 | +13,8% | −17% | ajudou |
| Ticket | 0,550 | −45,0% | +77% | puxou pra baixo |
| **produto** | **0,4620** | | | `0,9646 × 0,4620 = 0,4457` = ROAS pago PG04 ✓ |

⚠️ Peso **negativo significa que o fator ajudou**. O sinal é direção relativa ao
movimento total, não magnitude. Confundir isso é o bug documentado no §6.

---

## Observações levantadas ao cruzar a §10 com o banco (2026-07-30)

### 1. Os 5 prefixos de fase do §2.2 — confirmados pelo dado real

Inferidos consultando `funnel_stages.campaigns` de todos os funis de lançamento:

| Prefixo | Ocorrências |
|---|---|
| `vendas-captacao` | 100 |
| `leads-captacao` | 5 |
| `leads-downsell` | 5 |
| `vendas-principal` | 3 |
| `vendas-downsell` | 4 |

*(`venda--perpetuo` aparece 5× mas é funil perpétuo, fora do escopo desta trilha.)*

### 2. Em-dash confirmado no dado de produção — e em posição variável

**34 de 80** campanhas dos dois lançamentos usam `—` (em-dash) onde a convenção
pede `--`. E ele aparece em **posições diferentes**:

```
dg-pg02-abr-26--vendas-captacao--2026-04-17—cold--cbo--videos      ← antes do hot/cold
dg-pg02-abr-26—vendas-downsell-2026-06-03—hot--cbo--mix-estaticos  ← antes do prefixo de fase
dg-pg04-ago-26--vendas-captacao--2026-07-09--cold--cbo--videos     ← PG04 usa -- correto
```

Consequência prática: `normalizarNome` (§2.1) é **pré-requisito de qualquer match
por segmento**, não só do match de prefixo. O PG02 inteiro usa em-dash antes do
hot/cold; o PG04 não usa nenhum.

### 3. Contagem de campanhas: `stage.campaigns` ≠ os 33 da §10

| | Vinculadas ao stage | §10 diz |
|---|---|---|
| PG02 (`8fbd8031`) | **34** | 33 |
| PG04 (`1744c927`) | **46** | 33 |

Fatores identificados:
- **PG02:** há nomes **duplicados** na lista (ids distintos) — ex. `2026-04-20—cold--cbo--estaticos--lote-promocional` 2×, `2026-05-06—cold--cbo--videos-lpc` 2×, `2026-05-06—hot--cbo--videos-lpb` 2×.
- **PG04:** 4 campanhas são de `2026-07-28`, **fora** do período 09/07–27/07. Restam 42, ainda acima de 33.
- **PG04:** 45 campanhas são `dg-pg04-ago-26` e 1 é `dg-pg04-jul-26`, embora o lançamento se chame DG-PG04-**JUL**26.

**Hipótese a validar quando o motor rodar:** "campanhas" na §10 = campanhas com
`spend > 0` no período, não campanhas vinculadas ao stage. Se confirmado, a
contagem exibida no cabeçalho do Resumão deve seguir esse critério.

### 4. Período do PG02 — resolvido: vale **09/05**

`launch_report_configs` do stage `8fbd8031` traz **17/04 → 09/05**; o cabeçalho
da §10 e as stories 41.5/41.6 dizem **17/04 → 11/05**.

**Decisão do dono do produto (2026-07-30): vale 09/05.** A config em produção
está correta; o `11/05` da §10 é erro de documentação.

⚠️ **Implicação para a conferência:** se os valores da §10 foram medidos com
11/05, eles só vão bater com o período 09/05 caso **não haja spend nem venda em
10 e 11/05**. Isso é verificável e a AC1 da 41.2 já deriva o fim do período como
"maior data com `spend > 0`" — se a derivação cair em 09/05, os dois dias são
inócuos e a §10 permanece válida como oráculo. Se houver atividade nesses dias,
a divergência é de período, **não bug do motor** — registrar e reconciliar antes
de acusar a implementação.

### 5. PG04 não tem config

Stage `1744c927` não tem linha em `launch_report_configs` → o gate da 41.1
devolve 422. Precisa ser criada e validada pela UI (ato humano por design).

Ao criar, corrigir também `columnMapping.valorBruto` de `"Valor oferta"` para
`"Preço"`. O motor já se protege disso (`resolverColunaPreco`), mas o dashboard
da etapa **não passa pelo motor** e continua lendo o mapping direto.

---

## Resultado da conferência real — 2026-07-30 (Story 41.2)

O motor (`launch-report-loader` + `launch-report-engine`) rodou contra o banco de
produção no stage `8fbd8031` (DG-PG02 · Captação Paga), em modo somente leitura
(sem chamada à Meta — só o cache já gravado).

### Com o período da §10 (17/04 → 11/05): bate ao centavo

| Métrica | §10 | Motor | |
|---|---|---|---|
| ingressos únicos | 1.410 | 1.410 | ✅ |
| vendas totais | 2.222 (1.597 + 625) | 2.222 (1.597 + 625) | ✅ |
| faturamento total | 233.572,94 | **233.572,94** | ✅ |
| — captação | 90.388,74 | **90.388,74** | ✅ |
| — order bump | 143.184,20 | **143.184,20** | ✅ |
| — sem track | 6.355,27 (32 ing) | **6.355,27 (32 ing)** | ✅ |
| INV quente | 73.453,36 | **73.453,36** | ✅ |
| CTR | 1,84% | 1,84% | ✅ |
| campanhas | 33 | 33 com investimento (34 vinculadas) | ✅ |
| pago / orgânico | 766 / 612 | 767 / 611 | Δ 1 comprador (R$ 750,70) |
| investimento c/ imposto | 126.566,14 | 126.616,38 | +0,04% |

**Hipótese da §3 confirmada:** "campanhas" na §10 significa campanhas **com
investimento no período**, não campanhas vinculadas ao stage.

### As duas diferenças que sobraram

1. **Investimento +0,04% (R$ 50,24).** Drift de reprocessamento da Meta — dentro
   do limiar de alerta da §8.3 (0,05%) e muito abaixo do de bloqueio (0,5%).
   Impressões seguem o mesmo padrão (+0,27%).
2. **1 comprador (R$ 750,70) classificado como Pago em vez de Orgânico.** É 1 em
   1.410 (0,07%). Todo o resto da atribuição bate ao centavo, inclusive o balde
   "Sem Track". Não investigado a fundo; registrar se reaparecer.

### ⚠️ Consequência da decisão de usar 09/05

Com `data_fim = 09/05` (a config em produção, confirmada pelo dono do produto), o
relatório **não** reproduz a §10 — e agora sabemos exatamente por quê:

| | 09/05 | 11/05 (§10) | Diferença |
|---|---|---|---|
| vendas de captação | 1.564 | 1.597 | **33 vendas** |
| faturamento | 230.305,94 | 233.572,94 | **R$ 3.267,00** |
| ingressos únicos | 1.407 | 1.410 | 3 |

Houve atividade real em 10 e 11/05. A escolha de 09/05 é uma definição de
negócio legítima, mas exclui essas 33 vendas — e qualquer conferência futura
contra a §10 precisa usar 11/05 para comparar maçã com maçã.

### Achados de infraestrutura

- **`meta_ad_insights_daily` está vazia no período do PG02** (0 linhas). A
  reconciliação campaign × ad (§2.3b) é pulada por falta de ad-level — o que é o
  comportamento correto, mas significa que o alerta **W1 nunca dispara** e o
  invariante **A6 fica `skipped`** para este lançamento. As "2 campanhas com
  valor corrompido" que a §10 menciona já foram reprocessadas pela Meta: hoje
  nenhuma campanha tem `spend < 100` com `impressões > 1.000`.
- **Taxa de resposta da pesquisa: 63,3%** (890 compradores responderam, de 1.410
  ingressos únicos). Abaixo de 75%, então dispara o alerta **W5** corretamente.

## Guardas da 41.3 contra o dado real — 2026-07-30

`validateLaunchReport` rodou sobre a saída real do PG02. **Nada bloqueou.**

| Inv. | Resultado com dado real |
|---|---|
| A1 | ✅ 73.453,36 + 53.163,02 = 126.616,38 — diferença 0,00 |
| A2 | ✅ 767 + 611 + 32 = 1.410 |
| A3 | ✅ Σ por origem = total, diferença 0,00 |
| A4 | ✅ 90.388,74 + 143.184,20 = 233.572,94 |
| A5 | ✅ 1.410 e-mails distintos + 0 avulsos = 1.410 |
| A6 | ⏭️ `skipped` — sem destaques (Story 41.4) e sem ad-level no período |
| A7 | ✅ 422 + 315 = 737 ≤ 767 pagos |
| A8 | ✅ 4 produtos, cada um em uma categoria; Σ vendas = 2.222 |
| **A9** | ✅ **(1000/52,81) × 1,8381% × 1,7403% × 160,16 = 0,9702 = ROAS pago — diferença 0,000000** |

**Alertas:** 1 — W5 (taxa de resposta 63,2%, abaixo de 75%).

**Conferência externa** contra o oficial da §10 (R$ 126.566,14): **`passed`**, delta
de **0,040%** — abaixo do limiar de alerta (0,05%), então passa em silêncio. O
drift de reprocessamento da Meta é ainda menor do que se supunha.

### Nota de implementação sobre o A9

O A9 usa os valores **do catálogo** (`midia.cpm`, `midia.ctr`,
`conversao.cliqueVenda`, `ticket.pago`, `roas.pago`), **não** recalcula tudo dos
crus. Recalcular tornaria o invariante uma tautologia:

```
(1000/((INV/impr)×1000)) × (cliques/impr) × (pagos/cliques) × (fat/pagos)
  = fat/INV = roas_pago      ← verdadeiro para QUALQUER entrada
```

O que o A9 existe para pegar é divergência entre os fatores que o relatório
**exibe** e o ROAS que ele **afirma** — o caso da spec de CTR com `link_click` e
conversão com `clicks` totais. "A partir dos crus" da story se refere a não usar
percentuais já arredondados para exibição.

### Observação: 30 compradores pagos sem temperatura

A7 passa (737 ≤ 767), mas a folga de 30 significa que 30 compradores pagos não
têm hot/cold no `utm_term`. É legítimo pelo invariante — vale olhar se vira
volume relevante nos rankings da 41.4.

## Cobertura de ad-level — decisivo para a Story 41.4 (2026-07-30)

A 41.4 (destaques por anúncio) depende inteiramente de `meta_ad_insights_daily`.
Levantamento da cobertura real:

| Projeto | Linhas | Período disponível |
|---|---|---|
| BBE | 3.758 | 13/03 → 30/07 |
| FZ & MFB | 3.753 | 13/03 → 30/07 |
| **DG & CPDF** | 2.522 | **20/05** → 30/07 |
| PP | 971 | 09/07 → 30/07 |

### O PG02 não serve para validar a 41.4

O ad-level do projeto DG começa em **20/05**; o PG02 rodou **17/04 → 09/05**.
Zero linhas, e **não há backfill possível** — a Meta não retém ad-level
indefinidamente. Consequência permanente para esse lançamento:

- a reconciliação campaign × ad (§2.3b) é sempre pulada
- o alerta **W1** nunca dispara
- o invariante **A6** fica `skipped` para sempre

### O PG04 serve perfeitamente

| | |
|---|---|
| cobertura ad-level em 09/07–27/07 | **100,0%** — diferença R$ 0,00 em todos os 18 dias |
| fator de reescala esperado | **1,0000** |
| campanhas com ad-level | **33** de 46 vinculadas (o mesmo 33 da §10) |
| ads distintos | 412 |
| `ad_name` preenchido | 2.522 de 2.522 (148 nomes distintos) |

Fator 1,0 confirma a decisão de escopo da 41.4 de **reescalar sempre**, não
condicionalmente: com reescala condicional, o A6 passaria por sorte aqui.

### ⚠️ Divergência de investimento no PG04

O campaign-level soma **R$ 38.771,97** em 09/07–27/07; a §10 diz **R$ 38.040,25**
— **+1,92%**, acima do limiar de bloqueio da conferência externa (0,5%) e muito
acima do drift do PG02 (0,04%).

**Não há spend em 09/07** nem no campaign-level nem no ad-level, embora a §10
comece nesse dia. Conferir se o período real do PG04 é **10/07 → 27/07** antes de
tratar a diferença como bug.

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-07-30 | @dev (Dex) | §10 versionada a partir do que o usuário forneceu. Adicionadas 5 observações do cruzamento com o banco de produção: prefixos confirmados, em-dash em posição variável, divergência de contagem de campanhas, período do PG02 e ausência de config do PG04. |
