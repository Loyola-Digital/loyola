/**
 * Story 29.46 — versão do contrato entre o painel (Vercel) e a API (Railway).
 *
 * ## Por que este arquivo existe separado do `index.ts`
 *
 * O `index.ts` reexporta tipos de todo o domínio, com imports em estilo
 * NodeNext (`./types/funnel.js`). A API resolve isso sem problema; o webpack
 * do Next **não** — e até esta story o web só importava `type` do shared, que
 * o compilador apaga antes de qualquer resolução acontecer. O primeiro import
 * de VALOR quebrou o build (`Module not found: ./types/funnel.js`).
 *
 * Módulo folha, sem nenhum import: o web o consome por
 * `@loyola-x/shared/src/contract`, sem arrastar a árvore de tipos junto. É
 * também o desenho certo — uma constante de protocolo não deveria depender de
 * tipos de domínio para ser lida.
 *
 * ## A regra
 *
 * **Quando um PR fizer o web depender de um campo ou rota que a API não tinha,
 * esse mesmo PR incrementa este número.** Cada lado carrega a sua cópia
 * compilada: a API publica a dela em `/api/health`, o web compara com a sua. A
 * diferença revela a defasagem, nos dois sentidos.
 *
 * Não incrementar não quebra nada de imediato — apenas devolve o projeto ao
 * estado em que a defasagem só aparece como sintoma disfarçado, que já custou
 * três investigações:
 *
 *   18.60  "LP Paga zerada"          — números certos lidos como erro de cálculo
 *   29.43  cache de criativos vazio  — story bloqueada 2 dias, 2 medições em prod
 *   29.45  gráficos sumidos          — seção inteira invisível, sem erro na tela
 *
 * Um inteiro monotônico, e não uma lista de capacidades: a defasagem medida
 * foi sempre "a API inteira está atrás".
 */
/**
 * v2 — Story 44.2: `connectRate` e `lpRate` passaram a dividir por `linkClicks`
 * (antes: `clicks`, cliques totais). O valor SOBE de 18 a 35 pontos percentuais.
 *
 * ⚠️ QA-44-03 — quem muda com este deploy NÃO é o painel. O painel não consome
 * `/api/public/meta`: ele usa `/api/meta-ads/*` e calcula o Connect Rate por
 * conta própria, já por `linkClicks` (`funnel-metrics.ts:348`,
 * `perpetual-daily-metrics.ts:95`). A tela já mostrava o valor correto — é o
 * endpoint público que estava errado, e é ele que passa a concordar com ela.
 *
 * Quem muda é `packages/mcp`, o servidor stdio que roda na máquina do Inácio
 * (`LOYOLA_API_BASE_URL`). Ele não tem checagem de contrato: no instante em que
 * a API subir, o relatório dele muda. **Avisar antes é a coordenação que
 * importa** — não sincronizar deploys.
 *
 * O bump em si serve ao banner do painel, que passa a acusar API defasada até
 * ela subir. Isso é o detector funcionando: o `commit: null` do `/health`
 * (Railway sem `RAILWAY_GIT_COMMIT_SHA`) cega a checagem de commit, não a de
 * contrato.
 */
// v3 (Story 44.8): rota nova `GET .../stages/:stageId/cadeia-cac`. A aba da
// 44.9 depende dela, e o bump entra AQUI — se entrasse lá, o painel pediria uma
// rota que a API não tem e o sintoma apareceria disfarçado (18.60, 29.43, 29.45).
//
// ⚠️ `packages/mcp` (o servidor stdio do Inácio) NÃO tem checagem de contrato.
// Esta rota é nova e não muda nenhuma existente, então o risco é menor — mas o
// aviso é barato e a 44.2 já ensinou que ele some quando não está escrito.
//
// v4 (Stories 18.78, 29.69, 29.74, 29.68): TRÊS mudanças de API numa leva, e o
// bump ficou de fora — o defeito que este arquivo existe para evitar.
//
// Em 2026-09-04 o front subiu com as três e a API ficou parada em 13:38 UTC.
// Com o contrato igual nos dois lados, o banner de defasagem NÃO acusou nada, e
// o que apareceu foi:
//
//   - `top-performers?limit=500` → 400 (a API antiga valida `.max(100)`), e a
//     galeria de criativos ficou VAZIA — regressão de algo que funcionava;
//   - `/perpetual/hourly` → 404, seção sumindo em silêncio;
//   - `receitaCaptacao` ausente no payload → `undefined.toLocaleString()`
//     derrubando o dashboard inteiro.
//
// A lição não é "sincronizar deploys" — eles não são atômicos e não vão ser. É
// que toda mudança de rota, de validação de parâmetro OU de forma de payload
// bumpa esta constante, para o painel dizer que está na frente da API antes de
// o usuário descobrir sozinho.
// v5 (Story 29.76): `/all-ads` passou a devolver `porPublico` em cada linha —
// as métricas do criativo somadas por público (quente/frio). O front tem
// fallback (`temQuebra: false` → caminho antigo pelo mapa), então a API velha
// não quebra nada; o que ela causa é o filtro "Por Criativo + quente" continuar
// zerando no pps1 até a API subir. Por isso a versão sobe: o banner avisa que a
// correção ainda não chegou, em vez de o gestor achar que ela não funcionou.
// v6 (Story 44.28): nasceu `GET /api/public/v1/funnels/:id/perpetual-metrics`,
// a rota que o agente Inácio lê para publicar CAC, ROAS e margem do perpétuo no
// Resumão da diretoria.
//
// ⚠️ O bump vai NESTA story, e não na consumidora (a 44.29). Se ele entrasse
// junto do consumidor, o painel passaria a exigir uma rota que a API ainda não
// tem, e o sintoma chegaria disfarçado — 400 de validação, 404 de rota, campo
// `undefined` derrubando a tela. Foi o que custou as investigações das Stories
// 18.60, 29.43 e 29.45, e é exatamente o que o parágrafo acima descreve.
//
// A rota é ADITIVA: nada que existia mudou de forma. O que a API velha causa é
// o Inácio não encontrar a rota — e aí a versão defasada é o que explica por
// quê, em vez de o leitor concluir que o agente quebrou.
//
// A v6 carrega TAMBÉM a T6 da mesma story, e essa não é aditiva: o motivo
// `reguaDivergente` deixou de existir, e as três etapas promovidas de perpétuo
// passaram a publicar `principal.valor` onde antes vinha `null`. As duas
// mudanças sobem no mesmo deploy, então um bump só as cobre.
//
// ⚠️ O `packages/mcp` NÃO checa esta constante (roda na máquina de quem usa o
// agente). Para ele, a mudança de número chega no instante do deploy, sem
// aviso — por isso a leva do Inácio manda um aviso humano junto, e esta é a
// terceira vez: ver `docs/qa/audits/`.
//
// v7 (Story 47.1): rotas novas `/api/nomenclatura/*` — o dicionário de códigos
// do nome de campanha do perpétuo (experts, produtos, funis, ofertas, LPs e
// valores fixos). As telas da 47.2 e o gerador da 47.3 dependem delas, e o
// bump entra AQUI, na story que cria a rota — se entrasse lá, o painel pediria
// uma rota que a API não tem e o `404` viraria "dicionário vazio" na tela.
//
// ADITIVA: nada que existia mudou de forma. `packages/mcp` não é afetado
// (nenhuma tool nova, nenhuma rota pública).
//
// v8 (Story 47.3): rotas novas `/api/nomenclatura/campanhas`,
// `/api/nomenclatura/dicionario/snapshot` e `/api/nomenclatura/validar-nome` —
// o gerador de nome de campanha depende das três. ADITIVA; `packages/mcp` não
// é afetado.
//
// v9 (Story 47.5): rotas novas `/api/nomenclatura/legadas*` e o campo `legado`
// na resposta de `validar-nome`. ADITIVA; a aba Legadas depende delas.
//
// v10 (Story 47.8): template v2 do nome de campanha — dez campos, `perpetuo`
// na 5ª posição. NÃO aditiva: `partes` de `/validar-nome` passou de 9 para 10
// pedaços e as posições nas mensagens mudaram; o web antigo desenharia dez
// pedaços em nove rótulos. `packages/mcp` não é afetado.
//
// v11 (Story 47.9): rotas novas `/api/nomenclatura/vsl/*` (variáveis de VSL,
// snapshot, validador e VSLs) e o campo `variaveisDeVsl` em
// `impacto-da-desativacao`. ADITIVA; `packages/mcp` não é afetado.
//
// v12 (Story 47.10): rotas novas `/api/nomenclatura/ads/*` e dois tipos novos
// em `naming_dictionary_values` (`creative_type`, `launch_type`) — o web
// antigo desconhece os tipos e a aba Valores fixos do Dicionário segue com os
// quatro. ADITIVA; `packages/mcp` não é afetado.
//
// v13 (Stories 47.12/47.13, subido na 47.15): rotas novas
// `/api/nomenclatura/ads/partes*` (hooks e bodies do vídeo), tipo
// `creative_origin` em `naming_dictionary_values`, campos `origin`/`hookId`/
// `bodyId` (+ `hookCode`/`bodyCode`/`legado`) nos anúncios e `origins`/`partes`
// no snapshot de anúncios. ADITIVA; `packages/mcp` não é afetado. A dívida:
// 47.12 e 47.13 entraram sem subir isto — o painel foi publicado à frente da
// API e mostrou "Not Found"/"id: Invalid UUID" em vez do aviso de versão.
// v14 (Story 48.1): rotas novas `GET/PUT /api/projects/:projectId/funnels/
// :funnelId/planejamento/inputs` (Painel de Planejamento — Inputs Financeiros
// do funil de lançamento) e a tabela `plan_simulators`. ADITIVA; `packages/mcp`
// não é afetado. O web novo (sub-página Planejamento) depende delas: sem o
// bump, um painel à frente da API mostraria "Not Found" em vez do aviso.
// v15 (Story 48.3): rotas novas `GET/PUT /api/projects/:projectId/funnels/
// :funnelId/planejamento/organicos` (aba 2 do Painel de Planejamento — blocos
// por canal orgânico e cinco combinações) e as tabelas `plan_organic_blocks` e
// `plan_organic_combinations`. ADITIVA; `packages/mcp` não é afetado. A aba
// "Leads Orgânicos" do web depende delas: sem o bump, um painel à frente da
// API mostraria "Not Found" em vez do aviso de versão.
// v16 (Story 48.4): rotas novas `GET/PUT /api/projects/:projectId/funnels/
// :funnelId/planejamento/pagos` (aba 3 do Painel de Planejamento — blocos por
// fonte paga e cinco combinações) e as tabelas `plan_paid_blocks` e
// `plan_paid_combinations`. ADITIVA; `packages/mcp` não é afetado. A aba
// "Leads Pagos" do web depende delas.
// v17 (Story 48.5): rotas novas `GET/PUT /api/projects/:projectId/funnels/
// :funnelId/planejamento/resumo` (aba 4 do Painel de Planejamento — rótulos
// dos cinco cenários) e a tabela `plan_final_scenarios`. ADITIVA;
// `packages/mcp` não é afetado. A aba "Resumo Final" do web depende delas.
// v18 (Story 48.9): rota nova `GET /api/projects/:projectId/funnels/:funnelId/
// planejamento/bases` — os lançamentos anteriores do mesmo expert e mesmo tipo
// que já têm simulador salvo, para servirem de base ao preenchimento. ADITIVA;
// `packages/mcp` não é afetado.
// v19 (Story 48.11): rota nova `GET /api/projects/:projectId/funnels/:funnelId/
// planejamento/realizado` — o investimento Meta REALIZADO do lançamento (total,
// quente/frio pelo nome da campanha, janela coberta) e as etapas do funil, para
// a camada B da base de referência. E o campo novo
// `analiseDeOrigem.fontesPagasPorTemperatura` em `buyers-origin`, o corte canal
// × temperatura que alimenta a conversão das quatro fontes pagas do simulador.
// ADITIVA nos dois casos; `packages/mcp` não é afetado. O web tem fallback: sem
// a rota e sem o campo, a camada A (Story 48.9) segue inteira e nada quebra —
// o bump é o que faz o banner acusar a defasagem em vez de o gestor concluir
// que o "real:" não funciona.
// v20 (Story 48.13): `GET /api/projects/:projectId/funnels/:funnelId/
// planejamento/bases` passa a devolver TAMBÉM os lançamentos anteriores sem
// simulador salvo, cada item com o campo novo `temSimulador`; a resposta ganha
// `incluiSemSimulador: true` no nível de cima (o sinal de que a lista já segue
// a regra nova — com `bases: []` não há item onde procurá-lo) e o `tipo` passa
// a ser o do próprio funil. ADITIVA; `packages/mcp` não é afetado. O web tem
// fallback: sem os campos, trata toda base como "com simulador" e mantém a
// frase de hoje para a lista vazia.
// v21 (Stories 29.79 + 29.80, um bump para o par): rota nova `GET /api/projects/
// :projectId/funnels/:funnelId/perpetual/funil-oferta` (funil e oferta de cada
// campanha da etapa, pelo nome ATUAL; dicionário do expert do projeto) e os
// parâmetros `funil`/`oferta` em `perpetual/sales-data`, `sales-data-daily` e
// `hourly`, que com filtro devolvem também `filtro` e `foraDoFiltro`. ADITIVA:
// sem os parâmetros a resposta é byte a byte a de antes, inclusive a rota
// pública do Inácio — `packages/mcp` não é afetado. ⚠️ Uma API anterior IGNORA
// `funil`/`oferta` calada (o `z.object` descarta chave desconhecida) e
// devolveria vendas sem filtro ao lado de mídia filtrada: o painel só manda o
// parâmetro quando a rota nova respondeu (29.80 AC7). Outras stories do lote de
// 23/09 também sobem: quem mergear depois rebaseia e recalcula (PO-13).
// v22 (Story 42.11): rota nova `GET /api/projects/:projectId/funnels/:funnelId/
// stages/:stageId/revenuecat/jornada?days=` — a jornada do usuário do Lyrio por
// canal (Novos → viu paywall → interagiu → iniciou → pagou, com a receita),
// agregada no banco a partir de `revenuecat_sales`. ADITIVA; `packages/mcp` não
// é afetado. O web tem fallback: 404 (API atrás) some com o bloco e deixa o
// banner acusar a defasagem — o bump é o que faz o banner aparecer.
// v23 (Story 29.78 — nasceu v20 e subiu a 21 no rebase sobre a 48.13): rota
// nova `GET /api/projects/:projectId/funnels/:funnelId/vturb/vsls` — todos os vídeos VTurb vinculados às etapas do funil, com os
// brutos de Play Rate e Retenção ao pitch (pitch ATUAL do VTurb) no período,
// para a tabela das VSLs do bloco VSL do perpétuo. Funil sem vídeo = 200 com
// lista vazia. ADITIVA; a `/chain` da Análise MVP não muda; `packages/mcp` não
// é afetado. O web tem fallback: 404 (API antiga) = bloco como era, sem tabela.
export const API_CONTRACT_VERSION = 23;
