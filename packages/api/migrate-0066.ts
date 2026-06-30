import { config } from "dotenv";
import { Pool } from "pg";

// Atribuição de vendedor a um lead na etapa de Evento Presencial.
// Runner idempotente e AUTOSSUFICIENTE (Pool próprio — não depende do plugin
// Fastify). Aplica src/db/migrations/0066_event_lead_seller.sql. Rodar com:
//   pnpm --filter @loyola-x/api exec tsx migrate-0066.ts
//
// Idempotente: reexecutar é seguro (ADD COLUMN IF NOT EXISTS). Aditiva e nullable.

config();

const STATEMENTS: string[] = [
  `ALTER TABLE "stage_event_lead_status" ADD COLUMN IF NOT EXISTS "assigned_seller" varchar(255);`,
];

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL não definida — abortando migration 0066.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log("Applying migration 0066 (event lead seller)...");
    for (const stmt of STATEMENTS) {
      await pool.query(stmt);
    }
    console.log("Migration 0066 applied successfully!");
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void migrate();
