// Fix: usuários provisionados com name = clerkId (ex.: "user_3BPDC0Ikpr...")
// ou "Unknown" pelo fallback antigo do auto-provisioning (auth.ts) / webhook.
// Busca o nome real no Clerk e corrige; fallback: parte local do email real.
// Idempotente e aditivo — só toca linhas cujo name está corrompido.
import "dotenv/config";
import { clerkClient } from "@clerk/fastify";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows } = await pool.query<{
    id: string;
    clerk_id: string;
    email: string;
    name: string;
  }>(
    `SELECT id, clerk_id, email, name FROM users
     WHERE name = clerk_id OR name = 'Unknown' OR name LIKE 'user\\_%'`,
  );
  console.log(`usuários com nome corrompido: ${rows.length}`);

  for (const row of rows) {
    let name = "";
    let avatarUrl: string | null = null;
    try {
      const u = await clerkClient.users.getUser(row.clerk_id);
      const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      name = full || u.username || "";
      avatarUrl = u.imageUrl ?? null;
    } catch (e) {
      console.warn(`Clerk falhou para ${row.clerk_id}:`, (e as Error).message);
    }
    if (!name) {
      const emailPrefix = row.email.endsWith("@placeholder.dev")
        ? ""
        : row.email.split("@")[0];
      name = emailPrefix || "Usuário";
    }

    await pool.query(
      `UPDATE users SET name = $1, avatar_url = COALESCE($2, avatar_url), updated_at = now() WHERE id = $3`,
      [name, avatarUrl, row.id],
    );
    console.log(`✅ ${row.email}: "${row.name}" → "${name}"`);
  }

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
