# EPIC 48 — Painel de Planejamento: simulador de cenários do lançamento

**Status:** **As cinco stories na `main`** (48.2 #902, 48.1 #904, 48.3 #911, 48.4 #912, 48.5 #915); migrations 0152–0155 em produção; contrato **v17**; as quatro abas do simulador no ar em 2026-09-22 · S1 ✓ e S2 ✓ (evidência abaixo) · **S3 e S4 abertos** — dependem do próximo lançamento (Danilo) · P1 ✅ (Lucas, com condição, respeitada nas cinco PRs) · P2 ✅ (@pm)
**Origem:** planilha "Painel de Controle" do lançamento, categoria **Planejamento** (Google Sheets), que será **desativada por completo**. Toda a lógica dela foi lida e documentada em três artefatos guardados verbatim em `docs/specs/epic-48/`:
- `especificacao_tecnica_painel_planejamento.md` — a **spec**: 8 abas, fórmulas literais, mapa de campos, casos de teste mascarados (apêndice A)
- `classificacao_regras_painel_planejamento.md` — a **triagem**: 40 regras de negócio (RN), 11 artefatos descartados (AR), 31 dúvidas (DV); os IDs são estáveis e toda AC deste epic rastreia para um RN
- `mapa_sistema_loyola_passagem1.md` — inventário do sistema em `bb1608b6` (passagem 1: sem comparação com a spec — a passagem 2 é feita story a story, no Dev Notes)
**Owner:** @sm (stories, por delegação do pedido do Danilo em 2026-09-21) → @po (validação) → @dev (implementação) → @qa (gate)
**Criado:** 2026-09-21 pelo @sm (River). ⚠️ Estrutura de epic é atribuição do @pm (Morgan) — este documento foi criado junto com a primeira story para **reservar o número 48** (censo em `origin/main` + branches: livre) e para não perder as 14 decisões abaixo; o @pm valida ou reescreve a estrutura na primeira leitura.
**Onde na UI:** funil de **lançamento** (`funnel_type = launch`) → **sub-página** `…/funnels/[funnelId]/planejamento` com cartão de entrada na página do funil e quatro abas `?tab=` (inputs · organicos · pagos · resumo) — decisões do Danilo em 2026-09-21 ("um simulador por funil de lançamento"; PO-02 da 48.1: sub-página, porque a página do funil não tem abas)

---

## Objetivo do epic

Desligar a planilha "Painel de Controle · Planejamento" sem perder a capacidade que ela dá ao time: **dimensionar, por lançamento, quantos leads captar e a que CPL máximo para bater a meta de margem** — com as mesmas regras, seis erros a menos e o dado no mesmo lugar onde já vivem o funil, as etapas e a captação.

## Critérios de sucesso (mensuráveis — o @po confere no fechamento do epic)

| # | Critério | Como medir |
|---|---|---|
| S1 | **Cobertura das regras:** cada RN das abas 1–4 (RN-001…031, 037…040) tem pelo menos um AC numa story 48.x que a cita pelo ID. | Grep dos IDs nas cinco stories; nenhum RN dessas abas sem AC. **✓ 2026-09-22 (@devops, no fechamento):** grep de `RN-001…031, 037…040` nas cinco stories — os 35 IDs citados (mínimo 1, máximo 12 ocorrências); nenhum ausente. |
| S2 | **Fidelidade à spec:** os casos mascarados (§1.4, §2.4, §3.4, §4.4, apêndice A) reproduzem nos testes — no bruto com tolerância relativa `1e-6`; as únicas divergências são as seis correções de DV, cada uma com teste `não reproduz DV-xxx`. | Suíte verde; o teste diferencial falha quando a fórmula da planilha volta. **✓ 2026-09-22:** §1.4 (48.1), §2.4 (48.2/48.3), §3.4 (48.2/48.4), §4.4 (48.5) nas suítes da API; diferenciais `não reproduz DV-001/004/006/007/008/010/013/014/015` e a regra D10 provados por mutação em cada gate (registrados nos Dev Agent Records e nos gates). Tolerância: `max(1e-6·|b|, meia unidade da casa da spec)` — a spec está em 2 casas (PO-04 da 48.3). |
| S3 | **Prova com dados reais (o que os dados mascarados não provam):** os inputs do **próximo lançamento** entram no sistema e na planilha; cada número diferente entre os dois é explicado por uma das seis DV corrigidas ou pelo arredondamento D10 — nenhuma diferença sem explicação. | Sessão de conferência Danilo + @qa, registrada no epic. `[FALTA]`: qual lançamento. |
| S4 | **Planilha desligada:** o time planeja um lançamento inteiro (abas 1–4) só no sistema. | Declaração do Danilo no Change Log. |

## O que é

A planilha recebe metas e custos (aba 1), gera dez cenários de receita por canal orgânico (aba 2) e por fonte paga (aba 3), deixa a equipe escolher uma combinação de cenários e um nível de conversão por canal/fonte, e compara a margem resultante com a meta (aba 4). É o instrumento com que o time dimensiona **quantos leads precisa captar, a que CPL máximo, para bater a meta de margem** de um lançamento.

Este epic põe isso dentro do Loyola X, ligado ao funil de lançamento:

1. **Inputs financeiros** (aba 1) — custos variáveis, meta de margem, divisão pagos/orgânicos, investimento por plataforma e público, metas por canal — 48.1
2. **Motor de cenários** (abas 2 e 3, a parte pura) — série de receita, escada de conversão, vendas, leads, CPL máximo, faixas — 48.2, módulo puro no `shared`, testado contra o apêndice A da spec
3. **Leads orgânicos** (aba 2, seleção e resumo) — 48.3
4. **Leads pagos** (aba 3, seleção e resumo) — 48.4
5. **Resumo final** (aba 4) — 48.5

## O que este epic NÃO é

- **Cronograma, Cronograma (Timeline), Desafios e aprendizados, Variáveis** (abas 5–8; RN-032…036; DV-018…023, 027…030) ficam **fora** — decisão do Danilo em 2026-09-21 ("só o simulador agora"). Quando entrarem, a passagem 2 do mapa aponta candidatos a extensão em vez de reconstrução: Cronograma → **M25 Planner** (`planner_campaigns.phases` são as "Barras Macro"), Desafios → **M24 Debriefings**, Variáveis → integrações já existentes (M05 Sheets, M20 Drive, M25 Google Calendar). Epic separado.
- Não lê dados reais de captação (leads, spend da Meta, vendas da planilha) para preencher o simulador. É planejamento, entrada manual, como na planilha. Cruzar realizado × planejado é extensão natural — **não foi pedido** (Constituição, Art. IV).
- Não reproduz os 11 artefatos descartados (AR-001…011: células espelho, barra em caracteres "█", legendas em texto, verificações identicamente 100 %, re-somas). O que eles mostravam continua existindo como dado ou como componente de UI.

## Pré-condições — ⛔ bloqueiam o `*develop` da 48.1 (P1 resolvida; restam P2 e P3)

| # | O quê | Quem |
|---|---|---|
| ~~P1~~ ✅ | **Autorização de escopo — resolvida em 2026-09-21: Lucas autorizou (informado pelo Danilo), com a condição, nas palavras do Danilo: "desde que não mexa em nada que ele já implementou".** Commits do epic levam `[scope-override]`. **Leitura operacional da condição (a confirmar com o Lucas na primeira PR de código):** (a) o epic só **adiciona** — tabelas `plan_*` novas, rotas novas em arquivos novos, módulos novos no `shared`, componentes novos; (b) nos arquivos de registro compartilhados (`schema.ts`, `app.ts`, `shared/src/index.ts`, navegação do funil) entram **só linhas novas** (declaração/registro/export), sem alterar linha existente; (c) nenhum arquivo de feature de autoria do Lucas é editado — o @dev confere `git log --format=%an -- <arquivo>` antes de tocar qualquer arquivo e lista na PR os que têm autoria dele, com o diff restrito ao item (b). Contexto original: o autor do pedido (`danilo@bonsaitrafegopago.com.br`) tem `scope: restricted` em `docs/team/members.md` e o epic toca `packages/api/src/db/schema.ts`, `app.ts`, rotas, `packages/shared/src` e telas do funil. Precedente: Epic 47 P2. | Lucas ✅ |
| P2 | **@pm valida esta estrutura** (ou reescreve) e confirma o número 48. | @pm |
| P3 | **@po valida a 48.1 e a 48.2** (10 pontos). As leituras do @sm em D3, D10 e na AC13 da 48.1 já foram confirmadas pelo Danilo (2026-09-21). | @po |

## Decisões do Danilo (2026-09-21) — as 14 DV que decidem AC

Respondidas nesta ordem, uma a uma. "Reproduz" = faz como a planilha; "corrige" = a planilha estava errada. Cada correção vira AC com o texto "não reproduz DV-xxx", para o gate acusar regressão.

| # | DV | Decisão | Efeito nas stories |
|---|---|---|---|
| D1 | DV-003 — constante 70 % do cenário 1 | **C — parametrizável por canal/fonte.** Valor inicial 70 % (o da planilha). | 48.2: `fracao_cenario_1` por bloco; 48.3/48.4: campo editável por canal/fonte |
| D2 | DV-004 — passo da escada de conversão | **A — reproduz:** pontos percentuais fixos; campo "25 %" reduz 0,25 p.p. por nível (÷100). | 48.2 |
| D3 | DV-007 — zero, vazio, negativo | **A — regra única para orgânicos e pagos:** entrada bloqueada (`ticket > 0`, `conversão ≥ 0`, percentuais em `[0, 1]`) e **"—"** onde não há base (denominador zero). ✅ Confirmado pelo Danilo em 2026-09-21: a escada de conversão **trava em zero** nas duas abas (era só na de orgânicos), e um nível em zero produz leads e CPL "—". | 48.1, 48.2, 48.3, 48.4 |
| D4 | DV-010 — blocos frios lendo a variação do bloco quente | **A — corrige:** cada bloco usa os próprios campos (`F36`, `F85`, `F86` passam a ser lidos). | 48.2, 48.4 |
| D5 | DV-001 — Google frio ÷ margem-alvo dos orgânicos | **A — corrige:** as quatro fontes pagas dividem pela margem-alvo dos **pagos** (`F18`). | 48.1 |
| D6 | DV-002 — meta de margem por fonte reusa os % do investimento | **A — reproduz:** é decisão (meta proporcional à verba). | 48.1 |
| D7 | DV-006 — Área de Membros, cenário 3 ÷ célula vazia | **A — corrige:** divide pelo ticket como os outros nove. | 48.2 (o motor não tem a anomalia) |
| D8 | DV-014 — combinações 2–5 do Meta frio leem o bloco quente | **A — corrige:** as cinco combinações leem o bloco Meta frio com o cenário do Meta frio. | 48.4 |
| D9 | DV-015 — Resumo Final, vendas Google só quente | **A — corrige:** quente + frio, como o Meta. | 48.5 |
| D10 | DV-026 — vendas e leads fracionários | **B — arredonda para cima antes de calcular:** `vendas = ⌈receita ÷ ticket⌉`, `leads = ⌈vendas ÷ conversão⌉`; conversão efetiva e CPL usam os inteiros. ✅ Confirmado pelo Danilo em 2026-09-21: os valores esperados do apêndice A valem para a **série de receita** e para a **escada** (que não arredondam); vendas/leads/CPL do apêndice são fracionários e servem só para conferir o passo **antes** do arredondamento. | 48.2 (testes em dois estágios) |
| D11 | DV-005 — multiplicadores 2,5 e 5 das faixas | **A — fixos.** | 48.2 |
| D12 | DV-008 — caixas do nível de conversão | **A — exatamente uma por bloco, obrigatória (radio); sem marcação, os derivados mostram "—"** (nunca erro em cascata). | 48.3, 48.4 |
| D13 | DV-013 — "Vendas Totais Leads Pagos" só quentes | **A — corrige:** soma os quatro públicos. | 48.4 |
| D14 | DV-009 — verba de remarketing | **A — informativa:** calculada e mostrada, não entra em conta nenhuma. | 48.4 |
| D15 | DEV-01 (48.3/48.4/48.5) — salvar as abas 2–4 antes dos Inputs Financeiros | **Manter o 409** (confirmado pelo Danilo em 2026-09-22): sem inputs não há meta nem verba; a tela desabilita o Salvar e leva para a aba 1. Criar o simulador às escondidas quebraria o critério da PO-03 ("Salvo em…" para formulário vazio). | 48.3, 48.4, 48.5 |
| D16 | DEV-03 (48.4) — complementos da aba 1 com ruído de ponto flutuante | **Corrigir por subtração** (Danilo, 2026-09-22): os sete complementos viram `total − parte`, como `dividirVerba` da 48.2. | 48.6 |
| D17 | Canal orgânico "Telegram" | **Vira Manychat** (Danilo, 2026-09-22): o classificador do sistema (`classifyCanal`) tem ManyChat e **não tem Telegram**, e a Análise de origem já mede ManyChat (51,42 % no `dg-pg04`). A spec da planilha continua dizendo Telegram — a divergência é decisão de produto. | 48.10 |
| D18 | Como preencher um lançamento novo | **Duas camadas** (Danilo, 2026-09-22): **A** = valores do simulador de um lançamento anterior do mesmo expert e tipo, entre parênteses no rótulo (48.9, feita); **B** = valores *realizados* medidos pelo sistema (48.11, a fazer). Google: hoje 100 % Meta **é verdade** — nenhum lançamento usou Google. | 48.9, 48.11 |

**DV de apresentação:** DV-011 (legendas intermediárias de CPL — AR-004, descartadas), DV-024 (unidades: as stories usam a **do conteúdo**), DV-025 (rótulos "Google Ads", 48.4). **Decididas pelo Danilo em 2026-09-21:** **DV-012 = B** — cores das faixas de CPL no mesmo sentido dos leads (1 azul … 4 vermelho; não reproduz a inversão da planilha); **DV-016 = A** — atingimento verde ≥ 100 %, vermelho ≤ 70 %, neutro no meio (reproduz). **DV-017 = A** (Danilo, 2026-09-22) — rótulos META PISO/BOA/SUPER são **anotação por cenário**, persistida, sem regra ligada (48.5).

## Decisões de estrutura tomadas na criação (para o @pm/@po revisar)

| ID | Decisão | Por quê |
|---|---|---|
| **E1** | **Um simulador por funil `launch`**, 1:1, criado sob demanda ao abrir a aba. | Decisão do Danilo. A planilha é um "Painel de Controle" por lançamento (`ID = PRODUTO-ÍNDICE-ANO-MÊS`, DV-028); no sistema, o lançamento é o funil `launch` (mapa §3.5, M03). |
| **E2** | **Prefixo `plan_`** para as tabelas novas (`plan_simulator`, `plan_organic_channel`, `plan_paid_source`, …). | Convenção do repo: prefixo por domínio (`stage_*`, `planner_*`, `naming_*`, mapa §8.1). `planner_*` já é o Calendário (M25) — outro domínio. |
| **E3** | **Taxonomia fixa** (RN-040): seis canais orgânicos (WhatsApp, Email, Instagram, Telegram, YouTube, Área de Membros — nesta ordem) e quatro fontes pagas (Meta quente, Meta frio, Google quente, Google frio) como **enums/constantes no `shared`**, não como cadastro. | É o que a planilha tem; nada no pedido pede canal configurável (Art. IV). Virar cadastro depois é migração aditiva. |
| **E4** | **A regra mora em módulos folha do `shared`** (`packages/shared/src/planejamento-inputs-financeiros.ts` na 48.1, `planejamento-cenarios.ts` na 48.2, e os das stories seguintes), sem imports, importados por valor pelo web (subpath) e pela API (bare). Rota e tela **não calculam**. *(@pm 2026-09-21: nome corrigido para bater com as stories.)* | Convenção documentada (`shared/src/index.ts:8-29`; mapa §8.2 item 1). É o que permite o teste contra o apêndice A rodar sem banco e o mesmo número aparecer na tela e na API pública, se um dia ela expuser. |
| **E5** | **Recálculo sob demanda, no cliente**, a partir dos inputs persistidos; o banco guarda **só entradas** (o que a planilha marca ✏️), nunca derivados. | A spec (§ "Ordem de cálculo") diz que tudo depende de `'1'!F16` e `G3:G8`; persistir derivados cria o problema clássico de cache desatualizado. Grafo acíclico, milhares de células — trivial em JS. |
| **E6** | **Números:** percentuais e taxas como **fração decimal** (`0.25`), moeda em **centavos inteiros** ou `NUMERIC(18,2)`, contagens (bases) inteiras. | Spec § "Convenções" sugere `NUMERIC(12,6)`/`NUMERIC(18,2)`; centavos evitam a soma `0.10+0.20+0.70 ≠ 1` que a própria spec alerta (§1.4). O @data-engineer decide o tipo físico. |

## Stories

| Story | Título | RN cobertas | Depende de | Status |
|---|---|---|---|---|
| 48.1 | Inputs Financeiros — modelo, API e tela (aba 1) | RN-001…009, 037, 040 | P1 ✅, P2 ✅ | **Done** — gate PASS (re-gate) 2026-09-21; **MERGED #904** (`dafdb12e`); 0152 em produção; sub-página `…/planejamento` + cartão (PO-02); custos > 100 % reproduz o negativo (PO-04); Alta / L (8–13) |
| 48.2 | Motor de cenários no `shared` (abas 2 e 3, parte pura) | RN-010…015, 024…026 | — (só testes) | **Done** — gate PASS (re-gate) 2026-09-21; **MERGED #902** (`5f83e4c6`); Alta, M (5–8) |
| 48.3 | Leads orgânicos — parâmetros por canal, seleção, combinações e resumo (aba 2) — `48.3.planejamento-leads-organicos.md` | RN-010…023 (via 48.2), 038, 039 | 48.1 ✅, 48.2 ✅ | **Done** — gate PASS (re-gate) 2026-09-22; **MERGED #911** (`d89305a7`); 0153 em produção; Alta / L (8–13) |
| 48.4 | Leads pagos — parâmetros por fonte, seleção, combinações, tráfego e resumo (aba 3) — `48.4.planejamento-leads-pagos.md` | RN-016…022, 024…029, 038, 039 | 48.1 ✅, 48.2 ✅ | **Done** — gate PASS (re-gate) 2026-09-22; **MERGED #912** (`73579498`); 0154 em produção; Alta / L (8–13) |
| 48.5 | Resumo Final — cinco cenários consolidando orgânicos e pagos, meta total e rótulos (aba 4) — `48.5.planejamento-resumo-final.md` | RN-030, 031 (+ 017…020, 022, 027, 029 consolidadas) | 48.3 ✅, 48.4 ✅ | **Done** — gate PASS (re-gate) 2026-09-22; **MERGED #915** (`649bf0a9`); 0155 em produção; DV-017 = A; Alta / M (5–8) |
| 48.6 | Complementos da aba 1 por subtração (fix de DEV-03) — `48.6.planejamento-complementos-por-subtracao.md` | RN-002, 006, 007 (exatidão) | 48.1 ✅ | **Done** — gate PASS (re-gate) 2026-09-22; **MERGED #917** (`d09a4a1f`); sem migration; Média / XS (1–2) |
| 48.14 | Várias bases de referência lado a lado + investimento real quente/frio em R$ — `48.14.planejamento-varias-bases-lado-a-lado.md` | — (camada B, D18) | 48.9 ✅, 48.11 ✅, 48.13 ✅ | **Draft** 2026-10-01 — Alta / M (5–8), estimativa do @sm por delegação do Danilo |
| 48.15 | Margem de contribuição realizada das bases (total, pagos, por canal orgânico) — `48.15.planejamento-margem-realizada.md` | — (camada B, D18) | 48.14 | **Draft** 2026-10-01 — bloqueada por F1–F5; Alta / L (8–13), estimativa do @sm por delegação do Danilo |

Pontos e prioridade: estimados pelo @po na validação e confirmados pelo Danilo — 48.2: Alta, M (5–8); 48.1: Alta, L (8–13) proposta; 48.3 e 48.4: Alta, L (8–13); 48.5: Alta, M (5–8).

## Ordem de execução, executores e gates (@pm, 2026-09-21)

Cinco stories é mais do que o molde de epic brownfield (1–3) prevê; o que substitui o processo completo de PRD/arquitetura aqui é (a) a spec já existir com casos de teste, (b) o epic ser **só aditivo** (P1) e (c) a regra ficar em módulos puros testados antes de qualquer tela. Por isso a ordem abaixo — a parte sem risco de integração sai primeiro.

| Wave | Story | Executor | Quality gate | Pode rodar em paralelo com | Observação |
|---|---|---|---|---|---|
| 1 | **48.2** motor de cenários | @dev | @qa (gate) | 48.1 | Só `shared` + testes. Começa antes de qualquer decisão de tela. |
| 1 | **48.1** inputs financeiros | @dev; **T1 (schema `plan_*`) com @data-engineer** | @qa (gate); **@architect revisou AC1/T1 em 2026-09-21 ✅** (A1–A7 na story) | 48.2 ✅ | A 48.2 foi a primeira PR de código (#902); a leitura de P1 (só adição) está aplicada lá. |
| 2 | **48.3** orgânicos | @dev | @qa | 48.4 | Consome 48.1 + 48.2. |
| 2 | **48.4** pagos | @dev | @qa | 48.3 | Idem; carrega as correções D8, D13, D14. |
| 3 | **48.5** resumo final | @dev | @qa | — | Carrega D9; fecha S1–S3. |

Regra do repo mantida: executor ≠ quality gate em todas as linhas.

## Riscos (@pm, 2026-09-21)

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | A condição do Lucas ("não mexer no que ele implementou") for lida de forma mais estrita que a leitura operacional de P1 — nem registrar em `app.ts`/`schema.ts`. | média | alto: trava a 48.1 | Confirmar na **primeira PR de código** (48.2 ou 48.1); plano B: outro membro `full` faz as linhas de registro. |
| R2 | Os seis números corrigidos (D4, D5, D7, D8, D9, D13) **divergem da planilha** que o time ainda conhece — alguém lê como bug do sistema. | alta | médio | Cada correção tem AC "não reproduz DV-xxx" e a tela mostra memorial (E5/AC10 da 48.2 expõem o bruto); S3 explica diferença a diferença. Comunicar ao time **antes** do primeiro uso. |
| R3 | D10 (arredondar para cima) muda CPL máximo e leads em relação à planilha em **todo** cenário, não só nos corrigidos. | alta | médio | Mesmo tratamento de R2; o bruto fica visível no memorial. |
| R4 | Ponto flutuante na soma de percentuais (spec §1.4) — "falta distribuir 0 %". | média | baixo | AC10 da 48.1 fixa o comportamento; E6 sugere inteiros. |
| R5 | Sem passagem 2 do mapa, a aba Planejamento nasce fora do padrão de navegação do funil (Epic 46). | média | médio | @architect revisa AC1/AC14 da 48.1 antes do `*develop` (tabela acima). |
| R6 | Os dados mascarados provam a fórmula, não o uso: só o lançamento real prova que a planilha pode ser desligada. | — | alto | S3 é critério de sucesso, não opcional. |

## Fora do epic — registrado para o roadmap

- **Epic futuro: Cronograma + Desafios + Variáveis** (abas 5–8) — estender Planner (M25) e Debriefings (M24), não reconstruir; depende da passagem 2 do mapa e das DV-018…023, 027…030.
- **Extensão natural (não pedida):** cruzar planejado × realizado (leads e spend da captação paga, vendas da planilha) dentro da mesma aba. Só depois de S4.

## Change Log

| Data | Agente | Mudança |
|---|---|---|
| 2026-09-21 | @sm (River) | Epic criado para reservar o nº 48 e registrar as 14 decisões do Danilo; 48.1 e 48.2 rascunhadas; docs copiados para `docs/specs/epic-48/` |
| 2026-09-21 | @sm (River) | Danilo confirmou as três leituras do @sm: D3 (escada trava em zero nos pagos), D10 (apêndice A valida o bruto), 48.1 AC13 (permissão = a do funil) |
| 2026-09-21 | @devops (Gage) | P1 resolvida: Lucas autorizou o escopo (via Danilo) com a condição "não mexer em nada que ele já implementou"; leitura operacional registrada para confirmação na primeira PR de código |
| 2026-09-21 | @po (Pax) | 48.2 validada: GO 10/10, Ready; estimativa Alta / M (5–8) confirmada pelo Danilo |
| 2026-09-21 | @po (Pax) | 48.1 validada: GO condicional 8/10; rota escopada por projeto (PO-01); decisões pendentes do Danilo: onde a tela vive (PO-02) e custos > 100 % (PO-04); estimativa Alta / L (8–13) proposta |
| 2026-09-21 | @po (Pax) | Danilo decidiu PO-02 (sub-página + cartão) e PO-04 (B); 48.1 **Ready**, GO 9/10 |
| 2026-09-21 | @dev/@qa/@devops | 48.2 implementada, gate PASS (após CONCERNS corrigido), **MERGED #902** (`5f83e4c6`) |
| 2026-09-21 | @architect (Aria) | Revisão de AC1/T1 da 48.1 feita (A1–A7); 48.1 liberada para `*develop` |
| 2026-09-21 | @dev/@qa/@devops | 48.1 implementada, gate PASS (após FAIL corrigido), **MERGED #904** (`dafdb12e`); migration 0152 aplicada em produção antes do merge; contrato 14. **Wave 1 completa.** |
| 2026-09-21 | @sm (River) | 48.3 e 48.4 rascunhadas (wave 2). Tabelas-filhas nomeadas por tipo (`plan_organic_*`, `plan_paid_*`) em vez do `plan_blocks` genérico da nota A3 da 48.1 — mesma intenção, sem arquivo em comum entre as duas stories |
| 2026-09-21 | @sm (River) | Danilo decidiu DV-016 = A e DV-012 = B; 48.3 e 48.4 sem `[FALTA]` bloqueante |
| 2026-09-21 | @po (Pax) | 48.3 e 48.4 validadas: GO 9/10, Ready; achado comum: chaves de canal/fonte diferem entre os módulos da 48.1 e da 48.2 → mapeamento testado; estimativas Alta / L propostas |
| 2026-09-21 | @po (Pax) | Danilo confirmou Alta / L (8–13) para 48.3 e 48.4 → 10/10 |
| 2026-09-22 | @devops (Gage) | Wave 2 na `main`: 48.3 #911 (`d89305a7`, 0153 em produção) e 48.4 #912 (`73579498`, 0154 em produção); contrato v16. DEV-01 (409 sem inputs nas abas 2/3) e DEV-03 (verba do Meta frio `7 999,999…` na 48.1) registrados para o @po |
| 2026-09-22 | @sm (River) | 48.5 rascunhada (wave 3): consolidação pura sobre `combinacaoOrganica`/`combinacaoPaga`, D9 aplicado, §4.4 separado em reproduz/recalcula (valores conferidos com o motor); **DV-017 = A** decidido pelo Danilo → `plan_final_scenarios` + rota `…/planejamento/resumo` (contrato 17). Três `[FALTA]` para o @po |
| 2026-09-22 | @devops (Gage) | 48.6 MERGED #917 (`d09a4a1f`) — complementos exatos; **seis stories do epic na `main`**. Falta: deploy da API pelo Danilo, validação visual das quatro abas, S3 e S4 |
| 2026-09-22 | @sm + @dev + @qa | Pós-fechamento: 48.8 padrão dos custos (#924), 48.9 base de referência (#925, contrato 18), 48.10 Telegram → Manychat (migration 0156, **a aplicar junto do deploy**). Decisões D17 e D18 registradas |
| 2026-09-22 | @po (Pax) | Danilo decidiu DEV-01 (manter o 409 — D15) e DEV-03 (corrigir por subtração — D16); story 48.6 (fix XS) criada e validada. Validação visual das quatro abas fica para depois do deploy |
| 2026-09-22 | @devops (Gage) | **Epic fechado no código:** 48.5 MERGED #915 (`649bf0a9`), 0155 em produção, contrato v17 — as quatro abas do simulador no ar. S1 ✓ (grep dos 35 RN) e S2 ✓ (suítes + diferenciais); S3 (conferência com dados reais do próximo lançamento) e S4 (planilha desligada) ficam com o Danilo. Pendências: validação visual das quatro abas; DEV-01 (409 sem Inputs, abas 2–4) e DEV-03 (verba do Meta frio na 48.1) para o @po; lint da `main` (`sendflow.ts:39`, herdado) |
| 2026-09-22 | @po (Pax) | Danilo confirmou Alta / M (5–8) para a 48.5 → 10/10 |
| 2026-09-22 | @po (Pax) | 48.5 validada: GO 9/10, Ready; PO-01 (cadeia do produto com igualdade exata — a conversão total difere da bruta em 1,2e-7), PO-02 (S4 é do epic), PO-03 (tráfego repetido, linhas abertas), PO-04 (callback da página); estimativa Alta / M proposta |
| 2026-10-01 | @sm (River) | Pedido do Danilo para o `dg-pg05`: causa do "sem histórico" = nome `dgpg05-out-26` sem hífen (decisão: renomear no app, sem story); **48.14** (várias bases lado a lado + quente/frio em R$) e **48.15** (margem realizada, F1–F5 abertas) rascunhadas |
| 2026-09-21 | @pm (Morgan) | **P2 ✅ — estrutura validada.** Acrescentados objetivo, critérios de sucesso S1–S4, ordem de execução em 3 waves com executor/gate por story, riscos R1–R6, roadmap do que ficou fora; E4 corrigido (nomes dos módulos = os das stories). Número 48 confirmado na `main` (#898). |

<!-- clickup:17tqamemnem -->
