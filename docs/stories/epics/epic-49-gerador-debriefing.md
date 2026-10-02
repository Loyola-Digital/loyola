# EPIC-49 — Gerador de Debriefing de Lançamento e Perpétuo (botão na etapa Debriefing)

**Origem:** a skill/squad `loyola-debriefing` (fora do repo: `/Users/danilosagae/Documents/aiox-bonsai/squads/loyola-debriefing/`), que hoje produz o debriefing de lançamento **no chat**, com o Claude calculando a metodologia a partir de exports. Sessão de levantamento de 2026-09-30 (Danilo + @sm River) — tudo abaixo foi lido no código ou testado; nada é inferência.

**Objetivo:** internalizar essa geração. Um botão **"Gerar debriefing"** dentro da etapa do tipo Debriefing do funil produz, **deterministicamente a partir do banco**, o relatório HTML do lançamento no padrão visual da skill — com as verificações da Fase 12 da skill bloqueando número errado antes de renderizar. Pela decisão 2 do dono (2026-09-30), o botão vale também para **funil perpétuo**. A forma do perpétuo foi decidida na rodada 2 (**R2-3, opção A**): os números vêm do motor do botão 3 do Epic 41, renderizados no padrão da skill. É a story **49.10** (seção "Perpétuo"). Depois, uma mente "Debriefing" no Minds conversa sobre um debriefing **já gerado**.

**Precedente arquitetural:** `docs/stories/epics/epic-41-resumao-comparativo-generator.md` (loader → engine puro → guards → narrative → render → persistência → botão).

**Criado:** 2026-09-30 (@pm — Morgan)
**Status:** Draft. Validação final do @po em 2026-09-30, depois das rodadas 1, 2 e 3 do dono:
- **Ready:** 49.1–49.10 e, no Epic 41, **41.10** e **41.11**.
- **Pendências do dono que bloqueiam merge (nunca início nem Ready), ambas condicionais:** **P-7** (merge da 41.11) e **P-8** (merge da 41.10) — ver "Perguntas abertas".
- A 49.3 é Ready, mas não começa antes de a 41.10 mergear (ordem de merge), porque consome a função de dedup que a 41.10 extrai. A 49.10 não mergeia antes da 41.11 (R3-1).

---

## Por que este epic existe

A skill é a metodologia validada do debriefing (Fases 0→12, `workflows/debriefing-pipeline.yaml`), com 10 armadilhas documentadas (`data/armadilhas-conhecidas.md`) e fixtures de regressão por expert (`data/expert-profiles/*.md` §8). O problema é **onde** ela roda:

1. **O chat de Minds não comporta o cálculo.** `packages/api/src/routes/chat.ts` + `services/claude.ts`: Sonnet 4.6, `max_tokens` 4096, no máximo 10 rodadas de tool, histórico de 20 mensagens; as tools são só ClickUp, `instagram_metrics`, `consult_mind` e `get_past_conversations` (`services/chat-tools.ts`); a resposta é markdown (react-markdown, sem HTML). Um relatório de 17–37 gráficos e 19 seções não cabe nisso.
2. **Número calculado no prompt não é reprodutível nem auditável.** É a mesma razão que levou o Epic 41 a tirar o Resumão do prompt. As armadilhas #1 (dups dobrando faturamento: ROAS de captação caiu de 3,48 para 1,75 após dedup) e #9 (Closer 19 num lugar e 22 noutro) são exatamente o tipo de erro que um motor único com invariantes elimina.
3. **O dado já está no Loyola.** Mídia por etapa, vendas deduplicadas, ingresso × bump, pesquisa com faixa, cross-launch — a maior parte das fases tem fonte no banco (tabela abaixo). O que falta é a camada de relatório.

## Decisões do dono (Danilo), levantamento: ✅ são lei, não reabrir

1. ✅ **Porta de entrada:** botão **"Gerar debriefing" dentro da etapa do tipo Debriefing** do funil/lançamento **primeiro**; **depois** uma mente "Debriefing" no Minds (chat) — só para conversar sobre um debriefing **já gerado** (lê o payload, **nunca recalcula**).
2. ✅ **Imposto: regra do Loyola.** O spend já sai com gross-up de 12,15% "por dentro" (`packages/api/src/utils/meta-tax.ts:15,24` — `spend / (1 − 0,1215)`), com override `imposto_pct` por config (`resolveImpostoPct`, `packages/api/src/services/launch-report-config.ts:65`). **Nunca reaplicar o ×1,13 da skill.**
3. ✅ **Entregável: só HTML.** A planilha `.xlsx` da skill sai do escopo.
4. ✅ **Cálculo no servidor, julgamento na IA.** A IA nunca soma; o backend calcula e entrega um payload auditável. A IA (LLM) escreve **só** blocos de texto: insights, recomendações, anotações, lacunas.

## Decisões do dono (2026-09-30): ✅ são lei, não reabrir

Respostas do Danilo às pendências (a)–(k) consolidadas pelo @po, mais 3 itens de processo. Fonte: `decisoes-dono-epic-49.md` (scratchpad da sessão de 2026-09-30). As letras entre parênteses são as do Change Log do @po.

| # | Pendência | Decisão | Onde se aplica |
|---|---|---|---|
| 1 | (b) Número de referência das guardas e chave do comprador único | **A. O número do Loyola manda** (planilhas do app, dedup por e-mail). O número da skill aparece **só como comparação** no relatório e **nunca bloqueia**. O dono pediu uma investigação à parte da diferença do PG02. Ela **foi concluída** (ponte com resíduo zero) e virou a rodada 2: o número do Loyola **já corrigido** (R2-1 / 41.10) é o que governa. | 49.3, 49.5 · R-49-1 · **→ R2-1** |
| 2 | (a) Combinações liberadas pelo gate no dia 1 | **B. DG + FZ + Netão, em Lançamentos E Perpétuo.** Com isso o escopo cresce: funil perpétuo também tem o botão. | 49.1 (lista do gate) · perpétuo → **49.10** + **P-1** |
| 3 | (c) Lead de anúncio Meta com venda fechada por closer (x1) | **C. Dois eixos separados.** O eixo de **aquisição** usa a UTM do lead, com fallback na da venda (Pago/…). O eixo de **fechamento** é o Closer. Os dois nunca se somam nem se confundem (lição do Netão em `data/insights-recorrentes.md`). | 49.2 (e Tabela 1 na 49.3) · R-49-2 · **→ R2-5** (comprador só com UTM de closer) |
| 4 | (d) Campo do Quente/Frio | **B. `utm_term`** (como o Loyola faz hoje), com **fallback no `campaign_name` vindo da API do Meta** quando o term não decide. | 49.2 / 49.3 (a leitura continua DB-first, ver requisitos transversais) |
| 5 | (h) ROAS total inclui o downsell no numerador? | **A. Sim.** | 49.3 |
| 6 | (g) Limiar de "gasto ~zero" (pico-artefato no ROAS diário) | **A. Gasto abaixo de 10% do investimento médio diário da captação.** | 49.3 |
| 7 | (k) Venda do principal antes da abertura do carrinho e venda-teste | **A. Excluir automaticamente** e listar o que saiu na auditoria/lacunas. **A parte da venda-teste foi revertida pela R2-4:** só a venda anterior à abertura do carrinho é excluída. | 49.3 (exclusão) · 49.6 (lista no relatório) · **→ R2-4** |
| 8 | (i) Pesquisa respondida 2× | **A. Vale a resposta mais recente.** | 49.4 |
| 9 | (j) Denominador do % por dimensão | **B. O segmento inteiro** (como o Resumão). | 49.4 |
| 10 | (e) Falha do LLM ao escrever os textos | **B. Bloquear a geração e explicar o erro** na tela (código, motivo e ação), no padrão do botão do Resumão. | 49.7 (+ botão da 49.6) · R-49-9 |
| 11 | (f) Dados pessoais de comprador para o LLM/mente | **A. Não. Só identificador anônimo**; UTMs, produto e valores podem ir. | 49.7, 49.9 · R-49-11 |
| 12 | Autorização do Lucas para código fora do scope `restricted` | **Autorizado** (informado pelo Danilo em 2026-09-30). Todo commit fora do scope leva `[scope-override]`. | "Escopo de autoridade" |
| 13 | Commit + PR só de documentação (epic + stories) | **A. Sim.** | @devops (push/PR exclusivos) |

## Decisões do dono, rodada 2 (2026-09-30, depois da investigação do PG02): ✅ são lei, não reabrir

Fonte: `decisoes-dono-epic-49.md`, seção "Rodada 2", no scratchpad da sessão de 2026-09-30.

| # | Decisão | Onde se aplica |
|---|---|---|
| R2-1 | **"Comprador de captação" segue a regra da skill: Imersão OU Combo.** O Combo substitui o ingresso; Gravação e GPT são bump. **O Loyola deve ser corrigido para os mesmos termos.** **A deduplicação por ID de transação é obrigatória** e, se preciso, o Loyola é corrigido. O número do Loyola **já corrigido** continua governando as guardas (decisão 1). | **41.10** (Resumão) · 49.3 (ingresso × bump, dedup camada 1) · 49.5 (fixture governante) · R-49-1, R-49-12, R-49-13 |
| R2-2 | **Abrir story de correção do Resumão: Epic 41, story 41.10.** Ela cobre o dedup por ID de transação e a regra de comprador da R2-1. Também atualiza `docs/specs/epic-41-valores-conferencia.md` com os números corrigidos e a ponte. | `epic-41-resumao-comparativo-generator.md` (41.10) · ordem de merge deste epic |
| R2-3 | **Perpétuo = opção A.** Os números vêm do motor do botão 3 (41.8), no padrão visual da skill, com os textos da IA (49.7), e o resultado é salvo em `debriefings`. O que o 41.8 não calcula vira **lacuna declarada**. CTR/CPC vêm de `link_click`; o loader do perpétuo hoje não preenche `entrega`. | **49.10** · fecha a **P-1** · R-49-10 |
| R2-4 | **Venda-teste: NÃO excluir automaticamente** (opção B). Só sai a venda com data anterior à abertura do carrinho. | 49.3 (exclusão), 49.5 (F1/F7/WF7), 49.6 (lista no relatório) · revoga parte da decisão 7 |
| R2-5 | **O comprador cuja única UTM é de closer vai para um balde próprio no eixo de aquisição: "Aquisição não rastreada (só closer)".** "Sem track real" continua sendo quem não tem UTM nem no lead nem na venda. No eixo de fechamento, esse comprador é Closer. | 49.2 (rótulo do eixo de aquisição) · 49.3 (Tabela 1) · 49.5 (F3–F6) · R-49-2 |

## Decisões do dono, rodada 3 (2026-09-30): ✅ são lei, não reabrir

Fonte: `decisoes-dono-epic-49.md`, seção "Rodada 3", no scratchpad da sessão de 2026-09-30. Respondem as perguntas P-2 a P-6.

| # | Pergunta | Decisão | Onde se aplica |
|---|---|---|---|
| R3-1 | P-2 | **A dedup por ID de transação no loader do relatório de Perpétuo (botão 3) é story PRÓPRIA no Epic 41**, e não fatia da 41.10. **A 49.10 depende dela.** | **41.11** (Epic 41) · 49.10 · ordem de merge · R-49-10 |
| R3-2 | P-3 | **A autorização do Lucas cobre a 41.10** e a story nova do perpétuo. Commits com `[scope-override]`. | 41.10, 41.11 · "Escopo de autoridade" |
| R3-3 | P-4 | **Os Resumões e Comparativos do PG02 (e PG02×PG04) já gerados são GERADOS DE NOVO** depois da correção. | 41.10 (item 9 no Epic 41) · R-49-12 |
| R3-4 | P-5 | **O n8n sem 5 vendas de 11/05 e com 7 estornos `paid` é só declarado como diferença de fonte** no relatório. Não há story de sincronização. | 41.10 (ponte na conferência) · 49.5 (degrau "fonte-janela") |
| R3-5 | P-6 | **A troca de config do Combo** (o Combo conta como comprador e sai da lista de order bump) **vale para TODOS os lançamentos onde o Combo está como order bump**, não só o PG02. É feita pela UI/config, com antes → depois registrado por etapa. | 41.10 (item 3 no Epic 41) · R-49-12, R-49-13 |

### A ponte do PG02: de 1.845 para 1.410, com resíduo zero

A investigação fez uma ponte em cascata que leva o número da skill ao do Loyola. Os scripts são `ponte.py`, `loyola_repro.py` e `skill_repro.py`, no diretório `pg02-diff/` do scratchpad da sessão. **O scratchpad não é versionado**, por isso a 41.10 tem de levar a ponte para a conferência. Os dados de entrada ficam no squad: `aiox-bonsai/squads/loyola-debriefing/dados/danilo-gato/pg02-kiwify.csv` (export cru da Kiwify) e o snapshot `[DG-PG02-ABR26] Painel de Controle - n8n-kiwify-captação.csv`. Reexecutado por este @pm em 2026-09-30, com a mesma saída:

| Passo (skill → Loyola) | Compradores | Faturamento |
|---|---|---|
| Skill: export cru, `paid`, todas as datas, Imersão OU Combo, chave e-mail OU telefone | 1.845 | R$ 227.491,74 |
| Chave só por e-mail | +1 | — |
| **Regra de produto:** Loyola = Imersão OU Gravação, com o Combo como bump. 507 dos 597 compradores de Combo não compraram Imersão | **−384** | — |
| Gravação vendida a quem não é comprador. A skill soma só o faturamento dos compradores | — | +R$ 11.751,66 |
| Janela 17/04–11/05 | −50 | −R$ 8.954,36 |
| 5 vendas que não estão no n8n (todas em 11/05) | −3 | −R$ 381,70 |
| 7 estornos posteriores que ainda constam como `paid` no n8n | +1 | +R$ 1.190,60 |
| **25 vendas de R$ 99 duplicadas no n8n, com o mesmo ID de transação. O Resumão não deduplica** | 0 | **+R$ 2.475,00** |
| **Loyola (Resumão, Epic 41)** | **1.410** | **R$ 233.572,94** |

O número mais defensável na janela é **1.806 pessoas / R$ 230.289,04** (export cru, `paid`, Imersão OU Combo).

### A regra do comprador é configuração ou código? (avaliado no código em 2026-09-30)

**Resposta:** a regra "Combo conta como comprador" é **configuração por etapa**. Corrigir o PG02 é **mudança de dado em produção**. A deduplicação por ID de transação é **código** no Resumão e talvez **também configuração** no PG02 (item 4).

1. **O Resumão decide por uma lista de configuração, não por código.**
   - O loader monta o conjunto de bumps com a união de `stage_sales_spreadsheets.order_bump_products` de todas as planilhas da etapa. Produto que não está na lista conta como captação (`launch-report-loader.ts:250-265`, `isOrderBump` em `:367`).
   - O engine conta como único o e-mail com ≥ 1 linha que não é bump, mais os avulsos sem e-mail. Só uma linha de captação define a atribuição (`launch-report-engine.ts:440-499`).
   - Prova de que é dado: o PG04 **já** roda com o Combo como captação. Pela conferência, a captação do PG04 é "Imersão Super Funcionário" + "Combo 3 em 1" (`epic-41-valores-conferencia.md`, seção "A classificação de produtos bate exatamente com a §10").
   - No PG02, a lista contém o Combo e o GPT (`epic-41-valores-conferencia.md:37-39`).
   - **Correção do PG02:** a lista passa a ser {Gravação, GPT}, sem o Combo.
2. **A mesma lista alimenta o painel Captação Paga.** O `isOrderBump` de `routes/stage-sales-data.ts:440-447` decide quem entra no único (`:897` → `ingressosUnicos` em `:946`). Logo, corrigir o dado muda também os "Ingressos únicos" do painel do PG02, não só o Resumão.
3. **O debriefing (49.3) lê outra configuração, o mapa `product_types`.**
   - Na rota, o mapa manda, e sem mapa a lista vira `order_bump` (`stage-sales-data.ts:464-479`).
   - O debriefing usa `tipoDoProduto` (`utils/produto.ts:47`) e `tiposQueAncoram` (`utils/order-bump.ts:102-107`). Em captação, as âncoras são {`ingresso`, `combo`}: "o Combo substitui o ingresso" **já está no código** como o tipo `combo`.
   - Para o PG02, o mapa precisa ter Imersão = `ingresso`, Combo = `combo` e Gravação e GPT = `order_bump`.
   - **São duas configurações que respondem à mesma pergunta** (R-49-13).
4. **O dedup por ID de transação é código, e talvez também configuração.**
   - O loader do Resumão usa o `txId` só para tirar o par de reembolso (`launch-report-loader.ts:321-347`). Toda linha entra (`:357-368`) e o engine soma todas (`launch-report-engine.ts:544-546`).
   - Os outros caminhos já deduplicam por `(txId, produto)`: `stage-sales-data.ts:606-611` e `sales-daily-sync.ts:278-281`.
   - **Achado deste @pm (snapshot n8n):** as 25 duplicatas repetem a coluna `ID`, mas a coluna `Transaction` está **vazia** nelas. No snapshot, `Transaction` tem 37 linhas vazias e nenhuma repetição entre as preenchidas.
   - Linha sem `txId` nunca colapsa (`stage-sales-data.ts:606-608`). Se o `column_mapping.transactionId` do PG02 apontar para `Transaction`, o dedup novo **não pega** as 25.
   - O wizard não fixa a coluna (`web/components/funnels/stage-sales-wizard-dialog.tsx:32-34`, "Kiwify ID/Transaction"). A 41.10 confere o mapeamento em produção antes de codar.

### Por que a 41.10 mergeia antes da 49.3

1. **Função de dedup compartilhada.** Hoje a chave `(txId, produto)` existe inline em pelo menos dois serviços (`stage-sales-data.ts:606-611`, `sales-daily-sync.ts:278-281`), e a camada 1 da 49.3 criaria mais uma. **[AUTO-DECISION]** Quem cria a função? → **a 41.10 extrai a chave para uma função pura em `api/src/utils/` e o Resumão passa a usá-la. A camada 1 da 49.3 (`deduplicarVendas`) consome essa mesma função.** Confirmada pelo @po em 2026-09-30; nome fixado no "Contrato exportado" da 41.10: `deduplicarPorIdDaVenda(linhas, chave)`, chave `(ID da venda, produto normalizado)` por planilha, sobrevive a primeira, linha sem ID nunca colapsa. (reason: é a lição do R-49-2 e da armadilha #9, uma regra num lugar só. A 41.10 é a menor das duas e é a que corrige produção.)
2. **A fixture governante muda.** A fixture `governante` do PG02 na 49.5 usa os valores de `epic-41-valores-conferencia.md` (1.410 / R$ 233.572,94), e a 41.10 corrige esses valores. Se a 49.5 entrar antes, nasce com o oráculo errado.
3. **O dado de produção precisa estar certo.** A correção da lista e do mapa do PG02 tem de estar em produção antes de a 49.3 e a 49.5 serem conferidas contra produção.

## Perpétuo (decisão 2): o que os artefatos definem e o que fica com o dono

### O que existe

- **Na skill, a metodologia é só de lançamento.** As Fases 0–12, as tasks, os checklists e as fixtures tratam perpétuo apenas como campanha a **excluir** do lançamento (`tasks/03-midia-paga-meta.md:40`, `data/parametros-constantes.md:27`, `data/insights-recorrentes.md:35`, onde "evergreen paralelo é armadilha de investimento"). Não há task, workflow, checklist nem fixture de perpétuo.
- **A skill tem um único entregável avulso de perpétuo:** `entregaveis/perpetuo/relatorio-perpetuos-2026-09-20.html` (+ `analise-perpetuos-2026-09-20.json`).
  - Cobre uma carteira de 6 funis: DG-Claude, DGA1, FZ, BBE-Churrasco, BBE-Hambúrguer e PPS.
  - Janelas: vida do funil, mês corrente e 7 dias.
  - Seções: macro, evolução mensal, diário do mês, campanhas, quente×frio·formato·LP, públicos, criativos, posicionamentos e produto×origem, notas e leituras.
  - Definições: investimento ÷ (1 − 0,1215); margem com receita líquida de 83,01%; CAC de equilíbrio = ticket × 83,01%; orgânico fora de CAC/ROAS; bump conta como venda.
  - Não aparece na nomenclatura de `entregaveis/README.md` e nenhuma task o produz. É um retrato, não uma metodologia.
- **No Loyola, o perpétuo já tem gerador: o botão 3 do Epic 41** (41.7–41.9, Done em 2026-08-03).
  - Config `perpetual_report_configs` por funil, com `validado`. O gate é `COMBINACAO_NAO_VALIDADA`, sem o bypass da 41.1 (41.7 AC3).
  - Motor puro `computePerpetualReport` (`api/src/services/perpetual-report-metrics.ts:313`) com as invariantes P1–P7.
  - Janela `dataInicio/dataFim` e persistência em `perpetual_reports` com `metricas` + `alertas` (`api/src/routes/perpetual-report.ts:113`).
  - As definições do entregável da skill **coincidem** com as do botão 3: gross-up de 12,15%, 83,01%, CAC de equilíbrio e orgânico à parte.
- **O funil perpétuo pode ter etapa Debriefing.** O "Nova Etapa" voltou ao perpétuo no Epic 40 (`web/app/(app)/projects/[id]/funnels/[funnelId]/page.tsx:78-80,372`), e `debriefings` liga o documento por `stage_id`. Logo, o botão da 49.6 tem onde morar.
- **Achado:** no motor do botão 3, `cliques`, `ctr` e `cpc` saem `null` na prática. Eles dependem de `input.entrega` (`perpetual-report-metrics.ts:89,427-429`), que o `perpetual-report-loader.ts` não preenche. Qualquer opção que reuse esse motor precisa trazer CTR/CPC de `link_click`, conforme a regra deste epic, nunca de cliques totais.

### O que não se aplica ao perpétuo

O perpétuo não tem etapas por decisão de domínio (Story 29.6). Por isso ficam de fora:

- as datas-chave de captação, carrinho, reabertura e downsell (49.1 AC2);
- ingresso × principal e o ROAS em 3 níveis (49.3);
- a coorte D+x ancorada na abertura do carrinho (49.3);
- a regra "única conversão válida = Ingresso → Principal".

### Equivalente às datas-chave e aos gates (vale para qualquer opção)

- **Janela, não marcos.** O lugar das datas-chave é ocupado pela janela do relatório (início/fim) mais o `inicio_trafego` de `perpetual_report_configs`. Os dois artefatos trabalham assim: o 41.9 com `dataInicio/dataFim` e a skill com vida do funil/mês/7 dias.
- **Gate.** É a combinação liberada da 49.1 (decisão 2), somada a `perpetual_report_configs.validado` (41.7) quando o motor do botão 3 for reusado.

### Decisão de estrutura (@pm)

**O perpétuo vira a story nova 49.10, e não um ajuste nas 49.3/49.4.** O motor, a config e a janela são outros, e o motor do Loyola já existe (41.8). Enfiar ramos de perpétuo nos motores de lançamento repetiria o R-E5 do Epic 41 (duplicar metodologia já implementada). Os ajustes nas stories existentes são pequenos (lista abaixo). A P-1 foi respondida (R2-3), e o @sm os aplica.

### ✅ P-1 respondida: opção A (R2-3, 2026-09-30)

O dono escolheu a **opção A**, que o @pm recomendava: números do motor do botão 3 (41.8), no padrão visual da skill, com os textos da IA (49.7), salvos em `debriefings`. O que o 41.8 não calcula vira **lacuna declarada**, e não AC nova de cálculo.

As opções descartadas ficam aqui só como histórico:
- **B** aplicava ao perpétuo fases de lançamento da skill. Viraria ramos em 49.1/49.3/49.4/49.5 e corria o risco de duplicar o 41.8.
- **C** gravava o HTML do botão 3 como está, sem o padrão da skill e sem os textos da IA.

### Story 49.10: definição

**Título:** Debriefing de funil perpétuo. Números do motor do botão 3 (41.8), padrão visual da skill, textos da IA, salvo em `debriefings`.

**Entra:**
1. **Números só do `computePerpetualReport`** (`api/src/services/perpetual-report-metrics.ts:313`), alimentado pelo loader do botão 3 (41.7/41.8).
   - Nenhuma fórmula nova de perpétuo.
   - As invariantes P1–P7 do 41.8 bloqueiam como no botão 3.
2. **Janela no lugar das datas-chave.** Valem a janela início/fim e o `inicio_trafego` de `perpetual_report_configs`. Não entram carrinho, coorte D+x nem ROAS em 3 níveis (seção "O que não se aplica ao perpétuo").
3. **Gate duplo:** a combinação liberada na 49.1 (DG/FZ/Netão, decisão 2) **e** `perpetual_report_configs.validado` (41.7 AC3, `COMBINACAO_NAO_VALIDADA` sem bypass).
4. **CTR/CPC por `link_click`** (R2-3).
   - Hoje o motor devolve `cliques/ctr/cpc = null` porque o loader não preenche `entrega` (`perpetual-report-metrics.ts:89,427-429`).
   - A 49.10 monta `entrega` com `link_click` lido do banco (`api/src/utils/meta-insight-agg.ts:67`, `shared/src/clique-no-link.ts`), nunca com `clicks` totais. Sem `link_click`, o valor é `null` e aparece como `—`.
   - **[AUTO-DECISION]** Onde montar `entrega`? → **na composição da 49.10, não no loader compartilhado do botão 3.** (reason: "Fora do escopo" deste epic proíbe alterar o relatório do botão 3. Preencher `entrega` no loader faria o botão 3 trocar `null` por valor sem story própria.)
5. **Render no padrão visual da skill**, com a mesma infraestrutura da 49.6 (paleta, `sec-head`, Chart.js 4.4.1 + datalabels 2.2.0, sem `localStorage`).
   - Segue as seções do entregável `entregaveis/perpetuo/relatorio-perpetuos-2026-09-20.html`, **mas só onde o 41.8 calcula o número**.
6. **Lacunas declaradas** (R2-3).
   - Toda seção do entregável que o 41.8 não calcula sai como lacuna com código próprio. No levantamento de 2026-09-30 são posicionamentos, série mensal e produto × origem.
   - O @sm confere a lista final contra a saída do `computePerpetualReport` ao rascunhar.
7. **Textos da IA pela 49.7**, com as decisões 10 e 11: falha do LLM bloqueia a geração, e o LLM só recebe identificador anônimo.
8. **Persistência em `debriefings`** por etapa (HTML + payload, pelo mecanismo da 49.6). O payload leva o tipo do funil, para a 49.9 distinguir os dois formatos.
9. **Despacho do botão.** A `debriefing-stage-view` (49.6) despacha por `funnels.type`. O erro explícito do R-49-5 deixa de existir quando a 49.10 entra.

**Fora:** alterar o relatório e o botão 3 (41.9) e o `perpetual-dashboard`; metodologia de lançamento no perpétuo; qualquer cálculo que o 41.8 não faz.

**Depende de:** 49.1 (gate), 49.6 (render, persistência, botão), **49.7** (textos) e, no Epic 41, **41.7–41.9** (Done) e **41.11** (R3-1). A 41.11 põe a dedup por `(ID da venda, produto)` no loader do botão 3, que a 49.10 consome. A 49.10 **não** deduplica por conta própria: recebe as vendas já deduplicadas do loader.

**Estimativa:** **M**. **Ordem de merge:** depois da 49.7 **e da 41.11**, e antes da 49.9.

**Achados que a 49.10 herda (verificados no código em 2026-09-30):**
- **Sem dedup por transação.** `perpetual-report-loader.ts:381-410` não deduplica por ID de transação: o `txId` só retira o par de reembolso (`:363-388`) e toda linha entra no faturamento. É o mesmo defeito que a 41.10 corrige no Resumão. **Resolvido pela R3-1:** é a 41.11, da qual a 49.10 depende.
- **Fixture governante depois da 41.11.** As fixtures de perpétuo da 49.10 (AC4) usam a §C.10. Se a medição da 41.11 mudar algum valor da §C.10, vale a seção "Correção 41.11" da spec, pelo mesmo motivo que a 49.5 usa os valores corrigidos pela 41.10.
- **Parser numérico local.** O `parseNumber` de `perpetual-report-loader.ts:417-425` lê `4.000` como 4, então o R-49-4 vale também aqui.
- **Fixture governante só para FZ e Netão.** A conferência versionada de perpétuo cobre FZ-A1 e BBE-A1/Netão (§C.10, `docs/specs/epic-41-complemento-perpetuo.md:7-9`). O **DG perpétuo não tem conferência**. Antes de gerar, o funil precisa de `validado = true`, que é o mesmo ato humano da 41.7.

### Ajustes nas stories existentes (P-1 respondida; o @sm aplica em paralelo, e este doc não edita story)

- **49.1:**
  - As datas-chave (AC2) valem só para `funnels.type = 'launch'`. No perpétuo, a config é a janela mais o `inicio_trafego`.
  - O gate libera as combinações da decisão 2 nos dois tipos de funil, mas a geração no perpétuo só existe com a 49.10.
  - Até lá, o botão dá erro explícito, em vez de rodar o motor de lançamento sobre funil perpétuo (R-49-5).
- **49.5:** fixtures de perpétuo usam como governante os valores do Loyola (§C.10: FZ-A1, BBE-A1), pela decisão 1. O entregável da skill de 2026-09-20 entra só como comparação. As invariantes de perpétuo são as P1–P7 do 41.8; os checks da Fase 12 são de lançamento. **[AUTO-DECISION @po, 2026-09-30]** essas fixtures moram na **49.10** (AC4), não na 49.5: o payload e o diferencial contra o botão 3 que elas conferem nascem lá. A 49.5 cria o discriminador `payload.tipo` (`"lancamento"`) que a 49.10 estende.
- **49.6:** o botão da `debriefing-stage-view` despacha pelo tipo do funil.
- **49.9:** a mente lê os dois formatos de payload (lançamento e perpétuo), distinguidos pelo tipo gravado pela 49.10.

## Decisão arquitetural que atravessa o epic

**O Epic 49 reusa a arquitetura do Epic 41 e os serviços de dado existentes; não reescreve metodologia que o Loyola já tem.** O trabalho é a camada de debriefing em cima deles.

### O que se reusa do Epic 41 (padrão, não o motor)

| Peça | Arquivo no Loyola | O que o 49 herda |
|---|---|---|
| Loader (I/O) | `api/src/services/launch-report-loader.ts` | separação I/O × cálculo; leitura DB-first |
| Engine puro | `api/src/services/launch-report-engine.ts` | função pura testável sem banco |
| Guardas | `api/src/services/launch-report-guards.ts` (`validateLaunchReport` :181, `assertLaunchReport` :219) | invariante bloqueia com 422; alerta vira banner |
| Narrativa | `api/src/services/launch-report-narrative.ts` (`escaparHtml` :185, `escaparJson` :190, formatadores pt-BR :28–:96) | nenhum número/adjetivo literal no template |
| Render | `api/src/services/launch-report-render.ts` | HTML autocontido gerado no servidor |
| Gate de escopo | `api/src/services/launch-report-config.ts:85` (`COMBINACAO_NAO_VALIDADA`) | combinação não validada → 422 |
| Botão | `web/components/funnels/launch-report-button.tsx` | estado bloqueado antes do clique, erro de invariante na tela, passos durante a geração |

⚠️ **O engine do Resumão não é reaproveitado como fonte de CTR/CPC** — ver "link_click, não cliques totais" abaixo.

### Contrato da skill → fonte real no Loyola (caminhos relativos a `packages/`)

| Fase da skill | Situação | Fonte real |
|---|---|---|
| 3 — mídia por etapa | EXISTE | campanhas vinculadas `funnel_stages.campaigns` (`api/src/db/schema.ts:892`); rota stage daily `api/src/routes/public-meta.ts:592` (filtra por campaignIds `:609-633`); `deriveMetrics` `:128-173` (linkClicks, ctrLink, cpcLink, cpm); campanhas diárias `/stages/:s/campaigns/daily` `public-meta.ts:731`; `link_click` somado em `api/src/utils/meta-insight-agg.ts:67`; imposto aplicado no accumulate `:61` |
| 3 — CTR/CPC | EXISTE | `shared/src/clique-no-link.ts` (`ctrDeLink`, `cpcDeLink`, `somarLinkClicks`) — definição única do produto, sem fallback |
| 4 — ingresso × bump | EXISTE | tipos `ingresso\|principal\|order_bump\|combo\|upsell` (`api/src/utils/produto.ts:15`); `tiposQueAncoram` (`api/src/utils/order-bump.ts:102`); config `stage_sales_spreadsheets.order_bump_products` / `product_types` (`schema.ts:1034,1050`); `resumirOrderBump` (`api/src/routes/stage-sales-data.ts:1155`); dedup txId+produto em `api/src/services/sales-daily-sync.ts:235-283` (o sync **não** aplica `productTypes`) |
| 2/4/7 — principal, bruto, TMB | PARCIAL | bruto/líquido `sales-daily-sync.ts:66-68`; subtypes `main_product\|sales\|tmb\|event_sales` (`:118`; `routes/stage-sales-data.ts:71`); exclusão de TMB é responsabilidade do consumidor (`routes/public-sales-rows.ts:1-8`); coluna de preço "Preço" (`services/launch-report-sales-value.ts:30-33`) |
| 2 — parser numérico | EXISTE (fora dos sync) | `shared/src/numero-ptbr.ts` (`parseNumeroPtBr` :56, `parseValorPlanilha` :94) cobre `1.234,56`, `29.9` e `4.000` |
| 5 — origem/canal | PARCIAL | `classifyOrigem` / `classifyCanal` / `classifyTemperatura` (`api/src/utils/lead-origin.ts:27,51,72`); origem do comprador (Story 18.77) `routes/stage-sales-journey.ts:516,687-760` (origem = do LEAD; sem lead → `semOrigem` `:781`); UTM da venda em `sales-daily-sync.ts` e `public-sales-rows.ts:211-213`; closers `stage_event_closers` (`schema.ts:2014`), `seller_aliases` (`schema.ts:3100`). **Não existe** a regra única lead → fallback venda |
| 6 — coorte | PARCIAL | `sales-rows` traz `leadMatch` e `leadCreatedAt` (match só por e-mail sha256) — `public-sales-rows.ts:111-156,216-219`; telefone `phoneTail` / `dedupKeys` (`lead-origin.ts:100,116`), usado em `stage-sales-journey.ts:1158,1250`, **não** no sales-rows. **D+x não é calculado no servidor** |
| 8/9 — pesquisa, faixa | EXISTE | `computeSurveyForStage` (`services/survey-aggregation.ts:214`) → byQuestion, byQuestionByOrigin, byQuestionByTerm, byAdId (`:169-181`); faixa via `mapping.faixa` (`:131-149`); faixa por campanha/conjunto/anúncio `routes/lead-scoring.ts:1814,1921,2025` |
| 10 — cross-launch | EXISTE | `computeCrossLaunchForProject` (`services/cross-launch-sync.ts:68`; sha256 de e-mail; overlaps aThenB/bThenA) |
| 10 — listas Front/Comunidade | NÃO EXISTE | lacuna declarada |
| 0 — datas-chave | PARCIAL | `launch_report_configs.data_inicio/data_fim` (`schema.ts:3513`); `funnel_stages.projection_end_date` (`schema.ts:923`); fase por prefixo de campanha (`services/launch-report-normalize.ts:60`, `services/stage-phase.ts:22-42`). **Não existem** abertura/fim de carrinho, reabertura, downsell |
| 0 — config por expert | EXISTE espalhado | imposto (acima); bump por etapa/funil (não por keyword); closers; nomenclatura `naming_*` (`schema.ts:4852+`); `expert_report_configs.campos_pesquisa` |
| "Debriefing diário" (# Leads oficial da skill) | NÃO EXISTE | a fonte oficial no Loyola é a planilha de vendas deduplicada — diferença de fonte declarada no relatório |
| 11 — destino do HTML | EXISTE | módulo Debriefing (Epic 37): tabela `debriefings` (`schema.ts:3158`; `html` text, `stage_id` → etapa do tipo debriefing); rotas `api/src/routes/debriefings.ts` (teto 5 MB, `:17`); viewer `web/app/(app)/debriefings/[id]/page.tsx` (`sandbox="allow-scripts"` `:354`; `MIN_FRAME_HEIGHT` 400 / `MAX_FRAME_HEIGHT` 20000 em `:61-62`); script-agente de altura `web/lib/debriefing-frame.ts`; lista da etapa `web/components/funnels/debriefing-stage-view.tsx` |

### O que NÃO existe e é o trabalho real

- Config do debriefing: datas-chave de carrinho/reabertura/downsell, lançamento de comparação, confirmação das perguntas da pesquisa, e o gate de combinação não validada.
- **Classificador único** de origem/canal com fallback para a UTM da venda, Closer e Sem-track real (armadilhas #5 e #9).
- Coorte D+x no servidor, com recuperação da data do lead por e-mail → telefone (últimos 8 dígitos), MAXD 45 e marcação de pico-artefato (armadilhas #4, #7, #10).
- ROAS em 3 níveis + tese do order bump + ROAS diário (Fase 7).
- As verificações da Fase 12 como código (invariantes bloqueantes + alertas) e as fixtures de regressão.
- O render no padrão visual da skill, a persistência **do payload** junto ao HTML e o botão.
- Os blocos de texto da IA restritos ao payload.
- A abertura de links do Ads Manager no viewer.
- A mente "Debriefing" (fase 2).

⚠️ **A tabela `debriefings` hoje só guarda `html`** (`schema.ts:3158-3187`: sem coluna de métricas/payload, ao contrário de `launch_reports.metricas`, `schema.ts:3742`). Persistir o payload é pré-requisito da decisão ✅1 (a mente lê o payload). A forma (coluna nova vs. tabela irmã) é decisão de @architect/@data-engineer dentro da story de persistência.

## Regra: link_click, não cliques totais

A skill exige `link_click` em toda métrica de clique (`data/parametros-constantes.md`: "Cliques: link_click, nunca cliques totais"), e o produto adotou a mesma regra como definição única em 2026-09-03 (`shared/src/clique-no-link.ts`).

**O loader do Resumão soma cliques totais** — `launch-report-loader.ts:567` e `:642` leem `l.clicks`. Por isso o CTR do PG02 no Epic 41 é 1,84% sobre 43.932 cliques (`docs/specs/epic-41-valores-conferencia.md:23-24`), enquanto a fixture da skill para o mesmo lançamento é 35.882 link clicks (`danilo-gato.md` §8). **O Epic 49 não herda esse cálculo.** CTR, CPC e "% Compradores/Cliques" saem de `link_click`; quando a Meta não devolver `link_click`, o valor é "não medido" (`null` → `—`), nunca `0` e nunca fallback para cliques totais.

## Imposto do Loyola (nunca ×1,13) e o efeito nas fixtures

- **Regra:** o spend que chega das fontes do Loyola já tem o gross-up aplicado (`meta-insight-agg.ts:61` chama `applyMetaTax`). O motor **não** aplica imposto de novo; a alíquota vem de `resolveImpostoPct` (override da etapa → do projeto → 12,15%), e a **procedência** (`stage` / `project` / `default`) aparece no relatório.
- **Efeito:** `1 / (1 − 0,1215) = 1,138304`, contra 1,13 da skill. Todo custo do Loyola fica **≈0,73% acima** do da skill (1,138304 ÷ 1,13 = 1,007349) e todo ROAS/CPL/CPM derivado de custo fica ≈0,73% diferente na direção correspondente. Conferido no PG02: bruto R$ 111.188,35 × 1,138304 = R$ 126.566,14, exatamente o "investimento c/ imposto" da conferência do Epic 41.
- **Consequência para as fixtures:** métricas de **volume** (ingressos, vendas, link clicks, impressões, faixa, Closer, Sem-track) devem bater com a skill; métricas de **custo e ROAS** não batem ao centavo com as fixtures do DG, FZ ou Netão (todas calculadas com ×1,13 — `danilo-gato.md:37`, `fernanda-zapparolli.md:26`, `netao.md:42`). A diferença do imposto é **legítima e registrada**, não bug. A story de guardas precisa separar a divergência explicada pelo fator 1,007349 de qualquer outra.

## Stories

| Story | Título | Depende de | Estimativa |
|-------|--------|-----------|-----------|
| **49.1** | Config do debriefing + gates: datas-chave obrigatórias (início da captação, abertura/fim do carrinho, reabertura, abertura/fim do downsell), lançamento de comparação opcional, confirmação das perguntas da pesquisa, etapas do funil que compõem o lançamento, gate `COMBINACAO_NAO_VALIDADA` (padrão 41.1) | — | M |
| **49.2** | Classificador único de origem/canal em `shared` (função pura), em **dois eixos que nunca se somam** (decisão 3): aquisição (UTM do lead → fallback UTM da venda) e fechamento (Closer via `seller_aliases`/`stage_event_closers`); Sem-track real; Quente/Frio por `utm_term` com fallback no `campaign_name` (decisão 4); Tabela 1 mutuamente exclusiva dentro do eixo | — | M |
| **49.3** | Motor I — dinheiro e tempo (puro): higiene (dedup, parser `numero-ptbr`, TMB conta venda/exclui valor/sinaliza), mídia por etapa (link_click, imposto do Loyola, Quente×Frio), captação ingresso×bump por `product_types`, Tabela 1 de canais, coorte D+x (e-mail → telefone, MAXD 45, pico-artefato), ROAS 3 níveis + tese do bump + diário | 49.1, 49.2 | L |
| **49.4** | Motor II — público (puro): qualificação por origem (só perguntas confirmadas no gate), faixa A→D × criativo (%A+B / %C+D, link do Ads Manager), tipo de criativo pela nomenclatura do expert, cross-launch | 49.1, 49.2, **49.3** (helpers puros de higiene, `aplicarImposto`, `montarConfigClassificador`) | M |
| **49.5** | Guardas = checks da Fase 12 da skill (invariantes bloqueantes + alertas) sobre o **número do Loyola** (decisão 1); números da skill só como comparação, com a separação do fator de imposto; casos DG/FZ, mais Netão por estar liberado no dia 1 (decisão 2; fixture em `netao.md` §8) | 49.3, 49.4 | M |
| **49.6** | Render HTML no padrão visual da skill + narrativa sem literal + persistência em `debriefings` (HTML **e** payload, por `stageId`) + botão "Gerar debriefing" na `debriefing-stage-view` com o formulário dos gates | 49.5 | L |
| **49.7** | Blocos de texto escritos pela IA (insights, recomendações, anotações, lacunas) restritos ao payload, com verificação de que o texto não traz número ausente do payload | 49.6 | M |
| **49.8** | Viewer do Debriefing: `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"` para os links do Ads Manager + teste de salvar após edição inline com Chart.js desenhado + teto de 20.000 px | — | S |
| **49.9** | *(fase 2)* Mente "Debriefing" no Minds: squad/agent com os princípios da skill + tool read-only que lê o payload persistido de um debriefing gerado, **sem dado pessoal** (decisão 11); nunca recalcula | 49.6 | M |
| **49.10** | Debriefing de **funil perpétuo** (decisão 2, **R2-3 opção A**). Os números vêm do motor do botão 3 (41.8), renderizados no padrão visual da skill, com os textos da IA (49.7), e são salvos em `debriefings`. O que o 41.8 não calcula vira lacuna declarada. A janela início/fim substitui as datas-chave. O gate é o da 49.1 + `perpetual_report_configs.validado` (41.7). CTR/CPC por `link_click`, com `entrega` montada na composição da 49.10. Definição completa na seção "Perpétuo" | 49.1, 49.6, **49.7**; Epic 41: **41.7–41.9** (Done) e **41.11** (R3-1) | M |
| *41.10 (Epic 41)* | *Dependência externa:* correção do Resumão com dedup por ID de transação e regra de comprador Imersão OU Combo (R2-1, R2-2), com a troca do Combo em todos os lançamentos onde ele é bump (R3-5) e os relatórios do PG02 gerados de novo (R3-3). Ver `epic-41-resumao-comparativo-generator.md` | — | M |
| *41.11 (Epic 41)* | *Dependência externa (R3-1):* dedup por `(ID da venda, produto)` no loader do relatório de Perpétuo (botão 3), com a função da 41.10. Ver `epic-41-resumao-comparativo-generator.md` | 41.10 | S–M |

**Ordem de merge (final, depois da rodada 3):** 49.8 (independente, pode ir primeiro) · (**41.10** ‖ 49.1 ‖ 49.2) → [ **41.11** ‖ (49.3 → 49.4 → 49.5 → 49.6 → 49.7) ] → **49.10** → 49.9.
- ***41.10 → 41.11:*** a 41.11 chama a função `deduplicarPorIdDaVenda` que a 41.10 extrai.
- ***41.11 antes da 49.10:*** R3-1. A 49.10 consome o loader do botão 3 já deduplicado, e as fixtures de perpétuo dela usam a §C.10 conferida pela 41.11. A 41.11 corre em paralelo com a trilha 49.3–49.7, porque nenhuma delas toca o loader do perpétuo.
- *49.3 antes da 49.4:* alterado pelo @po em 2026-09-30, pela resolução 9 do @sm. A 49.4 importa helpers da 49.3 (ver Change Log).
- ***41.10 antes da 49.3:*** rodada 2. A 49.3 consome a função de dedup que a 41.10 extrai, e a fixture governante da 49.5 usa os números que a 41.10 corrige. A correção do dado do PG02 também precisa estar em produção (seção "Por que a 41.10 mergeia antes da 49.3").
- ***49.10 depois da 49.7 e antes da 49.9:*** a 49.10 usa os textos da IA, e a mente lê também o payload do perpétuo.

### Notas por story (o que o @sm precisa carregar para o draft)

- **49.1** — A skill trata datas-chave como gate (`workflows/debriefing-pipeline.yaml`, gate `datas-chave`) e o padrão visual as exige no topo (`data/padrao-visual-entregaveis.md` §4.1). O padrão §4b.4 exige saber a reabertura: "as taxas headline do lançamento NÃO incluem" etapas extraordinárias. As datas de carrinho/reabertura/downsell **não existem** no banco — viram input obrigatório. Onde persistir (estender `launch_report_configs` ou tabela própria) é decisão de @architect/@data-engineer; o critério é não alterar o comportamento do gate do Resumão. O gate `perguntas-da-pesquisa` (Fase 8) também mora aqui: dimensão não confirmada não entra (ex.: "Religião" no DG — `checklists/verificacao-pre-entrega.md`).
- **49.2** — Tabela de regras e ordem de avaliação em `data/classificador-unico.md`. Os **valores** de Closer são por expert (a skill diz: não reaproveitar os do DG); no Loyola eles vêm de `seller_aliases` / `stage_event_closers`, não de lista fixa no código. Precisa conviver com `classifyOrigem`/`classifyCanal` sem mudar as telas que já os usam — a função nova é consumida pelo debriefing; migrar as telas existentes é fora do escopo. **Decisão 3:** uma venda tem um valor de aquisição (Pago/… pela UTM do lead, fallback venda) **e** um de fechamento (Closer); a Tabela 1 nunca soma os dois eixos. **Decisão 4:** Quente/Frio por `utm_term`; quando o term não decide, `campaign_name` da Meta, lido do banco (sem chamada nova à API, regra de rate limit). **R2-5:** comprador cuja única UTM é de closer → balde próprio no eixo de aquisição, **"Aquisição não rastreada (só closer)"**; `Sem track real` = sem UTM no lead **e** na venda; no eixo de fechamento ele é Closer (substitui o provisório "conta como Sem track real").
- **49.3** — Fórmulas: `tasks/02, 03, 04, 05, 06, 07` e `Treinamento Inácio/04-metricas-e-fontes/Memorial_de_Calculo.md`. ROAS: (a) só ingresso ÷ investimento de captação; (b) captação (ingresso + bump) ÷ investimento de captação; (c) total s/ TMB ÷ investimento total de mídia (`tasks/07-conversao-e-roas.md`), **com o downsell no numerador** (decisão 5). "Única conversão válida = Ingresso → Principal". Leitura DB-first: nenhuma chamada nova à Meta por criativo (regra de rate limit do projeto). **Decisão 1:** o número que alimenta as guardas é o do Loyola (planilhas do app, comprador único por e-mail). **Decisão 6:** pico-artefato do ROAS diário = dia com gasto < 10% do investimento médio diário da captação. **Decisão 7 + R2-4:** só a venda do principal **anterior à abertura do carrinho** é excluída automaticamente e listada na auditoria/lacunas; **venda-teste não é excluída** (o motivo reservado `VENDA_TESTE` não é usado). **R2-1:** comprador de captação = linha com tipo âncora (`ingresso` OU `combo`, `tiposQueAncoram`, `order-bump.ts:102-107`) — no PG02, Imersão = `ingresso`, Combo = `combo`, Gravação e GPT = `order_bump` no `product_types` (dado de produção, ver "A regra do comprador é configuração ou código?"); dedup por ID de transação obrigatório — a camada 1 **consome a função pura extraída pela 41.10** (não cria outra) e depende de `column_mapping.transactionId` apontar para a coluna que de fato repete nas duplicatas (`ID` no snapshot do PG02, não `Transaction`). **Depende da 41.10** (ordem de merge).
- **49.4** — `tasks/08, 09, 10`. A dimensão de criativo é do expert: IA×Humano no DG (`-ia-` / `-h-`, `parametros-constantes.md`), Vídeo×Estático no FZ (`padrao-visual-entregaveis.md` §4.17). Criativo × Faixa em proporção (%A+B / %C+D), não em contribuição absoluta (`tasks/09-faixa-e-criativo.md:35-36`). Tabela 2 (listas Front/Comunidade) **não** é construída: vira lacuna declarada no relatório. **Decisão 8:** pesquisa respondida 2× → vale a resposta mais recente. **Decisão 9:** o % por dimensão usa como denominador o segmento inteiro (como o Resumão).
- **49.5** — Os 13 checks + a verificação multi-expert + as fixtures de `checklists/verificacao-pre-entrega.md`. Fonte das fixtures: `data/expert-profiles/*.md` §8. **[AUTO-DECISÃO]** onde o checklist e o perfil divergem (o checklist cita "ROAS captação 0,74→1,75 / 0,46→1,82"; o §8 do DG, reconferido em 28/08/2026, traz "ROAS só ingresso base 0,68 / 0,56" e "captação (a) 1,74 / 1,81"), vale o **perfil**, por ser a fonte reconferida mais recente. Fixtures de custo/ROAS comparadas com o fator 1,007349 descontado. **Decisão 1 (muda o papel das fixtures da skill):** as guardas bloqueiam sobre o número do Loyola; o número da skill (§8 dos perfis) vira coluna de **comparação** classificada (imposto / fonte-janela / não explicada) e **nunca bloqueia**. A AUTO-DECISÃO acima passa a decidir só qual número da skill aparece na comparação. **Decisão 2:** Netão entra no dia 1, então a 49.5 precisa de um caso Netão (`netao.md` §8: funil LEAD → INGRESSO → Margem 3x, sem bump, sem downsell, closers). **R2-1/R2-2:** a fixture `governante` do PG02 usa os valores **corrigidos pela 41.10** em `epic-41-valores-conferencia.md` — não 1.410 / R$ 233.572,94; a comparação com a skill classifica as divergências restantes pelos degraus da ponte refeita pela 41.10 sobre o número corrigido (janela, n8n sem 5 vendas, 7 estornos posteriores, Gravação de não-comprador, chave e-mail × telefone); o que não couber num degrau sai "não explicada". **R3-4:** os dois degraus do n8n são diferença de fonte, só declarada.
- **49.6** — Padrão visual **integral** de `data/padrao-visual-entregaveis.md` (paleta #121212 / #fdcf2b / creme, `sec-head`/`sec-num`, KPI gêmeo com Δ, blocos insight/rec/warn, ordem canônica das 19 seções §4 e padrões §4b, abas, Chart.js **4.4.1** + datalabels **2.2.0** por CDN, `const D`, rótulos em todos os pontos, "Ingressos", Δ%/Δpp, "s/ TMB", auditoria de vendas com UTMs, 00 Definições no topo, Base de Conhecimento no fim), referência-mestre `templates/referencia-relatorio-dg.html`. Proibido: `localStorage`, cookies, `window.open`. O render do Resumão carrega `chart.js@4` sem versão fixa (`launch-report-render.ts:419`) — o debriefing fixa as versões da skill. O botão mora em `web/components/funnels/` (mesmo diretório do `launch-report-button.tsx`). **[AUTO-DECISÃO]** cada geração cria um documento novo na etapa (mesmo padrão de insert do `launch_reports`), preservando o histórico; não sobrescreve.
- **49.7** — Decisão ✅4. Reusa o cliente de `api/src/services/claude.ts`. O LLM recebe o payload e devolve texto; o texto é escapado (`escaparHtml`) e nunca injeta HTML ou links. Separada da 49.6 para que o relatório determinístico possa ir ao ar e ser conferido contra as fixtures sem depender do LLM. **Decisão 10:** depois que a 49.7 entra, falha do LLM **bloqueia** a geração. O botão mostra código, motivo e ação, no padrão do botão do Resumão, e não sai relatório sem texto. **Decisão 11:** o LLM recebe só identificador anônimo do comprador; nome, e-mail e telefone não saem do servidor. UTMs, produto e valores podem ir.
- **49.8** — Testado em Chrome headless em 2026-09-30 com o mesmo sandbox e o mesmo agente de altura: referência DG 17/17 gráficos, 0 erros, 7.509 px; FZ L1×M1×L2 37/37, 0 erros, 12.423 px; Netão 22/22, 0 erros, 16.957 px. Chart.js 4.4.1 + datalabels 2.2.0 carregam; `localStorage` lança SecurityError (a referência não usa). O link do Ads Manager (`target="_blank"`, `selected_ad_ids`, exigido pela Fase 9) é **bloqueado** sem `allow-popups`; com `allow-popups allow-popups-to-escape-sandbox` abre, e `localStorage` segue bloqueado (isolamento mantido, `allow-same-origin` continua fora). **Não testado:** salvar após edição inline com gráficos já desenhados (o serializador grava o DOM mutado pelo Chart.js) — é AC da story. A mudança vale para todo documento do viewer, inclusive os HTMLs da skill que já sobem manualmente hoje com os mesmos links.
- **49.9** — Minds = `squads/<squad>/agents/*.md`, arquivo inteiro vira system prompt (`services/prompt-builder.ts`, `services/mind-registry.ts`, `MINDS_BASE_PATH=./squads`). A tool nova entra em `services/chat-tools.ts` e é **read-only** sobre o payload persistido na 49.6. A mente vê o payload, não o HTML: edições inline feitas no viewer não chegam a ela. **Decisão 11:** a tool entrega o payload sem dado pessoal de comprador (só identificador anônimo).
- **49.10** — Definição completa na seção "Perpétuo" → "Story 49.10: definição" (R2-3, opção A). Fonte de números = Loyola via 41.8 (decisão 1); CTR/CPC por `link_click` com `entrega` montada na composição da 49.10; o que o 41.8 não calcula vira lacuna; textos da 49.7; dedup por transação vem do loader do perpétuo corrigido pela **41.11** (R3-1), da qual a 49.10 depende.

### Divergências em relação à proposta do @sm (River) e por quê

| Proposta do @sm | Final | Justificativa |
|---|---|---|
| 49.3 — motor único das fases 2–10 | **49.3** (fases 2, 3, 4, 5-Tabela 1, 6, 7) + **49.4** (fases 8, 9, 10) | 49.3 original somava 9 blocos de cálculo — maior que qualquer story do Epic 41, que já separou o motor (41.2) dos destaques por anúncio (41.4). O corte segue o `depends_on` da skill: fases 8/9/10 dependem só de higiene e origem (fase 5), não do ROAS; as duas metades correm em paralelo depois de 49.1 + 49.2 |
| 49.5 — render + narrativa + LLM + persistência + botão | **49.6** (render + persistência + botão) + **49.7** (blocos da IA) | O texto de LLM é o risco oposto ao do render: o render proíbe literal, o LLM pode inventar número. Precisa de verificação própria. Separar deixa o relatório determinístico conferível contra as fixtures antes do LLM entrar |
| 49.6 — iframe | **49.8**, sem dependência, pode mergear primeiro | Não depende de nada do epic e já desbloqueia os HTMLs da skill que sobem manualmente hoje |
| 49.4 guardas / 49.7 mente | renumeradas para **49.5** / **49.9** | consequência dos dois cortes acima; nenhum arquivo de story existia, então renumerar não tem custo |
| Persistência em `debriefings` | explicitada: **HTML + payload** | a tabela hoje só tem `html`; sem payload persistido a 49.9 não tem o que ler |

## Requisitos transversais (valem para toda story com rota nova)

- **Contrato de API:** rota ou campo novo na API ⇒ bump de `API_CONTRACT_VERSION` em `packages/shared/src/contract.ts` (hoje 29, `:268`) com linha de histórico — check 8 do QA gate. Web (Vercel) e API (Railway) sobem em ciclos diferentes; o botão precisa de fallback enquanto a API estiver atrás.
- **Migrations:** as da 49.1 e da 49.6 precisam ser provadas em produção via `information_schema` depois do deploy — o `drizzle-kit push` do boot já deixou de aplicar tabelas novas em setembro/2026.
- **Rate limit da Meta:** o gerador lê do banco; não abre caminho novo de fan-out por criativo.

## Fora do escopo

- A planilha `.xlsx` e o PDF da skill (decisão ✅3). A apresentação já foi descontinuada pela própria skill (`padrao-visual-entregaveis.md` §6).
- Tabela 2 — listas Front/Comunidade: não há fonte no Loyola.
- Custos fora da mídia que algum expert tenha (ex.: custo de produção do evento presencial do Netão, `netao.md:51`): não há fonte no Loyola.
- Migrar as telas que já usam `classifyOrigem`/`classifyCanal` para o classificador único.
- Recalcular qualquer coisa a partir do chat (decisão ✅1/✅4).
- Substituir o upload manual de HTML do módulo Debriefing — continua existindo.
- Aplicar ao perpétuo a metodologia de lançamento (carrinho, coorte D+x, ROAS em 3 níveis): não se aplica. A forma do perpétuo é a da **R2-3 (opção A)**, story 49.10.
- Substituir ou alterar o relatório perpétuo do botão 3 (Epic 41, 41.7–41.9) e o `perpetual-dashboard`: continuam como estão. A 49.10 **consome** o motor 41.8 e monta a `entrega` na própria composição. Mudar número do botão 3 só acontece por story do Epic 41: a dedup é a **41.11** (R3-1).
- A correção do Resumão (dedup por transação + regra de comprador) **não é deste epic**: é a 41.10, no Epic 41 (R2-2). A dedup do relatório de Perpétuo também não: é a 41.11, no Epic 41 (R3-1).

## Lacunas declaradas (o relatório diz, não inventa)

- **Front/Comunidade:** sem fonte → a seção 13 mostra só o cross-launch e declara a lacuna das listas.
- **# Leads do "Debriefing diário":** não existe no Loyola; a contagem oficial é a planilha de vendas deduplicada. O check "número do resumo = # Leads do Debriefing" vira "número do resumo = ingressos deduplicados da planilha", com a diferença de fonte declarada.
- **Datas-chave de carrinho/reabertura/downsell:** não existem no banco → input obrigatório do botão (49.1).
- **Fallback UTM da venda numa regra única:** não existe → 49.2.
- **Telefone no cruzamento venda × lead:** existe no journey, não no sales-rows → 49.3.
- **Coorte D+x no servidor:** não existe → 49.3.
- **IA×Humano:** depende da nomenclatura do expert; expert sem convenção → dimensão não é exibida.
- **Mídia por criativo do DG-PG02:** `meta_ad_insights_daily` do DG começa em 2026-05-20 (change log do Epic 41, 2026-07-31) — o PG02 não tem ad-level, então o split de investimento por tipo de criativo fica indisponível para ele.

## Riscos de epic

- **R-49-1 (baixo; era médio após a decisão 1 e alto antes dela). Número do Loyola × fixtures da skill: divergência explicada.**
  - **Antes:** para o DG-PG02, o Loyola (Resumão) dava 1.410 ingressos únicos e R$ 233.572,94 (`epic-41-valores-conferencia.md:13-28`). A skill dava 1.845 compradores e R$ 227.491,74 (`danilo-gato.md` §8).
  - **Agora:** a investigação do dono fechou a **ponte com resíduo zero** (seção "A ponte do PG02"). O maior degrau é a **regra de produto** (−384). Os outros são a janela, o n8n incompleto e a Gravação vendida a quem não é comprador. Um degrau é **defeito do Loyola**: 25 vendas duplicadas por ID de transação (+R$ 2.475,00), que o Resumão não deduplica.
  - **Decisões:** pela R2-1, o Loyola adota a regra da skill (Imersão OU Combo) e o dedup por transação, e o número **corrigido** governa (decisão 1). A correção é a 41.10, com story própria e sem ajuste silencioso na guarda, como este risco já previa.
  - **Risco que sobra:** a 49.3 ou a 49.5 entrarem antes da 41.10 e herdarem o oráculo antigo (1.410 / R$ 233.572,94) como governante. Também a ponte não ser versionada, porque os scripts estão no scratchpad da sessão.
  - **Mitigação:** a ordem de merge põe a **41.10 antes da 49.3**. A 41.10 versiona a ponte em `epic-41-valores-conferencia.md`. A 49.5 classifica as divergências que sobrarem pelos degraus da ponte (imposto 1,007349 / fonte-janela / definição / não explicada).
- **R-49-2 (alto) — Classificador duplicado.** Criar uma quarta regra de origem que diverge de `lead-origin.ts` e do journey reproduz a armadilha #9 dentro do produto. Mitigação: 49.2 em `shared`, com teste diferencial contra `classifyOrigem`/`classifyCanal` nos casos onde as regras coincidem. Com a decisão 3 (dois eixos), entra um teste a mais: nenhuma venda conta em dois baldes do mesmo eixo, e a soma da Tabela 1 nunca mistura aquisição com fechamento.
- **R-49-3 (alto) — IA inventando número.** O ✅4 proíbe; a 49.7 verifica. Sem essa verificação, o relatório volta ao problema original do Epic 41 (texto que mente).
- **R-49-4 (médio) — Parser numérico local.** `sales-daily-sync.ts:19` e `routes/stage-sales-data.ts:105` têm `parseNumber` próprio que lê `4.000` como 4 (conferido executando a mesma lógica); a regra 8 da skill exige milhar. O motor usa `shared/src/numero-ptbr.ts`; se consumir valores já parseados por esses syncs, herda o defeito para valores sem vírgula decimal. A 49.3 precisa declarar de onde vem cada valor monetário.
- **R-49-5 (médio) — Escopo vaza.** "É parecido com o DG, habilita" — o gate da 49.1 é código, não convenção (mesma lição do R-E3 do Epic 41).
  - **Decisão 2:** o dia 1 tem 3 experts × 2 tipos de funil.
  - **Vazamento específico:** o botão numa etapa Debriefing de funil perpétuo rodar o motor de **lançamento** antes de a 49.10 existir.
  - **Mitigação:** o gate olha `funnels.type` e o perpétuo responde com erro explícito até a 49.10 mergear.
  - **Caso do Netão:** não tem downsell (`netao.md` §8); a 49.1 já exige resposta explícita `houve: false`.
- **R-49-6 (médio) — HTML grande.** Teto de 5 MB no upload (`debriefings.ts:17`) e 20.000 px no viewer; o maior teste (Netão) deu 16.957 px — folga de ~15%. Comparativo com mais lançamentos ou mais criativos pode estourar a altura; a 49.8 fixa o comportamento acima do teto.
- **R-49-7 (médio) — Edição inline × gráficos.** O salvar da edição inline nunca foi testado com Chart.js desenhado; pode gravar canvas/DOM mutado e quebrar o documento ao reabrir. AC da 49.8.
- **R-49-8 (baixo) — Popups no viewer.** `allow-popups-to-escape-sandbox` vale também para HTML enviado manualmente. O isolamento de storage/cookies foi mantido no teste; o upload é restrito ao time (guests bloqueados no guest-guard, `schema.ts:3152-3156`).
- **R-49-9 (médio) — O LLM vira dependência dura da geração.**
  - **Decisão 10:** falha do LLM bloqueia o relatório. Indisponibilidade ou erro do cliente de `api/src/services/claude.ts` passa a significar "sem debriefing".
  - **Mitigação:** erro com código, motivo e ação na tela, no padrão do Resumão. A 49.6 vai ao ar e é conferida contra as fixtures **antes** da 49.7, de modo que o determinístico nunca fica refém do texto.
- **R-49-10 (alto) — Perpétuo: duplicar o botão 3 ou inventar metodologia.**
  - A skill não tem metodologia de perpétuo, e o Loyola já tem um gerador perpétuo conferido (41.7–41.9).
  - Um motor novo de perpétuo dentro do Epic 49 repete o R-E5 do Epic 41.
  - **P-1 respondida (R2-3, opção A):** a 49.10 reusa o 41.8. O que ele não calcula vira lacuna, nunca cálculo novo.
  - **Risco que sobra:** a 49.10 "consertar" o botão 3 por dentro. O caso concreto é preencher `entrega` no loader compartilhado, o que mudaria o relatório do botão 3 sem story.
  - **Mitigação:** `entrega` com `link_click` montada na composição da 49.10 (AUTO-DECISION na definição da story). Mudança no botão 3 só por story do Epic 41: a dedup é a 41.11 (R3-1), que mergeia antes da 49.10.
- **R-49-11 (médio) — Dado pessoal no payload.**
  - **Decisão 11:** LLM e mente só veem identificador anônimo.
  - O payload persistido (49.6) é o que a 49.9 lê. Se ele guardar e-mail/nome/telefone para a auditoria de vendas do HTML, a tool da mente precisa filtrar antes de entregar.
  - **Mitigação:** a 49.7 e a 49.9 testam que nenhum campo pessoal sai do servidor.
- **R-49-12 (alto). A correção 41.10 muda números do Resumão em produção.**
  - Pela R2-1/R2-2, o Resumão do PG02 muda de patamar. Estimativa sobre o snapshot n8n, janela 17/04–11/05, script `estimativa_41_10.py` no scratchpad. **Não é medição de produção:**
    - ingressos únicos 1.410 → **~1.807**;
    - vendas 2.222 → **~2.197**;
    - faturamento R$ 233.572,94 → **~R$ 231.097,94** (−R$ 2.475,00 de duplicatas);
    - captação/order bump R$ 90.388,74 / R$ 143.184,20 → **~R$ 198.736,40 / R$ 32.361,54**.
  - Mudam também, porque dependem do comprador e da atribuição: pago/orgânico, CPV, ticket, conversão clique→venda, ROAS pago e a decomposição PG02→PG04 do Comparativo (41.6).
  - Como a lista `order_bump_products` é a mesma, os **"Ingressos únicos" do painel Captação Paga do PG02** mudam junto (`stage-sales-data.ts:440-447,897,946`).
  - Resumões **já persistidos** em `launch_reports` continuam com o número antigo.
  - **Mitigação:** a 41.10 mede antes e depois **em produção**, nos períodos 11/05 (§10) e 09/05 (config vigente). Também versiona a ponte e os números corrigidos na conferência e comunica a mudança ao usuário **antes do merge**, com a ponte como explicação. **R3-3:** os Resumões do PG02 e o Comparativo PG02×PG04 já gerados são gerados de novo depois da correção.
  - **Ampliado pela R3-5:** a troca do Combo vale para **todos** os lançamentos em que ele é order bump. Os "Ingressos únicos" do painel Captação Paga e o Resumão dessas etapas também mudam, com antes → depois registrado por etapa. Os relatórios já gerados dessas etapas não estão cobertos pela R3-3 (**P-8**).
  - **Mesmo efeito no perpétuo:** a 41.11 muda números do botão 3 nos funis com duplicata (R-E8 do Epic 41). Os relatórios de perpétuo já gerados são a **P-7**.
- **R-49-13 (médio). Duas configurações respondem "quem é comprador de captação".**
  - O Resumão (e o painel Captação Paga) lê a lista `order_bump_products`. O debriefing (49.3), o checkout/order bump (18.68–18.70) e o perpétuo leem o mapa `product_types`.
  - Se as duas divergirem num lançamento, o debriefing e o Resumão do mesmo lançamento mostram compradores diferentes, a armadilha #9 entre telas.
  - **Mitigação:** a 41.10 confere que lista e mapa concordam nas etapas com config de Resumão e em toda etapa corrigida pela R3-5, e registra o resultado. **[AUTO-DECISION]** Em cada etapa corrigida pela R3-5, o mapa fica coerente com a lista, como no PG02. A unificação numa configuração só fica **fora** da 41.10 e vira insumo para o @architect.

## Perguntas ao dono (depois da rodada 3)

A P-1 foi respondida pela R2-3. A rodada 3 respondeu **P-2 a P-6**:

| Pergunta | Resposta | Efeito |
|---|---|---|
| P-2: dedup no relatório de Perpétuo (botão 3) | **R3-1:** story própria no Epic 41 | **41.11**; a 49.10 depende dela |
| P-3: a autorização do Lucas cobre a 41.10? | **R3-2:** sim, e também a 41.11 | `[scope-override]` nos commits |
| P-4: Resumões/Comparativos já gerados do PG02 | **R3-3:** gerar de novo depois da correção | 41.10, item 9 no Epic 41 |
| P-5: divergências de fonte do n8n | **R3-4:** só declarar como diferença de fonte | ponte da 41.10; degrau da 49.5 |
| P-6: troca do Combo em outros lançamentos | **R3-5:** todos os lançamentos onde o Combo é order bump, pela UI, antes → depois por etapa | 41.10, item 3 no Epic 41 |

Ficam abertas duas perguntas, que nascem das próprias respostas. As duas tratam de relatórios já persistidos fora do que a R3-3 cobriu, e **nenhuma bloqueia o início de story**:

- **P-7: relatórios de perpétuo já gerados** (`perpetual_reports`) cujo número mude com a 41.11. Manter com aviso, gerar de novo ou remover?
  - A R3-3 cobriu só o PG02.
  - A story 41.11 registra a pergunta como bloqueio do **merge** dela (merge = deploy; a comunicação do AC6 cita o destino), não do início nem do Ready.
  - **Condicional:** só existe se o AC3 da 41.11 achar funil cujo número muda **e** que tem relatório em `perpetual_reports` (AC3(d) conta). Sem esse funil, a pergunta perde o objeto.
- **P-8: Resumões e Comparativos já gerados de outros lançamentos**, fora do PG02, cujo número mude pela dedup da 41.10 (que vale para todo Resumão) ou pela troca do Combo da R3-5. Manter com aviso, gerar de novo ou remover?
  - **Condicional:** só existe se o levantamento da 41.10 (AC6(b)) achar etapa afetada fora do PG02 que tenha relatório em `launch_reports` (o AC6(b) conta). Se existir, **bloqueia o merge** da 41.10 (como a P-7 na 41.11), não o início nem o Ready.

## Escopo de autoridade

- **Operações de agente:** criação de stories é do @sm; validação do @po; implementação do @dev; push/PR do @devops. Este doc não cria nem edita story. Os arquivos das stories (49.1–49.10, 41.10, 41.11) são do @sm.
- **Scope do solicitante:** o Danilo (`danilo@bonsaitrafegopago.com.br`) tem scope `restricted` (`docs/team/members.md:33-71`). Criar este epic e as stories em `docs/stories/` está coberto pela nota "criação de story/epic nova relacionada a tráfego: OK". O código fica fora do scope e é coberto pela **autorização do Lucas (decisão 12)**:

| Story | Caminhos principais | Dentro do scope do Danilo? |
|---|---|---|
| 49.1 | `api/src/db/schema.ts` + migration, `api/src/services/`, `api/src/routes/` | **Não**: autorizado (decisão 12), commit com `[scope-override]` |
| 49.2 | `shared/src/` | **Não**: autorizado, `[scope-override]` |
| 49.3, 49.4, 49.5 | `api/src/services/` | **Não**: autorizado, `[scope-override]` |
| 49.6 | `api/src/services/`, `api/src/routes/debriefings.ts`, migration; botão em `web/components/funnels/` | **Misto**: o botão está no scope; o backend é autorizado, `[scope-override]` |
| 49.7 | `api/src/services/` | **Não**: autorizado, `[scope-override]` |
| 49.8 | `web/app/(app)/debriefings/[id]/page.tsx`, `web/lib/debriefing-frame.ts` | **Não**: autorizado, `[scope-override]` |
| 49.9 | `squads/`, `api/src/services/chat-tools.ts` | **Não**: autorizado, `[scope-override]` |
| 49.10 | `api/src/services/` (composição do debriefing perpétuo sobre o 41.8), `api/src/routes/` (geração), `web/components/funnels/` (despacho do botão) | **Misto**: o mesmo critério da 49.6 |
| 41.10 (Epic 41) | `api/src/services/launch-report-loader.ts`, `api/src/utils/`, `__tests__/` | **Não**: autorizado pela **R3-2**, `[scope-override]` |
| 41.11 (Epic 41) | `api/src/services/perpetual-report-loader.ts`, `__tests__/` | **Não**: autorizado pela **R3-2**, `[scope-override]` |

**Autorização registrada (decisão 12):**
- O Lucas autorizou o código fora do scope `restricted`. O Danilo informou em 2026-09-30, e esta é a fonte: o relato do Danilo, sem registro direto do Lucas neste repo.
- Pela `.claude/rules/team-scopes.md` (Edge Cases), **todo commit** que toque caminho fora do scope leva `[scope-override]` na mensagem.
- A autorização cobre o código das stories 49.1–49.10. Ela **não** muda a autoridade de agentes: push e PR continuam exclusivos do @devops.
- **R3-2:** a autorização cobre também a **41.10** e a **41.11** (Epic 41, dependências deste epic). Commits fora do scope levam `[scope-override]`.
- As trocas de configuração da R3-5 (lista e mapa do Combo) são ato humano pela UI e não são código.
- **Decisão 13:** o commit + PR **só de documentação** (este epic + as stories 49.*) está autorizado e é feito pelo @devops.

- **ClickUp:** a list correta é APP - Loyola X `901326639417` (os `curl` da rule apontam para outra list).

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-09-30 | @pm (Morgan) | Epic criado a partir do briefing da sessão Danilo + @sm (2026-09-30), da skill `loyola-debriefing` e do código. 4 decisões ✅ do dono registradas. Quebra final em 9 stories: 49.3 original dividida em motor de dinheiro/tempo (49.3) e de público (49.4); render e texto da IA separados (49.6 / 49.7); iframe (49.8) sem dependência. Referências do briefing corrigidas: `projection_end_date` é `schema.ts:923` (não :922) e `MAX_FRAME_HEIGHT` fica em `web/app/(app)/debriefings/[id]/page.tsx:62` (não em `debriefing-frame.ts`). Achados novos: `debriefings` não tem coluna de payload; o loader do Resumão soma cliques totais (`launch-report-loader.ts:567,642`); o `parseNumber` local dos syncs lê `4.000` como 4. |
| 2026-09-30 | @po (Pax) | **PO validation 2026-09-30** das 9 stories (`*validate-story-draft`). **Ordem de merge alterada:** 49.3 → 49.4 (antes paralelas) e 49.4 passa a depender da 49.3 — a 49.4 reusa `debriefing-hygiene.ts`, `aplicarImposto` e `montarConfigClassificador` da 49.3 (resolução 9 do @sm; evita segunda implementação da higiene e da config do classificador, armadilha #9). Dono do loader: 49.3 e 49.4 cada uma o seu; composição `montarPayloadDebriefing` na 49.5. Contratos entre stories fixados nas próprias stories: `DebriefingConfig` (49.1), `classificarOrigem`/`CLASSIFICADOR_VERSAO`/`SEGMENTO_DE_QUALIFICACAO` (49.2), `DebriefingPayload` com `versao`/`textos?` (49.5); código único `LISTAS_FRONT_COMUNIDADE` para a lacuna das listas. Achado da resolução 11: o Loyola não guarda leads em tabela — guarda referência a planilhas `leads`/pesquisa, lidas ao vivo (registrado na 49.4). Pendências do dono consolidadas: (a) 49.1 — não bloqueia Ready; (b) 49.3/49.5; (c)(d) 49.2; (e)(f) 49.7/49.9; (g)(h) 49.3; novas: (i)(j) 49.4, (k) 49.3. |
| 2026-09-30 | @pm (Morgan) | **Decisões do dono 1–13 incorporadas** (seção "Decisões do dono (2026-09-30)"). As decisões 3–11 estão sendo aplicadas nas stories pelo @sm, em paralelo; este registro toca **só o epic**.<br>**Decisão 2 (perpétuo):** o título e o objetivo passam a cobrir lançamento e perpétuo, e entra a seção "Perpétuo". Achados: (a) a skill não tem metodologia de perpétuo, só a regra de excluir evergreen do lançamento, mais um entregável avulso de 2026-09-20 cujas definições coincidem com o botão 3 do Epic 41; (b) o Loyola já tem gerador perpétuo (41.7–41.9, Done); (c) funil perpétuo pode ter etapa Debriefing desde o Epic 40; (d) o motor do botão 3 devolve `cliques/ctr/cpc` nulos porque o loader não preenche `entrega`.<br>**Decisão de estrutura:** o perpétuo vira a **story nova 49.10**, sem arquivo e bloqueada pela **P-1** (forma do debriefing de perpétuo, opções A/B/C; @pm recomenda A). O equivalente às datas-chave é a janela início/fim + `inicio_trafego`; o gate é o da 49.1 + `perpetual_report_configs.validado`. Os ajustes previstos em 49.1/49.5/49.6/49.9 ficam listados para depois da P-1.<br>**Decisão 1:** R-49-1 rebaixado de alto para médio, com o oráculo = Loyola e a skill só como comparação; a nota da 49.5 foi atualizada e o Netão entra nas fixtures.<br>**Decisão 12:** a seção de autoridade registra a autorização do Lucas e o `[scope-override]`. **Decisão 13:** commit/PR de docs pelo @devops.<br>**Novos riscos:** R-49-9 (LLM como dependência dura), R-49-10 (duplicar o botão 3 ou inventar metodologia de perpétuo) e R-49-11 (dado pessoal no payload). R-49-2 e R-49-5 ampliados (dois eixos; 3 experts × 2 tipos). "Fora do escopo" ganhou 2 itens de perpétuo. |
| 2026-09-30 | @pm (Morgan) | **Rodada 2 do dono (R2-1 a R2-5) incorporada**, depois da investigação do PG02. Este registro toca **só os docs de epic** (49 e 41); as stories são do @sm, em paralelo.<br>**Seção nova** "Decisões do dono, rodada 2": ponte PG02 1.845→1.410 / R$ 227.491,74→R$ 233.572,94 com resíduo zero, reexecutada por este @pm. As decisões 1, 3 e 7 da rodada 1 apontam para R2-1, R2-5 e R2-4; a R2-4 revoga a exclusão automática de venda-teste.<br>**Avaliação no código, configuração ou código:** a regra "Combo conta como comprador" é **configuração por etapa**. O Resumão e o painel Captação Paga leem a lista `order_bump_products` (`launch-report-loader.ts:250-265`, `stage-sales-data.ts:440-447,897,946`); a 49.3 lê o mapa `product_types` (`tiposQueAncoram` = {ingresso, combo}, `order-bump.ts:102-107`). O PG04 já roda com o Combo como captação; corrigir o PG02 é **mudança de dado em produção**. O dedup por transação é **código** no Resumão: o loader só usa o `txId` para reembolso (`:321-347`) e o engine soma toda linha (`launch-report-engine.ts:544-546`).<br>**Achado novo:** no snapshot n8n, as 25 duplicatas repetem `ID` e têm `Transaction` **vazia**. Se o `column_mapping.transactionId` do PG02 apontar para `Transaction`, o dedup não as pega.<br>**P-1 fechada com a opção A (R2-3):** a **49.10** fica definida (título, escopo em 9 itens, fora, dependências 49.1/49.6/49.7 + 41.7–41.9, estimativa M). **[AUTO-DECISION]** `entrega` por `link_click` montada na composição da 49.10, não no loader do botão 3. Achados que ela herda: o loader do perpétuo não deduplica por transação (`perpetual-report-loader.ts:381-410`), `parseNumber` local lê `4.000` como 4 (`:417-425`) e não há conferência do DG perpétuo.<br>**Ordem de merge:** 49.8 · (41.10 ‖ 49.1 ‖ 49.2) → 49.3 → 49.4 → 49.5 → 49.6 → 49.7 → 49.10 → 49.9. **[AUTO-DECISION]** A 41.10 extrai a chave de dedup `(txId, produto)` como função pura e a 49.3 a consome; por isso a 41.10 vem antes da 49.3. A fixture governante da 49.5 passa a usar os valores corrigidos pela 41.10.<br>**Riscos:** R-49-1 rebaixado para baixo (divergência explicada; sobra a ordem de merge e a ponte não versionada); R-49-10 atualizado (P-1 fechada; risco de mexer no botão 3 por dentro). **Novos:** R-49-12 (a 41.10 muda números do Resumão e do painel Captação Paga em produção; estimativa do snapshot de 1.410 → ~1.807 e R$ 233.572,94 → ~R$ 231.097,94) e R-49-13 (duas configurações para "quem é comprador").<br>**Perguntas novas ao dono:** P-2 (dedup no botão 3), P-3 (autorização do Lucas para a 41.10), P-4 (Resumões já gerados), P-5 (fonte n8n). |
| 2026-09-30 | @po (Pax) | **PO re-validation 2026-09-30** de 49.1–49.10 e 41.10, com foco em contrato cruzado depois das rodadas 1 e 2. **Ready:** 49.1–49.9. **Draft:** 49.10 (P-2) e 41.10 (P-3; P-4 bloqueia o merge). **Correções:** (1) **chave da dedup** da 41.10 era só o ID — passou a `(ID, produto)`, a do epic 41 e dos dedups inline; nos snapshots do squad o ID do pedido cobre mais de um produto em 127 pedidos do DG-PG04 e 14 do BBE-A1; no PG02, nenhum (números da 41.10 inalterados); (2) a função compartilhada que o epic manda a 41.10 extrair não existia nas stories — `deduplicarPorIdDaVenda` fixada na 41.10 e consumida pela 49.3 (que ganhou a 41.10 no `Depends On`); sobrevivente = a primeira (a regra "com `Transaction` preenchida" lia coluna não mapeada); (3) a 41.10 não trazia itens do escopo do epic 41 (`product_types` do PG02, PG04 no T0 e na medição, lista × mapa, comunicação antes do merge) — incluídos; (4) a 41.10 dava a autorização do Lucas como concedida — é a P-3; (5) **comprador = ingresso OU combo** aplicado na 49.4 AC7 (dividia por "compraram ingresso"); (6) a fixture governante da 49.5 ainda citava 1.410 / R$ 233.572,94 — agora os valores corrigidos pela 41.10, com mapeamento de vocabulário Resumão → payload; (7) **Netão** entrou nas fixtures da 49.5 (decisão 2); fixtures de perpétuo movidas para a 49.10; (8) `payload.tipo`: a 49.10 dependia de um campo que 49.5/49.6 não criavam — discriminador `"lancamento"` nasce na 49.5, gravado pela 49.6, lido pela 49.7 e pela 49.9 (que passou a depender da 49.10 e lê os dois formatos); (9) `DebriefingConfig` da 49.1 virou união por `tipoDeFunil`; `TIPO_DE_FUNIL_NAO_SUPORTADO` vale também para `mobile`; lista de combinações da decisão 2 = funis `launch`/`perpetual` dos três projetos por id. **Resolução do coordenador aplicada:** comprador sem UTM e só com `sellerName` = `Sem track real` + Closer (49.2–49.5). **Achado novo:** no snapshot do DG-PG01 cada venda aparece 2× (`PURCHASE_APPROVED`/`PURCHASE_COMPLETE`) com `ID` distinto e `Transaction` igual — o oposto do PG02; como a dedup vale para todo Resumão, a 41.10 AC6(b) mede o impacto por etapa antes do merge. **P-6** acrescentada às perguntas. |
| 2026-09-30 | @pm (Morgan) | **Rodada 3 do dono (R3-1 a R3-5) incorporada.** Fecha as perguntas P-2 a P-6. Este registro toca **só os docs de epic** (49 e 41). As stories (41.11 nova; ajustes em 41.10, 49.5 e 49.10) são do @sm, em paralelo.<br>**Seção nova** "Decisões do dono, rodada 3".<br>**R3-1:** a dedup do loader do botão 3 virou a **41.11** no Epic 41, com a função da 41.10, dependendo da 41.10. A **49.10 passa a depender da 41.11** e não deduplica por conta própria. As fixtures de perpétuo dela usam a §C.10 depois da medição da 41.11.<br>**R3-2:** as linhas 41.10 e 41.11 entram no "Escopo de autoridade". **R3-3:** R-49-12 atualizado (relatórios do PG02 gerados de novo). **R3-4:** os degraus do n8n são diferença de fonte (nota da 49.5). **R3-5:** R-49-12 e R-49-13 ampliados (troca do Combo em todos os lançamentos onde ele é bump; **[AUTO-DECISION]** mapa coerente com a lista em cada etapa).<br>**Ordem de merge final:** 49.8 · (41.10 ‖ 49.1 ‖ 49.2) → [41.11 ‖ (49.3 → 49.4 → 49.5 → 49.6 → 49.7)] → 49.10 → 49.9.<br>**Status:** os bloqueios da 49.10 e da 41.10 foram respondidos; 49.10, 41.10 e 41.11 aguardam a re-validação do @po (transição de status é dele).<br>**Perguntas novas:** **P-7** (relatórios de perpétuo já gerados; o rascunho da 41.11 já a registra como bloqueio do merge) e **P-8** (relatórios já gerados de outros lançamentos afetados pela dedup ou pela R3-5; condicional ao levantamento da 41.10). Nenhuma bloqueia início de story.<br>**Ponto para o @po:** a [AUTO-DECISION] do Epic 41 para funil perpétuo sem `productName` mapeado (a dedup não age e vira alerta) não está no rascunho da 41.11. Com produto `null` = `""`, a chave juntaria ingresso e bump do mesmo pedido. |
| 2026-09-30 | @po (Pax) | **PO validation final 2026-09-30** (`*validate-story-draft`) de **41.10, 41.11, 49.10 e 49.5**, com consistência cruzada contra os epics 41/49 e a 49.3. **Draft → Ready:** 41.10 (9/10), 41.11 (9/10), 49.10 (9/10). **49.5** segue Ready (9/10). **[AUTO-DECISION] do @pm (41.11: funil sem `productName` → dedup não age e vira alerta) incorporada** na 41.11 (alerta `W-P8`, testes) e estendida, por ser a mesma função, a `transactionId` não mapeado e aos outros chamadores: W10 na 41.10, lacuna `DEDUP_POR_ID_NAO_APLICADA` na 49.3 (cobrada pelo F11 da 49.5), lacuna `PERPETUO_DEDUP_NAO_APLICADA` na 49.10; a 41.10 registra isso como "política de quem chama" no contrato exportado. **[AUTO-DECISION] do @sm na 41.11 conferidas:** dedup antes do corte de janela (coerente; teste reescrito com janelas adjacentes, o único que falha com o bug de volta); alertas não bloqueantes (`W-P7`/`W-P8`, códigos conferidos livres); T0 ler o mapeamento (ampliado a `productName`). **Alerta = efeito na janela** nas duas stories do Epic 41 (o W9 da 41.10 só fecha 25 / 13 assim). **49.10:** o `PerpetualReport` consumido é o de `loadPerpetualReport` (os alertas da 41.11 entram depois do motor); suíte do perpétuo "intacta em relação à `main` com a 41.11". **P-7/P-8:** condicionais e bloqueiam só o merge (41.11/41.10), não início nem Ready. |

<!-- clickup:17tqameqcth -->
