/**
 * Prévia da importação de um canal do ClickUp, sem gravar nada.
 *
 * Responde "o que vai entrar?" antes de centenas de inserts e de megabytes de
 * upload — e mostra os títulos, que é onde o parsing erra sem avisar. Foi assim
 * que apareceram o token vazando numa anotação e o aviso do próprio Swipe Files
 * virando referência.
 *
 * Uso:
 *   node --import tsx src/scripts/previa-import-clickup.ts <channelId> [amostra]
 *   node --import tsx src/scripts/previa-import-clickup.ts --arquivo <msgs.json>
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import {
  planejarImportacao,
  type MensagemDoClickUp,
} from "../services/swipe-import-clickup.js";

const OK_NO_BUCKET = new Set(["image", "video", "pdf"]);

async function doClickUp(channelId: string): Promise<MensagemDoClickUp[]> {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("CLICKUP_API_TOKEN não configurado no .env");

  async function v3<T>(caminho: string): Promise<T> {
    const r = await fetch(`https://api.clickup.com/api/v3${caminho}`, {
      headers: { Authorization: token!, "Content-Type": "application/json" },
    });
    if (!r.ok) throw new Error(`ClickUp ${r.status} em ${caminho}`);
    return r.json() as Promise<T>;
  }

  const times = await v3<{ teams?: { id: string }[] }>("/../v2/team").catch(() => null);
  const teamId =
    times?.teams?.[0]?.id ??
    (await (async () => {
      const r = await fetch("https://api.clickup.com/api/v2/team", {
        headers: { Authorization: token! },
      });
      const j = (await r.json()) as { teams?: { id: string }[] };
      const id = j.teams?.[0]?.id;
      if (!id) throw new Error("nenhum workspace acessível com este token");
      return id;
    })());

  const msgs: MensagemDoClickUp[] = [];
  let cursor: string | undefined;
  for (let p = 0; p < 60; p++) {
    const qs = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : "?limit=100";
    const j = await v3<{ data?: MensagemDoClickUp[]; next_cursor?: string | null }>(
      `/workspaces/${teamId}/chat/channels/${encodeURIComponent(channelId)}/messages${qs}`,
    );
    const lote = j.data ?? [];
    if (!lote.length) break;
    msgs.push(...lote);
    if (!j.next_cursor) break;
    cursor = j.next_cursor;
  }

  // A thread costuma ter o contexto ("é a parte 2/5"), e sem ela a prévia não
  // reflete o que a importação de verdade vai ver.
  for (const m of msgs) {
    const n = (m as { replies_count?: number }).replies_count;
    if (!n) continue;
    try {
      const j = await v3<{ data?: { content?: string }[] }>(
        `/workspaces/${teamId}/chat/messages/${encodeURIComponent(m.id)}/replies?limit=100`,
      );
      m.respostas = j.data ?? [];
    } catch {
      m.respostas = [];
    }
  }
  return msgs;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const msgs =
    args[0] === "--arquivo"
      ? (JSON.parse(readFileSync(args[1]!, "utf8")) as MensagemDoClickUp[])
      : await doClickUp(args[0] ?? "");

  const amostra = Number(args[0] === "--arquivo" ? args[2] : args[1]) || 25;
  const itens = planejarImportacao(msgs);

  const porKind = new Map<string, number>();
  let comBinario = 0;
  for (const i of itens) {
    porKind.set(i.kind, (porKind.get(i.kind) ?? 0) + 1);
    if (i.anexo) comBinario++;
  }

  console.log(`${msgs.length} mensagens → ${itens.length} itens`);
  for (const [k, n] of [...porKind].sort((a, b) => b[1] - a[1])) {
    const nota = OK_NO_BUCKET.has(k) ? "" : "  (vira link para o anexo)";
    console.log(`  ${String(n).padStart(4)}  ${k}${nota}`);
  }
  console.log(`\narquivos para o bucket: ${comBinario}`);
  console.log(`itens só com link: ..... ${itens.length - comBinario}`);

  console.log(`\n--- ${amostra} títulos, amostra espaçada ---`);
  const passo = Math.max(1, Math.floor(itens.length / amostra));
  for (let i = 0; i < itens.length; i += passo) {
    const it = itens[i]!;
    console.log(`[${it.kind}] ${it.titulo}`);
    if (it.notas) console.log(`      ${it.notas.replace(/\n/g, " ").slice(0, 110)}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
