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

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0048_switchy_link_generator.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0048 applied');

  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('project_switchy_settings', 'switchy_channel_presets', 'switchy_shortened_links')
    ORDER BY table_name
  `);
  console.log('Tabelas:', tables.rows.map((r) => r.table_name));

  const indexes = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'idx_project_switchy_settings_project',
        'idx_switchy_presets_project',
        'idx_switchy_links_project',
        'idx_switchy_links_created_at'
      )
    ORDER BY indexname
  `);
  console.log('Índices:', indexes.rows.map((r) => r.indexname));

  const fks = await client.query(`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_type = 'FOREIGN KEY'
      AND table_name IN ('project_switchy_settings', 'switchy_channel_presets', 'switchy_shortened_links')
    ORDER BY constraint_name
  `);
  console.log('FKs:', fks.rows.map((r) => r.constraint_name));
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
