import "dotenv/config";
import { Pool } from "pg";

// Epic 37 — GA4. Runner idempotente e autossuficiente (espelha migrate-0056.ts).
//   pnpm --filter @loyola-x/api exec tsx migrate-0057.ts

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "ga4_connections" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "project_id" uuid NOT NULL,
     "refresh_token_encrypted" text NOT NULL,
     "refresh_token_iv" text NOT NULL,
     "property_id" varchar(32) NOT NULL,
     "property_name" text,
     "created_at" timestamp with time zone DEFAULT now() NOT NULL,
     "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
     CONSTRAINT "ga4_connections_project_id_unique" UNIQUE ("project_id")
   );`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name = 'ga4_connections_project_id_projects_id_fk'
         AND table_name = 'ga4_connections' AND constraint_schema = 'public'
     ) THEN
       ALTER TABLE "ga4_connections"
         ADD CONSTRAINT "ga4_connections_project_id_projects_id_fk"
         FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
     END IF;
   END $$;`,
  `CREATE INDEX IF NOT EXISTS "idx_ga4_connections_project" ON "ga4_connections" USING btree ("project_id");`,
  `ALTER TABLE "funnel_stages" ADD COLUMN IF NOT EXISTS "ga4_page_filter" text;`,
];

async function migrate(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida — abortando migration 0057.");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
  try {
    console.log("Applying migration 0057 (GA4 integration)...");
    for (const stmt of STATEMENTS) await pool.query(stmt);
    console.log("Migration 0057 applied successfully!");
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void migrate();
