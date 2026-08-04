/**
 * Aplicações por dia na Captação Paga — e a comparação com o lançamento anterior.
 *
 * O gráfico existe pra responder uma pergunta: "estamos melhor ou pior que o
 * lançamento passado nesta altura?". Comparar por DATA não responde isso — dois
 * lançamentos começam em dias diferentes. Por isso a série é indexada em
 * D1/D2/D3: dia relativo ao início de cada lançamento.
 *
 * O que é D1: o PRIMEIRO DIA COM APLICAÇÃO daquela planilha. Ancorar assim
 * dispensa cadastrar data de início (que não existe na etapa) e é o marco que o
 * time realmente usa — "dia 1 de aplicação".
 *
 * O funil de comparação já é configurado no funil (`compareFunnelId`) e reusado
 * aqui: a etapa equivalente é achada pelo mesmo `stageType`, igual faz o
 * comparativo de Meta Ads.
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
  /** Dia relativo: 1 = primeiro dia com aplicação. */
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

/** Todos os dias entre o primeiro e o último, inclusive os zerados. */
function fillGaps(counts: Map<string, number>): DailyPoint[] {
  const dias = [...counts.keys()].sort();
  if (!dias.length) return [];

  const inicio = new Date(`${dias[0]}T00:00:00Z`);
  const fim = new Date(`${dias[dias.length - 1]}T00:00:00Z`);
  const out: DailyPoint[] = [];
  let acumulado = 0;
  let i = 1;

  for (let d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    // Dia sem aplicação vira 0, não some da série: um buraco no meio da curva é
    // informação (fim de semana, campanha pausada), e omitir distorceria o D-day
    // de todos os dias seguintes.
    const n = counts.get(key) ?? 0;
    acumulado += n;
    out.push({ dia: i, date: key, aplicacoes: n, acumulado });
    i++;
  }
  return out;
}

export default fp(async function stageApplicationsRoutes(fastify) {
  /**
   * Lê a planilha de aplicações de uma etapa e devolve a série diária.
   * Procura no escopo da ETAPA primeiro; se não achar, aceita uma do FUNIL
   * (stage_id NULL) — lançamento antigo costuma ter a planilha no funil.
   */
  async function seriesFor(
    funnelId: string,
    stageId: string,
  ): Promise<{ points: DailyPoint[]; total: number; sheetLabel: string | null }> {
    const sheets = await fastify.db
      .select({
        id: funnelSpreadsheets.id,
        label: funnelSpreadsheets.label,
        stageId: funnelSpreadsheets.stageId,
        spreadsheetId: funnelSpreadsheets.spreadsheetId,
        sheetName: funnelSpreadsheets.sheetName,
        columnMapping: funnelSpreadsheets.columnMapping,
      })
      .from(funnelSpreadsheets)
      .where(
        and(eq(funnelSpreadsheets.funnelId, funnelId), eq(funnelSpreadsheets.type, "applications")),
      );

    const sheet = sheets.find((s) => s.stageId === stageId) ?? sheets.find((s) => !s.stageId);
    if (!sheet) return { points: [], total: 0, sheetLabel: null };

    const dateCol = sheet.columnMapping?.date;
    if (!dateCol) return { points: [], total: 0, sheetLabel: sheet.label };

    let data: { headers: string[]; rows: string[][] };
    try {
      data = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
    } catch {
      return { points: [], total: 0, sheetLabel: sheet.label };
    }

    const idx = data.headers.indexOf(dateCol);
    if (idx === -1) return { points: [], total: 0, sheetLabel: sheet.label };

    const counts = new Map<string, number>();
    let total = 0;
    for (const row of data.rows) {
      const day = parseDay(row[idx]);
      // Linha sem data válida (arrasto no fim da planilha, célula em branco) não
      // entra: entraria como "hoje" e inflaria o último dia.
      if (!day) continue;
      counts.set(day, (counts.get(day) ?? 0) + 1);
      total++;
    }

    return { points: fillGaps(counts), total, sheetLabel: sheet.label };
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
          stageType: funnelStages.stageType,
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

      const atual = await seriesFor(funnelId, stageId);

      // Comparação: mesma etapa (por stageType) no funil de comparação.
      let comparacao: {
        funnelName: string;
        points: DailyPoint[];
        total: number;
        semPlanilha: boolean;
      } | null = null;

      if (ctx.compareFunnelId) {
        const [cmpFunnel] = await fastify.db
          .select({ id: funnels.id, name: funnels.name })
          .from(funnels)
          .where(eq(funnels.id, ctx.compareFunnelId))
          .limit(1);

        const [cmpStage] = await fastify.db
          .select({ id: funnelStages.id })
          .from(funnelStages)
          .where(
            and(
              eq(funnelStages.funnelId, ctx.compareFunnelId),
              eq(funnelStages.stageType, ctx.stageType),
            ),
          )
          .limit(1);

        if (cmpFunnel && cmpStage) {
          const s = await seriesFor(ctx.compareFunnelId, cmpStage.id);
          comparacao = {
            funnelName: cmpFunnel.name,
            points: s.points,
            total: s.total,
            semPlanilha: s.sheetLabel === null,
          };
        }
      }

      // Delta na MESMA altura: compara o acumulado do atual com o acumulado do
      // anterior no mesmo D-day. Comparar com o total final do anterior diria que
      // estamos sempre perdendo até o último dia — leitura inútil.
      let deltaPercent: number | null = null;
      const ultimoDia = atual.points.length;
      if (ultimoDia > 0 && comparacao?.points.length) {
        const base = comparacao.points.find((p) => p.dia === ultimoDia)?.acumulado;
        const meu = atual.points[ultimoDia - 1].acumulado;
        if (base && base > 0) deltaPercent = +(((meu - base) / base) * 100).toFixed(1);
      }

      return {
        funnelName: ctx.funnelName,
        semPlanilha: atual.sheetLabel === null,
        sheetLabel: atual.sheetLabel,
        total: atual.total,
        points: atual.points,
        comparacao,
        deltaPercent,
      };
    },
  );
});
