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

> ⚠️ **Supersedido pela Correção 41.10** (seção no fim deste documento) — esta
> tabela refletia **Combo = order bump** e a **duplicata de 25 linhas** do n8n.
> Fica como histórico; não é mais oráculo do PG02.

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

> ⚠️ **Supersedida pela Correção 41.10** — o ticket e a conversão do PG02 mudam
> com a regra de comprador e a dedup; a decomposição é recalculada pelo @qa
> (ver "Correção 41.10", item (f)).

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

> ⚠️ **Supersedido pela Correção 41.10** — refletia Combo = order bump e a
> duplicata de 25 linhas. O motor "batia ao centavo" com as regras que tinha; as
> regras é que estavam erradas em dois pontos.

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

## Conferência do PG04 — 2026-07-31 (config criada)

Com a config do stage `1744c927` criada, o Resumão rodou ponta a ponta. Números
com o período da §10 (09/07 → 27/07):

| Métrica | Motor | §10 | |
|---|---|---|---|
| campanhas com investimento | 33 | 33 | ✅ |
| order bump (vendas) | 180 | 180 | ✅ |
| CTR | 1,98% | 1,98% | ✅ |
| **faturamento total** | 70.290,70 | 69.951,86 | **+0,48%** |
| investimento c/ imposto | 44.134,29 | 43.301,37 | +1,92% |
| ingressos únicos | 751 | 732 | +2,60% |
| ingressos pagos | 221 | 220 | +0,45% |
| faturamento captação | 33.681,90 | 31.947,97 | +5,43% |
| faturamento order bump | 36.608,80 | 38.003,89 | −3,67% |

**Os 9 invariantes passam** — e aqui o **A6 rodou de verdade** pela primeira vez
(o PG02 não tem ad-level):

```
A6   3 visões com Σ spend ajustado fechando com o INV (tol. R$ 1,00) — dif 0,0000
A9   (1000/77,67) × 1,9820% × 1,9629% × 84,62 = ROAS pago — dif 0,000000
```

**Story 41.4 validada ponta a ponta:** 59 / 51 / 65 anúncios nas visões
Quente / Frio / Total, fator de reescala 1,1383 nas três, rankings de ROAS e de
Faixa A populados, `W6 = 0,0%` (toda venda paga com `ad_name` resolvido).

**Alerta:** 1 — W5 (taxa de resposta 49,4%).

### A classificação de produtos bate exatamente com a §10

| Categoria | Produto |
|---|---|
| Captação | Imersão Super Funcionário com Claude |
| Captação | Combo 3 em 1: Gravação da Imersão + Claude para Negócios |
| Order bump | os outros 7 |

A divisão captação/OB diverge ±5% em **valor** apesar de a contagem de order
bumps bater exata (180). Os dois erros se compensam e o total fica em +0,48% —
provável diferença de qual coluna de valor a §10 usou (ver abaixo).

### ⚠️ A planilha do PG04 tem TRÊS colunas de valor

| Índice | Coluna | Conteúdo |
|---|---|---|
| 9 | `Valor oferta` | valor **na moeda original** |
| 12 | `Preço` | valor **na moeda original** |
| **29** | **`valor`** | **preço já convertido para BRL** |

```
EUR   Valor oferta=47,85   Preço=47,85   →   valor=226,90
USD   Valor oferta=5,90    Preço=5,90    →   valor=29,90
```

O `columnMapping.valorBruto` aponta para **`valor`**, que é a coluna certa. Por
isso `linhasConvertidas = 0` (W7 não dispara) e **está correto**: a planilha já
resolve a moeda na origem, não há o que converter.

⚠️ **Consequência:** a detecção de moeda estrangeira do §2.4 continua **sem
execução real** em lugar nenhum do projeto — no PG02 não há coluna de moeda e no
PG04 a planilha já entrega BRL. O código está coberto por fixture, mas nunca
converteu uma linha em produção.

### Período da config

A config foi criada com fim em **30/07**, não 27/07. Com 30/07 o relatório fica
~30% acima da §10 (3 dias a mais de venda e investimento) — o que é correto se o
lançamento rodou até lá, mas **não é comparável com a spec**. Para conferir
contra a §10, usar 27/07.

## Correção 41.10 — dedup por ID e comprador de captação (2026-09-30)

> ⚠️ **Supersedido pela Correção 41.12 nas linhas de vendas/faturamento
> (ingressos únicos inalterados).** As tabelas abaixo continuam valendo como o
> estado "depois da 41.10, antes da 41.12"; o oráculo do PG02 e do PG04 passa a
> ser o da seção "Correção 41.12", mais abaixo.
>
> **Oráculo a partir de agora (g):** as tabelas desta seção são o oráculo do
> **PG02** e do **PG04** — é o que a fixture `governante` da 49.5 lê. As tabelas
> antigas acima ficam como histórico, rotuladas "supersedido".
>
> **Como os números foram medidos (2026-10-01, @dev):** pelo **código do loader**
> (`lerVendasDaPlanilha` → `prepararVendasDoPeriodo` → `computeLaunchReportMetrics`),
> lendo a planilha de produção do PG02 (`n8n-kiwify-captação`, 2.222 linhas) e
> o banco em **sessão somente leitura** (`default_transaction_read_only=on`),
> sem fetch na Meta. Nada foi gravado. Os snapshots CSV e o export cru da Kiwify
> usados na ponte têm PII e **não** entram no repo.

### (a) A ponte skill → Loyola (DG-PG02), resíduo zero

Da `loyola-debriefing` (1.845 compradores / R$ 227.491,74; export cru da Kiwify,
`paid`, todas as datas, comprador = Imersão **ou** Combo, dedup por e-mail **ou**
8 últimos dígitos do telefone) ao Resumão antigo (1.410 / R$ 233.572,94).

**Contagem de compradores**

| # | Degrau | Δ | Acumulado | Natureza |
|---|---|---:|---:|---|
| 0 | skill (export cru, Imersão ou Combo, e-mail ou telefone) | | 1.845 | |
| 1 | chave só por e-mail (o Loyola não une por telefone) | +1 | 1.846 | definição |
| 2 | regra de produto: Imersão ou **Gravação** (Combo = bump) | −384 | 1.462 | **R2-1: errado no Loyola, corrigido** |
| 3 | janela 17/04–11/05 (a skill não corta) | −50 | 1.412 | decisão de negócio do Resumão |
| 4 | 5 vendas pagas de 11/05 ausentes no n8n | −3 | 1.409 | **diferença de fonte declarada** (R3-4) |
| 5 | data do n8n no lugar da do export | 0 | 1.409 | — |
| 6 | 7 vendas estornadas depois, ainda `paid` no n8n | +1 | 1.410 | **diferença de fonte declarada** (R3-4) |
| 7 | e-mail como está no n8n | 0 | 1.410 | — |
| 8 | 25 linhas duplicadas no n8n | 0 | **1.410** | mesmo e-mail — não mexe em comprador |

**Faturamento**

| # | Degrau | Δ (R$) | Acumulado (R$) | Natureza |
|---|---|---:|---:|---|
| 0 | skill: todas as linhas dos compradores | | 227.491,74 | |
| 1 | + linhas de quem não comprou Imersão/Combo (114 linhas) | +11.751,66 | 239.243,40 | definição (o Resumão soma toda linha paga) |
| 2 | janela 17/04–11/05 | −8.954,36 | 230.289,04 | decisão de negócio |
| 3 | 5 vendas de 11/05 ausentes no n8n | −381,70 | 229.907,34 | **diferença de fonte declarada** (R3-4) |
| 4 | data do n8n | 0,00 | 229.907,34 | — |
| 5 | 7 estornos posteriores ainda `paid` no n8n | +1.190,60 | 231.097,94 | **diferença de fonte declarada** (R3-4) |
| 6 | coluna `Preço` do n8n no lugar de `Preço base` | 0,00 | 231.097,94 | — |
| 7 | **25 vendas de R$ 99 duplicadas no n8n** | **+2.475,00** | **233.572,94** | **R2-1/R2-2: dedup obrigatória — corrigido** |

Os degraus 4 e 6 (contagem) / 3 e 5 (faturamento) ficam **só declarados** (R3-4):
não há story de sincronização do n8n.

### (b) Tabelas corrigidas do PG02 (`vendas-captacao`)

Medidas pelo código, sobre a planilha de produção. "Dedup" = `transactionId`
mapeado para a coluna **`ID`** (ver T0 abaixo: em produção ele **não** está mapeado).

**Só a dedup, com a regra antiga (Combo = order bump) — AC2**

| Janela | | vendas | captação | order bump | ingressos únicos | faturamento total | captação (R$) | order bump (R$) | W9 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 17/04–11/05 | antes | 2.222 | 1.597 | 625 | 1.410 | 233.572,94 | 90.388,74 | 143.184,20 | — |
| 17/04–11/05 | depois | **2.197** | **1.572** | 625 | **1.410** | **231.097,94** | **87.913,74** | 143.184,20 | 25 / R$ 2.475,00 |
| 17/04–09/05 | antes | 2.189 | 1.564 | 625 | 1.407 | 230.305,94 | 87.121,74 | 143.184,20 | — |
| 17/04–09/05 | depois | **2.174** | **1.549** | 625 | **1.406** | **228.820,94** | **85.636,74** | 143.184,20 | 15 / R$ 1.485,00 |

**Dedup + regra R2-1 (Imersão ou Combo = captação; Gravação e GPT = bump) — AC4, o oráculo** *(supersedido pela Correção 41.12 nas linhas de vendas/faturamento; ingressos únicos inalterados)*

| Janela | vendas | captação | order bump | ingressos únicos | faturamento total | captação (R$) | order bump (R$) | ticket captação | ticket total | W9 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 17/04–11/05 | **2.197** | **1.900** | **297** | **1.807** | **231.097,94** | **198.736,40** | **32.361,54** | 104,60 | 105,19 | 25 / R$ 2.475,00 |
| 17/04–09/05 (config) | **2.174** | **1.900** | **274** | **1.807** | **228.820,94** | **198.736,40** | **30.084,54** | 104,60 | 105,25 | 15 / R$ 1.485,00 |

- **Composição (janela 11/05):** Imersão 1.318 + Combo 582 = 1.900 vendas de
  captação; Gravação 254 + GPT 43 = 297 de order bump. O Combo traz **581**
  e-mails, dos quais **496 não compraram Imersão** — é a mudança 1.410 → 1.807.
- **A4 nas duas janelas:** 198.736,40 + 32.361,54 = 231.097,94 e
  198.736,40 + 30.084,54 = 228.820,94 — diferença **0,000000**.
- ⚠️ **Janela 09/05 — 15 e não 13.** A story e o epic estimaram 13 / R$ 1.287,00
  na janela 09/05, com o script de investigação deduplicando **depois** do corte
  de janela. O AC1 manda deduplicar **antes** do corte (a venda ganha o dia da
  sobrevivente, que é a **primeira** linha): 2 dos 25 pares cruzam a meia-noite
  — a primeira linha em **10/05** 02:00:54 e 02:45:06, a duplicata em **09/05**
  23:00 e 23:45. Essas 2 vendas valem em 10/05 (fora da janela 09/05), e as duas
  duplicatas de 09/05 saem da janela: 15 linhas / R$ 1.485,00, e a queda de
  vendas é exatamente 15. O dia da primeira linha é o mesmo do export cru da
  Kiwify (a ponte não achou nenhuma venda com dia diferente entre o export e a
  primeira linha do n8n). Com a regra antiga, isso tirava 1 comprador da janela
  09/05 (1.407 → 1.406); com a R2-1, os 1.807 não mudam.
- **Atribuição por UTM** (pago × orgânico, quente × frio, ROAS, CPV, ticket pago,
  conversão clique→venda): **a recalcular pelo @qa** rodando o motor contra o
  banco de produção em modo leitura, depois do mapeamento do T0 e do deploy.
  Sem número inventado aqui.

### (c) A duplicata

Na planilha n8n do PG02, as 25 linhas duplicadas têm o **mesmo `ID`** da venda,
o mesmo produto (`Curso / Gravação da Imersão`), R$ 99, o mesmo e-mail — e a
coluna **`Transaction` vazia**, com horário **3 h antes** e segundos `:00`
(ex.: `09/05/2026 14:04:33` × `09/05/2026 11:04:00`). Nenhuma das 25 tem
`Transaction`: dedup pela coluna `Transaction` não pega nenhuma (37 linhas da
planilha têm `Transaction` vazia). A duplicata aparece **depois** da original na
planilha. Dias: 15 em 09/05 e 10 em 10/05.

### (d) A regra de comprador

"Imersão **ou** Combo = comprador de captação" é **configuração do estágio**,
não código: a lista `stage_sales_spreadsheets.order_bump_products` (o loader
classifica bump por ela; produto fora da lista = captação) e o mapa
`product_types` (lido pela 49.3). O código do Resumão não conhece nome de
produto — teste estático em `launch-report-dedup.test.ts`.

### (e) Comparação com a skill (não é critério de bloqueio)

Número mais defensável pelo export cru (Imersão ou Combo, só `paid`, janela
17/04–11/05): **1.806 pessoas / R$ 230.289,04**. É **comparação, nunca critério de
bloqueio** (decisão 1 do Epic 49). A diferença de **1 pessoa** contra os 1.807 do
Loyola fica **a classificar pelo @qa** — a causa provável é o bucket dos 7
estornos posteriores ainda `paid` no n8n, mas isso **não** foi provado. A
diferença de faturamento até o Loyola (R$ 231.097,94) é +R$ 808,90 =
+R$ 1.190,60 (7 estornos `paid` no n8n) − R$ 381,70 (5 vendas ausentes).

### T0 — mapeamento real em produção (2026-10-01, somente leitura)

| Etapa | Planilha | `transactionId` | `productName` | Dedup do Resumão |
|---|---|---|---|---|
| DG-PG02 Captação Paga (`8fbd8031`) | n8n-kiwify-captação | **não mapeado** | `Produto` | **não roda — W10** até o mapeamento apontar para `ID` |
| DG-PG04 Captação Paga (`1744c927`) | n8n-kiwify-captação | `Transaction` | `Produto` | roda |
| BBE-PR2 Captação Paga (`81ea6018`) | n8n-Kiwify | `ID` | `Produto` | roda |
| FZ-M2 Captação Gratuita (`b28c093c`) | n8n-Kiwify (funil) | não mapeado | não mapeado | o Resumão já falha antes (planilha sem coluna de preço) |

**Consequência:** o código sozinho **não** corrige o PG02 — ele emite W10 e mantém
os números. Os números das tabelas (b) só valem depois de o gestor mapear
`transactionId → ID` na planilha do estágio, pelo wizard de planilhas
(`stage-sales-wizard-dialog.tsx`, campo "ID da Transação"). No PG02,
`Transaction` e `ID` são iguais onde `Transaction` existe, então a troca não
muda a chave de nenhuma outra linha. Como `mapping.status` também não está
mapeado no PG02, o passe de reembolso por transação segue inativo lá — mapear o
ID não tira nenhuma outra linha.

### Configuração da regra de comprador em produção (2026-10-01)

| Etapa | `order_bump_products` | `product_types` | Lista × mapa |
|---|---|---|---|
| DG-PG02 Captação Paga | `Curso / Gravação da Imersão`, `GPT para Negócios` | Combo = `combo`; Gravação e GPT = `order_bump` | concordam |
| DG-PG04 Captação Paga | 6 produtos de Gravação/GPT/Claude (nenhum Combo) | 2 Combos = `combo`; 6 = `order_bump` | concordam |
| BBE-PR2 Captação Paga | vazia | vazio | — |

A lista do PG02 **já está** no estado da R2-1 em produção; os Comparativos
PG02×PG04 de 30/07 e 01/08 ainda mostram o PG02 com 1.407 únicos (regra antiga),
então a troca ocorreu depois de 01/08. Não há trilha de auditoria da UI para
dizer quem e quando. Nenhuma etapa tem Combo na lista de bumps: a lista de
trocas da R3-5 está vazia.

### PG04 — só a dedup muda (coluna `Transaction`) *(supersedido pela Correção 41.12 nas linhas de vendas/faturamento; ingressos únicos inalterados)*

| Janela | | vendas | captação | order bump | únicos | faturamento | captação (R$) | order bump (R$) | W9 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 09/07–30/07 (config) | antes | 1.150 | 1.004 | 146 | 991 | 100.477,53 | 71.293,43 | 29.184,10 | — |
| 09/07–30/07 (config) | depois | **1.145** | **999** | 146 | 991 | **100.049,03** | **70.864,93** | 29.184,10 | 5 / R$ 428,50 |
| 09/07–27/07 (§10) | antes | 939 | 827 | 112 | 817 | 72.266,51 | 49.798,95 | 22.467,56 | — |
| 09/07–27/07 (§10) | depois | **935** | **823** | 112 | 817 | **72.161,91** | **49.694,35** | 22.467,56 | 4 / R$ 104,60 |

As 5 são retentativas do n8n: mesmo `Transaction`, mesmo `ID`, mesmo produto
(4 Imersão, 1 Combo), segundos a 3 minutos de distância. 126 transações cobrem
mais de um produto (ingresso + bump no mesmo pedido) e **não** colapsam — a
chave inclui o produto. A dedup por `ID` daria o mesmo resultado (5 linhas).
⚠️ O PG04 já não reproduz a conferência de 31/07 (751 únicos na janela 27/07;
hoje 817 **antes** de qualquer mudança da 41.10): a planilha cresceu para datas
passadas. A diferença é anterior a esta story e fica para o @qa classificar.

### (f) Decomposição PG02 → PG04 e gate A1–A9

- **Decomposição (41.6):** a recalcular pelo @qa rodando o motor em produção
  (modo leitura) depois do mapeamento do T0 e do deploy; a antiga está rotulada
  "supersedida".
- **Gate A1–A9 (medição do @dev, 2026-10-01, código novo, somente leitura):**
  PG02 (as duas janelas) e PG04 (as duas janelas) — A1–A5, A7–A9 `passed`, A6
  `skipped` no PG02 (sem ad-level) e `passed` no PG04; nada bloqueia. O PG02
  ainda sem a dedup (W10). O gate oficial com a dedup ativa no PG02 é do @qa,
  depois do mapeamento e do deploy.

## Correção 41.12 — camada 2 (e-mail + produto) em todas as pontas (2026-10-02)

> **Oráculo a partir de agora:** as tabelas desta seção são o oráculo do **PG02**
> e do **PG04** — inclusive o oráculo `governante` do PG02 da 49.5, que passa a
> ser o número **com** camada 2 (**R$ 230.501,64** na janela 17/04–11/05). As da
> "Correção 41.10" ficam como histórico, rotuladas "supersedido".
>
> **Regra:** a mesma pessoa (e-mail) não compra duas vezes o mesmo produto —
> a camada 2 da skill `loyola-debriefing`, que a 49.3 pôs no Debriefing e o dono
> manteve (decisão **1A**, 2026-10-02) e estendeu a todas as pontas (**R5-1**,
> 2026-10-02). Chave = e-mail normalizado + produto (trim + minúsculas); vale a
> **primeira** linha; sem e-mail nunca colapsa; produtos diferentes da mesma
> pessoa não colapsam; planilha sem `productName` mapeado não colapsa (W12).
> No lançamento a sobrevivente é decidida na planilha inteira (todas as
> planilhas da etapa), **depois** da camada 1 e **antes** do corte de período.
> Uma função só: `utils/dedup-pessoa-produto.ts`.
>
> **Consequência:** os **−R$ 596,30** do PG02 entre o Resumão e o Debriefing
> (classificados como `definicao` na 49.3/49.5) **deixam de existir** — os dois
> leem R$ 230.501,64.
>
> **Como foi medido (2026-10-02, @dev):** pelo código do loader, antigo
> (`origin/main` `b419a7f3`) e novo, sobre a mesma planilha de produção, em
> sessão `default_transaction_read_only=on`, sem token da Meta. Nada gravado.

### (a) PG02 — as 9 linhas e a repartição (reconferidas)

As 9 recompras (mesmo e-mail + mesmo produto, todas em dia diferente da
sobrevivente): 7 ingressos (R$ 300,30), 1 Combo (R$ 197,00) e 1 Gravação (bump,
R$ 99,00) — **todas** dentro de 17/04–09/05. A repartição derivada pelo @sm
(ingresso e combo = captação; bump = order bump) **bate** com a medida.

| Janela | | vendas | captação | order bump | ingressos únicos | faturamento total | captação (R$) | order bump (R$) | W9 | W11 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| 17/04–11/05 | 41.10 (antes) | 2.197 | 1.900 | 297 | 1.807 | 231.097,94 | 198.736,40 | 32.361,54 | 25 / R$ 2.475,00 | — |
| 17/04–11/05 | **41.12** | **2.188** | **1.892** | **296** | **1.807** | **230.501,64** | **198.239,10** | **32.262,54** | 25 / R$ 2.475,00 | 9 / R$ 596,30 |
| 17/04–09/05 (config) | 41.10 (antes) | 2.174 | 1.900 | 274 | 1.807 | 228.820,94 | 198.736,40 | 30.084,54 | 15 / R$ 1.485,00 | — |
| 17/04–09/05 (config) | **41.12** | **2.165** | **1.892** | **273** | **1.807** | **228.224,64** | **198.239,10** | **29.985,54** | 15 / R$ 1.485,00 | 9 / R$ 596,30 |

- **A4 nas duas janelas:** 198.239,10 + 32.262,54 = 230.501,64 e
  198.239,10 + 29.985,54 = 228.224,64 — diferença **0,000000**.
- **Ingressos únicos não mudam** (1.807): as recompras são do mesmo e-mail.
- **Janela 09/05 medida, não derivada:** as 9 linhas caem dentro dela.

### (b) Ponte do faturamento do PG02 — o degrau da camada 2 entra

Continuação da ponte (a) da Correção 41.10, janela 17/04–11/05:

| # | Degrau | Δ (R$) | Acumulado (R$) | Natureza |
|---|---|---:|---:|---|
| 7 | Resumão antigo (25 duplicatas de ID incluídas) | | 233.572,94 | |
| 8 | camada 1 — 25 duplicatas por ID da venda (41.10) | −2.475,00 | 231.097,94 | R2-1/R2-2 — corrigido |
| 9 | **camada 2 — 9 recompras do mesmo produto pela mesma pessoa (41.12)** | **−596,30** | **230.501,64** | **1A/R5-1 — corrigido; = Debriefing** |

### (c) PG04 — Resumão da config (09/07–30/07)

| | vendas | captação | order bump | únicos | faturamento | captação (R$) | order bump (R$) | W9 | W11 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| 41.10 (antes) | 1.145 | 999 | 146 | 991 | 100.049,03 | 70.864,93 | 29.184,10 | 5 / R$ 428,50 | — |
| **41.12** | **1.138** | **992** | **146** | **991** | **99.764,97** | **70.580,87** | **29.184,10** | 5 / R$ 428,50 | 7 / R$ 284,06 |

As 7 removidas na janela são todas de produto de captação (o bump não muda).

### (d) Demais etapas (AC10 da 41.12)

A tabela completa por etapa (Resumão, painéis Captação Paga e Vendas, gráfico
diário e réplica `sales_daily`) está no Dev Agent Record da Story 41.12. Dos
Resumões configurados, só PG02 e PG04 mudam; o do BBE-PR2 (01/08–24/08) não tem
recompra na janela. Nenhuma etapa de Resumão passa de 5 % do faturamento.

### (e) §C.10 do perpétuo

Não muda na fatia A: o loader do relatório de Perpétuo não foi tocado, e a
réplica `sales-daily-sync` deixa a planilha do perpétuo **isenta** (no perpétuo a
camada 2 é por janela — R6-2 —, fatia B). `epic-41-complemento-perpetuo.md` fica
como está.

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-07-30 | @dev (Dex) | §10 versionada a partir do que o usuário forneceu. Adicionadas 5 observações do cruzamento com o banco de produção: prefixos confirmados, em-dash em posição variável, divergência de contagem de campanhas, período do PG02 e ausência de config do PG04. |
| 2026-10-01 | @dev (Dex) | **Correção 41.10** (Story 41.10): ponte skill → Loyola versionada degrau a degrau; tabelas do PG02 (dedup; dedup + R2-1) e do PG04 (dedup) medidas pelo código do loader contra a planilha de produção em modo leitura; T0 do mapeamento; regra de comprador em produção; oráculo declarado. Tabela do PG02, decomposição e "Resultado da conferência real" rotulados "supersedido" (não apagados). Janela 09/05: 15 / R$ 1.485,00, não 13 / R$ 1.287,00 (dedup antes do corte). |
| 2026-10-02 | @dev (Dex) | **Correção 41.12 (fatia A)** (Story 41.12): camada 2 (e-mail + produto) no Resumão; PG02 reconferido pelo código contra a planilha de produção em modo leitura — 2.188 / 1.892 / 296 / 1.807 / R$ 230.501,64 (11/05) e 2.165 / R$ 228.224,64 (09/05, medida); PG04 1.138 / R$ 99.764,97; ponte do PG02 com o degrau da camada 2; oráculo `governante` do PG02 = R$ 230.501,64. Tabelas da Correção 41.10 rotuladas "supersedido" nas linhas de vendas/faturamento (não apagadas). |
