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
  // `--force` cobre statement com perda de dado, mas NÃO o diálogo "esta tabela
  // tem N linhas, quer truncar para criar a constraint?". Sem terminal o
  // drizzle-kit encerra ali mesmo — com status 0, o que fazia este bloco
  // anunciar "schema sincronizado" sem ter aplicado NADA, e tabela nova do
  // schema não chegava ao banco (achado em 23/11/2026 no log do contêiner).
  // Enter escolhe a opção já destacada, que é a segura: "adicionar a constraint
  // SEM truncar" — e se ela falhar por dado duplicado, o erro aparece.
  const res = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
    cwd: pkgRoot,
    input: "\n".repeat(20),
    stdio: ["pipe", "pipe", "inherit"],
    encoding: "utf8",
    env: process.env,
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stdout?.includes("You're about to")) {
    // O Enter acima NÃO resolve: o diálogo lê o teclado em modo cru e, sem
    // terminal, o drizzle-kit encerra ali — com status 0. Então este aviso é o
    // único sinal de que o schema NÃO foi aplicado (medido em 23/11/2026).
    console.warn(
      "[migrate] ATENÇÃO: drizzle-kit abriu um diálogo e PAROU — o schema NÃO foi " +
        "aplicado. Alinhe o schema.ts ao banco (nome de constraint, unique vs " +
        "uniqueIndex) e, até lá, aplique a migration pelo runner `migrate-0NNN.ts`.",
    );
  }
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
