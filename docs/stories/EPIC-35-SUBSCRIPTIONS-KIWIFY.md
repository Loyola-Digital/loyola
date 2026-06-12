# Epic 35 — Assinaturas Kiwify (Pull-MVP, vendas recorrentes)

**Status:** Draft
**Owner:** @sm (River) — criado a partir de research ao vivo do @dev (Dex)
**Criado em:** 2026-06-12
**Estimativa:** ~21 pts (5 stories — MVP pull)

---

## Goal

Entregar, **por projeto**, dentro da aba unificada **"Assinaturas"** já existente (Epic 34), a integração **real da Kiwify** — substituindo o `KiwifyStub` "em breve" por (1) painel de conexão da credencial Kiwify e (2) um **dashboard de recorrência por PRODUTO recorrente escolhido num dropdown**, com as métricas que a Public API da Kiwify **realmente** permite derivar.

A integração espelha a arquitetura do Epic 34 (Hotmart) ponta a ponta — cripto por projeto, cache SWR L1+L2, rotas fp + zod + guest-block, hooks React Query, componentes `subscriptions/*`. **O único pedaço novo é o adaptador da API Kiwify.**

## Por que agora

1. Lucas pediu — falta visibilidade de recorrência da Kiwify por produto.
2. Auth + endpoints **confirmados ao vivo** (2026-06-12, conta "Loyola" store `QV6qsR9pmTiS8uE`) e cruzados com a doc oficial `docs.kiwify.com.br`.
3. O padrão de "conexão criptografada por projeto + cache SWR + dashboard de assinaturas" já existe no Epic 34 → REUSE direto.

## Decisão crítica de escopo (Lucas validou — 2026-06-12)

> **A Public API da Kiwify NÃO expõe estado de assinatura.** Não há `/subscriptions` (404). Confirmado por probe ao vivo + doc oficial + `view_full_sale_details=true` (nem o detalhe completo da venda traz subscription_status/next_charge/ciclos). Só existe o **stream de vendas** (`/v1/sales`).

Por isso o escopo é **Pull-MVP (Opção A)**: métricas **derivadas de vendas** dos produtos recorrentes. "Vigentes/canceladas/churn/LT/renovações reais" exigem **webhooks** (estado próprio) e ficam para uma **fase 2 (Epic futuro)**. Cards que dependem de estado mostram **tooltip honesto** ("requer webhooks — fase 2") em vez de número incorreto.

## Modelo de Auth + Endpoints Kiwify (confirmado ao vivo)

### Auth — OAuth2 client_credentials
```
POST https://public-api.kiwify.com/v1/oauth/token
Content-Type: application/x-www-form-urlencoded
body: client_id=..&client_secret=..
Resp: { access_token (JWT), token_type: "Bearer", expires_in: 86400 (24h), scope: [...] }
```
- Token cacheado em memória (Map por credencial), refresh ~5min antes do `expires_in`.
- **Toda chamada de dados** exige `Authorization: Bearer <token>` **+ header `x-kiwify-account-id: <account_id>`**.
- Base das APIs: `https://public-api.kiwify.com/v1`.

### Endpoints (confirmados)

| Endpoint | Uso | Notas-chave |
|---|---|---|
| `GET /v1/products` | Lista produtos. Paginação `{count, page_number, page_size}`. | **Assinaturas = produtos `payment_type:"recurring"`**. Produto: `{id,name,type,payment_type,price(centavos),currency,status}`. |
| `GET /v1/sales` | Stream de vendas. **Teto de 90 dias** entre `start_date`/`end_date` → paginar em janelas. Filtros: `status`, `payment_method`, `product_id`, `affiliate_id`, `view_full_sale_details`, `page_size`/`page_number` (offset). | Venda: `{id,reference,type,created_at,updated_at,product{id,name,plan_id,plan_name},status,payment_method,net_amount(centavos),currency,customer(PII)}`. Com `view_full_sale_details=true` += `approved_date, refunded_at, payment{charge_amount,fee,...}, installments, card_*, parent_order_id, tracking{utm_*}, revenue_partners[]`. |
| `GET /v1/sales/{id}` | Detalhe da venda. | Sem dados de assinatura. |
| `GET /v1/stats` | Agregados de venda. Exige `start_date`+`end_date` (aceita >90d). | `{total_sales, refund_rate, chargeback_rate, credit_card_approval_rate, total_boleto_*}`. Sem MRR/recorrência. |

**Status de venda (enum oficial, 11):** `approved, authorized, chargedback, paid, pending, pending_refund, processing, refunded, refund_requested, refused, waiting_payment`.

**NÃO existem:** `/v1/subscriptions` (404), `/v1/charges` (404), `/v1/financial` (404), `/v1/events` (404).

## Métricas do Pull-MVP (derivadas de `/v1/sales` dos produtos recurring)

| # | Métrica | Cálculo | Fonte |
|---|---|---|---|
| 1 | **Receita recorrente** (por moeda) | Σ `net_amount` de vendas `status∈{paid,approved}` de produtos recurring no período | `/sales` por produto recurring |
| 2 | **MRR aproximado** (por moeda) | Receita recorrente dos **últimos 30 dias** | `/sales` (janela 30d) |
| 3 | **Cobranças por bucket** | count + Σ valor por: pagas (`paid/approved`), reembolsadas (`refunded/refund_requested/pending_refund`), chargeback (`chargedback`), pendentes (`waiting_payment/pending/processing`), recusadas (`refused`) | `/sales` (1 chamada por status via `pagination.count`) |
| 4 | **Taxa de reembolso / chargeback** | direto | `/stats` |
| 5 | **Novos vs renovação** | venda com `parent_order_id` vazio = nova; preenchido = renovação | `/sales?view_full_sale_details=true` |
| 6 | **Distribuição por status de venda** | contagem por status | `/sales` |

**Gaps honestos (null + tooltip "fase 2 / webhooks"):** assinaturas vigentes, canceladas, churn real, LT, renovações do próximo mês.

## Stories

| # | Story | Resumo | Pts | Depende de |
|---|---|---|---|---|
| 35.1 | Schema `kiwify_connections` + `kiwify_cache` + migrations | Tabelas de credencial criptografada por projeto (client_id+client_secret+account_id) e cache SWR, espelhando Hotmart. | 2 | — |
| 35.2 | Service `kiwify.ts` + métricas | Auth (token cache 24h, header account-id), `kiwifyGet`, `listKiwifyProducts` (filtra recurring), `fetchSalesWindowed` (janelas 90d + offset), `computeKiwifyDashboard`. | 6 | 35.1 |
| 35.3 | Rotas `kiwify.ts` (fp plugin) | CRUD connection (valida no token endpoint antes de salvar), `/products`, `/dashboard` — guest-block, zod, cache SWR L1+L2. | 4 | 35.2 |
| 35.4 | Painel de conexão + hooks | Troca `KiwifyStub` por painel real (client_id+secret+account_id) + `use-kiwify.ts`. | 4 | 35.3 |
| 35.5 | Dashboard Kiwify (UI) | Dropdown produto recorrente + período + KPIs honestos + gráfico distribuição por status de venda (reusa `subscriptions/*`). | 5 | 35.4 |

### Grafo de dependências
```
35.1 (schema) → 35.2 (service) → 35.3 (rotas) → 35.4 (painel+hooks) → 35.5 (dashboard UI)
```
Cadeia estritamente sequencial (espelha 34.1→34.5).

## Out of Scope (epic)

- **Webhooks / estado real de assinatura** (vigentes/canceladas/churn/LT) → fase 2 (epic futuro).
- **Ações de escrita** (executar refund via `sales/refund`).
- **Banking / PIX / saques** da Kiwify.
- **Vendas avulsas** (foco: produtos `recurring`; vendas one-time `charge` ficam fora).
- **Exportação CSV.**

## Segurança

- **NUNCA** commitar/logar `client_secret` nem o token. PII do `customer` nunca logada.
- Credenciais **criptografadas por projeto** (AES-256-GCM via `encryption.ts`).
- ⚠️ **Rotacionar o `client_secret`** da conta de teste após o desenvolvimento (foi exposto no chat em 2026-06-12).

## Change Log

| Data | Quem | Mudança |
|---|---|---|
| 2026-06-12 | @sm River | Epic criado a partir de research ao vivo do @dev. Auth+endpoints Kiwify confirmados (probe + doc oficial). Escopo Pull-MVP travado com Lucas (sem estado de assinatura via pull). 5 stories espelhando Epic 34. |
