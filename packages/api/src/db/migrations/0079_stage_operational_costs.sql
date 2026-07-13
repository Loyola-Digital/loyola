-- Brief v5 #2: custos operacionais da etapa (Evento Presencial) — denominador
-- do ROAS REAL. Additive + idempotente (prod não roda drizzle migrate).
CREATE TABLE IF NOT EXISTS "stage_operational_costs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  "category" varchar(20) NOT NULL,
  "description" varchar(255),
  "amount" numeric(12,2) NOT NULL,
  "incurred_at" date,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "stage_operational_costs_stage_idx" ON "stage_operational_costs" ("stage_id");
