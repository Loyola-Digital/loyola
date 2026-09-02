/**
 * Descobre de qual agenda do Google cada campanha do Planner veio.
 *
 * ## Por que não dá em SQL
 *
 * A fase guarda `googleEventId`, mas não a agenda. Quando a integração era só
 * de leitura isso bastava — ninguém precisava saber para ONDE escrever. Agora
 * precisa, e a informação não está no banco: só o Google sabe de quem é cada
 * id.
 *
 * O script pergunta. Para cada campanha, pega o primeiro evento e procura em
 * qual das agendas conectadas ele existe. Achou, grava.
 *
 * ## Não chuta
 *
 * Campanha cujo evento não aparece em nenhuma agenda fica em branco. É melhor
 * que a tela peça a agenda uma vez do que mandar o cronograma da BBE para a
 * agenda da FZ — um evento na agenda errada aparece para o time errado, e
 * ninguém desconfia de um calendário que já estava lá.
 *
 * Uso: node --import tsx src/scripts/backfill-planner-agenda.ts [--aplicar]
 */
import "dotenv/config";
import pg from "pg";
import { agendaDoEvento, emailDaServiceAccount } from "../services/planner-google.js";

interface Fase {
  googleEventId?: string;
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes("--aplicar");
  if (!emailDaServiceAccount()) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY não configurado");

  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const agendas = await c.query<{ calendar_id: string; label: string }>(
    "select calendar_id, label from planner_google_calendars order by label",
  );
  const ids = agendas.rows.map((a) => a.calendar_id);
  const rotulo = new Map(agendas.rows.map((a) => [a.calendar_id, a.label]));
  console.log(`${ids.length} agenda(s) conectada(s)\n`);

  const campanhas = await c.query<{ id: string; name: string; phases: Fase[] }>(
    "select id, name, phases from planner_campaigns where google_calendar_id is null order by name",
  );
  console.log(`${campanhas.rows.length} campanha(s) sem agenda definida\n`);

  let achou = 0;
  let semEvento = 0;
  let semDono = 0;

  for (const camp of campanhas.rows) {
    const comId = (camp.phases ?? []).filter((f) => f.googleEventId);
    if (comId.length === 0) {
      // Campanha feita à mão aqui. Não tem agenda de origem — quem quiser
      // espelhá-la escolhe na tela.
      console.log(`—  ${camp.name}  (nenhuma fase veio do Google)`);
      semEvento++;
      continue;
    }

    const cal = await agendaDoEvento(ids, comId[0]!.googleEventId!);
    if (!cal) {
      console.log(`?  ${camp.name}  (evento não está em nenhuma agenda conectada)`);
      semDono++;
      continue;
    }

    console.log(`OK ${camp.name}  →  ${rotulo.get(cal) ?? cal}`);
    achou++;
    if (aplicar) {
      await c.query("update planner_campaigns set google_calendar_id = $1 where id = $2", [
        cal,
        camp.id,
      ]);
    }
  }

  console.log(
    `\nresolvidas: ${achou} · sem fase do Google: ${semEvento} · evento órfão: ${semDono}`,
  );
  if (!aplicar) console.log("\n(simulação — rode com --aplicar para gravar)");
  await c.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
