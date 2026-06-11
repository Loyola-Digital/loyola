-- Merge de Vendedor (escopo por projeto).
-- Unifica variações do nome do vendedor entre fontes (utm_source da planilha ×
-- sellerName das vendas manuais) num único nome canônico no sellers-breakdown.
-- Idempotente (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "seller_aliases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "canonical_name" varchar(255) NOT NULL,
  "aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'seller_aliases_project_id_projects_id_fk'
      AND table_name = 'seller_aliases'
      AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "seller_aliases"
      ADD CONSTRAINT "seller_aliases_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seller_aliases_project" ON "seller_aliases" USING btree ("project_id");
