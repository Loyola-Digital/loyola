import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0035_meta_ad_creatives_cache.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0035 applied (meta_ad_creatives_cache)');

  const cols = await client.query(`
    SELECT column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_name = 'meta_ad_creatives_cache'
    ORDER BY ordinal_position
  `);
  console.log('Columns:', cols.rows);

  const idx = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'meta_ad_creatives_cache'
    ORDER BY indexname
  `);
  console.log('Indexes:', idx.rows);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
