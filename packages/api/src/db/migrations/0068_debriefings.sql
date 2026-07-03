-- Epic 37 — Debriefings globais de campanha (Story 37.1).
-- Doc HTML por campanha + comentários com autoria. Puramente aditiva.
-- Idempotente (IF NOT EXISTS / guards).

CREATE TABLE IF NOT EXISTS "debriefings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_name" text NOT NULL,
  "html" text NOT NULL,
  "file_name" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'debriefings_created_by_users_id_fk'
      AND table_name = 'debriefings' AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "debriefings"
      ADD CONSTRAINT "debriefings_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'debriefings_updated_by_users_id_fk'
      AND table_name = 'debriefings' AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "debriefings"
      ADD CONSTRAINT "debriefings_updated_by_users_id_fk"
      FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_debriefings_created_at" ON "debriefings" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "debriefing_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "debriefing_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "text" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'debriefing_comments_debriefing_id_debriefings_id_fk'
      AND table_name = 'debriefing_comments' AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "debriefing_comments"
      ADD CONSTRAINT "debriefing_comments_debriefing_id_debriefings_id_fk"
      FOREIGN KEY ("debriefing_id") REFERENCES "public"."debriefings"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'debriefing_comments_user_id_users_id_fk'
      AND table_name = 'debriefing_comments' AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE "debriefing_comments"
      ADD CONSTRAINT "debriefing_comments_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_debriefing_comments_debriefing_created" ON "debriefing_comments" USING btree ("debriefing_id", "created_at");
