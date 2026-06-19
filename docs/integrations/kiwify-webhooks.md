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

## Backfill histórico (CSV de Subscriptions)

Há um script pronto que lê o **export "Subscriptions"** da Kiwify (CSV) e faz upsert
em `kiwify_subscriptions`:

```bash
# DATABASE_URL no ambiente. --project aceita UUID ou nome (ILIKE).
pnpm --filter @loyola-x/api exec \
  tsx src/scripts/backfill-kiwify-subscriptions.ts \
  --project=<uuid-ou-nome-do-projeto> --file=/caminho/subscriptions.csv

# Pré-visualizar sem gravar:
#   ... --project=... --file=... --dry
```

### Colunas do CSV → `kiwify_subscriptions`

| Coluna CSV | Coluna tabela | Observação |
|---|---|---|
| `Status` | `status` | normalizado por `mapKiwifyStatus` (`active` → `active`) |
| `Product Name` | `product_name` | |
| `Plan Name` | `plan_name` | |
| `Customer Name` / `Customer Email` | `customer_name` / `customer_email` | PII |
| `Price` | `amount` | **já vem em CENTAVOS** — gravado direto |
| `Started At` | `started_at` | `YYYY-MM-DD HH:mm` tratado como UTC |
| `Current Period End` | `next_charge_at` | data da próxima renovação |
| `Canceled At` | `canceled_at` | vazio quando ativa |

`currency` = `BRL` fixo. `order_id`/`product_id` ficam nulos (não há no export).

> **`amount` não é normalizado para mensal** — é o valor da cobrança do período do
> plano (anual/mensal/trimestral). O "MRR" do summary soma isso direto; ajuste se
> precisar de MRR real.

### ⚠️ Sem `subscription_id` no export

O CSV de Subscriptions **não traz o ID da assinatura**. O script gera um id
sintético determinístico: `csv:<sha1(email|produto|plano|started_at)>`. Implicações:

- **Idempotente:** rodar o mesmo CSV de novo atualiza as mesmas linhas.
- **Não reconcilia com webhooks ao vivo:** eventos de webhook usam o
  `subscription_id` REAL da Kiwify → entram como linha nova. Trate o CSV como
  **snapshot histórico**; quando os webhooks começarem a fluir, eles são a fonte
  de verdade dali pra frente (e podem coexistir com a linha do CSV da mesma pessoa).
- `last_event_type = 'backfill_csv'`, `last_event_at = NULL`.

> Referência de validação: o export de exemplo (96 assinaturas ativas) somou
> `amount` de vigentes = **R$ 43.697,10** (períodos mistos).

## Limitações conhecidas (fase 2 MVP)

- **Sem HMAC** — só o token da URL. Dá pra adicionar validação de assinatura depois.
- **Entrega fora de ordem** pode sobrescrever um estado mais recente (raro). O log
  bruto em `kiwify_webhook_events` permite reprocessar se necessário.
- O shape do payload da Kiwify é heterogêneo; a normalização é **defensiva** e o
  corpo cru é sempre preservado.
