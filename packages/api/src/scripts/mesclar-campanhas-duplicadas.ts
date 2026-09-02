/**
 * Junta campanhas que são a mesma coisa escrita de formas diferentes.
 *
 * `BBE-Margem 3X` e `BBE Margem 3X` nasceram como duas porque a importação
 * casava por nome literal. O casamento agora normaliza (`chaveDoNome`), então
 * o problema não se repete — mas as cópias que já entraram continuam lá,
 * dividindo o cronograma da mesma campanha em dois cards.
 *
 * ## Quem sobrevive
 *
 * A que tem MAIS fases. É a que alguém vinha usando; a outra costuma ser o
 * resto de uma importação que criou um card e parou ali.
 *
 * ## Não apaga nada do Google
 *
 * Escreve direto no banco, sem passar pela rota — e é de propósito. A rota de
 * exclusão apaga os eventos da agenda junto, o que aqui seria desastroso: os
 * eventos das duas cópias são os MESMOS eventos, e apagar a perdedora levaria
 * embora o cronograma da vencedora.
 *
 * Uso: node --import tsx src/scripts/mesclar-campanhas-duplicadas.ts [--aplicar]
 */
import "dotenv/config";
import pg from "pg";
import { chaveDoNome } from "../services/planner-sync.js";

interface Fase {
  id: string;
  name: string;
  start: string;
  end: string;
  googleEventId?: string;
}

interface Linha {
  id: string;
  name: string;
  phases: Fase[];
  google_calendar_id: string | null;
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes("--aplicar");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const { rows } = await c.query<Linha>(
    "select id, name, phases, google_calendar_id from planner_campaigns order by created_at",
  );

  const grupos = new Map<string, Linha[]>();
  for (const r of rows) {
    const k = chaveDoNome(r.name);
    grupos.set(k, [...(grupos.get(k) ?? []), r]);
  }

  const duplicados = [...grupos.values()].filter((g) => g.length > 1);
  console.log(`${rows.length} campanhas · ${duplicados.length} grupo(s) duplicado(s)\n`);

  for (const grupo of duplicados) {
    const ordenado = [...grupo].sort((a, b) => (b.phases?.length ?? 0) - (a.phases?.length ?? 0));
    const fica = ordenado[0]!;
    const somem = ordenado.slice(1);

    // Une as fases sem repetir. O `googleEventId` é a identidade quando existe
    // — duas cópias apontam para o MESMO evento, e mantê-las criaria duas
    // barras sobre o mesmo dia.
    const vistos = new Set(fica.phases.filter((f) => f.googleEventId).map((f) => f.googleEventId));
    const juntas = [...fica.phases];
    let trazidas = 0;
    for (const perdedora of somem) {
      for (const f of perdedora.phases ?? []) {
        if (f.googleEventId && vistos.has(f.googleEventId)) continue;
        if (f.googleEventId) vistos.add(f.googleEventId);
        juntas.push(f);
        trazidas++;
      }
    }

    console.log(`"${fica.name}" (${fica.phases.length} fases) absorve:`);
    for (const p of somem) console.log(`    "${p.name}" (${p.phases?.length ?? 0} fases)`);
    console.log(`  → ${juntas.length} fases (${trazidas} trazida(s))`);

    if (aplicar) {
      await c.query("update planner_campaigns set phases = $1, google_calendar_id = coalesce(google_calendar_id, $2), updated_at = now() where id = $3", [
        JSON.stringify(juntas),
        somem.find((p) => p.google_calendar_id)?.google_calendar_id ?? null,
        fica.id,
      ]);
      for (const p of somem) {
        await c.query("delete from planner_campaigns where id = $1", [p.id]);
      }
    }
  }

  if (!aplicar) console.log("\n(simulação — rode com --aplicar para gravar)");
  await c.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
