-- Etapa Lyrio (app mobile) — integração RevenueCat.
-- Aditivo e idempotente: CREATE TABLE/INDEX IF NOT EXISTS. Aplicar via
-- src/scripts/apply-revenuecat-migration.ts (não usar drizzle-kit push).

CREATE TABLE IF NOT EXISTS "revenuecat_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL UNIQUE REFERENCES "projects"("id") ON DELETE cascade,
  "api_key_encrypted" text NOT NULL,
  "api_key_iv" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_revenuecat_connections_project" ON "revenuecat_connections" ("project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revenuecat_stage_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL UNIQUE REFERENCES "funnel_stages"("id") ON DELETE cascade,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "rc_project_id" varchar(64),
  "label" varchar(255),
  "webhook_token" text UNIQUE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_revenuecat_stage_config_stage" ON "revenuecat_stage_config" ("stage_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_revenuecat_stage_config_project" ON "revenuecat_stage_config" ("project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revenuecat_sales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL REFERENCES "funnel_stages"("id") ON DELETE cascade,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "event_id" varchar(255) NOT NULL,
  "dedup_key" text NOT NULL,
  "event_type" varchar(40),
  "store" varchar(30),
  "environment" varchar(20),
  "app_user_id" varchar(255),
  "product_id" varchar(255),
  "country_code" varchar(8),
  "currency" varchar(8),
  "price_in_purchased_currency" numeric(14, 4),
  "revenue_usd" numeric(14, 4),
  "purchased_at" timestamp with time zone,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "revenuecat_sales_stage_event_unique" UNIQUE ("stage_id", "event_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_revenuecat_sales_stage_purchased" ON "revenuecat_sales" ("stage_id", "purchased_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_revenuecat_sales_project" ON "revenuecat_sales" ("project_id");
