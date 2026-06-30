export type AppConfig = {
  name: string;
  version: string;
};

export const APP_NAME = "Loyola Digital X" as const;

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
  PerpetualSpreadsheet,
  SalesPlatform,
  PerpetualSalesData,
  PerpetualSalesDataDaily,
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
