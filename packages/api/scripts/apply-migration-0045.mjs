import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0045_stage_sales_tmb_subtype.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0045 applied');
  const r = await client.query(`
    SELECT conname, contype FROM pg_constraint
    WHERE conrelid = 'stage_sales_spreadsheets'::regclass
    UNION ALL
    SELECT indexname, 'i' FROM pg_indexes
    WHERE tablename = 'stage_sales_spreadsheets'
      AND indexname LIKE 'uq_%'
  `);
  console.log('Constraints/indexes:', r.rows);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
