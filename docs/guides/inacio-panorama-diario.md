# Inácio — rotina diária do Panorama

**Criado:** 2026-08-27 (@sm — River) · **Dono:** Danilo Sagae
**Depende de:** Story 44.14 (tool `get_stage_cadeia_cac`) e Story 44.20 (tool `get_project_panorama`)
**Canal de saída:** ClickUp — list `APP - Loyola X`

Este documento é o **briefing operacional** do agente Inácio: o que ele lê, em que ordem, o que produz e onde publica. O prompt da §3 é para colar direto na configuração do agente.

---

## 1. O que já funciona e o que ainda não

Antes de configurar a rotina, saiba o que existe hoje (verificado em 2026-08-27):

| Peça | Estado |
|---|---|
| Rota `.../stages/{stageId}/cadeia-cac` | ✅ **existe e está no ar** desde a Story 44.8 |
| Tool MCP `get_stage_cadeia_cac` | ❌ **não existe** — 16 tools registradas, nenhuma da cadeia. Story **44.14** (Ready) resolve |
| Rota e tool do panorama | ❌ **não existem** — Story **44.20** (Draft) |
| Envio ao ClickUp | ✅ o Inácio já tem MCP do ClickUp. Nada a construir |

⚠️ **Consequência prática:** enquanto 44.14 e 44.20 não forem implementadas, o Inácio **não consegue** produzir este relatório sem reconstruir a cadeia por fora — que é exatamente o defeito que a 44.14 documenta (ele fez isso em 27/08 e errou em três pontos). **Não ligue a rotina antes das duas stories.** Ligar antes produz um laudo com régua própria, que diverge da tela, todo dia, e ninguém percebe.

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
- noAr é medido por GASTO, não por status na Meta. Uma campanha PAUSED que
  gastou na janela está no ar naquela janela. effectiveStatus: null significa
  "não resolvido pelo backfill", nunca "pausada".
- Os motivos (semDados, syncPendente, leituraFalhou, indeterminado, foraDaAba,
  semTetoConfiavel, coberturaIndisponivel) pedem AÇÕES DIFERENTES. Reporte o
  motivo específico. Nunca escreva "sem dados" para todos.
- Teto com confianca: "baixa" é indicação, não meta. Diga isso ao citá-lo.
- composto.rotulo é "cenario-teorico": os tetos vêm de campanhas diferentes.
  Ao citar a queda composta, diga que é cenário teórico.
- Cobertura de atribuição é DIAGNÓSTICO EXIBIDO, nunca multiplicador. Não
  corrija número nenhum por ela.

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

## 4. Onde publicar no ClickUp

**Uma task fixa, um comentário por dia.** Não crie uma task nova a cada manhã — em um mês são 30 cards que ninguém fecha, e o board de stories vira feed.

| Item | Valor |
|---|---|
| List | `APP - Loyola X` |
| Task fixa | `📊 Panorama Diário de Tráfego` — criar uma vez, status `in progress`, sem due date |
| Publicação diária | um comentário na task, com a data no topo |
| Tags | `aiox-agent`, `panorama` |

⚠️ **Confirme o list id antes de ligar a rotina.** A regra `.claude/rules/clickup-workflow.md` cita `901326639417` no texto e `901326621645` nos exemplos de `curl` — os dois não podem estar certos. Rodar contra o id errado publica num board que ninguém lê.

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
| CAC ou CPL | exato |
| Métrica do gargalo e o teto | exatos |
| Nome do criativo de maior investimento | exato |

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
