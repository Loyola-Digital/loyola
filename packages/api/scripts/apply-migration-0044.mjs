import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0044_manual_sales_product_invoice.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0044 applied (manual_sales.product + invoice_status)');

  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'manual_sales' AND column_name IN ('product','invoice_status')
     ORDER BY column_name`,
  );
  console.log('\nnew columns:', cols.rows);

  const constraints = await client.query(
    `SELECT conname, pg_get_constraintdef(oid)
     FROM pg_constraint
     WHERE conrelid = 'manual_sales'::regclass AND conname LIKE '%invoice%'`,
  );
  console.log('\nconstraints:', constraints.rows);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
