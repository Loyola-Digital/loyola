# EPIC-3: Meta Instagram Integration — Dashboard & Analytics

> Integrar a API da Meta (Instagram Graph API) para monitorar contas de Instagram de clientes, com dashboard de métricas completo e acesso contextual pelas minds.

**Status:** Draft
**Created:** 2026-03-16
**Author:** Morgan (PM Agent)
**Product:** Loyola Digital X
**Parent:** EPIC-1

---

## Epic Goal

Permitir que funcionários da Loyola Digital cadastrem múltiplas contas de Instagram (clientes) via access tokens manuais do Business Manager, visualizem métricas completas em um dashboard analítico, e consultem esses dados via minds nas conversas.

## Business Value

- Centraliza dados de Instagram de todos os clientes em um único lugar
- Elimina necessidade de acessar Meta Business Suite por cliente
- Minds podem responder "como está a performance do @cliente" com dados reais
- Histórico de métricas para análise de tendências
- Escala: cadastrar dezenas de contas sem fricção

## Epic Scope

**In Scope (MVP):**
- Página de Settings com aba Meta / Instagram
- CRUD de contas Instagram (nome, Instagram Business ID, access token manual)
- Tokens armazenados encriptados no banco (AES-256)
- Validação de token ao cadastrar (chamada à Graph API)
- Dashboard `/instagram` com métricas por conta:
  - Perfil: followers, following, media count, bio
  - Posts: likes, comments, reach, impressions, saves, shares
  - Stories: impressions, reach, replies, exits
  - Reels: plays, likes, comments, reach, saves, shares
  - Audience demographics: idade, gênero, localização, horários ativos
- Seletor de período (7d, 14d, 30d, 90d, custom range)
- Seletor de conta (dropdown com todas as contas cadastradas)
- Integração com minds: dados do Instagram injetados como contexto via tool
- Refresh manual de dados por conta

**Out of Scope (Fase 2+):**
- OAuth flow com Meta SDK (login com Facebook)
- Renovação automática de tokens (long-lived token dura 60 dias, user renova manual)
- Agendamento de posts via API
- Comparativo entre contas (benchmarking)
- Export de relatórios (PDF/CSV)
- Alertas de queda de engagement
- Instagram Ads / Meta Ads integration
- Webhooks de real-time updates

## Reference Documents

- `docs/architecture/fullstack-architecture-loyola-digital-x.md` — Arquitetura geral
- `docs/architecture/database-schema-design.md` — Schema PostgreSQL atual
- Meta Graph API Docs: Instagram Graph API v21.0
- Meta Business Manager: developers.facebook.com

## Technical Approach

### Meta Graph API

**Autenticação:**
- User gera Long-Lived Access Token no Business Manager (validade: 60 dias)
- Token inserido manualmente na UI de Settings
- Backend valida token com `GET /me?access_token={token}` antes de salvar
- Token encriptado com AES-256-GCM antes de persistir no banco

**Endpoints utilizados (Graph API v21.0):**
- `GET /{ig-user-id}?fields=id,name,username,biography,followers_count,follows_count,media_count,profile_picture_url` — Perfil
- `GET /{ig-user-id}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count` — Posts
- `GET /{ig-user-id}/insights?metric=impressions,reach,follower_count,profile_views&period=day` — Account insights
- `GET /{media-id}/insights?metric=impressions,reach,likes,comments,saves,shares,plays` — Media insights
- `GET /{ig-user-id}/insights?metric=audience_city,audience_country,audience_gender_age,audience_locale&period=lifetime` — Demographics

**Rate Limits:**
- 200 calls/user/hour (Graph API standard)
- Backend implementa rate limiting e caching (5min TTL para métricas, 1h para demographics)

### Backend (Fastify)

- Nova tabela: `instagram_accounts` (credentials encriptadas)
- Nova tabela: `instagram_metrics_cache` (cache de métricas com TTL)
- Novo service: `services/instagram.ts` (Graph API client + caching)
- Novo service: `services/encryption.ts` (AES-256-GCM para tokens)
- Novas routes: `routes/instagram.ts` (CRUD contas + fetch métricas)
- Novo route: `routes/settings.ts` (settings gerais)
- Novo tool no chat: `instagram_metrics` (mind consulta dados do cliente)

### Frontend (Next.js)

- Nova rota: `/settings` com layout de tabs
- Nova rota: `/settings/instagram` (CRUD de contas)
- Nova rota: `/instagram` (dashboard de métricas)
- Componentes: account cards, metrics charts, period selector, account selector
- Charts: recharts (lightweight, React-native)

### Database

```sql
-- Nova tabela: contas de Instagram cadastradas
CREATE TABLE instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  account_name VARCHAR(100) NOT NULL,          -- nome amigável (ex: "Cliente XYZ")
  instagram_user_id VARCHAR(50) NOT NULL,       -- IG Business Account ID
  instagram_username VARCHAR(50),               -- @username
  access_token_encrypted TEXT NOT NULL,          -- AES-256-GCM encrypted
  access_token_iv TEXT NOT NULL,                 -- IV para decriptação
  token_expires_at TIMESTAMPTZ,                  -- expiração do token (~60 dias)
  profile_picture_url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(instagram_user_id)
);

-- Cache de métricas para evitar rate limiting
CREATE TABLE instagram_metrics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL,             -- 'profile', 'post_insights', 'account_insights', 'demographics'
  metric_data JSONB NOT NULL,                    -- dados da API
  period_start DATE,                             -- início do período (null para lifetime)
  period_end DATE,                               -- fim do período
  fetched_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,               -- TTL do cache
  UNIQUE(account_id, metric_type, period_start, period_end)
);

CREATE INDEX idx_ig_accounts_user ON instagram_accounts(user_id);
CREATE INDEX idx_ig_metrics_account ON instagram_metrics_cache(account_id);
CREATE INDEX idx_ig_metrics_expires ON instagram_metrics_cache(expires_at);
```

## Tech Stack Additions

| Technology | Purpose | Why |
|-----------|---------|-----|
| recharts | Gráficos do dashboard | Leve, React-native, sem deps pesadas |
| node:crypto | Encriptação AES-256-GCM | Built-in Node.js, sem dep extra |
| date-fns | Manipulação de períodos | Já usado no projeto (verificar) ou luxon |

## Story Map

```
Phase 1: Foundation          Phase 2: Data Layer         Phase 3: Dashboard         Phase 4: Mind Integration
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐        ┌─────────────────┐
│  3.1.1           │         │  3.2.1           │         │  3.3.1           │        │  3.4.1           │
│  Settings Page   │────────▶│  Instagram API   │────────▶│  Dashboard Page  │        │  Mind Instagram  │
│  + Navigation    │         │  Service + Cache  │         │  + Charts        │        │  Tool            │
└─────────────────┘         └─────────────────┘         └─────────────────┘        └─────────────────┘
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  3.1.2           │         │  3.2.2           │         │  3.3.2           │
│  DB Schema +     │────────▶│  Instagram       │────────▶│  Account Mgmt   │
│  Encryption Svc  │         │  Routes (CRUD)   │         │  Settings UI     │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

## Stories

---

### Story 3.1.1 — Settings Page Foundation + Navigation

```yaml
id: "3.1.1"
title: "Settings Page Foundation + Navigation"
status: Draft
executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: [ux_review]
priority: P1
estimate: S
depends_on: ["1.3.1"]
epic: "EPIC-3-META-INSTAGRAM"
```

**Description:** Criar a estrutura base da página de Settings com layout de tabs e navegação na sidebar.

**Acceptance Criteria:**
- [ ] Nova rota `/settings` com layout de tabs (sidebar vertical ou horizontal tabs)
- [ ] Tab "Geral" como placeholder (futuras configurações)
- [ ] Tab "Meta / Instagram" (placeholder, será preenchida em 3.3.2)
- [ ] Link "Settings" adicionado na sidebar com ícone Settings (Lucide)
- [ ] Breadcrumb: Settings > [Tab Name]
- [ ] Responsivo: tabs viram accordion/dropdown no mobile
- [ ] Protegida por auth (Clerk middleware)

**File List:**
- [ ] `packages/web/app/(app)/settings/layout.tsx` — Settings layout com tabs
- [ ] `packages/web/app/(app)/settings/page.tsx` — Redirect para primeira tab
- [ ] `packages/web/app/(app)/settings/general/page.tsx` — Tab geral placeholder
- [ ] `packages/web/app/(app)/settings/instagram/page.tsx` — Tab Instagram placeholder
- [ ] `packages/web/components/layout/app-sidebar.tsx` — Adicionar link Settings

---

### Story 3.1.2 — Database Schema + Encryption Service

```yaml
id: "3.1.2"
title: "Instagram DB Schema + Token Encryption Service"
status: Draft
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [code_review, security_review]
priority: P0
estimate: M
depends_on: ["1.1.1"]
epic: "EPIC-3-META-INSTAGRAM"
```

**Description:** Criar as tabelas `instagram_accounts` e `instagram_metrics_cache` no PostgreSQL via Drizzle migration, e o serviço de encriptação AES-256-GCM para proteger access tokens.

**Acceptance Criteria:**
- [ ] Tabela `instagram_accounts` criada com todos os campos do schema
- [ ] Tabela `instagram_metrics_cache` criada com TTL e unique constraint
- [ ] Índices criados para queries de performance
- [ ] Service `encryption.ts` com `encrypt(plaintext)` e `decrypt(ciphertext, iv)`
- [ ] Usa `ENCRYPTION_KEY` do `.env` (32 bytes hex)
- [ ] AES-256-GCM com IV aleatório por encriptação
- [ ] Drizzle migration gerada e aplicável
- [ ] Testes unitários para encryption service (encrypt → decrypt round-trip)
- [ ] Testes unitários para schema validation

**File List:**
- [ ] `packages/api/src/db/schema.ts` — Adicionar tabelas instagram_accounts e instagram_metrics_cache
- [ ] `packages/api/src/services/encryption.ts` — AES-256-GCM service
- [ ] `packages/api/src/__tests__/encryption.test.ts` — Testes de encriptação
- [ ] `packages/api/drizzle/` — Migration files

---

### Story 3.2.1 — Instagram Graph API Service + Cache

```yaml
id: "3.2.1"
title: "Instagram Graph API Service + Metrics Cache"
status: Draft
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [code_review, security_review]
priority: P0
estimate: L
depends_on: ["3.1.2"]
epic: "EPIC-3-META-INSTAGRAM"
```

**Description:** Service que encapsula chamadas à Meta Graph API v21.0, com caching inteligente no banco para respeitar rate limits.

**Acceptance Criteria:**
- [ ] Service `instagram.ts` com métodos:
  - `validateToken(accessToken)` — valida token com GET /me
  - `getProfile(accountId)` — dados do perfil (followers, bio, etc.)
  - `getMediaList(accountId, limit, after)` — lista de posts com paginação cursor
  - `getMediaInsights(mediaId)` — métricas de post individual
  - `getAccountInsights(accountId, period, since, until)` — métricas da conta
  - `getAudienceDemographics(accountId)` — dados de audiência (lifetime)
  - `getStories(accountId)` — stories ativos com métricas
  - `getReels(accountId)` — reels com métricas
- [ ] Cache layer: verifica `instagram_metrics_cache` antes de chamar API
  - Profile: TTL 5 min
  - Post insights: TTL 15 min
  - Account insights: TTL 30 min
  - Demographics: TTL 1 hora
- [ ] Rate limit tracking: max 200 calls/hour por token
- [ ] Error handling: token expirado (revoked), rate limited, API errors
- [ ] Decripta token do banco antes de usar (via encryption service)
- [ ] Testes unitários com mocks da Graph API

**File List:**
- [ ] `packages/api/src/services/instagram.ts` — Graph API client + cache
- [ ] `packages/api/src/__tests__/instagram.test.ts` — Testes com mocks
- [ ] `packages/api/src/config/env.ts` — Adicionar ENCRYPTION_KEY

---

### Story 3.2.2 — Instagram REST Routes (CRUD + Metrics)

```yaml
id: "3.2.2"
title: "Instagram REST Routes — Account CRUD + Metrics Endpoints"
status: Draft
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [code_review, api_review]
priority: P1
estimate: M
depends_on: ["3.2.1"]
epic: "EPIC-3-META-INSTAGRAM"
```

**Description:** Endpoints REST para gerenciar contas Instagram e consultar métricas.

**Acceptance Criteria:**
- [ ] `POST /api/instagram/accounts` — Cadastrar conta (valida token, encripta, salva)
- [ ] `GET /api/instagram/accounts` — Listar contas do usuário (sem expor token)
- [ ] `GET /api/instagram/accounts/:id` — Detalhes da conta
- [ ] `PUT /api/instagram/accounts/:id` — Atualizar (nome, token)
- [ ] `DELETE /api/instagram/accounts/:id` — Remover conta (cascade métricas)
- [ ] `GET /api/instagram/accounts/:id/profile` — Perfil atualizado
- [ ] `GET /api/instagram/accounts/:id/insights?period=30d&since=&until=` — Métricas da conta
- [ ] `GET /api/instagram/accounts/:id/media?limit=25&after=` — Posts com métricas
- [ ] `GET /api/instagram/accounts/:id/demographics` — Audiência
- [ ] `GET /api/instagram/accounts/:id/stories` — Stories ativos
- [ ] `GET /api/instagram/accounts/:id/reels` — Reels com métricas
- [ ] `POST /api/instagram/accounts/:id/refresh` — Força refresh do cache
- [ ] Todos os endpoints protegidos por auth (Clerk)
- [ ] Scoped por `user_id` (usuário só vê suas contas)
- [ ] Validação de input com JSON Schema (Fastify)
- [ ] Testes de integração para cada endpoint

**File List:**
- [ ] `packages/api/src/routes/instagram.ts` — Todas as routes
- [ ] `packages/api/src/__tests__/instagram-routes.test.ts` — Testes
- [ ] `packages/api/src/app.ts` — Registrar plugin de routes

---

### Story 3.3.1 — Instagram Dashboard Page + Charts

```yaml
id: "3.3.1"
title: "Instagram Dashboard Page with Analytics Charts"
status: Draft
executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: [ux_review, a11y_check]
priority: P1
estimate: L
depends_on: ["3.2.2", "3.1.1"]
epic: "EPIC-3-META-INSTAGRAM"
```

**Description:** Dashboard completo em `/instagram` com métricas visuais, gráficos, seletor de conta e período.

**Acceptance Criteria:**
- [ ] Nova rota `/instagram` acessível pela sidebar (ícone Instagram)
- [ ] Account selector (dropdown) no topo — lista todas as contas cadastradas
- [ ] Period selector: 7d, 14d, 30d, 90d, custom range (date picker)
- [ ] Seção **Overview**: cards com KPIs principais
  - Followers (com variação %), Following, Posts, Engagement Rate
- [ ] Seção **Reach & Impressions**: line chart (rechart) com reach e impressions ao longo do tempo
- [ ] Seção **Posts Performance**: grid/table dos últimos posts com thumbnail, caption truncada, likes, comments, reach, engagement
  - Ordenável por qualquer métrica
- [ ] Seção **Stories**: cards dos stories ativos com impressions, reach, replies
- [ ] Seção **Reels**: cards dos reels recentes com plays, likes, shares
- [ ] Seção **Audience**:
  - Bar chart de distribuição por idade/gênero
  - Top cidades e países (bar charts horizontais)
- [ ] Loading skeletons para cada seção
- [ ] Empty state quando nenhuma conta cadastrada (link para Settings)
- [ ] Responsivo: cards empilham no mobile, charts scrollam horizontal
- [ ] Refresh button por seção e global
- [ ] Usa TanStack Query com staleTime adequado por tipo de dado
- [ ] recharts adicionado como dependência

**File List:**
- [ ] `packages/web/app/(app)/instagram/page.tsx` — Dashboard page
- [ ] `packages/web/app/(app)/instagram/layout.tsx` — Layout com selectors
- [ ] `packages/web/components/instagram/account-selector.tsx` — Dropdown de contas
- [ ] `packages/web/components/instagram/period-selector.tsx` — Seletor de período
- [ ] `packages/web/components/instagram/overview-cards.tsx` — KPI cards
- [ ] `packages/web/components/instagram/reach-chart.tsx` — Line chart reach/impressions
- [ ] `packages/web/components/instagram/posts-table.tsx` — Tabela de posts
- [ ] `packages/web/components/instagram/stories-section.tsx` — Stories cards
- [ ] `packages/web/components/instagram/reels-section.tsx` — Reels cards
- [ ] `packages/web/components/instagram/audience-charts.tsx` — Demographics charts
- [ ] `packages/web/lib/hooks/use-instagram.ts` — TanStack Query hooks
- [ ] `packages/web/lib/api/instagram.ts` — API client functions
- [ ] `packages/web/components/layout/app-sidebar.tsx` — Adicionar link Instagram

---

### Story 3.3.2 — Instagram Account Management Settings UI

```yaml
id: "3.3.2"
title: "Instagram Account Management — Settings UI"
status: Draft
executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: [ux_review, a11y_check]
priority: P1
estimate: M
depends_on: ["3.2.2", "3.1.1"]
epic: "EPIC-3-META-INSTAGRAM"
```

**Description:** Interface na aba Settings > Instagram para cadastrar, editar e remover contas Instagram com seus access tokens.

**Acceptance Criteria:**
- [ ] Tab "Meta / Instagram" em `/settings/instagram` funcional
- [ ] Lista de contas cadastradas em cards:
  - Avatar do perfil, @username, nome amigável, status do token (válido/expirado)
  - Badges: última sincronização, data de expiração do token
  - Ações: Editar, Remover (com confirmação), Refresh token
- [ ] Botão "Adicionar Conta" abre dialog/modal com form:
  - Campo: Nome da conta (texto livre, ex: "Cliente XYZ")
  - Campo: Instagram Business Account ID (com helper text explicando onde encontrar)
  - Campo: Access Token (textarea, masked por default, toggle para mostrar)
  - Validação em tempo real: ao colar token, chama API para validar
  - Feedback: spinner enquanto valida → checkmark verde ou erro vermelho
  - Ao salvar: mostra dados do perfil encontrado (@username, followers) como confirmação
- [ ] Edição: dialog pré-preenchido (token mascarado, só substitui se digitar novo)
- [ ] Remoção: modal de confirmação com nome da conta
- [ ] Guia/instrução colapsável: "Como obter seu Access Token no Business Manager"
  - Passo a passo com screenshots placeholder ou texto descritivo
- [ ] Toast notifications: sucesso ao adicionar/editar/remover
- [ ] Empty state atrativo quando sem contas
- [ ] Indicador visual de token próximo de expirar (< 7 dias)
- [ ] Responsivo: cards em stack no mobile

**File List:**
- [ ] `packages/web/app/(app)/settings/instagram/page.tsx` — Página principal
- [ ] `packages/web/components/instagram/account-card.tsx` — Card de conta
- [ ] `packages/web/components/instagram/add-account-dialog.tsx` — Modal de adicionar
- [ ] `packages/web/components/instagram/edit-account-dialog.tsx` — Modal de editar
- [ ] `packages/web/components/instagram/token-guide.tsx` — Guia de obtenção do token
- [ ] `packages/web/lib/hooks/use-instagram-accounts.ts` — TanStack Query hooks para CRUD

---

### Story 3.4.1 — Mind Instagram Tool (Chat Integration)

```yaml
id: "3.4.1"
title: "Mind Instagram Tool — Chat Context Integration"
status: Draft
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [code_review, integration_test]
priority: P2
estimate: M
depends_on: ["3.2.1", "1.2.2"]
epic: "EPIC-3-META-INSTAGRAM"
```

**Description:** Novo tool disponível para minds no chat que permite consultar dados de Instagram de qualquer conta cadastrada, respondendo perguntas como "como está a performance do @cliente".

**Acceptance Criteria:**
- [ ] Novo tool `instagram_metrics` registrado no chat-tools:
  - Input: `{ account_name_or_username: string, metric_type?: string, period?: string }`
  - Output: dados formatados da conta solicitada
- [ ] Mind consegue buscar conta por nome amigável ou @username (fuzzy match)
- [ ] Tipos de consulta suportados:
  - "overview" — followers, engagement, reach summary
  - "posts" — últimos 10 posts com métricas
  - "demographics" — audiência resumida
  - "full" — tudo acima combinado
- [ ] Dados formatados como texto estruturado (markdown) para o LLM processar
- [ ] Se conta não encontrada: retorna mensagem útil com lista de contas disponíveis
- [ ] Se token expirado: retorna aviso pedindo renovação em Settings
- [ ] Usa cache do instagram service (não faz chamadas extras à API)
- [ ] Tool description clara para o LLM saber quando usar
- [ ] Testes: mind recebe dados corretos, handles errors gracefully

**File List:**
- [ ] `packages/api/src/services/chat-tools.ts` — Adicionar tool instagram_metrics
- [ ] `packages/api/src/__tests__/chat-tools-instagram.test.ts` — Testes de integração

---

## Dependency Graph

```
EPIC-1 (done)
    │
    ├── 1.1.1 (Backend Foundation)
    │       │
    │       └── 3.1.2 (DB Schema + Encryption)
    │               │
    │               └── 3.2.1 (Instagram API Service)
    │                       │
    │                       ├── 3.2.2 (REST Routes)
    │                       │       │
    │                       │       ├── 3.3.1 (Dashboard UI)
    │                       │       │
    │                       │       └── 3.3.2 (Settings UI)
    │                       │
    │                       └── 3.4.1 (Mind Tool)
    │
    └── 1.3.1 (Frontend Foundation)
            │
            └── 3.1.1 (Settings Page)
                    │
                    ├── 3.3.1 (Dashboard UI)
                    │
                    └── 3.3.2 (Settings UI)
```

## Execution Waves

| Wave | Stories | Can Parallel? |
|------|---------|---------------|
| Wave 1 | 3.1.1, 3.1.2 | YES — Frontend settings + Backend schema são independentes |
| Wave 2 | 3.2.1 | NO — Depende de 3.1.2 |
| Wave 3 | 3.2.2 | NO — Depende de 3.2.1 |
| Wave 4 | 3.3.1, 3.3.2, 3.4.1 | YES — Dashboard, Settings UI e Mind tool são independentes |

**Total: 7 stories em 4 waves**

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token expira em 60 dias | Users perdem acesso aos dados | UI mostra aviso de expiração < 7 dias, instrução de renovação |
| Rate limit da Graph API (200/h) | Dashboard fica lento com muitas contas | Cache agressivo no banco, batch requests |
| Meta depreca endpoints | Quebra funcionalidade | Isolar chamadas no service, fácil de atualizar |
| Tokens armazenados inseguramente | Leak de credenciais de clientes | AES-256-GCM, ENCRYPTION_KEY em env var, nunca expor token na API |
| Graph API retorna dados inconsistentes | Métricas incorretas | Validação de response, fallback para "dados indisponíveis" |
| Conta Instagram sem permissão de Insights | Endpoints de insights falham | Detectar e mostrar "Conta pessoal — insights não disponíveis" |

## Definition of Done

- [ ] Todas as 7 stories implementadas e testadas
- [ ] Usuário consegue cadastrar conta Instagram com token manual
- [ ] Dashboard mostra todas as métricas listadas no escopo
- [ ] Mind responde perguntas sobre performance de contas Instagram
- [ ] Tokens encriptados no banco, nunca expostos via API
- [ ] Todos os testes passam (unit + integration)
- [ ] Lint + typecheck + build sem erros
- [ ] Responsivo em mobile e desktop
- [ ] Code review aprovado
