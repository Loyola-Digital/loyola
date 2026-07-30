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

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-07-30 | @dev (Dex) | §10 versionada a partir do que o usuário forneceu. Adicionadas 5 observações do cruzamento com o banco de produção: prefixos confirmados, em-dash em posição variável, divergência de contagem de campanhas, período do PG02 e ausência de config do PG04. |
