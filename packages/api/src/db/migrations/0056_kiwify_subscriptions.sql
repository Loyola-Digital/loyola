-- Story 35.6 (Epic 35 fase 2): Webhooks de assinatura Kiwify (estado real).
-- A Public API da Kiwify NÃO expõe estado de assinatura (sem /subscriptions) — o
-- estado vigente/cancelada/atrasada/reembolsada chega via WEBHOOKS. Este migration:
--   1. kiwify_connections.webhook_token: token secreto por projeto, embutido na
--      URL única que o expert cola no painel da Kiwify. Roteamento pelo project_id
--      no path; autenticação do POST = comparação constant-time deste token.
--   2. kiwify_webhook_events: log BRUTO de TODO evento recebido (auditoria +
--      reprocessamento). Idempotência via dedup_key = sha256(corpo cru) por projeto.
--   3. kiwify_subscriptions: estado NORMALIZADO atual (1 linha por assinatura por
--      projeto) — fonte de "vigentes/canceladas/atrasadas/churn".
-- Idempotente (IF NOT EXISTS / guards via information_schema).

ALTER TABLE "kiwify_connections" ADD COLUMN IF NOT EXISTS "webhook_token" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'kiwify_connections_webhook_token_unique'
      AND table_name = 'kiwify_connections'
      AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "kiwify_connections"
      ADD CONSTRAINT "kiwify_connections_webhook_token_unique" UNIQUE ("webhook_token");
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kiwify_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "event_type" text,
  "order_id" text,
  "subscription_id" text,
  "dedup_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kiwify_webhook_events_project_dedup_unique" UNIQUE ("project_id", "dedup_key")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'kiwify_webhook_events_project_id_projects_id_fk'
      AND table_name = 'kiwify_webhook_events'
      AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "kiwify_webhook_events"
      ADD CONSTRAINT "kiwify_webhook_events_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kiwify_webhook_events_project" ON "kiwify_webhook_events" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kiwify_webhook_events_subscription" ON "kiwify_webhook_events" USING btree ("project_id","subscription_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kiwify_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "subscription_id" text NOT NULL,
  "product_id" text,
  "product_name" text,
  "plan_name" text,
  "customer_email" text,
  "customer_name" text,
  "status" text NOT NULL,
  "order_id" text,
  "amount" integer,
  "currency" text,
  "started_at" timestamp with time zone,
  "next_charge_at" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "last_event_type" text,
  "last_event_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kiwify_subscriptions_project_sub_unique" UNIQUE ("project_id", "subscription_id")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'kiwify_subscriptions_project_id_projects_id_fk'
      AND table_name = 'kiwify_subscriptions'
      AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "kiwify_subscriptions"
      ADD CONSTRAINT "kiwify_subscriptions_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kiwify_subscriptions_project_status" ON "kiwify_subscriptions" USING btree ("project_id","status");
