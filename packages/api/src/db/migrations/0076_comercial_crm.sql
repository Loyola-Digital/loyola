-- Etapa Comercial / CRM (Epic 40, Story 40.1): kanban de compradores.
-- config = etapas-fonte de onde puxar compradores; columns = colunas do kanban
-- (seed default na primeira config); cards = 1 comprador (dedup por email),
-- com N compras no jsonb products. Coluna com card não pode ser excluída
-- (RESTRICT). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "stage_comercial_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stage_id" uuid NOT NULL UNIQUE REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  "source_stage_ids" jsonb NOT NULL DEFAULT '[]',
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stage_crm_columns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stage_id" uuid NOT NULL REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_terminal" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_crm_columns_stage_sort" ON "stage_crm_columns" ("stage_id", "sort_order");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stage_crm_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stage_id" uuid NOT NULL REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  "column_id" uuid NOT NULL REFERENCES "stage_crm_columns"("id") ON DELETE RESTRICT,
  "customer_email" varchar(255) NOT NULL,
  "customer_name" varchar(255),
  "customer_phone" varchar(50),
  "products" jsonb NOT NULL DEFAULT '[]',
  "total_value" numeric(12,2) NOT NULL DEFAULT 0,
  "first_purchase_at" timestamptz,
  "notes" text,
  "assignee_name" varchar(255),
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_cards_stage_email" ON "stage_crm_cards" ("stage_id", "customer_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_crm_cards_stage_column_sort" ON "stage_crm_cards" ("stage_id", "column_id", "sort_order");
