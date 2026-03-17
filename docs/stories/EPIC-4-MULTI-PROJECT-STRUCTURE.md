# EPIC-4: Multi-Project Structure — Client Workspaces

> Reorganizar a plataforma em torno de projetos/clientes. Cada cliente é uma pasta colapsável na sidebar com seus próprios recursos (Instagram, Conversas, Tasks). Admins mantêm visão global de todos os projetos.

**Status:** Draft
**Created:** 2026-03-17
**Author:** Morgan (PM Agent)
**Product:** Loyola Digital X
**Parent:** EPIC-1

---

## Epic Goal

Introduzir o conceito de **Projeto** (= cliente) como unidade organizacional central da plataforma. Recursos como contas de Instagram, conversas e tasks passam a ser vinculados a um projeto específico. A sidebar ganha uma seção "Projetos" com folders colapsáveis no estilo ClickUp, abaixo das seções globais existentes.

## Business Value

- Loyola gerencia dezenas de clientes simultaneamente — projetos eliminam a mistura de dados entre clientes
- Admins têm visão consolidada (global) e visão por cliente em um único lugar
- Prepara a plataforma para o sistema de guests (EPIC-5): convidados (clientes) acessam apenas o seu projeto
- Estrutura familiar ao time (ClickUp-like) — curva de aprendizado mínima
- Escalabilidade: adicionar novos tipos de recurso por projeto no futuro é trivial

## Epic Scope

**In Scope (MVP):**
- Entidade `projects` no banco com CRUD completo
- `instagram_accounts` vinculadas a um projeto (FK obrigatória)
- `conversations` vinculadas a um projeto (nullable — conversas globais de admins continuam)
- `delegated_tasks` vinculadas a um projeto (nullable)
- Sidebar redesenhada: seção global (existente) + seção Projetos com folders colapsáveis
- Dashboard de Instagram por projeto em `/projects/[id]/instagram`
- Conversas por projeto em `/projects/[id]/conversations`
- Visão global de Instagram (`/instagram`) continua — admins veem todas as contas
- Settings de Instagram migrado: conta vinculada a projeto no momento do cadastro
- API scoped: endpoints de instagram/conversas filtram por projeto quando context disponível

**Out of Scope:**
- Sistema de guests (EPIC-5)
- Dashboard unificado cross-projeto (comparativo entre clientes)
- Notificações por projeto
- Arquivamento/exclusão de projetos com dados
- Permissões granulares entre admins (todos os admins veem todos os projetos)
- Tags ou categorias de projetos

---

## Reference Documents

- `docs/architecture/fullstack-architecture-loyola-digital-x.md`
- `docs/architecture/database-schema-design.md`
- `docs/stories/EPIC-3-META-INSTAGRAM.md` — Origem das contas de Instagram

---

## Technical Approach

### Database

```sql
-- Nova tabela: projetos (= clientes)
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,           -- nome do projeto/cliente
  client_name VARCHAR(100) NOT NULL,           -- nome oficial do cliente
  description TEXT,
  color       VARCHAR(7),                      -- hex color para identificação visual
  created_by  UUID NOT NULL REFERENCES users(id),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_created_by ON projects(created_by);

-- instagram_accounts: adicionar project_id (obrigatório)
ALTER TABLE instagram_accounts
  ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- conversations: adicionar project_id (nullable — admins podem ter conversas globais)
ALTER TABLE conversations
  ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- delegated_tasks: sem alteração nesta epic (tasks não são exibidas por projeto)
```

### Backend (Fastify)

- Nova tabela `projects` via Drizzle schema + migration
- Novo service/routes: `routes/projects.ts` — CRUD `/api/projects`
- `instagram_accounts` passa a ter `project_id` obrigatório no POST
- GET `/api/instagram/accounts` aceita `?project_id=` para filtrar por projeto
- GET global `/api/instagram/accounts` (sem filtro) continua funcionando para admins
- `conversations` filtráveis por `project_id`

### Frontend (Next.js)

**Novas rotas:**
```
/projects                          → lista de projetos (redirect para /projects/[id])
/projects/[id]                     → overview do projeto
/projects/[id]/instagram           → dashboard Instagram do projeto
/projects/[id]/conversations       → conversas do projeto
```

**Rotas globais (mantidas para admins):**
```
/instagram                         → todos os clientes (seletor de conta global)
/conversations                     → todas as conversas
/tasks                             → todas as tasks (global apenas)
```

**Sidebar redesenhada:**
```
[Global]
  🏠 Dashboard
  💬 Conversas (todas)
  ✅ Tasks (todas)
  📊 Instagram (todas as contas)
  ⚙️  Settings

[Projetos]
  📁 Cliente XYZ      ← colapsável (chevron)
    ├ 📊 Instagram
    └ 💬 Conversas
  📁 Cliente ABC
    └ ...
  + Novo Projeto
```

### Migration Strategy

- `instagram_accounts` existentes: admin cria projetos primeiro, depois reassocia contas na UI de Settings (ou migration batch com projeto "Sem projeto" default)
- `conversations` e `tasks` existentes: `project_id = null` (continuam funcionando como globais)

---

## Story Map

```
Phase 1: Foundation          Phase 2: API Layer          Phase 3: Frontend
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  4.1             │         │  4.2             │         │  4.3             │
│  DB Schema       │────────▶│  Projects API    │────────▶│  Sidebar Redesign│
│  projects table  │         │  CRUD + scoping  │         │  + Project folders│
└─────────────────┘         └─────────────────┘         └─────────────────┘
                                                          ┌─────────────────┐
                                                          │  4.4             │
                                                          │  Project-scoped  │
                                                          │  Instagram dash  │
                                                          └─────────────────┘
                                                          ┌─────────────────┐
                                                          │  4.5             │
                                                          │  Project-scoped  │
                                                          │  Conversations   │
                                                          └─────────────────┘
```

---

## Stories

---

### Story 4.1 — Projects DB Schema + Migration

```yaml
id: "4.1"
title: "Projects DB Schema + Migration"
status: Draft
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [code_review, migration_validation]
priority: P0
estimate: S
depends_on: ["3.1.2"]
epic: "EPIC-4-MULTI-PROJECT-STRUCTURE"
```

**Description:** Criar tabela `projects` no PostgreSQL via Drizzle, adicionar `project_id` FK em `instagram_accounts` (obrigatório) e `conversations` (nullable). Gerar e aplicar migration.

**Acceptance Criteria:**
- [ ] Tabela `projects` criada com todos os campos do schema acima
- [ ] `instagram_accounts.project_id` FK → `projects.id` ON DELETE CASCADE
- [ ] `conversations.project_id` FK → `projects.id` ON DELETE SET NULL (nullable)
- [ ] Índices: `idx_projects_created_by`, `idx_ig_accounts_project`, `idx_conversations_project`
- [ ] Drizzle schema atualizado (`db/schema.ts`)
- [ ] Migration gerada (`pnpm db:generate`) e aplicável (`pnpm db:push`)
- [ ] Contas existentes em `instagram_accounts`: migration não quebra (project_id nullable na migration, torna obrigatório após populado)
- [ ] Testes: schema valida corretamente, FK constraints funcionam

**File List:**
- [ ] `packages/api/src/db/schema.ts` — Adicionar `projects`, alterar tabelas existentes
- [ ] `packages/api/drizzle/` — Migration files gerados

---

### Story 4.2 — Projects API (CRUD + Scoping)

```yaml
id: "4.2"
title: "Projects REST API — CRUD + Resource Scoping"
status: Draft
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [code_review, api_review]
priority: P0
estimate: M
depends_on: ["4.1"]
epic: "EPIC-4-MULTI-PROJECT-STRUCTURE"
```

**Description:** Endpoints REST para CRUD de projetos e adaptação dos endpoints existentes de Instagram para aceitar filtragem por `project_id`.

**Acceptance Criteria:**
- [ ] `POST /api/projects` — Criar projeto (admin only)
- [ ] `GET /api/projects` — Listar projetos do usuário autenticado
- [ ] `GET /api/projects/:id` — Detalhes do projeto
- [ ] `PUT /api/projects/:id` — Atualizar nome, cor, descrição
- [ ] `DELETE /api/projects/:id` — Remover projeto (soft ou cascade com confirmação)
- [ ] `POST /api/instagram/accounts` — Agora requer `project_id` no body
- [ ] `GET /api/instagram/accounts?project_id=` — Filtra por projeto (sem filtro = todas as contas do user)
- [ ] `GET /api/projects/:id/instagram/accounts` — Atalho: contas do projeto
- [ ] `GET /api/projects/:id/conversations` — Conversas do projeto
- [ ] Todos os endpoints protegidos por auth (Clerk)
- [ ] Projetos scoped por `created_by` (admin só gerencia seus próprios projetos — para MVP todos os admins podem ver todos via listagem geral)
- [ ] Testes de integração para cada endpoint

**File List:**
- [ ] `packages/api/src/routes/projects.ts` — Novo: CRUD de projetos
- [ ] `packages/api/src/routes/instagram.ts` — Atualizar: project_id required no POST, filtro no GET
- [ ] `packages/api/src/routes/conversations.ts` — Atualizar: GET por projeto
- [ ] `packages/api/src/routes/tasks.ts` — Atualizar: GET por projeto
- [ ] `packages/api/src/app.ts` — Registrar rotas de projetos
- [ ] `packages/api/src/__tests__/projects.test.ts` — Testes

---

### Story 4.3 — Sidebar Redesign + Project Folders

```yaml
id: "4.3"
title: "Sidebar Redesign — Project Folders (ClickUp-style)"
status: Draft
executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: [ux_review, a11y_check]
priority: P1
estimate: M
depends_on: ["4.2"]
epic: "EPIC-4-MULTI-PROJECT-STRUCTURE"
```

**Description:** Redesenhar a sidebar para incluir seção "Projetos" com folders colapsáveis por cliente, abaixo das seções globais existentes. Cada folder mostra Instagram, Conversas e Tasks do projeto.

**Acceptance Criteria:**
- [ ] Seção "Global" mantida no topo com links existentes (Dashboard, Conversas, Tasks, Instagram, Settings)
- [ ] Seção "Projetos" adicionada abaixo do divisor
- [ ] Cada projeto renderiza como folder colapsável:
  - Chevron toggle (expand/collapse)
  - Cor do projeto como indicador visual (dot ou borda)
  - Nome do projeto
  - Subitens: 📊 Instagram, 💬 Conversas
- [ ] Estado de collapse persistido no localStorage por projeto
- [ ] Botão "+ Novo Projeto" ao final da lista de projetos abre dialog de criação
- [ ] Projeto ativo destacado visualmente
- [ ] Loading skeleton enquanto projetos carregam
- [ ] Sem projetos: empty state inline "Crie seu primeiro projeto"
- [ ] Responsivo: sidebar em mobile vira sheet (comportamento atual mantido)
- [ ] Link de projeto ativo: `/projects/[id]` (overview)
- [ ] Subitens navegam para: `/projects/[id]/instagram`, `/projects/[id]/conversations`

**File List:**
- [ ] `packages/web/components/layout/app-sidebar.tsx` — Redesenho completo
- [ ] `packages/web/components/layout/project-folder.tsx` — **NEW** — Folder colapsável
- [ ] `packages/web/components/layout/create-project-dialog.tsx` — **NEW** — Dialog de criação
- [ ] `packages/web/lib/hooks/use-projects.ts` — **NEW** — TanStack Query hooks para projetos
- [ ] `packages/web/app/(app)/projects/[id]/page.tsx` — **NEW** — Project overview page

---

### Story 4.4 — Project-scoped Instagram Dashboard

```yaml
id: "4.4"
title: "Project-scoped Instagram Dashboard"
status: Draft
executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: [ux_review]
priority: P1
estimate: M
depends_on: ["4.3", "3.3.1"]
epic: "EPIC-4-MULTI-PROJECT-STRUCTURE"
```

**Description:** Dashboard de Instagram acessível dentro do contexto de um projeto em `/projects/[id]/instagram`, mostrando apenas as contas vinculadas a esse projeto. Reutiliza components existentes do EPIC-3.

**Acceptance Criteria:**
- [ ] Rota `/projects/[id]/instagram` criada com dashboard idêntico ao global
- [ ] Account selector exibe apenas contas vinculadas ao projeto (não todas)
- [ ] Se projeto tem 1 conta: auto-seleciona, sem dropdown
- [ ] Breadcrumb: Projetos > [Nome do Cliente] > Instagram
- [ ] Settings de conta Instagram dentro do projeto: botão "Gerenciar contas" leva para `/settings/instagram?project_id=[id]`
- [ ] `useInstagramAccounts` hook aceita `projectId` opcional para filtrar
- [ ] Dashboard global (`/instagram`) mantido — mostra seletor com todas as contas de todos os projetos
- [ ] Botão "Adicionar conta" dentro do projeto pré-seleciona o projeto no dialog

**File List:**
- [ ] `packages/web/app/(app)/projects/[id]/instagram/page.tsx` — **NEW**
- [ ] `packages/web/lib/hooks/use-instagram-accounts.ts` — Atualizar: aceitar projectId
- [ ] `packages/web/components/instagram/add-account-dialog.tsx` — Atualizar: aceitar projectId default

---

### Story 4.5 — Project-scoped Conversations

```yaml
id: "4.5"
title: "Project-scoped Conversations"
status: Draft
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [code_review]
priority: P1
estimate: M
depends_on: ["4.3"]
epic: "EPIC-4-MULTI-PROJECT-STRUCTURE"
```

**Description:** Página de Conversas dentro do contexto de um projeto, mostrando apenas as conversas vinculadas a ele. Conversas iniciadas dentro de um projeto são automaticamente associadas ao projeto.

**Acceptance Criteria:**
- [ ] Rota `/projects/[id]/conversations` — lista conversas do projeto
- [ ] Ao iniciar nova conversa dentro de `/projects/[id]/conversations`: `conversation.project_id` = ID do projeto
- [ ] Conversa criada no contexto do projeto aparece no sidebar do projeto, não na lista global
- [ ] Página global `/conversations` continua mostrando todas as conversas (sem filtro de projeto)
- [ ] Breadcrumb correto: Projetos > [Nome do Cliente] > Conversas
- [ ] Loading states e empty states por projeto

**File List:**
- [ ] `packages/web/app/(app)/projects/[id]/conversations/page.tsx` — **NEW**
- [ ] `packages/web/lib/hooks/use-conversations.ts` — Atualizar: aceitar projectId
- [ ] `packages/api/src/routes/conversations.ts` — Atualizar: passar project_id na criação
- [ ] `packages/api/src/routes/chat.ts` — Atualizar: inferir project_id do contexto

---

## Dependency Graph

```
EPIC-3 (done)
    │
    └── 3.1.2 (DB Schema existente)
            │
            └── 4.1 (Projects DB Schema)
                    │
                    └── 4.2 (Projects API)
                            │
                            └── 4.3 (Sidebar Redesign)
                                    │
                                    ├── 4.4 (Instagram por projeto)
                                    │
                                    └── 4.5 (Conversas + Tasks por projeto)
```

## Execution Waves

| Wave | Stories | Paralelo? |
|------|---------|-----------|
| Wave 1 | 4.1 | NO — fundação do schema |
| Wave 2 | 4.2 | NO — depende de 4.1 |
| Wave 3 | 4.3 | NO — depende de 4.2 |
| Wave 4 | 4.4, 4.5 | YES — independentes entre si |

**Total: 5 stories em 4 waves**

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Contas Instagram existentes sem project_id | Migration quebra dados existentes | project_id nullable na migration inicial; UI de Settings pede associação na primeira abertura |
| Conversas globais de admins ficam "sem projeto" | Confusão na UI | Conversas com project_id = null continuam visíveis em `/conversations` global |
| Sidebar com muitos projetos fica pesada | UX degradada | Virtualização da lista se > 20 projetos (fase 2); collapse por default |
| Rotas duplicadas (global vs projeto) | Manutenção complexa | Componentes compartilhados; apenas o contexto de dados muda |

## Definition of Done

- [ ] Todas as 5 stories implementadas e testadas
- [ ] Admin consegue criar projeto, vincular conta Instagram, e navegar pelo projeto
- [ ] Sidebar exibe folders colapsáveis por projeto
- [ ] Dashboard de Instagram e conversas funcionam dentro do contexto do projeto
- [ ] Rotas globais existentes não quebram
- [ ] Migration aplicada sem perda de dados
- [ ] Lint + typecheck + build sem erros
