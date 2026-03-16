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
]);

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
