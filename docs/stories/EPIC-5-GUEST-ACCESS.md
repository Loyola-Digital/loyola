# EPIC-5: Guest Access System — Client Portal

> Permitir que clientes (convidados) acessem o dashboard do seu projeto com permissões restritas: visualizar métricas de Instagram e conversar com uma Mind dedicada, sem acesso ao ClickUp ou a outros projetos.

**Status:** Draft
**Created:** 2026-03-17
**Author:** Morgan (PM Agent)
**Product:** Loyola Digital X
**Parent:** EPIC-1
**Depends on:** EPIC-4 (Multi-Project Structure)

---

## Epic Goal

Criar um sistema de acesso para convidados (clientes da Loyola) que permite ao cliente final acessar seu próprio projeto — visualizando métricas de Instagram e conversando com uma Mind — sem precisar ser um funcionário da Loyola ou ter acesso ao workspace completo.

## Business Value

- Loyola pode entregar o dashboard diretamente ao cliente sem criar contas de funcionário
- Cliente tem acesso ao próprio dado em tempo real sem depender de relatórios manuais
- Mind do cliente não tem acesso ao ClickUp — protege dados operacionais internos da Loyola
- Conversas do guest ficam salvas e visíveis apenas por admins — auditabilidade total
- Diferencial competitivo: cliente engajado com a plataforma, não apenas receptor de relatórios

## Epic Scope

**In Scope (MVP):**
- Novo tipo de usuário: `guest` (role no banco)
- Sistema de convite: admin envia invite por e-mail com link tokenizado para um projeto específico
- Guest auth via Clerk (email/magic link ou senha) — usa o mesmo Clerk do projeto
- Guest acessa apenas o projeto ao qual foi convidado
- Guest pode: ver dashboard Instagram do projeto, abrir chat com Mind
- Mind do guest: sem tools de ClickUp (`clickup_*`), sem `get_past_conversations` de outros usuários
- Conversas do guest ficam salvas com `project_id` e `user_id` do guest
- Admin vê conversas dos guests no painel do projeto
- Guest UI: sidebar simplificada (só o projeto dele)
- Revogação de acesso: admin pode remover guest do projeto

**Out of Scope:**
- Guest criando ou editando dados (read-only para Instagram, write apenas para chat)
- Multiple projetos por guest (fase 2)
- Guest convidando outros guests
- SSO / OAuth do cliente
- White-label / domínio customizado do cliente
- Notificações para guest (email/push)
- Guest vendo Tasks

---

## Reference Documents

- `docs/stories/EPIC-4-MULTI-PROJECT-STRUCTURE.md` — Estrutura de projetos (pré-requisito)
- `docs/architecture/fullstack-architecture-loyola-digital-x.md`
- Clerk Docs: Invitations API, User Roles

---

## Technical Approach

### User Roles

O schema atual já tem `user_role` enum com `["copywriter", "strategist", "manager", "admin"]`. Adicionar `"guest"` ao enum.

```sql
-- Adicionar 'guest' ao enum existente
ALTER TYPE user_role ADD VALUE 'guest';

-- Nova tabela: convites de projeto
CREATE TABLE project_invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  invited_by   UUID NOT NULL REFERENCES users(id),
  email        TEXT NOT NULL,
  token        TEXT NOT NULL UNIQUE,         -- token seguro para o link de convite
  accepted_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL,         -- 7 dias por default
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Relação guest <-> projeto (após aceitar convite)
CREATE TABLE project_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'guest', -- 'guest' | 'admin' (futuro)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE INDEX idx_project_invitations_token ON project_invitations(token);
```

### Auth & Access Control

- Clerk gerencia autenticação de guests (mesmo tenant)
- No middleware de auth: detectar `user.role === 'guest'`
- Guest middleware: valida que o recurso acessado pertence a um projeto onde o guest é membro
- Admin middleware: continua igual (acesso total)

**Regras de acesso por endpoint:**

| Endpoint | Admin | Guest |
|----------|-------|-------|
| `GET /api/projects` | Todos | Apenas projetos onde é membro |
| `GET /api/projects/:id/instagram/*` | ✅ | ✅ (se membro) |
| `POST /api/chat` | ✅ | ✅ (sem tools ClickUp) |
| `GET /api/projects/:id/conversations` | ✅ | ✅ (apenas as próprias) |
| `GET /api/instagram/accounts` (global) | ✅ | ❌ 403 |
| `GET /api/projects` (outros projetos) | ✅ | ❌ 403 |
| `POST /api/projects` | ✅ | ❌ 403 |
| `DELETE /api/projects/:id` | ✅ | ❌ 403 |

### Mind para Guests

No `chat-tools.ts`, a função `getChatTools` passa a receber o `userRole`:
- Se `role === 'guest'`: retorna apenas `instagram_metrics` (do projeto) + nenhum ClickUp tool
- `get_past_conversations` filtrado: guest só vê as suas próprias conversas, não de outros usuários

### Frontend Guest

Guest vê uma sidebar simplificada:
```
[Projeto: Cliente XYZ]
  📊 Instagram
  💬 Conversar com Mind
```

Sem Settings, sem Tasks, sem navegação global, sem outros projetos.

---

## Story Map

```
Phase 1: Foundation          Phase 2: Invite Flow        Phase 3: Guest UI
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  5.1             │         │  5.2             │         │  5.4             │
│  DB Schema       │────────▶│  Invite API +    │────────▶│  Guest Sidebar   │
│  guest role +    │         │  Accept Flow     │         │  + Restricted UI │
│  project_members │         └─────────────────┘         └─────────────────┘
└─────────────────┘         ┌─────────────────┐
                             │  5.3             │
                             │  Guest Auth      │
                             │  Middleware +    │
                             │  Mind Restriction│
                             └─────────────────┘
```

---

## Stories

---

### Story 5.1 — Guest DB Schema + Role

```yaml
id: "5.1"
title: "Guest DB Schema — project_invitations + project_members + guest role"
status: Draft
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [code_review, security_review, migration_validation]
priority: P0
estimate: S
depends_on: ["4.1"]
epic: "EPIC-5-GUEST-ACCESS"
```

**Description:** Adicionar `guest` ao enum `user_role`, criar tabelas `project_invitations` e `project_members`, gerar e aplicar migration.

**Acceptance Criteria:**
- [ ] `user_role` enum inclui `"guest"` (migration segura, sem afetar valores existentes)
- [ ] Tabela `project_invitations` criada com todos os campos do schema acima
- [ ] Tabela `project_members` criada com constraint UNIQUE(project_id, user_id)
- [ ] Índices criados: `idx_project_members_project`, `idx_project_members_user`, `idx_project_invitations_token`
- [ ] Drizzle schema atualizado (`db/schema.ts`)
- [ ] Migration gerada e aplicável sem perda de dados
- [ ] Testes: FK constraints, unique constraints, enum funciona

**File List:**
- [ ] `packages/api/src/db/schema.ts` — Adicionar enum guest, tabelas project_invitations e project_members
- [ ] `packages/api/drizzle/` — Migration files

---

### Story 5.2 — Invite API + Accept Flow

```yaml
id: "5.2"
title: "Project Invitation API — Send, Accept, Revoke"
status: Draft
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [code_review, security_review]
priority: P0
estimate: M
depends_on: ["5.1", "4.2"]
epic: "EPIC-5-GUEST-ACCESS"
```

**Description:** Endpoints para admins convidarem guests por email, e fluxo de aceite via link tokenizado. Após aceitar, usuário é criado/vinculado no Clerk com role `guest` e inserido em `project_members`.

**Acceptance Criteria:**
- [ ] `POST /api/projects/:id/invitations` — Admin cria convite (email + projeto)
  - Gera token seguro (crypto.randomBytes 32)
  - Salva em `project_invitations` com `expires_at = now + 7 dias`
  - Retorna URL de convite: `{FRONTEND_URL}/invite/[token]`
  - (MVP: URL logada no servidor; integração de e-mail é fase 2)
- [ ] `GET /api/invitations/[token]` — Verifica token (válido/expirado/já aceito)
  - Retorna: projeto name, quem convidou, email do convidado
- [ ] `POST /api/invitations/[token]/accept` — Aceita convite
  - Cria ou busca usuário no Clerk pelo email
  - Define `publicMetadata.role = 'guest'` no Clerk
  - Cria user em `users` com `role = 'guest'`
  - Insere em `project_members`
  - Marca invitation como `accepted_at = now()`
- [ ] `DELETE /api/projects/:id/members/:userId` — Admin remove guest do projeto
  - Remove de `project_members`
  - (Não exclui o usuário Clerk — pode ser convidado para outro projeto futuramente)
- [ ] `GET /api/projects/:id/members` — Lista membros do projeto (admins + guests)
- [ ] Token inválido ou expirado retorna 404 com mensagem clara
- [ ] Testes de integração para cada endpoint

**File List:**
- [ ] `packages/api/src/routes/invitations.ts` — **NEW** — Endpoints de convite
- [ ] `packages/api/src/routes/projects.ts` — Atualizar: adicionar members endpoints
- [ ] `packages/api/src/app.ts` — Registrar rotas de invitations
- [ ] `packages/api/src/__tests__/invitations.test.ts` — Testes

---

### Story 5.3 — Guest Auth Middleware + Mind Restriction

```yaml
id: "5.3"
title: "Guest Auth Middleware + Mind Tool Restriction"
status: Draft
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [code_review, security_review]
priority: P0
estimate: M
depends_on: ["5.2"]
epic: "EPIC-5-GUEST-ACCESS"
```

**Description:** Middleware que detecta usuários `guest` e restringe acesso apenas ao projeto onde são membros. Mind do guest não recebe tools de ClickUp.

**Acceptance Criteria:**
- [ ] Middleware `guestGuard` detecta `user.role === 'guest'` via Clerk metadata
- [ ] Para rotas `/api/projects/:id/*`: valida que guest é membro de `:id` via `project_members`
- [ ] Rotas bloqueadas para guest retornam `403 Forbidden` com mensagem clara
- [ ] Lista de rotas bloqueadas para guest (qualquer rota não listada como permitida):
  - `GET /api/projects` → apenas projetos onde é membro
  - `POST/PUT/DELETE /api/projects/*` → 403
  - `GET /api/instagram/accounts` (global) → 403
  - `GET /api/conversations` (global) → 403
  - `GET /api/tasks` (global) → 403
- [ ] `getChatTools(fastify, userRole)` — aceita `userRole` como parâmetro
  - Se `role === 'guest'`: retorna apenas `instagram_metrics` (sem `clickup_*`)
  - `get_past_conversations` para guest: filtra apenas conversas do próprio guest
- [ ] Chat route passa `userRole` para `getChatTools`
- [ ] Testes: guest não consegue acessar rotas restritas, mind do guest não tem ClickUp tools

**File List:**
- [ ] `packages/api/src/middleware/guest-guard.ts` — **NEW** — Middleware de acesso guest
- [ ] `packages/api/src/services/chat-tools.ts` — Atualizar: aceitar userRole, filtrar tools
- [ ] `packages/api/src/routes/chat.ts` — Atualizar: passar userRole para getChatTools
- [ ] `packages/api/src/middleware/auth.ts` — Atualizar: expor user.role no request
- [ ] `packages/api/src/__tests__/guest-guard.test.ts` — Testes

---

### Story 5.4 — Guest Frontend (Sidebar + UI Restrita)

```yaml
id: "5.4"
title: "Guest Frontend — Sidebar Simplificada + Fluxo de Convite"
status: Draft
executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: [ux_review, a11y_check]
priority: P1
estimate: M
depends_on: ["5.3", "4.3"]
epic: "EPIC-5-GUEST-ACCESS"
```

**Description:** UI para o fluxo de aceite de convite e experiência do guest após login: sidebar simplificada mostrando apenas o projeto dele com Instagram e Chat.

**Acceptance Criteria:**
- [ ] Página `/invite/[token]`:
  - Mostra: nome do projeto, quem convidou, email do convite
  - Botão "Aceitar convite e criar conta" → fluxo Clerk SignUp/SignIn
  - Token expirado: mensagem "Este convite expirou. Peça um novo ao seu gestor."
  - Token já aceito: redirect para login
- [ ] Após aceite: redirect para `/projects/[id]` (overview do projeto)
- [ ] Guest vê sidebar simplificada:
  - Header: nome do projeto (sem logo da Loyola)
  - Link: 📊 Instagram
  - Link: 💬 Conversar com Mind
  - Sem Settings, sem Tasks, sem outros projetos, sem navegação global
- [ ] Sidebar de admin e sidebar de guest são componentes distintos (ou conditional rendering por role)
- [ ] Guest tentando acessar rota não permitida: redirect para `/projects/[id]` com toast "Acesso restrito"
- [ ] Layout do guest não exibe header com botões de admin (ex: "+ Novo Projeto")
- [ ] `/projects/[id]/instagram` para guest: funciona igual ao admin (sem account selector se houver uma conta só)
- [ ] `/projects/[id]/conversations` para guest: vê apenas suas conversas, abre nova conversa normalmente
- [ ] Responsivo: sidebar vira sheet no mobile (igual ao admin)

**File List:**
- [ ] `packages/web/app/invite/[token]/page.tsx` — **NEW** — Página de aceite de convite
- [ ] `packages/web/components/layout/guest-sidebar.tsx` — **NEW** — Sidebar simplificada para guest
- [ ] `packages/web/components/layout/app-sidebar.tsx` — Atualizar: renderizar GuestSidebar se role === 'guest'
- [ ] `packages/web/lib/hooks/use-user-role.ts` — **NEW** — Hook para verificar role do usuário
- [ ] `packages/web/middleware.ts` — Atualizar: redirect guest para projeto se tentar acessar rota global

---

## Dependency Graph

```
EPIC-4 (pré-requisito completo)
    │
    └── 4.1 (DB Schema com projects)
            │
            └── 5.1 (Guest DB Schema)
                    │
                    └── 5.2 (Invite API)
                            │
                            └── 5.3 (Guest Middleware + Mind)
                                    │
                                    └── 5.4 (Guest Frontend)
```

## Execution Waves

| Wave | Stories | Paralelo? |
|------|---------|-----------|
| Wave 1 | 5.1 | NO — fundação do schema |
| Wave 2 | 5.2 | NO — depende de 5.1 |
| Wave 3 | 5.3 | NO — depende de 5.2 |
| Wave 4 | 5.4 | NO — depende de 5.3 |

**Total: 4 stories em 4 waves**

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Guest acessa dados de outro projeto via manipulação de URL | Vazamento de dados | `guestGuard` middleware valida `project_members` em toda request |
| Token de convite reutilizável | Guest compartilha link com terceiros | Token de uso único — marcado como `accepted_at` após uso |
| Mind do guest responde com dados de ClickUp via prompt injection | Vazamento de tasks internas | Tools de ClickUp removidas do contexto do guest, não apenas ocultas |
| Guest fica sem acesso após admin remover da `project_members` | UX confusa | Próxima request retorna 403, frontend redireciona para página "Acesso removido" |
| Email de convite não enviado (fase 1 = só URL logada) | Onboarding manual | Admin copia URL do response da API e envia manualmente; e-mail real é fase 2 |

## Definition of Done

- [ ] Todas as 4 stories implementadas e testadas
- [ ] Admin consegue convidar um guest com link de convite
- [ ] Guest aceita convite, faz login e vê apenas seu projeto
- [ ] Mind do guest não possui tools de ClickUp
- [ ] Conversas do guest ficam salvas e visíveis por admins no projeto
- [ ] Guest não consegue acessar nenhuma rota de outro projeto ou global
- [ ] Lint + typecheck + build sem erros
- [ ] Testes de segurança: rotas restritas retornam 403 para guests
