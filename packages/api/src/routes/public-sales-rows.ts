/**
 * Story 39.I3 (mapeamento do Inácio, jul/22) — camada ROW-LEVEL de venda.
 *
 * Uma linha por transação da(s) planilha(s) de venda da etapa (mesmas fontes do
 * sales-daily via resolveSalesSheetsForStage): dedup por txId, teste de fuso
 * UTC→BRT (dataVendaRaw preserva a célula crua), exclusão de TMB (plataforma),
 * coorte D+x (leadCreatedAt via amarração lead↔venda por e-mail).
 *
 * PRIVACIDADE: NUNCA expõe e-mail/telefone — `emailHash` = sha256 do e-mail
 * lowercase (mesma chave serve pro cross-launch). Leitura AO VIVO das planilhas
 * (com o cache de 30s do google-sheets).
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnelStages, funnels, funnelSurveys, stageLeadScoringSchemas } from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import { readSheetData } from "../services/google-sheets.js";
import { resolveSalesSheetsForStage } from "../services/sales-daily-sync.js";
import { classifyRefundStatus } from "../services/sales-status.js";
import { classifyOrigem, classifyTemperatura, classifyCanal, normalizeEmail } from "../utils/lead-origin.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  stageId: z.string().uuid(),
});

export function hashEmail(raw: string): string | null {
  const e = normalizeEmail(raw);
  if (!e) return null;
  return createHash("sha256").update(e).digest("hex");
}

function parseNumberBr(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const normalized = hasComma ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return parseFloat(normalized) || 0;
}

function parseDateIso(val: string | undefined): string | null {
  if (!val) return null;
  const t = val.trim();
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

// Headers curtos do n8n ("s=", "m=", "c=", "co=", "t=") + longos. Exato primeiro
// (evita "content=" casar "t=" por substring).
function findUtmIdx(headers: string[], exact: string[], contains: string[]): number {
  const H = headers.map((h) => h.trim().toLowerCase());
  for (const m of exact) {
    const i = H.indexOf(m);
    if (i >= 0) return i;
  }
  for (const m of contains) {
    const i = H.findIndex((h) => h.includes(m));
    if (i >= 0) return i;
  }
  return -1;
}

type SheetMapping = {
  email?: string;
  transactionId?: string;
  productName?: string;
  valorBruto?: string;
  valorLiquido?: string;
  dataVenda?: string;
  status?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

export default fp(async function publicSalesRowsRoutes(fastify) {
  // ---- GET /api/public/v1/projects/:projectId/stages/:stageId/sales-rows ----
  fastify.get<{ Params: z.infer<typeof paramsSchema> }>(
    "/api/public/v1/projects/:projectId/stages/:stageId/sales-rows",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST" });
      }
      const { projectId, stageId } = parsed.data;

      const [stage] = await fastify.db
        .select({ id: funnelStages.id, name: funnelStages.name })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(and(eq(funnelStages.id, stageId), eq(funnels.projectId, projectId)))
        .limit(1);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada", code: "NOT_FOUND" });

      const { sheets } = await resolveSalesSheetsForStage(fastify.db, stageId);
      if (sheets.length === 0) {
        return { projectId, stageId, semDados: true, message: "Etapa sem planilha de vendas." };
      }

      // Amarração lead↔venda: mapa emailHash → {leadUtmSource, leadUtmTerm,
      // leadCreatedAt} a partir da pesquisa da etapa (mesma elegibilidade do
      // leads-summary: lead scoring > survey da etapa). Coorte D+x = dataVenda
      // − leadCreatedAt do lado do consumidor.
      const leadByHash = new Map<string, { leadUtmSource: string | null; leadUtmTerm: string | null; leadCreatedAt: string | null }>();
      try {
        const [scoring] = await fastify.db
          .select({ surveyId: stageLeadScoringSchemas.surveyId })
          .from(stageLeadScoringSchemas)
          .where(eq(stageLeadScoringSchemas.stageId, stageId))
          .limit(1);
        let survey: { spreadsheetId: string; sheetName: string } | undefined;
        if (scoring?.surveyId) {
          [survey] = await fastify.db
            .select({ spreadsheetId: funnelSurveys.spreadsheetId, sheetName: funnelSurveys.sheetName })
            .from(funnelSurveys)
            .where(eq(funnelSurveys.id, scoring.surveyId))
            .limit(1);
        }
        if (!survey) {
          [survey] = await fastify.db
            .select({ spreadsheetId: funnelSurveys.spreadsheetId, sheetName: funnelSurveys.sheetName })
            .from(funnelSurveys)
            .where(eq(funnelSurveys.stageId, stageId))
            .limit(1);
        }
        if (survey) {
          const lead = await readSheetData(survey.spreadsheetId, survey.sheetName);
          const emailIdx = lead.headers.findIndex((h) => /e-?mail/i.test(h));
          const srcIdx = findUtmIdx(lead.headers, ["s=", "utm_source"], ["utm_source", "fonte"]);
          const termIdx = findUtmIdx(lead.headers, ["t=", "utm_term"], ["utm_term", "termo"]);
          const dateIdx = lead.headers.findIndex((h) => /data|timestamp|carimbo|submitted/i.test(h));
          if (emailIdx >= 0) {
            for (const row of lead.rows) {
              const h = hashEmail(row[emailIdx] ?? "");
              if (!h || leadByHash.has(h)) continue;
              leadByHash.set(h, {
                leadUtmSource: srcIdx >= 0 ? (row[srcIdx] ?? "").trim() || null : null,
                leadUtmTerm: termIdx >= 0 ? (row[termIdx] ?? "").trim() || null : null,
                leadCreatedAt: dateIdx >= 0 ? parseDateIso(row[dateIdx]) : null,
              });
            }
          }
        }
      } catch {
        // pesquisa inacessível → rows saem sem amarração (leadMatch:false)
      }

      const rows: Record<string, unknown>[] = [];
      const sheetSources: { subtype: string; sheetName: string; rows: number }[] = [];

      for (const sheet of sheets) {
        const mapping = (sheet.columnMapping ?? {}) as SheetMapping;
        let data: { headers: string[]; rows: string[][] };
        try {
          data = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
        } catch {
          continue;
        }
        const col = (n?: string) => (n ? data.headers.indexOf(n) : -1);
        const emailIdx = col(mapping.email);
        const txIdx = col(mapping.transactionId);
        const produtoIdx = col(mapping.productName);
        const brutoIdx = col(mapping.valorBruto);
        const liquidoIdx = col(mapping.valorLiquido);
        const dataIdx = col(mapping.dataVenda);
        const statusIdx = col(mapping.status);
        const srcIdx = col(mapping.utm_source) >= 0 ? col(mapping.utm_source) : findUtmIdx(data.headers, ["s=", "utm_source"], ["utm_source"]);
        const medIdx = col(mapping.utm_medium) >= 0 ? col(mapping.utm_medium) : findUtmIdx(data.headers, ["m=", "utm_medium"], ["utm_medium"]);
        const campIdx = col(mapping.utm_campaign) >= 0 ? col(mapping.utm_campaign) : findUtmIdx(data.headers, ["c=", "utm_campaign"], ["utm_campaign"]);
        const contIdx = col(mapping.utm_content) >= 0 ? col(mapping.utm_content) : findUtmIdx(data.headers, ["co=", "utm_content"], ["utm_content"]);
        const termIdx = col(mapping.utm_term) >= 0 ? col(mapping.utm_term) : findUtmIdx(data.headers, ["t=", "utm_term"], ["utm_term", "termo"]);
        if (emailIdx === -1 && txIdx === -1) continue; // sem identificador algum

        let count = 0;
        for (const row of data.rows) {
          const emailRaw = emailIdx >= 0 ? (row[emailIdx] ?? "") : "";
          const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() || null : null;
          if (!emailRaw.trim() && !txId) continue; // linha vazia
          const eHash = hashEmail(emailRaw);
          const utmSource = srcIdx >= 0 ? (row[srcIdx] ?? "").trim() || null : null;
          const utmMedium = medIdx >= 0 ? (row[medIdx] ?? "").trim() || null : null;
          const utmTerm = termIdx >= 0 ? (row[termIdx] ?? "").trim() || null : null;
          const lead = eHash ? leadByHash.get(eHash) : undefined;
          count++;
          rows.push({
            txId,
            emailHash: eHash,
            produto: produtoIdx >= 0 ? (row[produtoIdx] ?? "").trim() || null : null,
            plataforma: sheet.subtype,
            valorBruto: brutoIdx >= 0 ? parseNumberBr(row[brutoIdx]) : 0,
            valorLiquido: liquidoIdx >= 0 ? parseNumberBr(row[liquidoIdx]) : 0,
            // Célula CRUA (n8n grava UTC "...Z"; Meta é BRT) — o teste de fuso é
            // do consumidor. `dataVenda` = só a data parseada (sem hora).
            dataVendaRaw: dataIdx >= 0 ? (row[dataIdx] ?? "").trim() || null : null,
            dataVenda: dataIdx >= 0 ? parseDateIso(row[dataIdx]) : null,
            statusBucket: statusIdx >= 0 ? classifyRefundStatus(row[statusIdx], true) : "paid",
            utmSource,
            utmMedium,
            utmCampaign: campIdx >= 0 ? (row[campIdx] ?? "").trim() || null : null,
            utmContent: contIdx >= 0 ? (row[contIdx] ?? "").trim() || null : null,
            utmTerm,
            origem: classifyOrigem(utmSource),
            canal: classifyCanal(utmSource, utmMedium),
            temperatura: classifyTemperatura(utmTerm),
            leadMatch: !!lead,
            leadUtmSource: lead?.leadUtmSource ?? null,
            leadUtmTerm: lead?.leadUtmTerm ?? null,
            leadCreatedAt: lead?.leadCreatedAt ?? null,
          });
        }
        sheetSources.push({ subtype: sheet.subtype, sheetName: sheet.sheetName, rows: count });
      }

      return {
        projectId,
        stageId,
        stageName: stage.name,
        sheetSources,
        totalRows: rows.length,
        // Linhas CRUAS: reembolso/chargeback INCLUÍDOS (statusBucket diz) e SEM
        // dedup — a chave de dedup do dashboard é txId+produto.
        rows,
      };
    },
  );
});
