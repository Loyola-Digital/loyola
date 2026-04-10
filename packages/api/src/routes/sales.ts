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
  }),
});

export default fp(async function salesRoutes(fastify) {

  // ---- GET /api/projects/:projectId/sales/products ----
  fastify.get("/api/projects/:projectId/sales/products", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
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

  // ---- GET /api/projects/:projectId/sales/ascension ----
  // Cross-reference inferior vs superior sales by email
  fastify.get("/api/projects/:projectId/sales/ascension", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
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
    type SaleRecord = { email: string; date: string; productName: string; productType: string; origin?: string; value?: string };

    async function readProductSales(productId: string, productName: string, productType: string): Promise<SaleRecord[]> {
      const mappings = await fastify.db.select().from(salesSpreadsheetMappings).where(eq(salesSpreadsheetMappings.productId, productId));
      const records: SaleRecord[] = [];

      for (const mapping of mappings) {
        try {
          const data = await readSheetData(mapping.spreadsheetId, mapping.sheetName);
          const colMap = mapping.columnMapping as { email: string; date: string; origin?: string; value?: string };
          const emailIdx = data.headers.indexOf(colMap.email);
          const dateIdx = data.headers.indexOf(colMap.date);
          const originIdx = colMap.origin ? data.headers.indexOf(colMap.origin) : -1;
          const valueIdx = colMap.value ? data.headers.indexOf(colMap.value) : -1;

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
    const ascended: { email: string; inferiorDate: string; superiorDate: string; daysToAscend: number; inferiorProduct: string; superiorProduct: string; origin?: string }[] = [];

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

    return {
      data: {
        totalInferior,
        totalSuperior,
        totalAscended,
        conversionRate,
        avgDaysToAscend,
        distribution,
        ascended: ascended.slice(0, 100), // limit to 100 records
        inferiorProducts: inferiorProducts.map((p) => p.name),
        superiorProducts: superiorProducts.map((p) => p.name),
      },
    };
  });
});
