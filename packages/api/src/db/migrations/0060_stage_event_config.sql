-- Story 19.12 — Config da etapa de Evento Presencial: produtos (com turma
-- MemberKit cada) + closers cadastrados. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "stage_event_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "memberkit_classroom_id" integer,
  "memberkit_classroom_name" varchar(255),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stage_event_products" ADD CONSTRAINT "stage_event_products_stage_id_funnel_stages_id_fk"
    FOREIGN KEY ("stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stage_event_products_stage" ON "stage_event_products" ("stage_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "stage_event_closers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stage_event_closers" ADD CONSTRAINT "stage_event_closers_stage_id_funnel_stages_id_fk"
    FOREIGN KEY ("stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stage_event_closers_stage" ON "stage_event_closers" ("stage_id");
