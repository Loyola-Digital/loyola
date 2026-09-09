# EPIC 47 — Nomenclatura de campanhas do perpétuo (Dicionário + Gerador)

**Status:** 47.1 InReview (gate CONCERNS) · 47.2 **InReview** (implementada em 2026-09-09, branch `feat/47.2-nomenclatura-submenu-e-telas` empilhada na 47.1) · 47.3–47.4 Ready · P1 (seed) aberta · revisão das Etapas 1+2 com o dono do produto no local pendente
**Origem:** especificação do dono do produto entregue em 2026-09-09 — guardada verbatim em `epic-47-especificacao-nomenclatura.md` (a **fonte de verdade** deste epic; toda AC abaixo rastreia para uma seção dela)
**Owner:** @sm (stories, por delegação do pedido) → @po (validação) → @dev (implementação) → @qa (gate)
**Criado:** 2026-09-09 pelo @sm (River). ⚠️ Estrutura de epic é atribuição do @pm (Morgan) — este documento foi criado junto com as stories porque o pedido chegou como spec pronta; o @pm valida ou reescreve a estrutura na primeira leitura.
**Onde na UI:** aba **Configurações** do bloco *Global* da sidebar (`/settings`) → novo submenu **Nomenclatura**

---

## O que é

Hoje o nome de cada campanha de perpétuo no Meta Ads segue uma convenção posicional de **nove campos separados por `_`** (`bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa`). O nome viaja na URL, chega na planilha de vendas e é quebrado em nove colunas para cruzar investimento com faturamento. **Se o nome sai do padrão, o cruzamento quebra** — e hoje nada impede que saia: o nome é digitado à mão no gerenciador.

Este epic põe dentro do Loyola X, em Configurações → Nomenclatura:

1. **Dicionário** — cadastro de experts, produtos, funis, ofertas, LPs e valores fixos (ano, temperatura, leilão, formato), com incluir / editar / excluir e as regras de imutabilidade da spec.
2. **Gerador** — a tela que monta o nome por seleção em cascata, valida contra o dicionário, copia, salva e marca como publicada.
3. **Validador** — cola um nome criado fora do sistema e recebe os nove campos e os erros.

## O que este epic NÃO é

- Não mexe no cruzamento de dados existente (`co=`, `utm_content`, planilhas). O `shared/src/campaign-name.ts` de hoje (`normalizarNomeCampanha`, Story 44.4) agrupa nomes da Meta para histórico — **não é parseado por este epic e não é substituído por ele**. O módulo novo é outro arquivo (ver decisão D6).
- Não integra com a API da Meta, não monta parâmetros de URL, não importa a planilha antiga, não nomeia conjunto/anúncio (spec § 11).

## Pré-condições — ⛔ bloqueiam o `*develop` da 47.1

| # | O quê | Quem |
|---|---|---|
| P1 | **Preencher os `[PREENCHER]` da seção 9 da spec** (nomes dos 4 experts, expert dono de cada produto, funis e ofertas reais por expert, URL das LPs). O script de seed e os testes não dependem dos valores, mas o seed não pode subir para produção com placeholder. | dono do produto |
| ~~P2~~ ✅ | **Autorização de escopo — resolvida em 2026-09-09: Lucas autorizou (confirmado pelo Danilo nesta sessão); commits levam `[scope-override]`.** O usuário que abriu o pedido (`danilo@bonsaitrafegopago.com.br`) tem `scope: restricted` em `docs/team/members.md`, e a implementação toca `schema.ts`, `app.ts`, `settings/layout.tsx` e rotas novas — todos fora dos `allowed_paths`. Pelo `team-scopes.md`, precisa de autorização do Lucas documentada no commit (`[scope-override]`) ou de outro membro com `scope: full` implementando. | Lucas |
| ~~P3~~ | ~~Decisões D2 e D3 confirmadas pelo @po~~ — **resolvida em 2026-09-09** (ver D2/D3). | @po ✅ |

## Decisões tomadas na criação (para o @po revisar)

| ID | Decisão | Por quê |
|---|---|---|
| **D1** | **Todas as tabelas novas levam prefixo `naming_`**: `naming_experts`, `naming_products`, `naming_funnels`, `naming_offers`, `naming_landing_pages`, `naming_dictionary_values`, `naming_campaigns`, `naming_changelog`. | `funnels` e `projects` **já existem** em `packages/api/src/db/schema.ts` (Epic 10) e `campaigns` é coluna jsonb de `funnels`; existem ainda `planner_campaigns` e `campaign_log_entries`. A spec (§ 4) manda seguir a convenção do repo, e a convenção aqui é prefixar por domínio (`swipe_*`, `planner_*`, `stage_*`). |
| **D2** ✅ confirmada pelo @po | **`naming_experts` é tabela própria, sem FK para `projects`.** | É o que a spec descreve (§ 4.1). Os quatro experts do seed (`bbe`, `fz`, `pps`, `dg`) coincidem com projetos existentes (BBE, FZ & MFB, PP, DG & CPDF), e ligar os dois seria útil na fase 2 (URL, cruzamento). **Não foi pedido** — Artigo IV. Fica registrado como extensão natural: um `project_id uuid NULL` pode entrar depois sem migração destrutiva. @po confirma. |
| **D3** ✅ decidida pelo @po | **Permissões:** `guest` não vê o submenu e recebe `403` na API. **Qualquer outro papel lê e escreve** (criar/editar/excluir/desativar/publicar). | A spec não fala de papéis (Artigo IV — não inventar restrição). O dicionário é dado operacional do tráfego, e o enum do repo (`copywriter · strategist · manager · admin · guest`) não diz quem do time de tráfego tem qual papel. A proposta original do @sm (escrita só admin/manager/strategist) arriscava trancar justamente quem opera. Estreitar depois é uma linha em `permissoes.ts`. |
| **D4** | **Rota `/settings/nomenclatura`**, entrada nova em `BASE_TABS` do `settings/layout.tsx`, com as seções internas (Dicionário › 6 abas · Campanhas › Gerador / Listagem / Validar) **na URL** via `?secao=&aba=`. | Regra 1 do Epic 46: aba ativa é contrato de URL; e o layout de settings já é abas-como-dado. Não inventar padrão novo. |
| **D5** | **Changelog é tabela nova** (`naming_changelog`), escrito por **uma** camada de serviço (`packages/api/src/services/nomenclatura/`), nunca nos handlers. `author` = `users.id` (a API já resolve `request.userId` pelo Clerk). | Spec § 4.8. A `user_activity` existente é contador de adesão, não trilha de auditoria — não serve de base. |
| **D6** | **As funções puras vivem num módulo folha novo do `shared`: `packages/shared/src/nomenclatura-de-campanha.ts`.** `buildCampaignName(fields)` e `parseCampaignName(name, dicionario)` — o núcleo recebe um **snapshot do dicionário** como argumento; a API expõe o wrapper que carrega o snapshot do banco e a prévia do gerador usa o snapshot já carregado pelos selects. | Spec § 8 pede as duas funções "puras, usadas no servidor e na prévia" e ao mesmo tempo "dirigidas pelo banco". Uma função que consulta o banco não é pura nem roda no navegador; a assinatura da spec fixa o *quê* (validar contra o dicionário atual), e este é o *como* que atende às duas exigências. Import: web por `@loyola-x/shared/src/nomenclatura-de-campanha`, API bare por `index.ts` — os caminhos **não** são intercambiáveis (Story 19.14). |
| **D7** | **A API entra na Etapa 1 (47.1)**, não na Etapa 2. | Spec § 3: "implemente como validação de servidor, não só de formulário". As regras de negócio (§ 5) são de servidor e é lá que se testam sem tela. A Etapa 2 da spec ("telas com incluir/editar/excluir") pressupõe a API pronta. |
| **D10** (@po) | **`API_CONTRACT_VERSION` sobe na story que cria a rota:** 6→7 na 47.1, 7→8 na 47.3. | Padrão do próprio `contract.ts` e `feedback_front_nao_pode_exigir_api_nova`: web e API deployam em ciclos diferentes e o banner da 29.45 só avisa se o número subiu. |
| **D11** (@po) | **Normalização e slug são módulo folha do `shared`** (`nomenclatura-codigos.ts`), entregues pela 47.1 e só importados pela 47.2. | A tela mostra a normalização ao vivo e a API decide; duas implementações divergem na primeira mudança (lição da 18.80). |
| **D8** | **Migration como o repo faz:** `schema.ts` é a fonte (o CMD da API roda `drizzle-kit push --force` no deploy) **e** um SQL narrado `0142_nomenclatura_de_campanhas.sql` em `src/db/migrations/`, no molde da `0138_swipe_colecoes.sql`. | Convenção observada em 141 migrations. |
| **D9** | **Seed** em `packages/api/src/db/seeds/nomenclatura.ts`, idempotente por chave natural (`ON CONFLICT DO NOTHING` sobre os uniques), acionado por script `pnpm --filter @loyola-x/api seed:nomenclatura` (novo script em `package.json`). | Molde `seeds/switchy-presets.ts`. Não roda no boot — seed de dicionário é operação consciente, não efeito colateral de deploy. |

## Regras não-negociáveis (spec § 3 — valem para as 4 stories)

1. Um separador só: `_` entre campos, `-` dentro. Só `[a-z0-9-]` dentro de um campo.
2. Nove campos, sempre; `na` para o que não se aplica.
3. Um campo, um significado.
4. Código nunca muda de significado nem é reaproveitado — **a unicidade inclui inativos**.
5. Código é imutável depois de usado em pelo menos uma campanha salva.
6. Nunca renomear campanha publicada — só "Duplicar".
7. Todo código tem linha no dicionário; toda mudança tem linha no changelog.
8. Valor fora do dicionário é erro — o gerador nunca aceita texto livre nos nove campos.

## Stories

| # | Story | Etapa da spec | Entrega | Pontos | Status |
|---|---|---|---|---|---|
| 47.1 | Modelo de dados, migration, seed e API do dicionário | 1 (+ API, D7) | 8 tabelas `naming_*`, serviço com normalização/sugestão/imutabilidade/exclusão/changelog, rotas CRUD `/api/nomenclatura/*`, seed idempotente, testes de servidor | 8 | **InReview** · gate **CONCERNS** (QA-471-02: sem banco real) · 53 testes · 9 reversões · branch `feat/47.1-nomenclatura-modelo-e-api` |
| 47.2 | Submenu Nomenclatura e telas do Dicionário | 2 | entrada em `/settings`, 6 abas (Experts · Produtos · Funis · Ofertas · LPs · Valores fixos) com incluir/editar/excluir/desativar | 8 | **InReview** · 17 testes puros · web 1.142 · `next build` verde · validação visual pendente |
| 47.3 | Gerador de nome de campanha, listagem e validador | 3 | `buildCampaignName`/`parseCampaignName` no `shared`, rotas de campanhas, tela do gerador com prévia colorida, publicar/duplicar, "Validar um nome existente" | 8 | **Ready** (GO 9/10) |
| 47.4 | Suíte de aceite (15 critérios) e validação visual | 4 | matriz AC → teste, lacunas fechadas, roteiro visual executado nas duas telas, docs | 5 | **Ready** (GO 9/10) |

Arquivos: `docs/stories/47.1.nomenclatura-modelo-de-dados-e-api.md` · `docs/stories/47.2.nomenclatura-submenu-e-telas-do-dicionario.md` · `docs/stories/47.3.nomenclatura-gerador-de-nome-de-campanha.md` · `docs/stories/47.4.nomenclatura-suite-de-aceite-e-validacao-visual.md`

**Ordem obrigatória:** 47.1 → 47.2 → 47.3 → 47.4. A spec (§ 0.3) pede parada para revisão do dono do produto ao fim de cada etapa — cada story termina em InReview e **não** começa a próxima sem esse OK, além do gate do @qa.

## Mapa dos 15 critérios de aceite da spec (§ 10) → story

| AC spec | Story dona | Cobre onde |
|---|---|---|
| 1, 2, 3, 4, 11 | 47.3 | gerador e listagem |
| 5, 6, 8, 14, 15 | 47.1 | serviço + rotas (teste de servidor) |
| 7 | 47.1 (slug/sugestão) + 47.2 (somente leitura na tela) | |
| 9, 10 | 47.1 (bloqueio, changelog) + 47.2 (botão Desativar, campo desabilitado, "Mostrar inativos") | |
| 12, 13 | 47.3 (`parseCampaignName`, dirigido pelo dicionário) | |
| todos | 47.4 | matriz consolidada — nenhum AC fica sem teste automatizado ou roteiro visual declarado |

## Riscos conhecidos

- **Runner do web só coleta `lib/utils`, `lib/bi`, `lib/swipe`, `lib/planner` e só `.test.ts`** (`packages/web/vitest.config.ts`). Lógica de tela do gerador (cascata, limpeza de campos) precisa ficar em função pura `.ts` em `lib/utils/` para ter teste — igual ao `menu-de-abas.ts` do Epic 46. Componente `.tsx` não tem teste automatizado neste repo; é por isso que a 47.4 tem roteiro visual obrigatório.
- **`shared` não tem runner próprio.** Os testes do módulo folha vão em `packages/api/src/__tests__/` (import bare) — molde do que a 18.80 fez com `janela-de-dias`.
- **`schema.ts` tem 4.665 linhas e é tocado por várias PRs por semana.** Conflito de merge é provável; a 47.1 acrescenta um bloco contíguo no fim do arquivo para minimizar.
- **Ninguém no repo importa nada desta área ainda** — risco de regressão em código existente é baixo, mas o `next build` e o `tsc` do web precisam do `shared` compilado (`feedback_shared_dist_typecheck`).

## Fora do escopo (spec § 11)

Nomenclatura de conjunto e anúncio · parâmetros de URL · integração Meta · importação da planilha antiga. O modelo fica pronto: `naming_campaigns.id` será pai de conjuntos/anúncios e `naming_landing_pages.code` volta no nome do anúncio.

## Change Log

| Data | Autor | Mudança |
|---|---|---|
| 2026-09-09 | @sm (River) | Epic criado a partir da spec do dono do produto. Spec arquivada verbatim. Decisões D1–D9 registradas; D2 e D3 marcadas para confirmação do @po. Pré-condições P1–P3 declaradas. |
| 2026-09-09 | @po (Pax) | 47.1 validada: GO 9,5/10 → Ready. D2 confirmada, D3 decidida (não-guest lê e escreve), P3 fechada. Sigla do expert imutável desde a criação (contradição da spec resolvida pelo lado estrito). |
| 2026-09-09 | @dev (Dex) | 47.2 implementada e em InReview: entrada Nomenclatura em `/settings`, 6 abas do Dicionário, seção/aba na URL. Validação visual fica com o dono do produto. |
| 2026-09-09 | @qa (Quinn) | Gate da 47.1: CONCERNS. QA-471-01 (corrida → 500) corrigido no gate; QA-471-02 aberto (nada gravado em Postgres real). Migration conferida contra `drizzle-kit generate`. |
| 2026-09-09 | @dev (Dex) | 47.1 implementada e em InReview. Seed com `TODO(P1)` (só valores fixos entram até os `[PREENCHER]`). |
| 2026-09-09 | @po (Pax) | 47.2/47.3/47.4 validadas: GO 9/10 cada → Ready. D10 (bump do contrato por story que cria rota) e D11 (normalização/slug no `shared` pela 47.1). Guest já é barrado pelo middleware (47.2 AC1 corrigida). Relatório consolidado em `docs/qa/validations/47.1-47.4-po-validation.md`. |
