import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('Missing DATABASE_URL'); process.exit(1); }

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0070_manual_sales_refund.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0070 applied');
  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='manual_sales'
       AND column_name IN ('refunded_at','refund_reason','refunded_by')
     ORDER BY column_name`,
  );
  console.log('Colunas:', cols.rows);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
