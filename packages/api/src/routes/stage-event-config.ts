// Story 19.12 — Config da etapa de Evento Presencial: produtos (com turma
// MemberKit cada) e closers cadastrados. PUT substitui a lista inteira.

import { z } from "zod";
import { eq, and, asc, desc, ne, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  stageEventProducts,
  stageEventClosers,
  stageEventMirroredSheets,
  stageEventLeadStatus,
  stageSalesSpreadsheets,
  stageSalesPlanSources,
  manualSales,
  funnelStages,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import { parseFaturamento } from "../services/parse-faturamento.js";

const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const productsBodySchema = z.object({
  products: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        memberkitClassroomId: z.number().int().positive().nullable().optional(),
        memberkitClassroomName: z.string().trim().max(255).nullable().optional(),
      }),
    )
    .max(200),
});

const closersBodySchema = z.object({
  closers: z.array(z.object({ name: z.string().trim().min(1).max(255) })).max(200),
});

const funnelParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const mirrorBodySchema = z.object({
  sourceSpreadsheetIds: z.array(z.string().uuid()).max(100),
});

export default fp(async function stageEventConfigRoutes(fastify) {
  async function getProjectAccess(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!member) return null;
    }
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return project ?? null;
  }

  async function getStage(projectId: string, funnelId: string, stageId: string) {
    const [stage] = await fastify.db
      .select({ id: funnelStages.id })
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
    return stage ?? null;
  }

  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId";

  // ---- PRODUTOS ----
  fastify.get(`${base}/event-products`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const rows = await fastify.db
      .select()
      .from(stageEventProducts)
      .where(eq(stageEventProducts.stageId, params.data.stageId))
      .orderBy(asc(stageEventProducts.sortOrder), asc(stageEventProducts.name));

    return {
      products: rows.map((r) => ({
        id: r.id,
        stageId: r.stageId,
        name: r.name,
        memberkitClassroomId: r.memberkitClassroomId,
        memberkitClassroomName: r.memberkitClassroomName,
        sortOrder: r.sortOrder,
      })),
    };
  });

  fastify.put(`${base}/event-products`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = productsBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    // Dedup por nome (case-insensitive) mantendo a 1ª ocorrência — o lookup de
    // turma na matrícula casa por nome, então nomes duplicados tornariam a turma
    // ambígua.
    const seenNames = new Set<string>();
    const dedupedProducts = body.data.products.filter((p) => {
      const key = p.name.trim().toLowerCase();
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });

    // PUT substitui a lista inteira (delete + insert) numa transação.
    await fastify.db.transaction(async (tx) => {
      await tx.delete(stageEventProducts).where(eq(stageEventProducts.stageId, params.data.stageId));
      if (dedupedProducts.length > 0) {
        await tx.insert(stageEventProducts).values(
          dedupedProducts.map((p, i) => ({
            stageId: params.data.stageId,
            name: p.name,
            memberkitClassroomId: p.memberkitClassroomId ?? null,
            memberkitClassroomName: p.memberkitClassroomName ?? null,
            sortOrder: i,
          })),
        );
      }
    });

    const rows = await fastify.db
      .select()
      .from(stageEventProducts)
      .where(eq(stageEventProducts.stageId, params.data.stageId))
      .orderBy(asc(stageEventProducts.sortOrder), asc(stageEventProducts.name));

    return {
      products: rows.map((r) => ({
        id: r.id,
        stageId: r.stageId,
        name: r.name,
        memberkitClassroomId: r.memberkitClassroomId,
        memberkitClassroomName: r.memberkitClassroomName,
        sortOrder: r.sortOrder,
      })),
    };
  });

  // ---- CLOSERS ----
  fastify.get(`${base}/event-closers`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const rows = await fastify.db
      .select()
      .from(stageEventClosers)
      .where(eq(stageEventClosers.stageId, params.data.stageId))
      .orderBy(asc(stageEventClosers.sortOrder), asc(stageEventClosers.name));

    return { closers: rows.map((r) => ({ id: r.id, stageId: r.stageId, name: r.name, sortOrder: r.sortOrder })) };
  });

  fastify.put(`${base}/event-closers`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = closersBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    // Dedup por nome (case-insensitive) mantendo a 1ª ocorrência.
    const seenCloserNames = new Set<string>();
    const dedupedClosers = body.data.closers.filter((cl) => {
      const key = cl.name.trim().toLowerCase();
      if (seenCloserNames.has(key)) return false;
      seenCloserNames.add(key);
      return true;
    });

    await fastify.db.transaction(async (tx) => {
      await tx.delete(stageEventClosers).where(eq(stageEventClosers.stageId, params.data.stageId));
      if (dedupedClosers.length > 0) {
        await tx.insert(stageEventClosers).values(
          dedupedClosers.map((cl, i) => ({ stageId: params.data.stageId, name: cl.name, sortOrder: i })),
        );
      }
    });

    const rows = await fastify.db
      .select()
      .from(stageEventClosers)
      .where(eq(stageEventClosers.stageId, params.data.stageId))
      .orderBy(asc(stageEventClosers.sortOrder), asc(stageEventClosers.name));

    return { closers: rows.map((r) => ({ id: r.id, stageId: r.stageId, name: r.name, sortOrder: r.sortOrder })) };
  });

  // ---- PLANILHAS DO FUNIL (para o evento escolher quais espelhar) ----
  // Lista todas as planilhas de vendas conectadas em qualquer etapa do funil,
  // exceto as do tipo event_sales (legado) — com o nome da etapa de origem.
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/sales-spreadsheets-all",
    async (request, reply) => {
      const params = funnelParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      // Confirma que o funil pertence ao projeto (evita IDOR cross-projeto).
      const [funnel] = await fastify.db
        .select({ id: funnels.id })
        .from(funnels)
        .where(and(eq(funnels.id, params.data.funnelId), eq(funnels.projectId, params.data.projectId)))
        .limit(1);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const rows = await fastify.db
        .select({
          id: stageSalesSpreadsheets.id,
          stageId: stageSalesSpreadsheets.stageId,
          stageName: funnelStages.name,
          subtype: stageSalesSpreadsheets.subtype,
          spreadsheetName: stageSalesSpreadsheets.spreadsheetName,
          sheetName: stageSalesSpreadsheets.sheetName,
        })
        .from(stageSalesSpreadsheets)
        .innerJoin(funnelStages, eq(funnelStages.id, stageSalesSpreadsheets.stageId))
        .where(eq(funnelStages.funnelId, params.data.funnelId))
        .orderBy(asc(funnelStages.sortOrder), asc(stageSalesSpreadsheets.subtype));

      return {
        spreadsheets: rows
          .filter((r) => r.subtype !== "event_sales")
          .map((r) => ({
            id: r.id,
            stageId: r.stageId,
            stageName: r.stageName,
            subtype: r.subtype,
            spreadsheetName: r.spreadsheetName,
            sheetName: r.sheetName,
          })),
      };
    },
  );

  // ---- ESPELHAMENTO (quais planilhas do funil aparecem no evento) ----
  fastify.get(`${base}/event-mirrored-sheets`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const rows = await fastify.db
      .select({ sourceSpreadsheetId: stageEventMirroredSheets.sourceSpreadsheetId })
      .from(stageEventMirroredSheets)
      .where(eq(stageEventMirroredSheets.eventStageId, params.data.stageId));

    return { sourceSpreadsheetIds: rows.map((r) => r.sourceSpreadsheetId) };
  });

  fastify.put(`${base}/event-mirrored-sheets`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = mirrorBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    // Valida que as planilhas escolhidas pertencem ao MESMO funil (segurança).
    const ids = Array.from(new Set(body.data.sourceSpreadsheetIds));
    let validIds: string[] = [];
    if (ids.length > 0) {
      const valid = await fastify.db
        .select({ id: stageSalesSpreadsheets.id })
        .from(stageSalesSpreadsheets)
        .innerJoin(funnelStages, eq(funnelStages.id, stageSalesSpreadsheets.stageId))
        .where(
          and(
            eq(funnelStages.funnelId, params.data.funnelId),
            inArray(stageSalesSpreadsheets.id, ids),
            // Não espelhar planilhas event_sales (alinha com o filtro do GET).
            ne(stageSalesSpreadsheets.subtype, "event_sales"),
          ),
        );
      validIds = valid.map((v) => v.id);
    }

    await fastify.db.transaction(async (tx) => {
      await tx.delete(stageEventMirroredSheets).where(eq(stageEventMirroredSheets.eventStageId, params.data.stageId));
      if (validIds.length > 0) {
        await tx.insert(stageEventMirroredSheets).values(
          validIds.map((sid) => ({ eventStageId: params.data.stageId, sourceSpreadsheetId: sid })),
        );
      }
    });

    return { sourceSpreadsheetIds: validIds };
  });

  // Helper: lê as planilhas conectadas à etapa (Story 19.15 — fontes do evento,
  // as mesmas do Plano de Vendas) e devolve os leads (email/nome/telefone)
  // deduplicados por email. O Mapa do Evento usa esta lista de participantes.
  async function loadEventLeads(
    stageId: string,
  ): Promise<{ email: string; name: string; phone: string; tipo: string; invitedBy: string; saleEmail: string; buyAt: string; ticket: string }[]> {
    const sources = await fastify.db
      .select({
        spreadsheetId: stageSalesPlanSources.spreadsheetId,
        sheetName: stageSalesPlanSources.sheetName,
        tipo: stageSalesPlanSources.tipo,
        mapping: stageSalesPlanSources.mapping,
      })
      .from(stageSalesPlanSources)
      .where(
        and(
          eq(stageSalesPlanSources.stageId, stageId),
          eq(stageSalesPlanSources.role, "participants"),
        ),
      )
      .orderBy(asc(stageSalesPlanSources.sortOrder));
    if (sources.length === 0) return [];

    type Lead = { email: string; name: string; phone: string; tipo: string; invitedBy: string; saleEmail: string; buyAt: string; ticket: string };
    const MAX_LEADS = 10000;
    const byEmail = new Map<string, Lead>();
    for (const src of sources) {
      if (byEmail.size >= MAX_LEADS) break;
      const mapping = (src.mapping ?? {}) as { name?: string; email?: string; telefone?: string; tipo?: string };
      let data;
      try {
        data = await readSheetData(src.spreadsheetId, src.sheetName);
      } catch {
        continue;
      }
      const { headers, rows } = data;
      const emailIdx = mapping.email ? headers.indexOf(mapping.email) : -1;
      const nameIdx = mapping.name ? headers.indexOf(mapping.name) : -1;
      const phoneIdx = mapping.telefone ? headers.indexOf(mapping.telefone) : -1;
      const tipoIdx = mapping.tipo ? headers.indexOf(mapping.tipo) : -1;
      // Colunas extras lidas por nome do cabeçalho (não mapeadas): quem convidou
      // o participante (2ª cadeira) e o email da venda do ingresso.
      const norm = (s: string) => s.trim().toLowerCase();
      const convIdx = headers.findIndex((h) => norm(h) === "convidado");
      const saleEmailIdx = headers.findIndex((h) => norm(h) === "email da venda");
      // Data/hora da compra do ingresso (coluna "data") — usada como evidência
      // temporal nos matches por nome (compra × resposta da pesquisa).
      const dataIdx = headers.findIndex((h) => norm(h) === "data");
      // Tipo de ingresso (coluna "Ingresso") — ex.: VIP, BLACK, Empreendedor.
      const ingressoIdx = headers.findIndex((h) => norm(h) === "ingresso");
      if (emailIdx === -1) continue;
      for (const row of rows) {
        if (byEmail.size >= MAX_LEADS) break;
        const email = (row[emailIdx] ?? "").trim().toLowerCase();
        if (!email) continue;
        if (byEmail.has(email)) continue;
        // tipo da coluna mapeada; se não houver, cai no rótulo livre da fonte (src.tipo).
        const tipoCell = tipoIdx !== -1 ? (row[tipoIdx] ?? "").trim() : "";
        byEmail.set(email, {
          email,
          name: nameIdx !== -1 ? (row[nameIdx] ?? "").trim() : "",
          phone: phoneIdx !== -1 ? (row[phoneIdx] ?? "").trim() : "",
          tipo: tipoCell || (src.tipo ?? "").trim(),
          invitedBy: convIdx !== -1 ? (row[convIdx] ?? "").trim() : "",
          saleEmail: saleEmailIdx !== -1 ? (row[saleEmailIdx] ?? "").trim() : "",
          buyAt: dataIdx !== -1 ? (row[dataIdx] ?? "").trim() : "",
          ticket: ingressoIdx !== -1 ? (row[ingressoIdx] ?? "").trim() : "",
        });
      }
    }
    return Array.from(byEmail.values());
  }

  // Helper: emails que se declararam "Empresário(a) dono de restaurante" no
  // campo "Você é:" de qualquer planilha de RESPOSTAS. Usado pra destacar o
  // fornecedor que também é dono de restaurante no Mapa do Evento.
  async function loadRestaurantOwners(stageId: string): Promise<Set<string>> {
    const surveys = await fastify.db
      .select({
        spreadsheetId: stageSalesPlanSources.spreadsheetId,
        sheetName: stageSalesPlanSources.sheetName,
        mapping: stageSalesPlanSources.mapping,
      })
      .from(stageSalesPlanSources)
      .where(
        and(eq(stageSalesPlanSources.stageId, stageId), eq(stageSalesPlanSources.role, "survey")),
      )
      .orderBy(asc(stageSalesPlanSources.sortOrder));

    const TARGET = "empresário(a) dono de restaurante";
    const out = new Set<string>();
    for (const src of surveys) {
      const mapping = (src.mapping ?? {}) as { email?: string };
      let data;
      try {
        data = await readSheetData(src.spreadsheetId, src.sheetName);
      } catch {
        continue;
      }
      const { headers, rows } = data;
      const emailIdx = mapping.email ? headers.indexOf(mapping.email) : -1;
      const norm = (s: string) => s.trim().toLowerCase();
      const vidx = headers.findIndex((h) => norm(h).startsWith("você é") || norm(h).startsWith("voce e"));
      if (emailIdx === -1 || vidx === -1) continue;
      for (const row of rows) {
        const email = (row[emailIdx] ?? "").trim().toLowerCase();
        if (!email) continue;
        if (norm(row[vidx] ?? "") === TARGET) out.add(email);
      }
    }
    return out;
  }

  // Normaliza nome p/ match tolerante: sem acento, minúsculo, espaços colapsados.
  function normName(s: string): string {
    return s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  // Detecta a coluna de NOME da pessoa numa survey pelo header (heurística):
  // contém "nome" mas não se refere a restaurante/empresa/negócio.
  function findNameIdx(headers: string[]): number {
    return headers.findIndex((h) => {
      const n = h.trim().toLowerCase();
      return (
        n.includes("nome") &&
        !n.includes("restaurante") &&
        !n.includes("empresa") &&
        !n.includes("negócio") &&
        !n.includes("negocio") &&
        !n.includes("fantasia")
      );
    });
  }

  // Normaliza telefone p/ match: só dígitos, tira DDI 55, mantém os últimos 8
  // (núcleo do número) — tolerante a DDD/9º dígito/formatação. "" se inválido.
  function normPhone(s: string): string {
    let d = (s ?? "").replace(/\D/g, "");
    if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
    return d.length >= 8 ? d.slice(-8) : "";
  }

  // Detecta a coluna de telefone/WhatsApp numa survey pelo header.
  function findPhoneIdx(headers: string[]): number {
    return headers.findIndex((h) => {
      const n = h.trim().toLowerCase();
      return n.includes("whatsapp") || n.includes("telefone") || n.includes("celular");
    });
  }

  // Parse "DD/MM/YYYY HH:MM[:SS]" (compra, planilha) → epoch ms (componentes
  // tratados como UTC, só p/ comparação relativa). null se não casar.
  function parseBuyAt(s: string): number | null {
    const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/);
    if (!m) return null;
    return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  }
  // Parse "YYYY-MM-DD HH:MM[:SS]" (resposta Tally) → epoch ms (idem).
  function parseSurveyAt(s: string): number | null {
    const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  }
  function median(nums: number[]): number | null {
    if (nums.length === 0) return null;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // Helper: faturamento das planilhas de RESPOSTAS (role "survey"), indexado por
  // email E por nome. O nome é fallback pro caso de o lead comprar com um email e
  // responder a pesquisa com outro. byName guarda `null` quando o mesmo nome
  // aparece com faturamentos divergentes (ambíguo → não chuta).
  // Faturamento + horário da resposta (pra evidência temporal do match por nome).
  type Rev = { value: number; surveyAt: string };
  async function loadRevenue(
    stageId: string,
  ): Promise<{
    byEmail: Map<string, Rev>;
    byPhone: Map<string, Rev | null>;
    byName: Map<string, Rev | null>;
    anonymous: Rev[];
  }> {
    const surveys = await fastify.db
      .select({
        spreadsheetId: stageSalesPlanSources.spreadsheetId,
        sheetName: stageSalesPlanSources.sheetName,
        mapping: stageSalesPlanSources.mapping,
      })
      .from(stageSalesPlanSources)
      .where(
        and(eq(stageSalesPlanSources.stageId, stageId), eq(stageSalesPlanSources.role, "survey")),
      )
      .orderBy(asc(stageSalesPlanSources.sortOrder));

    const byEmail = new Map<string, Rev>();
    const byPhone = new Map<string, Rev | null>();
    const byName = new Map<string, Rev | null>();
    const anonymous: Rev[] = [];
    for (const src of surveys) {
      const mapping = (src.mapping ?? {}) as { email?: string; faturamento?: string; name?: string };
      let data;
      try {
        data = await readSheetData(src.spreadsheetId, src.sheetName);
      } catch {
        continue;
      }
      const { headers, rows } = data;
      const emailIdx = mapping.email ? headers.indexOf(mapping.email) : -1;
      const fatIdx = mapping.faturamento ? headers.indexOf(mapping.faturamento) : -1;
      if (fatIdx === -1) continue;
      // nome: usa o mapping se houver, senão detecta pelo header.
      const nameIdx = mapping.name ? headers.indexOf(mapping.name) : findNameIdx(headers);
      const phoneIdx = findPhoneIdx(headers);
      // horário da resposta (Tally) — pra evidência temporal do match por nome.
      const subIdx = headers.findIndex((h) => h.trim().toLowerCase() === "submitted at");
      // helper de conflito → marca ambíguo (null) p/ não chutar.
      const put = (map: Map<string, Rev | null>, key: string, rev: Rev, value: number) => {
        if (!key) return;
        if (map.has(key)) {
          const ex = map.get(key);
          if (ex && ex.value !== value) map.set(key, null);
        } else {
          map.set(key, rev);
        }
      };
      for (const row of rows) {
        const raw = (row[fatIdx] ?? "").trim();
        if (!raw) continue;
        const value = parseFaturamento(raw);
        if (value == null) continue;
        const surveyAt = subIdx !== -1 ? (row[subIdx] ?? "").trim() : "";
        const rev: Rev = { value, surveyAt };

        const email = emailIdx !== -1 ? (row[emailIdx] ?? "").trim().toLowerCase() : "";
        const phoneKey = phoneIdx !== -1 ? normPhone(row[phoneIdx] ?? "") : "";
        const nameKey = nameIdx !== -1 ? normName(row[nameIdx] ?? "") : "";

        if (email && !byEmail.has(email)) byEmail.set(email, rev);
        put(byPhone, phoneKey, rev, value);
        put(byName, nameKey, rev, value);

        // Resposta sem NENHUMA identidade (email/telefone/nome) — só dá pra casar
        // pela proximidade do horário da resposta com o da compra do lead.
        if (!email && !phoneKey && !nameKey && surveyAt) anonymous.push(rev);
      }
    }
    return { byEmail, byPhone, byName, anonymous };
  }

  // ---- LEADS DO EVENTO (buscador no lançamento da venda) ----
  fastify.get(`${base}/event-leads`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const leads = await loadEventLeads(params.data.stageId);
    return { leads };
  });

  // ---- MAPA DO EVENTO (leads + status: comprou auto / negativa-negociação-pendente) ----
  fastify.get(`${base}/event-map`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const leads = await loadEventLeads(params.data.stageId);
    const revenue = await loadRevenue(params.data.stageId);
    const restaurantOwners = await loadRestaurantOwners(params.data.stageId);

    // "comprou" = lead cujo email tem venda manual nesta etapa. Agrega a info
    // da venda por email: soma do valor + produto/closer/data da venda mais recente.
    const saleRows = await fastify.db
      .select({
        email: manualSales.customerEmail,
        product: manualSales.product,
        value: manualSales.value,
        sellerName: manualSales.sellerName,
        saleDate: manualSales.saleDate,
      })
      .from(manualSales)
      .where(eq(manualSales.stageId, params.data.stageId))
      .orderBy(desc(manualSales.saleDate));

    type SaleInfo = { product: string | null; value: number; sellerName: string | null; saleDate: string | null; count: number };
    const saleByEmail = new Map<string, SaleInfo>();
    for (const r of saleRows) {
      const email = (r.email ?? "").trim().toLowerCase();
      if (!email) continue;
      const existing = saleByEmail.get(email);
      const val = Number(r.value) || 0;
      if (!existing) {
        // saleRows vem ordenado por saleDate desc → o 1º por email é o mais recente.
        saleByEmail.set(email, {
          product: r.product,
          value: val,
          sellerName: r.sellerName,
          saleDate: r.saleDate ? r.saleDate.toISOString() : null,
          count: 1,
        });
      } else {
        existing.value += val; // soma o valor de todas as vendas do mesmo email
        existing.count += 1;
      }
    }
    const boughtEmails = new Set(saleByEmail.keys());

    // status manual salvo (negativa / em negociação / pendente) + vendedor atribuído
    const statusRows = await fastify.db
      .select({
        leadEmail: stageEventLeadStatus.leadEmail,
        status: stageEventLeadStatus.status,
        assignedSeller: stageEventLeadStatus.assignedSeller,
      })
      .from(stageEventLeadStatus)
      .where(eq(stageEventLeadStatus.stageId, params.data.stageId));
    const storedStatus = new Map(statusRows.map((r) => [r.leadEmail.toLowerCase(), r.status]));
    // Atribuição de vendedor é ortogonal ao status: vale para qualquer lead (até "comprou").
    const sellerByEmail = new Map(
      statusRows.filter((r) => r.assignedSeller).map((r) => [r.leadEmail.toLowerCase(), r.assignedSeller]),
    );

    // Offset sistemático (fuso/relógio) entre a compra (planilha, BRT) e a resposta
    // da pesquisa (Tally, UTC), derivado dos matches CONFIÁVEIS por email — é a mesma
    // pessoa, então o gap deles é puro offset. Mediana é robusta a quem respondeu
    // a pesquisa noutro dia. Usado pra normalizar o gap dos matches por nome.
    const offsets: number[] = [];
    for (const l of leads) {
      const rev = revenue.byEmail.get(l.email);
      if (!rev || !rev.surveyAt) continue;
      const b = parseBuyAt(l.buyAt);
      const s = parseSurveyAt(rev.surveyAt);
      if (b != null && s != null) offsets.push(s - b);
    }
    const tzOffset = median(offsets); // ms; null se não houver pares por email

    const summary = { total: leads.length, bought: 0, negotiating: 0, declined: 0, pending: 0, revenue: 0 };
    const out = leads.map((l) => {
      const { buyAt, ...base } = l;
      let status: "pending" | "negotiating" | "bought" | "declined";
      let sale: { product: string | null; value: number; sellerName: string | null; saleDate: string | null; count: number } | null = null;
      if (boughtEmails.has(l.email)) {
        status = "bought";
        sale = saleByEmail.get(l.email) ?? null;
        if (sale) summary.revenue += sale.value;
      } else {
        const s = storedStatus.get(l.email);
        status = s === "negotiating" || s === "declined" ? s : "pending";
      }
      if (status === "bought") summary.bought += 1;
      else if (status === "negotiating") summary.negotiating += 1;
      else if (status === "declined") summary.declined += 1;
      else summary.pending += 1;

      // Faturamento: email → telefone (ambos confiáveis e únicos) → nome (possível,
      // com evidência temporal). Comprou com um email e respondeu a pesquisa com
      // outro. byPhone/byName null = ambíguo → ignora.
      let revVal: number | null = null;
      let revenueMatch: "email" | "phone" | "name" | "time" | null = null;
      let revenueMatchInfo: { buyAt: string | null; surveyAt: string | null; gapMinutes: number | null } | null = null;
      const emailRev = revenue.byEmail.get(l.email);
      const phone = normPhone(l.phone);
      const phoneRev = phone ? revenue.byPhone.get(phone) : undefined;
      if (emailRev) {
        revVal = emailRev.value;
        revenueMatch = "email";
      } else if (phoneRev) {
        revVal = phoneRev.value;
        revenueMatch = "phone";
      } else if (l.name) {
        const nameRev = revenue.byName.get(normName(l.name));
        if (nameRev) {
          revVal = nameRev.value;
          revenueMatch = "name";
          const b = parseBuyAt(buyAt);
          const sAt = nameRev.surveyAt ? parseSurveyAt(nameRev.surveyAt) : null;
          const gapMinutes =
            b != null && sAt != null && tzOffset != null
              ? Math.round((sAt - b - tzOffset) / 60000)
              : null;
          revenueMatchInfo = { buyAt: buyAt || null, surveyAt: nameRev.surveyAt || null, gapMinutes };
        }
      }

      return {
        ...base,
        status,
        sale,
        revenue: revVal,
        // cast explícito: "time" é atribuído depois (passo de horário), então o
        // TS estreitaria o tipo aqui sem ele.
        revenueMatch: revenueMatch as "email" | "phone" | "name" | "time" | null,
        revenueMatchInfo,
        assignedSeller: sellerByEmail.get(l.email) ?? null,
        isRestaurantOwner: restaurantOwners.has(l.email),
      };
    });

    // 4º nível — respostas ANÔNIMAS (sem email/telefone/nome) casadas por HORÁRIO:
    // a pessoa compra e responde a pesquisa em minutos, então a resposta anônima
    // mais próxima no tempo da compra de um lead ainda sem faturamento é dela.
    // Atribuição 1:1 pelo menor gap, dentro de uma janela apertada.
    if (tzOffset != null && revenue.anonymous.length > 0) {
      const TIME_WINDOW_MIN = 30;
      const candidates = out
        .map((o, idx) => ({ o, buyAt: leads[idx].buyAt, buyMs: parseBuyAt(leads[idx].buyAt) }))
        .filter((x) => x.o.revenue == null && x.buyMs != null);
      const anon = revenue.anonymous
        .map((a) => ({ a, subMs: a.surveyAt ? parseSurveyAt(a.surveyAt) : null }))
        .filter((x) => x.subMs != null);
      const pairs: { ci: number; ai: number; gap: number }[] = [];
      candidates.forEach((c, ci) => {
        anon.forEach((an, ai) => {
          const gap = Math.round((an.subMs! - c.buyMs! - tzOffset) / 60000);
          if (Math.abs(gap) <= TIME_WINDOW_MIN) pairs.push({ ci, ai, gap });
        });
      });
      pairs.sort((x, y) => Math.abs(x.gap) - Math.abs(y.gap));
      const usedC = new Set<number>();
      const usedA = new Set<number>();
      for (const p of pairs) {
        if (usedC.has(p.ci) || usedA.has(p.ai)) continue;
        usedC.add(p.ci);
        usedA.add(p.ai);
        const c = candidates[p.ci];
        const an = anon[p.ai];
        c.o.revenue = an.a.value;
        c.o.revenueMatch = "time";
        c.o.revenueMatchInfo = { buyAt: c.buyAt || null, surveyAt: an.a.surveyAt || null, gapMinutes: p.gap };
      }
    }

    return { leads: out, summary };
  });

  // ---- SET status de um lead (closer marca negativa / em negociação / pendente) ----
  const leadStatusBodySchema = z.object({
    email: z.string().trim().email().max(255),
    status: z.enum(["pending", "negotiating", "declined"]),
    note: z.string().trim().max(2000).nullable().optional(),
  });

  fastify.put(`${base}/event-lead-status`, async (request, reply) => {
    // Convidados PODEM alterar status de lead (o acesso é validado por getProjectAccess/membership).
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = leadStatusBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const email = body.data.email.toLowerCase();
    const now = new Date();
    await fastify.db
      .insert(stageEventLeadStatus)
      .values({
        stageId: params.data.stageId,
        leadEmail: email,
        status: body.data.status,
        note: body.data.note ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [stageEventLeadStatus.stageId, stageEventLeadStatus.leadEmail],
        set: { status: body.data.status, note: body.data.note ?? null, updatedAt: now },
      });

    return { email, status: body.data.status };
  });

  // ---- ATRIBUIR vendedor a um lead (ortogonal ao status) ----
  const leadSellerBodySchema = z.object({
    email: z.string().trim().email().max(255),
    // null limpa a atribuição. String vazia também é tratada como null.
    seller: z.string().trim().max(255).nullable().optional(),
  });

  fastify.put(`${base}/event-lead-seller`, async (request, reply) => {
    // Convidados PODEM atribuir vendedor (o acesso é validado por getProjectAccess/membership).
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = leadSellerBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const email = body.data.email.toLowerCase();
    const seller = body.data.seller?.trim() ? body.data.seller.trim() : null;
    const now = new Date();
    // Upsert: cria a linha com status default 'pending' se ainda não existe;
    // se já existe, só atualiza o vendedor (preserva o status atual).
    await fastify.db
      .insert(stageEventLeadStatus)
      .values({
        stageId: params.data.stageId,
        leadEmail: email,
        status: "pending",
        assignedSeller: seller,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [stageEventLeadStatus.stageId, stageEventLeadStatus.leadEmail],
        set: { assignedSeller: seller, updatedAt: now },
      });

    return { email, seller };
  });

  // ---- ATRIBUIR vendedor a VÁRIOS leads de uma vez (bulk) ----
  const leadSellerBulkBodySchema = z.object({
    emails: z.array(z.string().trim().email().max(255)).min(1).max(5000),
    seller: z.string().trim().max(255).nullable().optional(),
  });

  fastify.put(`${base}/event-lead-seller-bulk`, async (request, reply) => {
    // Convidados PODEM atribuir vendedor em massa (o acesso é validado por getProjectAccess/membership).
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = leadSellerBulkBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const seller = body.data.seller?.trim() ? body.data.seller.trim() : null;
    // Dedup dos emails (case-insensitive).
    const emails = Array.from(new Set(body.data.emails.map((e) => e.toLowerCase())));
    const now = new Date();

    await fastify.db
      .insert(stageEventLeadStatus)
      .values(
        emails.map((email) => ({
          stageId: params.data.stageId,
          leadEmail: email,
          status: "pending",
          assignedSeller: seller,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [stageEventLeadStatus.stageId, stageEventLeadStatus.leadEmail],
        set: { assignedSeller: seller, updatedAt: now },
      });

    return { count: emails.length, seller };
  });

  // ---- RESPOSTAS completas de um lead (todas as colunas das planilhas, por email) ----
  // Usado pela aba "Infos" do modal do lead (Mapa + Plano de Vendas). Junta as
  // linhas de TODAS as fontes conectadas (participants + survey) que casam pelo
  // email, agrupadas por planilha.
  const leadAnswersQuerySchema = z.object({
    email: z.string().trim().email().max(255),
    // telefone e nome do lead — fallback quando o email não casa numa fonte
    // (comprou com um email e respondeu a pesquisa com outro).
    phone: z.string().trim().max(40).optional(),
    name: z.string().trim().max(255).optional(),
    // "Submitted at" da resposta casada por horário (resposta anônima) — fallback
    // final pra localizar a linha exata pela hora de submissão.
    surveyAt: z.string().trim().max(40).optional(),
  });

  fastify.get(`${base}/event-lead-answers`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const query = leadAnswersQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "Email inválido" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const target = query.data.email.trim().toLowerCase();
    const targetPhone = query.data.phone ? normPhone(query.data.phone) : "";
    const targetName = query.data.name ? normName(query.data.name) : "";
    const targetSurveyAt = query.data.surveyAt ? query.data.surveyAt.trim() : "";

    const sources = await fastify.db
      .select({
        role: stageSalesPlanSources.role,
        tipo: stageSalesPlanSources.tipo,
        spreadsheetName: stageSalesPlanSources.spreadsheetName,
        spreadsheetId: stageSalesPlanSources.spreadsheetId,
        sheetName: stageSalesPlanSources.sheetName,
        mapping: stageSalesPlanSources.mapping,
      })
      .from(stageSalesPlanSources)
      .where(eq(stageSalesPlanSources.stageId, params.data.stageId))
      .orderBy(asc(stageSalesPlanSources.sortOrder));

    const groups: { source: string; role: string; answers: { label: string; value: string }[] }[] = [];
    for (const src of sources) {
      const mapping = (src.mapping ?? {}) as { email?: string; name?: string };
      if (!mapping.email) continue;
      let data;
      try {
        data = await readSheetData(src.spreadsheetId, src.sheetName);
      } catch {
        continue;
      }
      const { headers, rows } = data;
      const emailIdx = headers.indexOf(mapping.email);
      if (emailIdx === -1) continue;
      let match = rows.find((row) => (row[emailIdx] ?? "").trim().toLowerCase() === target);
      // Fallback por telefone e depois por nome: o lead pode ter comprado com um
      // email e respondido a pesquisa com outro — aí o match por email falha aqui.
      if (!match && targetPhone) {
        const phoneIdx = findPhoneIdx(headers);
        if (phoneIdx !== -1) {
          match = rows.find((row) => normPhone(row[phoneIdx] ?? "") === targetPhone);
        }
      }
      if (!match && targetName) {
        const nameIdx = mapping.name ? headers.indexOf(mapping.name) : findNameIdx(headers);
        if (nameIdx !== -1) {
          match = rows.find((row) => normName(row[nameIdx] ?? "") === targetName);
        }
      }
      // Fallback por horário de submissão (resposta anônima casada por tempo).
      if (!match && targetSurveyAt) {
        const subIdx = headers.findIndex((h) => h.trim().toLowerCase() === "submitted at");
        if (subIdx !== -1) {
          match = rows.find((row) => (row[subIdx] ?? "").trim() === targetSurveyAt);
        }
      }
      if (!match) continue;
      // Monta label→value de todas as colunas não vazias da linha (mantém a ordem das colunas).
      const answers: { label: string; value: string }[] = [];
      for (let i = 0; i < headers.length; i++) {
        const label = (headers[i] ?? "").trim();
        const value = (match[i] ?? "").trim();
        if (!label || !value) continue;
        answers.push({ label, value });
      }
      if (answers.length === 0) continue;
      groups.push({
        source: src.spreadsheetName || src.tipo || src.sheetName,
        role: src.role,
        answers,
      });
    }

    return { email: target, groups };
  });
});
