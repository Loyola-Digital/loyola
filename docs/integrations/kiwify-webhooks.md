# Kiwify — Webhooks de assinatura (Epic 35, fase 2)

Estado **real** de assinatura (vigente / cancelada / atrasada / reembolsada) que a
Public API da Kiwify **não** expõe (não há `/v1/subscriptions`). Chega via webhook,
é persistido por projeto e lido pelo painel de Assinaturas.

## Como funciona

1. **URL única por projeto.** Em _Assinaturas → Kiwify_, com o projeto conectado, o
   admin vê a URL do webhook e a cola no painel da Kiwify (**Apps → Webhooks**):

   ```
   https://<API>/api/webhooks/kiwify/<projectId>?token=<webhookToken>
   ```

   - **Roteamento:** o `projectId` no path diz a qual expert/projeto o evento pertence.
   - **Autenticação:** comparação constant-time do `token` (gerado por nós,
     `crypto.randomBytes(24)`, guardado em `kiwify_connections.webhook_token`).
     _Sem HMAC nesta fase_ — a segurança vem do token secreto na URL. "Gerar novo
     token" revoga o anterior.

2. **Recebimento** (`POST`, `routes/webhooks.ts`):
   - Grava **sempre** o corpo cru em `kiwify_webhook_events` (auditoria + reprocesso).
     Idempotência por `dedup_key = sha256(corpo)` → reenvio idêntico é no-op.
   - Se o evento referir uma assinatura, faz **upsert** do estado normalizado em
     `kiwify_subscriptions` (último recebido vence; campos de identidade preservados
     via `coalesce`).
   - Responde **200 sempre** (qualquer não-2xx faz a Kiwify reenviar em loop).

3. **Leitura:** `GET /api/projects/:projectId/kiwify/subscriptions/summary` →
   `{ total, byStatus, active, canceled, late, activeMrr[] }`.

## Tabelas

### `kiwify_subscriptions` — estado atual (1 linha por assinatura/projeto)

| Coluna | Tipo | Observação |
|---|---|---|
| `project_id` | uuid | FK `projects` (cascade). **Único** com `subscription_id`. |
| `subscription_id` | text | ID da assinatura na Kiwify. |
| `product_id` / `product_name` | text | nullable |
| `plan_name` | text | nullable |
| `customer_email` / `customer_name` | text | **PII — nunca logar** |
| `status` | text | **enum canônico** (ver abaixo) |
| `order_id` | text | última venda associada |
| `amount` | integer | valor da recorrência em **CENTAVOS** |
| `currency` | text | default `BRL` |
| `started_at` / `next_charge_at` / `canceled_at` | timestamptz | nullable |
| `last_event_type` / `last_event_at` | text / timestamptz | último evento processado |

### `kiwify_webhook_events` — log bruto

`project_id`, `event_type`, `order_id`, `subscription_id`, `dedup_key` (sha256,
único por projeto), `payload` (jsonb cru), `received_at`.

### Status canônico

`active` · `waiting_payment` · `late` · `canceled` · `refunded` · `chargedback` ·
`trialing` · `completed` · `unknown`

Mapeamento dos sinônimos da Kiwify em `services/kiwify-subscriptions.ts`
(`mapKiwifyStatus`): `paid/approved/authorized → active`, `pending/processing →
waiting_payment`, `overdue/delayed → late`, `cancelled → canceled`, etc.

## Backfill histórico (script seu)

Para subir o histórico exportado da Kiwify, faça **upsert direto** em
`kiwify_subscriptions` por `(project_id, subscription_id)`. Pontos de atenção:

- `amount` em **centavos** (multiplique por 100 se o export vier em reais).
- `status` deve ser um dos valores canônicos acima (reaproveite `mapKiwifyStatus`).
- Datas em `timestamptz` (UTC). O helper `parseKiwifyDate` aceita ISO e
  `YYYY-MM-DD HH:mm:ss`.
- `ON CONFLICT (project_id, subscription_id) DO UPDATE` — para o webhook ao vivo
  prevalecer depois, deixe o backfill com `last_event_at` no passado (ou nulo).

Exemplo de upsert:

```sql
INSERT INTO kiwify_subscriptions
  (project_id, subscription_id, product_name, plan_name, customer_email,
   status, amount, currency, started_at, next_charge_at, canceled_at, last_event_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, 'BRL', $8, $9, $10, NULL)
ON CONFLICT (project_id, subscription_id) DO UPDATE SET
  status = EXCLUDED.status,
  amount = EXCLUDED.amount,
  next_charge_at = EXCLUDED.next_charge_at,
  canceled_at = EXCLUDED.canceled_at,
  updated_at = now();
```

> Dica: reusar `normalizeKiwifySubscriptionEvent` se o export tiver o mesmo shape
> do webhook. Para auditoria, dá pra também inserir cada linha bruta em
> `kiwify_webhook_events` com um `dedup_key` próprio (ex.: `sha256("backfill:"+id)`).

## Limitações conhecidas (fase 2 MVP)

- **Sem HMAC** — só o token da URL. Dá pra adicionar validação de assinatura depois.
- **Entrega fora de ordem** pode sobrescrever um estado mais recente (raro). O log
  bruto em `kiwify_webhook_events` permite reprocessar se necessário.
- O shape do payload da Kiwify é heterogêneo; a normalização é **defensiva** e o
  corpo cru é sempre preservado.
