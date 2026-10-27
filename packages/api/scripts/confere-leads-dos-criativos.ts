/**
 * Story 18.89 (AC9) — a coluna Leads do Desempenho de Criativos confere com a
 * planilha em TODAS as etapas?
 *
 * Para cada etapa com aba de leads (`funnel_spreadsheets`, `type = leads`), lê
 * a resposta que a rota `creative-performance` gravou no cache
 * (`public_metrics_cache`, chave `${stageId}:${dias}:v5`) e recalcula, por
 * criativo, a regra do AC1 direto da planilha:
 *
 *   e-mails distintos entre as linhas com `utm_content` ∈ ad_ids do criativo
 *   e `utm_source` ∈ ORIGENS_PAGAS_DE_LEAD, no período do seletor
 *
 * O recálculo é independente das funções da rota (`leads-pagos-por-criativo`):
 * usa só a lista de origens do shared — a decisão (P3) — e conta à mão. Se a
 * rota e o script divergirem, um dos dois está errado, e o script mostra qual
 * criativo.
 *
 * Só leitura. Existe porque suíte verde não prova a forma do dado: o que
 * decide é o payload de produção.
 *
 * Uso (precisa do `.env` da API com DATABASE_URL e GOOGLE_SERVICE_ACCOUNT_KEY):
 *
 *     cd packages/api && ./node_modules/.bin/tsx scripts/confere-leads-dos-criativos.ts [dias]
 *
 * `dias` default 90. Etapa sem resposta no cache aparece como "não conferida":
 * abra a tela dela (ou o botão Atualizar) e rode de novo.
 */
import "dotenv/config";
import pg from "pg";
import { ORIGENS_PAGAS_DE_LEAD, utmContentEfetivo } from "@loyola-x/shared";
import { readSheetData } from "../src/services/google-sheets.js";
import { recortarLinhasPelaJanela } from "../src/utils/janela-das-linhas.js";
import { toBusinessDayKey } from "../src/utils/sale-date.js";
import { VERSAO_DO_CACHE_CREATIVE_PERFORMANCE } from "../src/routes/stage-creative-performance.js";

const DIAS = Number(process.argv[2] ?? 90);

interface CriativoDoCache {
  adId: string;
  adIds?: string[];
  adName: string;
  leads: number;
}

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows: etapas } = await c.query(
    `select p.name as projeto, f.name as funil, st.name as etapa, st.id as stage_id,
            f.project_id, x.spreadsheet_id, x.sheet_name, x.column_mapping as map,
            m.payload, m.computed_at
       from funnel_spreadsheets x
       join funnel_stages st on st.id = x.stage_id
       join funnels f on f.id = st.funnel_id
       join projects p on p.id = f.project_id
       left join public_metrics_cache m
              on m.project_id = f.project_id
             and m.scope = 'creative-performance'
             and m.key = st.id || ':' || $1 || ':' || $2
      where x.type = 'leads'
      order by p.name, f.name, st.name`,
    [String(DIAS), VERSAO_DO_CACHE_CREATIVE_PERFORMANCE],
  );
  await c.end();

  let divergencias = 0;
  let conferidas = 0;
  const naoConferidas: string[] = [];

  for (const e of etapas) {
    const rotulo = `${e.projeto} / ${e.funil} / ${e.etapa}`;
    const criativos = (e.payload?.creatives ?? null) as CriativoDoCache[] | null;
    if (!criativos) {
      naoConferidas.push(`${rotulo} — sem resposta no cache ${VERSAO_DO_CACHE_CREATIVE_PERFORMANCE}`);
      continue;
    }
    if (criativos.some((cr) => !Array.isArray(cr.adIds))) {
      naoConferidas.push(`${rotulo} — resposta sem \`adIds\` (API anterior à 18.89)`);
      continue;
    }

    const planilha = await readSheetData(e.spreadsheet_id, e.sheet_name);
    const m = (e.map ?? {}) as Record<string, string | undefined>;
    const col = (nome?: string) =>
      nome ? planilha.headers.findIndex((h) => h.trim().toLowerCase() === nome.trim().toLowerCase()) : -1;
    const iContent = col(m.utm_content);
    const iSource = col(m.utm_source);
    const iEmail = col(m.email);
    // "Hoje" = o dia (fuso do negócio) em que a rota calculou — linha que
    // entrou depois disso não é divergência.
    const hoje = toBusinessDayKey(new Date(e.computed_at));
    const { linhas } = recortarLinhasPelaJanela(planilha.rows, col(m.date), DIAS, hoje);

    const divergentes: string[] = [];
    for (const cr of criativos) {
      const ids = new Set(cr.adIds);
      const pessoas = new Set<string>();
      if (iContent !== -1 && iSource !== -1) {
        linhas.forEach((row, i) => {
          const fonte = (row[iSource] ?? "").trim().toLowerCase();
          if (!ORIGENS_PAGAS_DE_LEAD.has(fonte)) return;
          if (!ids.has(utmContentEfetivo(row[iContent] ?? ""))) return;
          const email = iEmail !== -1 ? (row[iEmail] ?? "").trim().toLowerCase() : "";
          pessoas.add(email || `linha-${i}`);
        });
      }
      if (pessoas.size !== cr.leads) {
        divergentes.push(`${cr.adName}: rota ${cr.leads} × planilha ${pessoas.size} (${cr.adIds!.length} anúncios)`);
      }
    }

    conferidas += 1;
    divergencias += divergentes.length;
    const marca = divergentes.length === 0 ? "✅" : "❌";
    console.log(
      `${marca} ${rotulo} — ${criativos.length} criativos, cache de ${e.computed_at.toISOString()} (hoje ${hoje})`,
    );
    for (const d of divergentes) console.log(`     ${d}`);
  }

  if (naoConferidas.length > 0) {
    console.log(`\nNão conferidas (${naoConferidas.length}):`);
    for (const n of naoConferidas) console.log(`  ⏳ ${n}`);
  }
  console.log(
    `\n${conferidas} de ${etapas.length} etapas conferidas em ${DIAS} dias · ${divergencias} divergência(s).`,
  );
  if (divergencias > 0) process.exit(1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
