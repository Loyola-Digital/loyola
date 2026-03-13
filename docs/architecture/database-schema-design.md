# Database Schema Design: Loyola Digital X

> PostgreSQL 16 + Drizzle ORM — Railway Managed

**Version:** 1.0.0 | **Date:** 2026-03-13 | **Author:** Dara (Data Engineer Agent)
**Based on:** Full-Stack Architecture by Aria (Architect Agent)

---

## 1. Design Principles

| Principle | Implementation |
|-----------|---------------|
| Every table gets baseline columns | `id`, `created_at`, `updated_at` |
| Foreign keys enforce integrity | CASCADE on delete where parent owns children |
| Indexes serve access patterns | Designed from API contract query patterns |
| Soft deletes where audit needed | `deleted_at` on conversations (users may want to recover) |
| Constraints at DB level | CHECK, NOT NULL, UNIQUE — don't trust the app layer alone |
| Comments embedded | `COMMENT ON` for every table and non-obvious column |
| UUIDs as primary keys | `gen_random_uuid()` — no sequential ID exposure |

---

## 2. Access Patterns (Drives Index Design)

Extracted from API contracts in the architecture document:

| Query | Frequency | Tables | Filter/Sort |
|-------|-----------|--------|-------------|
| Get user by clerk_id | Every request (auth) | users | `WHERE clerk_id = ?` |
| List conversations for user | High | conversations | `WHERE user_id = ? ORDER BY updated_at DESC` |
| List conversations filtered by mind | Medium | conversations | `WHERE user_id = ? AND mind_id = ?` |
| Get messages for conversation | High | messages | `WHERE conversation_id = ? ORDER BY created_at ASC` |
| Paginate messages (cursor) | High | messages | `WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?` |
| List tasks for user | Medium | delegated_tasks | `WHERE user_id = ? ORDER BY created_at DESC` |
| List tasks by status | Medium | delegated_tasks | `WHERE user_id = ? AND status = ?` |
| Count messages per conversation | Low | messages | `COUNT WHERE conversation_id = ?` |
| Get conversation with latest message | Medium | conversations + messages | JOIN + subquery |

---

## 3. Entity Relationship Diagram

```
┌──────────────────────┐
│       users           │
│──────────────────────│
│ id (PK, uuid)        │
│ clerk_id (UNIQUE)    │──── Clerk webhook sync
│ email (UNIQUE)       │
│ name                 │
│ avatar_url           │
│ role (enum)          │
│ created_at           │
│ updated_at           │
└──────────┬───────────┘
           │ 1
           │
           │ N
┌──────────▼───────────┐        ┌──────────────────────┐
│   conversations       │        │   delegated_tasks     │
│──────────────────────│        │──────────────────────│
│ id (PK, uuid)        │◀──┐   │ id (PK, uuid)        │
│ user_id (FK→users)   │   │   │ conversation_id (FK) │──▶ conversations
│ mind_id              │   │   │ message_id (FK)      │──▶ messages
│ mind_name            │   │   │ user_id (FK→users)   │
│ squad_id             │   │   │ mind_id              │
│ title                │   │   │ clickup_task_id (UQ) │
│ message_count        │   │   │ clickup_url          │
│ total_tokens         │   │   │ title                │
│ deleted_at           │   │   │ description          │
│ created_at           │   │   │ status (enum)        │
│ updated_at           │   │   │ priority             │
└──────────┬───────────┘   │   │ tags (text[])        │
           │ 1             │   │ created_at           │
           │               │   │ updated_at           │
           │ N             │   └──────────────────────┘
┌──────────▼───────────┐   │
│      messages         │   │
│──────────────────────│   │
│ id (PK, uuid)        │───┘ (delegated_tasks.message_id)
│ conversation_id (FK) │
│ role (enum)          │
│ content              │
│ tokens_used          │
│ metadata (jsonb)     │
│ created_at           │
└──────────────────────┘
```

---

## 4. Drizzle ORM Schema

```typescript
// packages/api/src/db/schema.ts

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================
// ENUMS
// ============================================================

export const userRoleEnum = pgEnum('user_role', [
  'copywriter',
  'strategist',
  'manager',
  'admin',
]);

export const messageRoleEnum = pgEnum('message_role', [
  'user',
  'assistant',
]);

export const taskStatusEnum = pgEnum('task_status', [
  'pending',     // Task created locally, not yet sent to ClickUp
  'open',        // Created in ClickUp
  'in_progress', // Being worked on
  'review',      // Under review
  'done',        // Completed
  'cancelled',   // Cancelled by user
]);

export const taskPriorityEnum = pgEnum('task_priority', [
  'urgent',  // ClickUp priority 1
  'high',    // ClickUp priority 2
  'normal',  // ClickUp priority 3
  'low',     // ClickUp priority 4
]);

// ============================================================
// TABLES
// ============================================================

// ---- USERS ----
// Synced from Clerk via webhook. Source of truth for identity is Clerk.
// This table stores the local copy for FK relationships and display data.

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkId: text('clerk_id').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  role: userRoleEnum('role').notNull().default('copywriter'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_users_clerk_id').on(table.clerkId),
  uniqueIndex('uq_users_email').on(table.email),
]);


// ---- CONVERSATIONS ----
// A conversation is a chat session between one user and one mind.
// mind_id references the MindRegistry (filesystem), not a DB FK.

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  mindId: text('mind_id').notNull(),
  mindName: text('mind_name').notNull(),      // Denormalized: avoids MindRegistry lookup for listing
  squadId: text('squad_id').notNull(),
  title: text('title'),                        // Auto-generated from first user message (first 80 chars)
  messageCount: integer('message_count').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft delete
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Primary access pattern: list conversations for a user, newest first
  index('idx_conversations_user_updated')
    .on(table.userId, table.updatedAt.desc())
    .where(sql`deleted_at IS NULL`),

  // Secondary: filter by mind within a user's conversations
  index('idx_conversations_user_mind')
    .on(table.userId, table.mindId)
    .where(sql`deleted_at IS NULL`),

  // Constraint: message_count and total_tokens cannot be negative
  check('chk_message_count_positive', sql`message_count >= 0`),
  check('chk_total_tokens_positive', sql`total_tokens >= 0`),
]);


// ---- MESSAGES ----
// Individual messages within a conversation. Append-only (no updates, no deletes).
// content stores the full text. metadata stores optional structured data
// (e.g., task JSON blocks detected, model info, token breakdown).

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  tokensUsed: integer('tokens_used'),           // Total tokens for this message (input+output for assistant)
  metadata: jsonb('metadata').$type<{
    model?: string;                              // e.g., "claude-sonnet-4-6"
    inputTokens?: number;
    outputTokens?: number;
    taskDetected?: boolean;                      // Quick filter without parsing content
    finishReason?: string;                       // "end_turn", "max_tokens", etc.
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Primary access pattern: get messages for a conversation, chronological
  index('idx_messages_conversation_created')
    .on(table.conversationId, table.createdAt),

  // Constraint: content cannot be empty
  check('chk_message_content_not_empty', sql`length(content) > 0`),
]);


// ---- DELEGATED TASKS ----
// Tasks created in ClickUp from chat conversations.
// Tracks the link between a chat message and a ClickUp task.

export const delegatedTasks = pgTable('delegated_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id')
    .references(() => messages.id, { onDelete: 'set null' }),
  userId: uuid('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  mindId: text('mind_id').notNull(),
  clickupTaskId: text('clickup_task_id').notNull(),
  clickupUrl: text('clickup_url').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').notNull().default('open'),
  priority: taskPriorityEnum('priority').notNull().default('normal'),
  tags: text('tags').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Primary: list tasks for a user, newest first
  index('idx_tasks_user_created')
    .on(table.userId, table.createdAt.desc()),

  // Secondary: filter by status
  index('idx_tasks_user_status')
    .on(table.userId, table.status),

  // Secondary: find tasks for a conversation
  index('idx_tasks_conversation')
    .on(table.conversationId),

  // Unique: one ClickUp task ID per record (prevent duplicates)
  uniqueIndex('uq_tasks_clickup_task_id')
    .on(table.clickupTaskId),

  // Constraint: title cannot be empty
  check('chk_task_title_not_empty', sql`length(title) > 0`),

  // Constraint: clickup_url must look like a URL
  check('chk_task_clickup_url', sql`clickup_url LIKE 'https://%'`),
]);
```

---

## 5. Migration SQL (Initial)

```sql
-- Migration: 0001_initial_schema.sql
-- Loyola Digital X — Initial database schema
-- Author: Dara (Data Engineer Agent)
-- Date: 2026-03-13

BEGIN;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('copywriter', 'strategist', 'manager', 'admin');
CREATE TYPE message_role AS ENUM ('user', 'assistant');
CREATE TYPE task_status AS ENUM ('pending', 'open', 'in_progress', 'review', 'done', 'cancelled');
CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'normal', 'low');

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id      TEXT NOT NULL,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  avatar_url    TEXT,
  role          user_role NOT NULL DEFAULT 'copywriter',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_users_clerk_id UNIQUE (clerk_id),
  CONSTRAINT uq_users_email UNIQUE (email)
);

COMMENT ON TABLE users IS 'Loyola Digital employees synced from Clerk. Source of truth for identity is Clerk; this table stores FK-referenced copy.';
COMMENT ON COLUMN users.clerk_id IS 'Clerk user ID (user_xxx). Set by webhook, never changes.';
COMMENT ON COLUMN users.role IS 'Functional role within Loyola Digital. Affects UI permissions.';


CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mind_id         TEXT NOT NULL,
  mind_name       TEXT NOT NULL,
  squad_id        TEXT NOT NULL,
  title           TEXT,
  message_count   INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  total_tokens    INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE conversations IS 'Chat session between one user and one mind. Soft-deletable via deleted_at.';
COMMENT ON COLUMN conversations.mind_id IS 'References MindRegistry (filesystem), not a DB FK. e.g., alex_hormozi';
COMMENT ON COLUMN conversations.mind_name IS 'Denormalized display name. Avoids MindRegistry lookup for listing.';
COMMENT ON COLUMN conversations.title IS 'Auto-generated from first user message (truncated to 80 chars).';
COMMENT ON COLUMN conversations.message_count IS 'Denormalized counter. Updated via trigger on messages insert.';
COMMENT ON COLUMN conversations.total_tokens IS 'Cumulative token usage. Updated via trigger on messages insert.';


CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role              message_role NOT NULL,
  content           TEXT NOT NULL CHECK (length(content) > 0),
  tokens_used       INTEGER,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE messages IS 'Append-only message log. No updates, no deletes. Ordered by created_at within conversation.';
COMMENT ON COLUMN messages.metadata IS 'Optional structured data: {model, inputTokens, outputTokens, taskDetected, finishReason}';
COMMENT ON COLUMN messages.tokens_used IS 'Total tokens consumed by this message (for assistant: input+output).';


CREATE TABLE delegated_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id        UUID REFERENCES messages(id) ON DELETE SET NULL,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mind_id           TEXT NOT NULL,
  clickup_task_id   TEXT NOT NULL,
  clickup_url       TEXT NOT NULL CHECK (clickup_url LIKE 'https://%'),
  title             TEXT NOT NULL CHECK (length(title) > 0),
  description       TEXT,
  status            task_status NOT NULL DEFAULT 'open',
  priority          task_priority NOT NULL DEFAULT 'normal',
  tags              TEXT[],
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_tasks_clickup_task_id UNIQUE (clickup_task_id)
);

COMMENT ON TABLE delegated_tasks IS 'Tasks created in ClickUp from chat conversations. Links a message to a ClickUp task.';
COMMENT ON COLUMN delegated_tasks.clickup_task_id IS 'ClickUp task ID. Unique to prevent duplicate task creation.';
COMMENT ON COLUMN delegated_tasks.message_id IS 'The assistant message that triggered task creation. SET NULL if message deleted.';

-- ============================================================
-- INDEXES
-- ============================================================

-- Users: lookup by clerk_id on every authenticated request
-- Already covered by UNIQUE constraint (creates implicit index)

-- Conversations: list for user, newest first, excluding soft-deleted
CREATE INDEX idx_conversations_user_updated
  ON conversations (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- Conversations: filter by mind within user's conversations
CREATE INDEX idx_conversations_user_mind
  ON conversations (user_id, mind_id)
  WHERE deleted_at IS NULL;

-- Messages: chronological within conversation (primary read pattern)
CREATE INDEX idx_messages_conversation_created
  ON messages (conversation_id, created_at);

-- Delegated Tasks: list for user, newest first
CREATE INDEX idx_tasks_user_created
  ON delegated_tasks (user_id, created_at DESC);

-- Delegated Tasks: filter by status within user's tasks
CREATE INDEX idx_tasks_user_status
  ON delegated_tasks (user_id, status);

-- Delegated Tasks: find tasks for a conversation
CREATE INDEX idx_tasks_conversation
  ON delegated_tasks (conversation_id);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_delegated_tasks_updated_at
  BEFORE UPDATE ON delegated_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- Auto-update conversation counters when message inserted
CREATE OR REPLACE FUNCTION update_conversation_counters()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET
    message_count = message_count + 1,
    total_tokens = total_tokens + COALESCE(NEW.tokens_used, 0),
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_messages_update_counters
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_counters();


-- Auto-generate conversation title from first user message
CREATE OR REPLACE FUNCTION auto_title_conversation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'user' THEN
    UPDATE conversations SET
      title = left(NEW.content, 80)
    WHERE id = NEW.conversation_id
      AND title IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_messages_auto_title
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION auto_title_conversation();

COMMIT;
```

---

## 6. Rollback SQL

```sql
-- Rollback: 0001_initial_schema_rollback.sql
-- Reverts the initial schema. USE WITH CAUTION.

BEGIN;

DROP TRIGGER IF EXISTS trg_messages_auto_title ON messages;
DROP TRIGGER IF EXISTS trg_messages_update_counters ON messages;
DROP TRIGGER IF EXISTS trg_delegated_tasks_updated_at ON delegated_tasks;
DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;

DROP FUNCTION IF EXISTS auto_title_conversation();
DROP FUNCTION IF EXISTS update_conversation_counters();
DROP FUNCTION IF EXISTS update_updated_at();

DROP TABLE IF EXISTS delegated_tasks;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS task_priority;
DROP TYPE IF EXISTS task_status;
DROP TYPE IF EXISTS message_role;
DROP TYPE IF EXISTS user_role;

COMMIT;
```

---

## 7. Index Strategy Rationale

| Index | Access Pattern | Type | Why |
|-------|---------------|------|-----|
| `uq_users_clerk_id` | Auth middleware lookup | B-tree (unique) | Every request verifies JWT → looks up user by clerk_id. MUST be fast. |
| `uq_users_email` | Duplicate prevention | B-tree (unique) | Prevents duplicate Clerk syncs. |
| `idx_conversations_user_updated` | List conversations | B-tree (partial) | Most common query. Partial index excludes soft-deleted rows — smaller, faster. |
| `idx_conversations_user_mind` | Filter by mind | B-tree (partial) | "Show me my chats with Hormozi." Partial excludes deleted. |
| `idx_messages_conversation_created` | Load chat history | B-tree (composite) | Primary read: all messages in a conversation, chronological. Covers cursor pagination. |
| `idx_tasks_user_created` | List my tasks | B-tree (composite) | Dashboard: "my recent tasks." |
| `idx_tasks_user_status` | Filter tasks by status | B-tree (composite) | "Show me open tasks." |
| `idx_tasks_conversation` | Tasks in this chat | B-tree | Sidebar: tasks created in current conversation. |
| `uq_tasks_clickup_task_id` | Prevent duplicates | B-tree (unique) | Idempotency: same ClickUp task never inserted twice. |

### Indexes NOT Added (and why)

| Candidate | Decision | Reason |
|-----------|----------|--------|
| `idx_messages_role` | Skipped | No query filters by role alone. Always filtered by conversation_id first. |
| `idx_conversations_squad_id` | Skipped | No API endpoint filters by squad_id. If needed later, add then. |
| `idx_delegated_tasks_mind_id` | Skipped | No query filters by mind_id on tasks alone. Always by user_id first. |
| GIN on `messages.metadata` | Skipped | metadata is read, not queried. If we need "find all messages where taskDetected=true", add a GIN index then. |
| GIN on `delegated_tasks.tags` | Skipped | No tag-based filtering in MVP. Add when tag search is needed. |

---

## 8. Triggers Summary

| Trigger | Table | Event | Purpose |
|---------|-------|-------|---------|
| `trg_users_updated_at` | users | BEFORE UPDATE | Auto-set `updated_at = now()` |
| `trg_conversations_updated_at` | conversations | BEFORE UPDATE | Auto-set `updated_at = now()` |
| `trg_delegated_tasks_updated_at` | delegated_tasks | BEFORE UPDATE | Auto-set `updated_at = now()` |
| `trg_messages_update_counters` | messages | AFTER INSERT | Increment `message_count` and `total_tokens` on conversation |
| `trg_messages_auto_title` | messages | AFTER INSERT | Set conversation title from first user message (if null) |

### Why Triggers Over App Logic

| Concern | Trigger | App Logic |
|---------|---------|-----------|
| **Consistency** | Always executes, even if called from psql | Only if app remembers to call it |
| **Atomicity** | Same transaction as INSERT | Requires explicit transaction in app |
| **Performance** | Single round-trip | Extra UPDATE query per message |
| **Complexity** | Hidden logic (con) | Visible in code (pro) |

**Decision:** Use triggers for counters and timestamps because they are **data integrity concerns**, not business logic. The app layer should not be responsible for keeping `message_count` accurate.

---

## 9. Data Types Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary keys | `UUID v4` | No sequential ID guessing, safe to expose in URLs |
| Timestamps | `TIMESTAMPTZ` | Always UTC-aware. No timezone bugs. |
| Mind/Squad IDs | `TEXT` (not FK) | Minds live on filesystem, not DB. No referential integrity possible. |
| Tags | `TEXT[]` (PostgreSQL array) | Simple, queryable with `@>` operator if needed later |
| Priority | `ENUM` (not integer) | Self-documenting, prevents invalid values (e.g., priority 99) |
| Metadata | `JSONB` | Flexible schema for assistant response metadata. Typed in Drizzle with `$type<>()`. |
| Content | `TEXT` (no limit) | Chat messages can be long. PostgreSQL TEXT has no practical limit. |

---

## 10. Security Considerations

### 10.1 No RLS (Railway PostgreSQL)

Unlike Supabase, Railway PostgreSQL does not expose the database directly to clients. All access goes through Fastify backend → Drizzle ORM. Therefore:

- **No RLS needed** — the backend is the only database client
- **Authorization** enforced at app layer (Clerk JWT → user_id → scoped queries)
- **Every query** includes `WHERE user_id = ?` scoping (enforced in service layer)

### 10.2 Query Scoping Pattern

```typescript
// CORRECT: Always scope by authenticated user
async function getUserConversations(userId: string) {
  return db.select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),      // Always scoped
        isNull(conversations.deletedAt),        // Exclude soft-deleted
      )
    )
    .orderBy(desc(conversations.updatedAt));
}

// WRONG: Never query without user scope
// db.select().from(conversations).where(eq(conversations.mindId, mindId))
// This would leak other users' conversations!
```

### 10.3 Connection Security

```
Railway PostgreSQL → SSL required (enforced by Railway)
Connection pooling → pg connection pool (max 20 connections for MVP)
Credentials → DATABASE_URL in Railway env vars (never in code)
```

---

## 11. Estimated Table Sizes (MVP — 6 months)

| Table | Rows (est.) | Avg Row Size | Total Size |
|-------|------------|-------------|-----------|
| users | 10-50 | 200 bytes | < 10 KB |
| conversations | 500-2,000 | 300 bytes | < 600 KB |
| messages | 5,000-20,000 | 2 KB (avg) | 10-40 MB |
| delegated_tasks | 200-1,000 | 500 bytes | < 500 KB |
| **Total** | | | **~50 MB** |

All fits comfortably in Railway's free/starter PostgreSQL tier. No partitioning, no sharding needed for years.

---

## 12. Future Schema Extensions (Post-MVP)

These are NOT implemented now. Documented for awareness.

| Feature | Schema Change |
|---------|-------------|
| Mind Cloning Studio | New tables: `mind_clones`, `clone_artifacts`, `clone_heuristics` |
| Multi-tenant | Add `org_id` to users and all queries. Add `organizations` table. |
| Analytics | Materialized view: daily token usage, popular minds, conversation metrics |
| Favorites | Junction table: `user_mind_favorites(user_id, mind_id)` |
| Notifications | New table: `notifications(id, user_id, type, payload, read_at)` |
| Rate limiting per user | New table or Redis: `usage_quotas(user_id, period, tokens_used, tasks_created)` |

---

## 13. Drizzle Configuration

```typescript
// packages/api/drizzle.config.ts

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

### Migration Commands

```bash
# Generate migration from schema changes
pnpm --filter @loyola-x/api drizzle-kit generate

# Apply pending migrations
pnpm --filter @loyola-x/api drizzle-kit migrate

# Open Drizzle Studio (visual DB browser)
pnpm --filter @loyola-x/api drizzle-kit studio

# Push schema directly (dev only, no migration files)
pnpm --filter @loyola-x/api drizzle-kit push
```

### Database Client

```typescript
// packages/api/src/db/client.ts

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,        // Max connections in pool
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }  // Railway uses self-signed certs
    : false,
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
```

---

*Schema designed by Dara (Data Engineer Agent) | Loyola Digital X v1.0.0 | 2026-03-13*
