# EPIC 47 — Nomenclatura de campanhas do perpétuo (Dicionário + Gerador)

**Status:** Fase 1 e 47.5 **Done** · **47.6 InReview (fatia A)** (fatia B aberta) · **Fase 2 (2026-09-10): 47.7–47.10 MERGED na main** (#845, #844, #846, #847) · pendências operacionais: seed dos 7 valores de anúncio + recálculo do nome antigo em produção, e os quatro roteiros visuais — Slug de LP como seção, template v2 do nome, Nome VSL, Nome Ads · valor da 47.6 depende de o dono classificar legadas e colar ids da Meta (cobertura hoje 0%)
**Origem:** especificação do dono do produto entregue em 2026-09-09 — guardada verbatim em `epic-47-especificacao-nomenclatura.md` (a **fonte de verdade** deste epic; toda AC abaixo rastreia para uma seção dela)
**Owner:** @sm (stories, por delegação do pedido) → @po (validação) → @dev (implementação) → @qa (gate)
**Criado:** 2026-09-09 pelo @sm (River). ⚠️ Estrutura de epic é atribuição do @pm (Morgan) — este documento foi criado junto com as stories porque o pedido chegou como spec pronta; o @pm valida ou reescreve a estrutura na primeira leitura.
**Onde na UI:** aba **Configurações** do bloco *Global* da sidebar (`/settings`) → submenu **Nomenclatura** → seções **Dicionário · Campanhas · Slug de LP · Nome VSL · Nome Ads** (as três últimas pela Fase 2)

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
| **D2** ✅ confirmada pelo @po · **reaberta na 47.5** (o dono respondeu "sim" para expert vir do projeto → `project_id` nulo entra) | **`naming_experts` é tabela própria, sem FK para `projects`.** | É o que a spec descreve (§ 4.1). Os quatro experts do seed (`bbe`, `fz`, `pps`, `dg`) coincidem com projetos existentes (BBE, FZ & MFB, PP, DG & CPDF), e ligar os dois seria útil na fase 2 (URL, cruzamento). **Não foi pedido** — Artigo IV. Fica registrado como extensão natural: um `project_id uuid NULL` pode entrar depois sem migração destrutiva. @po confirma. |
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
| 47.1 | Modelo de dados, migration, seed e API do dicionário | 1 (+ API, D7) | 8 tabelas `naming_*`, serviço com normalização/sugestão/imutabilidade/exclusão/changelog, rotas CRUD `/api/nomenclatura/*`, seed idempotente, testes de servidor | 8 | **Done** · gate PASS |
| 47.2 | Submenu Nomenclatura e telas do Dicionário | 2 | entrada em `/settings`, 6 abas (Experts · Produtos · Funis · Ofertas · LPs · Valores fixos) com incluir/editar/excluir/desativar | 8 | **Done** · gate PASS |
| 47.3 | Gerador de nome de campanha, listagem e validador | 3 | `buildCampaignName`/`parseCampaignName` no `shared`, rotas de campanhas, tela do gerador com prévia colorida, publicar/duplicar, "Validar um nome existente" | 8 | **Done** · gate PASS |
| 47.4 | Suíte de aceite (15 critérios) e validação visual | 4 | matriz AC → teste, lacunas fechadas, roteiro visual executado nas duas telas, docs | 5 | **Done** · gate PASS |

| 47.5 | Classificação de campanhas legadas do perpétuo | — (pedido pós-validação) | expert ↔ projeto (fecha a D2), `origin`/`meta_campaign_name` em campanhas, decisões, filtro por token, parser de sugestão, aba Legadas, contrato 9 | 8 | **Done** · PASS (validação do dono) · #834 #835 #836 |
| 47.6 | O cruzamento investimento × faturamento lê o vínculo | — | mapa `campaign_id → 9 campos`, agrupador por dimensão no perpétuo com "não classificada" e cobertura, colar id da Meta | 8 | **InReview (fatia A)** · AC0 = 0% de cobertura hoje · relatório com tabelas por dimensão + cobertura · fatia B (dashboard diário) aberta |

**Fase 2 — pedido do dono em 2026-09-10 (ordem de saída: 47.7 → 47.8 → 47.9 → 47.10)**

| # | Story | Item do pedido | Entrega | Pontos | Status |
|---|---|---|---|---|---|
| 47.7 | "Slug de LP" vira seção própria e lista as LPs do expert | 1, 3 | seção `?secao=slug` ao lado de Campanhas (link antigo compatível); ao escolher o expert, tabela Código · Slug · URL · Descrição que a cascata estreita | 3 | **Done** · gate CONCERNS · **MERGED #845** (`53de9dfb`) · AC8 visual com o dono |
| 47.8 | Novo padrão do nome de campanha (template v2) | 2 | `expert_funil_produto_oferta_perpetuo_ano_temp_leilao_formato_lp` (10 campos); build/parse/prévia/validador; recálculo das não publicadas; fila de Legadas exclui ids já vinculados; contrato 10 | 8 | **Done** · gate CONCERNS · **MERGED #844** (`dee2b559`) · P4 fechada pelo dono (planilha em 10 colunas) · T5 (recálculo, 1 linha) em prod após o deploy · AC11 visual |
| 47.9 | Seção "Nome VSL" — três variáveis por expert + oferta do dicionário + gerador | 4 | `naming_vsl_variables` (lead · problem · solution) + `naming_vsls` (com `offer_id`); `vsl_expert_produto_lead_problema_solucao_oferta`; abas Nova VSL · VSLs; cadastro das variáveis em **Dicionário › Variáveis de VSL** (decisão do dono) | 8 | **Done** · gate CONCERNS · **MERGED #846** (`91aff85e`) · migration 0144 no deploy · AC12 visual |
| 47.10 | Seção "Nome Ads" — tipo de criativo, sigla de lançamento e gerador com sequencial | 5 | tipos `creative_type` (ad · adv · carr) e `launch_type` (pg · l · m · pr) em Valores fixos; `naming_ads` com NN reservado na gravação; `{tipo}{NN}_{expert}_{sigla}{NN}_{mm-aaaa}--{descricao}`, NN único por expert; copiar estrutura × nome completo | 8 | **Done** · gate CONCERNS · **MERGED #847** (`155eba98`) · migration 0145 no deploy + `seed:nomenclatura` em prod · AC12 visual |

Arquivos: `docs/stories/47.7.nomenclatura-slug-de-lp-secao-propria.md` · `47.8.nomenclatura-novo-padrao-do-nome-de-campanha.md` · `47.9.nomenclatura-nome-de-vsl.md` · `47.10.nomenclatura-nome-de-anuncio.md`

**Dependências da Fase 2:** 47.7 primeiro (as seções novas entram à direita dela). 47.8 é independente das outras. 47.10 depende da 47.9 (reaproveita o desenho de seção com cadastro + gerador + lista). Perguntas respondidas pelo dono em 2026-09-10 (`a01`; existe fluxo externo em 9 colunas → remapeado para 10, P4 fechada; pitch = oferta; data `mm-aaaa`; NN por expert). **Achado no caminho:** a #843 (47.7) foi fechada pelo GitHub ao apagar a branch de docs que era base dela; substituída pela #845 — ver `feedback_delete_branch_fecha_pr_empilhada`.

**Fase 3 — pedido do gestor de tráfego (Danilo) em 2026-09-15, formato combinado com o dono (ordem de saída: 47.11 ∥ 47.12 → 47.13)**

| # | Story | Item do pedido | Entrega | Pontos | Status |
|---|---|---|---|---|---|
| 47.11 | Novo anúncio: NN e lançamento na mesma linha; anúncios do expert na tela | 1, 1c | linha `NN do criativo \| Sigla \| Nº do lançamento`, Tipo sozinho na linha de cima; ao escolher o expert, lista os anúncios dele (`useAnuncios`, molde 47.9) | 2 | **Done** · gate PASS · **MERGED #878** (`97b4162a`) · visual pendente |
| 47.12 | Dicionário do vídeo: origem `ia`/`h` em Valores fixos + hooks/bodies por expert | 1a, 1b (cadastros) | tipo novo em `naming_dictionary_type` + seed (`ia` — feito por inteligência artificial · `h` — feito por humano); tabela de hooks/bodies no molde de `naming_vsl_variables` (`hNN`/`bNN` por expert, descrição obrigatória), rotas + `proximo-codigo`, aba "Hooks e bodies"; **nenhum nome muda** | 5 | **Done** · gate PASS · **MERGED #879** (`5fa42023`) · pós-deploy feito (enum + tabela + seed) |
| 47.13 | Nome de vídeo v2 — origem, hook e body no nome do `adv` | 1a, 1b (o nome) | `{tipo}{NN}_{origem}_{expert}_{sigla}{NN}_{hNN}_{bNN}_{mm-aaaa}--` só para `adv` (ex.: `adv01_h_dg_pg04_h01_b01_09-2026--`); `ad`/`carr` byte a byte iguais; vídeos antigos válidos com aviso "padrão antigo"; gerador/listagem/snapshot/validar-nome; spec § 11 atualizada | 8 | **Done** · gate PASS após REQ-001 · **MERGED #880** (`95a8d22b`) · conferir 0149 em prod · visual pendente |

| 47.14 | Novo anúncio em coluna única + avisos de "nenhum cadastro" com link para o cadastro | pedido da noite de 15/09 | página inteira em coluna única (prévia acima), cada campo na sua linha (**desfaz a 47.11 AC1**), avisos hiperlinkados; aba Hooks e bodies aceita `expertId` na URL | 3 | **Draft** |
| 47.15 | Contrato da API sobe (dívida 47.12/47.13) + tela diz "API atrás do painel" | erros de 15/09 ("Not Found", "id: Invalid UUID" = API do Railway sem a 47.12) | `API_CONTRACT_VERSION` 12→13; 404/400-UUID viram a frase da API antiga na aba, no form e no gerador; item `api_contract` nos gates | 1 | **Ready** (PO 9/10, 2026-09-15) |

Arquivos: `docs/stories/47.11.nomenclatura-novo-anuncio-layout-e-lista-do-expert.md` · `47.12.nomenclatura-dicionario-do-video-origem-hooks-bodies.md` · `47.13.nomenclatura-nome-de-video-v2-origem-hook-body.md` · `47.14.nomenclatura-novo-anuncio-coluna-unica-e-links-de-cadastro.md` · `47.15.nomenclatura-contrato-da-api-e-painel-a-frente.md`

**Por que 47.12 antes da 47.13:** o nome de vídeo muda **uma** vez em produção (regra 6 — nome publicado no Meta não muda; ninguém quer anúncios num formato de transição). Decisões do gestor em 15/09: formato com ok do dono; origem como valor fixo; hooks/bodies por expert, NN automático, descrição obrigatória, obrigatórios em todo `adv`; vídeos antigos seguem válidos com aviso.

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

## O que este epic provou (47.4 AC8)

| | |
|---|---|
| ACs da spec com teste automatizado que cai com a regra revertida | **15 de 15** |
| ACs com parte que só a tela prova | 10 de 15 |
| mutações medidas | 26, nenhuma decorativa |
| casos automatizados | 83 na API · 31 no web |
| banco real | migration 0142 aplicada em produção em 2026-09-09; seed 2× = 9 → 0 |

O que o número não cobre está declarado na matriz (componentes, `defaultNow()` em `date`, atomicidade da cascata) e vira passo do roteiro visual — que é entregável, não formalidade (regra do Epic 46).

## Adendo 2026-09-10 — template v2 do nome de campanha (Story 47.8)

A spec verbatim (`epic-47-especificacao-nomenclatura.md`) **não é editada**; este adendo é a fonte da mudança pedida pelo dono em 2026-09-10:

```
v1 (spec § 2)   expert_produto_funil_oferta_ano_temp_leilao_formato_lp            9 campos, 8 "_"
v2 (47.8)       expert_funil_produto_oferta_perpetuo_ano_temp_leilao_formato_lp   10 campos, 9 "_"
```

O funil sobe para a 2ª posição, o produto desce para a 3ª, e o campo 5 é a constante `perpetuo`. A regra 2 da spec § 3 passa a ler-se "dez campos, sempre; nome com número diferente de 9 underscores é inválido". As demais regras, o dicionário e as nove dimensões do cruzamento (47.6) não mudam. Nome de campanha **publicada** fica como está (regra 6). Q1 respondida: fica `a01`. **P4:** o dono confirmou que existe um fluxo externo quebrando o nome em 9 colunas — ele precisa aceitar 10 antes do merge da 47.8.

**Novas nomenclaturas (47.9, 47.10)** têm template próprio e módulo folha próprio no `shared` (`nomenclatura-de-vsl.ts`, `nomenclatura-de-anuncio.ts`); o de anúncio usa `--` como separador fixo antes da descrição livre — exceção declarada à regra 1, que vale para o nome de campanha.

## Fora do escopo (spec § 11)

Nomenclatura de conjunto · parâmetros de URL · integração Meta · importação da planilha antiga. (Nome de anúncio deixou de estar fora: Story 47.10, com template próprio, diferente do `adNNN_formato_conceito_vNN_lp` previsto na spec § 11 — o dono redefiniu o padrão em 2026-09-10.) O modelo fica pronto: `naming_campaigns.id` será pai de conjuntos/anúncios e `naming_landing_pages.code` volta no nome do anúncio.

## Change Log

| Data | Autor | Mudança |
|---|---|---|
| 2026-09-10 | @dev (Dex) | Follow-ups 3 e 4 da 47.9: Nova VSL lista as VSLs do expert (#851); VSL guarda o link do Drive (`url`, 0146). |
| 2026-09-10 | @dev (Dex) | Follow-up 2 da 47.9: variáveis de VSL com código sigla + NN (`lead01`, `pr01`, `sol01`), sugerido; D21 desfeita; 5 variáveis de produção renomeadas. |
| 2026-09-10 | @dev (Dex) | Follow-up da 47.9 a pedido do dono: Variáveis de VSL passam a ser aba do **Dicionário** (D20 desfeita); Nome VSL fica com Nova VSL · VSLs. |
| 2026-09-10 | @devops (Gage) | Fase 2 inteira mergeada: #842 docs → #845 (47.7, substituiu a #843) → #844 (47.8) → #846 (47.9) → #847 (47.10). Deploy da API no Railway ficou parado em contrato 9 até o dono disparar à mão (15:20). Pendente: seed + recálculo em prod, roteiros visuais. |
| 2026-09-10 | @qa (Quinn) | 47.10 gate CONCERNS → Done (seed dos 7 valores em prod; AC12 visual). Fase 2 inteira com gate. |
| 2026-09-10 | @dev (Dex) | 47.10 em InReview: tipos `creative_type`/`launch_type` (seed com as descrições do pedido), `naming_ads` (0145), módulo folha do anúncio, rotas `/ads/*` (contrato 12), seção Nome Ads (Novo anúncio · Anúncios · Valores fixos). |
| 2026-09-10 | @qa (Quinn) | 47.9 gate CONCERNS → Done. QA-479-01 corrigido no gate (produto conta VSL como uso). |
| 2026-09-10 | @dev (Dex) | 47.9 em InReview: tabelas `naming_vsl_variables`/`naming_vsls` (0144), módulo folha da VSL, rotas `/vsl/*` (contrato 11), seção Nome VSL (Nova VSL · VSLs · Variáveis). Oferta passa a contar VSL como uso. |
| 2026-09-10 | @qa (Quinn) | 47.8 gate CONCERNS → Done (P4 merge, T5 prod, AC11 visual). QA-478-01 corrigido no gate. |
| 2026-09-10 | @dev (Dex) | 47.8 em InReview: template v2 (contrato 10), recálculo, fila de legadas, e correção do mapa da 47.6 (lia produto/funil pelo nome; agora lê pela ordem declarada, com fallback v1). Merge segue travado pela P4. |
| 2026-09-10 | @qa (Quinn) | 47.7 gate CONCERNS → Done (AC8 visual pendente; 2 achados low). @dev implementou na mesma data: seção `slug`, link antigo compatível, tabela de LPs por expert. |
| 2026-09-10 | @po (Pax) | Fase 2 validada: 47.7 GO 9,5 · 47.8 GO 9 (P4 bloqueia merge) · 47.9 GO 9 (pitch = oferta) · 47.10 GO 8,5 (`mm-aaaa`, NN por expert). Todas Ready. Relatório em `docs/qa/validations/47.7-47.10-po-validation.md`. |
| 2026-09-10 | @sm (River) | Fase 2: stories 47.7 (Slug de LP seção + lista por expert), 47.8 (template v2 do nome, Q1 `a1`×`a01`, P4 planilha), 47.9 (Nome VSL), 47.10 (Nome Ads) criadas a partir do pedido do dono. Adendo do template v2 registrado; spec verbatim intacta. Medido: 1 campanha em `naming_campaigns`, 4 funis `a01`, 11 LPs. |
| 2026-09-09 | @sm (River) | Epic criado a partir da spec do dono do produto. Spec arquivada verbatim. Decisões D1–D9 registradas; D2 e D3 marcadas para confirmação do @po. Pré-condições P1–P3 declaradas. |
| 2026-09-09 | @po (Pax) | 47.1 validada: GO 9,5/10 → Ready. D2 confirmada, D3 decidida (não-guest lê e escreve), P3 fechada. Sigla do expert imutável desde a criação (contradição da spec resolvida pelo lado estrito). |
| 2026-09-10 | @dev (Dex) | 47.6 fatia A em InReview: AC0 (0%), mapa, cobertura, porDimensao no relatório, colar id da Meta. Fatia B (dashboard diário) declarada. |
| 2026-09-10 | @po (Pax) | 47.6 validada: GO 8,5/10 → Ready. |
| 2026-09-10 | @architect (Aria) | 47.6: decisões — agrupar no backend, cobertura dupla, só funil perpetual, teste diferencial obrigatório. |
| 2026-09-10 | @po (Pax) | 47.5 Done após validação do dono em produção; follow-ups #835/#836. Próximo: @architect na 47.6. |
| 2026-09-09 | @dev (Dex) | 47.5 implementada e em InReview (aba Legadas, expert ↔ projeto, decisões, sugestão a partir do nome antigo). |
| 2026-09-09 | @po (Pax) | 47.5 validada: GO 9/10 → Ready (desfazer classificação apaga o registro; permissões D3). 47.6 segue Draft até o @architect. |
| 2026-09-09 | @sm (River) | Fase 1.5: stories 47.5 (legadas) e 47.6 (cruzamento) criadas a partir do pedido do dono e das 6 respostas. Medição: 51 candidatas, 32 com gasto (R$ 40,9k). |
| 2026-09-09 | @po (Pax) | Epic fechado: validação visual do dono em produção concluída, gates 47.2–47.4 promovidos a PASS, stories Done. P1 fica como pendência operacional (cadastro pela tela). |
| 2026-09-09 | @devops (Gage) | Rebase na `main` (7c026676, sem conflito), push e PR #827 com a leva inteira. **Merge por squash `a114f33b`** com autorização do dono; ClickUp 4× done. |
| 2026-09-09 | @dev (Dex) | Follow-up da validação visual: DV1 (botão Nova campanha + ações com texto + saída explícita nos modos editar/duplicar + reset do form uma vez por id), DV2 (identidade em linhas), DV3 (sub-aba Slug de LP). |
| 2026-09-09 | @qa (Quinn) | Gates: 47.1 → PASS; 47.2, 47.3, 47.4 → CONCERNS só pela AC18 (roteiro do dono). Prova no banco real (11 checks, dados `zz` apagados). Corrigidos no gate: leituras em série na transação da cascata (pg@9), reset do FormLp no gerador, ids duplicados, typo. |
| 2026-09-09 | @dev (Dex) | 47.4 em InReview: matriz 15/15 × teste × reversão, 6 testes de lacuna, roteiro visual de 37 passos (execução com o dono do produto). |
| 2026-09-09 | @dev (Dex) | Migration 0142 aplicada em produção com autorização do dono do produto (QA-471-02 resolvida); seed 2× = 9 valores fixos, 0 duplicatas. Local passa a funcionar de ponta a ponta. |
| 2026-09-09 | @dev (Dex) | 47.3 implementada e em InReview: `buildCampaignName`/`parseCampaignName` no `shared`, rotas de campanhas/snapshot/validador, gerador com prévia colorida, listagem, validador. Contrato 7→8. |
| 2026-09-09 | @dev (Dex) | 47.2 implementada e em InReview: entrada Nomenclatura em `/settings`, 6 abas do Dicionário, seção/aba na URL. Validação visual fica com o dono do produto. |
| 2026-09-09 | @qa (Quinn) | Gate da 47.1: CONCERNS. QA-471-01 (corrida → 500) corrigido no gate; QA-471-02 aberto (nada gravado em Postgres real). Migration conferida contra `drizzle-kit generate`. |
| 2026-09-09 | @dev (Dex) | 47.1 implementada e em InReview. Seed com `TODO(P1)` (só valores fixos entram até os `[PREENCHER]`). |
| 2026-09-09 | @po (Pax) | 47.2/47.3/47.4 validadas: GO 9/10 cada → Ready. D10 (bump do contrato por story que cria rota) e D11 (normalização/slug no `shared` pela 47.1). Guest já é barrado pelo middleware (47.2 AC1 corrigida). Relatório consolidado em `docs/qa/validations/47.1-47.4-po-validation.md`. |
