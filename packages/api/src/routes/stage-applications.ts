/**
 * Aplicações por dia — uma série por planilha de aplicação (forma) do funil, e a
 * comparação com o lançamento anterior por forma.
 *
 * O time pode ter MAIS DE UMA planilha de aplicação no mesmo lançamento (ex.:
 * "form com ticket" e "form sem ticket"). Cada planilha do tipo `applications`
 * vira uma série própria, nomeada pelo `label` da planilha — é o que aparece no
 * tooltip/legenda do gráfico.
 *
 * Alinhamento em D-day (dia relativo ao início do lançamento) porque a pergunta
 * é "estamos melhor ou pior que o lançamento passado NESTA altura?" — comparar
 * por data não responde isso, já que dois lançamentos começam em dias
 * diferentes. O D1 é definido no nível do LANÇAMENTO (menor data com aplicação
 * em qualquer forma), não por planilha: assim todas as formas do mesmo
 * lançamento compartilham o mesmo eixo e ficam comparáveis entre si.
 *
 * A comparação com o lançamento anterior (`compareFunnelId`, configurado no
 * funil) é casada FORMA A FORMA pelo nome (label): "form com ticket" do atual
 * compara com "form com ticket" do anterior.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnelSpreadsheets, funnelStages, funnels } from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

export interface DailyPoint {
  /** Dia relativo: 1 = primeiro dia com aplicação do lançamento. */
  dia: number;
  /** Data real daquele dia — o tooltip mostra, senão D12 não diz nada. */
  date: string;
  aplicacoes: number;
  /** Soma corrida — é o que revela se o ritmo está acima ou abaixo. */
  acumulado: number;
}

/** dd/mm/aaaa, aaaa-mm-dd e ISO. Devolve a data local em aaaa-mm-dd. */
function parseDay(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = String(raw).trim();
  if (!t) return null;

  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface RawForm {
  sheetId: string;
  label: string;
  /** data (aaaa-mm-dd) -> nº de aplicações naquele dia. */
  counts: Map<string, number>;
  total: number;
}

interface FormSeries {
  sheetId: string;
  label: string;
  points: DailyPoint[];
  total: number;
}

export default fp(async function stageApplicationsRoutes(fastify) {
  /**
   * Lê TODAS as planilhas de aplicação de um funil e devolve, por planilha, a
   * contagem por data (calendário). O alinhamento em D-day é feito depois
   * (alignForms), no nível do lançamento.
   */
  async function rawFormsFor(funnelId: string): Promise<RawForm[]> {
    const sheets = await fastify.db
      .select({
        id: funnelSpreadsheets.id,
        label: funnelSpreadsheets.label,
        spreadsheetId: funnelSpreadsheets.spreadsheetId,
        sheetName: funnelSpreadsheets.sheetName,
        columnMapping: funnelSpreadsheets.columnMapping,
      })
      .from(funnelSpreadsheets)
      .where(
        and(eq(funnelSpreadsheets.funnelId, funnelId), eq(funnelSpreadsheets.type, "applications")),
      );

    return Promise.all(
      sheets.map(async (sheet): Promise<RawForm> => {
        const empty: RawForm = {
          sheetId: sheet.id,
          label: sheet.label,
          counts: new Map(),
          total: 0,
        };
        const dateCol = sheet.columnMapping?.date;
        if (!dateCol) return empty;

        let data: { headers: string[]; rows: string[][] };
        try {
          data = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
        } catch {
          return empty;
        }

        const idx = data.headers.indexOf(dateCol);
        if (idx === -1) return empty;

        const counts = new Map<string, number>();
        let total = 0;
        for (const row of data.rows) {
          const day = parseDay(row[idx]);
          // Linha sem data válida (arrasto no fim da planilha, célula em branco)
          // não entra: entraria como "hoje" e inflaria o último dia.
          if (!day) continue;
          counts.set(day, (counts.get(day) ?? 0) + 1);
          total++;
        }
        return { sheetId: sheet.id, label: sheet.label, counts, total };
      }),
    );
  }

  /**
   * Alinha todas as formas no MESMO eixo D-day: D1 = menor data com aplicação em
   * qualquer forma; a série vai até a maior data. Dias sem aplicação viram 0 (um
   * buraco no meio da curva é informação — fim de semana, campanha pausada) e
   * omiti-los distorceria o D-day dos dias seguintes.
   */
  function alignForms(forms: RawForm[]): FormSeries[] {
    const dates = new Set<string>();
    for (const f of forms) for (const k of f.counts.keys()) dates.add(k);
    const sorted = [...dates].sort();

    if (!sorted.length) {
      return forms.map((f) => ({ sheetId: f.sheetId, label: f.label, points: [], total: f.total }));
    }

    const inicio = new Date(`${sorted[0]}T00:00:00Z`);
    const fim = new Date(`${sorted[sorted.length - 1]}T00:00:00Z`);

    return forms.map((f) => {
      const points: DailyPoint[] = [];
      let acumulado = 0;
      let i = 1;
      for (let d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        const n = f.counts.get(key) ?? 0;
        acumulado += n;
        points.push({ dia: i, date: key, aplicacoes: n, acumulado });
        i++;
      }
      return { sheetId: f.sheetId, label: f.label, points, total: f.total };
    });
  }

  /** Soma todas as planilhas de aplicação de um lançamento numa forma única. */
  function aggregateForms(forms: RawForm[]): RawForm {
    const counts = new Map<string, number>();
    let total = 0;
    for (const f of forms) {
      for (const [k, v] of f.counts) counts.set(k, (counts.get(k) ?? 0) + v);
      total += f.total;
    }
    return { sheetId: "__total__", label: "Total", counts, total };
  }

  /** Soma séries JÁ alinhadas (mesmo eixo D-day) num total por dia. */
  function totalOfAligned(forms: FormSeries[]): DailyPoint[] {
    const len = forms.reduce((m, f) => Math.max(m, f.points.length), 0);
    const out: DailyPoint[] = [];
    let acumulado = 0;
    for (let i = 0; i < len; i++) {
      let aplicacoes = 0;
      let date = "";
      for (const f of forms) {
        const p = f.points[i];
        if (p) {
          aplicacoes += p.aplicacoes;
          date = p.date;
        }
      }
      acumulado += aplicacoes;
      out.push({ dia: i + 1, date, aplicacoes, acumulado });
    }
    return out;
  }

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/applications-daily",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const { projectId, funnelId, stageId } = params.data;

      const [ctx] = await fastify.db
        .select({
          funnelName: funnels.name,
          compareFunnelId: funnels.compareFunnelId,
        })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, stageId),
            eq(funnelStages.funnelId, funnelId),
            eq(funnels.projectId, projectId),
          ),
        )
        .limit(1);
      if (!ctx) return reply.code(404).send({ error: "Etapa não encontrada" });

      const atual = alignForms(await rawFormsFor(funnelId));

      // Comparação com o lançamento anterior é AGREGADA (total vs total), não
      // forma a forma: cada lançamento nomeia suas planilhas do seu jeito, então
      // casar por nome quebrava a comparação (some quando os nomes diferem). A
      // pergunta é "estamos à frente do lançamento passado NO TOTAL, nesta
      // altura?" — soma todas as planilhas de aplicação de cada lançamento.
      let compareFunnelName: string | null = null;
      let comparison: { points: DailyPoint[]; total: number } | null = null;
      if (ctx.compareFunnelId) {
        const [cmpFunnel] = await fastify.db
          .select({ id: funnels.id, name: funnels.name })
          .from(funnels)
          .where(eq(funnels.id, ctx.compareFunnelId))
          .limit(1);
        if (cmpFunnel) {
          compareFunnelName = cmpFunnel.name;
          const prevTotal = alignForms([aggregateForms(await rawFormsFor(ctx.compareFunnelId))]);
          const p = prevTotal[0];
          if (p && p.points.length) comparison = { points: p.points, total: p.total };
        }
      }

      // Total do lançamento atual (soma das formas, já no mesmo eixo D-day).
      const currentTotalPoints = totalOfAligned(atual);
      const currentTotal = atual.reduce((s, f) => s + f.total, 0);

      // Delta na MESMA altura: acumulado total do atual vs. o do anterior no
      // mesmo D-day. Comparar com o total FINAL do anterior diria que estamos
      // sempre perdendo até o último dia — leitura inútil.
      let deltaPercent: number | null = null;
      const ultimoDia = currentTotalPoints.length;
      if (ultimoDia > 0 && comparison && comparison.points.length) {
        const base = comparison.points.find((pt) => pt.dia === ultimoDia)?.acumulado;
        const meu = currentTotalPoints[ultimoDia - 1].acumulado;
        if (base && base > 0) deltaPercent = +(((meu - base) / base) * 100).toFixed(1);
      }

      return {
        funnelName: ctx.funnelName,
        compareFunnelName,
        // Sem nenhuma planilha de aplicação vinculada — não é erro, é etapa que
        // ainda não tem comercial rodando.
        semPlanilha: atual.length === 0,
        forms: atual.map((f) => ({
          sheetId: f.sheetId,
          label: f.label,
          total: f.total,
          points: f.points,
        })),
        comparison,
        currentTotal,
        deltaPercent,
      };
    },
  );
});
