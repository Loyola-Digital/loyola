import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  date,
  integer,
  boolean,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
  unique,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================
// ENUMS
// ============================================================

export const userRoleEnum = pgEnum("user_role", [
  "copywriter",
  "strategist",
  "manager",
  "admin",
  "guest",
]);

export const userStatusEnum = pgEnum("user_status", ["active", "pending", "blocked"]);

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "open",
  "in_progress",
  "review",
  "done",
  "cancelled",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "urgent",
  "high",
  "normal",
  "low",
]);

// ============================================================
// TABLES
// ============================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkId: text("clerk_id").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    role: userRoleEnum("role").notNull().default("copywriter"),
    status: userStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_users_clerk_id").on(table.clerkId),
    uniqueIndex("uq_users_email").on(table.email),
  ]
);

// ============================================================
// PROJECTS TABLES (EPIC-4)
// ============================================================

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    clientName: varchar("client_name", { length: 100 }).notNull(),
    description: text("description"),
    color: varchar("color", { length: 7 }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_projects_created_by").on(table.createdBy),
  ]
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mindId: text("mind_id").notNull(),
    mindName: text("mind_name").notNull(),
    squadId: text("squad_id").notNull(),
    title: text("title"),
    messageCount: integer("message_count").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_conversations_user_updated")
      .on(table.userId, table.updatedAt)
      .where(sql`deleted_at IS NULL`),
    index("idx_conversations_user_mind")
      .on(table.userId, table.mindId)
      .where(sql`deleted_at IS NULL`),
    index("idx_conversations_project").on(table.projectId),
    check("chk_message_count_positive", sql`message_count >= 0`),
    check("chk_total_tokens_positive", sql`total_tokens >= 0`),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    tokensUsed: integer("tokens_used"),
    metadata: jsonb("metadata").$type<{
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      taskDetected?: boolean;
      finishReason?: string;
      attachments?: Array<{
        filename: string;
        mimeType: string;
        textLength: number;
      }>;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_messages_conversation_created").on(
      table.conversationId,
      table.createdAt
    ),
    check("chk_message_content_not_empty", sql`length(content) > 0`),
  ]
);

export const delegatedTasks = pgTable(
  "delegated_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mindId: text("mind_id").notNull(),
    clickupTaskId: text("clickup_task_id").notNull(),
    clickupUrl: text("clickup_url").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("open"),
    priority: taskPriorityEnum("priority").notNull().default("normal"),
    tags: text("tags").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_tasks_user_created").on(table.userId, table.createdAt),
    index("idx_tasks_user_status").on(table.userId, table.status),
    index("idx_tasks_conversation").on(table.conversationId),
    uniqueIndex("uq_tasks_clickup_task_id").on(table.clickupTaskId),
    check("chk_task_title_not_empty", sql`length(title) > 0`),
    check("chk_task_clickup_url", sql`clickup_url LIKE 'https://%'`),
  ]
);

// ============================================================
// INSTAGRAM TABLES (EPIC-3)
// ============================================================

export const instagramAccounts = pgTable(
  "instagram_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountName: varchar("account_name", { length: 100 }).notNull(),
    instagramUserId: varchar("instagram_user_id", { length: 50 }).notNull(),
    instagramUsername: varchar("instagram_username", { length: 50 }),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    accessTokenIv: text("access_token_iv").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    profilePictureUrl: text("profile_picture_url"),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_ig_accounts_instagram_user_id").on(table.instagramUserId),
    index("idx_ig_accounts_user").on(table.userId),
  ]
);

// Many-to-many: one Instagram account can belong to multiple projects
export const instagramAccountProjects = pgTable(
  "instagram_account_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => instagramAccounts.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_ig_account_project").on(table.accountId, table.projectId),
    index("idx_ig_account_projects_account").on(table.accountId),
    index("idx_ig_account_projects_project").on(table.projectId),
  ]
);

// ============================================================
// GUEST ACCESS TABLES (EPIC-5)
// ============================================================

export const projectInvitations = pgTable(
  "project_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    email: text("email").notNull(),
    token: text("token").notNull().unique(),
    permissions: jsonb("permissions")
      .notNull()
      .default({ instagram: true, traffic: true, youtubeAds: true, youtubeOrganic: true, conversations: true, mind: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_project_invitations_token").on(table.token),
    index("idx_project_invitations_project").on(table.projectId),
  ]
);

export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("guest"),
    permissions: jsonb("permissions")
      .notNull()
      .default({ instagram: true, traffic: true, youtubeAds: true, youtubeOrganic: true, conversations: true, mind: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_project_members_project_user").on(table.projectId, table.userId),
    index("idx_project_members_project").on(table.projectId),
    index("idx_project_members_user").on(table.userId),
  ]
);

export const projectMinds = pgTable(
  "project_minds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    mindId: text("mind_id").notNull(),
    addedBy: uuid("added_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_project_minds_project_mind").on(table.projectId, table.mindId),
    index("idx_project_minds_project").on(table.projectId),
    index("idx_project_minds_mind").on(table.mindId),
  ]
);

export const instagramMetricsCache = pgTable(
  "instagram_metrics_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => instagramAccounts.id, { onDelete: "cascade" }),
    metricType: varchar("metric_type", { length: 50 }).notNull(),
    metricData: jsonb("metric_data").notNull(),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("uq_ig_metrics_account_type_period").on(
      table.accountId,
      table.metricType,
      table.periodStart,
      table.periodEnd
    ),
    index("idx_ig_metrics_account").on(table.accountId),
    index("idx_ig_metrics_expires").on(table.expiresAt),
  ]
);

// ============================================================
// META ADS TABLES (EPIC-6)
// ============================================================

export const metaAdsAccounts = pgTable(
  "meta_ads_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountName: varchar("account_name", { length: 100 }).notNull(),
    metaAccountId: varchar("meta_account_id", { length: 50 }).notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    accessTokenIv: text("access_token_iv").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_meta_ads_meta_account_id").on(table.metaAccountId),
    index("idx_meta_ads_created_by").on(table.createdBy),
  ]
);

export const metaAdsAccountProjects = pgTable(
  "meta_ads_account_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => metaAdsAccounts.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_meta_ads_account_project").on(table.accountId, table.projectId),
    index("idx_meta_ads_account_projects_account").on(table.accountId),
    index("idx_meta_ads_account_projects_project").on(table.projectId),
  ]
);

// ============================================================
// GOOGLE ADS TABLES (EPIC-12)
// ============================================================

export const googleAdsAccounts = pgTable(
  "google_ads_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountName: varchar("account_name", { length: 100 }).notNull(),
    customerId: varchar("customer_id", { length: 20 }).notNull(),
    developerTokenEncrypted: text("developer_token_encrypted").notNull(),
    developerTokenIv: text("developer_token_iv").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    refreshTokenIv: text("refresh_token_iv").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_google_ads_customer_id").on(table.customerId),
    index("idx_google_ads_created_by").on(table.createdBy),
  ]
);

export const googleAdsAccountProjects = pgTable(
  "google_ads_account_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => googleAdsAccounts.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_google_ads_account_project").on(table.accountId, table.projectId),
    index("idx_google_ads_account_projects_account").on(table.accountId),
    index("idx_google_ads_account_projects_project").on(table.projectId),
  ]
);

// ============================================================
// YOUTUBE CHANNELS TABLES (EPIC-13)
// ============================================================

export const youtubeChannels = pgTable(
  "youtube_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelId: varchar("channel_id", { length: 50 }).notNull(),
    channelName: varchar("channel_name", { length: 255 }).notNull(),
    thumbnailUrl: text("thumbnail_url"),
    subscriberCount: integer("subscriber_count").default(0),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    refreshTokenIv: text("refresh_token_iv").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_youtube_channel_id").on(table.channelId),
    index("idx_youtube_channels_created_by").on(table.createdBy),
  ]
);

export const youtubeChannelProjects = pgTable(
  "youtube_channel_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => youtubeChannels.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_youtube_channel_project").on(table.channelId, table.projectId),
    index("idx_youtube_channel_projects_channel").on(table.channelId),
    index("idx_youtube_channel_projects_project").on(table.projectId),
  ]
);

// ============================================================
// FUNNELS TABLES (EPIC-10)
// ============================================================

export const funnelTypeEnum = pgEnum("funnel_type", ["launch", "perpetual"]);

export const funnels = pgTable(
  "funnels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    type: funnelTypeEnum("type").notNull(),
    metaAccountId: uuid("meta_account_id").references(() => metaAdsAccounts.id, {
      onDelete: "set null",
    }),
    campaigns: jsonb("campaigns")
      .notNull()
      .default([])
      .$type<{ id: string; name: string }[]>(),
    googleAdsAccountId: uuid("google_ads_account_id").references(
      () => googleAdsAccounts.id,
      { onDelete: "set null" }
    ),
    googleAdsCampaigns: jsonb("google_ads_campaigns")
      .notNull()
      .default([])
      .$type<{ id: string; name: string }[]>(),
    switchyFolderIds: jsonb("switchy_folder_ids")
      .notNull()
      .default([])
      .$type<{ id: number; name: string }[]>(),
    switchyLinkedLinks: jsonb("switchy_linked_links")
      .notNull()
      .default([])
      .$type<{ uniq: number; id: string; domain: string }[]>(),
    compareFunnelId: uuid("compare_funnel_id").references(
      (): AnyPgColumn => funnels.id,
      { onDelete: "set null" }
    ),
    lastAuditAt: timestamp("last_audit_at", { withTimezone: true }),
    lastAuditBy: uuid("last_audit_by").references(() => users.id, {
      onDelete: "set null",
    }),
    auditStatus: varchar("audit_status", { length: 20 }).default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_funnels_project").on(table.projectId),
  ]
);

// ============================================================
// FUNNEL STAGES (EPIC-19)
// ============================================================

export const funnelStages = pgTable(
  "funnel_stages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    funnelId: uuid("funnel_id")
      .notNull()
      .references(() => funnels.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    metaAccountId: uuid("meta_account_id").references(() => metaAdsAccounts.id, {
      onDelete: "set null",
    }),
    campaigns: jsonb("campaigns")
      .notNull()
      .default([])
      .$type<{ id: string; name: string }[]>(),
    googleAdsAccountId: uuid("google_ads_account_id").references(
      () => googleAdsAccounts.id,
      { onDelete: "set null" }
    ),
    googleAdsCampaigns: jsonb("google_ads_campaigns")
      .notNull()
      .default([])
      .$type<{ id: string; name: string }[]>(),
    switchyFolderIds: jsonb("switchy_folder_ids")
      .notNull()
      .default([])
      .$type<{ id: number; name: string }[]>(),
    switchyLinkedLinks: jsonb("switchy_linked_links")
      .notNull()
      .default([])
      .$type<{ uniq: number; id: string; domain: string }[]>(),
    stageType: varchar("stage_type", { length: 10 }).notNull().default("free"),
    sortOrder: integer("sort_order").notNull().default(0),
    lastAuditAt: timestamp("last_audit_at", { withTimezone: true }),
    lastAuditBy: uuid("last_audit_by").references(() => users.id, {
      onDelete: "set null",
    }),
    auditStatus: varchar("audit_status", { length: 20 }).default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_funnel_stages_funnel").on(table.funnelId),
  ]
);

// ============================================================
// STAGE SALES SPREADSHEETS (EPIC-19 — Story 19.5)
// ============================================================

export const stageSalesSpreadsheets = pgTable(
  "stage_sales_spreadsheets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => funnelStages.id, { onDelete: "cascade" }),
    subtype: varchar("subtype", { length: 20 }).notNull(),
    spreadsheetId: varchar("spreadsheet_id", { length: 255 }).notNull(),
    spreadsheetName: varchar("spreadsheet_name", { length: 255 }).notNull(),
    sheetName: varchar("sheet_name", { length: 255 }).notNull(),
    columnMapping: jsonb("column_mapping")
      .notNull()
      .default({})
      .$type<{
        email: string;
        valorBruto?: string;
        valorLiquido?: string;
        formaPagamento?: string;
        canalOrigem?: string;
        dataVenda?: string;
        utm_source?: string;
        utm_medium?: string;
        utm_campaign?: string;
        utm_content?: string;
        utm_term?: string;
      }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_stage_sales_spreadsheets_stage_subtype").on(table.stageId, table.subtype),
    index("idx_stage_sales_spreadsheets_stage").on(table.stageId),
  ]
);

// ============================================================
// FUNNEL SURVEYS (EPIC-14 — Google Sheets)
// ============================================================

export const funnelSurveys = pgTable(
  "funnel_surveys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    funnelId: uuid("funnel_id")
      .notNull()
      .references(() => funnels.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id").references(() => funnelStages.id, {
      onDelete: "cascade",
    }),
    spreadsheetId: varchar("spreadsheet_id", { length: 255 }).notNull(),
    spreadsheetName: varchar("spreadsheet_name", { length: 255 }).notNull(),
    sheetName: varchar("sheet_name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_funnel_surveys_funnel").on(table.funnelId),
    index("idx_funnel_surveys_stage").on(table.stageId),
  ]
);

// ============================================================
// LEAD SCORING SCHEMAS (Story 22.1 — v2 enriquecido)
// ============================================================

export const stageLeadScoringSchemas = pgTable(
  "stage_lead_scoring_schemas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stageId: uuid("stage_id")
      .notNull()
      .unique()
      .references(() => funnelStages.id, { onDelete: "cascade" }),
    surveyId: uuid("survey_id").references(() => funnelSurveys.id, {
      onDelete: "set null",
    }),
    schemaJson: jsonb("schema_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_lead_scoring_stage").on(table.stageId),
  ]
);

// ============================================================
// SALES PRODUCTS & SPREADSHEET MAPPINGS (Settings — Sales Integration)
// ============================================================

export const salesProductTypeEnum = pgEnum("sales_product_type", ["inferior", "superior"]);

export const salesProducts = pgTable(
  "sales_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    type: salesProductTypeEnum("type").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_sales_products_project").on(table.projectId),
  ]
);

export const salesSpreadsheetMappings = pgTable(
  "sales_spreadsheet_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => salesProducts.id, { onDelete: "cascade" }),
    spreadsheetId: varchar("spreadsheet_id", { length: 255 }).notNull(),
    spreadsheetName: varchar("spreadsheet_name", { length: 255 }).notNull(),
    sheetName: varchar("sheet_name", { length: 255 }).notNull(),
    columnMapping: jsonb("column_mapping")
      .notNull()
      .$type<{
        email: string;
        date: string;
        origin?: string;
        type?: string;
        value?: string;
        name?: string;
        phone?: string;
        status?: string;
        utm_source?: string;
        utm_medium?: string;
        utm_campaign?: string;
        utm_content?: string;
        utm_term?: string;
      }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_sales_mappings_product").on(table.productId),
  ]
);

// ============================================================
// FUNNEL SPREADSHEETS (EPIC-17 — Planilhas Genéricas no Funil)
// ============================================================

export const funnelSpreadsheetTypeEnum = pgEnum("funnel_spreadsheet_type", [
  "leads",
  "sales",
  "custom",
]);

export const funnelSpreadsheets = pgTable(
  "funnel_spreadsheets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    funnelId: uuid("funnel_id")
      .notNull()
      .references(() => funnels.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id").references(() => funnelStages.id, {
      onDelete: "cascade",
    }),
    label: varchar("label", { length: 255 }).notNull(),
    type: funnelSpreadsheetTypeEnum("type").notNull(),
    spreadsheetId: varchar("spreadsheet_id", { length: 255 }).notNull(),
    spreadsheetName: varchar("spreadsheet_name", { length: 255 }).notNull(),
    sheetName: varchar("sheet_name", { length: 255 }).notNull(),
    columnMapping: jsonb("column_mapping")
      .notNull()
      .$type<{
        name?: string;
        email?: string;
        phone?: string;
        date?: string;
        status?: string;
        value?: string;
        utm_source?: string;
        utm_medium?: string;
        utm_campaign?: string;
        utm_content?: string;
        utm_term?: string;
      }>(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_funnel_spreadsheets_funnel").on(table.funnelId),
    index("idx_funnel_spreadsheets_stage").on(table.stageId),
  ]
);

