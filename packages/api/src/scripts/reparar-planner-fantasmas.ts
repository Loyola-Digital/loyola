/**
 * Reparo das campanhas fantasmas do Planner (21/09/2026).
 *
 * A importação antiga cortava o título no primeiro hífen e criou campanhas
 * como "DG REN2" presas aos MESMOS eventos de "DG REN2 - Renovação CPDF". A
 * correção (#897) impede novas; este script desfaz as que ficaram:
 *
 * 1. Religa cada fase da campanha VERDADEIRA ao evento certo (o que tem o nome
 *    dela no título), trocando ids de outra campanha, de outra agenda ou de
 *    evento apagado.
 * 2. Evento apagado que é da própria campanha é RESTAURADO (mesmo evento, com
 *    o que o time tinha posto nele); sem evento nenhum, cria um.
 * 3. Apaga do banco a fantasma cujas fases todas têm dona — os eventos ficam,
 *    são da verdadeira.
 * 4. Evento solto que é cópia de uma fase já ligada (mesmo nome e início) é
 *    apagado no Google: é a duplicata que o time vê na agenda.
 *
 * Sem `--aplicar`, só mostra o plano. Fantasma com evento sem dona (campanha
 * renomeada ou excluída) NÃO é tocada: o relatório lista, e excluir o card
 * pela tela agora é seguro (#897 não apaga evento de outra campanha).
 *
 *   npx tsx src/scripts/reparar-planner-fantasmas.ts [--aplicar]
 */

import "dotenv/config";
import pg from "pg";
import { createSign } from "node:crypto";
import { faseNoTitulo } from "../services/planner-sync.js";
import { chaveDoNome } from "../utils/chave-de-nome.js";
import { apagarEvento, atualizarEvento, criarEvento, tituloParaGoogle } from "../services/planner-google.js";
import type { FaseDoPlanner } from "../services/planner.js";

const APLICAR = process.argv.includes("--aplicar");

interface Evento { id: string; cal: string; status: string; titulo: string; inicio: string | null; criador: string | null }
interface Campanha { id: string; name: string; cal: string | null; phases: FaseDoPlanner[]; porImport: boolean }

async function token(): Promise<string> {
  const k = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
  const agora = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const b = Buffer.from(JSON.stringify({ iss: k.client_email, scope: "https://www.googleapis.com/auth/calendar", aud: k.token_uri, iat: agora, exp: agora + 3600 })).toString("base64url");
  const s = createSign("RSA-SHA256");
  s.update(`${h}.${b}`);
  const r = await fetch(k.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${b}.${s.sign(k.private_key, "base64url")}` }),
  });
  return ((await r.json()) as { access_token: string }).access_token;
}

async function main() {
  const t = await token();
  const email = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!).client_email as string;
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const campanhas: Campanha[] = (
    await db.query(`select id, name, google_calendar_id cal, phases, created_by is null por_import from planner_campaigns`)
  ).rows.map((r) => ({ id: r.id, name: r.name, cal: r.cal, phases: r.phases ?? [], porImport: r.por_import }));

  const eventos = new Map<string, Evento>();
  for (const cal of new Set(campanhas.map((c) => c.cal).filter(Boolean) as string[])) {
    let pageToken = "";
    do {
      const q = new URLSearchParams({ showDeleted: "true", singleEvents: "true", maxResults: "2500", timeMin: "2025-01-01T00:00:00Z", ...(pageToken ? { pageToken } : {}) });
      const j = (await (await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events?${q}`, { headers: { Authorization: `Bearer ${t}` } })).json()) as {
        items?: { id: string; status: string; summary?: string; start?: { date?: string; dateTime?: string }; creator?: { email?: string } }[];
        nextPageToken?: string;
      };
      for (const e of j.items ?? []) {
        eventos.set(e.id, { id: e.id, cal, status: e.status, titulo: e.summary ?? "", inicio: e.start?.date ?? e.start?.dateTime?.slice(0, 10) ?? null, criador: e.creator?.email ?? null });
      }
      pageToken = j.nextPageToken ?? "";
    } while (pageToken);
  }

  /** A campanha cujo nome INTEIRO abre o título (a mais longa). */
  const donaPeloTitulo = (e: Evento, fora?: string) =>
    campanhas
      .filter((c) => c.id !== fora && c.cal === e.cal && faseNoTitulo(e.titulo, c.name) !== null)
      .sort((a, b) => b.name.length - a.name.length)[0] ?? null;

  const k = (nome: string, inicio: string | null) => `${chaveDoNome(nome)}|${inicio ?? ""}`;
  const plano: string[] = [];
  const religar: { campanha: Campanha; faseId: string; novo: string; motivo: string }[] = [];
  const excluirDoBanco: Campanha[] = [];
  const restaurarOuCriar: { campanha: Campanha; fase: FaseDoPlanner; restaurar: boolean }[] = [];

  // ---- 1 + 3. fantasmas: a fase dela aponta para evento de uma verdadeira ----
  const fantasmas = campanhas.filter((c) =>
    c.porImport &&
    c.phases.some((f) => {
      const e = f.googleEventId ? eventos.get(f.googleEventId) : undefined;
      return e && donaPeloTitulo(e)?.id !== c.id;
    }),
  );
  for (const p of fantasmas) {
    let todasComDona = true;
    for (const f of p.phases) {
      const e = f.googleEventId ? eventos.get(f.googleEventId) : undefined;
      const dona = e ? donaPeloTitulo(e, p.id) : null;
      if (!e || !dona) {
        todasComDona = false;
        plano.push(`  ⚠ ${p.name} / ${f.name}: evento "${e?.titulo ?? "?"}" sem campanha dona — fantasma fica (excluir pela tela é seguro)`);
        continue;
      }
      const nomeDaFase = faseNoTitulo(e.titulo, dona.name)!;
      const par =
        dona.phases.find((x) => k(x.name, x.start) === k(nomeDaFase, e.inicio)) ??
        (dona.phases.filter((x) => chaveDoNome(x.name) === chaveDoNome(nomeDaFase)).length === 1
          ? dona.phases.find((x) => chaveDoNome(x.name) === chaveDoNome(nomeDaFase))
          : undefined);
      if (!par) {
        todasComDona = false;
        plano.push(`  ⚠ ${p.name} / ${f.name}: "${dona.name}" não tem fase "${nomeDaFase}" — fantasma fica`);
        continue;
      }
      if (par.googleEventId === e.id) continue;
      const atual = par.googleEventId ? eventos.get(par.googleEventId) : undefined;
      const atualBom = atual && atual.status !== "cancelled" && atual.cal === dona.cal && donaPeloTitulo(atual)?.id === dona.id;
      if (!atualBom && !religar.some((r) => r.campanha.id === dona.id && r.faseId === par.id)) {
        religar.push({ campanha: dona, faseId: par.id, novo: e.id, motivo: `era ${atual ? `"${atual.titulo}" (${atual.status}${atual.cal !== dona.cal ? ", outra agenda" : ""})` : "sem evento"}` });
      }
    }
    if (todasComDona) excluirDoBanco.push(p);
  }

  // Aplica os religamentos em memória, para os passos seguintes enxergarem.
  for (const r of religar) {
    const f = r.campanha.phases.find((x) => x.id === r.faseId)!;
    f.googleEventId = r.novo;
    delete f.googleSyncPendente;
  }
  const vivas = campanhas.filter((c) => !excluirDoBanco.includes(c));

  // ---- 2. verdadeiras com vínculo ainda ruim ----
  const usados = new Map<string, number>();
  for (const c of vivas) for (const f of c.phases) if (f.googleEventId) usados.set(f.googleEventId, (usados.get(f.googleEventId) ?? 0) + 1);
  for (const c of vivas) {
    if (!c.cal) continue;
    for (const f of c.phases) {
      if (!f.start || !f.googleEventId) continue;
      const e = eventos.get(f.googleEventId);
      const deOutra = e ? donaPeloTitulo(e)?.id !== c.id : true;
      if (!e) {
        // Sumiu sem rastro: alguém tirou do Google. Recriar desfaria a decisão
        // de alguém — fica no relatório.
        plano.push(`  ⚠ ${c.name} / ${f.name} ${f.start}: o evento não existe mais no Google — não recriado`);
      } else if (e.cal === c.cal && e.status === "cancelled" && !deOutra) {
        restaurarOuCriar.push({ campanha: c, fase: f, restaurar: true });
      } else if ((usados.get(f.googleEventId) ?? 0) > 1 && deOutra) {
        // Divide o evento com OUTRA campanha, que é a dona: ganha o seu.
        restaurarOuCriar.push({ campanha: c, fase: f, restaurar: false });
      } else if (e.cal !== c.cal) {
        // Só dela, mas em outra agenda: alguém moveu no Google. Criar outro
        // na agenda da campanha deixaria o mesmo evento nas duas.
        plano.push(`  ⚠ ${c.name} / ${f.name} ${f.start}: o evento está em outra agenda (movido no Google) — não duplicado`);
      }
    }
  }

  // ---- 4. cópias soltas no Google ----
  const ligados = new Set(vivas.flatMap((c) => c.phases.map((f) => f.googleEventId).filter(Boolean) as string[]));
  const chavesLigadas = new Set<string>();
  for (const c of vivas) for (const f of c.phases) if (f.googleEventId && c.cal) chavesLigadas.add(`${c.id}|${k(f.name, f.start)}`);
  const copias = [...eventos.values()].filter((e) => {
    if (e.status === "cancelled" || ligados.has(e.id) || e.criador !== email) return false;
    const dona = donaPeloTitulo(e);
    return dona && chavesLigadas.has(`${dona.id}|${k(faseNoTitulo(e.titulo, dona.name)!, e.inicio)}`);
  });

  // ---- relatório ----
  console.log(APLICAR ? "=== APLICANDO ===" : "=== SIMULAÇÃO (nada gravado) — rode com --aplicar ===");
  console.log(`\nReligar ${religar.length} fase(s) ao evento certo:`);
  for (const r of religar) console.log(`  ${r.campanha.name} / ${r.campanha.phases.find((f) => f.id === r.faseId)!.name} → ${eventos.get(r.novo)!.titulo} (${r.motivo})`);
  console.log(`\nRestaurar/criar ${restaurarOuCriar.length} evento(s):`);
  for (const x of restaurarOuCriar) console.log(`  ${x.restaurar ? "restaurar" : "criar    "} ${x.campanha.name} / ${x.fase.name} ${x.fase.start}`);
  console.log(`\nExcluir do banco ${excluirDoBanco.length} fantasma(s) (eventos ficam, são da verdadeira):`);
  for (const p of excluirDoBanco) console.log(`  ${p.name} (${p.phases.length} fases)`);
  console.log(`\nApagar ${copias.length} cópia(s) solta(s) no Google:`);
  for (const e of copias) console.log(`  "${e.titulo}" ${e.inicio}`);
  if (plano.length) console.log(`\nFica como está:\n${plano.join("\n")}`);

  if (!APLICAR) return db.end();

  // ---- execução ----
  const tocadas = new Set<Campanha>(religar.map((r) => r.campanha));
  for (const x of restaurarOuCriar) {
    const dados = { titulo: tituloParaGoogle(x.campanha.name, x.fase.name), inicio: x.fase.start, fim: x.fase.end };
    x.fase.googleEventId = x.restaurar
      ? await atualizarEvento(x.campanha.cal!, x.fase.googleEventId!, dados) // PATCH com status confirmed traz de volta
      : await criarEvento(x.campanha.cal!, dados);
    delete x.fase.googleSyncPendente;
    tocadas.add(x.campanha);
  }
  for (const c of tocadas) {
    await db.query(`update planner_campaigns set phases = $1, updated_at = now() where id = $2`, [JSON.stringify(c.phases), c.id]);
  }
  for (const p of excluirDoBanco) await db.query(`delete from planner_campaigns where id = $1`, [p.id]);
  for (const e of copias) await apagarEvento(e.cal, e.id);
  console.log(`\nfeito: ${tocadas.size} campanhas gravadas, ${excluirDoBanco.length} fantasmas removidas, ${copias.length} cópias apagadas`);
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
