import { z } from "zod";
import { eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { salesProducts, salesSpreadsheetMappings } from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";

const projectParamSchema = z.object({ projectId: z.string().uuid() });
const productParamSchema = z.object({ projectId: z.string().uuid(), productId: z.string().uuid() });
const mappingParamSchema = z.object({ projectId: z.string().uuid(), productId: z.string().uuid(), mappingId: z.string().uuid() });

const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["inferior", "superior"]),
});

const createMappingSchema = z.object({
  spreadsheetId: z.string().min(1),
  spreadsheetName: z.string().min(1),
  sheetName: z.string().min(1),
  columnMapping: z.object({
    email: z.string().min(1),
    date: z.string().min(1),
    origin: z.string().optional(),
    type: z.string().optional(),
    value: z.string().optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    status: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_content: z.string().optional(),
    utm_term: z.string().optional(),
  }),
});

export default fp(async function salesRoutes(fastify) {

  // ---- GET /api/projects/:projectId/sales/products ----
  fastify.get("/api/projects/:projectId/sales/products", async (request, reply) => {
    const p = projectParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "ID invalido" });

    const products = await fastify.db
      .select()
      .from(salesProducts)
      .where(eq(salesProducts.projectId, p.data.projectId));

    // Fetch mappings for each product
    const result = [];
    for (const product of products) {
      const mappings = await fastify.db
        .select()
        .from(salesSpreadsheetMappings)
        .where(eq(salesSpreadsheetMappings.productId, product.id));
      result.push({ ...product, mappings });
    }

    return { products: result };
  });

  // ---- POST /api/projects/:projectId/sales/products ----
  fastify.post("/api/projects/:projectId/sales/products", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = projectParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "ID invalido" });
    const body = createProductSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados invalidos" });

    const [product] = await fastify.db
      .insert(salesProducts)
      .values({ projectId: p.data.projectId, name: body.data.name, type: body.data.type, createdBy: request.userId! })
      .returning();

    return reply.code(201).send(product);
  });

  // ---- DELETE /api/projects/:projectId/sales/products/:productId ----
  fastify.delete("/api/projects/:projectId/sales/products/:productId", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = productParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });

    await fastify.db.delete(salesProducts).where(eq(salesProducts.id, p.data.productId));
    return { success: true };
  });

  // ---- POST /api/projects/:projectId/sales/products/:productId/mappings ----
  fastify.post("/api/projects/:projectId/sales/products/:productId/mappings", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = productParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });
    const body = createMappingSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados invalidos", details: body.error.flatten() });

    const [mapping] = await fastify.db
      .insert(salesSpreadsheetMappings)
      .values({ productId: p.data.productId, ...body.data })
      .returning();

    return reply.code(201).send(mapping);
  });

  // ---- DELETE /api/projects/:projectId/sales/products/:productId/mappings/:mappingId ----
  fastify.delete("/api/projects/:projectId/sales/products/:productId/mappings/:mappingId", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = mappingParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });

    await fastify.db.delete(salesSpreadsheetMappings).where(eq(salesSpreadsheetMappings.id, p.data.mappingId));
    return { success: true };
  });

  // ---- PUT /api/projects/:projectId/sales/products/:productId/mappings/:mappingId ----
  fastify.put("/api/projects/:projectId/sales/products/:productId/mappings/:mappingId", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = mappingParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });
    const body = z.object({ columnMapping: createMappingSchema.shape.columnMapping }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados invalidos" });

    const [updated] = await fastify.db
      .update(salesSpreadsheetMappings)
      .set({ columnMapping: body.data.columnMapping })
      .where(eq(salesSpreadsheetMappings.id, p.data.mappingId))
      .returning();

    if (!updated) return reply.code(404).send({ error: "Mapeamento nao encontrado" });
    return updated;
  });

  // ---- GET /api/projects/:projectId/sales/ascension ----
  // Cross-reference inferior vs superior sales by email
  fastify.get("/api/projects/:projectId/sales/ascension", async (request, reply) => {
    const p = projectParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "ID invalido" });

    const products = await fastify.db
      .select()
      .from(salesProducts)
      .where(eq(salesProducts.projectId, p.data.projectId));

    const inferiorProducts = products.filter((pr) => pr.type === "inferior");
    const superiorProducts = products.filter((pr) => pr.type === "superior");

    if (inferiorProducts.length === 0 || superiorProducts.length === 0) {
      return { error: null, message: "Configure pelo menos 1 produto inferior e 1 superior", data: null };
    }

    // Read all sales data from spreadsheets
    type SaleRecord = { email: string; date: string; productName: string; productType: string; origin?: string; value?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string };

    async function readProductSales(productId: string, productName: string, productType: string): Promise<SaleRecord[]> {
      const mappings = await fastify.db.select().from(salesSpreadsheetMappings).where(eq(salesSpreadsheetMappings.productId, productId));
      const records: SaleRecord[] = [];

      for (const mapping of mappings) {
        try {
          const data = await readSheetData(mapping.spreadsheetId, mapping.sheetName);
          const colMap = mapping.columnMapping as { email: string; date: string; origin?: string; value?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string };
          const emailIdx = data.headers.indexOf(colMap.email);
          const dateIdx = data.headers.indexOf(colMap.date);
          const originIdx = colMap.origin ? data.headers.indexOf(colMap.origin) : -1;
          const valueIdx = colMap.value ? data.headers.indexOf(colMap.value) : -1;
          const utmSourceIdx = colMap.utm_source ? data.headers.indexOf(colMap.utm_source) : -1;
          const utmMediumIdx = colMap.utm_medium ? data.headers.indexOf(colMap.utm_medium) : -1;
          const utmCampaignIdx = colMap.utm_campaign ? data.headers.indexOf(colMap.utm_campaign) : -1;
          const utmContentIdx = colMap.utm_content ? data.headers.indexOf(colMap.utm_content) : -1;
          const utmTermIdx = colMap.utm_term ? data.headers.indexOf(colMap.utm_term) : -1;

          if (emailIdx === -1 || dateIdx === -1) continue;

          for (const row of data.rows) {
            const email = (row[emailIdx] ?? "").toLowerCase().trim();
            const date = row[dateIdx] ?? "";
            if (!email || !date) continue;
            records.push({
              email,
              date,
              productName,
              productType,
              origin: originIdx >= 0 ? row[originIdx] : undefined,
              value: valueIdx >= 0 ? row[valueIdx] : undefined,
              utm_source: utmSourceIdx >= 0 ? row[utmSourceIdx] : undefined,
              utm_medium: utmMediumIdx >= 0 ? row[utmMediumIdx] : undefined,
              utm_campaign: utmCampaignIdx >= 0 ? row[utmCampaignIdx] : undefined,
              utm_content: utmContentIdx >= 0 ? row[utmContentIdx] : undefined,
              utm_term: utmTermIdx >= 0 ? row[utmTermIdx] : undefined,
            });
          }
        } catch (err) {
          fastify.log.error({ err, productName }, "[sales] failed to read spreadsheet");
        }
      }
      return records;
    }

    // Collect all sales
    const inferiorSales: SaleRecord[] = [];
    const superiorSales: SaleRecord[] = [];

    for (const prod of inferiorProducts) {
      inferiorSales.push(...await readProductSales(prod.id, prod.name, "inferior"));
    }
    for (const prod of superiorProducts) {
      superiorSales.push(...await readProductSales(prod.id, prod.name, "superior"));
    }

    // Build maps by email
    const inferiorByEmail = new Map<string, SaleRecord>();
    for (const sale of inferiorSales) {
      const existing = inferiorByEmail.get(sale.email);
      if (!existing || sale.date < existing.date) {
        inferiorByEmail.set(sale.email, sale); // keep earliest
      }
    }

    const superiorByEmail = new Map<string, SaleRecord>();
    for (const sale of superiorSales) {
      const existing = superiorByEmail.get(sale.email);
      if (!existing || sale.date < existing.date) {
        superiorByEmail.set(sale.email, sale);
      }
    }

    // Parse date string in various formats (DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD, with optional time)
    function parseDate(dateStr: string): Date | null {
      if (!dateStr) return null;
      // Try DD/MM/YYYY or D/M/YYYY (with optional time)
      const brMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/);
      if (brMatch) {
        const [, day, month, year, time] = brMatch;
        const timePart = time?.trim() || "00:00:00";
        const d = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${timePart}`);
        if (!isNaN(d.getTime())) return d;
      }
      // Try ISO or other formats
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
      return null;
    }

    // Calculate ascension
    const ascended: { email: string; inferiorDate: string; superiorDate: string; daysToAscend: number; inferiorProduct: string; superiorProduct: string; origin?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string }[] = [];

    for (const [email, sup] of superiorByEmail) {
      const inf = inferiorByEmail.get(email);
      if (inf) {
        const infDate = parseDate(inf.date);
        const supDate = parseDate(sup.date);
        if (!infDate || !supDate) continue;
        const diffMs = supDate.getTime() - infDate.getTime();
        if (diffMs < 0) continue; // bought superior BEFORE inferior — not ascension
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        ascended.push({
          email,
          inferiorDate: infDate.toLocaleDateString("pt-BR"),
          superiorDate: supDate.toLocaleDateString("pt-BR"),
          daysToAscend: diffDays,
          inferiorProduct: inf.productName,
          superiorProduct: sup.productName,
          origin: inf.origin,
          utm_source: inf.utm_source,
          utm_medium: inf.utm_medium,
          utm_campaign: inf.utm_campaign,
        });
      }
    }

    ascended.sort((a, b) => a.daysToAscend - b.daysToAscend);

    const totalInferior = inferiorByEmail.size;
    const totalSuperior = superiorByEmail.size;
    const totalAscended = ascended.length;
    const conversionRate = totalInferior > 0 ? (totalAscended / totalInferior) * 100 : 0;
    const avgDaysToAscend = totalAscended > 0 ? Math.round(ascended.reduce((s, a) => s + a.daysToAscend, 0) / totalAscended) : 0;

    // Distribution by days ranges
    const distribution = [
      { range: "0-7 dias", count: ascended.filter((a) => a.daysToAscend <= 7).length },
      { range: "8-14 dias", count: ascended.filter((a) => a.daysToAscend > 7 && a.daysToAscend <= 14).length },
      { range: "15-30 dias", count: ascended.filter((a) => a.daysToAscend > 14 && a.daysToAscend <= 30).length },
      { range: "31-60 dias", count: ascended.filter((a) => a.daysToAscend > 30 && a.daysToAscend <= 60).length },
      { range: "61-90 dias", count: ascended.filter((a) => a.daysToAscend > 60 && a.daysToAscend <= 90).length },
      { range: "90+ dias", count: ascended.filter((a) => a.daysToAscend > 90).length },
    ];

    // Revenue calculations
    let revenueInferior = 0;
    let revenueSuperior = 0;
    for (const sale of inferiorSales) {
      const v = parseFloat((sale.value ?? "0").replace(/[^\d.,]/g, "").replace(",", "."));
      if (!isNaN(v)) revenueInferior += v;
    }
    for (const sale of superiorSales) {
      const v = parseFloat((sale.value ?? "0").replace(/[^\d.,]/g, "").replace(",", "."));
      if (!isNaN(v)) revenueSuperior += v;
    }
    const ticketMedioInferior = totalInferior > 0 ? revenueInferior / totalInferior : 0;
    const ticketMedioSuperior = totalSuperior > 0 ? revenueSuperior / totalSuperior : 0;
    const ltvEstimado = totalAscended > 0 ? (revenueInferior + revenueSuperior) / new Set([...inferiorByEmail.keys(), ...superiorByEmail.keys()]).size : 0;

    // Cohort by month (when bought front-end → how many ascended)
    const cohortMap = new Map<string, { total: number; ascended: number }>();
    for (const [email, inf] of inferiorByEmail) {
      const d = parseDate(inf.date);
      if (!d) continue;
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = cohortMap.get(month) ?? { total: 0, ascended: 0 };
      entry.total++;
      if (superiorByEmail.has(email)) {
        const sup = superiorByEmail.get(email)!;
        const supDate = parseDate(sup.date);
        if (supDate && supDate.getTime() >= d.getTime()) entry.ascended++;
      }
      cohortMap.set(month, entry);
    }
    const cohort = Array.from(cohortMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({ month, ...data, rate: data.total > 0 ? (data.ascended / data.total) * 100 : 0 }));

    // Top origins that ascend most
    const originMap = new Map<string, { total: number; ascended: number }>();
    for (const [email, inf] of inferiorByEmail) {
      const origin = inf.origin?.trim() || "Direto";
      const entry = originMap.get(origin) ?? { total: 0, ascended: 0 };
      entry.total++;
      if (ascended.some((a) => a.email === email)) entry.ascended++;
      originMap.set(origin, entry);
    }
    const topOrigins = Array.from(originMap.entries())
      .map(([origin, data]) => ({ origin, ...data, rate: data.total > 0 ? (data.ascended / data.total) * 100 : 0 }))
      .sort((a, b) => b.ascended - a.ascended)
      .slice(0, 10);

    // Timeline — sales per day
    const timelineMap = new Map<string, { front: number; back: number }>();
    for (const sale of inferiorSales) {
      const d = parseDate(sale.date);
      if (!d) continue;
      const day = d.toISOString().slice(0, 10);
      const entry = timelineMap.get(day) ?? { front: 0, back: 0 };
      entry.front++;
      timelineMap.set(day, entry);
    }
    for (const sale of superiorSales) {
      const d = parseDate(sale.date);
      if (!d) continue;
      const day = d.toISOString().slice(0, 10);
      const entry = timelineMap.get(day) ?? { front: 0, back: 0 };
      entry.back++;
      timelineMap.set(day, entry);
    }
    const timeline = Array.from(timelineMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({ date, ...data }));

    // Top UTM campaigns
    const campaignMap = new Map<string, { total: number; ascended: number }>();
    for (const [email, inf] of inferiorByEmail) {
      const campaign = inf.utm_campaign?.trim() || inf.utm_source?.trim();
      if (!campaign) continue;
      const label = [inf.utm_source, inf.utm_medium, inf.utm_campaign].filter(Boolean).join(" / ");
      const entry = campaignMap.get(label) ?? { total: 0, ascended: 0 };
      entry.total++;
      if (ascended.some((a) => a.email === email)) entry.ascended++;
      campaignMap.set(label, entry);
    }
    const topCampaigns = Array.from(campaignMap.entries())
      .map(([campaign, data]) => ({ campaign, ...data, rate: data.total > 0 ? (data.ascended / data.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // Remarketing list — bought front but NOT back
    const ascendedEmails = new Set(ascended.map((a) => a.email));
    const remarketing = Array.from(inferiorByEmail.entries())
      .filter(([email]) => !ascendedEmails.has(email))
      .map(([email, sale]) => ({ email, date: parseDate(sale.date)?.toLocaleDateString("pt-BR") ?? sale.date, product: sale.productName, origin: sale.origin, utm_source: sale.utm_source, utm_campaign: sale.utm_campaign }))
      .slice(0, 200);

    return {
      data: {
        totalInferior,
        totalSuperior,
        totalAscended,
        conversionRate,
        avgDaysToAscend,
        distribution,
        ascended: ascended.slice(0, 100),
        inferiorProducts: inferiorProducts.map((p) => p.name),
        superiorProducts: superiorProducts.map((p) => p.name),
        // New metrics
        revenueInferior,
        revenueSuperior,
        ticketMedioInferior,
        ticketMedioSuperior,
        ltvEstimado,
        cohort,
        topOrigins,
        topCampaigns,
        timeline,
        remarketing,
      },
    };
  });
});
