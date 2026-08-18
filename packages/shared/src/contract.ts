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
export const API_CONTRACT_VERSION = 2;
