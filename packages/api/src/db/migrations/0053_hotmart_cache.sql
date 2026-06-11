-- Story 34.x (perf): cache persistente do dashboard/products Hotmart.
-- A API Hotmart pagina /subscriptions/summary sequencialmente por cursor, o que
-- deixa o dashboard lento no cold miss (e o LRU em memória se perde a cada
-- deploy/restart). Esta tabela persiste o payload agregado por (project, key)
-- pra servir instantaneamente via stale-while-revalidate.
-- cache_key = "dashboard:<productId>:<months>" ou "products:<months>".
-- Idempotente (IF NOT EXISTS / guard de FK via information_schema).

CREATE TABLE IF NOT EXISTS "hotmart_cache" (
  "project_id" uuid NOT NULL,
  "cache_key" varchar(200) NOT NULL,
  "data" jsonb NOT NULL,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "hotmart_cache_project_id_cache_key_pk" PRIMARY KEY("project_id","cache_key")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'hotmart_cache_project_id_projects_id_fk'
      AND table_name = 'hotmart_cache'
      AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "hotmart_cache"
      ADD CONSTRAINT "hotmart_cache_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
