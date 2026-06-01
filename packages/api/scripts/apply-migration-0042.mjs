import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0042_funnels_sort_order.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0042 applied (funnels.sort_order)');

  const col = await client.query(
    `SELECT column_name, data_type, column_default, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'funnels' AND column_name = 'sort_order'`,
  );
  console.log('\nsort_order column:', col.rows);

  const sample = await client.query(
    `SELECT id, name, type, sort_order, created_at
     FROM funnels
     ORDER BY project_id, type, sort_order
     LIMIT 20`,
  );
  console.log('\nbackfill sample:', sample.rows);

  const idx = await client.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'funnels' ORDER BY indexname`,
  );
  console.log('\nindexes:', idx.rows);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
