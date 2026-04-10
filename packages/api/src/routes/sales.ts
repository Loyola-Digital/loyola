import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { salesProducts, salesSpreadsheetMappings } from "../db/schema.js";

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
});
