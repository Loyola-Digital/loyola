# EPIC-41 — Gerador de Resumão e Comparativo (dois botões na etapa)

**Origem:** especificação técnica "Gerador de Resumão e Comparativo Loyola" (jul/2026), derivada da implementação validada que hoje roda **fora do app** — o Claude da gestora consome a API pública (Epic 36) via MCP (Epic 39) e publica o HTML em `sprint_reports`.

**Objetivo:** internalizar essa geração. Dois botões dentro da etapa do funil produzem, **deterministicamente a partir do banco**, o Resumão de 1 lançamento e o Comparativo entre 2 — com invariantes que bloqueiam número errado antes de renderizar.

**Complemento:** `docs/specs/epic-41-complemento-perpetuo.md` (2026-07-28) — spec do **botão 3** (Perpétuo), que resolve a pendência da §12.5 e adiciona as stories 41.7–41.9.

**Criado:** 2026-07-27 (@sm — River)
**Status:** InReview (9 stories implementadas — aguardando QA gate e push)

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

O que **já está resolvido** e não deve ser reescrito: imposto 12,15% por gross-up (`utils/meta-tax.ts`), dedup de ingresso único pela compra mais recente (`stage-sales-data.ts:650-716`), order bump por `stageSalesSpreadsheets.orderBumpProducts` (`schema.ts:761`), origem Pago/Orgânico/Sem Track (`PAID_UTM_SOURCES`), hot/cold por substring (`utils/lead-origin.ts:71-78` `classifyTemperatura`; também `sales-daily-sync.ts:59-61` e `survey-aggregation.ts:51` — ⚠️ a referência original a `funnel-metrics.ts:414-435` estava errada, esse arquivo não existe; corrigido em 2026-07-28), classificação de etapa por prefixo (`services/stage-phase.ts:22-42`), Faixa por criativo (`byAdId`).

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

### Botão 3 — Perpétuo (complemento §C, 2026-07-28)

| Story | Título | Depende de | Estimativa |
|-------|--------|-----------|-----------|
| **41.7** | Config do funil perpétuo + gate + fix de fuso horário (§C.2, §C.7, §C.8) | — (paralelo a 41.2) | M |
| **41.8** | Motor do perpétuo — hot/cold, formato, CAC de equilíbrio, tendência, invariantes P1–P6 (§C.3, §C.6) | 41.7 | L |
| **41.9** | Render HTML + botão + leituras dinâmicas (§C.4, §C.5) | 41.8 | M |

**Ordem de merge:** 41.7 → 41.8 → 41.9. **Independente da trilha 41.2–41.6** — as duas podem correr em paralelo; só compartilham `utils/meta-tax.ts` e o padrão de persistência de HTML.

### Correções: rodadas 2 e 3 do Epic 49 (2026-09-30)

| Story | Título | Depende de | Estimativa |
|-------|--------|-----------|-----------|
| **41.10** | Correção: dedup por ID de transação + regra de comprador de captação (Imersão ou Combo) | 41.2, 41.3, 41.6 (Done) | M |
| **41.11** | Dedup por (ID da venda, produto) no loader do relatório de Perpétuo (botão 3) | **41.10** (função `deduplicarPorIdDaVenda`); 41.7–41.9 (Done) | S–M |

**Ordem de merge:** depois de todas as stories do epic, que já estão na `main`.
- **41.10 → 41.11.** A 41.11 chama a função que a 41.10 extrai; não cria outra.
- **41.10 antes da 49.3** do Epic 49, que consome a mesma função. A fixture governante da 49.5 usa os números corrigidos pela 41.10.
- **41.11 antes da 49.10** do Epic 49, que lê o loader do botão 3 (R3-1). A 41.11 corre em paralelo com a trilha 49.3 → 49.7.

### Decisões do dono, rodada 3 (2026-09-30): ✅ são lei, não reabrir

Fonte: `decisoes-dono-epic-49.md`, seção "Rodada 3" (scratchpad da sessão de 2026-09-30). Fecham as perguntas P-2 a P-6 do Epic 49.

| # | Pergunta | Decisão | Onde se aplica |
|---|---|---|---|
| R3-1 | P-2: dedup no relatório de Perpétuo | **Story própria no Epic 41** (não é fatia da 41.10). A 49.10 depende dela. | **41.11** |
| R3-2 | P-3: a autorização do Lucas cobre a 41.10? | **Sim**, e cobre também a story nova do perpétuo. Commits fora do scope levam `[scope-override]`. | 41.10, 41.11 |
| R3-3 | P-4: Resumões/Comparativos já gerados | **Gerar de novo** os do PG02 e o Comparativo PG02×PG04 depois da correção. | 41.10 (item 9) |
| R3-4 | P-5: n8n sem 5 vendas de 11/05 e com 7 estornos `paid` | **Só declarar como diferença de fonte** no relatório. Sem story de sincronização. | 41.10 (item 6, ponte) |
| R3-5 | P-6: troca de config do Combo em outros lançamentos | **Vale para todos os lançamentos onde o Combo está como order bump**, não só o PG02. Pela UI/config, com antes→depois registrado por etapa. | 41.10 (item 3) |

**Origem.** O dono pediu, no Epic 49 (decisão 1), a investigação da diferença do DG-PG02 entre a skill `loyola-debriefing` e o Resumão.
- **Ponte:** 1.845 → 1.410 compradores e R$ 227.491,74 → R$ 233.572,94, **com resíduo zero** (degraus em `epic-49-gerador-debriefing.md`, seção "A ponte do PG02").
- **Scripts:** `ponte.py`, `loyola_repro.py` e `skill_repro.py`, mais `estimativa_41_10.py` deste @pm, em `/private/tmp/claude-501/-Users-danilosagae-Documents-loyola/0e9841ff-5289-41ea-9132-b4a415ec7805/scratchpad/pg02-diff/`. É o scratchpad da sessão e **não é versionado**; a 41.10 leva a ponte para o repo.
- **Dados de entrada:** `aiox-bonsai/squads/loyola-debriefing/dados/danilo-gato/` (`pg02-kiwify.csv` e o snapshot `[DG-PG02-ABR26] Painel de Controle - n8n-kiwify-captação.csv`).
- **Decisões do dono que a originam:** R2-1 e R2-2, de 2026-09-30.

**Dois defeitos, de natureza diferente** (avaliados no código em 2026-09-30):
1. **Duplicata por ID de transação (código).**
   - O loader usa o `txId` só para tirar o par de reembolso (`services/launch-report-loader.ts:321-347`), toda linha entra (`:357-368`) e o engine soma todas (`services/launch-report-engine.ts:544-546`).
   - No PG02 são 25 vendas de R$ 99 (Gravação) duplicadas no n8n: +25 vendas e +R$ 2.475,00.
   - Os outros caminhos já deduplicam por `(txId, produto)`: `routes/stage-sales-data.ts:606-611` e `services/sales-daily-sync.ts:278-281`.
2. **Regra de comprador (configuração).**
   - O Resumão classifica o bump pela lista `stage_sales_spreadsheets.order_bump_products`, e produto fora da lista conta como captação (`launch-report-loader.ts:250-265`).
   - No PG02 a lista tem o Combo e o GPT, então o comprador é "Imersão OU Gravação" (`docs/specs/epic-41-valores-conferencia.md:37-39`).
   - A R2-1 manda "Imersão OU Combo", com Gravação e GPT como bump: −384 compradores na ponte; 507 dos 597 compradores de Combo não compraram Imersão.
   - O PG04 **já** roda assim: a captação dele é Imersão + Combo (conferência, "A classificação de produtos bate exatamente com a §10").
   - Logo, corrigir o PG02 é **mudança de dado em produção**, não de engine.

**Escopo (entra):**
1. **Conferir o mapeamento antes de codar.**
   - Ler em produção o `column_mapping.transactionId` das planilhas do PG02 e do PG04.
   - No snapshot n8n, as 25 duplicatas repetem a coluna `ID` e têm `Transaction` **vazia**. São 37 vazias no total, e nenhuma repetição entre as preenchidas. Linha sem `txId` nunca colapsa (`stage-sales-data.ts:606-608`).
   - Se o mapeamento apontar para uma coluna vazia nas duplicatas, corrigi-lo para a coluna do ID da venda é parte da correção (R2-1: "se necessário, corrigir o Loyola").
2. **Dedup no Resumão (código).**
   - Extrair a chave `(txId, produto normalizado)` para uma função pura em `api/src/utils/` e usá-la no loader do Resumão. Linha sem `txId` nunca colapsa.
   - **[AUTO-DECISION]** Quem cria a função? → **a 41.10, e a 49.3 a consome** (reason: uma regra num lugar só, lição do R-49-2 do Epic 49 e da armadilha #9; a 41.10 é a que corrige produção).
   - **[AUTO-DECISION]** A quantidade de duplicatas removidas fica visível no memorial do Resumão (reason: é o número que explica ao usuário por que o faturamento caiu).
3. **Regra de comprador: PG02 e todos os lançamentos onde o Combo é order bump (R3-5). Dado em produção, por ato humano via UI, como a criação da config do PG04.**
   - **PG02:** `order_bump_products` passa a ser {"Curso / Gravação da Imersão", "GPT para Negócios"}, sem o Combo. `product_types` fica coerente: Imersão = `ingresso`, Combo = `combo`, Gravação e GPT = `order_bump`. É o mapa que o debriefing (49.3) lê.
   - **Demais lançamentos (R3-5):** a mesma troca vale para **toda** etapa em que o Combo está na lista `order_bump_products`, e não só para as que têm `launch_report_configs`. A lista muda o Resumão **e** o painel Captação Paga. O levantamento (somente leitura) deixa de ser só informativo: vira a lista de etapas a corrigir.
   - **[AUTO-DECISION]** O mapa `product_types` de cada etapa corrigida fica coerente com a lista, como no PG02 (reason: R-49-13; com lista e mapa divergentes, o Resumão e o debriefing do mesmo lançamento contam compradores diferentes).
   - **Registro por etapa (R3-5):** a configuração antes → depois (lista e mapa). **[AUTO-DECISION]** Ao lado, os "Ingressos únicos" antes → depois na janela da config, ou do painel quando não houver config de Resumão (reason: é o número que a comunicação ao usuário, item 8, precisa citar).
   - **[AUTO-DECISION]** A troca de cada etapa acontece depois da medição "antes" do item 5, e na mesma janela do PG02 (reason: misturar a troca de config com o merge da dedup tira do antes/depois a capacidade de separar os dois efeitos).
   - O PG04 já está conforme.
4. **Lista × mapa.** Verificar que `order_bump_products` e `product_types` concordam em toda etapa com config de Resumão **e** em toda etapa corrigida pela R3-5, e registrar o resultado (R-49-13 do Epic 49).
5. **Medição em produção, antes e depois**, para PG02 e PG04.
   - No PG02, nos dois períodos: 17/04–11/05 (comparável com a §10) e 17/04–09/05 (config vigente, conferência §4).
   - As 9 invariantes da 41.3 continuam passando, em especial A2, A4, A5, A8 e A9.
   - Nas etapas corrigidas pela R3-5 (item 3), o antes → depois de cada uma entra no mesmo registro.
6. **Atualizar `docs/specs/epic-41-valores-conferencia.md`** (R2-2).
   - A §10 original fica como histórico.
   - Entra uma seção "Valores corrigidos (41.10)", com a ponte versionada degrau a degrau, a decomposição PG02→PG04 recalculada e a indicação explícita de qual tabela é o oráculo a partir de agora.
   - **R3-4:** os degraus "5 vendas de 11/05 ausentes no n8n" e "7 estornos posteriores que seguem `paid` no n8n" entram na ponte rotulados como **diferença de fonte (n8n)**, só declarada. Não há story de sincronização.
7. **Testes.**
   - Transação duplicada conta uma vez.
   - Bump com o mesmo `txId` e outro produto conta separado.
   - Linha sem `txId` nunca colapsa.
   - Combo como captação define a atribuição e o bump herda.
   - Revertida a correção, os testes novos falham.
   - A fixture sintética de `__tests__/launch-report-engine.test.ts:116-130` monta vendas que reproduzem a §10 antiga. Ela testa a aritmética do engine, não a configuração de produção, então continua válida.
   - O @sm decide se ela ganha uma irmã com os valores corrigidos.
8. **Comunicação ao usuário antes do merge** (ver R-E7): o que muda, por quê (a ponte) e onde (Resumão, Comparativo e painel Captação Paga do PG02, mais as etapas corrigidas pela R3-5, com o antes → depois de cada uma).
9. **Gerar de novo os relatórios do PG02 (R3-3).** Depois do deploy e da troca de config, os Resumões do PG02 e o Comparativo PG02×PG04 já persistidos em `launch_reports` são **gerados de novo**. A geração nova é a mesma que o @qa confere contra produção.
   - A R3-3 manda gerar de novo e não manda apagar. Os relatórios antigos não são removidos por esta story.
   - A R3-3 cita só o PG02 e o PG02×PG04. Relatórios já gerados de **outros** lançamentos cujo número mude, seja pela dedup (que vale para todo Resumão) ou pela troca do Combo (R3-5), **não** estão cobertos. É a **P-8** do Epic 49, que só existe se o levantamento encontrar etapa afetada com relatório já gerado.

**Fora:**
- Os outros degraus da ponte: janela, 5 vendas ausentes no n8n, 7 estornos posteriores que seguem `paid` no n8n e Gravação vendida a quem não é comprador.
  - O Resumão continua somando toda linha paga, inclusive bump de quem não é comprador de captação (no snapshot, 94 e-mails e R$ 9.877,07).
  - É coerente com o número mais defensável da investigação, 1.806 pessoas / R$ 230.289,04, que inclui essas linhas.
  - O n8n fica como está: a diferença é só declarada (R3-4).
- Unificar `order_bump_products` e `product_types` numa configuração só. Fica como insumo para o @architect.
- O relatório perpétuo do botão 3, que também não deduplica por transação (`perpetual-report-loader.ts:381-410`). Pela R3-1, é a **story própria 41.11**, não fatia desta.
- Gratuito e `vendas-principal`, que seguem fora do escopo do epic.

**Impacto nos números de conferência do PG02** (`docs/specs/epic-41-valores-conferencia.md:13-35`). A estimativa abaixo vem do **snapshot n8n**, janela 17/04–11/05, e **não** é medição de produção; a 41.10 mede:

| Métrica | Hoje (§10) | Estimativa pós-41.10 | Causa |
|---|---|---|---|
| ingressos únicos | 1.410 | ~1.807 | regra de comprador |
| vendas totais | 2.222 (captação 1.597 + OB 625) | ~2.197 (captação ~1.900 + OB ~297) | dedup (−25) + regra |
| faturamento | R$ 233.572,94 | ~R$ 231.097,94 | dedup (−R$ 2.475,00) |
| — captação / OB | R$ 90.388,74 / R$ 143.184,20 | ~R$ 198.736,40 / ~R$ 32.361,54 | regra (Combo passa para a captação) |
| pago / orgânico, CPV pago, ticket pago, conversão clique→venda, ROAS pago, ROAS total | §10 | recalculados | atribuição do comprador muda, a de captação do Combo passa a definir; ROAS total cai só pelo dedup |
| investimento, impressões, cliques, CTR, CPM | §10 | **sem mudança** | mídia não é tocada |
| decomposição PG02→PG04 (41.6) | §10 | recalculada | ticket e conversão do PG02 mudam |

- A diferença restante até o número mais defensável é **+R$ 808,90**: +R$ 1.190,60 dos 7 estornos que seguem `paid` no n8n, −R$ 381,70 das 5 vendas que não estão no n8n.
- Na contagem, a diferença é +1 (1.807 contra 1.806) e não foi decomposta.
- No **PG04** a regra de produto já está conforme. Só o dedup pode mexer nele, e a medição diz quanto.

**Dependências.** 41.2 (motor), 41.3 (invariantes), 41.6 (decomposição), todas Done.
- **Bloqueia** a 41.11 (função de dedup) e, no Epic 49, a 49.3 (função de dedup) e a 49.5 (fixture governante).
- **Perguntas do dono respondidas na rodada 3:** P-3 → R3-2 (a autorização do Lucas cobre esta story; commits com `[scope-override]`); P-4 → R3-3 (gerar de novo, item 9); P-5 → R3-4 (diferença de fonte declarada, item 6); P-6 → R3-5 (todos os lançamentos com o Combo como bump, item 3).

### Story 41.11: dedup por (ID da venda, produto) no loader do relatório de Perpétuo (botão 3)

**Origem.** Decisão R3-1 do dono (2026-09-30), que respondeu a P-2 do Epic 49 com uma story própria no Epic 41, e não com uma fatia da 41.10. O defeito foi achado pelo @pm no Epic 49 (rodada 2), ao definir a 49.10, que consome este loader. A R2-1 torna a deduplicação por ID de transação obrigatória.

**O defeito, conferido no código em 2026-09-30:**
- O loader lê **uma** planilha por funil: `funnel_spreadsheets` com `type = 'perpetual_sales'` (`perpetual-report-loader.ts:90-100`), com o `column_mapping` do próprio funil.
- Em `parseVendas` (`:314`), o `transactionId` só serve ao passe de reembolso: monta o conjunto em `:361-370` e descarta a linha paga pareada em `:383-388`.
- Toda linha paga, dentro do período, com e-mail e valor > 0, entra em `vendas` (`:381-410`), e o motor soma todas. `PerpetualSaleRow` nem carrega o ID da venda.
- O produto vem de `mapping.productName` (`:342`, Story 29.53). Sem a coluna mapeada, `produto` sai `null`.

**Escopo (entra):**
1. **Levantamento antes do código (somente leitura), por funil perpétuo com `perpetual_report_configs`:**
   - para qual cabeçalho apontam `mapping.transactionId` e `mapping.productName`;
   - quantas linhas e quanto valor a dedup removeria na janela;
   - quantos IDs cobrem mais de um produto.
   - Pela R2-1 ("se necessário, corrigir o Loyola"), um mapeamento que aponte para coluna que não identifica a venda é corrigido pela UI, com antes → depois registrado. É a mesma regra da 41.10, item 1.
2. **Dedup no loader.** `parseVendas` chama `deduplicarPorIdDaVenda`, a função da 41.10. Não se cria outra chave nem outra função.
   - A chave é `(ID da venda, produto normalizado)`.
   - A dedup roda **depois** do passe de reembolso e **antes** de qualquer soma. Pela AUTO-DECISION do @sm na story, roda sobre as linhas pagas da planilha inteira, e só depois vem o corte de janela: a duplicata pode cair 3 h antes, no dia anterior de São Paulo.
   - Sobrevive a primeira linha; linha sem ID nunca colapsa.
   - O passe de reembolso continua como está: a transação reembolsada sai inteira, com as duplicatas.
   - **[AUTO-DECISION]** Funil sem `productName` mapeado: a dedup **não age** naquele funil, e o relatório traz um alerta dizendo que ela não rodou e por quê (reason: o contrato da 41.10 trata produto `null` como `""`; sem a coluna, ingresso e bump do mesmo pedido colapsariam. No snapshot do BBE-A1, 14 pedidos têm o ID cobrindo mais de um produto. A direção conservadora é não remover venda legítima, pelo mesmo princípio de "linha sem ID nunca colapsa". Mapear a coluna é ato de configuração por funil).
3. **O que saiu é reportado.** Linhas e valor removidos entram em `alertas[]`, sem bloquear, no padrão `W-P*` do motor (`perpetual-report-metrics.ts:380-400`). Códigos fixados na validação do @po: **`W-P7`** (removidas, contando só as com dia na janela) e **`W-P8`** (dedup não aplicada: `productName` ou `transactionId` não mapeado).
4. **Medição em produção, antes e depois**, por funil do levantamento.
   - Os três funis da §C.10 (BBE-A1, PPS-A1, FZ-A1, `docs/specs/epic-41-complemento-perpetuo.md:411`) são conferidos.
   - Se algum valor da §C.10 mudar, a spec ganha uma seção "Correção 41.11", e a §C.10 original fica como histórico (mesmo padrão da 41.10, item 6).
   - As invariantes P1–P7 continuam passando.
   - O painel perpétuo do Epic 29 (`routes/perpetual-sales-data.ts`) tem laço próprio e não é tocado. A medição registra se o botão 3 e o painel passam a divergir no mesmo funil e período.
5. **Testes:** os mesmos da 41.10, item 7. Transação duplicada conta uma vez; mesmo ID com outro produto conta separado; linha sem ID nunca colapsa; reembolso de transação duplicada sai inteiro; com a dedup revertida, os testes falham. Mais o caso "funil sem `productName` mapeado".
6. **Comunicação ao usuário antes do merge**, se a medição mostrar mudança em algum funil: o que muda (números do botão 3 do funil), por quê (venda duplicada por ID) e onde.

**Fora:**
- Montar `entrega` (CTR/CPC por `link_click`). Fica na composição da 49.10 (AUTO-DECISION do Epic 49).
- O `parseNumber` local do loader (`:417-425`), que lê `4.000` como 4 (R-49-4 do Epic 49). Nenhuma decisão manda corrigi-lo aqui.
- O painel perpétuo do Epic 29 e o `perpetual-dashboard`.
- O destino dos relatórios de perpétuo já persistidos em `perpetual_reports` cujo número mude. A R3-3 cobre só o PG02. É a **P-7** do Epic 49, que **bloqueia o merge** da 41.11 (não o início) e perde o objeto se a medição do item 4 não achar funil com duplicata.

**Contrato de API.** Se a única mudança for um alerta novo dentro do `alertas[]` que já existe, vale o mesmo critério da 41.10 (AC7): sem bump de `API_CONTRACT_VERSION`. Quem decide é o check 8 do QA gate.

**Dependências.** **41.10**, porque a função `deduplicarPorIdDaVenda` nasce lá; 41.7–41.9 (Done).
- **Bloqueia** a 49.10 do Epic 49 (R3-1). A fixture governante de perpétuo da 49.10 usa a §C.10 depois da medição desta story.

**Autoridade.** Coberta pela autorização do Lucas (R3-2). Os commits em `api/src/services/` e `__tests__/` levam `[scope-override]`.

**Estimativa: S–M** (a mesma da story). O código é uma chamada a uma função que já existe, mais o alerta e os testes. O peso está no levantamento por funil, na conferência da §C.10 e na comunicação.

## 🚧 Fora do escopo do epic

- ~~Perpétuo~~ — **entrou** em 2026-07-28 via complemento §C (stories 41.7–41.9).
- Gratuito (§12.3) — **segue fora do escopo por decisão de 2026-07-31**, mas o bloqueio conceitual foi resolvido: ver "Connect Rate" abaixo.
- Etapas `vendas-principal` / downsell (§12.6 — a atribuição de origem pode vir de etapa anterior; regra indefinida).
- Substituir a aba Sprint / `sprint_reports` (segue existindo para os relatórios de IA da gestora).
- Reescrever a metodologia já implementada (imposto, únicos, hot/cold, Faixa).

## 🔓 Connect Rate — definido em 2026-07-31

A §12.3 deixava o Gratuito pendente porque o **Connect Rate não tinha fonte no
dado**. O dono do produto definiu:

```
Connect Rate = Visualização da LP ÷ Link click     (ambos da Meta Ads)
```

**A fonte já existe no código** — `routes/stage-creative-performance.ts` tem
`parseLandingPageViews(ad.actions)` e `parseLinkClicks(ad.actions)`, ambos
lendo o `actions` do insight que já é buscado. Nenhuma chamada nova à Meta.

⚠️ **Não implementado.** A decisão de 2026-07-31 foi terminar o escopo pago
antes de abrir o gratuito. Isto fica registrado para quando a story existir — o
que falta agora é só decidir o resto do catálogo do Gratuito (que métricas de
venda são substituídas por quê, já que não há faturamento), não mais a fonte do
Connect Rate.

## 📌 Riscos de epic

- **R-E1 (alto) — Os números têm que bater com a §10.** Dois lançamentos reais com 20+ valores conferidos casa a casa. Se a implementação divergir, é bug, não "diferença de metodologia". Cobrir em AC de 41.2/41.4/41.6.
- **R-E2 (médio) — Rate limit da Meta.** Regra vigente do projeto: consultas Meta em lote, ler do banco, API só quando faltar dado recente. O gerador **não** pode virar um novo caminho de fan-out por criativo.
- **R-E3 (médio) — Escopo vaza.** É tentador "só habilitar pro FZ que é parecido". §12.2 existe exatamente para impedir isso; o gate é código, não convenção.
- **R-E4 (baixo) — HTML gigante.** `sprint_reports` já teve que colocar teto de 5MB. Herdar o mesmo limite.
- **R-E5 (alto) — Duplicar o Epic 29.** O complemento chama o botão 3 de "dashboard", mas o contrato §C.8 é `POST → { html }`: é **gerador de relatório**, não tela. O `perpetual-dashboard.tsx` (2.034 linhas) já entrega memorial de margem, CAC, ROAS e detalhamento por criativo/público agregado por nome com acentos normalizados (29.19/29.20). 41.8 **consome** esses cálculos; não os reescreve. Cobrir em AC de 41.8.
- **R-E7 (alto): a 41.10 muda números do Resumão em produção.**
  - O PG02 muda de patamar: ingressos únicos ~1.410 → ~1.807, faturamento −R$ 2.475,00, e a divisão captação/OB praticamente se inverte.
  - Mudam junto, pela mesma lista `order_bump_products`, os "Ingressos únicos" do painel Captação Paga do PG02 (`routes/stage-sales-data.ts:440-447,897,946`).
  - Resumões e Comparativos já persistidos em `launch_reports` continuam com o número antigo.
  - **Mitigação:** medir antes e depois em produção, versionar a ponte e os valores corrigidos na conferência e comunicar ao usuário **antes do merge**, com a ponte como explicação. Os relatórios do PG02 e o Comparativo PG02×PG04 são **gerados de novo** depois da correção (R3-3).
  - **Ampliado pela R3-5:** a troca do Combo vale para todos os lançamentos onde ele é order bump. Os "Ingressos únicos" e os Resumões dessas etapas também mudam, e o antes → depois é registrado por etapa. Relatórios já gerados fora do PG02 não estão cobertos pela R3-3 (P-8 do Epic 49, condicional).
- **R-E8 (alto): a 41.11 muda números do relatório de Perpétuo (botão 3) em produção.**
  - Venda duplicada por ID sai do faturamento e das vendas, e com ela mudam ticket, CAC, ROAS e margem do funil.
  - Os relatórios em `perpetual_reports` ficam com o número antigo. Os três funis da §C.10 são o oráculo conferido.
  - **Risco de colapso indevido:** com `productName` não mapeado, a chave `(ID, "")` juntaria ingresso e bump do mesmo pedido.
  - **Mitigação:** levantamento e medição por funil antes do merge; dedup inativa em funil sem `productName` mapeado (AUTO-DECISION, item 2); §C.10 conferida e, se mudar, corrigida sem apagar o histórico; comunicação antes do merge; destino dos relatórios já gerados com o dono se a medição achar funil afetado (P-7).
- **R-E6 (alto) — Fuso horário.** `perpetual-sales-data.ts:490` deriva o dia com `getFullYear/getMonth/getDate`, que usa o fuso do **processo**: em produção (UTC) uma venda `01:18Z` cai no dia seguinte ao do Brasil. O mesmo relatório dá números diferentes local vs Railway. §C.7 exige conversão explícita para `America/Sao_Paulo` — é pré-requisito de qualquer conferência contra a §C.10 e foi puxado para 41.7.

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-09-30 | @pm (Morgan) | **Story 41.10 adicionada** (decisões R2-1/R2-2 do dono no Epic 49): dedup por ID de transação + regra de comprador de captação Imersão OU Combo. **Origem:** investigação do PG02, ponte skill → Loyola com resíduo zero. **Avaliado no código:** o dedup é **código** (o loader do Resumão não deduplica, `launch-report-loader.ts:321-368`) e a regra de comprador é **configuração** (`order_bump_products`, `:250-265`). O PG04 já roda com o Combo como captação; o PG02 é correção de dado em produção. **Achado:** no snapshot n8n, as 25 duplicatas têm a coluna `Transaction` vazia e repetem `ID`; o mapeamento do PG02 precisa ser conferido. Estimativa no snapshot: 1.410 → ~1.807 ingressos únicos e R$ 233.572,94 → ~R$ 231.097,94. **Risco R-E7** adicionado. **Correção de referência:** a "dedup de ingresso único" citada em `stage-sales-data.ts:650-716` está hoje em `:880-946` (o trecho 650-716 é o laço de vendas contadas). Status do epic **não alterado**; arquivo da story a cargo do @sm. |
| 2026-09-30 | @po (Pax) | **PO validation da 41.10** (`*validate-story-draft`): 8/10, GO condicional, **Draft** — bloqueada pela P-3 do Epic 49 (autorização do Lucas para esta story); P-4 bloqueia o merge. A story foi alinhada ao escopo desta seção: chave `(ID, produto)` (itens 2 e 7), função `deduplicarPorIdDaVenda` exportada para a 49.3, `product_types` do PG02 (item 3), lista × mapa (item 4), PG04 no T0 e na medição (itens 1 e 5), comunicação antes do merge (item 8). Achado: no snapshot do DG-PG01 a dobra por evento repete `Transaction` com `ID` distinto — o levantamento da story mede o impacto da dedup em cada etapa antes do merge. |
| 2026-09-30 | @pm (Morgan) | **Rodada 3 do dono (R3-1 a R3-5) incorporada.** Fecha as perguntas P-2 a P-6 do Epic 49. Este registro toca **só os docs de epic**; as stories são do @sm.<br>**Story 41.11 adicionada (R3-1):** dedup por `(ID da venda, produto)` no loader do relatório de Perpétuo, chamando a `deduplicarPorIdDaVenda` da 41.10. Depende da 41.10, bloqueia a 49.10, estimativa S–M. Conferido no código: `perpetual-report-loader.ts` lê uma planilha por funil (`:90-100`), usa o `transactionId` só no passe de reembolso (`:361-370`, `:383-388`) e toda linha paga entra em `vendas` (`:381-410`). **[AUTO-DECISION]** Em funil sem `productName` mapeado, a dedup não age e vira alerta, porque a chave `(ID, "")` juntaria ingresso e bump do mesmo pedido. **Esta decisão não está no rascunho do @sm: o @po confere.** Risco **R-E8** adicionado.<br>**41.10:** R3-2 (a autorização do Lucas cobre a story, `[scope-override]`); R3-3 (item 9: gerar de novo os Resumões do PG02 e o Comparativo PG02×PG04, sem apagar os antigos); R3-4 (item 6: os degraus do n8n entram na ponte como diferença de fonte declarada); R3-5 (item 3: a troca do Combo vale para toda etapa com o Combo na lista de bumps, com ou sem config de Resumão, com lista e mapa antes → depois por etapa). **[AUTO-DECISION]** Mapa coerente com a lista em cada etapa; ingressos únicos antes → depois no registro; troca depois da medição "antes". R-E7 ampliado.<br>**Ordem de merge:** 41.10 → 41.11 → 49.10, com a 41.11 em paralelo à trilha 49.3–49.7.<br>**Perguntas novas, no Epic 49:** P-7 (relatórios de perpétuo já gerados; bloqueia o merge da 41.11, como a story já registra) e P-8 (Resumões já gerados de outros lançamentos que mudem pela dedup ou pela R3-5; condicional ao levantamento). |
| 2026-09-30 | @po (Pax) | **PO validation final 2026-09-30** da **41.10** e da **41.11**: as duas **Draft → Ready** (9/10). **41.11:** a [AUTO-DECISION] deste epic (funil sem `productName` → dedup não age e vira alerta) entrou na story como `W-P8`, estendida a `transactionId` não mapeado; o teste "duplicata na virada do dia" foi reescrito com janelas adjacentes (o do rascunho passava com o bug de volta); alerta de removidas = efeito na janela (`W-P7`); "Correção 41.11" na spec se a §C.10 mudar; divergência botão 3 × painel do Epic 29 registrada. **41.10:** mesma política de chamador (W10) e W9 contando a janela; itens 6 (decomposição PG02→PG04 recalculada; oráculo declarado) e 41.6 no `Depends On`. **P-7** (41.11) e **P-8** (41.10, agora cobrindo também relatório que muda só pela dedup): condicionais ao levantamento e bloqueiam o **merge**, não início nem Ready. |
| 2026-07-31 | @dev (Dex) | **Connect Rate definido** pelo dono do produto: `Visualização da LP ÷ Link click`, ambos da Meta Ads — a fonte já existe no código (`parseLandingPageViews` / `parseLinkClicks`). Destrava conceitualmente o §12.3, mas o Gratuito **segue fora do escopo por decisão**: terminar o pago primeiro. |
| 2026-07-31 | @dev (Dex) | **41.2–41.6 implementadas** e conferidas contra a §10 (versionada em `docs/specs/epic-41-valores-conferencia.md`): faturamento do PG02 bate ao centavo, A9 fecha com diferença 0,000000, A6 fecha com 0,0000 no PG04 e a decomposição PG02→PG04 reproduz os quatro fatores da spec. O epic inteiro passa a **InReview**. Handoff: `epic-41-HANDOFF-2026-07-31.md`. Risco **R-E1 mitigado** — os números batem. Achado que afeta o epic: `meta_ad_insights_daily` do DG começa em 2026-05-20, então o PG02 nunca terá ad-level e o A6 fica `skipped` para ele em definitivo. |
| 2026-07-28 | @sm (River) | **Complemento §C incorporado** (`docs/specs/epic-41-complemento-perpetuo.md`). Perpétuo saiu de "fora do escopo" e virou 3 stories (41.7–41.9), em trilha paralela à 41.2–41.6. **3 decisões do usuário:** (1) **taxas** — a spec fixa 83,01% de receita líquida, mas o código (29.7/29.8) já tem dois ramos: 83,01% com coluna de status na planilha (`reembolsoReal`), 79,01% sem ela, e Hotmart a 26%. Mantidos os dois ramos, com as taxas expostas na config; os 3 funis da §C.10 caem no ramo de 83,01% — conferido: 14.495,61 × 0,8301 − 4.209,17 = R$ 7.823,64 vs 7.823,63 da spec. (2) **formato** — relatório HTML persistido (contrato §C.8), não dashboard novo. (3) **fatiamento** — 3 stories. Riscos R-E5 (duplicação do Epic 29) e R-E6 (fuso horário) adicionados. |
| 2026-07-27 | @sm (River) | Epic criado a partir da spec técnica. Decisão-chave: as 4 views do §1 mapeiam para serviços já existentes (survey-aggregation, lead-origin-sync, stage-sales-data, public-meta/sales-rows) — o epic entrega a camada de relatório, não a metodologia. Decisões de UI confirmadas com o usuário: botões **na etapa do funil**, HTML **persistido** (padrão `sprint_reports`), entrega em **6 stories fatiadas**. |
