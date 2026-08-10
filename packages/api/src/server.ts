import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildServer } from "./app.js";

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

// Auto-migração no boot: sincroniza o schema.ts no banco via drizzle-kit push.
// O deploy (Coolify/nixpacks) roda `node dist/server.js` direto e IGNORA o
// CMD/start do repo — então rodar aqui garante que toda mudança de schema
// (tabelas novas, enums, colunas) seja aplicada em TODO deploy, sem SQL manual.
// Só roda em produção por padrão (AUTO_MIGRATE=true força; =false desliga).
function runMigrationsOnBoot(): void {
  const enabled =
    process.env.AUTO_MIGRATE === "true" ||
    (process.env.NODE_ENV === "production" && process.env.AUTO_MIGRATE !== "false");
  if (!enabled) return;
  if (!process.env.DATABASE_URL) {
    console.warn("[migrate] DATABASE_URL ausente — pulando auto-migração");
    return;
  }
  // dist/server.js -> raiz do pacote api (onde vivem drizzle.config.ts e src/).
  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  console.log("[migrate] drizzle-kit push --force ...");
  const res = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
    cwd: pkgRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (res.status === 0) {
    console.log("[migrate] schema sincronizado");
  } else {
    // Não derruba o server: sobe mesmo assim pra ficar diagnosticável (health).
    console.error(
      `[migrate] drizzle-kit push falhou (status=${res.status ?? "?"}) — subindo assim mesmo.`,
    );
  }
}

async function start() {
  runMigrationsOnBoot();

  const server = await buildServer();

  try {
    await server.listen({ port: PORT, host: HOST });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
