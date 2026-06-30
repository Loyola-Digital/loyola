import "dotenv/config";
import { Pool } from "pg";

// Epic 38 — NPS datasets. Runner idempotente (espelha migrate-0057.ts).
//   pnpm --filter @loyola-x/api exec tsx migrate-0058.ts

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "funnel_nps_datasets" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "funnel_id" uuid NOT NULL,
     "stage_id" uuid,
     "label" varchar(120) DEFAULT 'NPS' NOT NULL,
     "spreadsheet_id" varchar(255) NOT NULL,
     "spreadsheet_name" varchar(255) NOT NULL,
     "sheet_name" varchar(255) NOT NULL,
     "column_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
     "created_at" timestamp with time zone DEFAULT now() NOT NULL
   );`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name = 'funnel_nps_datasets_funnel_id_funnels_id_fk'
         AND table_name = 'funnel_nps_datasets' AND constraint_schema = 'public'
     ) THEN
       ALTER TABLE "funnel_nps_datasets"
         ADD CONSTRAINT "funnel_nps_datasets_funnel_id_funnels_id_fk"
         FOREIGN KEY ("funnel_id") REFERENCES "public"."funnels"("id") ON DELETE cascade ON UPDATE no action;
     END IF;
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name = 'funnel_nps_datasets_stage_id_funnel_stages_id_fk'
         AND table_name = 'funnel_nps_datasets' AND constraint_schema = 'public'
     ) THEN
       ALTER TABLE "funnel_nps_datasets"
         ADD CONSTRAINT "funnel_nps_datasets_stage_id_funnel_stages_id_fk"
         FOREIGN KEY ("stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE cascade ON UPDATE no action;
     END IF;
   END $$;`,
  `CREATE INDEX IF NOT EXISTS "idx_funnel_nps_funnel" ON "funnel_nps_datasets" USING btree ("funnel_id");`,
  `CREATE INDEX IF NOT EXISTS "idx_funnel_nps_stage" ON "funnel_nps_datasets" USING btree ("stage_id");`,
];

async function migrate(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida — abortando migration 0058.");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
  try {
    console.log("Applying migration 0058 (funnel NPS datasets)...");
    for (const stmt of STATEMENTS) await pool.query(stmt);
    console.log("Migration 0058 applied successfully!");
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void migrate();
