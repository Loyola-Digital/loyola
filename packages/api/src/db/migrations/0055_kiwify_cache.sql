-- Story 35.1 (perf): cache persistente do dashboard/products Kiwify.
-- A API Kiwify pagina /sales por offset em janelas de até 90 dias (várias
-- chamadas no cold miss). Esta tabela persiste o payload agregado por
-- (project, key) pra servir instantaneamente via stale-while-revalidate.
-- cache_key = "dashboard:<productId>:<months>" ou "products:<months>".
-- Idempotente (IF NOT EXISTS / guard de FK via information_schema).

CREATE TABLE IF NOT EXISTS "kiwify_cache" (
  "project_id" uuid NOT NULL,
  "cache_key" varchar(200) NOT NULL,
  "data" jsonb NOT NULL,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kiwify_cache_project_id_cache_key_pk" PRIMARY KEY("project_id","cache_key")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'kiwify_cache_project_id_projects_id_fk'
      AND table_name = 'kiwify_cache'
      AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "kiwify_cache"
      ADD CONSTRAINT "kiwify_cache_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
