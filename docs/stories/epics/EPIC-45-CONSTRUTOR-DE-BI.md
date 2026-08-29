# EPIC 45 — Construtor de BI

**Status:** Done
**Origem:** Dossiê VK Metrics (`02_ANALISE_DO_CODIGO/11_construtor_bi.md`, 2.874 linhas) + `INSTRUCOES-PARA-IA.md`
**Owner:** @sm (stories) → @dev (implementação)

---

## O que é

Dashboards montáveis pelo próprio time: escolher widgets prontos, arrastar no canvas, filtrar por período e ver os números que o Loyola X já tem — sem pedir tela nova para o desenvolvimento a cada pergunta diferente.

## Premissa declarada (⚠️ a validar com o Lucas)

**As fontes são as que o app já tem.** Meta Ads (gasto/impressões/cliques por dia, campanha, conjunto, criativo), vendas (planilha + manuais), aplicações/leads (planilhas), grupos de WhatsApp (SendFlow) e custos operacionais.

Isto **não** é um conector genérico de dados novos. Se a intenção for conectar fontes externas, o épico muda de forma e as stories 45.1/45.2 precisam ser refeitas.

## O que veio do dossiê e por que

O dossiê descreve o Construtor do VK em 55 passos e 10 fases. Três decisões dele são adotadas sem alteração, porque resolvem problemas que apareceriam de qualquer forma:

1. **A query mora no servidor.** O cliente manda `{dashboardId, widgetId, período, filtros}`; o `querySpec` está salvo atrelado ao widget. Impede o cliente de forjar consulta arbitrária contra o banco.
2. **Presets antes do editor livre.** *"Tela em branco + DSL é inutilizável; catálogo nomeado é usável no dia um."*
3. **Resultado nunca é persistido.** Só definição e geometria.

E duas do dossiê são **rejeitadas** de propósito:

| Do VK | Aqui | Motivo |
|---|---|---|
| `organizationId` vindo do cliente | derivado da sessão no servidor | o próprio dossiê marca isso como falha do VK |
| `seriesLabels` traduzidos na chave de cache | rótulo fora da chave | multiplica o cache por idioma sem ganho |

## Regras não-negociáveis (das instruções do dossiê)

1. `null`, nunca `0`, quando não há amostra — zero contamina média, ordenação e export.
2. Timezone IANA real (`America/Sao_Paulo`), nunca offset fixo.
3. Toda query precisa de filtro de data — é o que impede varredura de tabela.
4. Parser próprio para expressões derivadas, **nunca `eval`/`new Function`** — é código do usuário rodando no nosso servidor.
5. Duas famílias de métrica sempre rotuladas: *geral* (sem atribuição) ≠ *atribuída*. Nunca unificar.
6. Denominador explícito no nome da métrica (ticket por venda ≠ por cliente).

## Stories

| # | Story | Entrega sozinha | Depende de |
|---|---|---|---|
| 45.1 | Catálogo semântico — as entidades e métricas que existem | catálogo consultável | — |
| 45.2 | Executor de `querySpec` | responder query validada | 45.1 |
| 45.3 | Dashboards: modelo, CRUD e permissão | criar/listar/apagar dash | — |
| 45.4 | Canvas com grid e persistência de layout | arrastar e salvar posição | 45.3 |
| 45.5 | Widgets de preset + galeria | dash útil no dia um | 45.2, 45.4 |
| 45.6 | Filtros do dashboard (período + slicers) | recorte do canvas inteiro | 45.5 |
| 45.7 | Editor de widget | montar widget novo | 45.5 |
| 45.8 | Colunas derivadas entre queries | "lucro" com escopos assimétricos | 45.7 |

**Fora do escopo deste épico:** agente de IA (Fase 7 do dossiê), templates de dash (Fase 9 §11), trial, telemetria dos 19 eventos. São valiosos e ficam para depois — nenhum deles é pré-requisito dos oito acima.

## Ordem

45.1 → 45.2 → 45.3 → 45.4 → 45.5 são o caminho até "dashboard montável e útil". As três últimas sobem o teto.

## Stories acrescentadas durante a execução

| # | Story | Por que apareceu |
|---|---|---|
| 45.10 ✅ | Visão consolidada de todos os projetos | Pergunta do Lucas: "juntar todos funis etc para ver geral". Dentro do projeto já somava tudo; faltava o nível de cima. Separar POR funil ficou de fora: depende de `matchCode`, que só 1 dos 17 funis tem |
| 45.9 ✅ | Entidade `aplicacoes` pelo caminho de planilha | Sai da 45.2: as outras entidades são tabelas, essa é leitura ao vivo do Google Sheets — carregar, filtrar e agregar em memória é um caminho de execução inteiro, não uma linha a mais no mapa de colunas |
