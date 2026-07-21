/**
 * Epic 40 / Story 40.1 — Etapa Comercial (CRM).
 *
 * Kanban de COMPRADORES: importa quem comprou nas etapas-fonte configuradas
 * (planilhas de venda + vendas manuais ativas), dedup por email (1 card por
 * pessoa, N compras em `products`), enriquece com a pesquisa (match por
 * email/telefone) e organiza em colunas configuráveis.
 *
 * Regra de ouro: o sync NUNCA move card de coluna — só cria novos (na 1ª
 * coluna) e faz merge das compras. O trabalho do time no kanban é preservado.
 */

import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnels,
  funnelSpreadsheets,
  funnelStages,
  funnelSurveys,
  manualSales,
  projects,
  projectMembers,
  stageComercialConfig,
  stageCrmCards,
  stageCrmColumns,
  stageSalesSpreadsheets,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";

const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

// Colunas padrão definidas pelo Lucas (fluxo real do comercial).
const DEFAULT_COLUMNS: { name: string; isTerminal: boolean }[] = [
  { name: "Novo", isTerminal: false },
  { name: "Ligação feita", isTerminal: false },
  { name: "Aplicação pendente", isTerminal: false },
  { name: "Reprovado na call", isTerminal: true },
  { name: "Reprovado na aplicação", isTerminal: true },
  { name: "Aplicou", isTerminal: false },
  { name: "Matriculou / Venda", isTerminal: true },
];

// Subtypes de planilha que são VENDA de verdade (39.6 — capture fica fora).
const SALES_SUBTYPES = ["main_product", "sales", "tmb", "event_sales"];

function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Match de cabeçalho por aliases (exato, normalizado sem acento/pontuação). */
function findHeaderByAliases(headers: string[], aliases: string[]): number {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const H = headers.map(norm);
  for (const a of aliases) {
    const i = H.indexOf(norm(a));
    if (i >= 0) return i;
  }
  return -1;
}
// Detecção fuzzy de email/telefone por SUBSTRING — o findHeaderByAliases só
// casa exato, e planilhas de pesquisa (Tally) usam headers como "Agora seu
// e-mail:" / "E o seu WhatsApp:". Mesma heurística do survey-aggregation.
function findEmailHeader(headers: string[]): number {
  return headers.findIndex((h) => /e-?mail/i.test(h));
}
function findPhoneHeader(headers: string[]): number {
  return headers.findIndex((h) => /whats|telefone|celular|phone|fone/i.test(h));
}
const PRODUCT_ALIASES = ["produto", "product", "nome do produto", "oferta", "plano", "curso"];
const NAME_ALIASES = ["nome", "name", "nome completo", "cliente", "nome do cliente"];
const PHONE_ALIASES = ["telefone", "phone", "whatsapp", "celular", "fone"];
const EMAIL_ALIASES = ["email", "e-mail", "e mail"];
function phoneTail8(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : "";
}
function parseBrNumber(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = String(val).replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const normalized = hasComma ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return parseFloat(normalized) || 0;
}
function parseSheetDate(val: string | undefined): Date | null {
  if (!val) return null;
  const t = String(val).trim();
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const d = new Date(parseInt(br[3], 10), parseInt(br[2], 10) - 1, parseInt(br[1], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

interface Purchase {
  produto: string;
  valor: number;
  dataVenda: string | null;
  fonte: string;
}
interface Buyer {
  email: string;
  name: string | null;
  phone: string | null;
  purchases: Purchase[];
  /** Perfil hot/cold pela utm_term da venda (hot vence cold vence null). */
  temperature: "hot" | "cold" | null;
}

// Detecção da coluna utm_term por matcher (planilha de venda não mapeia utm_term
// no columnMapping — mesma heurística do sales-daily-sync).
function findTermHeader(headers: string[]): number {
  const norm = (s: string) => s.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const H = headers.map(norm);
  for (const m of ["utm_term", "utm term", "termo"]) {
    const i = H.findIndex((h) => h === m || h.includes(m));
    if (i >= 0) return i;
  }
  return -1;
}
function classifyTemp(termRaw: string | null | undefined): "hot" | "cold" | null {
  const t = (termRaw ?? "").toLowerCase();
  if (t.includes("hot") || t.includes("quente")) return "hot";
  if (t.includes("cold") || t.includes("frio")) return "cold";
  return null;
}

function shapeCard(r: typeof stageCrmCards.$inferSelect) {
  return {
    id: r.id,
    columnId: r.columnId,
    customerEmail: r.customerEmail,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    products: r.products,
    totalValue: Number(r.totalValue),
    firstPurchaseAt: r.firstPurchaseAt ? r.firstPurchaseAt.toISOString() : null,
    notes: r.notes,
    assigneeName: r.assigneeName,
    callStatus: r.callStatus as "atendeu" | "nao_atendeu" | null,
    callCount: r.callCount,
    temperature: r.temperature as "hot" | "cold" | null,
    sortOrder: r.sortOrder,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export default fp(async function stageComercialRoutes(fastify) {
  async function getStageContext(
    projectId: string,
    funnelId: string,
    stageId: string,
    userId: string,
    userRole: string,
  ) {
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
    if (!project) return null;

    const [stage] = await fastify.db
      .select({ id: funnelStages.id, name: funnelStages.name, stageType: funnelStages.stageType })
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

  /**
   * Compradores das etapas-fonte: planilhas de venda de etapa + vendas manuais
   * ativas + (funil perpétuo) a planilha de vendas do PERPÉTUO — que é ligada
   * ao FUNIL (type='perpetual_sales', stage_id NULL), não à etapa. Sem ela,
   * fonte = etapa de dashboard do perpétuo vinha vazia.
   */
  async function collectBuyers(funnelId: string, sourceStageIds: string[]): Promise<{ buyers: Map<string, Buyer>; skippedNoEmail: number }> {
    const buyers = new Map<string, Buyer>();
    let skippedNoEmail = 0;

    const addPurchase = (
      emailRaw: string,
      name: string | null,
      phone: string | null,
      p: Purchase,
      temperature: "hot" | "cold" | null = null,
    ) => {
      const email = normalizeEmail(emailRaw);
      if (!email) {
        skippedNoEmail++;
        return;
      }
      let b = buyers.get(email);
      if (!b) {
        b = { email, name: null, phone: null, purchases: [], temperature: null };
        buyers.set(email, b);
      }
      if (!b.name && name) b.name = name;
      if (!b.phone && phone) b.phone = phone;
      // hot vence cold vence null (perfil "mais quente" do comprador).
      if (temperature === "hot") b.temperature = "hot";
      else if (temperature === "cold" && b.temperature !== "hot") b.temperature = "cold";
      b.purchases.push(p);
    };

    if (sourceStageIds.length === 0) return { buyers, skippedNoEmail };

    // 1) Planilhas de venda das etapas-fonte (dedup txId+produto — padrão all-sales/39.6).
    const sheets = await fastify.db
      .select()
      .from(stageSalesSpreadsheets)
      .where(
        and(
          inArray(stageSalesSpreadsheets.stageId, sourceStageIds),
          inArray(stageSalesSpreadsheets.subtype, SALES_SUBTYPES),
        ),
      );

    const seenTx = new Set<string>();
    for (const sheet of sheets) {
      const mapping = (sheet.columnMapping ?? {}) as {
        email?: string;
        transactionId?: string;
        customerName?: string;
        productName?: string;
        valorBruto?: string;
        dataVenda?: string;
        telefone?: string;
      };
      let data: { headers: string[]; rows: string[][] };
      try {
        data = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
      } catch {
        continue;
      }
      const col = (n: string | undefined) => (n ? data.headers.indexOf(n) : -1);
      const emailIdx = col(mapping.email);
      const txIdx = col(mapping.transactionId);
      const nameIdx = col(mapping.customerName);
      const produtoIdx = col(mapping.productName);
      const brutoIdx = col(mapping.valorBruto);
      const dataIdx = col(mapping.dataVenda);
      const telIdx = col(mapping.telefone);
      const termIdx = findTermHeader(data.headers);
      if (emailIdx === -1) continue; // planilha sem email (ex. event_sales) não alimenta CRM

      let rowIndex = -1;
      for (const row of data.rows) {
        rowIndex++;
        const email = (row[emailIdx] ?? "").trim();
        if (!email) {
          skippedNoEmail++;
          continue;
        }
        const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() : "";
        const produto = produtoIdx >= 0 ? (row[produtoIdx] ?? "").trim() : "";
        if (txId) {
          const k = `${sheet.id}|tx|${txId}|${produto.toLowerCase()}`;
          if (seenTx.has(k)) continue;
          seenTx.add(k);
        }
        const dt = dataIdx >= 0 ? parseSheetDate(row[dataIdx]) : null;
        addPurchase(
          email,
          nameIdx >= 0 ? (row[nameIdx] ?? "").trim() || null : null,
          telIdx >= 0 ? (row[telIdx] ?? "").trim() || null : null,
          {
            produto: produto || "(sem produto)",
            valor: brutoIdx >= 0 ? parseBrNumber(row[brutoIdx]) : 0,
            dataVenda: dt ? dt.toISOString() : null,
            fonte: `planilha:${sheet.subtype}`,
          },
          termIdx >= 0 ? classifyTemp(row[termIdx]) : null,
        );
      }
    }

    // 2) Planilha de vendas do PERPÉTUO (funnel-level) — entra quando alguma
    // etapa-fonte é a de dashboard (free/paid), que é quem essa planilha atende.
    const sourceStages = await fastify.db
      .select({ id: funnelStages.id, stageType: funnelStages.stageType })
      .from(funnelStages)
      .where(inArray(funnelStages.id, sourceStageIds));
    const hasDashboardSource = sourceStages.some(
      (s) => s.stageType === "free" || s.stageType === "paid",
    );
    if (hasDashboardSource) {
      const [pSheet] = await fastify.db
        .select()
        .from(funnelSpreadsheets)
        .where(and(eq(funnelSpreadsheets.funnelId, funnelId), eq(funnelSpreadsheets.type, "perpetual_sales")))
        .limit(1);
      if (pSheet) {
        const mapping = (pSheet.columnMapping ?? {}) as {
          email?: string;
          transactionId?: string;
          customerName?: string;
          productName?: string;
          valorBruto?: string;
          dataVenda?: string;
        };
        try {
          const data = await readSheetData(pSheet.spreadsheetId, pSheet.sheetName);
          const col = (n: string | undefined) => (n ? data.headers.indexOf(n) : -1);
          const emailIdx = col(mapping.email);
          const txIdx = col(mapping.transactionId);
          // Fallback por alias quando o wizard não mapeou Nome/Produto (caso
          // real: mapping do perpétuo sem productName/customerName → cards
          // "(sem produto)"/"(sem nome)"). Mapping explícito sempre vence.
          let nameIdx = col(mapping.customerName);
          if (nameIdx === -1) nameIdx = findHeaderByAliases(data.headers, NAME_ALIASES);
          let produtoIdx = col(mapping.productName);
          if (produtoIdx === -1) produtoIdx = findHeaderByAliases(data.headers, PRODUCT_ALIASES);
          // 2ª coluna candidata (ex.: "Oferta") — alguns eventos do webhook
          // Kiwify deixam a célula "Produto" vazia mas preenchem "Oferta".
          const produtoAltIdx = findHeaderByAliases(
            data.headers.map((h, i) => (i === produtoIdx ? "" : h)),
            PRODUCT_ALIASES,
          );
          const brutoIdx = col(mapping.valorBruto);
          const dataIdx = col(mapping.dataVenda);
          const telIdx = findHeaderByAliases(data.headers, PHONE_ALIASES);
          const termIdx = findTermHeader(data.headers);
          if (emailIdx !== -1) {
            const seenPerp = new Set<string>();
            for (const row of data.rows) {
              const email = (row[emailIdx] ?? "").trim();
              if (!email) {
                skippedNoEmail++;
                continue;
              }
              const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() : "";
              const produto =
                (produtoIdx >= 0 ? (row[produtoIdx] ?? "").trim() : "") ||
                (produtoAltIdx >= 0 ? (row[produtoAltIdx] ?? "").trim() : "");
              if (txId) {
                const k = `perp|tx|${txId}|${produto.toLowerCase()}`;
                if (seenPerp.has(k)) continue;
                seenPerp.add(k);
              }
              const dt = dataIdx >= 0 ? parseSheetDate(row[dataIdx]) : null;
              addPurchase(
                email,
                nameIdx >= 0 ? (row[nameIdx] ?? "").trim() || null : null,
                telIdx >= 0 ? (row[telIdx] ?? "").trim() || null : null,
                {
                  produto: produto || "(sem produto)",
                  valor: brutoIdx >= 0 ? parseBrNumber(row[brutoIdx]) : 0,
                  dataVenda: dt ? dt.toISOString() : null,
                  fonte: "planilha:perpetuo",
                },
                termIdx >= 0 ? classifyTemp(row[termIdx]) : null,
              );
            }
          }
        } catch {
          // planilha inacessível — segue com as demais fontes
        }
      }
    }

    // 3) Vendas manuais ATIVAS (reembolsada não entra no CRM).
    const manualRows = await fastify.db
      .select()
      .from(manualSales)
      .where(inArray(manualSales.stageId, sourceStageIds));
    for (const r of manualRows) {
      if (r.refundedAt) continue;
      addPurchase(r.customerEmail ?? "", r.customerName, r.customerPhone, {
        produto: r.product ?? "(sem produto)",
        valor: Number(r.value) || 0,
        dataVenda: r.saleDate.toISOString(),
        fonte: "manual",
      });
    }

    return { buyers, skippedNoEmail };
  }

  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/crm";

  // ---- GET / — board completo (config + colunas + cards) ----
  fastify.get(base, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const stage = await getStageContext(
      params.data.projectId, params.data.funnelId, params.data.stageId,
      request.userId, request.userRole,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const [config] = await fastify.db
      .select()
      .from(stageComercialConfig)
      .where(eq(stageComercialConfig.stageId, params.data.stageId))
      .limit(1);

    const columns = await fastify.db
      .select()
      .from(stageCrmColumns)
      .where(eq(stageCrmColumns.stageId, params.data.stageId))
      .orderBy(asc(stageCrmColumns.sortOrder), asc(stageCrmColumns.createdAt));

    const cards = await fastify.db
      .select()
      .from(stageCrmCards)
      .where(eq(stageCrmCards.stageId, params.data.stageId))
      .orderBy(asc(stageCrmCards.sortOrder), desc(stageCrmCards.totalValue));

    return {
      configured: Boolean(config && (config.sourceStageIds?.length ?? 0) > 0),
      sourceStageIds: config?.sourceStageIds ?? [],
      columns: columns.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        isTerminal: c.isTerminal,
      })),
      cards: cards.map(shapeCard),
    };
  });

  // ---- PUT /config — etapas-fonte (upsert + seed das colunas default) ----
  const configBodySchema = z.object({ sourceStageIds: z.array(z.string().uuid()).max(20) });
  fastify.put(`${base}/config`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = configBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

    const stage = await getStageContext(
      params.data.projectId, params.data.funnelId, params.data.stageId,
      request.userId, request.userRole,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });
    if (stage.stageType !== "comercial") {
      return reply.code(400).send({ error: "CRM é exclusivo da etapa Comercial" });
    }
    // A própria etapa não pode ser fonte dela mesma.
    const sourceStageIds = body.data.sourceStageIds.filter((id) => id !== params.data.stageId);

    await fastify.db
      .insert(stageComercialConfig)
      .values({ stageId: params.data.stageId, sourceStageIds, createdBy: request.userId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: stageComercialConfig.stageId,
        set: { sourceStageIds, updatedAt: new Date() },
      });

    // Seed das colunas default na primeira configuração.
    const existing = await fastify.db
      .select({ id: stageCrmColumns.id })
      .from(stageCrmColumns)
      .where(eq(stageCrmColumns.stageId, params.data.stageId))
      .limit(1);
    if (existing.length === 0) {
      await fastify.db.insert(stageCrmColumns).values(
        DEFAULT_COLUMNS.map((c, i) => ({
          stageId: params.data.stageId,
          name: c.name,
          isTerminal: c.isTerminal,
          sortOrder: i,
        })),
      );
    }

    return { ok: true, sourceStageIds };
  });

  // ---- POST /sync — importa compradores (idempotente; NUNCA move card) ----
  fastify.post(
    `${base}/sync`,
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const stage = await getStageContext(
        params.data.projectId, params.data.funnelId, params.data.stageId,
        request.userId, request.userRole,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [config] = await fastify.db
        .select()
        .from(stageComercialConfig)
        .where(eq(stageComercialConfig.stageId, params.data.stageId))
        .limit(1);
      const sourceStageIds = config?.sourceStageIds ?? [];
      if (sourceStageIds.length === 0) {
        return { configured: false, created: 0, updated: 0, skippedNoEmail: 0 };
      }

      const columns = await fastify.db
        .select()
        .from(stageCrmColumns)
        .where(eq(stageCrmColumns.stageId, params.data.stageId))
        .orderBy(asc(stageCrmColumns.sortOrder));
      if (columns.length === 0) {
        return reply.code(409).send({ error: "Kanban sem colunas — salve a configuração primeiro" });
      }
      const firstColumn = columns[0];

      const { buyers, skippedNoEmail } = await collectBuyers(params.data.funnelId, sourceStageIds);

      const existingCards = await fastify.db
        .select()
        .from(stageCrmCards)
        .where(eq(stageCrmCards.stageId, params.data.stageId));
      const byEmail = new Map(existingCards.map((c) => [c.customerEmail, c]));
      let maxSortInFirst = existingCards
        .filter((c) => c.columnId === firstColumn.id)
        .reduce((mx, c) => Math.max(mx, c.sortOrder), -1);

      let created = 0;
      let updated = 0;
      for (const buyer of buyers.values()) {
        const totalValue = buyer.purchases.reduce((s, p) => s + p.valor, 0);
        const firstPurchase = buyer.purchases
          .map((p) => (p.dataVenda ? new Date(p.dataVenda) : null))
          .filter((d): d is Date => d !== null)
          .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

        const existing = byEmail.get(buyer.email);
        if (!existing) {
          maxSortInFirst++;
          await fastify.db.insert(stageCrmCards).values({
            stageId: params.data.stageId,
            columnId: firstColumn.id,
            customerEmail: buyer.email,
            customerName: buyer.name,
            customerPhone: buyer.phone,
            products: buyer.purchases,
            totalValue: totalValue.toFixed(2),
            firstPurchaseAt: firstPurchase,
            temperature: buyer.temperature,
            sortOrder: maxSortInFirst,
          }).onConflictDoNothing();
          created++;
        } else {
          // Merge: atualiza compras/contatos, PRESERVA coluna/notas/responsável.
          const changed =
            JSON.stringify(existing.products) !== JSON.stringify(buyer.purchases) ||
            Number(existing.totalValue) !== totalValue ||
            (existing.temperature ?? null) !== (buyer.temperature ?? null);
          if (changed || (!existing.customerName && buyer.name) || (!existing.customerPhone && buyer.phone)) {
            await fastify.db
              .update(stageCrmCards)
              .set({
                products: buyer.purchases,
                totalValue: totalValue.toFixed(2),
                firstPurchaseAt: firstPurchase ?? existing.firstPurchaseAt,
                customerName: existing.customerName ?? buyer.name,
                customerPhone: existing.customerPhone ?? buyer.phone,
                // Atualiza a temperatura só quando conseguimos classificar (não
                // apaga um hot/cold já detectado se um re-sync vier sem utm_term).
                temperature: buyer.temperature ?? existing.temperature,
                updatedAt: new Date(),
              })
              .where(eq(stageCrmCards.id, existing.id));
            updated++;
          }
        }
      }

      return { configured: true, created, updated, skippedNoEmail, totalBuyers: buyers.size };
    },
  );

  // ---- Colunas ----
  const columnBodySchema = z.object({
    name: z.string().trim().min(1).max(80),
    isTerminal: z.boolean().optional(),
  });
  fastify.post(`${base}/columns`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = columnBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });
    const stage = await getStageContext(
      params.data.projectId, params.data.funnelId, params.data.stageId,
      request.userId, request.userRole,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const cols = await fastify.db
      .select({ sortOrder: stageCrmColumns.sortOrder })
      .from(stageCrmColumns)
      .where(eq(stageCrmColumns.stageId, params.data.stageId));
    const nextOrder = cols.reduce((mx, c) => Math.max(mx, c.sortOrder), -1) + 1;

    const [createdCol] = await fastify.db
      .insert(stageCrmColumns)
      .values({
        stageId: params.data.stageId,
        name: body.data.name,
        isTerminal: body.data.isTerminal ?? false,
        sortOrder: nextOrder,
      })
      .returning();
    return reply.code(201).send({ id: createdCol.id, name: createdCol.name, sortOrder: createdCol.sortOrder, isTerminal: createdCol.isTerminal });
  });

  const columnParamsSchema = stageParamsSchema.extend({ columnId: z.string().uuid() });
  fastify.patch(`${base}/columns/:columnId`, async (request, reply) => {
    const params = columnParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = columnBodySchema.partial().safeParse(request.body);
    if (!body.success || Object.keys(body.data).length === 0) {
      return reply.code(400).send({ error: "Dados inválidos" });
    }
    const stage = await getStageContext(
      params.data.projectId, params.data.funnelId, params.data.stageId,
      request.userId, request.userRole,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const [updatedCol] = await fastify.db
      .update(stageCrmColumns)
      .set({ ...body.data, updatedAt: new Date() })
      .where(and(eq(stageCrmColumns.id, params.data.columnId), eq(stageCrmColumns.stageId, params.data.stageId)))
      .returning();
    if (!updatedCol) return reply.code(404).send({ error: "Coluna não encontrada" });
    return { ok: true };
  });

  fastify.delete(`${base}/columns/:columnId`, async (request, reply) => {
    const params = columnParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const stage = await getStageContext(
      params.data.projectId, params.data.funnelId, params.data.stageId,
      request.userId, request.userRole,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const [hasCard] = await fastify.db
      .select({ id: stageCrmCards.id })
      .from(stageCrmCards)
      .where(and(eq(stageCrmCards.columnId, params.data.columnId), eq(stageCrmCards.stageId, params.data.stageId)))
      .limit(1);
    if (hasCard) return reply.code(409).send({ error: "Coluna tem cards — mova-os antes de excluir" });

    const deleted = await fastify.db
      .delete(stageCrmColumns)
      .where(and(eq(stageCrmColumns.id, params.data.columnId), eq(stageCrmColumns.stageId, params.data.stageId)))
      .returning({ id: stageCrmColumns.id });
    if (deleted.length === 0) return reply.code(404).send({ error: "Coluna não encontrada" });
    return { ok: true };
  });

  const reorderSchema = z.object({ columnIds: z.array(z.string().uuid()).min(1).max(30) });
  fastify.patch(`${base}/columns-reorder`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = reorderSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });
    const stage = await getStageContext(
      params.data.projectId, params.data.funnelId, params.data.stageId,
      request.userId, request.userRole,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    for (let i = 0; i < body.data.columnIds.length; i++) {
      await fastify.db
        .update(stageCrmColumns)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(stageCrmColumns.id, body.data.columnIds[i]), eq(stageCrmColumns.stageId, params.data.stageId)));
    }
    return { ok: true };
  });

  // ---- Cards ----
  const cardParamsSchema = stageParamsSchema.extend({ cardId: z.string().uuid() });
  const cardPatchSchema = z.object({
    columnId: z.string().uuid().optional(),
    sortOrder: z.number().int().min(0).optional(),
    notes: z.string().max(5000).nullable().optional(),
    assigneeName: z.string().max(255).nullable().optional(),
    callStatus: z.enum(["atendeu", "nao_atendeu"]).nullable().optional(),
    callCount: z.number().int().min(0).max(999).optional(),
  });
  fastify.patch(`${base}/cards/:cardId`, async (request, reply) => {
    const params = cardParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = cardPatchSchema.safeParse(request.body);
    if (!body.success || Object.keys(body.data).length === 0) {
      return reply.code(400).send({ error: "Dados inválidos" });
    }
    const stage = await getStageContext(
      params.data.projectId, params.data.funnelId, params.data.stageId,
      request.userId, request.userRole,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    if (body.data.columnId) {
      const [colOk] = await fastify.db
        .select({ id: stageCrmColumns.id })
        .from(stageCrmColumns)
        .where(and(eq(stageCrmColumns.id, body.data.columnId), eq(stageCrmColumns.stageId, params.data.stageId)))
        .limit(1);
      if (!colOk) return reply.code(400).send({ error: "Coluna inválida" });
    }

    const updates: Partial<typeof stageCrmCards.$inferInsert> = { updatedAt: new Date() };
    if (body.data.columnId !== undefined) updates.columnId = body.data.columnId;
    if (body.data.sortOrder !== undefined) updates.sortOrder = body.data.sortOrder;
    if (body.data.notes !== undefined) updates.notes = body.data.notes ?? null;
    if (body.data.assigneeName !== undefined) updates.assigneeName = body.data.assigneeName?.trim() || null;
    if (body.data.callStatus !== undefined) updates.callStatus = body.data.callStatus ?? null;
    if (body.data.callCount !== undefined) updates.callCount = body.data.callCount;

    const [updatedCard] = await fastify.db
      .update(stageCrmCards)
      .set(updates)
      .where(and(eq(stageCrmCards.id, params.data.cardId), eq(stageCrmCards.stageId, params.data.stageId)))
      .returning();
    if (!updatedCard) return reply.code(404).send({ error: "Card não encontrado" });
    return shapeCard(updatedCard);
  });

  fastify.delete(`${base}/cards/:cardId`, async (request, reply) => {
    const params = cardParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const stage = await getStageContext(
      params.data.projectId, params.data.funnelId, params.data.stageId,
      request.userId, request.userRole,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const deleted = await fastify.db
      .delete(stageCrmCards)
      .where(and(eq(stageCrmCards.id, params.data.cardId), eq(stageCrmCards.stageId, params.data.stageId)))
      .returning({ id: stageCrmCards.id });
    if (deleted.length === 0) return reply.code(404).send({ error: "Card não encontrado" });
    return { ok: true };
  });

  // ---- GET /cards/:cardId/survey — pesquisa do comprador (match email/telefone) ----
  fastify.get(`${base}/cards/:cardId/survey`, async (request, reply) => {
    const params = cardParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const stage = await getStageContext(
      params.data.projectId, params.data.funnelId, params.data.stageId,
      request.userId, request.userRole,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const [card] = await fastify.db
      .select()
      .from(stageCrmCards)
      .where(and(eq(stageCrmCards.id, params.data.cardId), eq(stageCrmCards.stageId, params.data.stageId)))
      .limit(1);
    if (!card) return reply.code(404).send({ error: "Card não encontrado" });

    const [config] = await fastify.db
      .select()
      .from(stageComercialConfig)
      .where(eq(stageComercialConfig.stageId, params.data.stageId))
      .limit(1);
    const sourceStageIds = config?.sourceStageIds ?? [];
    if (sourceStageIds.length === 0) return { matched: false, answers: [] };

    // Surveys das etapas-fonte + as de nível FUNIL (stage_id NULL — legado).
    const sourceStages = await fastify.db
      .select({ id: funnelStages.id, funnelId: funnelStages.funnelId })
      .from(funnelStages)
      .where(inArray(funnelStages.id, sourceStageIds));
    const funnelIds = [...new Set(sourceStages.map((s) => s.funnelId))];

    const surveys = await fastify.db
      .select()
      .from(funnelSurveys)
      .where(
        or(
          inArray(funnelSurveys.stageId, sourceStageIds),
          and(inArray(funnelSurveys.funnelId, funnelIds), isNull(funnelSurveys.stageId)),
        ),
      );

    const targetEmail = normalizeEmail(card.customerEmail);
    const targetPhone = phoneTail8(card.customerPhone);

    for (const survey of surveys) {
      const mapping = (survey.columnMapping ?? {}) as {
        email?: string;
        phone?: string;
        faixa?: string;
        questions?: { columnName: string; label: string; showInDashboard?: boolean }[];
      };
      let data: { headers: string[]; rows: string[][] };
      try {
        data = await readSheetData(survey.spreadsheetId, survey.sheetName);
      } catch {
        continue;
      }
      const col = (n: string | undefined) => (n ? data.headers.indexOf(n) : -1);
      // Fallback fuzzy: pesquisa Tally costuma NÃO ter email/telefone mapeados
      // (só as perguntas). Sem isto, o card de quem respondeu + comprou fica
      // "sem pesquisa" mesmo com a resposta na planilha.
      let emailIdx = col(mapping.email);
      if (emailIdx === -1) emailIdx = findEmailHeader(data.headers);
      let phoneIdx = col(mapping.phone);
      if (phoneIdx === -1) phoneIdx = findPhoneHeader(data.headers);
      if (emailIdx === -1 && phoneIdx === -1) continue;

      const row = data.rows.find((r) => {
        if (emailIdx >= 0 && targetEmail && normalizeEmail(r[emailIdx]) === targetEmail) return true;
        if (phoneIdx >= 0 && targetPhone && phoneTail8(r[phoneIdx]) === targetPhone) return true;
        return false;
      });
      if (!row) continue;

      // Q&A: perguntas mapeadas + faixa; sem mapping.questions → todas as
      // colunas menos identificadores/UTM/timestamp (app interno, sem PII externa).
      const answers: { label: string; answer: string }[] = [];
      const mappedQuestions = mapping.questions ?? [];
      if (mappedQuestions.length > 0) {
        for (const q of mappedQuestions) {
          const idx = data.headers.indexOf(q.columnName);
          const val = idx >= 0 ? (row[idx] ?? "").trim() : "";
          if (val) answers.push({ label: q.label, answer: val });
        }
      } else {
        // Sem mapping.questions: toda coluna vira resposta MENOS identificadores/
        // UTM/timestamp e as colunas de SISTEMA do Tally (Submission/Respondent
        // ID, Submitted at) — que senão apareciam como "resposta" lixo no card.
        const skipRe = /email|e-mail|telefone|phone|whats|celular|utm_|timestamp|carimbo|^data$|submission|respondent|submitted/i;
        data.headers.forEach((h, i) => {
          if (skipRe.test(h.trim())) return;
          const val = (row[i] ?? "").trim();
          if (val) answers.push({ label: h.trim(), answer: val });
        });
      }
      if (mapping.faixa) {
        const idx = data.headers.indexOf(mapping.faixa);
        const val = idx >= 0 ? (row[idx] ?? "").trim() : "";
        if (val && !answers.some((a) => a.label.toLowerCase().includes("faixa"))) {
          answers.push({ label: "Faixa (lead score)", answer: val });
        }
      }

      return { matched: true, matchedBy: emailIdx >= 0 && targetEmail && normalizeEmail(row[emailIdx]) === targetEmail ? "email" : "phone", answers };
    }

    // Fallback (caso real do perpétuo): a pesquisa não está em funnel_surveys —
    // as respostas vivem na PLANILHA DE LEADS da aba Planilhas (funnel_spreadsheets
    // type 'leads'/'custom'). Match por email/telefone (mapping ou alias) e Q&A =
    // colunas menos identificadores/UTM/timestamp.
    const leadSheets = await fastify.db
      .select()
      .from(funnelSpreadsheets)
      .where(
        and(
          inArray(funnelSpreadsheets.funnelId, funnelIds),
          inArray(funnelSpreadsheets.type, ["leads", "custom"]),
        ),
      );

    for (const sheet of leadSheets) {
      const mapping = (sheet.columnMapping ?? {}) as { email?: string; phone?: string; name?: string };
      let data: { headers: string[]; rows: string[][] };
      try {
        data = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
      } catch {
        continue;
      }
      let emailIdx = mapping.email ? data.headers.indexOf(mapping.email) : -1;
      if (emailIdx === -1) emailIdx = findHeaderByAliases(data.headers, EMAIL_ALIASES);
      if (emailIdx === -1) emailIdx = findEmailHeader(data.headers);
      let phoneIdx = mapping.phone ? data.headers.indexOf(mapping.phone) : -1;
      if (phoneIdx === -1) phoneIdx = findHeaderByAliases(data.headers, PHONE_ALIASES);
      if (phoneIdx === -1) phoneIdx = findPhoneHeader(data.headers);
      if (emailIdx === -1 && phoneIdx === -1) continue;

      const row = data.rows.find((r) => {
        if (emailIdx >= 0 && targetEmail && normalizeEmail(r[emailIdx]) === targetEmail) return true;
        if (phoneIdx >= 0 && targetPhone && phoneTail8(r[phoneIdx]) === targetPhone) return true;
        return false;
      });
      if (!row) continue;

      const skipRe = /email|e-mail|telefone|phone|whats|celular|utm_|timestamp|carimbo|^data|^[a-z]{1,2}=$/i;
      const answers: { label: string; answer: string }[] = [];
      data.headers.forEach((h, i) => {
        if (skipRe.test(h.trim())) return;
        const val = (row[i] ?? "").trim();
        if (val) answers.push({ label: h.trim(), answer: val });
      });
      if (answers.length === 0) continue;

      return {
        matched: true,
        matchedBy: emailIdx >= 0 && targetEmail && normalizeEmail(row[emailIdx]) === targetEmail ? "email" : "phone",
        answers,
      };
    }

    return { matched: false, answers: [] };
  });
});
