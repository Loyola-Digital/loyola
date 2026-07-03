// Story 37.3: aplica a migration 0069 (anchor_x/anchor_y em debriefing_comments)
// de forma segura e idempotente — sem drizzle-kit push (drift do snapshot).
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(
  __dirname,
  "../db/migrations/0069_debriefing_comment_anchors.sql",
);
const statements = readFileSync(sqlPath, "utf-8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  for (const stmt of statements) {
    await pool.query(stmt);
  }
  const cols = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name='debriefing_comments' ORDER BY ordinal_position`,
  );
  console.log(
    "colunas:",
    cols.rows.map((c) => `${c.column_name}:${c.data_type}`).join(", "),
  );
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
