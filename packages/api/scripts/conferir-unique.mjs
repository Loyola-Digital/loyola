/**
 * Confere as regras de unicidade do schema.ts contra o banco.
 *
 *   pnpm --filter @loyola-x/api build   # precisa do dist
 *   node packages/api/scripts/conferir-unique.mjs
 *
 * ## Por que isto existe
 *
 * O boot roda `drizzle-kit push`. Quando uma regra de unicidade existe no banco
 * com OUTRO nome, ou como índice onde o schema a declara como constraint, o push
 * tenta criá-la e — se a tabela tiver linhas — abre o diálogo "quer truncar?".
 * Sem terminal ele encerra ali **com status 0**: nada do schema é aplicado, e nem
 * a tabela nova de outra feature chega ao banco. Em 23/11/2026 isso custou três
 * deploys para descobrir três divergências, uma por vez, porque o push para na
 * primeira. Este script mostra todas de uma vez.
 *
 * ## Por que lê o `dist`
 *
 * A fonte de verdade do lado do código é o `getTableConfig` do drizzle, não o
 * texto do arquivo: `.unique()` numa coluna não aparece em `uniqueConstraints`
 * (fica na coluna), e regex sobre o schema.ts erra nas tabelas de indentação
 * curta — foi assim que `people_records` passou batido. O pacote é CommonJS, e
 * importar `src/db/schema.ts` por ESM devolve um objeto vazio sem avisar; daí
 * `require` no compilado, e a checagem de que veio mais de uma tabela.
 *
 * ## O que ele diz, e o que fazer
 *
 * - **já existe sobre a mesma coluna, com outro nome** → nomeie no schema com o
 *   nome do banco: `.unique("<tabela>_<coluna>_key")`. NÃO crie outra: duas
 *   constraints com a mesma regra custam escrita a cada insert.
 * - **existe como ÍNDICE / existe como CONSTRAINT** → troque `unique(...)` por
 *   `uniqueIndex(...)`, ou o contrário.
 * - **não existe de forma alguma** → aí sim é migration, depois de conferir
 *   duplicata (com duplicata, resolva o dado; nunca truncar).
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

const raizDoPacote = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const mod = require(path.join(raizDoPacote, "dist/db/schema.js"));
const tabelas = Object.entries(mod).filter(([, v]) => v instanceof PgTable);
if (tabelas.length < 2) {
  console.error("Schema vazio — rode `pnpm --filter @loyola-x/api build` primeiro.");
  process.exit(1);
}

const env = readFileSync(path.join(raizDoPacote, ".env"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
if (!url) {
  console.error("DATABASE_URL não encontrada no .env do pacote api.");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url });
await c.connect();
// Nome -> definição, para saber se a regra existe com outro nome.
const constraints = (
  await c.query(
    `select conname, conrelid::regclass::text tabela, pg_get_constraintdef(oid) def
       from pg_constraint where contype = 'u'`,
  )
).rows;
const indices = (
  await c.query(
    `select indexname, tablename, indexdef from pg_indexes
       where indexdef like 'CREATE UNIQUE INDEX%' and indexname not like '%_pkey'`,
  )
).rows;
const linhas = new Map(
  (await c.query(`select relname, n_live_tup from pg_stat_user_tables`)).rows.map((r) => [
    r.relname,
    r.n_live_tup,
  ]),
);
await c.end();

const nomesDeConstraint = new Set(constraints.map((r) => r.conname));
const nomesDeIndice = new Set(indices.map((r) => r.indexname));

/** A mesma regra já existe nesta tabela sobre estas colunas, com outro nome? */
function mesmaRegra(tabela, colunas) {
  const alvo = `(${colunas.join(", ")})`;
  const achados = [];
  for (const r of constraints) {
    if (r.tabela === tabela && r.def.replace("UNIQUE ", "") === alvo) {
      achados.push(`constraint ${r.conname}`);
    }
  }
  for (const r of indices) {
    if (r.tablename === tabela && r.indexdef.endsWith(alvo)) achados.push(`índice ${r.indexname}`);
  }
  return achados;
}

let divergencias = 0;
for (const [, tabela] of tabelas) {
  const cfg = getTableConfig(tabela);
  const relatar = (tipo, nome, colunas) => {
    const comoIndice = nomesDeIndice.has(nome);
    const comoConstraint = nomesDeConstraint.has(nome);
    if ((tipo === "uniqueIndex" && comoIndice) || (tipo !== "uniqueIndex" && comoConstraint)) return;
    divergencias += 1;
    const outros = mesmaRegra(cfg.name, colunas).filter((o) => !o.endsWith(nome));
    const estado = comoIndice
      ? "existe como ÍNDICE -> use uniqueIndex()"
      : comoConstraint
        ? "existe como CONSTRAINT -> use unique()"
        : outros.length
          ? `já existe sobre a mesma coluna, com outro nome: ${outros.join(", ")} -> nomeie no schema`
          : "não existe de forma alguma -> migration (confira duplicata antes)";
    console.log(
      `${tipo.padEnd(11)} ${cfg.name}(${colunas.join(", ")}) como "${nome}": ${estado} ` +
        `[${linhas.get(cfg.name) ?? "?"} linhas]`,
    );
  };

  for (const col of cfg.columns) {
    if (col.isUnique) relatar("coluna", col.uniqueName, [col.name]);
  }
  for (const u of cfg.uniqueConstraints) {
    relatar(
      "unique",
      u.name,
      u.columns.map((x) => x.name),
    );
  }
  for (const i of cfg.indexes) {
    if (i.config?.unique && i.config?.name) {
      relatar(
        "uniqueIndex",
        i.config.name,
        (i.config.columns ?? []).map((x) => x.name ?? String(x)),
      );
    }
  }
}

console.log(
  divergencias === 0
    ? `\n✓ ${tabelas.length} tabelas conferidas, nenhuma divergência — o push do boot não vai parar.`
    : `\n${divergencias} divergência(s): cada uma trava o push do boot e com ele TODO o schema.`,
);
process.exitCode = divergencias === 0 ? 0 : 1;
