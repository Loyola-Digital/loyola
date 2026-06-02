import { sql } from "drizzle-orm";
import { db } from "./src/db/client.js";

async function migrate() {
  try {
    console.log("Applying migration 0041...");
    
    await db.execute(sql`
      ALTER TABLE "funnel_stages"
      ADD COLUMN IF NOT EXISTS "projection_end_date" DATE,
      ADD COLUMN IF NOT EXISTS "lead_goal" INTEGER;
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "idx_funnel_stages_projection"
      ON "funnel_stages" ("projection_end_date");
    `);
    
    console.log("Migration 0041 applied successfully!");
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }
}

migrate();
