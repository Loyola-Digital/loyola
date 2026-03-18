# EPIC-6: Meta Ads / Traffic — Gestao de Contas e Analytics de Trafego

> Criar area de Trafego na plataforma para gerenciar contas de anuncios Meta Ads, vincular a projetos e extrair dados completos da Marketing API para analise de performance de campanhas.

**Status:** Draft
**Created:** 2026-03-18
**Author:** Morgan (PM Agent)
**Product:** Loyola Digital X
**Parent:** EPIC-1
**Depends on:** EPIC-4 (Multi-Project Structure)

---

## Epic Goal

Permitir que a equipe da Loyola Digital cadastre contas de anuncio Meta Ads (Ad Account ID + Access Token), vincule-as a projetos, e visualize todos os dados disponibilizados pela Meta Marketing API — campanhas, ad sets, ads, metricas de performance, gastos e conversoes.

## Business Value

- Centraliza dados de trafego pago de todos os clientes em um unico lugar
- Elimina necessidade de acessar Meta Business Manager por cliente
- Base para futuras analises cruzadas (Instagram organico + Trafego pago)
- Minds poderao responder "quanto gastamos no cliente X?" com dados reais
- Historico de metricas para analise de tendencias e otimizacao de campanhas

## Epic Scope

**In Scope (MVP):**
- Item "Trafego" na sidebar global (icone TrendingUp)
- Pagina `/traffic` — dashboard principal de trafego (listagem de contas vinculadas)
- Aba "Trafego" em Settings `/settings/traffic` — CRUD de contas Meta Ads
  - Cadastro: nome da conta + Ad Account ID + access token
  - Token armazenado encriptado (AES-256, mesmo padrao do Instagram)
  - Validacao do token ao cadastrar (chamada a Marketing API)
  - Vinculacao de conta a um ou mais projetos
- Tabela `meta_ads_accounts` no banco + junction `meta_ads_account_projects`
- Servico `meta-ads.ts` (padrao do `instagram.ts`): rate limiting, caching, error handling
- Rotas API CRUD para contas Meta Ads
- Dados extraidos da Marketing API (para uso futuro nas analises):
  - Campaigns: nome, status, objetivo, budget, spend, resultados
  - Ad Sets: nome, status, targeting, bid, metricas
  - Ads: nome, status, creative, metricas por ad
  - Metricas: impressions, reach, clicks, CTR, CPC, CPM, spend, conversions, ROAS
  - Breakdowns: por dia, idade, genero, plataforma, posicionamento

**Out of Scope (Fase 2+):**
- Dashboard com graficos e analises visuais (sera definido em proximo epic)
- Comparativo entre contas/campanhas
- Criacao/edicao de campanhas via API
- Integracao com Minds (tool de metricas)
- Export de relatorios (PDF/CSV)
- Alertas de budget/performance
- Google Ads / TikTok Ads (outras plataformas)

## Technical Approach

**Padroes a seguir (ja existentes no projeto):**
- Encriptacao de tokens: `packages/api/src/services/instagram.ts` (AES-256-CBC)
- Schema pattern: `instagramAccounts` + `instagramAccountProjects` (many-to-many com projetos)
- Settings UI pattern: `packages/web/app/(app)/settings/instagram/` (page + hooks)
- Sidebar nav: `packages/web/components/layout/app-sidebar.tsx` (navItems array)
- API route pattern: `packages/api/src/routes/instagram.ts` (Fastify plugin com Zod validation)

**Meta Marketing API:**
- Base URL: `https://graph.facebook.com/v21.0`
- Auth: Access token com permissoes `ads_read`, `ads_management`
- Endpoints principais:
  - `GET /act_{AD_ACCOUNT_ID}` — dados da conta
  - `GET /act_{AD_ACCOUNT_ID}/campaigns` — campanhas
  - `GET /act_{AD_ACCOUNT_ID}/adsets` — ad sets
  - `GET /act_{AD_ACCOUNT_ID}/ads` — ads
  - `GET /act_{AD_ACCOUNT_ID}/insights` — metricas agregadas

**Nova tabela `meta_ads_accounts`:**
```
id (uuid PK)
account_name (varchar 100) — nome amigavel
meta_account_id (varchar 50) — act_XXXXXXX
encrypted_access_token (text)
is_active (boolean, default true)
created_by (uuid FK → users)
created_at (timestamp)
updated_at (timestamp)
```

**Nova tabela `meta_ads_account_projects`:**
```
id (uuid PK)
account_id (uuid FK → meta_ads_accounts)
project_id (uuid FK → projects)
created_at (timestamp)
UNIQUE(account_id, project_id)
```

---

## Stories

### Story 6.1: Meta Ads DB Schema + Migration

> Criar tabelas `meta_ads_accounts` e `meta_ads_account_projects` com migration Drizzle.

- **Executor:** `@data-engineer`
- **Quality Gate:** `@dev`
- **Quality Gate Tools:** `[schema_validation, migration_review]`
- **Scope:** Schema DDL, migration file, export no schema.ts
- **AC:**
  1. Tabela `meta_ads_accounts` criada com campos conforme Technical Approach
  2. Tabela `meta_ads_account_projects` com FK + unique constraint
  3. Indices em `meta_account_id` e `created_by`
  4. Migration gerada e aplicavel via `drizzle-kit push`

---

### Story 6.2: Meta Ads API Service + Routes

> Criar servico de integracao com Marketing API e rotas CRUD para contas.

- **Executor:** `@dev`
- **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[code_review, security_scan, pattern_validation]`
- **Scope:** `meta-ads.ts` service, `meta-ads.ts` routes, token validation
- **AC:**
  1. `POST /api/meta-ads/accounts` — cria conta (valida token via API antes de salvar)
  2. `GET /api/meta-ads/accounts` — lista contas do usuario (role-based)
  3. `DELETE /api/meta-ads/accounts/:id` — remove conta
  4. `GET /api/meta-ads/accounts/:id/campaigns` — lista campanhas da conta
  5. `GET /api/meta-ads/accounts/:id/insights` — metricas agregadas (period param)
  6. Token encriptado AES-256 (reusar encrypt/decrypt do instagram.ts)
  7. Rate limiting: 200 req/hour (mesmo padrao Instagram)
  8. Vinculacao conta-projeto: `POST /api/meta-ads/accounts/:id/projects/:projectId`
  9. Desvinculacao: `DELETE /api/meta-ads/accounts/:id/projects/:projectId`

---

### Story 6.3: Traffic UI — Sidebar + Settings + Dashboard Shell

> Adicionar Trafego na sidebar, criar pagina de settings para CRUD de contas, e pagina /traffic como shell.

- **Executor:** `@dev`
- **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[code_review, ui_validation]`
- **Scope:** Sidebar nav item, settings page, dashboard shell, hooks
- **AC:**
  1. Item "Trafego" na sidebar com icone `TrendingUp` entre Instagram e Settings
  2. Aba "Trafego" em `/settings/traffic` (admin/manager only)
  3. Settings page: formulario de cadastro (nome + Ad Account ID + token)
  4. Settings page: lista de contas com status, acoes (excluir), projetos vinculados
  5. Settings page: vincular/desvincular conta a projeto (select de projetos)
  6. Pagina `/traffic` mostrando contas do usuario com link para detalhes
  7. Hook `useMetaAdsAccounts()` + `useMetaAdsCampaigns(accountId)`
  8. Validacao visual: loading states, erro de token invalido, empty states

---

## Compatibility Requirements

- [x] APIs existentes (Instagram, Projects, Conversations) nao sao afetadas
- [x] Schema changes sao aditivas — nenhuma tabela existente e modificada
- [x] UI segue padroes existentes (sidebar, settings tabs, card patterns)
- [x] Permissoes: admin/manager criam contas; guests veem apenas via projeto

## Risk Mitigation

- **Primary Risk:** Token da Marketing API com permissoes insuficientes ou expirado
- **Mitigation:** Validacao obrigatoria no cadastro + mensagem clara de erro
- **Rollback Plan:** Drop das tabelas novas; remover nav item e rotas (zero impacto no existente)

## Definition of Done

- [ ] Tabelas criadas e migration aplicada
- [ ] CRUD de contas funcionando via API
- [ ] Dados de campanhas/insights retornados da Marketing API
- [ ] UI de settings com formulario + listagem de contas
- [ ] Sidebar com item Trafego
- [ ] Pagina /traffic com shell funcional
- [ ] Testes de integracao para rotas principais
- [ ] Zero regressao em funcionalidades existentes
