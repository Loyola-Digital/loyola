import { readFileSync } from "node:fs";
import { Pool } from "pg";
const env = readFileSync("/Users/vital/Documents/loyola/packages/api/.env", "utf-8");
const url = env.split("\n").find((l) => l.startsWith("DATABASE_URL=")).slice(13).trim().replace(/^["']|["']$/g, "");
const pool = new Pool({ connectionString: url });
const r = await pool.query(`
  SELECT f.id, f.name, f.type, f.archived_at, f.archived_by, f.sort_order, f.created_at, pr.name AS projeto
  FROM funnels f JOIN projects pr ON pr.id=f.project_id
  WHERE pr.name ILIKE '%lyrio%' ORDER BY f.created_at`);
console.log("FUNIS DO PROJETO LYRIO:");
for (const x of r.rows) {
  console.log(`  ${x.name} | type=${x.type} | ARCHIVED_AT=${x.archived_at ? x.archived_at.toISOString() : "NULL (ativo)"} | por=${x.archived_by ?? "—"} | criado ${x.created_at.toISOString().slice(0,16)} | id=${x.id}`);
}
const u = await pool.query(`SELECT id, name, email FROM users WHERE id = ANY($1::uuid[])`, [r.rows.map(x=>x.archived_by).filter(Boolean)]);
if (u.rowCount) { console.log("\nquem arquivou:"); for (const x of u.rows) console.log(`  ${x.name} <${x.email}>`); }
await pool.end();
