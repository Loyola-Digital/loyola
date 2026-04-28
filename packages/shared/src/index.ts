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
  FunnelStage,
  StageSalesData,
  Funnel,
  ComparisonDayMetrics,
  MetaAdsComparisonData,
} from "./types/funnel.js";

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
