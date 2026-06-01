import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0041_manual_sales.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0041 applied (manual_sales table)');

  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'manual_sales'
     ORDER BY ordinal_position`,
  );
  console.log('\nmanual_sales columns:', cols.rows);

  const idx = await client.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'manual_sales' ORDER BY indexname`,
  );
  console.log('indexes:', idx.rows);

  const fks = await client.query(
    `SELECT conname, pg_get_constraintdef(oid)
     FROM pg_constraint
     WHERE conrelid = 'manual_sales'::regclass
     ORDER BY conname`,
  );
  console.log('constraints:', fks.rows);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
