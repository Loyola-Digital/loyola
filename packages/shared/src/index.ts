export type AppConfig = {
  name: string;
  version: string;
};

export const APP_NAME = "Loyola Digital X" as const;

/**
 * Módulos folha (`./contract.ts`, `./stage-types.ts`): existem separados porque
 * o webpack do Next não resolve a cadeia de imports NodeNext deste índice.
 *
 * **Cada lado tem UM caminho válido — não são intercambiáveis:**
 *
 * | Lado | Import | Por quê |
 * |---|---|---|
 * | web | `@loyola-x/shared/src/<módulo>` | `transpilePackages` compila o `.ts`; o índice não resolve no webpack |
 * | API | `@loyola-x/shared` (bare, por aqui) | resolve por `main` → `dist/index.js` |
 *
 * A API **não pode** usar o subpath: o `tsc` não reescreve especificadores, então
 * o `dist/` sairia apontando para `src/<módulo>` sem extensão — e `src/` só tem
 * `.ts`. Em ESM o Node exige extensão explícita e o pacote não declara
 * `exports`, então o import falha com `ERR_MODULE_NOT_FOUND` **em runtime**, sem
 * que `tsc --noEmit`, `vitest` ou `next build` acusem nada.
 *
 * Story 19.14: uma redação anterior deste comentário dizia que a API "pode usar
 * qualquer um dos dois". Pode não — seguir aquilo derrubou o boot da API inteira
 * (3 módulos do caminho de boot importam `utils/stage-types.js`), e o defeito só
 * apareceu quando o @qa rodou `node dist/routes/stage-sales-data.js`.
 */
export { API_CONTRACT_VERSION } from "./contract.js";
export { TOOLS_DO_MCP, type ToolDoMcp } from "./mcp-tools.js";
export {
  ehCaptacaoPaga,
  temDashboardDeVendas,
  ehEtapaDeCaptacao,
  tiposEquivalentes,
} from "./stage-types.js";
export { normalizarNomeCampanha, temSufixoDeCopia } from "./campaign-name.js";
// Story 47.1: normalização e formato dos códigos que entram no nome da
// campanha do perpétuo (expert, produto, funil, oferta, LP, valor fixo) e o
// slug da LP. A tela mostra ao vivo e a API decide — uma função só. Módulo
// folha: o web importa por `@loyola-x/shared/src/nomenclatura-codigos`.
export {
  FORMATO_DO_CODIGO,
  normalizarCodigo,
  montarSlugDeLp,
  proximoCodigoNumerado,
  proximoCodigoDeLp,
  type TipoDeCodigo,
  type Normalizacao,
} from "./nomenclatura-codigos.js";
// Story 47.3: o nome da campanha do perpétuo — montar (`buildCampaignName`) e
// ler/validar contra um snapshot do dicionário (`parseCampaignName`). Módulo
// folha: o web importa por `@loyola-x/shared/src/nomenclatura-de-campanha`.
export {
  SEPARADOR,
  OFMIX,
  LPMIX,
  NA,
  PERPETUO,
  ORDEM_DO_NOME,
  ORDEM_DOS_CAMPOS,
  TOTAL_DE_CAMPOS,
  TOTAL_DE_SEPARADORES,
  DICA_DO_PADRAO_ANTIGO,
  CAMPO,
  buildCampaignName,
  pedacosDoNome,
  parseCampaignName,
  type CampoDoNome,
  type PosicaoDoNome,
  type BlocoDoNome,
  type CampaignFields,
  type PedacoDoNome,
  type DicionarioSnapshot,
  type ParseResult,
} from "./nomenclatura-de-campanha.js";
// Story 47.9: o nome da VSL — `vsl_expert_produto_lead_problema_solucao_oferta`.
// Módulo folha: o web importa por `@loyola-x/shared/src/nomenclatura-de-vsl`.
export {
  PREFIXO_VSL,
  ORDEM_DA_VSL,
  CAMPOS_DA_VSL,
  CAMPO_DA_VSL,
  TIPOS_DE_VARIAVEL,
  PREFIXO_DA_VARIAVEL,
  TIPO_DE_CODIGO_DA_VARIAVEL,
  TOTAL_DE_CAMPOS_DA_VSL,
  buildVslName,
  pedacosDaVsl,
  parseVslName,
  type CampoDaVsl,
  type PosicaoDaVsl,
  type BlocoDaVsl,
  type TipoDeVariavel,
  type VslFields,
  type PedacoDaVsl,
  type VslSnapshot,
  type VslParseResult,
} from "./nomenclatura-de-vsl.js";
// Story 47.10: o nome do anúncio — `{tipo}{NN}_{expert}_{sigla}{NN}_{mm-aaaa}--{descricao}`.
// Módulo folha: o web importa por `@loyola-x/shared/src/nomenclatura-de-anuncio`.
export {
  SEPARADOR_DA_DESCRICAO,
  FORMATO_DA_DATA_DO_ANUNCIO,
  ORDEM_DO_ANUNCIO,
  CAMPO_DO_ANUNCIO,
  doisDigitos,
  mesAnoDe,
  primeiroDiaDoMes,
  buildAdName,
  pedacosDoAnuncio,
  parseAdName,
  type AdFields,
  type AdSnapshot,
  type AdParseResult,
  type PedacoDoAnuncio,
  type PosicaoDoAnuncio,
  type BlocoDoAnuncio,
  // Story 47.12: hook e body do vídeo
  TIPOS_DE_PARTE_DO_VIDEO,
  PREFIXO_DA_PARTE_DO_VIDEO,
  TIPO_DE_CODIGO_DA_PARTE_DO_VIDEO,
  ROTULO_DA_PARTE_DO_VIDEO,
  type TipoDeParteDoVideo,
} from "./nomenclatura-de-anuncio.js";
// Story 47.5: campanhas legadas — filtro por token e sugestão de classificação
// a partir do nome antigo. Módulo folha (web: subpath `src/nomenclatura-legado`).
export {
  REGEX_LEGADA_SQL,
  ehCandidataALegada,
  sugerirClassificacao,
  type SugestaoDeClassificacao,
  type CampoSugerido,
} from "./nomenclatura-legado.js";
// Story 18.71: o `utm_content` efetivo de uma célula de planilha — o `co=` chega
// em três formatos e só um deles é o ad_id puro. Módulo folha: o web importa por
// subpath (`@loyola-x/shared/src/utm-value`), a API por aqui.
export { utmContentEfetivo, normalizeNumericId } from "./utm-value.js";
// Story 18.71 (achado): número de célula de planilha em pt-BR/en-US. Três rotas
// liam "1.097,00" como 1,097 porque o replace trocava só a primeira vírgula.
export { parseNumeroPtBr, parseValorPlanilha } from "./numero-ptbr.js";
// Story 29.59: a identidade de uma landing page. Compartilhada porque o
// dashboard e o relatório TÊM que agrupar as mesmas URLs na mesma linha.
export { normalizeLpUrl, lpLabel, type LpKey } from "./lp-url.js";
// Story 44.28: os KPIs do topo do perpétuo — compartilhados entre a tela e a
// API pública, para o Inácio não recompor a conta por fora.
export { calcularMetricasDoPerpetuo } from "./perpetuo-metricas.js";
// Story 18.80 — a régua de janela por dias, compartilhada entre API e web.
// Antes existia só na API, e o front tinha a sua, errada por um dia.
export { inicioDaJanela, shiftDayKey } from "./janela-de-dias.js";
// Story 44.30 — o veredito do Resumão, por regra e não por julgamento do agente.
export {
  vereditoDoPerpetuo,
  roasDeEquilibrio,
  META_DE_ROAS,
  type Veredito,
  type Cor,
  type EntradaDoVeredito,
  type TaxasDaPlataforma,
} from "./veredito-do-perpetuo.js";
export type {
  MidiaDoPerpetuo,
  VendasDoPerpetuo,
  EntradaDasMetricas,
  MetricasDoPerpetuo,
} from "./perpetuo-metricas.js";
// Story 18.78: CTR e CPC de clique no link, sem fallback. Módulo folha — o web
// importa por subpath (`@loyola-x/shared/src/clique-no-link`), a API por aqui.
// Existiam três cópias desta fórmula e duas ainda tinham o fallback que o
// gestor tirou em 2026-09-03.
export { ctrDeLink, cpcDeLink, somarLinkClicks } from "./clique-no-link.js";
// Story 43.8: as três camadas do vídeo. Módulo folha — o web importa por
// subpath (`@loyola-x/shared/src/video-camadas`), a API por aqui.
export {
  ALVOS,
  PISO_DE_REPRODUCOES,
  ROTULO_DA_CAMADA,
  ROTULO_DA_TAXA,
  calcularTaxas,
  taxaDaCamada,
  anguloDoNome,
  avaliar,
  ranquearPorCamada,
  avaliarContraAlvo,
  classificar,
  sugerirRemontagens,
  mediana as medianaDeVideo,
} from "./video-camadas.js";
export type {
  Camada,
  CriativoDeVideo,
  TaxasDoVideo,
  CriativoAvaliado,
  AvaliacaoContraAlvo,
  ClasseDoCriativo,
  Remontagem,
} from "./video-camadas.js";
export {
  // fronteira de unidade
  dePercentual,
  paraPercentual,
  // família
  classificarFamilia,
  // agregação e métricas
  agregadoVazio,
  agregar,
  calcularMetricas,
  // o número principal (núcleo sem janela — @deprecated, ver Story 44.26)
  cacReal,
  cplReal,
  // razão com janela obrigatória (Story 44.26) — o caminho de produção
  mesmoPeriodo,
  razaoNaJanela,
  cacRealNaJanela,
  cplRealNaJanela,
  roasNaJanela,
  // cadeia de decomposição
  custoDaCadeia,
  cliquesPorConversao,
  // janela e teto
  janelasDe7Dias,
  baseDaMetrica,
  selo,
  coberturaAtipica,
  mediana,
  DESVIO_COBERTURA_MAXIMO,
  // ranking
  DIRECAO,
  POSICAO_NA_CADEIA,
  quedaReal,
  ranquear,
  compostoNoTeto,
  decomporCPC,
  // composição do teto (44.7)
  calcularTetos,
  tetosResolvidos,
  montarRanking,
  metricasDoTeto,
  // benchmark de referência (44.8)
  referenciasDoGrupo,
  // sinalização (44.9)
  sinalizar,
  alvoVigente,
  TOLERANCIA_DO_ALVO,
  // Story 44.11 — o bloco de criativos
  agruparCriativos,
  distribuicaoDoHook,
  normalizarNomeDeCriativo,
} from "./cadeia-cac.js";
export type {
  CriativoBruto,
  CriativoDaAba,
  DistribuicaoHook,
  Familia,
  MotivoIndisponivel,
  Confianca,
  Metrica,
  DiaBruto,
  Agregado,
  Metricas,
  Teto,
  TetoAusente,
  ItemRanking,
  Janela,
  CoberturaDiaria,
  SerieDeCampanha,
  OpcoesTeto,
  TetosDoGrupo,
  ReferenciasDoGrupo,
  Selo,
  Periodo,
  Medido,
  MotivoDaRazao,
  Razao,
} from "./cadeia-cac.js";

export type {
  MindArtifactPaths,
  MindMetadata,
  MindSummary,
  MindDetail,
  Squad,
  SquadAccess,
} from "./types/mind.js";

export type { ChatRequest, SSEEvent } from "./types/chat.js";

export type {
  TaskStatus,
  TaskPriority,
  CreateTaskRequest,
  DelegatedTask,
} from "./types/task.js";

export type { UserRole, User } from "./types/user.js";

export type {
  Conversation,
  Message,
  ConversationListResponse,
  MessageListResponse,
} from "./types/conversation.js";

export type {
  FunnelType,
  FunnelCampaign,
  SwitchyFolderRef,
  SwitchyLinkRef,
  StageType,
  StageSalesSubtype,
  SaleColumnMapping,
  StageSalesSpreadsheet,
  StageSalesProduct,
  StageSalesProductsResponse,
  PerpetualSpreadsheet,
  // Story 29.49
  PerpetualProduct,
  PerpetualProductType,
  SalesPlatform,
  PerpetualSalesData,
  PerpetualSalesDataDaily,
  // Story 29.69: as duas agregações da seção "Análise detalhada no período".
  PerpetualHourlyData,
  PerpetualHourlyPosition,
  LinhaDeOrigemPerpetuo,
  PerpetualUpsellSpreadsheet,
  PerpetualUpsellData,
  FunnelStage,
  StageSalesData,
  Funnel,
  ComparisonDayMetrics,
  MetaAdsComparisonData,
  OrphanCampaign,
  OrphanStageGroup,
  OrphanCampaignsResponse,
} from "./types/funnel.js";

export { PLATFORM_FEE_RATES } from "./types/funnel.js";

export type {
  SprintDashboardBlockFilters,
  SprintDashboardBlock,
  SprintDashboardConfig,
  SprintCampaignPhase,
  SprintContextSection,
} from "./types/sprint-dashboard.js";

export type {
  OrganicPostSource,
  StageOrganicPost,
  YouTubeOrganicMetrics,
  InstagramOrganicMetrics,
  OrganicPostMetrics,
  OrganicPostHydration,
  StageOrganicPostHydrated,
  OrganicPostLinksMap,
} from "./types/organic-post.js";

export type {
  PostSummary,
  AccountReportTotals,
  AccountReportFollowers,
  AccountReportMediaDistribution,
  AccountReportDailyPoint,
  AccountReportDemographics,
  AccountReportDeltaItem,
  AccountReportDelta,
  AccountReport,
  MonthlyReportData,
  InstagramMonthlyReportRecord,
  InstagramMonthlyReportListItem,
} from "./types/instagram-report.js";

export type {
  FunnelGroupsSpreadsheetLink,
  FunnelGroupsSyncResult,
  FunnelGroupsDailyPoint,
  FunnelGroupsCampaignSeries,
  FunnelGroupsKpis,
  FunnelGroupsDailyResponse,
} from "./types/funnel-groups.js";

export type {
  ManualSale,
  ManualSaleSellerRanking,
  ManualSalesSummary,
  ManualSalesResponse,
  CreateManualSaleInput,
  InvoiceStatus,
} from "./types/manual-sales.js";

export type {
  MemberkitEnrollmentStatus,
  MemberkitMemberStatus,
  MemberkitConnectionStatus,
  MemberkitClassroom,
  MemberkitCourse,
  StageMemberkitEnrollment,
  SetStageMemberkitEnrollmentInput,
} from "./types/memberkit.js";

export type {
  EventProduct,
  EventCloser,
  EventProductInput,
  EventCloserInput,
  FunnelSalesSpreadsheetRef,
  EventLead,
  EventLeadStatus,
  EventLeadSale,
  EventMapLead,
  EventRevenueMatchInfo,
  EventMapSummary,
  EventMapResponse,
  SettableEventLeadStatus,
  SetEventLeadStatusInput,
  SetEventLeadSellerInput,
  SetEventLeadSellerBulkInput,
  EventLeadAnswer,
  EventLeadAnswerGroup,
  EventLeadAnswersResponse,
} from "./types/event-config.js";

export type {
  SalesPlanSourceRole,
  SalesPlanSourceMapping,
  SalesPlanSource,
  SalesPlanSourceInput,
  SalesPlanRule,
  SalesPlanRuleInput,
  SalesPlanParticipant,
  SalesPlanTierGroup,
  SalesPlanTypeCount,
  SalesPlanSummary,
  SalesPlanResponse,
} from "./types/sales-plan.js";
