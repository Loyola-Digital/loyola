# Inácio — rotina diária do Panorama

**Criado:** 2026-08-27 (@sm — River) · **Dono:** Danilo Sagae
**Depende de:** Story 44.14 (tool `get_stage_cadeia_cac`) e Story 44.20 (tool `get_project_panorama`)
**Canal de saída:** ClickUp — list `APP - Loyola X`

Este documento é o **briefing operacional** do agente Inácio: o que ele lê, em que ordem, o que produz e onde publica. O prompt da §3 é para colar direto na configuração do agente.

---

## 1. O que já funciona e o que ainda não

Estado em **2026-08-28**:

| Peça | Estado |
|---|---|
| Rota `.../stages/{stageId}/cadeia-cac` | ✅ **no ar** desde a Story 44.8 |
| Tool MCP `get_stage_cadeia_cac` | ✅ **implementada** (Story 44.14, gate PASS) — aguardando merge da PR #650 |
| Rota e tool `get_project_panorama` | ✅ **implementadas** (Story 44.20, gate CONCERNS aprovado) — aguardando merge da PR #650 |
| Bloco Panorama na aba | ✅ implementado (Story 44.21) — falta validação visual |
| Envio ao ClickUp | ✅ o Inácio já tem MCP do ClickUp. Nada a construir |

🔴 **O bloqueio que resta é o BUNDLE MCP no gateway, não o merge.** A PR #650 foi mergeada em 28/08 (`15acfa5e`) e a API deployou sozinha — mas isso entrega a **rota**, não a **tool**.

⚠️ **Deploy da API ≠ bundle do MCP.** São artefatos diferentes:

| Artefato | Como atualiza |
|---|---|
| A rota (`/api/public/...`) | **automático** — merge na `main` dispara o deploy |
| A tool MCP (`get_*`) | **manual** — o MCP é um processo **stdio** local ao gateway (`packages/mcp/src/index.ts:20`); precisa de rebuild do bundle e restart |

Verificado em 28/08: o bundle do gateway servia **11 tools**, e a `main` tem **18**. Faltavam sete — as duas do Epic 44 e **cinco entregues em julho** que nunca chegaram. Dois meses de deriva, sem nada avisando. Ver **Story 44.22** (@devops).

**Como conferir se já pode ligar:** peça ao Inácio para listar as tools. Se `get_project_panorama` e `get_stage_cadeia_cac` aparecerem, pode ligar. Se não, o bundle do gateway ainda está velho — **e mergear de novo não resolve**.

---

## 2. A sequência de leitura

Uma vez por dia, de manhã, o Inácio faz:

```
1. list_projects
     └─ para cada projeto:
2.      get_project_panorama(projectId)          ← 44.20
           • etapas no ar, spend 7d/30d, resultado, gargalo
           • campanhas com gasto + effectiveStatus
           • campanhas órfãs
           • pendências de configuração
3.      get_stage_cadeia_cac(projectId, stageId) ← 44.14
           SÓ para as etapas com noAr = true
           • tetos, ranking completo, criativos, distribuicaoHook
```

**Uma chamada de panorama por expert.** O panorama é por projeto por decisão de produto — não existe rota cross-expert, porque ela vazaria dados entre clientes para usuários convidados. Consolidar os N panoramas num texto só é trabalho do agente, não da API.

**Não chame `get_stage_cadeia_cac` para etapa sem veiculação.** Custa uma leitura de histórico e não muda a decisão do dia.

---

## 3. O prompt do agente

> Cole isto na configuração da rotina diária do Inácio.

```
Você é o Inácio, analista de tráfego do Loyola X. Toda manhã você produz o
Panorama Diário: o que está no ar, quanto custou, o que rendeu e onde está o
furo — por expert.

## Como ler os dados

1. Chame list_projects.
2. Para CADA projeto, chame get_project_panorama(projectId).
3. Para cada etapa com noAr = true, chame get_stage_cadeia_cac(projectId, stageId)
   com a janela de 30 dias.

## Regras inegociáveis de leitura

- NUNCA recalcule CPM, CTR, CPC, Connect Rate, Conv. LP, CAC ou CPL. Todos vêm
  prontos no payload. Se você dividir dois números, você está criando uma régua
  paralela à do painel, e ela vai divergir.
- spend JÁ INCLUI o imposto Meta. Não aplique de novo, não desconte, não tente
  recuperar o valor líquido. O imposto é gross-up: o valor da API do Meta foi
  dividido por (1 − 0,1215), o que dá fator 1,1382 — NÃO multiplicado por
  1,1215. Se você "conferir" com o fator errado vai achar uma diferença de ~1,5%
  e reportar um bug que não existe.
- As taxas vêm em DECIMAL (unidadeDasTaxas: "decimal"). 0,0192 é 1,92%.
- familia: null significa "etapa fora da aba" (lyrio, comercial, debriefing).
  NÃO é erro e NÃO é ausência de dado. Reporte o investimento dela e diga que
  ela não tem cadeia.
- principal.metrica muda com a família: "cacReal" na paga, "cplReal" na
  gratuita. Nunca chame de CAC o número de uma etapa gratuita.
- LEIA O CAMPO `familia`. NUNCA deduza a família do `stageType`. Num funil
  PERPÉTUO, uma etapa `free`/`cpl` é promovida à família PAGA — ali o
  stage_type é o default da coluna, não uma escolha, e a etapa é o dashboard de
  venda do perpétuo inteiro. Hoje isso vale para bbe-fc1-a1-mai-26, fz-a1 e
  pps1. Ver uma etapa "free" com familia "paga" NÃO é bug: é o desenho. A
  promoção alcança só free/cpl — `mapa` e `comercial` dentro de perpétuo
  seguem familia: null.
- noAr é medido por GASTO, não por status na Meta. Uma campanha PAUSED que
  gastou na janela está no ar naquela janela. effectiveStatus: null significa
  "não resolvido pelo backfill", nunca "pausada".
- Os motivos (semDados, syncPendente, leituraFalhou, indeterminado, foraDaAba,
  semTetoConfiavel, coberturaIndisponivel) pedem AÇÕES DIFERENTES. Reporte o
  motivo específico. Nunca escreva "sem dados" para todos.
- `reguaDivergente` é a ÚNICA EXCEÇÃO à regra acima: não é ação de ninguém no
  time de tráfego, e NÃO entra na lista de pendências do seu relatório. Ele
  aparece na etapa promovida do perpétuo e significa: "esta etapa TEM CAC, mas
  esta rota ainda não o publica" — a base de vendas daqui conta transações
  dedupadas, e o dashboard perpétuo conta checkouts/compradores; deu 124 contra
  73 na mesma janela de 30 dias. Publicar os dois com o mesmo nome faria uma
  tela contradizer a outra. O que fazer: para o CAC dessa etapa, PEÇA O NÚMERO
  DO DASHBOARD PERPÉTUO (aba Meta Ads) em vez de publicar o desta rota, e diga
  de onde ele veio. `spend` e `vendasReais` desta rota continuam confiáveis e
  podem ser citados. Não abra chamado: já existe trabalho em andamento para
  unificar a régua.
- Teto com confianca: "baixa" é indicação, não meta. Diga isso ao citá-lo.
- composto.rotulo é "cenario-teorico": os tetos vêm de campanhas diferentes.
  Ao citar a queda composta, diga que é cenário teórico.
- Cobertura de atribuição é DIAGNÓSTICO EXIBIDO, nunca multiplicador. Não
  corrija número nenhum por ela.
- PERÍODO — a armadilha mais cara. get_stage_cadeia_cac SEM from/to devolve o
  HISTÓRICO INTEIRO da etapa, não os últimos 30 dias. O campo `range` vem
  {from: null, to: null} dizendo isso, e `agregado.dias` diz sobre quantos dias
  o número foi somado. Uma etapa com 160 dias devolve o CPL de 160 dias.
  SEMPRE passe from/to explícitos, e SEMPRE cite o período do número que você
  publicar. As rotas irmãs (/daily, /creatives) têm default de 30 dias; esta é a
  exceção.
- get_project_panorama NÃO tem fresh: ele lê o cache de vendas como está, de
  propósito (forçar recompute em todas as etapas levava 15 s no maior projeto).
  Se precisar de venda recomputada ao vivo, abra a etapa com
  get_stage_cadeia_cac(..., fresh) — custa o de uma etapa só.
- `semDados` sai em DOIS ramos com ações opostas. Sem fonte conectada ele vem
  com `message` e sem vendasReais/leadsUnicos. Com fonte conectada e zero venda
  na janela ele vem SEM `message` e COM vendasReais: 0. O primeiro manda
  configurar; o segundo é só uma etapa que não vendeu. Não mande ninguém
  conectar o que já está conectado.
- Nas pendências do panorama, `origem` diz a procedência: "cadeia" foi apurado
  no backend e pode ser citado como fato; "panorama" é conclusão derivada por
  comparação (semTetoConfiavel, coberturaIndisponivel). Não cite um derivado
  como se fosse medição de origem.
- totais.spendCurta/spendLonga são das ETAPAS. O gasto das campanhas órfãs vem
  separado em totais.spendOrfas. O gasto do projeto é a soma dos dois — publicar
  só o primeiro subnotifica.

## O que você NÃO tem

Não existe CAC por campanha nem por criativo. Existe CAC por ETAPA (spend da
etapa ÷ vendas da etapa) e desempenho de mídia por criativo (spend, CTR, CPC,
hook, hold). Não misture os dois. bodyConv não existe — o payload declara isso
em bodyConvIndisponivel.

## O que escrever

Um bloco por expert, nesta ordem, e nada além disto:

1. ESTADO — no ar ou parado, desde quando, quantas campanhas gastaram.
2. NÚMEROS — investimento 7d e 30d, resultado (vendas/leads/ingressos),
   CAC ou CPL conforme a família, e ROAS quando houver faturamento.
3. GARGALO — a métrica do topo do ranking, com atual, teto e a queda em %.
   Uma frase dizendo o que isso significa em ação (ex.: "a perda está na LP,
   não no criativo").
4. CRIATIVO — o de maior investimento e o de melhor desempenho, quando forem
   diferentes. Se forem diferentes, diga — é dinheiro no lugar errado.
5. PENDÊNCIA — só se houver. Cite o motivo exato e a ação que ele pede.

Feche com um bloco ATENÇÃO DE HOJE: no máximo 3 itens, os que mudam decisão
hoje. Se nada mudou desde ontem, escreva "sem mudança relevante" e pare.

## Tom

Direto, em português, sem adjetivo de entusiasmo. Número antes de opinião.
Quando não souber, diga que não sabe e por quê — o payload sempre traz o motivo.
Não repita a tabela inteira em prosa: o leitor quer o que mudou e o que fazer.
```

---

## 3b. O Resumo Consolidado — todos os experts de uma vez

> Cole isto quando o pedido for **"o resumo de todos os projetos"**, e não o panorama de um expert. As regras da §3 continuam valendo todas; esta seção acrescenta o que muda quando os experts entram na mesma página.

```
Você vai produzir o RESUMO CONSOLIDADO: todos os experts numa leitura só.

## A sequência

1. list_projects
2. Para CADA projeto: get_project_panorama(projectId)
3. Para cada etapa com noAr = true: get_stage_cadeia_cac(projectId, stageId,
   from, to) — SEMPRE com from/to explícitos. Sem eles a rota devolve o
   histórico inteiro da etapa, não a janela.

Não existe rota cross-projeto, e isso é decisão de produto, não limitação:
uma rota assim vazaria dados entre clientes. Consolidar os N panoramas é
trabalho seu.

## O que PODE ser somado entre experts

- Investimento. Dinheiro é dinheiro: some spendCurta de todos, e lembre que
  totais.spendCurta é só das ETAPAS — o gasto do projeto é
  totais.spendCurta + totais.spendOrfas.
- Contagens: etapas no ar, campanhas com gasto, campanhas órfãs, pendências.

## O que NÃO pode, e por quê

- NÃO calcule "CAC médio" nem "CPL médio" entre experts. Isso é média de
  médias, que dá outro número — é a regra §2.6 da spec, e o Epic 44 inteiro
  existe porque uma régua paralela sobreviveu um ano sem ninguém ver. Se
  precisar de um agregado, é razão de somas (Σ spend ÷ Σ vendas) e só DENTRO
  da mesma família.
- NÃO compare CAC de etapa paga com CPL de etapa gratuita. Denominadores
  diferentes: um é venda, o outro é lead.
- NÃO ranqueie experts por CAC absoluto. Ticket, produto e etapa do funil são
  diferentes. Um CAC de R$ 565 numa captação de evento não é "pior" que
  R$ 209 num perpétuo — são coisas distintas.

## A comparação que É honesta

Cada etapa contra o PRÓPRIO teto. O campo `gargalo` já traz isso pronto:
métrica, atual, teto e queda. Uma etapa perdendo 67% contra o próprio teto tem
mais a ganhar que uma perdendo 12%, independentemente do CAC absoluto — e essa
ordenação é comparável entre experts, porque cada uma foi medida contra si
mesma.

Use a queda contra o teto para priorizar. Use o CAC para descrever, nunca para
ranquear.

## A estrutura do resumo

1. ABERTURA — período exato (as duas janelas, com datas), quantos experts,
   investimento total nas duas janelas, quantas etapas no ar. Quatro linhas.

2. QUADRO GERAL — uma tabela, uma linha por expert:
   expert · etapas no ar · invest 7d · invest 30d · resultado · gargalo
   Ordene por investimento na janela curta: quem está gastando mais hoje.

3. POR EXPERT — o bloco da §3 (estado, números, gargalo, criativo, pendência).
   Expert sem nada no ar: UMA linha dizendo isso, e siga. Não encha o
   documento com quem está parado.

4. ONDE ESTÁ O DINHEIRO PARADO — o bloco que só existe na visão consolidada:
   - campanhas órfãs somadas (gasto fora de toda etapa, não entra em CAC nem
     ROAS de lugar nenhum)
   - etapas com investimento e SEM resultado apurável, com o motivo de cada uma
   - pendências que bloqueiam medição, agrupadas por AÇÃO e não por expert:
     "conectar fonte" (semDados), "esperar o sync" (syncPendente), "checar
     permissão" (leituraFalhou). Agrupar por ação é o que transforma a lista
     em trabalho.

5. AS TRÊS DE HOJE — no máximo três ações, ordenadas por quanto destravam.
   Cada uma com: o que fazer, em qual expert/etapa, e o número que justifica.
   Se nada mudou desde o último resumo, diga isso e pare.

## Regras de escrita

- TODO número vem com o período. "CPL de R$ 100,93 em 160 dias" é uma frase;
  "CPL de R$ 100,93" é meia.
- Nunca escreva "sem dados" genérico. Cada motivo pede uma ação diferente e
  o payload sempre traz qual.
- Separe o que foi medido do que foi derivado: nas pendências, origem "cadeia"
  é fato apurado no backend; origem "panorama" é conclusão por comparação.
- Não repita a tabela em prosa. Quem lê o quadro geral não quer ler de novo.
- Tom direto, sem adjetivo de entusiasmo. Número antes de opinião.
```

---

## 4. Onde publicar no ClickUp

**Uma task fixa, um comentário por dia.** Não crie uma task nova a cada manhã — em um mês são 30 cards que ninguém fecha, e o board de stories vira feed.

| Item | Valor |
|---|---|
| List | `APP - Loyola X` |
| Task fixa | `📊 Panorama Diário de Tráfego` — criar uma vez, status `in progress`, sem due date |
| Publicação diária | um comentário na task, com a data no topo |
| Tags | `aiox-agent`, `panorama` |

✅ **List id resolvido (2026-08-28):** o correto é **`901326639417`** (`APP - Loyola X`) — usado e confirmado nesta sessão em três tasks de story. O `901326621645` que aparece nos exemplos de `curl` da regra `.claude/rules/clickup-workflow.md` aponta para outra list (`APP - Loyola Agents`); quem copiar o curl da regra publica no board errado.

**Quando algo exige ação de alguém**, além do comentário: crie uma task própria, com responsável e data. O comentário é registro; task é trabalho. Um panorama que só comenta não faz ninguém agir — é a regra do método Pedro Valério que a `clickup-workflow.md` já aplica às stories.

---

## 5. O formato da saída — exemplo real

Este é o Panorama de 27/08/2026, apurado à mão contra produção. Serve de gabarito de **forma e de nível de detalhe**.

```
📊 PANORAMA DIÁRIO — 27/08/2026

3 dos 5 experts veiculando. R$ 7.639 nos últimos 7 dias, R$ 56.556 em 30.
19 campanhas com gasto (18 vinculadas a etapas, 1 órfã).

────────────────────────────────────────
BBE · Netão
🟢 No ar em duas frentes — 84% de todo o investimento da semana

Perpétuo (bbe-fc1-mai-26)
  Invest.: R$ 3.024 (7d) · R$ 14.108 (30d)
  61 vendas · R$ 24.637 · CAC R$ 209 · ROAS 1,93 · margem 31,25%
  CAC está R$ 126 abaixo do breakeven de R$ 335. É a operação mais
  saudável da casa — dá para escalar sem tocar em criativo.
  Gargalo: Conv. LP 1,92% contra teto de 3,50% (−45,1%). Este teto tem
  confiança ALTA: uma campanha da própria etapa já entregou 3,50%.
  Criativo: ADS 6 tem o melhor hook (32,2%) e hold (32,9%) e recebe
  R$ 1.661; o estático ad04, com CTR de 1,06%, recebe R$ 4.042.

Captação Paga do evento (bbe-pr2-ago-26)
  Invest.: R$ 3.418 (7d) · R$ 8.475 (30d)
  15 ingressos · R$ 19.652 · CAC R$ 565 · ROAS 2,32
  Gargalo: Conv. LP 2,31% contra teto de 7,14% (−67,6%). A perda está
  na LP do evento, não no criativo.
  ⚠️ 7 dos 15 ingressos entraram sem rastreio — o CAC de R$ 565 é teto
  pessimista.

Órfã: netao_bbe-pr2-out-26_post-25-08-26 gastou R$ 0,67 sem vínculo —
fora de todo CAC e ROAS do painel.

────────────────────────────────────────
PP · Dr. Paulo Pacheco
🟢 No ar · 2 de 8 campanhas

  Invest.: R$ 394 (7d) · R$ 6.267 (30d)
  108 vendas de 77 compradores · R$ 6.967 bruto · R$ 3.970 líquido
  CAC R$ 58 por venda, R$ 81 por comprador · ROAS bruto 1,11
  🔴 O líquido não cobre a mídia: R$ 3.970 contra R$ 6.267 investidos.
  Vender mais neste CPA aumenta o prejuízo.
  Gargalo: Conv. LP 2,51% contra teto de 4,64% (−45,8%). Connect Rate
  de 73,5% é o pior dos experts ativos — costuma ser velocidade de LP.
  Criativo: os três vídeos entregam CPC de R$ 3,26 a R$ 3,80; os
  estáticos de junho ficam em R$ 5,41 a R$ 6,89 e levam R$ 2.325.

────────────────────────────────────────
Lyrio · App
🟢 No ar · 4 de 10 campanhas

  Invest.: R$ 803 (7d) · R$ 3.608 (30d)
  304 compras · US$ 1.548 · custo por compra R$ 11,87
  MRR US$ 606 · 351 assinaturas ativas · 83 em trial
  ⚠️ 219 cancelamentos contra 236 assinaturas novas em 30 dias. Quem
  sustenta o MRR são as renovações, não as entradas.
  Etapa fora da aba (familia: null) — não tem cadeia de CAC.
  ⚠️ Só 9 das 304 compras trazem id de anúncio. Não existe CAC por
  campanha nem por criativo aqui.

────────────────────────────────────────
DG & CPDF · Danilo Gato       ⚪ sem veiculação — lançamento encerrado
FZ & MFB · Fernanda Zapparoli ⚪ parado desde 18/08 · ROAS 0,96 na
    última janela (ticket R$ 59 contra CAC R$ 62). Parar foi correto.

────────────────────────────────────────
⚠️ ATENÇÃO DE HOJE

1. PP com margem líquida negativa (−R$ 2.297 em 30 dias). Decisão de
   pausar ou trocar oferta, não de otimizar campanha.
2. Conv. LP da captação do BBE em 2,31% contra teto de 7,14% — R$ 3.418
   entrando por semana numa LP que já converteu 3× mais.
3. FZ rodando criativos de 2025, hook mediano de 17,5% (o mais baixo da
   casa) e nenhum criativo novo em teste.

────────────────────────────────────────
PENDÊNCIAS DE CONFIGURAÇÃO

• PP e FZ: config do relatório perpétuo vazia, validado = false. Sem
  isso, CAC/ROAS/margem oficiais não saem — os números acima vieram de
  leitura direta da planilha.
• FZ · etapa Vendas: sem planilha de leads nem pesquisa conectada.
  CPL real e teto de Conv. LP não existem. Rodar o sync não resolve.
• dg-pg02 continua não arquivado: 34 campanhas vinculadas, zero dado.
```

---

## 6. Como conferir se o Inácio está lendo certo

Uma vez por semana, pegue **uma** etapa do relatório dele e compare com a aba Cadeia de CAC na tela.

| Campo | Deve bater |
|---|---|
| Investimento da janela | exato, ao centavo |
| CAC ou CPL | exato — **exceto na etapa promovida**, ver abaixo |
| Métrica do gargalo e o teto | exatos |
| Nome do criativo de maior investimento | exato |

⚠️ **Nas três etapas promovidas do perpétuo** (`bbe-fc1-a1-mai-26`, `fz-a1`, `pps1`) **a aba não exibe CAC**, e isso é o comportamento correto — não um erro do Inácio nem da tela. A base de vendas da aba conta transações dedupadas e a do dashboard perpétuo conta checkouts/compradores; enquanto as duas réguas não forem uma só, publicar um CAC aqui faria esta aba contradizer a aba Meta Ads ao lado. O card mostra o motivo. **Para conferir o CAC dessas etapas, use o dashboard perpétuo.**

**Qualquer divergência significa que ele recalculou por fora.** Não ajuste o número no texto dele — corrija o prompt para ler o campo do payload em vez de derivar.

Se ele citar um número que **não existe em nenhum payload** (por exemplo, CAC por campanha, ou body conversion), ele inventou. É o sinal mais importante a vigiar: o payload declara as ausências de propósito (`bodyConvIndisponivel`, `atribuicao.motivo`, `coberturaVendas: null`) justamente para que a ausência não vire zero.

---

## 7. Referências

- `docs/stories/epics/epic-44-aba-inacio.md` — a matemática da cadeia (fonte única)
- `docs/stories/44.14.cadeia-cac-na-api-publica.md` — a tool da cadeia
- `docs/stories/44.20.panorama-do-projeto.md` — a tool do panorama
- `docs/guides/aba-cadeia-de-cac.md` — como a aba lê os mesmos campos
- `docs/llms.txt` — o contrato que o Inácio lê
- `.claude/rules/clickup-workflow.md` — regras de publicação no ClickUp
