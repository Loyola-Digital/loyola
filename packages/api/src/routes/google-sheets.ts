import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  googleSheetsConnections,
  googleSheetsTabMappings,
  projects,
} from "../db/schema.js";
import {
  extractSpreadsheetId,
  validateSpreadsheetAccess,
  getTabPreview,
  getTabData,
  getServiceAccountEmail,
} from "../services/google-sheets.js";

// ============================================================
// SCHEMAS
// ============================================================

const createConnectionSchema = z.object({
  projectId: z.string().uuid(),
  spreadsheetUrl: z
    .string()
    .url()
    .refine((url) => url.includes("docs.google.com/spreadsheets"), {
      message: "URL deve ser de uma planilha do Google Sheets",
    }),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const projectIdParamSchema = z.object({
  projectId: z.string().uuid(),
});

const tabParamSchema = z.object({
  id: z.string().uuid(),
  tabName: z.string().min(1),
});

const tabMappingItemSchema = z.object({
  tabName: z.string().min(1),
  tabType: z.enum(["leads", "survey", "sales"]),
  columnMapping: z.record(z.string(), z.string()),
});

const updateTabMappingsSchema = z.object({
  mappings: z.array(tabMappingItemSchema).min(1),
});

// ============================================================
// ROUTES
// ============================================================

export default fp(async function googleSheetsRoutes(fastify) {
  // Helper: verify admin/manager role
  function requireAdminOrManager(
    userRole: string,
    reply: { code: (c: number) => { send: (b: unknown) => unknown } }
  ) {
    if (userRole !== "admin" && userRole !== "manager") {
      reply.code(403).send({ error: "Acesso negado" });
      return false;
    }
    return true;
  }

  // ---- POST /api/google-sheets/connections ----
  fastify.post("/api/google-sheets/connections", async (request, reply) => {
    if (!requireAdminOrManager(request.userRole, reply)) return;

    const parseResult = createConnectionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Dados invalidos",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { projectId, spreadsheetUrl } = parseResult.data;

    // Verify project exists
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      return reply.code(404).send({ error: "Projeto nao encontrado" });
    }

    // Check if project already has a connection
    const [existing] = await fastify.db
      .select({ id: googleSheetsConnections.id })
      .from(googleSheetsConnections)
      .where(eq(googleSheetsConnections.projectId, projectId))
      .limit(1);
    if (existing) {
      return reply
        .code(409)
        .send({ error: "Projeto ja possui uma planilha conectada" });
    }

    // Extract spreadsheet ID from URL
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) {
      return reply.code(400).send({
        error: "URL invalida — nao foi possivel extrair o ID da planilha",
      });
    }

    // Validate access via Google Sheets API
    let info;
    try {
      info = await validateSpreadsheetAccess(spreadsheetId);
    } catch (err) {
      return reply.code(400).send({
        error: "Erro ao acessar planilha",
        details: err instanceof Error ? err.message : String(err),
        serviceAccountEmail: getServiceAccountEmail(),
      });
    }

    // Insert connection
    const [connection] = await fastify.db
      .insert(googleSheetsConnections)
      .values({
        projectId,
        spreadsheetId,
        spreadsheetUrl,
        spreadsheetName: info.name,
        createdBy: request.userId,
      })
      .returning();

    return reply.code(201).send({
      id: connection.id,
      projectId: connection.projectId,
      spreadsheetId: connection.spreadsheetId,
      spreadsheetUrl: connection.spreadsheetUrl,
      spreadsheetName: connection.spreadsheetName,
      isActive: connection.isActive,
      createdAt: connection.createdAt,
      tabs: info.tabs,
    });
  });

  // ---- GET /api/google-sheets/connections/:projectId ----
  fastify.get(
    "/api/google-sheets/connections/:projectId",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const [connection] = await fastify.db
        .select()
        .from(googleSheetsConnections)
        .where(
          eq(googleSheetsConnections.projectId, paramResult.data.projectId)
        )
        .limit(1);

      if (!connection) {
        return reply
          .code(404)
          .send({ error: "Nenhuma planilha conectada a este projeto" });
      }

      // Fetch tab mappings
      const mappings = await fastify.db
        .select()
        .from(googleSheetsTabMappings)
        .where(eq(googleSheetsTabMappings.connectionId, connection.id));

      return {
        ...connection,
        tabMappings: mappings,
      };
    }
  );

  // ---- GET /api/google-sheets/connections/:id/available-tabs ----
  fastify.get(
    "/api/google-sheets/connections/:id/available-tabs",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "ID invalido" });
      }

      const [connection] = await fastify.db
        .select()
        .from(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id))
        .limit(1);

      if (!connection) {
        return reply.code(404).send({ error: "Conexao nao encontrada" });
      }

      try {
        const info = await validateSpreadsheetAccess(connection.spreadsheetId);
        return { tabs: info.tabs };
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao listar abas da planilha",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- DELETE /api/google-sheets/connections/:id ----
  fastify.delete(
    "/api/google-sheets/connections/:id",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "ID invalido" });
      }

      const [connection] = await fastify.db
        .select({ id: googleSheetsConnections.id })
        .from(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id))
        .limit(1);

      if (!connection) {
        return reply.code(404).send({ error: "Conexao nao encontrada" });
      }

      // CASCADE will delete tab mappings too
      await fastify.db
        .delete(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id));

      return reply.code(204).send();
    }
  );

  // ---- PUT /api/google-sheets/connections/:id/tabs ----
  fastify.put(
    "/api/google-sheets/connections/:id/tabs",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "ID invalido" });
      }

      const bodyResult = updateTabMappingsSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(400).send({
          error: "Dados invalidos",
          details: bodyResult.error.flatten().fieldErrors,
        });
      }

      // Verify connection exists
      const [connection] = await fastify.db
        .select({ id: googleSheetsConnections.id })
        .from(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id))
        .limit(1);

      if (!connection) {
        return reply.code(404).send({ error: "Conexao nao encontrada" });
      }

      // Delete existing mappings and insert new ones (replace strategy)
      await fastify.db
        .delete(googleSheetsTabMappings)
        .where(eq(googleSheetsTabMappings.connectionId, connection.id));

      const newMappings = await fastify.db
        .insert(googleSheetsTabMappings)
        .values(
          bodyResult.data.mappings.map((m) => ({
            connectionId: connection.id,
            tabName: m.tabName,
            tabType: m.tabType,
            columnMapping: m.columnMapping,
          }))
        )
        .returning();

      return newMappings;
    }
  );

  // ---- POST /api/google-sheets/connections/:id/ai-analyze ----
  fastify.post(
    "/api/google-sheets/connections/:id/ai-analyze",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "ID invalido" });
      }

      const [connection] = await fastify.db
        .select()
        .from(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id))
        .limit(1);

      if (!connection) {
        return reply.code(404).send({ error: "Conexao nao encontrada" });
      }

      try {
        // 1. Get all tabs
        const info = await validateSpreadsheetAccess(connection.spreadsheetId);

        // 2. Get preview (headers + first 5 rows) of each tab
        const tabPreviews: { tabName: string; headers: string[]; sampleRows: string[][] }[] = [];
        for (const tabName of info.tabs.slice(0, 10)) {
          try {
            const preview = await getTabPreview(connection.spreadsheetId, tabName);
            tabPreviews.push({
              tabName,
              headers: preview.headers,
              sampleRows: preview.rows.slice(0, 5),
            });
          } catch {
            // Skip tabs that can't be read
          }
        }

        if (tabPreviews.length === 0) {
          return reply.code(422).send({ error: "Nenhuma aba com dados encontrada" });
        }

        // 3. Build prompt for Claude
        const tabDescriptions = tabPreviews
          .map((t) => {
            const rows = t.sampleRows.map((r) => r.join(" | ")).join("\n  ");
            return `Aba "${t.tabName}":\n  Headers: ${t.headers.join(" | ")}\n  Dados:\n  ${rows}`;
          })
          .join("\n\n");

        const prompt = `Analise esta planilha do Google Sheets e identifique quais abas contem dados de leads, pesquisa (survey) e vendas (sales) para uma empresa de marketing digital.

${tabDescriptions}

Para cada aba identificada, mapeie as colunas para os campos logicos do sistema.

Campos esperados por tipo de aba:
- leads: utmCampaign (campanha/UTM), utmMedium (conjunto de anuncios/ad set), utmContent (anuncio/ad/criativo)
- survey: utmCampaign (para cruzar com leads), e campos de perfil como renda, sexo, idade, filhos, religiao, profissao, etc.
- sales: utmCampaign, utmMedium, utmContent, valor (valor da venda em reais)

Retorne APENAS um JSON no formato:
{
  "mappings": [
    {
      "tabName": "nome exato da aba",
      "tabType": "leads|survey|sales",
      "columnMapping": {
        "campoLogico": "nome exato do header da planilha"
      }
    }
  ],
  "explanation": "breve explicacao do que foi identificado"
}

REGRAS:
- Use EXATAMENTE os nomes das abas e headers como aparecem na planilha
- Nem toda aba precisa ser mapeada — ignore abas irrelevantes (instrucoes, configuracoes, etc)
- Se uma aba nao tiver UTMs, ainda pode ser survey se tiver dados de perfil
- Para survey, mapeie TODOS os campos de perfil encontrados (renda, sexo, idade, etc) usando nomes logicos curtos
- Retorne APENAS o JSON, sem markdown, sem code fences`;

        // 4. Call Claude
        const message = await fastify.claude.client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        });

        const textBlock = message.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          return reply.code(422).send({ error: "IA nao conseguiu analisar a planilha" });
        }

        // 5. Parse response
        const cleaned = textBlock.text
          .replace(/```json?\s*/g, "")
          .replace(/```\s*/g, "")
          .trim();

        let result: { mappings: Array<{ tabName: string; tabType: string; columnMapping: Record<string, string> }>; explanation: string };
        try {
          result = JSON.parse(cleaned);
        } catch {
          return reply.code(422).send({
            error: "IA retornou formato invalido. Tente novamente.",
          });
        }

        // 6. Validate mappings
        const validTypes = new Set(["leads", "survey", "sales"]);
        const validTabNames = new Set(info.tabs);
        result.mappings = result.mappings.filter(
          (m) => validTypes.has(m.tabType) && validTabNames.has(m.tabName)
        );

        return {
          mappings: result.mappings,
          explanation: result.explanation,
          availableTabs: info.tabs,
        };
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao analisar planilha",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/google-sheets/connections/:id/tabs/:tabName/preview ----
  fastify.get(
    "/api/google-sheets/connections/:id/tabs/:tabName/preview",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = tabParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "Parametros invalidos" });
      }

      const [connection] = await fastify.db
        .select()
        .from(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id))
        .limit(1);

      if (!connection) {
        return reply.code(404).send({ error: "Conexao nao encontrada" });
      }

      try {
        const preview = await getTabPreview(
          connection.spreadsheetId,
          decodeURIComponent(paramResult.data.tabName)
        );
        return preview;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar preview da aba",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/google-sheets/connections/:id/tabs/:tabName/data ----
  fastify.get(
    "/api/google-sheets/connections/:id/tabs/:tabName/data",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = tabParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "Parametros invalidos" });
      }

      const [connection] = await fastify.db
        .select()
        .from(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id))
        .limit(1);

      if (!connection) {
        return reply.code(404).send({ error: "Conexao nao encontrada" });
      }

      // Check if tab has a mapping
      const tabNameDecoded = decodeURIComponent(paramResult.data.tabName);
      const [mapping] = await fastify.db
        .select()
        .from(googleSheetsTabMappings)
        .where(
          and(
            eq(googleSheetsTabMappings.connectionId, connection.id),
            eq(googleSheetsTabMappings.tabName, tabNameDecoded)
          )
        )
        .limit(1);

      try {
        const data = await getTabData(
          connection.spreadsheetId,
          tabNameDecoded,
          mapping
            ? (mapping.columnMapping as Record<string, string>)
            : undefined
        );
        return data;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar dados da aba",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );
});
