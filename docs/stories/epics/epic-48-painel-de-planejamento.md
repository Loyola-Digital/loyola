# EPIC 48 — Painel de Planejamento: simulador de cenários do lançamento

**Status:** Draft — stories 48.1 e 48.2 rascunhadas em 2026-09-21; 48.3–48.5 a rascunhar após validação das duas primeiras
**Origem:** planilha "Painel de Controle" do lançamento, categoria **Planejamento** (Google Sheets), que será **desativada por completo**. Toda a lógica dela foi lida e documentada em três artefatos guardados verbatim em `docs/specs/epic-48/`:
- `especificacao_tecnica_painel_planejamento.md` — a **spec**: 8 abas, fórmulas literais, mapa de campos, casos de teste mascarados (apêndice A)
- `classificacao_regras_painel_planejamento.md` — a **triagem**: 40 regras de negócio (RN), 11 artefatos descartados (AR), 31 dúvidas (DV); os IDs são estáveis e toda AC deste epic rastreia para um RN
- `mapa_sistema_loyola_passagem1.md` — inventário do sistema em `bb1608b6` (passagem 1: sem comparação com a spec — a passagem 2 é feita story a story, no Dev Notes)
**Owner:** @sm (stories, por delegação do pedido do Danilo em 2026-09-21) → @po (validação) → @dev (implementação) → @qa (gate)
**Criado:** 2026-09-21 pelo @sm (River). ⚠️ Estrutura de epic é atribuição do @pm (Morgan) — este documento foi criado junto com a primeira story para **reservar o número 48** (censo em `origin/main` + branches: livre) e para não perder as 14 decisões abaixo; o @pm valida ou reescreve a estrutura na primeira leitura.
**Onde na UI:** funil de **lançamento** (`funnel_type = launch`) → aba nova **Planejamento** ao lado das etapas — decisão do Danilo em 2026-09-21 ("um simulador por funil de lançamento")

---

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

**DV de apresentação (não bloqueiam; entram nas stories como `[FALTA]` para o @po/UX):** DV-011 (texto das legendas intermediárias de CPL — legendas são AR-004, descartadas; a faixa vira cor/rótulo de componente), DV-012 (sentido das cores das faixas de CPL — invertido em relação a leads na planilha), DV-016 (limiar 70 % da sinalização de atingimento), DV-017 (rótulos META PISO/BOA/SUPER), DV-024 (unidades declaradas ≠ conteúdo — as stories usam a unidade **do conteúdo**: fração → %, base → contagem), DV-025 (rótulos "Meta Ads" nas linhas do Google).

## Decisões de estrutura tomadas na criação (para o @pm/@po revisar)

| ID | Decisão | Por quê |
|---|---|---|
| **E1** | **Um simulador por funil `launch`**, 1:1, criado sob demanda ao abrir a aba. | Decisão do Danilo. A planilha é um "Painel de Controle" por lançamento (`ID = PRODUTO-ÍNDICE-ANO-MÊS`, DV-028); no sistema, o lançamento é o funil `launch` (mapa §3.5, M03). |
| **E2** | **Prefixo `plan_`** para as tabelas novas (`plan_simulator`, `plan_organic_channel`, `plan_paid_source`, …). | Convenção do repo: prefixo por domínio (`stage_*`, `planner_*`, `naming_*`, mapa §8.1). `planner_*` já é o Calendário (M25) — outro domínio. |
| **E3** | **Taxonomia fixa** (RN-040): seis canais orgânicos (WhatsApp, Email, Instagram, Telegram, YouTube, Área de Membros — nesta ordem) e quatro fontes pagas (Meta quente, Meta frio, Google quente, Google frio) como **enums/constantes no `shared`**, não como cadastro. | É o que a planilha tem; nada no pedido pede canal configurável (Art. IV). Virar cadastro depois é migração aditiva. |
| **E4** | **A regra mora num módulo folha do `shared`** (`packages/shared/src/simulador-de-cenarios.ts`), sem imports, importado por valor pelo web (subpath) e pela API (bare). Rota e tela **não calculam**. | Convenção documentada (`shared/src/index.ts:8-29`; mapa §8.2 item 1). É o que permite o teste contra o apêndice A rodar sem banco e o mesmo número aparecer na tela e na API pública, se um dia ela expuser. |
| **E5** | **Recálculo sob demanda, no cliente**, a partir dos inputs persistidos; o banco guarda **só entradas** (o que a planilha marca ✏️), nunca derivados. | A spec (§ "Ordem de cálculo") diz que tudo depende de `'1'!F16` e `G3:G8`; persistir derivados cria o problema clássico de cache desatualizado. Grafo acíclico, milhares de células — trivial em JS. |
| **E6** | **Números:** percentuais e taxas como **fração decimal** (`0.25`), moeda em **centavos inteiros** ou `NUMERIC(18,2)`, contagens (bases) inteiras. | Spec § "Convenções" sugere `NUMERIC(12,6)`/`NUMERIC(18,2)`; centavos evitam a soma `0.10+0.20+0.70 ≠ 1` que a própria spec alerta (§1.4). O @data-engineer decide o tipo físico. |

## Stories

| Story | Título | RN cobertas | Depende de | Status |
|---|---|---|---|---|
| 48.1 | Inputs Financeiros — modelo, API e tela (aba 1) | RN-001…009, 037, 040 | P1, P2 | Draft |
| 48.2 | Motor de cenários no `shared` (abas 2 e 3, parte pura) | RN-010…015, 024…026 | — (só testes) | Draft |
| 48.3 | Leads orgânicos — seleção, combinações e resumo (aba 2) | RN-016…023 | 48.1, 48.2 | a rascunhar |
| 48.4 | Leads pagos — seleção, combinações e resumo (aba 3) | RN-016…022, 027…029 | 48.1, 48.2 | a rascunhar |
| 48.5 | Resumo Final — consolidação dos cinco cenários (aba 4) | RN-030, 031 (+ 017…020 consolidadas) | 48.3, 48.4 | a rascunhar |

Pontos e prioridade: `[FALTA]` — não estimados pelo @sm; @po/Danilo estimam na validação.

## Change Log

| Data | Agente | Mudança |
|---|---|---|
| 2026-09-21 | @sm (River) | Epic criado para reservar o nº 48 e registrar as 14 decisões do Danilo; 48.1 e 48.2 rascunhadas; docs copiados para `docs/specs/epic-48/` |
| 2026-09-21 | @sm (River) | Danilo confirmou as três leituras do @sm: D3 (escada trava em zero nos pagos), D10 (apêndice A valida o bruto), 48.1 AC13 (permissão = a do funil) |
| 2026-09-21 | @devops (Gage) | P1 resolvida: Lucas autorizou o escopo (via Danilo) com a condição "não mexer em nada que ele já implementou"; leitura operacional registrada para confirmação na primeira PR de código |
