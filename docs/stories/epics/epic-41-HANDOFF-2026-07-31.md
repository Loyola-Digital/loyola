# Handoff — Epic 41 (Resumão / Comparativo / Perpétuo) — 2026-07-31

**Branch:** `feat/41.2-launch-report-engine` (empilhada sobre `feat/41.1-launch-report-config`)
**Commits à frente da main:** 21 · **Diff:** 73 arquivos, ~18.100 linhas
**Push:** ❌ não feito — é do @devops
**Autor:** @dev (Dex) via Danilo
**Próximo responsável:** @devops (Lucas) para limpeza final, push, PR e deploy

> Substitui `epic-41-HANDOFF-2026-07-29.md`, que cobria só até a 41.1.

---

## 1. Estado do epic

As **9 stories estão implementadas** e em `InReview`.

| Story | Escopo | Conferência |
|---|---|---|
| **41.1** | Config de lançamento/expert + gate de escopo | validada na tela |
| **41.2** | Motor (§2 + §3) + loader | **§10 ao centavo** no PG02 |
| **41.3** | 9 invariantes + 8 alertas + conferência externa | 8 passam com dado real; **A9 = 0,000000** |
| **41.4** | Destaques por anúncio (§3.8, §7.2) | **A6 = 0,0000** nas 3 visões do PG04 |
| **41.5** | Render + persistência + botão | validada na tela |
| **41.6** | Comparativo: decomposição + cenários | **decomposição bate com a §10**; validada na tela |
| **41.7–41.9** | Perpétuo (botão 3) | implementadas na sessão anterior |

**Gates:** `tsc` API ✅ · `tsc` web ✅ · `next build` 27/27 ✅ · **321 testes** da trilha do Epic 41 ✅

---

## 2. ⚠️ Banco — leia antes do deploy

**Quatro migrations já aplicadas no banco de PRODUÇÃO** e ausentes do código da main:

| Migration | Conteúdo |
|---|---|
| `0086_launch_report_configs.sql` | `launch_report_configs` + `expert_report_configs` |
| `0087_perpetual_report_configs.sql` | `perpetual_report_configs` |
| `0088_perpetual_reports.sql` | `perpetual_reports` |
| `0089_launch_reports.sql` | `launch_reports` |

Todas **aditivas e idempotentes** (`CREATE TABLE IF NOT EXISTS`), criando tabelas
novas e vazias. Nada quebra com o código atualmente em produção — mas o banco
está à frente do código da main, e o deploy precisa saber disso.

---

## 3. 🔴 Pendências do @dev → @devops

### 3.1 Limpeza antes do PR

A branch **ainda carrega 103 arquivos duplicados** do padrão de sync do macOS
(`nome 2.ext`), todos dentro de `.aiox-core/`. Eles **vêm da main**, não desta
branch — não foram introduzidos aqui, e mexer neles é decisão do dono do repo,
porque `.aiox-core/` é L1/L2 do framework (protegido por deny rules).

Os **11 que estavam no escopo desta branch já foram removidos** do versionamento
em dois commits (`3303444` e `ca02a15`), incluindo o `tmp-ins2.test.ts`, que lia
`DATABASE_URL` do `.env` e fazia `INSERT`/`DELETE` real em produção.

Todos seguem no disco como untracked — **apagar do disco é decisão do Lucas**.

### 3.2 Push, PR e deploy

1. **Push + PR** — exclusivo do @devops.
   - ⚠️ A branch é **empilhada**: `feat/41.2-launch-report-engine` sai de
     `feat/41.1-launch-report-config`. O padrão que funcionou na 29.24 (PR #402)
     foi merge-commit + re-target.
2. **Deploy da API** — sem ele, nada disso existe no ambiente de vocês. A API do
   Railway **já estava defasada antes desta sessão** (ver
   `project_api_boot_mindregistry_timeout`).
3. **Deploy do web** — os dois botões e a tabela de criativos dependem dele.

### 3.3 Avisos de número visível em produção

Três mudanças alteram números que já são acompanhados. Todas são **correção**,
não regressão — mas quem olha esses painéis vai notar.

| O quê | Onde | Efeito |
|---|---|---|
| **Fix da pesquisa** | card Pesquisa do **dg-pg04** | denominador cai de **1.717 → 616** (1.101 linhas em branco da planilha eram contadas como respondente). Todos os percentuais das perguntas mudam. O dg-pg02 **não muda** (não tinha linha vazia). |
| **Fix de fuso** (41.7) | dashboard perpétuo | alguns dias mudam de valor; intencional e medido |
| **Link no criativo** | tabela Desempenho de Criativos | nomes viram link para a prévia no Facebook (87% de cobertura); sem vídeo, o nome fica texto puro |

### 3.4 Débito pré-existente — NÃO introduzido aqui

**10 testes falham na suíte completa da API**, todos anteriores a esta branch:

| Arquivo | Falhas | Causa |
|---|---|---|
| `schema.test.ts` | 2 | o teste espera `{instagram, conversations, mind}`, o schema tem mais três chaves (`traffic`, `youtubeAds`, `youtubeOrganic`) |
| `instagram.test.ts` | 4 | serviço externo |
| `projects.test.ts` | 3 | rotas |
| `instagram-routes.test.ts` | 1 | rotas |

A trilha do Epic 41 (321 testes) está 100% verde. Se o CI rodar a suíte inteira,
**vai falhar por dívida anterior** — decidir antes do PR se corrige ou se marca
como known-failing.

---

## 4. O que falta validar (não bloqueia o push)

### 4.1 Config do PG04 — a única pendência de dado

O stage `1744c927` (dg-pg04 · Captação Paga) **não tem linha em
`launch_report_configs`**, então o gate devolve 422.

Levantamento de prontidão feito em 2026-07-31 — **tudo o mais já está pronto**:

| | |
|---|---|
| planilha de vendas mapeada | ✅ e-mail, data, valor, produto, 4 UTMs, status |
| order bumps marcados | ✅ 7 |
| coluna "Preço" | ✅ existe |
| pesquisa vinculada | ✅ com Faixa, `utm_content`, `utm_term` |
| campanhas | ✅ 46 |
| investimento em cache | ✅ 21 dias (10/07 a 30/07) |
| conta Meta no stage | ❌ **não vinculada** — não bloqueia (lê o cache), mas o cache não se atualiza |

**Basta criar a config.** O gate libera automaticamente para `pago` +
`vendas-captacao` (`assertReportScope` passa pela combinação) — **não precisa
marcar "validado"**.

| Campo | Valor |
|---|---|
| Tipo | `pago` |
| Etapa | `vendas-captacao` |
| Entidade de captura | `vendas` |
| Início | `2026-07-10` (a §10 diz 09/07, mas **não há investimento nesse dia**) |
| Fim | `2026-07-27` |
| Imposto | herdar (12,15%) |

### 4.2 Moeda estrangeira vai rodar pela primeira vez

A planilha do PG04 tem coluna **"Moeda"** com **48 linhas não-BRL**
(USD 21, EUR 20, CAD 2, DOP 1, GBP 1, AED 1, MXN 1, CLP 1). É o **único lugar do
projeto** onde a detecção do §2.4 liga de verdade — no PG02 não há coluna de
moeda. Ao gerar o Resumão do PG04, conferir o alerta **W7** ("N linhas
convertidas"): é a primeira execução real desse código.

### 4.3 Ponta a ponta da 41.4

Os rankings por criativo, a Faixa por anúncio e o ROAS por anúncio só têm dado no
PG04. A agregação foi validada por fora do gate (A6 = 0,0000), mas o **fluxo
completo pela tela** depende da config da §4.1.

---

## 5. Decisões que divergem das stories (todas comentadas no código)

| # | Story | Decisão |
|---|---|---|
| 1 | 41.5 | O botão ficou na **aba Relatórios**, não no topo do `launch-dashboard` como a AC7 previa. A 41.1 moveu a config para aba própria; separar os dois faria validar num lugar e gerar em outro. É o padrão que o perpétuo (41.9) já segue. |
| 2 | 41.5 | `sandbox="allow-scripts"` em vez de `sandbox=""`. O Resumão tem Chart.js e sub-abas, que não rodam sem scripts. **`allow-same-origin` fica de fora** — juntas, as flags anulam o sandbox. "Nova aba" usa Blob + `revokeObjectURL`, não `document.write`. |
| 3 | 41.2 | **Loader separado do engine**, seguindo o padrão da 41.8 — a story previa um arquivo só. É o que permite conferir a §10 sem credencial. |
| 4 | 41.2 | O motor **prefere a coluna "Preço"** e ignora `columnMapping.valorBruto` quando ele aponta para "valor oferta"/"valor pago" (§2.4 proíbe). Registra a divergência no memorial. |
| 5 | 41.3 | O **A9 usa os valores do catálogo**, não recalcula dos crus — recalcular o torna uma tautologia. Ver §7 abaixo. |
| 6 | 41.6 | O seletor pede o **lançamento anterior** (lado A), com a etapa atual no B. A direção da decomposição é anterior → atual, a mesma da §10. |

---

## 6. Contradições da spec, resolvidas e registradas

| Onde | Contradição | Decisão |
|---|---|---|
| §2.4 vs §8.2 | §2.4 manda **bloquear** coluna de preço contaminada; §8.2 e a Story 41.3 tratam como **W4, alerta não-bloqueante** | seguimos a 41.3; `launch-report-sales-value.ts` só expõe a contagem |
| §10 vs config | §10 diz que o PG02 vai até **11/05**; a config em produção diz **09/05** | o dono do produto decidiu **09/05**. Há atividade real em 10–11/05 (**33 vendas, R$ 3.267,00**), então o Resumão do PG02 **não reproduz a §10** — para comparar, usar 11/05 |
| §12.3 | CTR: a Story 18.59 fixou `link_click` para a tabela de Criativos | a **§10 usa cliques totais** — conferido aritmeticamente. O fix da 18.59 não se aplica a este cálculo |

---

## 7. Bugs pegos por teste durante a implementação

Todos no código escrito nesta sessão, corrigidos antes do commit:

1. **Order bump zerava o faturamento pago.** Comprador com captação (`utm_source=meta`) e order bump (sem UTM) **no mesmo dia**: o OB sobrescrevia a atribuição e o comprador virava "Sem Track". O §2.9 diz que order bumps **herdam** a atribuição — são receptores, nunca definidores.
2. **A9 era uma tautologia.** Calculado a partir dos crus, `(1000/CPM)×CTR×conv×ticket` sempre dá `fat/INV = roas_pago`, para qualquer entrada. Nunca falharia. Passou a usar os valores do catálogo.
3. **`moda` propagava ruído de float.** `0.1+0.2` virava `0.30000000000000004` dentro do faturamento.
4. **Ordem do §4 quebrada.** O "Orgânico" caía **depois** do Total na seção 2 do Resumão.
5. **`previewUrl` nunca chegava na tela.** O campo não era propagado por `calculateCreativeMetrics`, e a tabela renderiza o calculado, não o cru.
6. **Direção do Comparativo invertida.** Corrigido após teste na tela (ver §5.6).

**Propriedade registrada em teste:** o **peso da decomposição é invariante à
inversão** de A/B — `ln(1/r)/Σln(1/r) = ln(r)/Σln(r)`, porque numerador e
denominador trocam de sinal juntos. Quem inverte é o efeito e a direção. É o
motivo de `direcao` ser campo próprio com coluna própria na tabela.

---

## 8. Achados de infraestrutura

- **`meta_ad_insights_daily` do projeto DG começa em 2026-05-20.** O PG02 rodou até 09/05 → **nunca terá ad-level**. Para ele, a reconciliação campaign×ad é sempre pulada, o **W1 nunca dispara** e o **A6 fica `skipped` permanentemente**. Não há backfill possível — a Meta não retém ad-level indefinidamente.
- **O `video_id` já estava no banco** (`meta_ad_creatives_cache`: 1.032 criativos do DG, 672 com vídeo). O link de prévia não precisou de chamada nova à Meta.
- **Vitest está instalado** no pacote `api` (v4.1.0). A Dev Note da 41.3 dizia o contrário e mandava usar `node --strip-types`.
- **"Campanhas" na §10 significa campanhas com investimento no período**, não campanhas vinculadas ao stage (33 de 34 no PG02, 33 de 46 no PG04).

---

## 9. Arquivos principais do Epic 41

**Backend** (`packages/api/src/`)

```
services/launch-report-normalize.ts     §2.1/§2.2/§2.6/§2.7 — funções puras
services/launch-report-sales-value.ts   §2.4 — coluna de preço, moeda estrangeira
services/launch-report-engine.ts        pipeline §2 + catálogo §3 (puro)
services/launch-report-loader.ts        I/O — as 4 fontes do §1
services/launch-report-guards.ts        §8 — A1–A9, W1–W8, conferência externa
services/launch-report-ads.ts           §3.8/§7.2 — destaques por anúncio
services/launch-report-narrative.ts     §6 — verbo derivado, formatação BR, escape
services/launch-report-render.ts        §4/§5/§7.4 — Resumão e Comparativo
services/launch-report-compare.ts       §7.3 — decomposição, cenários, deltas
services/launch-report-config.ts        §1.5/§1.6/§12 — config e gate (41.1)
routes/launch-reports.ts                §9.1 e §9.2
db/migrations/0089_launch_reports.sql
```

**Frontend** (`packages/web/`)

```
lib/hooks/use-launch-reports.ts
lib/hooks/use-launch-report-config.ts
components/funnels/launch-report-button.tsx
components/funnels/launch-comparativo-button.tsx
components/funnels/launch-report-config-section.tsx
```

**Fora do Epic 41, na mesma branch**

```
services/survey-aggregation.ts               fix: linha em branco não é respondente
routes/stage-creative-performance.ts         previewUrl por ad_id de maior spend
components/funnels/stage-creative-performance-table.tsx
lib/utils/creative-metrics-calculator.ts
lib/hooks/useStageCreativePerformance.ts
```

**Documentação**

```
docs/specs/epic-41-valores-conferencia.md    §10 + resultados de todas as conferências
docs/specs/epic-41-complemento-perpetuo.md   §C (sessão anterior)
```

---

## 10. Próximas stories do epic

Nenhuma. As 9 stories estão implementadas. O que resta é **QA gate** (@qa) e
**push/PR/deploy** (@devops).

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-07-31 | @dev (Dex) | Handoff consolidado da sessão: 41.2–41.6 implementadas e conferidas, fix da pesquisa, link de prévia no criativo, inversão da direção do Comparativo. Substitui o handoff de 29/07. |
