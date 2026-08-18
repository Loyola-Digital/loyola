# Aba "Inácio" — Especificação Mestre

**Versão:** 1.1 · **Data:** 2026-08-18 · **Dono:** Danilo Sagae
**Origem:** consultoria de perpétuo (Lucas Otaviano / Vita) — deck de 37 slides + call de 1h57, consolidados em `CONSULTORIA-PERPETUO-Lucas-Otaviano.md`
**Base técnica:** `AUDITORIA-ABA-CAC.md` (Fase 0, 2026-08-17) · gate `docs/qa/gates/44.1-44.5-fase-1-epic-44.yml`

Este documento é a fonte única da matemática da aba "Inácio". Onde ele contradiz documentação anterior do produto, **ele vence**. Toda alteração aqui é breaking change: quebra os testes dourados da §8 e exige nova versão.

Cada parâmetro carrega a procedência entre colchetes: `[deck §X]` = material da consultoria · `[auditoria §X]` = achado do relatório de Fase 0 · `[decisão]` = decisão de produto do Danilo.

> **Esta é a v1.1.** As mudanças em relação à v1.0 (2026-08-17) estão em §10 e marcadas `[v1.1]` no corpo. Nenhuma delas veio de opinião: cada uma tem álgebra ou medição em produção anexada.

---

## 1. Escopo e unidade de análise

Hierarquia: Projeto (cliente) → Funil → **Etapa** (`funnel_stages`) → **Campanha**.

- **A unidade da tabela é a campanha** `[decisão]`. Uma etapa tem N campanhas (`funnel_stages.campaigns`), cada uma vira uma coluna.
- Existem **9 `stageType`** `[auditoria §6-B5]` (`packages/shared/src/types/funnel.ts:31`), não 4. Agrupamento por **família**:

| Família | Tipos | Métrica final |
|---|---|---|
| **paga** | `paid`, `sales`, `event_capture`, `event` | CAC real |
| **gratuita** | `free`, `cpl` | CPL real |
| **fora da aba** | `lyrio` `[decisão]`, `comercial`, `debriefing` | — |

⚠️ **`[v1.1]` A classificação é própria da aba — os helpers existentes NÃO servem.** A v1.0 mandava usar `ehCaptacaoPaga()`. Conferido no código (`packages/shared/src/stage-types.ts`):

```
ehCaptacaoPaga       = paid + event_capture           ← falta sales e event
temDashboardDeVendas = paid + event_capture + sales   ← falta event
ehEtapaDeCaptacao    = paid + event_capture + free    ← outra pergunta
```

Nenhum produz a família paga da tabela acima. E **estendê-los é proibido**: eles decidem sync diário e CRM, e mudá-los tem efeito fora da aba. A aba classifica por conta própria.

`event` e `cpl` constam da família por definição, mas **têm zero campanhas vinculadas hoje** `[auditoria §7.1]` — grupo vazio é o resultado correto, não bug.

---

## 2. Fórmula

### 2.1 `[v1.1]` O número principal é o CAC real

```
família paga      CAC_real = spend ÷ vendas reais (Loyola)
família gratuita  CPL_real = spend ÷ leads únicos (Loyola)
```

Disponível em **todas** as etapas medidas, inclusive nas de cobertura de atribuição zero, porque não depende de atribuição por campanha — só do total da etapa.

### 2.2 `[v1.1]` A cadeia de decomposição para em Conv. LP

```
família paga      Custo por Checkout = CPC ÷ (Connect Rate × Conv. LP)
família gratuita  Custo por Lead     = CPC ÷ (Connect Rate × Conv. LP→lead)
```

A cadeia existe para **diagnosticar onde está o furo** e alimentar o ranking (§3). Ela **não** produz o CAC — produz o custo de chegar ao checkout.

#### Por que a Conv. Checkout saiu da multiplicação `[v1.1]`

**A cadeia telescopa.** Os denominadores se cancelam por construção:

```
CPC ÷ (Connect × Conv.LP × Conv.Checkout)
  = (spend/linkClicks) ÷ ( (lpv/linkClicks) × (ck/lpv) × (vendas/ck) )
  = (spend/linkClicks) ÷ (vendas/linkClicks)
  = spend ÷ vendas
```

Ou seja: a cadeia completa **é** `spend ÷ vendas`, escrito de forma elaborada. Se a Conv. Checkout usa só a fração atribuída (`[auditoria §3.1]`: venda sem `utm_content` é inatribuível), o resultado sai inflado por exatamente **1 ÷ cobertura**.

Medido em produção em 2026-08-18, nas 10 etapas pagas com planilha de venda:

| projeto / etapa | cobertura | CAC real | CAC pela cadeia | inflação |
|---|---:|---:|---:|---:|
| BBE / Captação Paga | 50% | 622,90 | 1.245,80 | 2,0× |
| BBE / Captação paga | 20% | 476,68 | 2.383,42 | 5,0× |
| DG & CPDF / Captação Paga | 30% | 9,51 | 32,02 | 3,4× |
| DG & CPDF / Captação Paga | 29% | 50,92 | 178,44 | 3,5× |
| DG & CPDF / Downsell Vendas | 6% | 63,85 | 1.005,57 | 15,8× |
| DG & CPDF / Vendas | 0% | 1,76 | indefinido | — |
| DG & CPDF / Vendas | 0% | 0,39 | indefinido | — |
| FZ & MFB / Captação Paga | 31% | 18,71 | 59,66 | 3,2× |
| FZ & MFB / Vendas | 0% | 88,04 | indefinido | — |
| FZ & MFB / Vendas | 3% | 19,63 | 711,64 | 36,3× |

**Nenhuma etapa entrega um CAC utilizável por essa via.** A melhor está 2× inflada; três ficam indefinidas.

#### `[v1.1]` O teste de sanidade da v1.0 §2.1.2 era vazio

A v1.0 mandava exibir `CAC_equação` e `CAC_real` lado a lado, e tratar a divergência como selo de saúde do tracking. Pela identidade acima:

```
CAC_equação ÷ CAC_real = vendas totais ÷ vendas atribuídas = 1 ÷ cobertura
```

A divergência **é** a cobertura, reescrita — não carrega informação nova. E §2.6 já manda exibir a cobertura. Os dois números lado a lado mostravam a mesma coisa duas vezes.

**Substituído por:** exibir o CAC real e a cobertura. A cobertura é o selo de tracking, diretamente.

### 2.3 Por que é divisão

`[deck §2.1]` É divisão, não multiplicação: você precisa de N cliques para fechar 1 conversão, e N é o **inverso** do produto das taxas. O deck original escreve estas linhas com `×`; multiplicando, um CPC de R$2 a 2% de conversão daria R$0,04 — menor que um único clique. O certo: `R$2 ÷ 0,02 = R$100`.

### 2.4 A cadeia abre pelo CPC — CPM e CTR ficam fora

`[decisão]` `CPC = (CPM ÷ 1000) ÷ CTR` é **identidade, não coincidência**. Se os três entrassem, o mesmo ganho seria contado duas vezes — CPM caindo 25% arrasta o CPC junto, e o ranking listaria duas oportunidades onde há uma só, inflando o composto de −25% para −44%.

`[deck §2.1.2 — dicionário]` *"Use um numerador só: se abre a cadeia pelo CTR, use CPM ÷ 1000; se começa no clique, use CPC e o CTR sai do denominador."*

CPM e CTR permanecem como métricas monitoradas (atual / referência / teto / benchmark / alerta) e servem para **decompor** o CPC no ranking — sem entrar no composto.

### 2.5 Unidades

`[deck §2.1.2]` Dentro do cálculo, **toda taxa é decimal entre 0 e 1** e **todo dinheiro é real absoluto**. A única exceção de escala é o CPM, dividido por 1.000.

⚠️ O endpoint devolve `ctrLink` e `lpRate` **multiplicados por 100** `[auditoria §1.1]` (`public-meta.ts:194,205`). Normalize na fronteira, nunca no meio da conta. A fonte nº 1 de erro é digitar `2` onde deveria entrar `0,02` — muda o resultado por um fator de 100 e nada na tela avisa.

**Teste de plausibilidade obrigatório** `[deck §2.1.2]`: `1 ÷ produto das taxas` tem que devolver um número de cliques por checkout que faça sentido.

### 2.6 Métricas, fórmulas e fontes

⚠️ **`[v1.1]` Fonte da série corrente: `meta_ad_insights_daily` agregado por campanha**, não `meta_campaign_insights_daily` como dizia a v1.0. Medido na Story 44.1: as duas tabelas divergem em `spend` em **21 de 164 campanhas**, com diferença de até **R$ 24.424,85**, e o `/campaigns` e o `/stages/:id/daily` já usam ad-level como fonte única. O teto histórico pode usar campaign-level, **com a fonte rotulada na linha** (§4).

Toda taxa é **razão de somas** (somar numeradores e denominadores do período, dividir depois), nunca média de médias diárias `[auditoria §2.3]`.

| Métrica | Fórmula | Fonte | Direção |
|---|---|---|---|
| CPM | (spend ÷ impressions) × 1000 | `meta_ad_insights_daily` | menor melhor |
| CPC | spend ÷ linkClicks | `actions[].link_click` | menor melhor |
| CTR | linkClicks ÷ impressions | idem | maior melhor |
| Connect Rate | landingPageViews ÷ **linkClicks** | `actions[].landing_page_view` | maior melhor |
| Conv. LP (paga) | checkouts ÷ landingPageViews | `actions[].initiate_checkout` | maior melhor |
| Conv. LP (gratuita) | leads únicos Loyola atribuídos ÷ landingPageViews | planilha de leads | maior melhor |
| **Cobertura de atribuição** | vendas atribuídas ÷ vendas totais da etapa | `campaign-attribution.ts` | diagnóstico |

**Regra das bases encadeadas** `[deck §2.1.2]`: cada taxa usa como denominador exatamente o numerador da anterior. Duas taxas na mesma base = a mesma perda contada duas vezes.

✅ **`[v1.1]` `connectRate` já foi corrigido** (Story 44.2, PR #543, em produção desde 2026-08-18). Dividia por `clicks`; agora divide por `linkClicks`. O valor subiu de 18 a 35 p.p. — o painel sempre esteve certo, o endpoint público é que estava errado.

⚠️ O nome `lpRate` do payload público **continua colidindo**: lá significa "LP views ÷ link clicks" (= Connect Rate); aqui `Conv. LP` significa "checkouts ÷ LP views". Conceitos diferentes. **Não reusar o nome.**

### 2.7 Atribuição de venda e lead

`[auditoria §3.1]` Não existe `campaignId` nas vendas. A cadeia é `venda.utm_content → meta_ad_insights_daily.adId → campaignId` (índice `idx_meta_ad_insights_campaign`). Venda sem `utm_content` (orgânico, direto, recuperação, manual) fica **inatribuível**.

`[decisão]` `[v1.1]` A cobertura é **diagnóstico de tracking**, exibida por etapa e por campanha — não é multiplicador de nada. Não escalar, não completar com pixel, não esconder.

Implementado em `packages/api/src/services/campaign-attribution.ts` (Story 44.3). Só status pago entra (`isRevenueBucket`, não `isRefundBucket`).

---

## 3. Ranking de prioridade

`[deck §2.3 · §2.4]` Para cada métrica com teto elegível, a **queda real de custo** ao levá-la do valor atual até o teto:

```
maior é melhor (Connect, Conv. LP)   queda = 1 − (atual ÷ teto)
menor é melhor (CPC)                 queda = 1 − (teto ÷ atual)
```

⚠️ `[deck §2.3 — nota de precisão]` O deck original calcula o **aumento da métrica** (`teto/atual − 1`) e rotula como queda de custo. A queda real é `1 − atual/teto`. O ranking é idêntico nas duas contas — só as magnitudes eram otimistas. **Usar sempre a queda real.**

**Ordenação** `[decisão]`:

1. Decrescente pela queda real.
2. Empate técnico → desempata pela **posição na cadeia**, do início do funil para o fim: CPC → Connect Rate → Conv. LP. `[deck §2.4]` *"consertar o furo de cima e deixar o de baixo não resolve nada"*
3. O terceiro critério do deck (**menor esforço**) foi **descartado** `[decisão]` — exigiria campo manual por métrica.

**Regras:**

- Métrica já no teto → selo "no teto", fora da ordenação.
- Métrica sem teto elegível → não entra no ranking; compete só contra benchmark.
- **Composto** = produto de todas as razões, exibido como "custo por checkout se tudo chegar no teto", **rotulado cenário teórico** — os tetos vêm de campanhas diferentes `[decisão]`.
- **CPM e CTR não entram no composto.** Quando o CPC lidera, exibir a decomposição: quanto do gap fecha levando só o CTR ao teto, quanto levando só o CPM.
- `[v1.1]` **Conv. Checkout não entra no ranking** — ver §2.2.
- **Nota fixa no rodapé** `[deck §2.1]`: *"multiplicar taxas assume que as etapas são independentes, e elas não são. A equação é excelente para diagnosticar onde está o furo e traiçoeira para simular ganho isolado."*

**Ação prescrita por métrica** `[deck §5 — árvore de diagnóstico]`:

| Métrica ruim | Ação |
|---|---|
| CTR | quebrar em Hook Rate / conversão do hook / retenção do body |
| Connect Rate | subir a página no Cloudflare Workers + regras de cache ignorando string de dispositivo e de URL |
| Conv. LP | headline da página, pré-qualificador (presell/quiz), lead da VSL |
| `[v1.1]` cobertura baixa | não é problema de operação — é rastreio: UTM faltando na origem, venda manual, recuperação sem parâmetro |

---

## 4. Teto e selo de confiança

**Definição:** melhor valor histórico de cada métrica, apurado sobre a **melhor janela de 7 dias corridos** de cada campanha do grupo `[decisão]`.

⚠️ **Janela por DATA, não por linha.** `RANGE BETWEEN INTERVAL '6 days'`, nunca `ROWS BETWEEN 6 PRECEDING`. Medido: **80 de 193 campanhas (41%) têm gap na série**, o maior de **14 dias**. Numa campanha com buraco, 7 linhas cobrem até 21 dias de calendário — a base infla e a campanha passa o piso sem merecer.

**Universo:** mesmo **projeto** + mesma **família**. Nunca misturar experts; nunca comparar família paga com gratuita.

**Janela histórica:** toda a história disponível, com a **data do teto sempre exibida**.

**`[v1.1]` Identidade de campanha: por `campaignId`, sem agrupar por nome.** A v1.0 mandava agrupar por nome normalizado **e exigia relatório de revisão humana antes de aplicar**. O relatório foi produzido (Story 44.4, `docs/qa/audits/44.4-agrupamento-campanhas.md`) e a revisão concluiu **não agrupar**: dos 9 grupos com id repetido em 196 campanhas, **7 rodaram simultaneamente** — são entregas em paralelo, não duplicação.

`normalizarNomeCampanha` (`packages/shared/src/campaign-name.ts`) fica disponível **sem consumidor**, como alavanca se o teto faltar base.

### 4.1 Limiares do selo de confiança

O piso vale sobre a **base da própria janela de 7 dias**, não sobre o total da campanha.

| Métrica | Base contada | 🟩 Alta confiança | 🟨 Baixa confiança | Não concorre |
|---|---|---|---|---|
| CPM · CPC · CTR | impressões | ≥ 30.000 | ≥ 10.000 | < 10.000 |
| Connect Rate | link clicks | ≥ 300 | ≥ 100 | < 100 |
| Conv. LP | landing page views | ≥ 300 | ≥ 150 | < 150 |

`[v1.1]` **O piso de Conv. Checkout (50/20) foi removido** junto com a métrica. Era ele que deixava 7 de 11 grupos com 0–2 campanhas elegíveis na Fase 0.

`[decisão]` Os pisos de alta confiança e o de Conv. LP em baixa são decisão direta. Os pisos baixos de impressões (10.000) e link clicks (100) foram derivados na mesma proporção — **parâmetro aberto a ajuste**.

**Por que o piso existe.** O teto é um **máximo**, e máximo de estimativa ruidosa infla sozinho. Com 20 eventos e conversão real de 20%, o intervalo típico da medição vai de ~11% a ~29% só por sorteio; entre 15 campanhas assim, a "melhor" tende a ser a mais sortuda, não a melhor. Baixar o piso não é só aceitar ruído — é inflar o teto de propósito.

**Apresentação:** cada teto mostra origem, base, data, fonte e selo — `CTR 3,1% · BBE-PR1 · 12–18/mai · base 41k impr · ad-level · 🟩 alta confiança`.

**Sem teto elegível:** coluna vazia com o motivo (`baseInsuficiente`), nunca um número inventado. O alvo passa a ser o benchmark.

⚠️ `[gate 44.5]` Recontado sob a régua nova: **a régua se sustenta e não muda.** Sem o piso de Conv. Checkout, os 10 grupos passam no piso baixo; no alto são 4 utilizáveis, 4 frágeis, 2 vazios. **Consequência: o selo alta/baixa é essencial, não decorativo** — a maior parte dos tetos nasce em confiança baixa.

---

## 5. Benchmarks saudáveis

`[deck §3.1 — slide 16]`

| Métrica | Alvo |
|---|---|
| CTR | ≥ 2% (idealmente 3%) |
| Connect Rate | > 85% |
| Conv. LP | 4% se ticket > R$147 · 7,5% se < R$147 — **somente quando a LP tem VSL** `[decisão]` |
| CPM · CPC | não existe benchmark de mercado → **mediana das campanhas elegíveis do grupo**, rotulada explicitamente como mediana histórica `[decisão]` |
| Família gratuita (CPL, Conv. LP→lead) | idem: mediana histórica rotulada `[decisão]` |

`[v1.1]` O benchmark de Conv. Checkout (>20% / >25%) sai junto com a métrica.

**Nota de equivalência:** a "Conversão da VSL" do deck (`Play Rate × Pitch Rate × Conv. pós-pitch`) é matematicamente `checkouts ÷ pageviews` — exatamente a Conv. LP desta especificação. Por isso os 4% / 7,5% se aplicam. Fora de LP com VSL, a linha fica sem benchmark.

**Booleano "a LP tem VSL?"** — campo novo na configuração da etapa `[decisão]`.

**Ticket médio** = faturamento ÷ nº de vendas da etapa, calculado do Loyola (já inclui order bump e upsell). Campo manual na configuração da etapa **apenas** enquanto não houver venda real.

---

## 6. Sinalização

`[decisão]` Contra o **alvo vigente** — teto quando existe, benchmark quando não existe:

| Selo | Condição |
|---|---|
| 🟢 | ≥ alvo |
| 🟡 | até 15% abaixo do alvo |
| 🔴 | mais de 15% abaixo do alvo |

Trava de volume: base abaixo do piso de baixa confiança → **"base insuficiente"**, não status. *"Não é tempo, é volume; uma semana com 100 cliques não tem relevância estatística"* `[deck §4]`.

---

## 7. Regras invioláveis

1. **Receita, venda e lead sempre do Loyola X.** `roas` / `purchases` de endpoint Meta são pixel; se aparecerem, vão rotulados "proxy pixel". O pixel subconta: a plataforma reporta só o líquido de coprodução — R$20k vendidos viraram ~R$6–7k reportados `[deck §7.1]`.
2. **Tráfego usa `linkClicks` / `ctrLink` / `cpcLink`.** Nunca `clicks` / `ctr` / `cpc`, que contam curtida e clique em perfil.
3. **`spend` já inclui imposto Meta** — `applyMetaTax`, gross-up de 12,15% para datas ≥ 2026-01-01 `[auditoria §2.4]` (`meta-tax.ts:24`). **Nunca reaplicar** (Story 29.27).
4. **Dado ausente vira "indisponível"** com motivo (`semDados` | `baseInsuficiente` | `naoAtribuivel`). Nunca 0, nunca estimativa, nunca troca silenciosa de fonte.
5. **Não inferir.** Faltou definição, parar e perguntar — não escolher "o mais provável".
6. **Uma conta, um lugar.** O cálculo mora em `@loyola-x/shared` como função pura; a aba consome, a API expõe o mesmo resultado. Hoje existe um segundo CAC em `traffic-analytics.ts:452` (`spend ÷ purchases(pixel)`) `[auditoria §4.4]` — será migrado, não duplicado (Story 44.10).
7. `[v1.1]` **Nenhum campo chamado `cac` na cadeia de decomposição.** `cac` é reservado para `spend ÷ vendas reais`. Dois `cac` divergentes é o Bloqueio B4.

---

## 8. Testes dourados `[v1.1 — recalculados]`

Cenário da consultoria `[deck §2.1.2 · §2.3]`, escalado para dar inteiros:

```
impressions 10.000.000 · spend R$200.000 · linkClicks 200.000
lpViews 160.000 · checkouts 3.840 · vendas 576

atual  CPM R$20 · CTR 0,02 · CPC R$1,00 · Connect 0,80 · Conv. LP 0,024
teto   CPM R$15 · CTR 0,03 · CPC R$0,50 · Connect 0,90 · Conv. LP 0,053125
```

| Asserção | Esperado |
|---|---|
| **CAC real** = spend ÷ vendas | **R$ 347,22** |
| Custo por Checkout atual | **R$ 52,08** |
| Custo por Checkout no teto | **R$ 10,46** |
| Queda composta | **−79,92%** |
| Queda por Conv. LP | −54,82% |
| Queda por CPC | −50,00% |
| Queda por Connect Rate | −11,11% |
| Ordem do ranking | Conv. LP › CPC › Connect |
| Identidade de telescopagem | `CPC ÷ (Connect × Conv.LP)` == `spend ÷ checkouts` == R$ 52,08 |
| Decomposição do CPC — só CTR ao teto (2%→3%) | R$ 0,6667 (−33,33%) |
| Decomposição do CPC — só CPM ao teto (R$20→R$15) | R$ 0,75 (−25,00%) |
| Decomposição do CPC — os dois | R$ 0,50 (−50,00%) |
| Plausibilidade | 1 ÷ (0,80 × 0,024) = 52 cliques por checkout |

> **O `R$ 347,22` da v1.0 sobreviveu** — é o mesmo número, agora rotulado `CAC real` em vez de `CAC_equação`. A telescopagem garante que as duas contas dão no mesmo lugar quando a venda é a total.

Casos de borda obrigatórios: taxa zero · denominador zero → `null` · dado ausente (retorna "indisponível", nunca 0) · base abaixo do piso · métrica já no teto · grupo sem nenhuma campanha elegível · etapa da família gratuita · **janela de 7 dias com gap na série** (o caso que `ROWS` erraria) · cobertura de atribuição 0% (o CAC real ainda tem que sair).

**Estes valores são teste de regressão. Se a implementação não devolver isto, ajuste a implementação — nunca o teste.** Revisar a spec é outra coisa: exige nova versão e álgebra ou medição anexada, como em §10.

---

## 9. Fora de escopo da v1

`[decisão]`

- **CAC alvo** (ticket − margem − imposto − gateway − CMV − reembolso − chargeback, `[deck §3.4]`) — depois de os parâmetros de margem estarem num lugar só. Já existem inputs parecidos em `perpetual-report-config.ts` `[auditoria §4.4]`.
- **Decomposição da Conv. LP** em Play Rate / Pitch Rate / Conv. pós-pitch — dado de VTurb, não existe no Loyola X.
- **Recorte quente vs frio.**
- **Selo de status na lista de etapas** e **alerta de variação abrupta**.
- **Recomendação determinística por anúncio** `[deck §7.4]`.
- **Teto e comparativo no bloco de criativos** — v1 traz só atual + benchmark + status.
- `[v1.1]` **Conv. Checkout na cadeia** — reavaliar quando a cobertura de atribuição subir. O gancho existe: `campaign-attribution.ts` já entrega venda atribuída e cobertura por campanha.

---

## 10. Mudanças da v1.0 → v1.1 (2026-08-18)

Nenhuma veio de opinião. Cada uma tem álgebra ou medição em produção.

| # | Mudou | Por quê |
|---|---|---|
| **1** | Conv. Checkout **sai** da multiplicação (§2.2). Número principal vira `CAC_real = spend ÷ vendas` (§2.1) | A cadeia telescopa: `CPC ÷ (Connect × Conv.LP × Conv.Checkout) ≡ spend ÷ vendas`. Com atribuição parcial o resultado infla por `1 ÷ cobertura` — **medido de 2,0× a 36,3×** nas 10 etapas pagas, 3 delas indefinidas |
| **2** | Teste de sanidade "dois CACs lado a lado" **removido** (§2.2) | `CAC_equação ÷ CAC_real = 1 ÷ cobertura` — a divergência É a cobertura, que §2.7 já exibe. Mostrava a mesma coisa duas vezes |
| **3** | Fonte da série corrente: **ad-level** (§2.6) | As duas tabelas divergem em `spend` em 21 de 164 campanhas, até R$ 24.424,85 (Story 44.1) |
| **4** | Identidade de campanha: **sem agrupar por nome** (§4) | O relatório de revisão que a própria v1.0 exigia foi feito (Story 44.4): 7 dos 9 grupos rodaram simultaneamente — entregas paralelas, não duplicação |
| **5** | Classificação de família é **própria da aba** (§1) | Nenhum helper existente produz a família paga da §1, e estendê-los afeta sync diário e CRM |
| **6** | Testes dourados **recalculados** (§8) | Consequência da #1. O `R$ 347,22` sobreviveu como `CAC real` |
| **7** | Piso de Conv. Checkout **removido** (§4.1) | Consequência da #1. Era ele que deixava 7 de 11 grupos sem base |
| **8** | `connectRate` marcado como **corrigido** (§2.6) | Story 44.2, em produção desde 2026-08-18 |

**Reprodutibilidade:** a medição da tabela de §2.2 sai de `packages/api/src/scripts/medir-cobertura-atribuicao.ts` estendido com os brutos de mídia; a recontagem da régua, de `packages/api/src/scripts/recontagem-viabilidade-teto.ts`.
