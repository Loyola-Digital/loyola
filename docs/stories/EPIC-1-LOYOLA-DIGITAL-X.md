# EPIC-1: Loyola Digital X — Central de Mentes

> Plataforma web para funcionarios da Loyola Digital interagirem com AI Minds clonadas e delegarem tarefas via ClickUp.

**Status:** Draft
**Created:** 2026-03-13
**Author:** Morgan (PM Agent)
**Product:** Loyola Digital X

---

## Epic Goal

Entregar o MVP da plataforma Loyola Digital X onde funcionarios (comecando pelo Copywriter) se cadastram, acessam um catalogo de minds organizadas por squad, conversam com qualquer mind em sua persona completa via streaming, e delegam tarefas que sao criadas automaticamente no ClickUp.

## Epic Scope

**In Scope (MVP):**
- Auth com Clerk (cadastro, login, perfil)
- Catalogo visual de minds por squad
- Chat 1:1 com minds (streaming via SSE)
- Delegacao de tarefas → ClickUp
- Deploy (Vercel + Railway)

**Out of Scope (Fase 2+):**
- Mind Cloning Studio
- Heuristics Builder visual
- Multi-tenant
- Mobile app
- Analytics dashboard

## Reference Documents

| Document | Path |
|----------|------|
| Project Brief | `docs/discovery/project-brief-loyola-digital-x.md` |
| Full-Stack Architecture | `docs/architecture/fullstack-architecture-loyola-digital-x.md` |
| Database Schema | `docs/architecture/database-schema-design.md` |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router) + shadcn/ui + Tailwind 4 |
| Backend | Fastify 5 + TypeScript |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 (Railway) |
| Auth | Clerk |
| LLM | Claude API (Anthropic SDK) |
| Monorepo | Turborepo + pnpm |
| Frontend Host | Vercel |
| Backend Host | Railway |
| Task Mgmt | ClickUp API v2 |

---

## Story Map

```
Phase 0    Phase 1         Phase 2         Phase 3         Phase 4       Phase 5         Phase 6       Phase 7
Monorepo   Backend         Mind Engine     Frontend        Central de    Chat UI         ClickUp       Deploy
Setup      Foundation      + Chat API      Foundation      Mentes UI                     Integration   + Polish

1.0.1      1.1.1           1.2.1           1.3.1           1.4.1         1.5.1           1.6.1         1.7.1
           1.1.2           1.2.2           1.3.2           1.4.2         1.5.2           1.6.2         1.7.2
                           1.2.3           1.3.3                         1.5.3
```

---

## Stories

---

### Phase 0: Monorepo Setup

---

#### Story 1.0.1: Monorepo Scaffolding

```yaml
id: "1.0.1"
title: "Monorepo Scaffolding com Turborepo + pnpm"
status: Draft
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [structure_validation, config_review]
priority: P0
estimate: S
```

**Description:**
Criar a estrutura monorepo com Turborepo e pnpm workspaces contendo os 3 packages: `web`, `api`, `shared`.

**Acceptance Criteria:**
- [ ] Root `package.json` com pnpm workspace config
- [ ] `pnpm-workspace.yaml` com `packages/*`
- [ ] `turbo.json` com pipelines: `build`, `dev`, `lint`, `typecheck`
- [ ] `packages/web/` — Next.js 15 app inicializado (App Router)
- [ ] `packages/api/` — Fastify project com TypeScript
- [ ] `packages/shared/` — Package de tipos compartilhados
- [ ] Cada package com seu `package.json`, `tsconfig.json`
- [ ] `tsconfig.base.json` na raiz com config compartilhada
- [ ] ESLint config compartilhada
- [ ] `.gitignore` completo (node_modules, .env, .next, dist)
- [ ] `pnpm dev` inicia web + api em paralelo
- [ ] `pnpm build` compila todos os packages
- [ ] `pnpm lint` roda em todos os packages
- [ ] `pnpm typecheck` passa sem erros

**File List:**
- [ ] `package.json` (root)
- [ ] `pnpm-workspace.yaml`
- [ ] `turbo.json`
- [ ] `tsconfig.base.json`
- [ ] `.eslintrc.js` (root)
- [ ] `.gitignore`
- [ ] `packages/web/package.json`
- [ ] `packages/web/tsconfig.json`
- [ ] `packages/web/next.config.ts`
- [ ] `packages/web/app/layout.tsx`
- [ ] `packages/web/app/page.tsx`
- [ ] `packages/api/package.json`
- [ ] `packages/api/tsconfig.json`
- [ ] `packages/api/src/app.ts`
- [ ] `packages/api/src/server.ts`
- [ ] `packages/shared/package.json`
- [ ] `packages/shared/tsconfig.json`
- [ ] `packages/shared/src/index.ts`

---

### Phase 1: Backend Foundation

---

#### Story 1.1.1: Fastify Server + Database + Auth Middleware

```yaml
id: "1.1.1"
title: "Backend Foundation — Fastify + PostgreSQL + Clerk Auth"
status: Draft
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [code_review, security_review, schema_validation]
priority: P0
estimate: M
depends_on: ["1.0.1"]
```

**Description:**
Configurar o servidor Fastify com plugin architecture, conectar ao PostgreSQL via Drizzle ORM, aplicar o schema inicial (4 tabelas + triggers), e implementar o middleware de autenticacao Clerk.

**Acceptance Criteria:**
- [ ] Fastify 5 server com plugin architecture (conforme architecture doc section 5.3)
- [ ] Zod-validated environment config (`src/config/env.ts`)
- [ ] PostgreSQL connection via Drizzle ORM (`src/db/client.ts`)
- [ ] Schema completo aplicado conforme `database-schema-design.md`:
  - [ ] Tabela `users` com clerk_id unique, email unique, role enum
  - [ ] Tabela `conversations` com soft delete, check constraints
  - [ ] Tabela `messages` append-only com check constraints
  - [ ] Tabela `delegated_tasks` com clickup_task_id unique
  - [ ] 4 enums: user_role, message_role, task_status, task_priority
  - [ ] 9 indexes (incluindo partial indexes)
  - [ ] 5 triggers (updated_at, counters, auto-title)
- [ ] Drizzle migration gerada e aplicavel (`drizzle-kit generate` + `drizzle-kit migrate`)
- [ ] Clerk JWT verification middleware (`src/middleware/auth.ts`)
- [ ] CORS configurado (whitelist frontend domain)
- [ ] Rate limiting (100 req/min/user)
- [ ] `GET /api/health` retorna `{ status: "ok", db: "connected" }`
- [ ] Health check verifica conexao com DB
- [ ] Dockerfile funcional para Railway
- [ ] Testes: health endpoint retorna 200, auth rejeita request sem JWT

**File List:**
- [ ] `packages/api/src/server.ts`
- [ ] `packages/api/src/app.ts`
- [ ] `packages/api/src/config/env.ts`
- [ ] `packages/api/src/db/client.ts`
- [ ] `packages/api/src/db/schema.ts`
- [ ] `packages/api/src/db/migrations/0001_initial_schema.sql`
- [ ] `packages/api/src/middleware/auth.ts`
- [ ] `packages/api/src/middleware/cors.ts`
- [ ] `packages/api/src/middleware/rate-limit.ts`
- [ ] `packages/api/src/routes/health.ts`
- [ ] `packages/api/drizzle.config.ts`
- [ ] `packages/api/Dockerfile`
- [ ] `packages/api/.env.example`

---

#### Story 1.1.2: Mind Registry — Filesystem Scanner

```yaml
id: "1.1.2"
title: "Mind Registry — Indexacao de Minds do Filesystem"
status: Draft
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [code_review, pattern_validation]
priority: P0
estimate: M
depends_on: ["1.1.1"]
```

**Description:**
Criar o MindRegistry que escaneia `squads/` no startup, indexa todas as minds e agentes com metadata, e expoe endpoints REST para o catalogo.

**Acceptance Criteria:**
- [ ] `MindRegistry` service como Fastify plugin
- [ ] Scan `squads/*/minds/*/` para minds (mmos-squad pattern)
- [ ] Scan `squads/*/agents/*.md` para agentes (content-engine pattern)
- [ ] Extrai metadata sem carregar conteudo completo dos artifacts:
  - [ ] id, name, squad, squadDisplayName
  - [ ] specialty (de config.json ou primeira linha do DEEP_Profile)
  - [ ] tags extraidas dos artifacts
  - [ ] paths para cada artifact (cognitiveOS, communicationDNA, frameworks, etc.)
  - [ ] heuristic file paths
  - [ ] totalTokenEstimate (calculado do tamanho dos arquivos)
- [ ] Cache em memoria (Map) — inicializado no startup
- [ ] `GET /api/minds` retorna lista agrupada por squad
- [ ] `GET /api/minds/:mindId` retorna MindDetail com bio, frameworks, communicationStyle
- [ ] Busca por nome e especialidade (query param `?q=hormozi`)
- [ ] Scan completa em < 500ms para 27+ minds
- [ ] Tipagem compartilhada em `packages/shared` (MindSummary, MindDetail, Squad)

**File List:**
- [ ] `packages/api/src/services/mind-registry.ts`
- [ ] `packages/api/src/routes/minds.ts`
- [ ] `packages/shared/src/types/mind.ts`

---

### Phase 2: Mind Engine + Chat API

---

#### Story 1.2.1: Mind Engine — Tiered Prompt Builder

```yaml
id: "1.2.1"
title: "Mind Engine — Carregamento de Artifacts e Montagem de System Prompt"
status: Draft
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [code_review, pattern_validation, performance_review]
priority: P0
estimate: L
depends_on: ["1.1.2"]
```

**Description:**
Implementar o Mind Engine com estrategia de carregamento em 3 tiers conforme architecture doc section 6.

**Acceptance Criteria:**
- [ ] `MindEngine` service como Fastify plugin
- [ ] `PromptBuilder` com 3 tiers:
  - [ ] Tier 1 (sempre): COGNITIVE_OS.md + COMMUNICATION_DNA.md (~5K tokens)
  - [ ] Tier 2 (inicio conversa): Frameworks + Value Equation + Axioms (~6.6K tokens)
  - [ ] Tier 3 (sob demanda): Cases, Antipatterns, Heuristics
- [ ] `ArtifactCache` com LRU (max 100 entries, 50MB, TTL 30min)
- [ ] Monta system prompt completo com header de identidade + artifacts + task delegation prompt
- [ ] Suporta ambos tipos: MMOS minds (multi-file) e Content-Engine agents (single-file)
- [ ] `buildSystemPrompt(mindId, tier)` retorna string pronta para Claude API
- [ ] Token estimation por mind (sem chamar API)
- [ ] Testes: prompt montado para alex_hormozi contém identity + vocabulary rules

**File List:**
- [ ] `packages/api/src/services/mind-engine.ts`

---

#### Story 1.2.2: Claude Service + Chat SSE Endpoint

```yaml
id: "1.2.2"
title: "Claude API Streaming + Chat SSE Endpoint"
status: Draft
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [code_review, security_review, api_contract_validation]
priority: P0
estimate: L
depends_on: ["1.2.1"]
```

**Description:**
Integrar com a Claude API via Anthropic SDK para streaming de respostas, e criar o endpoint SSE que o frontend vai consumir.

**Acceptance Criteria:**
- [ ] `ClaudeService` como Fastify plugin wrapping `@anthropic-ai/sdk`
- [ ] Metodo `stream(systemPrompt, messages)` retorna ReadableStream
- [ ] Usa `claude-sonnet-4-6` como modelo default
- [ ] `POST /api/chat` endpoint conforme API contract (architecture doc section 8.2):
  - [ ] Recebe `{ mindId, conversationId?, message }`
  - [ ] Retorna `text/event-stream` com eventos: `conversation`, `text_delta`, `task_detected`, `usage`, `done`
- [ ] Se `conversationId` e null, cria nova conversa no DB
- [ ] Carrega historico de mensagens da conversa para contexto
- [ ] Detecta `json:task` block na resposta do assistant e emite evento `task_detected`
- [ ] Persiste mensagem do user e do assistant no DB ao finalizar stream
- [ ] Atualiza `conversations.updated_at` e contadores (via trigger)
- [ ] Limita historico de mensagens no contexto (ultimas 20 mensagens)
- [ ] Error handling: retorna SSE event `error` em caso de falha
- [ ] Rate limit especifico para chat: 20 req/min/user

**File List:**
- [ ] `packages/api/src/services/claude.ts`
- [ ] `packages/api/src/routes/chat.ts`
- [ ] `packages/shared/src/types/chat.ts`

---

#### Story 1.2.3: Conversation Service + Endpoints

```yaml
id: "1.2.3"
title: "Conversation Service — CRUD + Historico"
status: Draft
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [code_review, api_contract_validation]
priority: P1
estimate: M
depends_on: ["1.1.1"]
```

**Description:**
Service e endpoints para gerenciar conversas e acessar historico de mensagens.

**Acceptance Criteria:**
- [ ] `ConversationService` como Fastify plugin
- [ ] `GET /api/conversations` — lista conversas do user autenticado
  - [ ] Query params: `?limit=20&offset=0&mindId=optional`
  - [ ] Ordenado por `updated_at DESC`
  - [ ] Exclui soft-deleted (`deleted_at IS NULL`)
  - [ ] Retorna `{ conversations: [...], total: number }`
- [ ] `GET /api/conversations/:id/messages` — mensagens da conversa
  - [ ] Query params: `?limit=50&before=messageId` (cursor pagination)
  - [ ] Verifica que conversa pertence ao user autenticado
  - [ ] Retorna `{ messages: [...] }`
- [ ] `DELETE /api/conversations/:id` — soft delete (set deleted_at)
  - [ ] Verifica ownership
- [ ] Todas queries scopadas por `user_id` (seguranca)
- [ ] Testes: CRUD funciona, user A nao acessa conversa do user B

**File List:**
- [ ] `packages/api/src/services/conversation.ts`
- [ ] `packages/api/src/routes/conversations.ts`
- [ ] `packages/shared/src/types/chat.ts` (update)

---

### Phase 3: Frontend Foundation

---

#### Story 1.3.1: Next.js Setup + Clerk Auth

```yaml
id: "1.3.1"
title: "Frontend Foundation — Next.js 15 + Clerk Auth"
status: Draft
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [code_review, security_review]
priority: P0
estimate: M
depends_on: ["1.0.1"]
```

**Description:**
Configurar o frontend Next.js 15 com Clerk para autenticacao e as rotas base.

**Acceptance Criteria:**
- [ ] Next.js 15 com App Router configurado
- [ ] Tailwind CSS 4 configurado
- [ ] shadcn/ui inicializado com tema escuro/claro
- [ ] `@clerk/nextjs` instalado e configurado
  - [ ] `ClerkProvider` no root layout
  - [ ] Middleware protegendo rotas `(app)/`
  - [ ] Pagina `/sign-in` com `<SignIn />`
  - [ ] Pagina `/sign-up` com `<SignUp />`
- [ ] Layout do app autenticado: sidebar + topbar + main content area
- [ ] Pagina dashboard basica (`/`) com placeholder
- [ ] TanStack Query provider configurado
- [ ] API client tipado (`lib/api-client.ts`) apontando para backend URL
- [ ] Zustand store para UI state (sidebar toggle)
- [ ] Clerk webhook route (`/api/clerk-webhook`) que faz POST para backend para sync user

**File List:**
- [ ] `packages/web/app/layout.tsx`
- [ ] `packages/web/app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- [ ] `packages/web/app/(auth)/sign-up/[[...sign-up]]/page.tsx`
- [ ] `packages/web/app/(auth)/layout.tsx`
- [ ] `packages/web/app/(app)/layout.tsx`
- [ ] `packages/web/app/(app)/page.tsx`
- [ ] `packages/web/app/api/clerk-webhook/route.ts`
- [ ] `packages/web/middleware.ts`
- [ ] `packages/web/lib/api-client.ts`
- [ ] `packages/web/lib/stores/ui-store.ts`
- [ ] `packages/web/lib/providers.tsx`
- [ ] `packages/web/components/layout/app-sidebar.tsx`
- [ ] `packages/web/components/layout/topbar.tsx`
- [ ] `packages/web/tailwind.config.ts`
- [ ] `packages/web/components.json` (shadcn config)

---

#### Story 1.3.2: Backend User Sync Endpoint

```yaml
id: "1.3.2"
title: "User Sync — Clerk Webhook → PostgreSQL"
status: Draft
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [code_review, security_review]
priority: P0
estimate: S
depends_on: ["1.1.1"]
```

**Description:**
Endpoint no backend que recebe webhooks do Clerk para sincronizar usuarios na tabela `users`.

**Acceptance Criteria:**
- [ ] `POST /api/webhooks/clerk` endpoint
- [ ] Valida webhook signature (Clerk Webhook Secret)
- [ ] Handles eventos: `user.created`, `user.updated`, `user.deleted`
- [ ] `user.created` → INSERT na tabela users (clerk_id, email, name, avatar_url)
- [ ] `user.updated` → UPDATE email, name, avatar_url
- [ ] `user.deleted` → DELETE (cascade limpa conversas e tasks)
- [ ] Endpoint nao requer JWT auth (webhook vem do Clerk, nao do user)
- [ ] Idempotente: re-processar mesmo evento nao causa erro
- [ ] Retorna 200 para o Clerk em todos os casos (nao retry infinito)

**File List:**
- [ ] `packages/api/src/routes/webhooks.ts`

---

#### Story 1.3.3: Shared Types Package

```yaml
id: "1.3.3"
title: "Shared Types — Tipos TypeScript Compartilhados"
status: Draft
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [type_review]
priority: P1
estimate: S
depends_on: ["1.0.1"]
```

**Description:**
Popular o package `@loyola-x/shared` com todos os tipos usados entre frontend e backend.

**Acceptance Criteria:**
- [ ] `types/mind.ts` — MindSummary, MindDetail, Squad
- [ ] `types/chat.ts` — ChatRequest, SSEEvent, Message, Conversation
- [ ] `types/task.ts` — CreateTaskRequest, DelegatedTask
- [ ] `types/user.ts` — User, UserRole
- [ ] Exporta tudo de `src/index.ts`
- [ ] `packages/web` e `packages/api` importam de `@loyola-x/shared`
- [ ] `pnpm typecheck` passa sem erros

**File List:**
- [ ] `packages/shared/src/types/mind.ts`
- [ ] `packages/shared/src/types/chat.ts`
- [ ] `packages/shared/src/types/task.ts`
- [ ] `packages/shared/src/types/user.ts`
- [ ] `packages/shared/src/index.ts`

---

### Phase 4: Central de Mentes UI

---

#### Story 1.4.1: Mind Catalog — Squad Grid + Mind Cards

```yaml
id: "1.4.1"
title: "Central de Mentes — Catalogo Visual"
status: Draft
executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: [ui_review, accessibility_check]
priority: P0
estimate: M
depends_on: ["1.3.1", "1.1.2"]
```

**Description:**
Pagina principal do catalogo de minds com grid de squads e cards de minds.

**Acceptance Criteria:**
- [ ] Pagina `/minds` com grid de squads (cards expandiveis)
- [ ] Cada squad card mostra: nome, descricao, contagem de minds
- [ ] Ao expandir squad, mostra grid de mind cards
- [ ] Mind card mostra: avatar (iniciais), nome, especialidade, tags
- [ ] Barra de busca com filtro por nome/especialidade
- [ ] Busca em tempo real (debounced 300ms)
- [ ] Loading skeleton enquanto carrega dados
- [ ] Empty state se nenhuma mind encontrada
- [ ] Responsivo: 1 coluna mobile, 2-3 tablet, 4 desktop
- [ ] Dados carregados via TanStack Query (cached 5min)
- [ ] Clicar em mind card navega para `/minds/[mindId]`

**File List:**
- [ ] `packages/web/app/(app)/minds/page.tsx`
- [ ] `packages/web/components/minds/squad-grid.tsx`
- [ ] `packages/web/components/minds/mind-card.tsx`
- [ ] `packages/web/components/minds/mind-search.tsx`
- [ ] `packages/web/components/minds/mind-avatar.tsx`
- [ ] `packages/web/lib/hooks/use-minds.ts`

---

#### Story 1.4.2: Mind Profile Page

```yaml
id: "1.4.2"
title: "Mind Profile — Perfil Detalhado da Mind"
status: Draft
executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: [ui_review, accessibility_check]
priority: P1
estimate: S
depends_on: ["1.4.1"]
```

**Description:**
Pagina de perfil individual de uma mind com bio, frameworks, estilo de comunicacao e botao para iniciar conversa.

**Acceptance Criteria:**
- [ ] Pagina `/minds/[mindId]` com perfil completo
- [ ] Mostra: avatar grande, nome, squad, especialidade
- [ ] Secao "Sobre" com bio extraida dos artifacts
- [ ] Secao "Frameworks" com lista de frameworks que a mind usa
- [ ] Secao "Estilo de Comunicacao" com tone e vocabulario
- [ ] Secao "Estatisticas" com contagem de conversas do user com esta mind
- [ ] Botao "Iniciar Conversa" que cria nova conversa e navega para chat
- [ ] Botao "Continuar Conversa" se ja existe conversa ativa
- [ ] Loading state e error state
- [ ] Breadcrumb: Minds > Squad Name > Mind Name

**File List:**
- [ ] `packages/web/app/(app)/minds/[mindId]/page.tsx`
- [ ] `packages/web/components/minds/mind-profile.tsx`
- [ ] `packages/web/lib/hooks/use-mind.ts`

---

### Phase 5: Chat UI

---

#### Story 1.5.1: Chat Interface — Messages + Input

```yaml
id: "1.5.1"
title: "Chat UI — Interface de Conversa com Streaming"
status: Draft
executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: [ui_review, accessibility_check, performance_review]
priority: P0
estimate: L
depends_on: ["1.2.2", "1.4.1"]
```

**Description:**
Interface de chat completa com streaming de respostas via SSE.

**Acceptance Criteria:**
- [ ] Pagina `/minds/[mindId]/chat` com interface de chat full-height
- [ ] Lista de mensagens scrollavel com auto-scroll em novas mensagens
- [ ] User messages alinhadas a direita, assistant messages a esquerda
- [ ] Avatar da mind nas mensagens do assistant
- [ ] Textarea com auto-resize para input (shift+enter para nova linha, enter para enviar)
- [ ] Botao enviar (ativo apenas quando ha texto)
- [ ] SSE streaming consumer: tokens renderizados em tempo real
- [ ] Indicador "Mind esta pensando..." durante streaming
- [ ] Markdown rendering nas respostas (headers, bold, italic, code blocks, listas)
- [ ] Syntax highlighting em code blocks
- [ ] Carrega historico de mensagens ao abrir conversa existente
- [ ] Scroll to bottom button quando nao esta no fundo
- [ ] Keyboard shortcut: Cmd/Ctrl+Enter para enviar
- [ ] Disable input enquanto streaming esta ativo
- [ ] Error state: mostra mensagem amigavel se stream falhar

**File List:**
- [ ] `packages/web/app/(app)/minds/[mindId]/chat/page.tsx`
- [ ] `packages/web/components/chat/chat-container.tsx`
- [ ] `packages/web/components/chat/message-list.tsx`
- [ ] `packages/web/components/chat/message-bubble.tsx`
- [ ] `packages/web/components/chat/chat-input.tsx`
- [ ] `packages/web/components/chat/streaming-indicator.tsx`
- [ ] `packages/web/lib/hooks/use-chat-stream.ts`

---

#### Story 1.5.2: Conversation History Sidebar

```yaml
id: "1.5.2"
title: "Sidebar — Historico de Conversas"
status: Draft
executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: [ui_review]
priority: P1
estimate: M
depends_on: ["1.5.1", "1.2.3"]
```

**Description:**
Sidebar no chat mostrando conversas anteriores e tarefas delegadas.

**Acceptance Criteria:**
- [ ] Sidebar colapsavel no lado esquerdo da tela de chat
- [ ] Lista de conversas do user (todas as minds)
- [ ] Cada item mostra: mind avatar, mind name, titulo da conversa, data
- [ ] Conversa ativa destacada
- [ ] Clicar em conversa navega para ela
- [ ] Botao "Nova Conversa" no topo
- [ ] Opcao de deletar conversa (soft delete com confirmacao)
- [ ] Secao "Tarefas Recentes" abaixo das conversas
- [ ] Responsivo: sidebar como drawer no mobile

**File List:**
- [ ] `packages/web/components/chat/chat-sidebar.tsx`
- [ ] `packages/web/components/chat/conversation-item.tsx`
- [ ] `packages/web/lib/hooks/use-conversations.ts`

---

#### Story 1.5.3: Pagina de Conversas

```yaml
id: "1.5.3"
title: "Pagina de Conversas — Historico Completo"
status: Draft
executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: [ui_review]
priority: P2
estimate: S
depends_on: ["1.2.3", "1.3.1"]
```

**Description:**
Pagina dedicada para visualizar todas as conversas do usuario.

**Acceptance Criteria:**
- [ ] Pagina `/conversations` com lista de todas as conversas
- [ ] Filtro por mind
- [ ] Ordenacao por data (mais recente primeiro)
- [ ] Cada item mostra: mind avatar, mind name, titulo, data, message count
- [ ] Clicar navega para o chat da conversa
- [ ] Paginacao ou infinite scroll
- [ ] Empty state: "Nenhuma conversa ainda. Explore as minds!"

**File List:**
- [ ] `packages/web/app/(app)/conversations/page.tsx`

---

### Phase 6: ClickUp Integration

---

#### Story 1.6.1: ClickUp Service + Task Endpoints

```yaml
id: "1.6.1"
title: "ClickUp Integration — Service + API"
status: Draft
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [code_review, api_contract_validation, security_review]
priority: P0
estimate: M
depends_on: ["1.1.1"]
```

**Description:**
Service para comunicacao com a ClickUp API v2 e endpoints REST para criar e listar tasks.

**Acceptance Criteria:**
- [ ] `ClickUpService` como Fastify plugin
- [ ] Metodo `createTask({ name, description, listId, priority, tags })` → ClickUp API v2
- [ ] Mapeia priority enum para ClickUp priority (urgent=1, high=2, normal=3, low=4)
- [ ] `POST /api/tasks` conforme API contract:
  - [ ] Recebe `{ conversationId, messageId, mindId, title, description, priority, tags }`
  - [ ] Cria task no ClickUp
  - [ ] Salva em `delegated_tasks` com clickup_task_id e clickup_url
  - [ ] Retorna DelegatedTask
- [ ] `GET /api/tasks` — lista tasks do user autenticado
  - [ ] Query params: `?status=open&limit=20`
  - [ ] Ordenado por `created_at DESC`
- [ ] Error handling: se ClickUp API falha, retorna erro claro (nao salva task local)
- [ ] Idempotencia: se clickup_task_id ja existe, retorna task existente

**File List:**
- [ ] `packages/api/src/services/clickup.ts`
- [ ] `packages/api/src/routes/tasks.ts`
- [ ] `packages/shared/src/types/task.ts` (update)

---

#### Story 1.6.2: Task UI — Detection + Panel

```yaml
id: "1.6.2"
title: "Task UI — Deteccao no Chat + Painel de Tasks"
status: Draft
executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: [ui_review, accessibility_check]
priority: P0
estimate: M
depends_on: ["1.6.1", "1.5.1"]
```

**Description:**
Detectar sugestoes de task nas respostas das minds e mostrar painel de tasks no chat.

**Acceptance Criteria:**
- [ ] Quando SSE emite evento `task_detected`, mostra card inline na mensagem
- [ ] Card mostra: titulo, descricao, prioridade, tags
- [ ] Botoes "Criar no ClickUp" e "Ignorar"
- [ ] Ao confirmar: chama `POST /api/tasks`, mostra loading, mostra sucesso com link
- [ ] Task criada aparece no painel lateral de tasks
- [ ] Painel de tasks na sidebar do chat (abaixo de conversas)
- [ ] Cada task mostra: titulo, status badge colorido, link para ClickUp
- [ ] Pagina `/tasks` com lista completa de tasks delegadas
- [ ] Badge de contagem no sidebar nav item "Tasks"

**File List:**
- [ ] `packages/web/components/chat/task-suggestion-card.tsx`
- [ ] `packages/web/components/tasks/task-card.tsx`
- [ ] `packages/web/components/tasks/task-list.tsx`
- [ ] `packages/web/components/tasks/task-status-badge.tsx`
- [ ] `packages/web/app/(app)/tasks/page.tsx`
- [ ] `packages/web/lib/hooks/use-tasks.ts`

---

### Phase 7: Deploy + Polish

---

#### Story 1.7.1: Railway Deploy — Backend + Database

```yaml
id: "1.7.1"
title: "Deploy Backend — Railway + PostgreSQL"
status: Draft
executor: "@devops"
quality_gate: "@architect"
quality_gate_tools: [infra_review, security_review]
priority: P0
estimate: M
depends_on: ["1.2.2", "1.6.1"]
```

**Description:**
Deploy do backend Fastify no Railway com PostgreSQL managed e volume para squads.

**Acceptance Criteria:**
- [ ] Railway project criado com PostgreSQL addon
- [ ] `DATABASE_URL` configurado automaticamente
- [ ] Dockerfile funciona no Railway builder
- [ ] Squads copiados para imagem Docker (ou volume persistente)
- [ ] Todas env vars configuradas no Railway:
  - [ ] CORS_ORIGIN, CLERK_SECRET_KEY, ANTHROPIC_API_KEY
  - [ ] CLICKUP_API_TOKEN, CLICKUP_LIST_ID
  - [ ] MINDS_BASE_PATH
- [ ] Custom domain configurado (api.loyoladigital.com ou similar)
- [ ] SSL automatico
- [ ] Health check funciona (`/api/health` retorna 200)
- [ ] Migration roda no startup ou via deploy hook
- [ ] Logs acessiveis via Railway dashboard

**File List:**
- [ ] `packages/api/Dockerfile` (update)
- [ ] `packages/api/railway.toml`

---

#### Story 1.7.2: Vercel Deploy + Polish

```yaml
id: "1.7.2"
title: "Deploy Frontend — Vercel + Polish Final"
status: Draft
executor: "@devops"
quality_gate: "@qa"
quality_gate_tools: [e2e_test, performance_review, accessibility_check]
priority: P0
estimate: M
depends_on: ["1.7.1", "1.5.1", "1.6.2"]
```

**Description:**
Deploy do frontend no Vercel, configuracao de env vars, e polish final de UX.

**Acceptance Criteria:**
- [ ] Vercel project conectado ao repo (monorepo root, framework: Next.js, root: packages/web)
- [ ] Env vars configuradas:
  - [ ] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
  - [ ] NEXT_PUBLIC_API_URL apontando para Railway backend
  - [ ] NEXT_PUBLIC_APP_NAME = "Loyola Digital X"
- [ ] Build funciona sem erros
- [ ] Domain configurado (app.loyoladigital.com ou similar)
- [ ] Clerk webhook URL configurado para backend
- [ ] **Polish:**
  - [ ] Loading states em todas as paginas (skeletons)
  - [ ] Empty states com CTAs claros
  - [ ] Error states amigaveis (nao stack traces)
  - [ ] Mobile responsivo (sidebar colapse, chat full-width)
  - [ ] Favicon e meta tags (title, description, og:image)
- [ ] Teste end-to-end: cadastro → login → browse minds → chat → create task
- [ ] Performance: LCP < 2.5s, FID < 100ms

**File List:**
- [ ] `packages/web/vercel.json` (se necessario)
- [ ] `packages/web/app/layout.tsx` (meta tags update)
- [ ] `packages/web/public/favicon.ico`

---

## Dependency Graph

```
1.0.1 (Monorepo)
  ├──▶ 1.1.1 (Backend Foundation)
  │      ├──▶ 1.1.2 (Mind Registry)
  │      │      └──▶ 1.2.1 (Mind Engine)
  │      │             └──▶ 1.2.2 (Chat SSE)
  │      │                    └──▶ 1.5.1 (Chat UI) ──▶ 1.5.2 (Sidebar)
  │      │                    └──▶ 1.7.1 (Railway Deploy)
  │      ├──▶ 1.2.3 (Conversation Service)
  │      ├──▶ 1.3.2 (User Sync Webhook)
  │      └──▶ 1.6.1 (ClickUp Service) ──▶ 1.6.2 (Task UI)
  │                                              └──▶ 1.7.2 (Vercel Deploy)
  ├──▶ 1.3.1 (Frontend Foundation) ──▶ 1.4.1 (Mind Catalog) ──▶ 1.4.2 (Mind Profile)
  │                                                                    └──▶ 1.5.1
  └──▶ 1.3.3 (Shared Types)
```

## Execution Waves (Parallelism)

| Wave | Stories | Can Run In Parallel |
|------|---------|-------------------|
| **Wave 1** | 1.0.1 | No (foundation) |
| **Wave 2** | 1.1.1, 1.3.1, 1.3.3 | Yes (backend + frontend + types) |
| **Wave 3** | 1.1.2, 1.3.2, 1.2.3, 1.6.1 | Yes (all depend on 1.1.1 only) |
| **Wave 4** | 1.2.1, 1.4.1 | Yes (Mind Engine + Catalog UI) |
| **Wave 5** | 1.2.2, 1.4.2 | Yes (Chat API + Mind Profile) |
| **Wave 6** | 1.5.1, 1.6.2 | Yes (Chat UI + Task UI) |
| **Wave 7** | 1.5.2, 1.5.3 | Yes (Sidebar + Conversations page) |
| **Wave 8** | 1.7.1 | No (deploy backend first) |
| **Wave 9** | 1.7.2 | No (deploy frontend, final polish) |

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Mind artifacts too large for context | Chat quality degrades | Tiered loading (ADR-004) limits to ~11.6K base tokens |
| Claude API costs escalate | Budget exceeded | Track tokens per conversation, set monthly budget alerts |
| ClickUp API rate limits | Task creation fails | Queue + retry with exponential backoff |
| Railway cold starts | Slow first chat response | Health check keepalive, min 1 replica |
| Clerk webhook misses | Users not synced | Idempotent webhook handler, manual sync endpoint |

## Definition of Done

- [ ] Todas as 17 stories completadas com acceptance criteria atendidos
- [ ] `pnpm lint` sem erros
- [ ] `pnpm typecheck` sem erros
- [ ] `pnpm build` sucesso (web + api)
- [ ] Deploy funcionando (Vercel + Railway)
- [ ] Fluxo completo funciona: cadastro → login → browse minds → chat → create task
- [ ] Documentacao de deploy atualizada

---

*Epic created by Morgan (PM Agent) | Loyola Digital X | 2026-03-13*
