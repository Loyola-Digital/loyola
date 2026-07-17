-- Relatórios HTML gerados por IA (skill dashboard-campanhas da gestora).
-- Additive + idempotente (prod não roda drizzle migrate).
CREATE TABLE IF NOT EXISTS "sprint_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(255) NOT NULL,
  "author" varchar(120),
  "kind" varchar(60),
  "html" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sprint_reports_created_idx" ON "sprint_reports" ("created_at");
