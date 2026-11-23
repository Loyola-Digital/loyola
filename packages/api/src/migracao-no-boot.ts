/**
 * O que roda no banco quando a API sobe.
 *
 * ## Por que o `drizzle-kit push` saiu do boot
 *
 * O push transforma o banco no espelho do `schema.ts`: **apaga o que o banco
 * tem e o arquivo não declara.** E o `schema.ts` nunca descreveu tudo — CHECKs
 * de CPF/CNPJ, de faixas do simulador de plano, uniques parciais ("no máximo uma
 * conexão global do SendFlow", "um token de compartilhamento por mapa") e
 * índices parciais nasceram em migrations SQL ao longo do ano.
 *
 * Isso ficou escondido porque o push vivia travado num diálogo interativo e não
 * aplicava nada (#1080→#1083). Em 23/11/2026, destravado, ele rodou de verdade:
 * **242 DROP CONSTRAINT, 27 DROP INDEX** — 26 CHECKs, 1 UNIQUE e 12 índices
 * ficaram pelo caminho (restaurados pela migration 0185). Nenhum dado se perdeu,
 * mas as garantias de integridade sim, e em silêncio: o deploy terminou "ok".
 *
 * Enquanto o `schema.ts` não descrever 100% do banco, o push é uma arma apontada
 * para a produção. O fluxo real do projeto já é outro — toda migration tem o seu
 * runner (`migrate-0NNN.ts`), e é assim que 0181, 0182, 0183, 0184 e 0185
 * entraram. Então o boot agora só CONFERE, e quem aplica é o runner.
 *
 * Para ligar o push de novo (local, ou depois de alinhar o schema por completo):
 * `DRIZZLE_PUSH=eu-sei-o-que-faco`. O nome é esse de propósito — `AUTO_MIGRATE=true`
 * NÃO serve mais, porque essa variável já está ligada no Coolify desde sempre e
 * respeitá-la faria o push rodar no primeiro deploy, apagando as 39 garantias de
 * novo (foi o que aconteceu no deploy do #1084). Uma chave de escape que já está
 * virada não é chave de escape.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { getTableConfig, PgTable, type TableConfig } from "drizzle-orm/pg-core";
import * as schema from "./db/schema.js";

/** Raiz do pacote api (de `dist/`), onde vivem o drizzle.config.ts e o src/. */
function raizDoPacote(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * Tabelas que o código espera e o banco não tem.
 *
 * É a checagem que faltava: em 23/11/2026 a tabela `sale_push_sent` foi mergeada
 * e deployada, o push não a criou, e o único sinal foi o agendador quebrando de
 * 10 em 10 minutos com "relation does not exist". Aqui o aviso sai no boot, com
 * o nome da tabela e o que fazer.
 */
export async function conferirTabelas(databaseUrl: string): Promise<string[]> {
  // Laço com cast, e não `filter` com type predicate: o `schema` exporta enums
  // junto das tabelas, e o `instanceof` não estreita essa união para o tsc.
  const doCodigo: string[] = [];
  for (const exportado of Object.values(schema)) {
    if (exportado instanceof PgTable) {
      doCodigo.push(getTableConfig(exportado as PgTable<TableConfig>).name);
    }
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public';`,
    );
    const noBanco = new Set(rows.map((r) => r.tablename));
    return doCodigo.filter((t) => !noBanco.has(t)).sort();
  } finally {
    await pool.end();
  }
}

/** Liga o push só com a variável nova e explícita (ver o topo do arquivo). */
function pushPedido(): boolean {
  if (process.env.DRIZZLE_PUSH === "eu-sei-o-que-faco") return true;
  if (process.env.AUTO_MIGRATE === "true") {
    console.warn(
      "[migrate] AUTO_MIGRATE=true está no ambiente, mas NÃO liga mais o " +
        "`drizzle-kit push`: ele apaga do banco o que o schema.ts não declara. " +
        "Migration se aplica pelo runner `migrate-0NNN.ts`. Para o push mesmo " +
        "assim: DRIZZLE_PUSH=eu-sei-o-que-faco.",
    );
  }
  return false;
}

/** O `drizzle-kit push`, só quando pedido de propósito. */
function rodarPush(): void {
  console.warn(
    "[migrate] DRIZZLE_PUSH ligado: rodando `drizzle-kit push --force`. Ele APAGA " +
      "do banco o que o schema.ts não declara (CHECKs, uniques e índices parciais " +
      "criados por migration). Ver o comentário no topo de migracao-no-boot.ts.",
  );
  const res = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
    cwd: raizDoPacote(),
    // Sem terminal o diálogo "quer truncar?" lê EOF e o drizzle-kit encerra com
    // status 0 — por isso o status não serve de prova, e o que vale é o texto.
    stdio: ["pipe", "pipe", "inherit"],
    encoding: "utf8",
    env: process.env,
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stdout?.includes("You're about to")) {
    console.error(
      "[migrate] drizzle-kit abriu um diálogo e PAROU — o schema NÃO foi aplicado. " +
        "Rode `node scripts/conferir-unique.mjs` para ver a divergência.",
    );
    return;
  }
  console.log(
    res.status === 0
      ? "[migrate] push concluído"
      : `[migrate] push falhou (status=${res.status ?? "?"}) — subindo assim mesmo.`,
  );
}

/**
 * Roda antes do servidor atender. Nunca derruba o processo: a API sobe mesmo com
 * o banco fora de dia, para que o health e os logs fiquem acessíveis.
 */
export async function migracaoNoBoot(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] DATABASE_URL ausente — nada a conferir");
    return;
  }

  if (pushPedido()) rodarPush();

  try {
    const faltando = await conferirTabelas(url);
    if (faltando.length === 0) {
      console.log("[migrate] todas as tabelas do schema existem no banco");
      return;
    }
    console.error(
      `[migrate] ${faltando.length} tabela(s) do schema NÃO existem no banco: ` +
        `${faltando.join(", ")}. Aplique a migration com o runner ` +
        `(\`pnpm --filter @loyola-x/api exec tsx migrate-0NNN.ts\`) — sem isso, o que ` +
        `usa essas tabelas vai falhar em tempo de execução.`,
    );
  } catch (err) {
    console.error("[migrate] não deu para conferir as tabelas:", err);
  }
}
