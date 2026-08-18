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
export {
  ehCaptacaoPaga,
  temDashboardDeVendas,
  ehEtapaDeCaptacao,
} from "./stage-types.js";
export { normalizarNomeCampanha, temSufixoDeCopia } from "./campaign-name.js";
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
  // o número principal
  cacReal,
  cplReal,
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
} from "./cadeia-cac.js";
export type {
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
