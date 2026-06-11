-- Story 34.1: Integração Hotmart (Assinaturas / recorrência).
-- Conexão por projeto (credenciais OAuth2 client_credentials criptografadas via
-- AES-256-GCM). client_id e client_secret guardados cifrados (+ IV); o Basic
-- base64(client_id:client_secret) é derivado em runtime, NUNCA armazenado.
-- Idempotente (IF NOT EXISTS / guard de constraint via information_schema).

CREATE TABLE IF NOT EXISTS "hotmart_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "client_id_encrypted" text NOT NULL,
  "client_id_iv" text NOT NULL,
  "client_secret_encrypted" text NOT NULL,
  "client_secret_iv" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "hotmart_connections_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'hotmart_connections_project_id_projects_id_fk'
      AND table_name = 'hotmart_connections'
      AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "hotmart_connections"
      ADD CONSTRAINT "hotmart_connections_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hotmart_connections_project" ON "hotmart_connections" USING btree ("project_id");
