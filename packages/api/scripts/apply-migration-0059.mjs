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

const sqlPath = path.resolve(__dirname, '../src/db/migrations/0059_memberkit_integration.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Migration 0059 applied');

  const newCols = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'manual_sales'
      AND column_name IN ('valor_recebido', 'negociacao', 'memberkit_status', 'memberkit_synced_at', 'memberkit_user_id')
    ORDER BY column_name
  `);
  console.log('manual_sales novas colunas:', newCols.rows.map((r) => r.column_name));

  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('memberkit_connections', 'stage_memberkit_enrollment')
    ORDER BY table_name
  `);
  console.log('Tabelas criadas:', tables.rows.map((r) => r.table_name));

  const indexes = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN ('idx_memberkit_connections_project', 'idx_stage_memberkit_enrollment_stage')
    ORDER BY indexname
  `);
  console.log('Índices:', indexes.rows.map((r) => r.indexname));

  const fks = await client.query(`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_type = 'FOREIGN KEY'
      AND table_name IN ('memberkit_connections', 'stage_memberkit_enrollment')
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
