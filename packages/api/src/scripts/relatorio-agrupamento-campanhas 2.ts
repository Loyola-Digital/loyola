/**
 * Story 44.4 — relatório de agrupamento de campanhas por nome normalizado.
 *
 * NÃO aplica o agrupamento em lugar nenhum: produz o markdown para revisão
 * humana. O teto (Story 44.5) só passa a usar o agrupamento depois que o time
 * conferir esta tabela.
 *
 * Uso: npx tsx src/scripts/relatorio-agrupamento-campanhas.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url).pathname });
import pg from "pg";
import { writeFileSync } from "node:fs";
import { normalizarNomeCampanha, temSufixoDeCopia } from "@loyola-x/shared";

interface Linha {
  projeto: string;
  campaignId: string;
  nome: string;
  primeira: string;
  ultima: string;
  impressoes: number;
  spend: number;
}

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query<Linha>(`
    SELECT p.name AS projeto, m.campaign_id AS "campaignId",
           COALESCE(n.entity_name, '(sem nome no cache)') AS nome,
           min(m.date_start) AS primeira, max(m.date_start) AS ultima,
           sum(m.impressions::numeric)::float8 AS impressoes,
           sum(m.spend::numeric)::float8 AS spend
    FROM meta_campaign_insights_daily m
    JOIN projects p ON p.id = m.project_id
    LEFT JOIN meta_entity_names_cache n
      ON n.project_id = m.project_id AND n.entity_id = m.campaign_id AND n.entity_type = 'campaign'
    GROUP BY 1,2,3 ORDER BY 1,3`);
  await c.end();

  // (projeto → nome normalizado → ids)
  const grupos = new Map<string, Map<string, Linha[]>>();
  for (const r of rows) {
    const chave = normalizarNomeCampanha(r.nome) || "(sem nome)";
    if (!grupos.has(r.projeto)) grupos.set(r.projeto, new Map());
    const g = grupos.get(r.projeto)!;
    g.set(chave, [...(g.get(chave) ?? []), r]);
  }

  const out: string[] = [
    "# Agrupamento de campanhas por nome normalizado — Story 44.4",
    "",
    "**Gerado por:** `packages/api/src/scripts/relatorio-agrupamento-campanhas.ts`",
    "",
    "> ⚠️ **Este agrupamento NÃO está aplicado em lugar nenhum.** Ele existe para revisão humana.",
    "> O teto histórico (Story 44.5) só passa a usá-lo depois que o time de tráfego confirmar",
    "> que os ids reunidos sob cada nome são de fato a mesma campanha.",
    "",
    "Agrupar é heurística e erra de dois jeitos: **juntar o que não devia** (grave — contamina o teto)",
    "ou deixar de juntar (recuperável). A seção de casos suspeitos concentra o primeiro tipo.",
    "",
  ];

  let totalIds = 0, totalGrupos = 0, gruposComMais = 0;
  const suspeitos: string[] = [];

  for (const [projeto, g] of [...grupos].sort()) {
    const comMais = [...g.entries()].filter(([, l]) => l.length > 1).sort((a, b) => b[1].length - a[1].length);
    totalIds += [...g.values()].reduce((s, l) => s + l.length, 0);
    totalGrupos += g.size;
    gruposComMais += comMais.length;

    out.push(`## ${projeto}`, "");
    out.push(`${[...g.values()].reduce((s, l) => s + l.length, 0)} ids · ${g.size} grupos · **${comMais.length} grupos com mais de um id**`, "");
    if (!comMais.length) { out.push("_Nenhum id foi agrupado neste projeto._", ""); continue; }

    out.push("| nome normalizado | ids | nomes originais | 1ª data | última | impressões |");
    out.push("|---|---:|---|---|---|---:|");
    for (const [chave, l] of comMais) {
      const nomes = [...new Set(l.map((x) => x.nome))];
      const impr = l.reduce((s, x) => s + x.impressoes, 0);
      out.push(`| \`${chave}\` | ${l.length} | ${nomes.map((n) => `\`${n}\``).join(" · ")} | ${l.map((x) => x.primeira).sort()[0]} | ${l.map((x) => x.ultima).sort().reverse()[0]} | ${impr.toLocaleString("pt-BR")} |`);

      // Suspeito: ≥3 ids, ou nomes que diferem em algo além do sufixo de cópia.
      const soSufixo = nomes.every((n) => temSufixoDeCopia(n) || n === nomes.find((x) => !temSufixoDeCopia(x)));
      if (l.length >= 3 || !soSufixo) {
        suspeitos.push(`| ${projeto} | \`${chave}\` | ${l.length} | ${nomes.map((n) => `\`${n}\``).join(" · ")} | ${l.length >= 3 ? "≥3 ids" : ""}${!soSufixo ? " difere além do sufixo" : ""} |`);
      }
    }
    out.push("");
  }

  out.push("## ⚠️ Casos que merecem olho", "");
  if (suspeitos.length) {
    out.push("Grupos com **3 ou mais ids**, ou cujos nomes originais diferem em algo além do sufixo de cópia.", "");
    out.push("| projeto | nome normalizado | ids | nomes originais | motivo |");
    out.push("|---|---|---:|---|---|");
    out.push(...suspeitos);
  } else {
    out.push("_Nenhum._");
  }
  out.push("", "---", "", `**Total:** ${totalIds} ids · ${totalGrupos} grupos · ${gruposComMais} grupos com mais de um id · ${suspeitos.length} suspeitos.`);

  // Caminho relativo ao repo, não ao cwd — o script roda de packages/api.
  const destino = new URL("../../../../docs/qa/audits/44.4-agrupamento-campanhas.md", import.meta.url).pathname;
  writeFileSync(destino, out.join("\n") + "\n");
  console.log(`docs/qa/audits/44.4-agrupamento-campanhas.md gerado — ${totalIds} ids, ${totalGrupos} grupos, ${gruposComMais} agrupados, ${suspeitos.length} suspeitos`);
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
