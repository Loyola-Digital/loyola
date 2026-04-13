CREATE TABLE IF NOT EXISTS "project_minds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "mind_id" text NOT NULL,
  "added_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_project_minds_project_mind" UNIQUE("project_id", "mind_id")
);

CREATE INDEX IF NOT EXISTS "idx_project_minds_project" ON "project_minds" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_minds_mind" ON "project_minds" ("mind_id");
