/**
 * A fonte de leads por webhook de uma etapa: criar, ver a URL, rotacionar.
 *
 * O que se cria aqui é uma linha de `funnel_spreadsheets` do tipo `leads` cujo
 * `spreadsheetId` é `webhook:<id da fonte>` — uma planilha virtual. Por isso
 * não há CRUD de edição: label, tipo e remoção continuam na rota de planilhas,
 * e o resto do sistema não sabe (nem precisa saber) que a fonte não é Google.
 *
 * A recepção do lead em si é pública e mora em `routes/webhooks.ts`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { and, count, eq, max } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, funnelSpreadsheets, webhookLeadSources, webhookLeads } from "../db/schema.js";
import { MAPEAMENTO, fonteComoPlanilhaId } from "../services/webhook-leads.js";

const funnelParamSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const fonteParamSchema = funnelParamSchema.extend({
  /** O id da PLANILHA virtual — é o que a tela já tem em mãos. */
  id: z.string().uuid(),
});

const criarSchema = z.object({
  stageId: z.string().uuid().optional(),
  label: z.string().min(1).max(255),
});

/** O caminho que o Mautic recebe; a tela prefixa com a base da API. */
function caminho(sourceId: string): string {
  return `/api/webhooks/leads/${sourceId}`;
}

function novoToken(): string {
  return randomBytes(24).toString("hex");
}

export default fp(async function webhookLeadsRoutes(fastify) {
  async function funilDoProjeto(projectId: string, funnelId: string) {
    const [funnel] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  /** A fonte de uma planilha virtual deste funil, ou null. */
  async function fonteDaPlanilha(funnelId: string, spreadsheetId: string) {
    const [row] = await fastify.db
      .select({
        sourceId: webhookLeadSources.id,
        token: webhookLeadSources.token,
      })
      .from(webhookLeadSources)
      .innerJoin(funnelSpreadsheets, eq(funnelSpreadsheets.id, webhookLeadSources.spreadsheetId))
      .where(
        and(
          eq(webhookLeadSources.spreadsheetId, spreadsheetId),
          eq(funnelSpreadsheets.funnelId, funnelId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // ---- POST: cria a fonte (e a planilha virtual que a representa) ----
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/webhook-leads",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const p = funnelParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const body = criarSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          error: "Dados inválidos",
          details: body.error.flatten().fieldErrors,
        });
      }
      if (!(await funilDoProjeto(p.data.projectId, p.data.funnelId))) {
        return reply.code(404).send({ error: "Funil não encontrado" });
      }

      const sourceId = randomUUID();
      const token = novoToken();

      // Numa transação porque planilha sem fonte é uma etapa que lança erro ao
      // abrir: o `readSheetData` desvia pelo prefixo e não acha para onde ir.
      const planilha = await fastify.db.transaction(async (tx) => {
        const [criada] = await tx
          .insert(funnelSpreadsheets)
          .values({
            funnelId: p.data.funnelId,
            stageId: body.data.stageId ?? null,
            label: body.data.label,
            type: "leads",
            spreadsheetId: fonteComoPlanilhaId(sourceId),
            spreadsheetName: "Leads por webhook",
            sheetName: "leads",
            columnMapping: { ...MAPEAMENTO },
            createdBy: request.userId!,
          })
          .returning({ id: funnelSpreadsheets.id });

        await tx.insert(webhookLeadSources).values({
          id: sourceId,
          spreadsheetId: criada.id,
          stageId: body.data.stageId ?? null,
          projectId: p.data.projectId,
          token,
          createdBy: request.userId ?? null,
        });

        return criada;
      });

      return reply.code(201).send({
        id: planilha.id,
        sourceId,
        path: caminho(sourceId),
        token,
        recebidos: 0,
        ultimoEm: null,
      });
    },
  );

  // ---- GET: a URL para colar no Mautic + quanto já chegou ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/webhook-leads/:id",
    async (request, reply) => {
      const p = fonteParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      if (!(await funilDoProjeto(p.data.projectId, p.data.funnelId))) {
        return reply.code(404).send({ error: "Funil não encontrado" });
      }

      const fonte = await fonteDaPlanilha(p.data.funnelId, p.data.id);
      if (!fonte) return reply.code(404).send({ error: "Fonte de webhook não encontrada" });

      const [agregado] = await fastify.db
        .select({ recebidos: count(), ultimoEm: max(webhookLeads.recebidoEm) })
        .from(webhookLeads)
        .where(eq(webhookLeads.sourceId, fonte.sourceId));

      return {
        id: p.data.id,
        sourceId: fonte.sourceId,
        path: caminho(fonte.sourceId),
        // O token autoriza escrever lead na etapa: convidado vê a contagem, não
        // o segredo.
        token: request.userRole === "guest" ? null : fonte.token,
        recebidos: agregado?.recebidos ?? 0,
        ultimoEm: agregado?.ultimoEm ?? null,
      };
    },
  );

  // ---- POST rotate: invalida o que já foi colado por aí ----
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/webhook-leads/:id/rotate",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const p = fonteParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      if (!(await funilDoProjeto(p.data.projectId, p.data.funnelId))) {
        return reply.code(404).send({ error: "Funil não encontrado" });
      }

      const fonte = await fonteDaPlanilha(p.data.funnelId, p.data.id);
      if (!fonte) return reply.code(404).send({ error: "Fonte de webhook não encontrada" });

      const token = novoToken();
      await fastify.db
        .update(webhookLeadSources)
        .set({ token })
        .where(eq(webhookLeadSources.id, fonte.sourceId));

      return { id: p.data.id, sourceId: fonte.sourceId, path: caminho(fonte.sourceId), token };
    },
  );
});
