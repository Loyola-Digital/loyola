-- Story 19.15 — Plano de Vendas (Evento Presencial).
-- N planilhas de pesquisa (1 por tipo) cruzadas por email + matriz GLOBAL de
-- faixas de faturamento → oferta. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "stage_sales_plan_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL,
  "tipo" varchar(80) NOT NULL,
  "spreadsheet_id" varchar(255) NOT NULL,
  "spreadsheet_name" varchar(500) DEFAULT '' NOT NULL,
  "sheet_name" varchar(255) NOT NULL,
  "mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stage_sales_plan_sources" ADD CONSTRAINT "stage_sales_plan_sources_stage_id_funnel_stages_id_fk"
    FOREIGN KEY ("stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stage_sales_plan_sources_stage" ON "stage_sales_plan_sources" ("stage_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "stage_sales_plan_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL,
  "label" varchar(255) NOT NULL,
  "min_revenue" numeric(14, 2),
  "max_revenue" numeric(14, 2),
  "offer" varchar(500) DEFAULT '' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stage_sales_plan_rules" ADD CONSTRAINT "stage_sales_plan_rules_stage_id_funnel_stages_id_fk"
    FOREIGN KEY ("stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stage_sales_plan_rules_stage" ON "stage_sales_plan_rules" ("stage_id");
