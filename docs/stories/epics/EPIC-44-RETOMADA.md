# Epic 44 — aba "Inácio" · ponto de retomada

**Congelado em:** 2026-08-17
**Branch:** `feature/44.1-serie-diaria-por-campanha` — **8 commits locais, NÃO pushados**
**Base:** `origin/main` em `c48f0766`

---

## Onde paramos

**Fase 1 completa** (stories 44.1 a 44.5). **Fase 2 liberada pelo gate.**

| Story | Estado | Entregue |
|---|---|---|
| 44.1 série diária por campanha + `p25`/`p100` | ✅ | endpoint `.../stages/:stageId/campaigns/daily` · 11 testes |
| 44.2 corrigir `connectRate` | ✅ | denominador `linkClicks` · `API_CONTRACT_VERSION` → **2** |
| 44.3 atribuição venda/lead → campanha | ✅ | `services/campaign-attribution.ts` · 13 testes · cobertura medida |
| 44.4 normalização de nome | ✅ Done | função + relatório · **decisão: não agrupar** |
| 44.5 🚦 gate do teto | ✅ Done | **régua se sustenta, não muda** |

**Não feito:** `@qa` nos 8 commits · push · PR.

---

## As 4 decisões do time — não reabrir

1. **`lyrio` fora da aba.** `cpl`, `comercial`, `debriefing` e `event` têm **zero campanhas vinculadas**, então ficam de fora por ausência de dado, não por família.
   Famílias: **paga** = `paid` · `sales` · `event_capture` · `event` — **gratuita** = `free` · `cpl`.

2. **Fonte de dado (Opção 3):**
   - série corrente → `meta_ad_insights_daily` agregado por campanha
   - teto histórico → `meta_campaign_insights_daily` permitido, **com a fonte rotulada**

3. **Não agrupar campanhas por nome.** `normalizarNomeCampanha` existe e está sem consumidor — é alavanca se o teto faltar base.

4. **Bloqueio B1 → opção 3: a cadeia para em Conv. LP.** A **Conv. Checkout sai da aba**.

---

## Números já medidos — não repetir a medição

| | |
|---|---|
| Cobertura de atribuição venda→campanha | **20–35%** (foi o que matou a Conv. Checkout) |
| Gate do teto | **passa no piso baixo** nos 10 grupos; no alto: 4 utilizáveis, 4 frágeis, 2 vazios |
| `connectRate` público × interno | divergia **18–35 p.p.** — corrigido |
| Campanhas só em campaign-level | 41, **nenhuma ativa** (pré-job 36.4) |
| Campanhas com gap na série diária | **41%**, maior gap 14 dias |
| Grupos de campanha com id repetido | 9 de 196 · **7 simultâneos** |

**Consequência de desenho que o gate revelou:** o selo de confiança `alta`/`baixa` vira **essencial** — a maior parte dos tetos nasce em confiança baixa.

---

## ⚠️ Pendências que travam o merge

**1. Aviso ao Inácio antes do deploy da API (44.2).** O `connectRate` **sobe 18–35 p.p.** no endpoint público.

> ⚠️ **Corrigido em 2026-08-18 (QA-44-03).** A versão anterior dizia "painel e API precisam subir juntos". **Errado.** O painel **não consome** `/api/public/meta` — zero ocorrências de `/public` em `packages/web`. Ele usa `/api/meta-ads/*` e já calcula o Connect Rate por `linkClicks` (`funnel-metrics.ts:348`). A coluna "interno (tela)" do relatório antes/depois prova: **a tela já mostrava o valor certo e não muda com o deploy**.
>
> O consumidor real é `packages/mcp` — servidor **stdio na máquina do Inácio**, sem checagem de contrato. Quando a API subir, o relatório dele muda na hora. **Avisar é a coordenação que existe**; sincronizar com o painel não é.

Antes/depois documentado em `docs/qa/audits/44.2-connectrate-antes-depois.md`.

**2. ✅ `@qa` rodou em 2026-08-18** — gate **CONCERNS**, `docs/qa/gates/44.1-44.5-fase-1-epic-44.yml`. PASS em 44.1, 44.4 e 44.5. Três must-fix aplicados pelo @dev na mesma data: cobertura de leads passando de 100% (QA-44-01), correção da 44.2 sem teste (QA-44-02, que era a AC6 da própria story) e esta premissa de deploy (QA-44-03).

**3. `/health` de produção devolve `commit: null`** (o Railway não injeta `RAILWAY_GIT_COMMIT_SHA`), então o detector das stories 29.45/29.46 está parcialmente cego.

> Nuance registrada no gate: o `commit: null` cega a checagem de **commit**, não a de **contrato**. Como a 44.2 subiu o `API_CONTRACT_VERSION` para 2, o banner do painel **volta a funcionar** neste caso — ele acusa a API defasada até ela subir.

---

## Armadilhas registradas

- **`lpRate`/`connectRate`** do endpoint = LP views ÷ link clicks. **NÃO** é o "Conv. LP" da spec (checkouts ÷ LP views).
- **Janela de 7 dias:** sempre `RANGE BETWEEN INTERVAL '6 days'` (por data), **nunca** `ROWS` — 41% das campanhas têm gap e a base inflaria.
- **Não estender** `ehCaptacaoPaga` e irmãos: eles decidem sync diário e CRM. A aba usa classificação própria.
- **Módulo folha no `shared`:** web importa por subpath, API por bare import. Ver a tabela em `packages/shared/src/index.ts`.
- **`traffic-analytics.ts:452`** calcula CAC como `spend ÷ purchases` — divergente da cadeia. Migração é a 44.10.

---

## Mapa das stories da Fase 2 em diante

Liberadas pelo gate. O mapa proposto:

| Story | Conteúdo | Estado |
|---|---|---|
| 44.6 | Núcleo de cálculo puro no `shared` + testes dourados (Fase 2) | ✅ escrita, implementada, InReview |
| **44.7** | **Composição do teto no `shared`** (Fase 2) — **inserida em 2026-08-18** | a escrever |
| 44.8 | Endpoint do payload da aba + schema versionado (Fase 3) | era 44.7 |
| 44.9 | A aba + campos novos em `funnel_stages` (Fase 4) | era 44.8 |
| 44.10 | Bloco de criativos + distribuição do Hook Rate (Fase 5) | era 44.9 |
| 44.11 | Unificação do CAC (`traffic-analytics`) (Fase 6) | era 44.10 |
| 44.12 | Doc do Inácio + rotina ClickUp + teste de paridade (Fase 6) | era 44.11 |

### Por que a 44.7 foi inserida (decisão do @po, 2026-08-18)

O gate da 44.6 (QA-446-05) achou que `Teto`, `TetoAusente` e `MotivoIndisponivel` são declarados e **nenhuma das 19 funções exportadas devolve qualquer um deles**. O módulo entrega os insumos do teto — janelas, base por métrica, selo, guarda de cobertura — mas nunca escolhe a janela vencedora nem monta o resultado.

**A ambiguidade é minha.** As AC6 e AC7 descrevem as *propriedades* do teto (*"o teto é o melhor valor da melhor janela"*, *"cada teto carrega origem, base, data, fonte e selo"*) e nunca dizem *"devolve um `Teto`"*. O @dev leu como primitivas, o @qa lê como composição, e as duas leituras cabem no texto que eu validei em 9,5/10. Reabrir uma story que passou no gate para acrescentar escopo, porque eu subespecifiquei, é pior processo do que abrir uma nova.

**E não é embrulho mecânico do que já existe.** `coberturaAtipica(coberturaDaJanela, coberturaMediana)` precisa da cobertura de lead por janela — que exige leads **atribuídos e totais** por dia. `DiaBruto` só carrega `leadsAtribuidos`. Ou seja: a composição exige mudança na forma da entrada, que é decisão de desenho, não linha de código. Isso é story.

**O que NÃO é negociável:** a composição mora no `@loyola-x/shared`, nunca na rota. Se ela for escrita dentro do endpoint, a lógica do teto passa a viver fora do lugar único — que é a regra 7.6 da spec e o motivo pelo qual a 44.6 existe. Foi assim que o `connectRate` divergiu do painel por um ano.

**Onde discordo do @qa:** ele sugeriu remover os três tipos órfãos. Eles ficam. São o contrato contra o qual a 44.7 implementa, já foram revisados, e removê-los faria a 44.7 recriá-los — churn sem ganho. O problema não é existirem, é nada dizer *quando* ganham produtor. Um comentário apontando a 44.7 resolve, e é tarefa da 44.7.

**Duas coisas mudaram desde que o mapa foi feito**, por causa da decisão B1:
- a 44.6 **não** precisa de `calcularConvCheckout`
- o serviço da 44.3 continua útil (cobertura como diagnóstico de tracking, CAC real por etapa), mas não alimenta mais a Conv. Checkout por campanha — vale o `@sm` revisar antes de escrever a 44.6

---

## Arquivos que contam a história

| arquivo | o que tem |
|---|---|
| `AUDITORIA-ABA-CAC.md` | Fase 0 — campos, lacunas, 5 bloqueios, 11 perguntas |
| `docs/stories/44.1` … `44.5` | as stories, com as decisões no Change Log |
| `docs/qa/audits/44.4-agrupamento-campanhas.md` | os 9 grupos, para revisão futura |
| `docs/qa/audits/44.2-connectrate-antes-depois.md` | antes/depois do Connect Rate |
| `packages/api/src/scripts/recontagem-viabilidade-teto.ts` | o gate, reproduzível |
| `packages/api/src/scripts/medir-cobertura-atribuicao.ts` | a medição de cobertura |
