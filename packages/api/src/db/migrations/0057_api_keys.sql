-- Story 36.1: Infra de API Keys (Epic 36 — Meta Ads Creative Intelligence API / MCP).
-- Credencial máquina-a-máquina para consumo da API pública. Guarda APENAS o hash
-- SHA-256 da chave (irreversível) — o texto puro é exibido uma única vez na criação.
-- `scopes` controla o que a chave pode ler (default ['meta:read']).
-- Consumida pelo middleware da Story 36.2 (lookup por key_hash + timingSafeEqual).
-- Idempotente (IF NOT EXISTS / guard de constraint via information_schema).

CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "scopes" jsonb DEFAULT '["meta:read"]'::jsonb NOT NULL,
  "created_by" uuid NOT NULL,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'api_keys_created_by_users_id_fk'
      AND table_name = 'api_keys'
      AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "api_keys"
      ADD CONSTRAINT "api_keys_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_api_keys_key_hash" ON "api_keys" USING btree ("key_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_created_by" ON "api_keys" USING btree ("created_by");
