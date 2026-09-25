// Story 47.16 (AC9) — registra em `naming_ads` os 6 anúncios do dg que já
// estão no ar no Meta (`adv01_ia_dg_perpetuo_h01_b01_09-2026` … `adv06_…`),
// com o nome EXATO do Meta (v2, `perpetuo` sem número, sem `--`).
//
// Uso (planeja, não grava):  pnpm --filter @loyola-x/api exec tsx src/scripts/registrar-anuncios-no-ar-do-dg.ts
// Uso (grava):               pnpm --filter @loyola-x/api exec tsx src/scripts/registrar-anuncios-no-ar-do-dg.ts --aplicar
// Prod:                      node dist/scripts/registrar-anuncios-no-ar-do-dg.js [--aplicar]
//
// ⚠️ Roda em produção UMA vez, com autorização do Danilo, DEPOIS de:
//   1. a migration 0157 aplicada (o script confere `information_schema` e para se não estiver);
//   2. o deploy da API da 47.16.
// E ANTES de qualquer cadastro de anúncio do dg no gerador (PO-12: entre o
// deploy e este script, o gerador sugere `01` para o dg — número já no ar).
//
// Idempotente: segunda rodada grava 0. NN 1–6 do dg ocupado por OUTRO nome =
// para sem gravar nada (PO-05c). Tudo numa transação. Com `--aplicar`, termina
// com a prova do PO-05b: SELECT dos 6 `name` byte a byte — saída ≠ 0 se divergir.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import * as schema from "../db/schema.js";
import { criarRepositorio } from "../services/nomenclatura/repositorio.js";
import { ANUNCIOS_DO_DG_NO_AR, ESCOPO_DOS_ANUNCIOS_NO_AR, EXPERT_DOS_ANUNCIOS_NO_AR, modoDoRegistro, provarRegistro, registrarAnunciosNoAr, type LinhaDeProva } from "../services/nomenclatura/anuncios-no-ar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main(): Promise<number> {
  const { aplicar } = modoDoRegistro(process.argv);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  try {
    const coluna = await pool.query<{ is_nullable: string }>(
      "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'naming_ads' AND column_name = 'launch_seq'",
    );
    if (coluna.rows[0]?.is_nullable !== "YES") {
      console.error(`naming_ads.launch_seq ainda é NOT NULL (is_nullable = ${coluna.rows[0]?.is_nullable ?? "?"}) — aplique a migration 0157 antes.`);
      return 1;
    }

    const r = await db.transaction(async (tx) => registrarAnunciosNoAr(criarRepositorio(tx), { aplicar }));
    console.log(`${aplicar ? "GRAVADO" : "PLANO (nada gravado — use --aplicar)"} · inserir: ${r.plano.inserir.length} · já registrados: ${r.plano.jaRegistrados.length}`);
    for (const a of r.plano.inserir) console.log(`  + ${a.name}`);
    for (const a of r.plano.jaRegistrados) console.log(`  = ${a.name}`);
    if (!aplicar) return 0;

    // PO-05b — a prova: os 6 `name` byte a byte, NN 1–6, launch_seq NULL, origem ia, hook/body do dg.
    // Story 47.18 (PO-05): NO ESCOPO dos 6 (dg, adv, perpetuo) — o NN reinicia por lançamento e tipo, e um
    // `ad01` num `pg` do dg também tem NN 1. O `launch_seq` fica fora do WHERE: um `perpetuo` com número tem de
    // aparecer na prova como divergência, não sumir dela.
    const linhas = await pool.query<{ creative_type: string; creative_seq: number; name: string; structure: string; launch_type: string; launch_seq: number | null; origin: string | null; hook: string | null; body: string | null }>(
      `SELECT a.creative_type, a.creative_seq, a.name, a.structure, a.launch_type, a.launch_seq, a.origin, h.code AS hook, b.code AS body
         FROM naming_ads a
         JOIN naming_experts e ON e.id = a.expert_id
    LEFT JOIN naming_ad_parts h ON h.id = a.hook_id AND h.expert_id = a.expert_id AND h.type = 'hook'
    LEFT JOIN naming_ad_parts b ON b.id = a.body_id AND b.expert_id = a.expert_id AND b.type = 'body'
        WHERE e.code = $1 AND a.creative_seq = ANY($2::int[])
          AND a.creative_type = $3 AND a.launch_type = $4
     ORDER BY a.creative_seq`,
      [EXPERT_DOS_ANUNCIOS_NO_AR, ANUNCIOS_DO_DG_NO_AR.map((a) => a.creativeSeq), ESCOPO_DOS_ANUNCIOS_NO_AR.creativeType, ESCOPO_DOS_ANUNCIOS_NO_AR.launchType],
    );
    const prova: LinhaDeProva[] = linhas.rows.map((l) => ({ creativeType: l.creative_type, creativeSeq: l.creative_seq, name: l.name, structure: l.structure, launchType: l.launch_type, launchSeq: l.launch_seq, origin: l.origin, hookCode: l.hook, bodyCode: l.body }));
    for (const l of prova) console.log(`  ${String(l.creativeSeq).padStart(2, "0")} ${JSON.stringify(l.name)} launch_seq=${l.launchSeq} origin=${l.origin} ${l.hookCode}/${l.bodyCode}`);
    const divergencias = provarRegistro(prova);
    if (divergencias.length) {
      console.error(`PROVA FALHOU:\n  ${divergencias.join("\n  ")}`);
      return 1;
    }
    console.log(`PROVA OK: ${prova.length} linhas, nomes byte a byte iguais aos do Meta.`);
    return 0;
  } finally {
    await pool.end();
  }
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
