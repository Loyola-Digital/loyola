import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0037_perpetual_sales_enum.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

// ALTER TYPE ... ADD VALUE NÃO pode rodar dentro de transação (Postgres limitation).
// Roda direto em autocommit, sem BEGIN/COMMIT.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(sql);
  console.log('✅ Migration 0037 applied (perpetual_sales added to funnel_spreadsheet_type)');

  const values = await client.query(
    `SELECT unnest(enum_range(NULL::funnel_spreadsheet_type))::text AS value ORDER BY 1`,
  );
  console.log('\nfunnel_spreadsheet_type values:', values.rows.map((r) => r.value));
} catch (e) {
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
