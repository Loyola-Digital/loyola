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
// v23 (Story 29.78 — nasceu v20; renumerada no rebase sobre 48.13, 29.79/80 e 42.11): rota
// nova `GET /api/projects/:projectId/funnels/:funnelId/vturb/vsls` — todos os
// vídeos VTurb vinculados às etapas do funil, com os brutos de Play Rate e
// Retenção ao pitch (pitch ATUAL do VTurb) no período,
// para a tabela das VSLs do bloco VSL do perpétuo. Funil sem vídeo = 200 com
// lista vazia. ADITIVA; a `/chain` da Análise MVP não muda; `packages/mcp` não
// é afetado. O web tem fallback: 404 (API antiga) = bloco como era, sem tabela.
// E (AC12) o `overview` do painel por vídeo passa a devolver em
// `player.pitchTime` o pitch ATUAL do VTurb (`null` quando 0 ou ausente), não
// a cópia do vínculo — mesma forma, sem campo novo; o web decide o "—" do
// cartão "Chegaram no pitch" pelo valor, o que também funciona com a API antiga.
// v24 (Story 47.16): nome de anúncio v3 — `launchSeq` passou a aceitar
// ausência/`null` em `POST`/`PATCH /api/nomenclatura/ads` (obrigatória só fora
// da sigla `perpetuo`), `naming_ads.launch_seq` nullable (migration 0157), o
// vídeo novo sai com 5 campos (hook/body fora do nome, gravados), o `name` sem
// descrição termina na data e `validar-nome` aceita nome sem `--` e devolve
// `formato`. NÃO aditiva: a API antiga recusa o `perpetuo` sem número com 400
// do zod — o gerador reconhece (`mensagemDeApiAtrasAoSalvarAnuncio`) e o
// banner acusa. `packages/mcp` não é afetado (nenhuma tool lê o nome de anúncio).
// v25 (Story 18.83): campo novo `lpPorAnuncio` em `creative-performance` (a
// tabela "Desempenho de Testes de LPs" do lançamento passa a identificar a
// página pela URL do anúncio), `cobertura.anuncio` em `lp-funnel` (o mini-funil
// atribui pelo `utm_content → ad_id → URL`), e `lpCampaignUrls` na etapa
// (correção manual por campanha, coluna `funnel_stages.lp_campaign_urls`,
// migration 0158). ADITIVA; `packages/mcp` não é afetado. O web tem fallback:
// sem `lpPorAnuncio`, a tabela segue pelo rótulo da campanha, com o lápis.
// Número do lote de 23/09 — o @devops renumera no merge se outra story do
// lote subir antes.
// v26 (Story 18.84): `applications-daily` agrupa as aplicações pelo LINK DO
// ANÚNCIO de origem (página de vendas) — campos novos `forms[].url`,
// `forms[].semLink` (causas da série "Sem link resolvido") e
// `paginasPeloLinkDoAnuncio`; `lpsOrfas` passa a trazer URLs (só campanhas da
// etapa de Vendas) e `paginasVieramDoUtmTerm` vai sempre `false`.
// `applications-list` ganha `adId`, `lpUrl` e `lpCausa` (e `lp` vira a URL).
// ADITIVA no formato; `packages/mcp` não é afetado. O web tem fallback: sem
// `paginasPeloLinkDoAnuncio`, o gráfico e a lista seguem os textos da 43.6.
// v27 (Story 29.81): o feed público de VSL (43.5, `GET /api/public/meta/v1/
// projects/:projectId/vsl-funnel`) passa a entregar em `pitchRate` a Retenção
// ao pitch "igual o VTurb" — over ÷ (over + under), TRUNCADA em centésimos de
// ponto percentual, com o pitch ATUAL de `/players/list` — e declara a base no
// campo novo `pitchRateBase` (ADITIVO). A CHAVE é a mesma e o número muda
// (NETÃO 5,76 % → 5,58 %): quem consome é externo (Slide 20), avisar antes.
// Uma linha por vínculo, `playRate`/`convPostPitch*` iguais; `packages/mcp` não
// é afetado (não tem tool de VSL). A Análise MVP passa a ler a `/vsls` da 29.78
// (rota que já existe desde a v23); o web tem fallback: 404 da `/vsls` (API
// antiga) = cartão e cadeia pela `/chain`, como eram.
// v28 (Story 47.18): o NN do criativo reinicia por lançamento e por tipo —
// `GET /api/nomenclatura/ads/proximo` ganha `creativeType` e `launchSeq` (e
// passa a considerar `launchType = perpetuo`), e `creativeSeq` muda de
// significado: o próximo livre NO ESCOPO (expert, sigla, nº, tipo), `null`
// enquanto o escopo está incompleto; campo novo `escopo` (o escopo calculado,
// ou `null`). POST/PATCH `ads` validam o NN no escopo (índice
// `uq_naming_ads_escopo_seq`, migration 0159). NÃO aditiva no significado: o
// `z.object` da rota antiga descarta os parâmetros novos em silêncio e devolve
// o NN por expert — o web reconhece a API antiga pela AUSÊNCIA de `escopo` e
// não rotula nem preenche com escopo. `packages/mcp` não é afetado.
// v29 (Story 18.88): campo novo `postUrl` em `creative-performance` — o post
// publicado de cada Ad Name (Instagram, depois Facebook, do ad_id de maior
// investimento entre os que têm link), lido do `meta_ad_creatives_cache`.
// ADITIVA; `packages/mcp` não é afetado. O web tem fallback: sem `postUrl`, a
// coluna Preview mostra "—".
// v30 (Story 49.1): rotas novas da config do gerador de debriefing, por etapa
// do tipo Debriefing — `GET`/`PUT /api/projects/:projectId/funnels/:funnelId/
// stages/:stageId/debriefing/config` e `POST …/debriefing/config/validate`
// (tabela `debriefing_configs`, migration 0161 — aplicada à mão, o deploy não
// a aplica). O GET devolve `config`, `bloqueio` (gate: TIPO_DE_FUNIL_NAO_
// SUPORTADO / COMBINACAO_NAO_VALIDADA / CONFIG_INCOMPLETA), `camposFaltantes`,
// `avisos` (não bloqueiam; `COMPARACAO_REMOVIDA` = comparação apagada depois de
// salvar → edição única, R4-14), `combinacaoLiberada`, `imposto` com
// procedência e `perguntasDisponiveis` por
// etapa (`ok` | `sem-pesquisa` | `falha`). ADITIVA: nenhuma rota existente muda;
// o web ainda não consome (formulário e botão são da 49.6, que precisa tratar
// 404 da rota como "API atrás"). `packages/mcp` não é afetado.
// v31 (Story 49.11): a config do debriefing ganha a LISTA ordenada de
// lançamentos de comparação e a pesquisa de captação por etapa (migration 0162
// — aplicada à mão, o deploy não a aplica). PUT `…/debriefing/config` aceita
// `lancamentosComparacao: uuid[]` (máx. 10; o 1º é a principal) e
// `pesquisaDeCaptacaoPorEtapa: { stageId: surveyId }`; o campo antigo
// `lancamentoComparacaoFunnelId` continua aceito (sozinho = `[id]`; os dois
// divergentes = 400). O GET devolve `lancamentosComparacao` (gravada, com os
// removidos como rastro), `comparacoesRemovidas`, `pesquisaDeCaptacaoPorEtapa`
// e um `COMPARACAO_REMOVIDA` por item removido; `lancamentoComparacaoFunnelId`
// segue = o 1º item. ADITIVA: a API v30 rejeita as chaves novas (corpo
// `.strict()`), então o web só as envia com a API ≥ 31 (49.6 AC7/AC11).
// `packages/mcp` não é afetado.
// v33 (Story 41.12, fatia A — renumerada de 31: a 49.11 levou a 31 e a 49.6
// reservou a 32): campo novo `dedupPessoaProduto` em
// `GET …/stages/:stageId/sales-data` — `{ aplicada, removidas: { linhas, valor },
// naoAplicadaMotivo? }`, o que a camada 2 (a mesma pessoa não compra duas vezes
// o mesmo produto, decisão R5-1 do dono) tirou do período. ADITIVO no formato;
// os NÚMEROS de `sales-data`, `sales-data-daily` e da réplica `sales_daily`
// (rotas públicas de vendas, MCP e o CAC da cadeia do Inácio nas etapas de
// lançamento) mudam — avisados antes do merge (AC11). O web tem fallback: sem o
// campo, nenhuma linha de aviso. `packages/mcp` não é afetado no formato.
// v34 (Story 49.6 — renumerada de 32: a 41.12 fatia A mergeou primeiro e levou
// a 33, como o aviso da própria v32 previa; a 32 fica vaga, e o salto é inócuo
// porque a versão só cresce): rota NOVA `POST /api/projects/:projectId/funnels/
// :funnelId/stages/:stageId/debriefing/generate` (corpo opcional
// `{ investimentoOficial }`; a config vem da 49.1) → 200
// `{ id, html, payload, alertas }` e grava o HTML em `debriefings` + o payload
// em `debriefing_payloads` (migration 0165 — renumerada de 0164, que a 41.12 não
// usou mas o lead-capi sim; aplicada à mão, o deploy não a aplica). 422
// `{ erro, detalhe, acao }`: ETAPA_NAO_E_DEBRIEFING, os do gate da 49.1,
// COMPARACAO_SEM_CONFIG, DADO_INDISPONIVEL, INVARIANTE_VIOLADO (+ `codigo`,
// `violacoes`), CONFERENCIA_EXTERNA; 413 PAYLOAD_TOO_LARGE. O GET
// `…/debriefing/config` ganha `pesquisasPorEtapa` (aditivo). ADITIVA: nenhuma
// rota existente muda de forma; o web trata 404 da rota nova como "API atrás".
// `packages/mcp` não é afetado.
// v35 (Story 49.12 — Debriefing em andamento, captação aberta; migration 0168,
// aplicada à mão — o deploy não a aplica): a config do debriefing ganha
// `situacaoDoLancamento` ("encerrado" | "em-andamento"; omitida no PUT =
// "encerrado", a forma do painel anterior) e `datasChave.aindaNaoAconteceu`
// (fases "ainda não aconteceu" — abertura/fim do carrinho, reabertura e downsell
// passam a aceitar `null` NO MODO EM ANDAMENTO; no encerrado, a regra de sempre).
// O GET da config devolve os dois e `parcialAtual` (a parcial da etapa, ou null).
// `POST …/debriefing/generate` no modo em andamento gera a PARCIAL (corte = ontem
// em Brasília, gravado no payload em `situacao`) e ganha os 422
// SEM_DIA_FECHADO, CARRINHO_JA_ABERTO, MIDIA_DO_CORTE_NAO_SINCRONIZADA e
// COMPARACAO_EM_ANDAMENTO; o 200 ganha `substituiuParcial` (a parcial e o final
// ATUALIZAM a parcial da etapa — mesmo id). `GET /api/debriefings/:id` ganha
// `parcial: { corte, dMaisN } | null` (aviso do viewer). ADITIVA: a API v34
// recusa as chaves novas no PUT (corpo `.strict()`), então o web só oferece o
// "em andamento" com a API ≥ 35 (49.12 AC11). `packages/mcp` não é afetado.
// v36 (Story 49.14 — Debriefing em andamento com o CARRINHO aberto; sem
// migration): `POST …/debriefing/generate` no modo em andamento deixa de
// responder 422 CARRINHO_JA_ABERTO e calcula o carrinho aberto até o corte. O
// payload (200 e `debriefing_payloads`) ganha, aditivos e opcionais:
// `situacao.fases` (carrinho/reabertura/downsell: concluida | em-curso |
// nao-comecou | nao-houve), `situacao.todasAsFasesConcluidas` (R9-5: a janela
// termina no fim da regra 2A), `dinheiroTempo.janela.corte.fases`,
// `coorte.incompleta`, `roasTotalSemTmb.downsellNoCorte` e as lacunas
// COORTE_INCOMPLETA, REABERTURA_AINDA_NAO_COMECOU e DOWNSELL_AINDA_NAO_COMECOU.
// QA 49.14 (REQ-002 do @po): no modo em andamento, a config aceita reabertura/
// downsell ABERTOS com o fim "ainda não aconteceu" — `{ houve: true, abertura,
// fim: null }` + `fimReabertura`/`fimDownsell` em `datasChave.aindaNaoAconteceu`
// (o PUT da v35 recusa as duas chaves no zod; no encerrado, 400 como sempre).
// O GET devolve a mesma forma (`fim` pode ser `null`).
// `DEBRIEFING_PAYLOAD_VERSAO` continua 1 (o render imprime a versão; ver a
// story). Nenhuma rota muda de forma; o web com a v35 mostra o "em andamento"
// como "(captação aberta)" e o 422 da v35 no bloco de erro de sempre.
// `packages/mcp` não é afetado.
// v37 (Story 29.82 — tabela das VSLs com as colunas completas do VTurb; sem
// migration, sem chamada nova ao VTurb): `GET …/funnels/:funnelId/vturb/vsls`
// ganha, ADITIVOS, `videos[].duracao` (segundos, a mesma `video_duration`
// mandada ao `sessions/stats`; `null` sem duração) e, em `videos[].brutos`,
// `viewed` (`total_viewed`), `started` (`total_started`), `clicked`
// (`total_clicked`) e `engagementRate` (`engagement_rate`, %). Nenhum campo
// existente muda; o web com a API v36 mostra "—" nas colunas novas.
// `packages/mcp` não é afetado.
// v38 (código de match por ETAPA — migration 0169): `funnel_stages` ganha
// `match_code`, e `FunnelStage.matchCode` sai no GET/POST/PUT das etapas
// (ADITIVO, `null` por padrão). Preenchido, é a chave COMPLETA com que a etapa
// casa campanha Meta: dispensa o sufixo de fase adivinhado do nome
// (`resolveStagePhaseSuffix`), que devolve `null` — e portanto não casava nada,
// em silêncio — em funil perpétuo, em etapa `cpl`/`event` e em nome ambíguo. No
// perpétuo era estrutural: a regra dos dois primeiros segmentos faz `fz-a1` e
// `fz-a2` virarem o mesmo código. Muda, com o campo preenchido, quem o POST
// auto-popula em `campaigns` e quem o `byStage` de
// `GET …/orphan-campaigns` lista por etapa (agora partindo de todas as
// campanhas não-DELETED, não só das que casam com o código do FUNIL — uma etapa
// com código próprio pode casar campanha que o funil não casa). Vazio, tudo
// igual a antes. O web com a API v37 não mostra nem edita o campo.
// `packages/mcp` não é afetado.
// v39 (qualidade da correspondência do Lead Scoring no Meta — migration 0170):
// `stage_lead_capi` ganha `event_source_url`, exposto como
// `ConfigDoEnvioAoMeta.eventSourceUrl` no GET/PUT do lead-capi (ADITIVO,
// `null` por padrão). Preenchida, o evento passa a sair com
// `event_source_url` e `action_source: "website"` em vez de
// `system_generated` — a Qualidade da Correspondência que o Gerenciador mostra
// só é calculada para evento de SITE. Vazia, nada muda.
// Independente da config, todo evento passa a levar mais parâmetros de
// correspondência em `user_data`: `fn`/`ln` (primeiro e último nome, SHA-256
// sem acento nem pontuação — o nome já era lido da planilha e descartado) e
// `external_id` (hash da chave estável do lead). Nenhuma PII em claro, como
// antes. Medido na Captação Paga do dg-pg05-out-26: 3,00 → 4,92 parâmetros por
// evento.
// Também muda a escolha de coluna em `colunas-da-pesquisa.ts`: a coluna
// MAPEADA perde para a achada por nome quando esta tem 5× mais dado (ver
// `escolherColuna`). Corrige planilha com duas gerações do mesmo formulário, em
// que o mapeamento apontava para a coluna morta — 267 dos 269 leads iam ao Meta
// sem e-mail nem telefone. Afeta o lead-capi e o casamento do Evento
// Presencial; nenhuma rota muda de forma. `packages/mcp` não é afetado.
// v40 (a Kiwify como FONTE de vendas da etapa — migration 0171): tabela nova
// `kiwify_sales` (cache das vendas por projeto, chave `(project_id, sale_id)`),
// `kiwify_connections` ganha `vendas_sync_de/ate/em/total`, e
// `kiwify_stage_configs` ganha `fonte_de_vendas` ('planilha' | 'kiwify') e
// `offer_ids`, com `start_date` deixando de ser NOT NULL.
// Rotas: `POST /api/projects/:projectId/kiwify/sales/sync` (sincroniza; aceita
// `desde`/`ate`) e `GET …/stages/:stageId/kiwify/ofertas` (ofertas com
// contagem + `sincronizadoEm`). O GET/PUT de `…/kiwify/config` ganha
// `fonteDeVendas` e `offerIds` (ADITIVOS) e aceita `startDate: null`.
// ⚠️ MUDANÇA DE COMPORTAMENTO quando `fonte_de_vendas = 'kiwify'`: as quatro
// rotas de venda da etapa (`sales-data`, `sales-conversion`,
// `hot-cold-buyers`, `sales-data-daily`) passam a ler o cache em vez das
// planilhas — a Kiwify SUBSTITUI, não soma (a planilha é espelho da Kiwify e
// somar contaria a mesma venda duas vezes). Com 'planilha', o padrão, nada
// muda. A conferência (`…/kiwify/reconciliation`) passa a responder 409
// `SEM_DATA_DE_INICIO` quando a etapa não tem `start_date`.
// Medido na conta DG & CPDF em 13/10/2026: 574 vendas em 30 dias, 92,3% já com
// `utm_source` da própria Kiwify, 18 ofertas distintas; o filtro de status
// descarta 97 (recusada/aguardando pagamento) e tira R$ 17.818 de faturamento
// que não existia. `packages/mcp` não é afetado.
// v41 (Story 42.12 — vendas do Lyrio separadas entre Meta e Google; sem
// migration): rota NOVA `GET …/stages/:stageId/revenuecat/vendas-por-canal?days=`
// (`canais` Meta · Google · Orgânico ou cupom · Sem atribuição, `conflito`,
// `totalPago`, `metaPorEntidade` por campanha/conjunto/anúncio, `foraDaQuebra`,
// `atributosDesde`). `GET …/revenuecat/jornada` MUDA de forma: a linha
// `campanha` vira `campanha_meta` e `campanha_google`, e a resposta ganha
// `conflito` e `atributosDesde`. O web desenha `linhas[].rotulo` da API, então
// com a API v40 a Jornada segue com a linha antiga e os blocos novos somem
// (404 da rota → banner de versão). `packages/mcp` não é afetado.
// v42 (a janela da etapa na fonte Kiwify — migration 0172):
// `kiwify_stage_configs` ganha `end_date` (aaaa-mm-dd, nulo = janela aberta),
// exposto como `endDate` no GET/PUT de `…/kiwify/config` (ADITIVO). O GET
// `…/kiwify/ofertas` passa a devolver `de` e `ate` por oferta — o período em
// que cada uma vendeu (ADITIVO).
// Por quê: a oferta já separa bem (nenhum `offer_id` medido aparece em mais de
// um produto), mas 8 produtos vendem SEM oferta nenhuma e são justamente os
// reaproveitados em vários funis — Churrasco com Netão, 216 vendas em 92 dias;
// Supervisão Online, 138 em 381. Neles `offer_id` é NULL e não discrimina, e
// sem fim a etapa de um lançamento encerrado segue recebendo venda do
// perpétuo. O `de`/`ate` por oferta é o que permite reconhecer qual oferta é
// desta etapa quando o mesmo produto vende por duas (Super Funcionário com
// Claude 2 Ed.: Lote Promocional 191, Lote 1 95, Lote 2 42).
// ⚠️ MUDANÇA DE COMPORTAMENTO (pequena): o recorte passa a cortar por
// `coalesce(aprovada_em, criada_em)` em vez de `criada_em`, que é a mesma regra
// que o adaptador já usa para datar a venda. Medido: 1 das 1848 vendas pagas
// muda de dia. Sem `endDate`, o resto não muda. `packages/mcp` não é afetado.
// v43 (Story 42.13 — janela do RevenueCat na régua da Meta; sem migration):
// ⚠️ MUDANÇA DE COMPORTAMENTO, sem mudança de forma. `GET …/revenuecat/sales`,
// `…/revenuecat/jornada` e `…/revenuecat/vendas-por-canal` passam a cortar em
// 00:00 (America/Sao_Paulo) de `inicioDaJanela(days)` — N dias de calendário
// em SP, incluindo hoje, como `dateRangeFromDays` da Meta — em vez de
// `agora − days × 24 h`. O diário de `/sales` agrupa pelo dia de SP, não UTC.
// Com `days = 5` em 13/10 a janela era 08/10 14:17 → agora; passa a 09/10 00:00.
// O Google (`services/google-ads.ts`) não muda. `packages/mcp` não é afetado.
// v44 (a conversão Captação → Principal na fonte Kiwify; sem migration):
// `GET …/stages/:stageId/sales-conversion` ganha `fonteKiwify: true` (ADITIVO)
// e devolve zeros quando a etapa está com `fonte_de_vendas = 'kiwify'`.
// ⚠️ CORREÇÃO de comportamento do v40: aquela rota era a quarta a trocar de
// fonte, mas ela cruza o comprador da planilha de captação com o do produto
// principal da MESMA etapa, e precisa saber de qual papel é cada venda. O
// recorte da Kiwify é um só (produtos + ofertas + janela), sem papel: a troca
// colapsava as duas planilhas numa fonte, um dos lados ficava vazio e a tela
// dizia "falta conectar a planilha de Produto Principal" com ela conectada,
// mostrando 0% de conversão. Agora a rota lê as planilhas e, na fonte Kiwify,
// diz que não dá para cruzar. Medido em 13/10/2026: 2 etapas com as duas
// planilhas (1 Captação paga e 1 Vendas com capture+main_product+tmb) e
// nenhuma etapa com a fonte Kiwify ligada ainda — ninguém viu o número falso.
// Também: a planilha virtual da Kiwify passa a herdar o subtype que a ROTA
// pediu em vez de adivinhá-lo pela primeira planilha da etapa — nas 2 (de 8)
// Captações Pagas que ainda não têm planilha ela saía como `main_product`
// numa rota que havia pedido `capture`. Sem efeito na tela hoje (nenhuma rota
// relê esse campo), mas era uma armadilha. `packages/mcp` não é afetado.
// v45 (a fonte de vendas vira configuração da etapa; sem migration):
// `GET …/stages/:stageId/kiwify/ofertas` aceita `?produtos=<csv de productIds>`
// (ADITIVO) e devolve `produtoId` por oferta (ADITIVO). Sem o parâmetro usa os
// produtos SALVOS, como antes.
// Por quê: a lista de ofertas saía dos produtos salvos, então marcar um produto
// na tela e ver as ofertas dele exigia salvar e reabrir — quem trocava de
// produto via as ofertas do anterior. `produtoId` é o que permite soltar a
// oferta marcada quando o produto dela é desmarcado, em vez de ela seguir
// filtrando invisível. No web, o formulário saiu do diálogo do cartão de
// conferência e virou a seção "De onde vêm as vendas" no topo da aba Planilhas
// da etapa (captação paga e Vendas), onde se procura de onde o número vem; o
// diálogo do cartão passou a usar o mesmo formulário. `packages/mcp` não é
// afetado.
// v46 (o order bump voltava zerado quando a planilha tinha reembolso; sem
// migration e sem mudança de forma):
// ⚠️ MUDANÇA DE COMPORTAMENTO nos números de order bump de `sales-data` (e do
// Perpétuo, pelo mesmo utilitário). `transacaoAgrupa` decidia se o
// `transactionId` da planilha é do PEDIDO ou da LINHA contando repetição — e um
// REEMBOLSO repete o id da linha (a Kiwify reenvia a venda com o mesmo id e
// status `refunded`). Com isso a coluna errada passava por id de pedido, cada
// linha virava seu próprio checkout, e o bump do mesmo pedido do ingresso
// aparecia como "venda avulsa". O teste passa a exigir o que define um pedido:
// dois ou mais ids reunindo produtos DIFERENTES.
// Medido em 13-14/10/2026 contra as planilhas reais:
//   dg-pg05-out-26 Captação Paga: 0 de 400 (R$ 1.099 "avulso") → 7 de 384
//     (3,3%), R$ 1.099 de bump acessório e R$ 0,00 de avulso
//   dg-pg02 Captação Paga e Vendas: 0 de 1900 (R$ 34.836 "avulso") → 53 de
//     1862 (3,0%), R$ 6.126 acessório
//   dg-pg04 Vendas: 1 de 1101 (R$ 40.903 "avulso") → 123 de 1099 (22,7%),
//     R$ 24.337 acessório
//   dg-pg04 Captação Paga (a única que mapeia a coluna do pedido): 121 de 1095
//     (21,7%) → INALTERADA
// `LinhaDeVenda` ganha `produto` (opcional) para essa decisão; sem ele o
// utilitário mantém a regra antiga. `packages/mcp` não é afetado.
// v47 (notificações push: canal, alertas de funil e resumo diário; migrations
// 0173, 0174 e 0175):
// ADITIVO — nenhuma rota existente muda de forma.
//   `GET  /api/push/chave-publica` → `{ chave }` (null = push desligado)
//   `GET/POST/DELETE /api/push/inscricoes` — um aparelho por endpoint
//   `POST /api/push/teste` — manda para a própria pessoa
//   `GET/POST /api/projects/:projectId/alertas`, `PUT/DELETE …/alertas/:id`
//   `POST …/alertas/:id/testar` → avalia agora, sem notificar ninguém
//   `GET/PUT /api/notificacoes/projetos` — os projetos que a pessoa segue
//   `GET/PUT /api/notificacoes/preferencias` — resumo ligado/desligado e hora
// A chave pública VAPID sai por rota, e não por `NEXT_PUBLIC_*`, porque web e
// API são deployados em lugares diferentes: chave divergente cria inscrição que
// o serviço de push recusa depois, longe da causa. Sem `VAPID_PUBLIC_KEY` e
// `VAPID_PRIVATE_KEY` as rotas respondem 503 `PUSH_NAO_CONFIGURADO` e o
// agendador não sobe — a feature desligada, não erro de boot.
// O ESCOPO DO ALERTA É O PROJETO, não o funil: o gasto de mídia não é
// registrado por funil nem por etapa (ver o próprio `faturamento.roas` no
// catálogo do BI). CPL ficou de fora porque `trafego.cpl_geral` não é
// calculável no executor — depende do cruzamento lead↔criativo.
// Medido em 14/10/2026 (7 dias): Lyrio dispara as três regras (R$ 620, connect
// rate 0,1%, zero faturamento); PP 1,01 · DG & CPDF 1,40 · BBE 1,37 · FZ 4,96.
// Resumo de 13/10: R$ 3,0k → R$ 8,5k (2,82×). `packages/mcp` não é afetado.
// v48 (o erro de configuração do push para de virar 500; sem migration):
// ADITIVO — `GET /api/push/chave-publica` passa a responder
// `configuracao: "ok" | "ausente" | "invalida"` (+ `detalhe` quando inválida),
// e `POST /api/push/teste` responde `codigo` (`VAPID_INVALIDO`,
// `VAPID_NAO_BATE`, `NENHUM_APARELHO`, `PUSH_NAO_CONFIGURADO`) com a frase
// legível em `error` — que é o campo que o cliente do web mostra.
// ⚠️ CORREÇÃO: `setVapidDetails` LANÇA quando a configuração não tem a forma
// certa, e a chamada estava fora de qualquer try, então testar a notificação
// devolvia "Erro interno do servidor". Medido: `VAPID_SUBJECT` vazio (o painel
// de deploy cria a variável em branco) ou com e-mail cru, e chave com aspas ou
// espaço do copiar-e-colar, todos LANÇAM; já chave com um caractere trocado ou
// pública de um par com privada de outro passam e falham só no envio (403).
// Agora o `mailto:` é posto quando o valor é claramente um e-mail, aspas e
// espaços são aparados, e o resto vira motivo. 403 NÃO apaga a inscrição (par
// descasado é erro do servidor, não aparelho morto); só 404/410 limpam.
// O cache da configuração passou a ser pelo VALOR aplicado: com o booleano
// anterior, uma configuração boa grudava no processo e uma troca de chave
// nunca era reavaliada. `packages/mcp` não é afetado.
// v49 (a regra de alerta passa a valer para TODOS os projetos; migration 0176):
// ⚠️ MUDANÇA DE ENDEREÇO — o CRUD de regras sai de
// `/api/projects/:projectId/alertas` e vai para `/api/notificacoes/alertas`,
// com `projectId` no CORPO (nulo = todos os projetos). Sem transição porque a
// feature nasceu hoje (v47) e `alert_rules` está vazia em produção.
// Por quê: "ROAS abaixo de 1" é a mesma conta em qualquer funil, e recriar a
// regra projeto a projeto é trabalho repetido que envelhece mal — a regra
// nasce global e escolher um projeto é a exceção.
// `project_id` vira NULLABLE e o "já avisou hoje" sai da regra para a tabela
// nova `alert_rule_state` (regra, projeto): a mesma regra global dispara em
// projetos diferentes no mesmo dia, e um `last_sent_date` na regra calaria
// todos depois do primeiro aviso. A coluna `alert_rules.last_sent_date` é
// REMOVIDA (nasceu na 0174, tabela vazia).
// A listagem devolve `projeto` (nome ou nulo) e `alcance` (quantas pessoas
// receberiam); `…/:id/testar` aceita `projectId` no corpo e responde em qual
// projeto conferiu — regra global precisa de um projeto para ter número.
// O recorte continua sendo o PROJETO, nunca o funil: o gasto de mídia não é
// registrado por funil nem por etapa. `packages/mcp` não é afetado.
// v50 (o alerta de faturamento para de disparar sozinho todo dia; sem migration):
// ⚠️ CORREÇÃO de comportamento do v47. A série de vendas (`public_metrics_cache`
// scope `sales-daily`, que é a entidade `faturamento` do BI) é de dias
// FECHADOS: o dia corrente nunca está lá. Medido em 14/10/2026 às 20:56 — o
// cache tinha sido recalculado às 20:45 (BBE) e 16:00 (DG) e o último dia era
// 13/10 nos quatro projetos. Só que o INVESTIMENTO vem do tráfego, que é
// intraday: "hoje" devolvia R$ 1.057 de gasto e R$ 0 de faturamento, e uma
// regra de ROAS com janela de hoje disparava TODO DIA sem nada estar errado.
// Agora a janela das métricas de faturamento é ancorada no último dia fechado
// (janela 1 = esse dia; 7 = os sete até ele), e projeto sem série nenhuma
// responde "sem dado" em vez de zero. Medido depois: PP ROAS 0,86 em 7 dias
// (alerta real), os outros quatro quietos, nenhum falso.
// Pelo mesmo motivo, o RESUMO diário deixa de fora o projeto cuja série ainda
// não alcançou ontem — a linha diria "R$ 1,9k → R$ 0", que é ausência, não
// zero. O rótulo da janela de 1 dia passa a ser "último dia fechado" para
// ROAS e "investiu e não vendeu", e segue "hoje" para connect rate (tráfego é
// intraday). `packages/mcp` não é afetado.
// v51 (Story 42.14 — Lyrio: janelas declaradas; sem migration):
// rota NOVA `GET …/revenuecat/receita?days=N` — a receita BRUTA do RevenueCat
// nos N dias de calendário de SP terminando hoje, pelo endpoint de intervalo
// `/metrics/revenue` (`currency=USD`, `revenue_type=revenue`), ecoando
// `days`/`desde`/`ate`. `…/revenuecat/metricas-derivadas` aceita `?days=N`
// (sem ele, a série inteira, como antes), ECOA `days` e `desde` (`null` sem
// janela: a tela trata a falta do eco como API atrás, PO-10), passa a exigir
// que a etapa seja do funil e do projeto (`getStage`, 404 senão) e devolve
// `serieDesde` no dia de SP. As falhas do RevenueCat (overview e receita) saem
// com `causa` (`limite` → HTTP 429, `permissao`, `outro` → 502) — antes toda
// falha era a mesma frase sobre permissão. `packages/mcp` não é afetado.
export const API_CONTRACT_VERSION = 51;
