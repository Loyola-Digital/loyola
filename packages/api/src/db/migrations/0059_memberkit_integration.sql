-- Story 19.10 + 19.11 — Etapa Evento Presencial + Integração MemberKit
-- Aditiva e idempotente. funnel_stages.stage_type já é varchar(10) livre
-- (sem CHECK) → o novo tipo "event" não precisa de DDL.

-- 19.10: campos do Evento Presencial na venda manual (Caixa / Negociação)
ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "valor_recebido" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "negociacao" text;--> statement-breakpoint

-- 19.11: status da matrícula MemberKit por venda
ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "memberkit_status" varchar(12);--> statement-breakpoint
ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "memberkit_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "manual_sales" ADD COLUMN IF NOT EXISTS "memberkit_user_id" varchar(64);--> statement-breakpoint

-- 19.11: credencial MemberKit por projeto (API key cifrada AES-256-GCM)
CREATE TABLE IF NOT EXISTS "memberkit_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "api_key_encrypted" text NOT NULL,
  "api_key_iv" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "memberkit_connections_project_id_unique" UNIQUE("project_id")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "memberkit_connections" ADD CONSTRAINT "memberkit_connections_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_memberkit_connections_project" ON "memberkit_connections" ("project_id");--> statement-breakpoint

-- 19.11: config de matrícula por etapa (qual turma matricular ao lançar a venda)
CREATE TABLE IF NOT EXISTS "stage_memberkit_enrollment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL,
  "classroom_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(10) DEFAULT 'active' NOT NULL,
  "auto_enroll" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "stage_memberkit_enrollment_stage_id_unique" UNIQUE("stage_id")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stage_memberkit_enrollment" ADD CONSTRAINT "stage_memberkit_enrollment_stage_id_funnel_stages_id_fk"
    FOREIGN KEY ("stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stage_memberkit_enrollment_stage" ON "stage_memberkit_enrollment" ("stage_id");
