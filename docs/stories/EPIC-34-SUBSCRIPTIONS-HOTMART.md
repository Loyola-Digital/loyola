# Epic 34 — Assinaturas (Hotmart; Kiwify depois)

**Status:** Draft
**Owner:** @pm (Morgan)
**Criado em:** 2026-06-11
**Estimativa:** ~21 pts (5 stories — MVP Hotmart)

---

## Goal

Entregar, **por projeto**, uma aba unificada **"Assinaturas"** no app Loyola X onde o usuário (1) configura a credencial da plataforma de recorrência (Hotmart agora, Kiwify depois) e (2) visualiza um **dashboard de assinaturas de um PRODUTO escolhido num dropdown** — espelhando o "Dashboard de assinaturas" da própria Hotmart (vigentes, canceladas, inadimplentes, reembolsadas, MRR, LTV, LT, retenção, renovações do próximo mês e distribuição de status).

A Hotmart **não expõe LTV/MRR/LT prontos** — essas métricas são **calculadas e documentadas como aproximação nossa** a partir dos endpoints de `subscriptions`, `subscriptions/summary` e `sales/summary`.

## Por que agora

1. Lucas pediu — falta visibilidade de recorrência por produto; hoje o time abre o painel da Hotmart manualmente.
2. A auth e os endpoints foram **confirmados ao vivo** (OAuth2 client_credentials + APIs `developers.hotmart.com/payments/api/v1`), removendo o risco de integração.
3. O padrão de "conexão criptografada por projeto" já existe (espelha `mauticConnections` + `services/encryption.ts` AES-256-GCM), então o schema e a cripto são reaproveitados.

## Decisões travadas (Lucas validou)

| Decisão | Escolha | Razão |
|---|---|---|
| Estrutura da aba | **1 aba unificada "Assinaturas"** (href `subscriptions`) que abriga Hotmart agora e Kiwify depois | Evita proliferar abas; Kiwify entra como provider dentro da mesma área |
| Seleção do produto | **Dropdown** no dashboard | Cada projeto pode ter vários produtos; um dashboard por produto escolhido |
| Foco do dashboard | **Assinaturas / recorrência** (espelha o "Dashboard de assinaturas" da Hotmart) | Vendas avulsas/one-time ficam fora do escopo |
| Plataforma 1 | **Hotmart** (Kiwify depois) | Hotmart confirmada ao vivo; Kiwify só stub de UI nesta epic |
| Credencial | **Por projeto, criptografada** (client_id + client_secret) | Mesmo padrão de segurança do Mautic |
| Origem dos produtos do dropdown | **Derivar distinct `product{id,name}`** varrendo `/subscriptions/summary` | O endpoint v2 de produtos deu **401** com esta auth — derivar é robusto |

## Modelo de Auth + Endpoints Hotmart (resumido)

### Auth — OAuth2 client_credentials (confirmado ao vivo)
```
POST https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=..&client_secret=..
Header: Authorization: Basic base64(client_id:client_secret)
Resp:   { access_token, token_type: "bearer", expires_in (segundos) }
```
- Só o **access_token** expira → cachear em memória (Map por projeto) e renovar **~5min antes** do `expires_in`.
- Chamadas de API: `Authorization: Bearer <access_token>`.
- **Basic** = `base64(client_id:client_secret)` é **derivado em runtime, NUNCA armazenado**.
- Base das APIs: `https://developers.hotmart.com/payments/api/v1`.

### Endpoints (confirmados ao vivo)

| Endpoint | Uso | Retorno-chave |
|---|---|---|
| `GET /payments/api/v1/subscriptions` | Lista/conta assinaturas. Filtros: `product_id`, `status`, `accession_date`, `end_accession_date`, `date_next_charge`, `end_date_next_charge`, `max_results`, `page_token` | `{ items:[...], page_info:{ total_results, next_page_token } }` — **contar por status SEM baixar tudo**: chamar com `status=` e ler `page_info.total_results` |
| `GET /payments/api/v1/subscriptions/summary` | Base de LT/LTV. Filtros: `product_id`, `accession_date`, `max_results`, `page_token` | items com `{ lifetime (nº de ciclos pagos), status, plan{name,recurrency_period}, product{id,name}, last_recurrency, date_next_charge }` |
| `GET /payments/api/v1/sales/summary` | Agregado de vendas. Filtros: `transaction_status`, `product_id`, `start_date`, `end_date` | `items:[{ total_items, total_value{value,currency_code} }]` (1 por moeda). **PEGADINHA: sem `transaction_status` retorna só APPROVED+COMPLETE**; reembolsos = `transaction_status=REFUNDED` |

**Status de assinatura:** `ACTIVE`, `INACTIVE`, `DELAYED`, `OVERDUE`, `STARTED`, `CANCELLED_BY_CUSTOMER`, `CANCELLED_BY_SELLER`, `CANCELLED_BY_ADMIN`.
**Status de venda (`sales/summary`):** `APPROVED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `CHARGEBACK`, `CANCELLED`, `COMPLETE`.

> Item de `subscriptions` traz `subscriber` (**PII — NÃO logar**), `subscriber_code`, `subscription_id`, `accession_date`(ms), `date_next_charge`(ms), `trial`, `plan{name,id,recurrency_period(DIAS),max_charge_cycles}`, `price{value,currency_code}`, `product{id,name,ucode}`.

## Métricas-chave (5) e como são calculadas

A Hotmart **não** entrega LTV/MRR/LT prontos. Calculamos (documentado como aproximação nossa). As cinco métricas-chave do dashboard:

| # | Métrica | Cálculo | Fonte |
|---|---|---|---|
| 1 | **Total / Vigentes / Canceladas** (distribuição) | Total = `page_info.total_results` (sem status, com `accession_date` do período). Vigentes = `total_results` com `status=ACTIVE`. Canceladas = `CANCELLED_BY_CUSTOMER` + `CANCELLED_BY_SELLER` + `CANCELLED_BY_ADMIN`. Inadimplentes = `OVERDUE` + `DELAYED`. | `/subscriptions` (1 call por status, lê `total_results`) |
| 2 | **MRR** (por moeda) | Σ sobre assinaturas **ACTIVE** de `price.value * 30 / plan.recurrency_period` (mensaliza: 30d=cheio, 360d=÷12). Agrupar por `currency_code`. | `/subscriptions?status=ACTIVE` |
| 3 | **LTV** (por moeda) | Média de `price.value * lifetime` por assinante (do summary). Alternativa: ticket médio × LT. | `/subscriptions/summary` |
| 4 | **LT (meses)** | Média de `(lifetime * recurrency_period / 30)` das assinaturas do summary. | `/subscriptions/summary` |
| 5 | **Renovações próximo mês** | Assinaturas **ACTIVE** com `date_next_charge` dentro de `[1º dia .. último dia do próximo mês]` → contagem + Σ `price.value` (receita prevista). | `/subscriptions?status=ACTIVE` |

Métricas derivadas adicionais do dashboard: **Reembolsadas** = `sales/summary?transaction_status=REFUNDED` (`total_items` + `total_value`); **Retenção%** = ativas/total; **Cancelamento%/churn** = canceladas/total; **Distribuição de status** = contagem por cada status (tabela do dashboard Hotmart). **Produtos (dropdown)** = distinct `product{id,name}` varrendo `/subscriptions/summary`.

## Stories

| # | Story | Resumo (1 linha) | Pts | Depende de |
|---|---|---|---|---|
| 34.1 | Schema `hotmart_connections` + migration | Tabela de credencial criptografada por projeto (espelha `mautic_connections`) + helpers de cripto/decripto. | 2 | — |
| 34.2 | Service `hotmart.ts` + métricas | Auth com cache de token, `hotmartGet`, fetchers de count/summary/sales, `listHotmartProducts`, `computeHotmartDashboard` (todas as métricas). | 6 | 34.1 |
| 34.3 | Rotas `hotmart.ts` (fp plugin) | CRUD de connection (valida no token endpoint antes de salvar), `/products`, `/dashboard` — guest-blocked, zod, LRUCache ~30min. | 4 | 34.2 |
| 34.4 | Aba "Assinaturas" + painel de config | Nav item unificado + rota `subscriptions/page.tsx` + painel client_id/client_secret (Kiwify "em breve" desabilitada) + hooks de connection. | 4 | 34.3 |
| 34.5 | Dashboard de assinaturas (UI) | Dropdown de produto + filtro de período (default 12m) + KpiCards + card Renovações + gráfico/tabela de distribuição de status (recharts). | 5 | 34.4 |

### Grafo de dependências
```
34.1 (schema) → 34.2 (service+métricas) → 34.3 (rotas) → 34.4 (aba+config) → 34.5 (dashboard UI)
```
Cadeia estritamente sequencial: cada story consome o contrato entregue pela anterior. 34.4 e 34.5 são ambas frontend mas 34.5 precisa do dropdown/dashboard endpoints expostos via hooks criados em 34.4.

## Modelo de dados

### Tabela `hotmart_connections` (nomes exatos do contrato)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `project_id` | uuid NOT NULL **UNIQUE** | FK → `projects(id)` `ON DELETE CASCADE` (1 conexão por projeto) |
| `client_id_encrypted` | text NOT NULL | AES-256-GCM |
| `client_id_iv` | text NOT NULL | IV do client_id |
| `client_secret_encrypted` | text NOT NULL | AES-256-GCM |
| `client_secret_iv` | text NOT NULL | IV do client_secret |
| `created_at` | timestamptz | `default now()` |
| `updated_at` | timestamptz | `default now()` |

- **Index:** `idx_hotmart_connections_project` on `(project_id)`.
- **Basic** (`base64(client_id:client_secret)`) é **derivado em runtime, NÃO armazenado**.
- Reusar `services/encryption.ts` (`encrypt`/`decrypt` AES-256-GCM), padrão `mauticConnections`.

## Pegadinhas críticas (confirmadas ao vivo)

| Pegadinha | Detalhe | Mitigação |
|---|---|---|
| **Default de 30 dias** | `/subscriptions` SEM `accession_date` retorna só os últimos 30 dias de adesão → esconde o histórico. | **SEMPRE** passar `accession_date`. Default do nosso dashboard = **12 meses atrás → hoje**. |
| **Datas em epoch ms UTC** | `accession_date`, `date_next_charge` são **milissegundos** (não segundos, não ISO). | Helper de datas em ms no service; converter na borda. |
| **`recurrency_period` em DIAS** | 30 = mensal, 360 = anual (não "meses"). | Mensalizar via `* 30 / recurrency_period`; nunca assumir meses. |
| **Multi-moeda em `sales/summary`** | Retorna 1 item por `currency_code`. | Agrupar por moeda; **primária = BRL** no resumo. |
| **Paginação por cursor** | `page_token` / `next_page_token` (cursor, **não offset**). | Auto-paginar via `next_page_token` até esgotar (`fetchSubscriptionsSummary`). |
| **`sales/summary` sem status** | Sem `transaction_status` retorna só APPROVED+COMPLETE. | Reembolsos exigem `transaction_status=REFUNDED` explícito. |
| **Endpoint v2 de produtos = 401** | A auth client_credentials não autoriza o catálogo v2. | Derivar produtos das assinaturas (`/subscriptions/summary`). |

## Out of Scope (epic)

- **Kiwify** funcional (apenas **stub de UI** "em breve" nesta epic; integração real é epic futuro).
- **Vendas avulsas / one-time** (foco é recorrência).
- **Webhooks / tempo-real** (Hotmart atualiza ~1x/dia; pull on-demand + cache basta).
- **Ações de escrita** (cancelar/reativar assinatura via API).
- **Exportação CSV** do dashboard.

## Contratos a serem implementados (referência para as stories)

- **Service** — `packages/api/src/services/hotmart.ts` (CRIAR): `getHotmartToken(clientId, clientSecret)` com cache em memória (Map por projeto, refresh 5min antes do `expires_in`); `hotmartGet(token, path, params)`; `fetchSubscriptionCount(token, {productId,status,accessionFrom,accessionTo})` → `page_info.total_results`; `fetchSubscriptionsSummary(token, {productId, accessionFrom})` auto-paginando → items; `fetchSalesSummaryByStatus(token, {productId, status, from, to})`; `listHotmartProducts(token, accessionFrom)` → distinct `product{id,name}`; `computeHotmartDashboard(token, {productId, months})` → objeto com todas as métricas; `encryptHotmartSecret`/`decryptHotmartSecret` via `encryption.ts`; helper de datas em ms.
- **Rotas** — `packages/api/src/routes/hotmart.ts` (CRIAR, fp plugin, reusar `getProjectAccess` + guard guest + zod, LRUCache ttl ~30min):
  - `GET    /api/projects/:projectId/hotmart/connection` → `{ connected }`
  - `PUT    /api/projects/:projectId/hotmart/connection` → body `{clientId, clientSecret}`; **validar batendo no token endpoint antes de salvar**; cripto + upsert (bloquear guest)
  - `DELETE /api/projects/:projectId/hotmart/connection` → remove (bloquear guest)
  - `GET    /api/projects/:projectId/hotmart/products?months=12` → `{ products:[{id,name}] }` (derivado, cacheado)
  - `GET    /api/projects/:projectId/hotmart/dashboard?productId=&months=12` → métricas agregadas (LRU; **invalidar no PUT/DELETE** connection)
- **Frontend** — `packages/web`: nav `PROJECT_SUBITEMS += { label:"Assinaturas", href:"subscriptions", icon: CreditCard }` em `components/layout/project-folder.tsx`; rota `app/(app)/projects/[id]/subscriptions/page.tsx` (`use(params)`, gating `isAdmin = role !== null && role !== "guest"`); componentes em `components/subscriptions/`; hooks em `lib/hooks/use-hotmart.ts` (React Query + `useApiClient`): `useHotmartConnection`, `useSetHotmartConnection`, `useDeleteHotmartConnection`, `useHotmartProducts`, `useHotmartDashboard`. UI: painel de config (client_id + client_secret `type=password`; seção Kiwify "em breve" desabilitada) + dashboard (dropdown de produto, filtro de período default 12m, KpiCards: Total, Vigentes, Canceladas, Reembolsadas, MRR, LTV, LT meses, Retenção%, e card Renovações próximo mês; tabela/gráfico de distribuição de status; recharts). Reusar `KpiCard`/`MetricTooltip`/skeleton do padrão sales/traffic. shadcn/ui + lucide + sonner.

## Segurança

- **NUNCA** commitar/logar `client_secret` nem o **Basic**.
- Credenciais **criptografadas por projeto** (AES-256-GCM via `encryption.ts`).
- `subscriber` (PII) **não logado**.
- Em dev/teste, credenciais só via `.env` (gitignored).

## Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Token expira em chamadas longas (auto-pagination do summary) | M | Cache de token com refresh 5min antes do `expires_in`; renovar antes de cada lote |
| Cliente com muitos produtos/assinaturas → varredura do summary lenta | M | `accession_date` (12m) limita janela; LRUCache ~30min no `/products` e `/dashboard` |
| Métricas (MRR/LTV/LT) não baterem 100% com o painel da Hotmart | M | Documentar explicitamente como **aproximação nossa** (tooltip/Dev Notes); fórmulas versionadas |
| Multi-moeda confundir agregados | L | Agrupar por `currency_code`, primária BRL, exibir por moeda |
| Credencial inválida salva sem validação | M | PUT valida batendo no token endpoint **antes** de criptografar/salvar |

## Change Log

| Data | Quem | Mudança |
|---|---|---|
| 2026-06-11 | @pm Morgan | Epic criado; auth + endpoints Hotmart confirmados ao vivo; decisões travadas com Lucas (aba unificada, dropdown, foco recorrência); 5 stories definidas |
