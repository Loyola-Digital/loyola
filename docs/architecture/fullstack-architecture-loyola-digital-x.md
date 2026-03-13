# Full-Stack Architecture: Loyola Digital X

> Sistema de Central de Mentes para Loyola Digital

**Version:** 1.0.0 | **Date:** 2026-03-13 | **Author:** Aria (Architect Agent)
**Based on:** Project Brief by Atlas (Analyst Agent)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Decision Records](#2-architecture-decision-records)
3. [System Architecture](#3-system-architecture)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Mind Engine Architecture](#6-mind-engine-architecture)
7. [Database Architecture](#7-database-architecture)
8. [API Contracts](#8-api-contracts)
9. [Authentication & Security](#9-authentication--security)
10. [Infrastructure & Deployment](#10-infrastructure--deployment)
11. [Performance Strategy](#11-performance-strategy)
12. [Implementation Phases](#12-implementation-phases)

---

## 1. System Overview

### 1.1 What It Does

Loyola Digital X exposes the AIOX mind ecosystem (27+ cloned AI minds, 6 squads, 47+ agents) through a web interface where Loyola Digital employees:

1. **Browse** minds organized by squad (catalog)
2. **Chat** with any mind in its full persona (streaming)
3. **Delegate tasks** that auto-create ClickUp tasks
4. **Track** task status in real-time

### 1.2 Architecture Style

**Separated Frontend + Backend (Decision B from Brief)**

```
  Internet
     │
     ├──▶ [Vercel CDN] ──▶ Next.js 15 (SSR + Client)
     │                        │
     │                        │ REST + WebSocket
     │                        ▼
     └──▶ [Railway]  ──▶ Fastify API Server
                            │        │        │
                         Claude   ClickUp  PostgreSQL
                          API      API     (Railway)
```

**Why separated:** Backend holds filesystem-dependent mind data (squads/), long-lived WebSocket connections for streaming, and CPU-intensive prompt assembly. These don't belong in serverless (Vercel).

### 1.3 Key Constraints

| Constraint | Impact |
|-----------|--------|
| Minds live on filesystem (~240KB/mind, 27+ minds) | Backend must have persistent fs access |
| Claude API streaming needs long connections | WebSocket required, not serverless |
| Single org (Loyola Digital) for MVP | Simplifies auth, no multi-tenant needed yet |
| Copywriter is primary user | UX must be dead simple, zero learning curve |
| ClickUp already in use | Must integrate, not replace |

---

## 2. Architecture Decision Records

### ADR-001: Frontend + Backend Separation

**Status:** Accepted
**Context:** Mind loading requires filesystem access and persistent connections for streaming.
**Decision:** Separate Next.js frontend (Vercel) from Fastify backend (Railway).
**Consequences:** Two deploy targets, CORS configuration needed, but independent scaling and clear separation of concerns.

### ADR-002: Fastify Over Express/Hono

**Status:** Accepted
**Context:** Backend needs HTTP + WebSocket + plugin architecture.
**Decision:** Fastify 5.x for backend.
**Rationale:**
- Native TypeScript support
- First-class WebSocket plugin (@fastify/websocket)
- Schema-based validation (integrates with Zod via fastify-type-provider-zod)
- Plugin architecture for clean service separation
- 2-3x faster than Express in benchmarks

### ADR-003: Drizzle ORM Over Prisma

**Status:** Accepted
**Context:** Need TypeScript ORM for PostgreSQL.
**Decision:** Drizzle ORM.
**Rationale:**
- SQL-like API (no new query language)
- Zero runtime overhead (generates SQL at build time)
- Native PostgreSQL features (enums, json, arrays)
- Lightweight migration system
- Better performance than Prisma for complex queries

### ADR-004: Mind Engine — Tiered Loading Strategy

**Status:** Accepted
**Context:** Each mind has ~240KB of artifacts (~19.8K tokens). Claude's context window is 200K tokens. Loading everything wastes tokens and money.
**Decision:** 3-tier loading with smart prompt assembly.
**Details:** See [Section 6](#6-mind-engine-architecture).

### ADR-005: Clerk for Auth

**Status:** Accepted
**Context:** Need enterprise auth without Supabase.
**Decision:** Clerk.
**Rationale:**
- Pre-built UI components (sign-in, sign-up, user profile)
- Organization support (Loyola Digital as org)
- JWT verification for backend (lightweight middleware)
- Webhook support for user sync to PostgreSQL
- Role-based access out of the box

### ADR-006: SSE Over WebSocket for Chat Streaming

**Status:** Accepted
**Context:** Need real-time streaming of Claude API responses to frontend.
**Decision:** Server-Sent Events (SSE) for chat streaming, NOT WebSocket.
**Rationale:**
- Claude API itself returns a stream (ReadableStream)
- SSE is unidirectional (server → client) which is exactly what streaming needs
- Works natively with `fetch()` and `EventSource` — no special client library
- Simpler than WebSocket for this use case (no bidirectional protocol)
- Better proxy/CDN compatibility (Vercel, Cloudflare)
- WebSocket reserved for future features that need bidirectional (e.g., collaborative editing)

### ADR-007: Railway for Backend + Database

**Status:** Accepted
**Context:** Need container hosting with persistent filesystem and managed PostgreSQL.
**Decision:** Railway.
**Rationale:**
- PostgreSQL included (managed, backups, point-in-time recovery)
- Persistent volumes for mind data (squads/ directory)
- Native WebSocket/SSE support
- Git push deploy
- $5-20/month for MVP scale
- Custom domain support (api.loyoladigital.com)

---

## 3. System Architecture

### 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vercel)                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Next.js 15 App Router                     │ │
│  │                                                              │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │ │
│  │  │ Auth     │  │ Mind     │  │ Chat     │  │ Task       │  │ │
│  │  │ Module   │  │ Catalog  │  │ Module   │  │ Panel      │  │ │
│  │  │ (Clerk)  │  │          │  │ (SSE)    │  │ (ClickUp)  │  │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │ │
│  │                                                              │ │
│  │  ┌────────────────────────────────────────────────────────┐  │ │
│  │  │              Shared Layer                               │  │ │
│  │  │  API Client | TanStack Query | Zustand (UI state)      │  │ │
│  │  └────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS + SSE
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BACKEND (Railway)                          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Fastify 5 Server                          │ │
│  │                                                              │ │
│  │  ┌─────────────────── Routes ───────────────────────────┐   │ │
│  │  │ GET  /api/minds          → MindRegistry              │   │ │
│  │  │ GET  /api/minds/:id      → MindRegistry              │   │ │
│  │  │ POST /api/conversations  → ConversationService       │   │ │
│  │  │ POST /api/chat           → MindEngine + Claude (SSE) │   │ │
│  │  │ GET  /api/conversations  → ConversationService       │   │ │
│  │  │ POST /api/tasks          → ClickUpService            │   │ │
│  │  │ GET  /api/tasks          → ClickUpService            │   │ │
│  │  │ GET  /api/health         → HealthCheck               │   │ │
│  │  └──────────────────────────────────────────────────────┘   │ │
│  │                                                              │ │
│  │  ┌─────────────────── Services ─────────────────────────┐   │ │
│  │  │                                                       │   │ │
│  │  │  ┌──────────────┐  ┌──────────────┐                  │   │ │
│  │  │  │ MindRegistry │  │ MindEngine   │                  │   │ │
│  │  │  │ (fs scan,    │  │ (prompt      │                  │   │ │
│  │  │  │  index,      │  │  assembly,   │                  │   │ │
│  │  │  │  metadata)   │──▶│  tiered      │                  │   │ │
│  │  │  │              │  │  loading)    │                  │   │ │
│  │  │  └──────────────┘  └──────┬───────┘                  │   │ │
│  │  │                           │                           │   │ │
│  │  │  ┌──────────────┐  ┌─────▼────────┐                  │   │ │
│  │  │  │ ClickUp      │  │ Claude       │                  │   │ │
│  │  │  │ Service      │  │ Service      │                  │   │ │
│  │  │  │ (task CRUD)  │  │ (Anthropic   │                  │   │ │
│  │  │  │              │  │  SDK stream) │                  │   │ │
│  │  │  └──────────────┘  └──────────────┘                  │   │ │
│  │  │                                                       │   │ │
│  │  │  ┌──────────────┐  ┌──────────────┐                  │   │ │
│  │  │  │ Auth         │  │ Conversation │                  │   │ │
│  │  │  │ Middleware   │  │ Service      │                  │   │ │
│  │  │  │ (Clerk JWT) │  │ (history,    │                  │   │ │
│  │  │  │              │  │  context)    │                  │   │ │
│  │  │  └──────────────┘  └──────────────┘                  │   │ │
│  │  └───────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                    │                    │                         │
│            ┌───────▼──────┐    ┌───────▼──────┐                 │
│            │ PostgreSQL   │    │ Filesystem   │                 │
│            │ (Railway)    │    │ squads/      │                 │
│            │              │    │ (mind data)  │                 │
│            └──────────────┘    └──────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
                                         │
                              ┌──────────┴──────────┐
                              │                     │
                       ┌──────▼──────┐       ┌──────▼──────┐
                       │ Claude API  │       │ ClickUp API │
                       │ (Anthropic) │       │ (v2)        │
                       └─────────────┘       └─────────────┘
```

### 3.2 Data Flow — Chat with Mind (Happy Path)

```
User types message
       │
       ▼
[Next.js Client] ──POST /api/chat──▶ [Fastify]
  (with Clerk JWT)                       │
                                         ├── Verify JWT (Clerk middleware)
                                         ├── Load conversation context (DB)
                                         ├── MindEngine.buildPrompt(mindId, messages)
                                         │     ├── Tier 1: COGNITIVE_OS.md (always)
                                         │     ├── Tier 2: COMMUNICATION_DNA.md (always)
                                         │     └── Tier 3: relevant frameworks (on-demand)
                                         ├── Claude.stream(systemPrompt, messages)
                                         │     └── Anthropic SDK → stream response
                                         ▼
[Fastify] ──SSE stream──▶ [Next.js Client]
                              │
                              ├── Render tokens as they arrive
                              ├── Detect task intent in response
                              └── Save complete message to DB (on stream end)
```

### 3.3 Data Flow — Task Delegation

```
Mind responds with task suggestion
       │
       ▼
[Chat UI] shows "Create task?" button
       │
       User clicks confirm
       │
       ▼
[Next.js] ──POST /api/tasks──▶ [Fastify]
                                    │
                                    ├── Validate task data
                                    ├── ClickUpService.createTask({
                                    │     name, description, list_id,
                                    │     assignees, priority, tags
                                    │   })
                                    ├── Save to delegated_tasks table
                                    └── Return task with clickup_url
                                         │
[Next.js] ◀── { taskId, clickupUrl } ───┘
     │
     └── Show task card in sidebar with link
```

---

## 4. Frontend Architecture

### 4.1 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 15 (App Router) | SSR, routing, layouts |
| UI Components | shadcn/ui | Accessible, composable components |
| Styling | Tailwind CSS 4 | Utility-first CSS |
| Server State | TanStack Query 5 | API caching, refetching, optimistic updates |
| Client State | Zustand | UI state (sidebar open, active mind, etc.) |
| Auth | @clerk/nextjs | Auth UI + middleware |
| Forms | React Hook Form + Zod | Validation |
| Markdown | react-markdown + rehype | Chat message rendering |
| Icons | Lucide React | Consistent iconography |

### 4.2 Route Structure

```
app/
├── (auth)/                          # Public routes (Clerk handles)
│   ├── sign-in/[[...sign-in]]/
│   │   └── page.tsx                 # Clerk <SignIn />
│   ├── sign-up/[[...sign-up]]/
│   │   └── page.tsx                 # Clerk <SignUp />
│   └── layout.tsx                   # Centered auth layout
│
├── (app)/                           # Authenticated routes
│   ├── layout.tsx                   # App shell: sidebar + topbar + main
│   ├── page.tsx                     # Dashboard (redirect to /minds)
│   ├── minds/
│   │   ├── page.tsx                 # Squad grid → mind cards
│   │   └── [mindId]/
│   │       ├── page.tsx             # Mind profile (bio, frameworks, stats)
│   │       └── chat/
│   │           └── page.tsx         # Chat interface
│   ├── conversations/
│   │   └── page.tsx                 # Conversation history list
│   └── tasks/
│       └── page.tsx                 # All delegated tasks + ClickUp status
│
├── api/                             # Next.js route handlers (thin proxy)
│   └── clerk-webhook/
│       └── route.ts                 # Clerk webhook → sync user to backend
│
├── layout.tsx                       # Root layout: ClerkProvider, QueryProvider
├── globals.css                      # Tailwind imports
└── not-found.tsx
```

### 4.3 Component Architecture

```
components/
├── ui/                              # shadcn/ui (generated)
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   ├── scroll-area.tsx
│   ├── skeleton.tsx
│   ├── avatar.tsx
│   └── badge.tsx
│
├── layout/
│   ├── app-sidebar.tsx              # Main navigation sidebar
│   ├── topbar.tsx                   # User menu, search, org name
│   └── mobile-nav.tsx               # Mobile responsive nav
│
├── minds/
│   ├── squad-grid.tsx               # Grid of squad cards
│   ├── mind-card.tsx                # Individual mind card (avatar, name, tags)
│   ├── mind-profile.tsx             # Full mind profile view
│   ├── mind-search.tsx              # Search + filter bar
│   └── mind-avatar.tsx              # Avatar with initials fallback
│
├── chat/
│   ├── chat-container.tsx           # Full chat view (messages + input)
│   ├── message-list.tsx             # Scrollable message list
│   ├── message-bubble.tsx           # Individual message (markdown + styling)
│   ├── chat-input.tsx               # Textarea + send button
│   ├── streaming-indicator.tsx      # "Mind is thinking..." animation
│   ├── task-suggestion-card.tsx     # Inline "Create ClickUp task?" card
│   └── chat-sidebar.tsx             # Conversation list + task panel
│
└── tasks/
    ├── task-card.tsx                # Task with status badge + ClickUp link
    ├── task-list.tsx                # List of delegated tasks
    └── task-status-badge.tsx        # Color-coded status indicator
```

### 4.4 State Management

```typescript
// lib/stores/ui-store.ts — Zustand (client-only UI state)
interface UIStore {
  sidebarOpen: boolean;
  activeMindId: string | null;
  activeConversationId: string | null;
  toggleSidebar: () => void;
}

// TanStack Query handles ALL server state:
// - useMinds()           → GET /api/minds (cached 5min)
// - useMind(id)          → GET /api/minds/:id (cached 5min)
// - useConversations()   → GET /api/conversations
// - useTasks()           → GET /api/tasks (refetch 30s)
// - useChatStream()      → POST /api/chat (SSE mutation)
```

### 4.5 SSE Chat Streaming (Client)

```typescript
// lib/hooks/use-chat-stream.ts
// Simplified flow — actual implementation in packages/web/

async function streamChat(mindId: string, message: string, conversationId: string) {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getToken()}`,
    },
    body: JSON.stringify({ mindId, message, conversationId }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    // Parse SSE events: data: {"type":"text_delta","text":"..."}
    // Append to message state progressively
  }
}
```

---

## 5. Backend Architecture

### 5.1 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Fastify 5 | HTTP server + plugins |
| Language | TypeScript 5 | Type safety |
| Validation | Zod + fastify-type-provider-zod | Request/response schemas |
| ORM | Drizzle ORM | Database queries + migrations |
| Auth | @clerk/fastify | JWT verification middleware |
| LLM | @anthropic-ai/sdk | Claude API client |
| Logging | pino (built into Fastify) | Structured logging |
| Config | @fastify/env + Zod | Environment validation |

### 5.2 Project Structure

```
packages/api/
├── src/
│   ├── server.ts                    # Fastify app factory + plugin registration
│   ├── app.ts                       # Entry point (start server)
│   │
│   ├── routes/
│   │   ├── minds.ts                 # Mind catalog endpoints
│   │   ├── chat.ts                  # Chat + SSE streaming
│   │   ├── conversations.ts         # Conversation CRUD
│   │   ├── tasks.ts                 # ClickUp task delegation
│   │   └── health.ts               # Health + readiness checks
│   │
│   ├── services/
│   │   ├── mind-registry.ts         # Scan squads/, index minds, cache metadata
│   │   ├── mind-engine.ts           # Load artifacts, build system prompt
│   │   ├── claude.ts                # Anthropic SDK wrapper (streaming)
│   │   ├── clickup.ts              # ClickUp API v2 client
│   │   └── conversation.ts         # Conversation + message persistence
│   │
│   ├── db/
│   │   ├── schema.ts               # Drizzle schema definitions
│   │   ├── client.ts               # Database connection pool
│   │   └── migrations/             # SQL migration files
│   │
│   ├── middleware/
│   │   ├── auth.ts                  # Clerk JWT verification
│   │   ├── rate-limit.ts           # Per-user rate limiting
│   │   └── cors.ts                 # CORS configuration
│   │
│   ├── config/
│   │   └── env.ts                   # Zod-validated environment schema
│   │
│   └── types/
│       └── index.ts                 # Shared types (re-export from @loyola-x/shared)
│
├── drizzle.config.ts                # Drizzle migration config
├── package.json
├── tsconfig.json
└── Dockerfile                       # Railway deployment
```

### 5.3 Plugin Architecture

```typescript
// src/server.ts — Fastify plugin registration order matters

import Fastify from 'fastify';

export async function buildServer() {
  const app = Fastify({ logger: true });

  // 1. Config (first — everything depends on env)
  await app.register(import('./config/env'));

  // 2. Infrastructure plugins
  await app.register(import('@fastify/cors'), { origin: process.env.CORS_ORIGIN });
  await app.register(import('@fastify/rate-limit'), { max: 100, timeWindow: '1 minute' });

  // 3. Auth middleware
  await app.register(import('./middleware/auth'));

  // 4. Services (decorated onto fastify instance)
  await app.register(import('./services/mind-registry'));
  await app.register(import('./services/claude'));
  await app.register(import('./services/clickup'));
  await app.register(import('./services/conversation'));

  // 5. Routes (last — consume services)
  await app.register(import('./routes/health'), { prefix: '/api' });
  await app.register(import('./routes/minds'), { prefix: '/api' });
  await app.register(import('./routes/chat'), { prefix: '/api' });
  await app.register(import('./routes/conversations'), { prefix: '/api' });
  await app.register(import('./routes/tasks'), { prefix: '/api' });

  return app;
}
```

### 5.4 Service Layer Design

Each service is a **Fastify plugin** that decorates the app instance:

```typescript
// Pattern for all services
import fp from 'fastify-plugin';

export default fp(async function mindRegistryPlugin(fastify) {
  const registry = new MindRegistry(fastify.config.MINDS_BASE_PATH);
  await registry.initialize(); // Scan filesystem on startup

  fastify.decorate('mindRegistry', registry);
});

// Usage in routes:
fastify.get('/api/minds', async (request) => {
  return fastify.mindRegistry.getAllMinds();
});
```

---

## 6. Mind Engine Architecture

This is the most critical component. It transforms filesystem-based mind data into Claude API system prompts.

### 6.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      Mind Engine                         │
│                                                          │
│  ┌──────────────┐     ┌──────────────┐                  │
│  │ MindRegistry │     │ PromptBuilder│                  │
│  │              │     │              │                  │
│  │ - scan()     │────▶│ - tier1()    │──▶ System Prompt │
│  │ - getById()  │     │ - tier2()    │                  │
│  │ - search()   │     │ - tier3()    │                  │
│  └──────────────┘     └──────────────┘                  │
│         │                    │                           │
│         ▼                    ▼                           │
│  ┌──────────────┐     ┌──────────────┐                  │
│  │ MetadataCache│     │ ArtifactCache│                  │
│  │ (in-memory)  │     │ (LRU, 50MB)  │                  │
│  └──────────────┘     └──────────────┘                  │
│         │                    │                           │
│         ▼                    ▼                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Filesystem (squads/)                  │   │
│  │  mmos-squad/minds/{mind}/artifacts/*.md           │   │
│  │  content-engine/agents/*.md                       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 6.2 MindRegistry — Indexing

On server startup, scans all squads and builds an in-memory index:

```typescript
interface MindMetadata {
  id: string;                    // "alex_hormozi"
  name: string;                  // "Alex Hormozi"
  squad: string;                 // "mmos-squad"
  squadDisplayName: string;      // "MMOS"
  type: 'mind' | 'agent';       // minds/ = mind, agents/ = agent
  avatarUrl: string | null;      // Future: generated or uploaded
  tags: string[];                // Extracted from artifacts
  specialty: string;             // From config.json or first line of DEEP_Profile
  artifactPaths: {               // Absolute paths to each artifact
    cognitiveOS: string | null;
    communicationDNA: string | null;
    frameworks: string | null;
    valueEquation: string | null;
    antipatterns: string | null;
    caseLibrary: string | null;
    [key: string]: string | null;
  };
  heuristicPaths: string[];      // All heuristic file paths
  totalTokenEstimate: number;    // Pre-calculated from file sizes
}

// Registry initialization (runs once on startup, ~200ms for 27 minds)
class MindRegistry {
  private minds: Map<string, MindMetadata> = new Map();
  private squads: Map<string, SquadMetadata> = new Map();

  async initialize() {
    // 1. Scan squads/ directory
    // 2. For each squad: read config.yaml/squad.yaml
    // 3. For each mind: read config.json, index artifact paths
    // 4. Build metadata without reading full file content
    // 5. Cache in memory
  }
}
```

### 6.3 Tiered Loading Strategy

**Problem:** Each mind has ~240KB (~19.8K tokens) of artifacts. Loading everything wastes tokens and costs money.

**Solution:** 3-tier loading with progressive depth:

```
┌────────────────────────────────────────────────────────┐
│ TIER 1: Identity Core (ALWAYS loaded)     ~4-5K tokens │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ COGNITIVE_OS.md (or system_prompts/COGNITIVE_OS.md) │ │
│ │ → Identity vector, semantic anchors, core persona   │ │
│ │ → ~459 lines, ~3,200 tokens                         │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 04_COMMUNICATION_DNA.md                             │ │
│ │ → Vocabulary rules, forbidden words, syntax         │ │
│ │ → ~256 lines, ~1,800 tokens                         │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Total: ~5,000 tokens                                    │
│ When: EVERY chat message                                │
├────────────────────────────────────────────────────────┤
│ TIER 2: Knowledge Base (loaded on conversation start)   │
│                                             ~8-10K tokens│
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 01_FRAMEWORKS_OPERACIONAIS.md                       │ │
│ │ 02_VALUE_EQUATION_ENGINE.md                         │ │
│ │ 03_OFFER_CREATION_SYSTEM.md                         │ │
│ │ → Core thinking frameworks                          │ │
│ │ → ~746 lines, ~5,200 tokens                         │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ meta-axioms.md (if exists)                          │ │
│ │ → Fundamental principles                            │ │
│ │ → ~200 lines, ~1,400 tokens                         │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Total: ~6,600 tokens (cumulative: ~11,600)              │
│ When: First message in conversation                     │
├────────────────────────────────────────────────────────┤
│ TIER 3: Extended Context (loaded on-demand)             │
│                                             ~5-8K tokens│
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 05_ANTIPATTERN_SHIELDS.md     → On validation       │ │
│ │ 06_CASE_LIBRARY_DENSE.md      → On example request  │ │
│ │ 07_TESTING_OPTIMIZATION.md    → On QA topics        │ │
│ │ 08_INDUSTRY_ADAPTATION.md     → On industry context │ │
│ │ heuristics/*.md               → On specific topic   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Total: ~5,000-8,000 tokens (cumulative: ~16-20K)        │
│ When: Claude requests tool_use OR topic detected        │
└────────────────────────────────────────────────────────┘
```

### 6.4 Prompt Assembly

```typescript
class PromptBuilder {
  buildSystemPrompt(mind: MindMetadata, tier: 1 | 2 | 3): string {
    const sections: string[] = [];

    // Header: who you are
    sections.push(`You are ${mind.name}. Respond as this person would.`);
    sections.push(`Squad: ${mind.squadDisplayName}`);

    // Tier 1: Always
    sections.push(this.loadArtifact(mind.artifactPaths.cognitiveOS));
    sections.push(this.loadArtifact(mind.artifactPaths.communicationDNA));

    // Tier 2: On conversation start
    if (tier >= 2) {
      sections.push(this.loadArtifact(mind.artifactPaths.frameworks));
      sections.push(this.loadArtifact(mind.artifactPaths.valueEquation));
    }

    // Tier 3: On-demand (injected per-message, not in system prompt)
    // Handled separately via message injection

    // Task delegation instructions
    sections.push(TASK_DELEGATION_PROMPT);

    return sections.filter(Boolean).join('\n\n---\n\n');
  }
}

const TASK_DELEGATION_PROMPT = `
## Task Delegation Capability

When the user asks you to create, schedule, or delegate a task:
1. Acknowledge the request in your persona's voice
2. Summarize the task clearly
3. End your message with exactly this JSON block:

\`\`\`json:task
{
  "action": "create_task",
  "title": "Task title here",
  "description": "Detailed description",
  "priority": 2,
  "tags": ["tag1", "tag2"]
}
\`\`\`

The system will detect this block and prompt the user to confirm task creation in ClickUp.
Do NOT mention ClickUp by name — just say "I can create a task for that."
`;
```

### 6.5 Artifact Caching

```typescript
// LRU cache for loaded artifacts — avoids re-reading filesystem
class ArtifactCache {
  private cache: LRUCache<string, string>;

  constructor() {
    this.cache = new LRUCache({
      max: 100,              // Max 100 artifacts in memory
      maxSize: 50_000_000,   // 50MB max total
      sizeCalculation: (value) => Buffer.byteLength(value),
      ttl: 1000 * 60 * 30,  // 30min TTL (minds don't change often)
    });
  }

  async loadArtifact(path: string): Promise<string> {
    const cached = this.cache.get(path);
    if (cached) return cached;

    const content = await fs.readFile(path, 'utf-8');
    this.cache.set(path, content);
    return content;
  }
}
```

### 6.6 Content-Engine Agents vs MMOS Minds

Two different mind types need different loading strategies:

| Aspect | MMOS Minds | Content-Engine Agents |
|--------|-----------|----------------------|
| Location | `squads/mmos-squad/minds/{name}/artifacts/` | `squads/content-engine/agents/{name}.md` |
| Structure | Multiple files (8-14 artifacts) | Single file (YAML frontmatter + markdown) |
| Size | ~240KB total, ~19.8K tokens | 200-2,300 lines, 1.4-16K tokens |
| Loading | Tiered (3 tiers) | Single file load (already compact) |
| Config | `docs/config.json` | Embedded in YAML block |

The MindRegistry abstracts this difference — both types implement the same `MindMetadata` interface.

---

## 7. Database Architecture

### 7.1 Schema (Drizzle ORM + PostgreSQL)

```typescript
// packages/api/src/db/schema.ts

import { pgTable, uuid, text, timestamp, integer, pgEnum, jsonb } from 'drizzle-orm/pg-core';

// Enums
export const userRoleEnum = pgEnum('user_role', [
  'copywriter', 'strategist', 'manager', 'admin'
]);

export const messageRoleEnum = pgEnum('message_role', [
  'user', 'assistant'
]);

export const taskStatusEnum = pgEnum('task_status', [
  'pending', 'open', 'in_progress', 'review', 'done', 'cancelled'
]);

// Tables
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  role: userRoleEnum('role').notNull().default('copywriter'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mindId: text('mind_id').notNull(),       // References MindRegistry, not a DB FK
  mindName: text('mind_name').notNull(),   // Denormalized for display
  squadId: text('squad_id').notNull(),
  title: text('title'),                     // Auto-generated from first message
  messageCount: integer('message_count').default(0),
  totalTokens: integer('total_tokens').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  tokensUsed: integer('tokens_used'),
  metadata: jsonb('metadata'),             // For task JSON blocks, model info, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

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
  priority: integer('priority').default(3),
  tags: text('tags').array(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### 7.2 Indexes

```sql
-- Performance indexes
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_mind_id ON conversations(mind_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_delegated_tasks_user_id ON delegated_tasks(user_id);
CREATE INDEX idx_delegated_tasks_conversation_id ON delegated_tasks(conversation_id);
CREATE INDEX idx_delegated_tasks_status ON delegated_tasks(status);
```

### 7.3 Why Minds Are NOT in the Database

Minds live on the filesystem (`squads/`) by design:

1. **Source of truth** — Mind artifacts are version-controlled (.md files in repo)
2. **Size** — 240KB per mind, 27+ minds = 6.5MB+ of markdown. Not efficient as DB rows
3. **Structure** — Each mind has different artifact structures (not normalizable)
4. **Updates** — Minds evolve via git, not via web UI (in MVP)
5. **Performance** — Filesystem + LRU cache is faster than DB for large text blobs

The MindRegistry acts as an in-memory index over the filesystem.

---

## 8. API Contracts

### 8.1 Minds

```
GET /api/minds
  → 200: { squads: Squad[] }

  Squad: {
    id: string
    name: string
    displayName: string
    description: string
    mindCount: number
    minds: MindSummary[]
  }

  MindSummary: {
    id: string
    name: string
    squad: string
    specialty: string
    tags: string[]
    avatarUrl: string | null
    totalTokenEstimate: number
  }

---

GET /api/minds/:mindId
  → 200: MindDetail

  MindDetail: MindSummary & {
    bio: string              // First ~500 chars of DEEP_Profile or COGNITIVE_OS
    frameworks: string[]     // Extracted framework names
    communicationStyle: {
      tone: string
      vocabulary: string[]
      forbiddenWords: string[]
    }
    stats: {
      artifactCount: number
      heuristicCount: number
      conversationCount: number  // From DB
    }
  }
```

### 8.2 Chat (SSE Streaming)

```
POST /api/chat
  Content-Type: application/json
  Authorization: Bearer {clerk_jwt}

  Body: {
    mindId: string
    conversationId: string | null   // null = new conversation
    message: string
  }

  → 200 (text/event-stream):

  event: conversation
  data: {"conversationId": "uuid", "isNew": true}

  event: text_delta
  data: {"text": "Let me"}

  event: text_delta
  data: {"text": " tell you"}

  event: text_delta
  data: {"text": " something..."}

  event: task_detected
  data: {"title": "Create headline", "description": "...", "priority": 2}

  event: usage
  data: {"inputTokens": 5200, "outputTokens": 340}

  event: done
  data: {"messageId": "uuid"}
```

### 8.3 Conversations

```
GET /api/conversations
  Query: ?limit=20&offset=0&mindId=optional
  → 200: { conversations: Conversation[], total: number }

  Conversation: {
    id: string
    mindId: string
    mindName: string
    squadId: string
    title: string
    messageCount: number
    totalTokens: number
    createdAt: string
    updatedAt: string
  }

---

GET /api/conversations/:id/messages
  Query: ?limit=50&before=messageId
  → 200: { messages: Message[] }

  Message: {
    id: string
    role: 'user' | 'assistant'
    content: string
    tokensUsed: number | null
    metadata: object | null
    createdAt: string
  }
```

### 8.4 Tasks

```
POST /api/tasks
  Body: {
    conversationId: string
    messageId: string
    mindId: string
    title: string
    description: string
    priority: 1-4              // ClickUp priority levels
    tags: string[]
  }
  → 201: DelegatedTask

  DelegatedTask: {
    id: string
    clickupTaskId: string
    clickupUrl: string
    title: string
    status: string
    createdAt: string
  }

---

GET /api/tasks
  Query: ?status=open&limit=20
  → 200: { tasks: DelegatedTask[], total: number }
```

---

## 9. Authentication & Security

### 9.1 Auth Flow

```
┌──────────┐     ┌───────┐     ┌──────────┐     ┌──────────┐
│ Browser  │────▶│ Clerk │────▶│ Next.js  │────▶│ Fastify  │
│          │     │       │     │          │     │          │
│ Sign-in  │     │ Auth  │     │ JWT in   │     │ Verify   │
│ UI       │     │ Flow  │     │ Cookie   │     │ JWT      │
└──────────┘     └───────┘     └──────────┘     └──────────┘
                                    │
                               Get JWT from
                               Clerk session
                               for API calls
```

### 9.2 Backend Auth Middleware

```typescript
// packages/api/src/middleware/auth.ts
import { clerkPlugin, getAuth } from '@clerk/fastify';

export default fp(async function authPlugin(fastify) {
  await fastify.register(clerkPlugin);

  fastify.addHook('onRequest', async (request, reply) => {
    // Skip health check
    if (request.url === '/api/health') return;

    const { userId } = getAuth(request);
    if (!userId) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    // Attach user to request
    request.userId = userId;
  });
});
```

### 9.3 Security Measures

| Layer | Measure | Implementation |
|-------|---------|---------------|
| Transport | HTTPS everywhere | Vercel + Railway auto-SSL |
| Auth | JWT verification | Clerk secret key validation |
| API | Rate limiting | @fastify/rate-limit (100 req/min/user) |
| API | CORS | Whitelist frontend domain only |
| Input | Validation | Zod schemas on all endpoints |
| Database | Parameterized queries | Drizzle ORM (no raw SQL) |
| Secrets | Environment variables | Railway + Vercel env management |
| LLM | Token budget per user | Track in conversations table |
| Chat | Content sanitization | Sanitize user input before Claude API |

---

## 10. Infrastructure & Deployment

### 10.1 Deployment Architecture

```
GitHub Repo (monorepo)
       │
       ├──push──▶ Vercel (auto-detect packages/web)
       │            ├── Build: next build
       │            ├── Deploy: Edge + Serverless
       │            └── Domain: app.loyoladigital.com
       │
       └──push──▶ Railway (Dockerfile in packages/api)
                    ├── Build: docker build
                    ├── Deploy: Container
                    ├── PostgreSQL: Managed addon
                    ├── Volume: /app/squads (persistent)
                    └── Domain: api.loyoladigital.com
```

### 10.2 Dockerfile (Backend)

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY packages/api packages/api
COPY packages/shared packages/shared
RUN pnpm --filter @loyola-x/api build

FROM base AS runtime
WORKDIR /app
COPY --from=build /app/packages/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY squads ./squads
EXPOSE 3001
CMD ["node", "dist/app.js"]
```

### 10.3 Railway Configuration

```toml
# railway.toml
[build]
builder = "dockerfile"
dockerfilePath = "packages/api/Dockerfile"

[deploy]
numReplicas = 1
startCommand = "node dist/app.js"
healthcheckPath = "/api/health"
healthcheckTimeout = 10
restartPolicyType = "on_failure"

[[volumes]]
mount = "/app/squads"
name = "minds-data"
```

### 10.4 Mind Data Sync Strategy

Minds live in the git repo (`squads/`). On Railway:

1. **Deploy-time:** `COPY squads ./squads` in Dockerfile bakes minds into image
2. **Updates:** New git push rebuilds image with latest minds
3. **Persistent volume:** Optional — mount if minds update outside git
4. **Alternative:** Pre-deploy script syncs from S3/GCS if minds get too large

For MVP: Dockerfile COPY is sufficient. 27 minds = ~26MB, fast to build.

---

## 11. Performance Strategy

### 11.1 Response Time Targets

| Operation | Target | Strategy |
|-----------|--------|----------|
| Mind catalog load | < 200ms | In-memory registry, no DB query |
| Mind profile load | < 300ms | Registry + 1 DB query (stats) |
| Chat first token | < 1.5s | Pre-built system prompt, cached artifacts |
| Chat streaming | Real-time | SSE, no buffering |
| Task creation | < 2s | Direct ClickUp API call |
| Conversation list | < 300ms | Indexed queries |

### 11.2 Caching Strategy

| Layer | Cache | TTL | Invalidation |
|-------|-------|-----|-------------|
| MindRegistry | In-memory Map | Server lifetime | Restart on deploy |
| Artifacts | LRU (50MB) | 30 min | On file change (future: fs watch) |
| API responses | TanStack Query | 5 min (minds), 30s (tasks) | Manual refetch |
| Clerk JWT | Automatic | Token expiry | Clerk handles |

### 11.3 Token Cost Optimization

| Model | Use Case | Cost (input/output per 1M) |
|-------|----------|---------------------------|
| claude-sonnet-4-6 | Mind conversations | $3 / $15 |
| claude-haiku-4-5 | Task intent detection (optional) | $0.25 / $1.25 |

**Estimated cost per conversation (10 messages):**
- System prompt: ~11.6K tokens (Tier 1+2)
- User messages: ~2K tokens (accumulated)
- Assistant responses: ~5K tokens
- **Total: ~18.6K input + ~5K output = ~$0.13 per conversation**
- **At 100 conversations/day: ~$13/day, ~$390/month**

---

## 12. Implementation Phases

### Phase 0: Monorepo Setup (1 story)
- Turborepo + pnpm workspace
- packages/web, packages/api, packages/shared
- ESLint, TypeScript, shared configs
- Root package.json scripts

### Phase 1: Backend Foundation (2-3 stories)
- Fastify server with plugin architecture
- Clerk auth middleware
- PostgreSQL + Drizzle schema + migrations
- Health endpoint
- MindRegistry (fs scan, metadata index)
- Environment validation (Zod)

### Phase 2: Mind Engine + Chat API (2-3 stories)
- MindEngine with tiered loading
- PromptBuilder (system prompt assembly)
- Claude service (Anthropic SDK streaming)
- Chat SSE endpoint
- Conversation persistence (DB)
- Artifact LRU cache

### Phase 3: Frontend Foundation (2-3 stories)
- Next.js 15 App Router setup
- Clerk auth (sign-in, sign-up, middleware)
- App shell (sidebar, topbar, layout)
- TanStack Query provider
- API client (typed fetch wrapper)
- shadcn/ui base components

### Phase 4: Central de Mentes UI (2 stories)
- Squad grid (cards with mind count)
- Mind catalog (cards with avatar, name, tags)
- Mind profile page (bio, frameworks, style)
- Search and filter

### Phase 5: Chat UI (2-3 stories)
- Chat container (messages + input)
- SSE streaming consumer
- Message rendering (markdown)
- Conversation list sidebar
- Streaming indicator
- Auto-scroll, keyboard shortcuts

### Phase 6: ClickUp Integration (1-2 stories)
- ClickUp service (API v2 client)
- Task creation from chat
- Task detection in assistant messages
- Task confirmation UI (inline card)
- Task panel (sidebar list with status)

### Phase 7: Polish & Deploy (1-2 stories)
- Railway deployment (Dockerfile, PostgreSQL)
- Vercel deployment (env vars)
- CORS, rate limiting, error handling
- Loading states, empty states, error states
- Mobile responsiveness
- End-to-end testing

**Total: ~15-20 stories across 7 phases**

---

## Appendix A: Environment Variables Checklist

### Frontend (Vercel)

| Variable | Required | Source |
|----------|---------|--------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk dashboard |
| `CLERK_SECRET_KEY` | Yes | Clerk dashboard |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Yes | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Yes | `/sign-up` |
| `NEXT_PUBLIC_API_URL` | Yes | Railway domain |
| `NEXT_PUBLIC_APP_NAME` | Yes | `Loyola Digital X` |

### Backend (Railway)

| Variable | Required | Source |
|----------|---------|--------|
| `PORT` | Yes | `3001` |
| `NODE_ENV` | Yes | `production` |
| `CORS_ORIGIN` | Yes | Vercel domain |
| `DATABASE_URL` | Yes | Railway PostgreSQL addon |
| `CLERK_SECRET_KEY` | Yes | Clerk dashboard |
| `CLERK_PUBLISHABLE_KEY` | Yes | Clerk dashboard |
| `ANTHROPIC_API_KEY` | Yes | Anthropic console |
| `CLICKUP_API_TOKEN` | Yes | ClickUp settings |
| `CLICKUP_LIST_ID` | Yes | ClickUp list for tasks |
| `MINDS_BASE_PATH` | Yes | `./squads` |

---

## Appendix B: Shared Types Package

```typescript
// packages/shared/src/types/mind.ts
export interface MindSummary {
  id: string;
  name: string;
  squad: string;
  squadDisplayName: string;
  specialty: string;
  tags: string[];
  avatarUrl: string | null;
}

export interface MindDetail extends MindSummary {
  bio: string;
  frameworks: string[];
  communicationStyle: {
    tone: string;
    vocabulary: string[];
  };
  stats: {
    artifactCount: number;
    heuristicCount: number;
    conversationCount: number;
  };
}

export interface Squad {
  id: string;
  name: string;
  displayName: string;
  description: string;
  mindCount: number;
  minds: MindSummary[];
}

// packages/shared/src/types/chat.ts
export interface ChatRequest {
  mindId: string;
  conversationId: string | null;
  message: string;
}

export type SSEEvent =
  | { type: 'conversation'; conversationId: string; isNew: boolean }
  | { type: 'text_delta'; text: string }
  | { type: 'task_detected'; title: string; description: string; priority: number }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'done'; messageId: string };

// packages/shared/src/types/task.ts
export interface CreateTaskRequest {
  conversationId: string;
  messageId: string;
  mindId: string;
  title: string;
  description: string;
  priority: 1 | 2 | 3 | 4;
  tags: string[];
}

export interface DelegatedTask {
  id: string;
  clickupTaskId: string;
  clickupUrl: string;
  title: string;
  description: string | null;
  status: 'pending' | 'open' | 'in_progress' | 'review' | 'done' | 'cancelled';
  priority: number;
  tags: string[] | null;
  mindId: string;
  createdAt: string;
}
```

---

*Architecture designed by Aria (Architect Agent) | Loyola Digital X v1.0.0 | 2026-03-13*
