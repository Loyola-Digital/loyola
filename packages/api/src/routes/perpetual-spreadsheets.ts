import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelSpreadsheets,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import { clearSheetDataCache, readSheetData } from "../services/google-sheets.js";

// ============================================================
// Epic 29 Story 29.1 — Perpetual Spreadsheet (1 por funil, sem stage)
// Reusa a tabela funnel_spreadsheets com type='perpetual_sales' e
// stage_id NULL. Mapper espelha o de stage_sales_spreadsheets.
// ============================================================

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

// Story 29.11: schema espelha o tipo canônico SaleColumnMapping (shared).
// Antes faltavam `dataVenda` e `transactionId` (e havia um `date` fantasma que
// ninguém lê) — como o Zod descarta chaves não declaradas, o mapeamento de
// "Data da Venda" e "ID da Transação" era SILENCIOSAMENTE perdido no save.
// Isso impossibilitava o filtro por período (dataVenda nunca chegava ao DB) e
// causava os KPIs "all-time" inflados no dashboard do perpétuo.
const columnMappingSchema = z.object({
  email: z.string().min(1),
  transactionId: z.string().optional(),
  customerName: z.string().optional(),
  productName: z.string().optional(),
  valorBruto: z.string().optional(),
  valorLiquido: z.string().optional(),
  formaPagamento: z.string().optional(),
  canalOrigem: z.string().optional(),
  dataVenda: z.string().optional(),
  status: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
});

const platformSchema = z.enum(["kiwify", "hotmart", "other"]);

const upsertSchema = z.object({
  spreadsheetId: z.string().min(1),
  spreadsheetName: z.string().min(1),
  sheetName: z.string().min(1),
  columnMapping: columnMappingSchema,
  platform: platformSchema.nullable().optional(),
});

// Story 29.49 — classificação de produto. Ausente do mapa = `principal`.
const PRODUCT_TYPES = ["principal", "order_bump", "upsell"] as const;
type ProductType = (typeof PRODUCT_TYPES)[number];
const productTypesSchema = z.record(z.string().min(1), z.enum(PRODUCT_TYPES));

/**
 * Chave canônica de produto: `trim().toLowerCase()`.
 *
 * Mesma regra da 18.51a na Captação Paga — sem ela "Imersão" e "imersão"
 * viram dois produtos, e o gestor classifica um e não entende por que o outro
 * continua contando como principal.
 */
export function productKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Agrupa os produtos de uma planilha lida e aplica a classificação salva.
 *
 * Pura de propósito: é a regra que decide o que o gestor vê no diálogo, e o
 * caminho HTTP em volta dela depende do Google Sheets — testar por lá cobriria
 * o transporte, não a regra. Mesmo movimento de `mergeConfigValues` na 29.38.
 */
export function aggregateProducts(
  headers: string[],
  rows: string[][],
  productColumn: string | undefined,
  types: Record<string, ProductType>,
): { productMapped: boolean; products: Array<{ name: string; count: number; type: ProductType }> } {
  if (!productColumn) return { productMapped: false, products: [] };
  const idx = headers.indexOf(productColumn);
  // Coluna mapeada que sumiu da planilha (renomeada no Sheets) é, para quem
  // olha a tela, o mesmo beco de "não mapeada": não há o que listar, e a ação
  // é voltar ao wizard.
  if (idx === -1) return { productMapped: false, products: [] };

  const byKey = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const raw = (row[idx] ?? "").trim();
    if (!raw) continue;
    const key = productKey(raw);
    const entry = byKey.get(key) ?? { name: raw, count: 0 };
    entry.count += 1;
    byKey.set(key, entry);
  }

  const products = Array.from(byKey.entries())
    .map(([key, p]) => ({ name: p.name, count: p.count, type: types[key] ?? ("principal" as ProductType) }))
    .sort((a, b) => b.count - a.count);
  return { productMapped: true, products };
}

/**
 * Normaliza o mapa antes de gravar: chave canônica e SEM os `principal`.
 *
 * `principal` já é o default de quem está ausente. Guardá-lo explicitamente
 * faria o mapa crescer com informação nula e transformaria "desclassificar um
 * produto" num caso especial em vez de uma remoção.
 */
export function normalizeProductTypes(input: Record<string, string>): Record<string, ProductType> {
  const out: Record<string, ProductType> = {};
  for (const [name, tipo] of Object.entries(input)) {
    if (tipo === "principal") continue;
    if (tipo === "order_bump" || tipo === "upsell") out[productKey(name)] = tipo;
  }
  return out;
}

function shapeRow(row: typeof funnelSpreadsheets.$inferSelect) {
  return {
    id: row.id,
    funnelId: row.funnelId,
    spreadsheetId: row.spreadsheetId,
    spreadsheetName: row.spreadsheetName,
    sheetName: row.sheetName,
    columnMapping: row.columnMapping as z.infer<typeof columnMappingSchema>,
    platform: (row.platform ?? null) as "kiwify" | "hotmart" | "other" | null,
    // Story 29.49: sempre presente, `{}` quando nada foi classificado. O web
    // trata ausente-no-mapa como `principal`.
    productTypes: (row.productTypes as Record<string, ProductType> | null) ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default fp(async function perpetualSpreadsheetsRoutes(fastify) {
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

  async function getFunnel(funnelId: string, projectId: string) {
    const [funnel] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  // ---- GET ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/perpetual-spreadsheet",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const [row] = await fastify.db
        .select()
        .from(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.funnelId, params.data.funnelId),
            eq(funnelSpreadsheets.type, "perpetual_sales"),
          ),
        )
        .limit(1);

      return row ? shapeRow(row) : null;
    },
  );

  // ---- POST (upsert) ----
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/perpetual-spreadsheet",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const bodyResult = upsertSchema.safeParse(request.body);
      if (!bodyResult.success)
        return reply.code(400).send({ error: "Dados inválidos", details: bodyResult.error.flatten() });

      const body = bodyResult.data;

      // Invalida cache da planilha nova
      clearSheetDataCache(body.spreadsheetId, body.sheetName);

      // Se já existe planilha pra esse funil, invalida cache antigo e atualiza
      const [existing] = await fastify.db
        .select({
          id: funnelSpreadsheets.id,
          spreadsheetId: funnelSpreadsheets.spreadsheetId,
          sheetName: funnelSpreadsheets.sheetName,
        })
        .from(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.funnelId, params.data.funnelId),
            eq(funnelSpreadsheets.type, "perpetual_sales"),
          ),
        )
        .limit(1);

      if (existing) {
        clearSheetDataCache(existing.spreadsheetId, existing.sheetName);
        const [row] = await fastify.db
          .update(funnelSpreadsheets)
          .set({
            spreadsheetId: body.spreadsheetId,
            spreadsheetName: body.spreadsheetName,
            sheetName: body.sheetName,
            columnMapping: body.columnMapping,
            platform: body.platform ?? null,
            updatedAt: new Date(),
          })
          .where(eq(funnelSpreadsheets.id, existing.id))
          .returning();
        return reply.code(200).send(shapeRow(row));
      }

      const [row] = await fastify.db
        .insert(funnelSpreadsheets)
        .values({
          funnelId: params.data.funnelId,
          stageId: null,
          label: "Vendas do Perpétuo",
          type: "perpetual_sales",
          spreadsheetId: body.spreadsheetId,
          spreadsheetName: body.spreadsheetName,
          sheetName: body.sheetName,
          columnMapping: body.columnMapping,
          platform: body.platform ?? null,
          createdBy: request.userId,
        })
        .returning();

      return reply.code(201).send(shapeRow(row));
    },
  );

  // ---- DELETE ----
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/perpetual-spreadsheet",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const [existing] = await fastify.db
        .select({
          spreadsheetId: funnelSpreadsheets.spreadsheetId,
          sheetName: funnelSpreadsheets.sheetName,
        })
        .from(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.funnelId, params.data.funnelId),
            eq(funnelSpreadsheets.type, "perpetual_sales"),
          ),
        )
        .limit(1);

      if (existing) {
        clearSheetDataCache(existing.spreadsheetId, existing.sheetName);
      }

      await fastify.db
        .delete(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.funnelId, params.data.funnelId),
            eq(funnelSpreadsheets.type, "perpetual_sales"),
          ),
        );

      return reply.code(204).send();
    },
  );

  // ---- GET /products ---- (Story 29.49, AC2)
  /**
   * Produtos DISTINTOS da planilha, com contagem e tipo já classificado.
   *
   * Espelha `stage-sales-spreadsheets.ts:385-452` (Captação Paga), com uma
   * diferença: lá o retorno é booleano (`isOrderBump`), aqui é o tipo, porque
   * o perpétuo precisa distinguir order bump de upsell.
   *
   * `productMapped: false` quando a coluna de produto não foi mapeada no
   * wizard. Distinto de `products: []`, que significa "a coluna existe e a
   * planilha não tem produto nenhum" — as duas pedem ações diferentes do
   * gestor, e colapsá-las mandaria metade deles procurar no lugar errado.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/perpetual-spreadsheet/products",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const [sheet] = await fastify.db
        .select()
        .from(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.funnelId, params.data.funnelId),
            eq(funnelSpreadsheets.type, "perpetual_sales"),
          ),
        )
        .limit(1);
      if (!sheet) return reply.code(404).send({ error: "Planilha não encontrada" });

      const mapping = sheet.columnMapping as { productName?: string };
      const types = (sheet.productTypes as Record<string, ProductType> | null) ?? {};
      if (!mapping.productName) {
        return { productMapped: false, products: [] };
      }

      let sheetData;
      try {
        sheetData = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
      } catch {
        return reply.code(502).send({ error: "Não foi possível ler a planilha" });
      }

      return aggregateProducts(sheetData.headers, sheetData.rows, mapping.productName, types);
    },
  );

  // ---- PUT /product-types ---- (Story 29.49, AC1)
  fastify.put(
    "/api/projects/:projectId/funnels/:funnelId/perpetual-spreadsheet/product-types",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const body = z.object({ productTypes: productTypesSchema }).safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "productTypes inválido" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      // Grava com a chave canônica e SEM os `principal`: o default já é esse, e
      // guardá-lo explicitamente faria o mapa crescer com informação nula e a
      // remoção de uma classificação virar um caso especial.
      const normalizado = normalizeProductTypes(body.data.productTypes);

      const [row] = await fastify.db
        .update(funnelSpreadsheets)
        .set({ productTypes: normalizado, updatedAt: new Date() })
        .where(
          and(
            eq(funnelSpreadsheets.funnelId, params.data.funnelId),
            eq(funnelSpreadsheets.type, "perpetual_sales"),
          ),
        )
        .returning();

      if (!row) return reply.code(404).send({ error: "Planilha não encontrada" });
      return shapeRow(row);
    },
  );
});
