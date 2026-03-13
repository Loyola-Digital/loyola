# Project Brief: Loyola Digital X

> Central de Mentes — Plataforma web para interação com AI Minds clonadas

**Status:** Discovery | **Data:** 2026-03-13 | **Autor:** Atlas (Analyst Agent)

---

## 1. Visao Geral

**Loyola Digital X** e a plataforma web da Loyola Digital onde funcionarios se cadastram, acessam uma Central de Mentes, conversam com AI Minds especializadas e delegam tarefas que sao criadas automaticamente no ClickUp.

### Problema

Os 27+ minds clonados e 47+ agentes do AIOX existem apenas no CLI. O Copywriter e outros funcionarios precisam acessar essas mentes sem conhecimento tecnico de terminal, com uma interface intuitiva e profissional.

### Solucao

Plataforma web com:
- Catalogo visual de minds organizadas por squad
- Chat 1:1 com qualquer mind (persona completa carregada)
- Delegacao de tarefas para minds → criacao automatica no ClickUp
- Interface moderna com UX de alto nivel

---

## 2. Decisoes Arquiteturais

| Decisao | Escolha | Justificativa |
|---------|---------|---------------|
| Arquitetura | **B: Frontend + Backend separados** | Escala independente, backend reutilizavel |
| Frontend | **Next.js 15 (App Router)** | SSR, Vercel-native, React ecosystem |
| Backend | **Node.js + Fastify** | Performance, TypeScript, plugin ecosystem |
| LLM Provider | **Claude API (direto)** | Sem intermediarios, Anthropic SDK nativo |
| Database | **PostgreSQL (proprio)** | Enterprise-grade, sem vendor lock-in |
| Auth | **Clerk** | Enterprise auth, multi-tenant ready, UI components prontos |
| Frontend Hosting | **Vercel** | Ja configurado, otimizado para Next.js |
| Backend Hosting | **Railway / Render / Fly.io** (decidir) | Container-based, PostgreSQL managed |
| Task Management | **ClickUp API** | Ja configurado no MCP do AIOX |
| Real-time | **WebSocket (via Fastify)** | Streaming de respostas das minds |

---

## 3. Escopo do MVP

### Incluso (MVP)

#### 3.1 Auth & Onboarding
- [ ] Cadastro de funcionarios via Clerk
- [ ] Login (email/password + social)
- [ ] Perfil do usuario com role (Copywriter, Strategist, etc.)
- [ ] Organizacao Loyola Digital como tenant

#### 3.2 Central de Mentes (Catalogo)
- [ ] Dashboard com squads em cards
- [ ] Lista de minds por squad com avatar, nome, especialidade
- [ ] Perfil da mind: bio, frameworks, estilo, especialidades
- [ ] Filtro e busca por nome/especialidade/squad
- [ ] Indicador de status/disponibilidade

#### 3.3 Chat com Minds
- [ ] Interface de chat 1:1 com mind selecionada
- [ ] Persona completa carregada (DEEP_Profile + identity + communication style)
- [ ] Streaming de respostas (real-time)
- [ ] Historico de conversas persistente
- [ ] Contexto mantido entre mensagens
- [ ] Markdown rendering nas respostas

#### 3.4 Integracao ClickUp (Task Delegation)
- [ ] Mind detecta quando user pede uma tarefa
- [ ] Confirmacao antes de criar task
- [ ] Criacao de task no ClickUp via API
- [ ] Sidebar com tasks criadas na sessao
- [ ] Status da task atualizado em real-time
- [ ] Link direto para task no ClickUp

### Excluido do MVP (Fase 2+)
- Mind Cloning Studio (interface de clonagem)
- Heuristics Builder visual
- Multi-tenant (outras organizacoes)
- Mobile app
- Integracao com outros LLMs
- Analytics dashboard
- Notificacoes push

---

## 4. Arquitetura Tecnica

### 4.1 Visao Macro

```
┌─────────────────────┐         ┌─────────────────────────┐
│   FRONTEND          │         │   BACKEND (API)         │
│   Next.js 15        │  REST/  │   Fastify + TypeScript  │
│   App Router        │  WS     │                         │
│   Vercel            │────────▶│   ┌─────────────────┐   │
│                     │         │   │ Mind Engine      │   │
│   - Pages/Routes    │         │   │ (loads .md →     │   │
│   - Clerk Auth      │         │   │  system prompt)  │   │
│   - Chat UI         │         │   └────────┬────────┘   │
│   - Mind Catalog    │         │            │             │
│   - Task Panel      │         │   ┌────────▼────────┐   │
└─────────────────────┘         │   │ Claude API      │   │
                                │   │ (Anthropic SDK) │   │
                                │   └─────────────────┘   │
                                │                         │
                                │   ┌─────────────────┐   │
                                │   │ ClickUp Service │   │
                                │   │ (Task CRUD)     │   │
                                │   └─────────────────┘   │
                                │                         │
                                │   ┌─────────────────┐   │
                                │   │ PostgreSQL      │   │
                                │   │ (users, chats,  │   │
                                │   │  minds, tasks)  │   │
                                │   └─────────────────┘   │
                                └─────────────────────────┘
```

### 4.2 Estrutura de Packages (Monorepo)

```
loyola/
├── packages/
│   ├── web/                    # Frontend Next.js 15
│   │   ├── app/
│   │   │   ├── (auth)/         # Clerk auth pages
│   │   │   │   ├── sign-in/
│   │   │   │   └── sign-up/
│   │   │   ├── (dashboard)/    # Authenticated routes
│   │   │   │   ├── page.tsx           # Dashboard home
│   │   │   │   ├── minds/
│   │   │   │   │   ├── page.tsx       # Mind catalog
│   │   │   │   │   └── [mindId]/
│   │   │   │   │       ├── page.tsx   # Mind profile
│   │   │   │   │       └── chat/
│   │   │   │   │           └── page.tsx  # Chat with mind
│   │   │   │   └── tasks/
│   │   │   │       └── page.tsx       # Tasks overview
│   │   │   ├── api/            # Next.js API routes (proxy)
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/             # shadcn/ui components
│   │   │   ├── minds/          # Mind-specific components
│   │   │   ├── chat/           # Chat components
│   │   │   └── tasks/          # Task components
│   │   ├── lib/
│   │   │   ├── api-client.ts   # Backend API client
│   │   │   └── utils.ts
│   │   ├── package.json
│   │   ├── tailwind.config.ts
│   │   └── next.config.ts
│   │
│   ├── api/                    # Backend Fastify
│   │   ├── src/
│   │   │   ├── server.ts       # Fastify app setup
│   │   │   ├── routes/
│   │   │   │   ├── minds.ts    # GET /minds, GET /minds/:id
│   │   │   │   ├── chat.ts     # POST /chat, WS /chat/stream
│   │   │   │   ├── tasks.ts    # POST /tasks, GET /tasks
│   │   │   │   └── health.ts   # GET /health
│   │   │   ├── services/
│   │   │   │   ├── mind-engine.ts     # Load minds, build prompts
│   │   │   │   ├── claude.ts          # Anthropic SDK wrapper
│   │   │   │   ├── clickup.ts         # ClickUp API integration
│   │   │   │   └── mind-registry.ts   # Index all minds from fs
│   │   │   ├── db/
│   │   │   │   ├── schema.ts          # Drizzle ORM schema
│   │   │   │   ├── migrations/
│   │   │   │   └── client.ts          # DB connection
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts            # Clerk JWT verification
│   │   │   └── config/
│   │   │       └── env.ts             # Environment config
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                 # Shared types/utils
│       ├── types/
│       │   ├── mind.ts         # Mind, Squad, Artifact types
│       │   ├── chat.ts         # Message, Conversation types
│       │   ├── task.ts         # ClickUp task types
│       │   └── user.ts         # User, Role types
│       └── package.json
│
├── squads/                     # [EXISTING] Mind data source
│   ├── content-engine/
│   ├── mmos-squad/
│   └── ...
│
├── .aiox-core/                 # [EXISTING] Framework
├── turbo.json                  # Turborepo config
├── package.json                # Root workspace
└── .env                        # Environment variables
```

### 4.3 Mind Engine — Detalhe Tecnico

```typescript
// Pseudocodigo do Mind Engine
interface MindContext {
  id: string;
  name: string;
  squad: string;
  systemPrompt: string;    // Montado dos artifacts
  artifacts: {
    deepProfile: string;   // DEEP_Profile.md
    identityCore: string;  // identity-core.md
    commStyle: string;     // communication-style.md
    frameworks: string;    // frameworks.md
    metaAxioms: string;    // meta-axioms.md
  };
  heuristics: string[];    // heuristics/*.md
}

// Pipeline de carregamento:
// 1. Registry indexa todos minds no startup (fs scan)
// 2. Na selecao, carrega artifacts essenciais (~15KB)
// 3. Monta system prompt com template
// 4. Heuristics carregadas sob demanda (quando relevante)
// 5. System prompt + user message → Claude API
// 6. Streaming response via WebSocket
```

### 4.4 Database Schema (PostgreSQL + Drizzle ORM)

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│ users        │     │ conversations    │     │ messages     │
│──────────────│     │──────────────────│     │──────────────│
│ id (uuid)    │──┐  │ id (uuid)        │──┐  │ id (uuid)    │
│ clerk_id     │  │  │ user_id (FK)     │  │  │ conv_id (FK) │
│ email        │  └─▶│ mind_id (str)    │  └─▶│ role (enum)  │
│ name         │     │ title            │     │ content      │
│ role         │     │ created_at       │     │ created_at   │
│ org_id       │     │ updated_at       │     │ tokens_used  │
│ created_at   │     └──────────────────┘     └──────────────┘
└──────────────┘
                     ┌──────────────────┐
                     │ delegated_tasks  │
                     │──────────────────│
                     │ id (uuid)        │
                     │ conv_id (FK)     │
                     │ message_id (FK)  │
                     │ clickup_task_id  │
                     │ title            │
                     │ status           │
                     │ clickup_url      │
                     │ created_at       │
                     └──────────────────┘
```

---

## 5. Tech Stack Completa

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| **Frontend** | Next.js | 15.x |
| **UI Library** | shadcn/ui + Tailwind CSS 4 | latest |
| **State** | TanStack Query (React Query) | 5.x |
| **Auth** | Clerk | latest |
| **Backend** | Fastify | 5.x |
| **ORM** | Drizzle ORM | latest |
| **Database** | PostgreSQL | 16 |
| **LLM** | Anthropic Claude API | claude-sonnet-4-6 (chat), claude-haiku-4-5 (classify) |
| **Monorepo** | Turborepo | latest |
| **Language** | TypeScript | 5.x |
| **Validation** | Zod | 3.x |
| **WebSocket** | @fastify/websocket | latest |
| **Task Mgmt** | ClickUp API v2 | - |
| **Frontend Host** | Vercel | - |
| **Backend Host** | Railway (PostgreSQL incluso) | - |
| **Package Manager** | pnpm | 9.x |

---

## 6. Variaveis de Ambiente Necessarias

### Frontend (.env.local — Vercel)

```env
# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Backend API
NEXT_PUBLIC_API_URL=https://api.loyoladigital.com  # ou Railway URL
NEXT_PUBLIC_WS_URL=wss://api.loyoladigital.com

# App
NEXT_PUBLIC_APP_NAME=Loyola Digital X
```

### Backend (.env — Railway)

```env
# Server
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://loyoladigital.com  # Vercel domain

# Database
DATABASE_URL=postgresql://user:pass@host:5432/loyola_x

# Clerk (JWT verification)
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...

# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# ClickUp
CLICKUP_API_TOKEN=pk_...
CLICKUP_WORKSPACE_ID=...
CLICKUP_SPACE_ID=...
CLICKUP_LIST_ID=...       # Lista padrao para tasks

# Minds
MINDS_BASE_PATH=./squads  # Path para os minds no filesystem
```

### O Que Voce Precisa Criar/Obter

| Servico | O Que Fazer | URL |
|---------|------------|-----|
| **Clerk** | Criar conta → criar app → copiar keys | clerk.com |
| **Railway** | Criar projeto → add PostgreSQL → deploy backend | railway.app |
| **Vercel** | Ja tem? Conectar repo → set env vars | vercel.com |
| **Anthropic** | Ja tem API key no .env | console.anthropic.com |
| **ClickUp** | Ja tem token no .env | app.clickup.com |

---

## 7. Fluxos de Usuario (MVP)

### Fluxo 1: Primeiro Acesso
```
Funcionario recebe convite →
  Clerk sign-up (email Loyola) →
    Onboarding (nome, role) →
      Dashboard com squads
```

### Fluxo 2: Conversar com Mind
```
Dashboard → Seleciona squad "content-engine" →
  Ve 28 minds disponiveis →
    Clica "Alex Hormozi" →
      Ve perfil (bio, estilo, frameworks) →
        Clica "Iniciar Conversa" →
          Chat interface abre →
            Digita mensagem →
              Mind responde como Hormozi
```

### Fluxo 3: Delegar Tarefa
```
No chat com Hormozi →
  User: "Cria uma headline para o lancamento X" →
    Hormozi responde com headline + pergunta:
    "Quer que eu crie uma task no ClickUp para refinar isso?" →
      User confirma →
        Task criada no ClickUp →
          Card aparece na sidebar com link
```

---

## 8. Recomendacao de Backend Hosting

### Railway (Recomendado)

| Aspecto | Detalhe |
|---------|---------|
| **PostgreSQL** | Incluso, managed, backups automaticos |
| **Deploy** | Git push → deploy automatico |
| **WebSocket** | Suportado nativamente |
| **Preco** | ~$5-20/mes para MVP |
| **Scaling** | Horizontal com replicas |
| **SSL** | Automatico |
| **Custom Domain** | Sim (api.loyoladigital.com) |

**Alternativas:** Render (similar), Fly.io (mais controle, edge deploy)

---

## 9. Estimativa de Complexidade

| Componente | Complexidade | Dependencias |
|-----------|-------------|-------------|
| Auth (Clerk) | Baixa | Clerk SDK + config |
| Mind Registry (indexar fs) | Media | Parsing .md, cache |
| Mind Engine (prompt builder) | Alta | Template system, smart loading |
| Chat API + Streaming | Media-Alta | WebSocket, Anthropic SDK |
| Chat UI | Media | Streaming render, markdown |
| Mind Catalog UI | Baixa | Cards, filtros, busca |
| ClickUp Integration | Media | API v2, webhook status |
| Database + ORM | Media | Drizzle, migrations |
| Monorepo Setup | Baixa | Turborepo, pnpm workspace |

---

## 10. Proximo Passo Recomendado

Ordem sugerida para implementacao:

1. **@architect** — Validar arquitetura, definir contratos de API, resolver como o Mind Engine carrega artifacts de forma eficiente
2. **@sm** — Criar epic + stories para o MVP (Story-Driven Development)
3. **@dev** — Implementar (comecando pelo monorepo setup + Mind Engine)

---

*Documento gerado por Atlas (Analyst Agent) | Loyola Digital X Discovery | 2026-03-13*
