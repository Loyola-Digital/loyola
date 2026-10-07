import { z } from "zod";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import fp from "fastify-plugin";
import type { MultipartFile } from "@fastify/multipart";
import { debriefingComments, debriefingPayloads, debriefings, users } from "../db/schema.js";

// ============================================================
// EPIC 37 — Debriefings (Story 37.1)
// ============================================================
// Recurso GLOBAL (sem projectId): o time sobe um doc HTML de debriefing por
// campanha; o web renderiza fielmente em iframe sandbox. Guests são barrados
// no guest-guard (403 em /api/debriefings* — qualquer método). Escrita é
// colaborativa: qualquer não-guest cria/edita/exclui debriefings; excluir
// comentário é só do autor.

const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5MB
const MSG_LIMITE_HTML = "Arquivo muito grande. Máximo: 5MB";

/**
 * Story 49.8 — teto do corpo JSON do `PUT /api/debriefings/:id`.
 *
 * O salvar da edição inline manda o HTML inteiro em JSON. O app não define
 * `bodyLimit` (`Fastify({ logger: true })`), então valia o default do Fastify 5
 * (1 MiB) — abaixo dos 5 MB que o upload aceita: um doc que subia pelo upload
 * não salvava pela edição. O teto do HTML continua `MAX_HTML_BYTES`, conferido
 * no handler; este limite só precisa caber o HTML depois do escape do JSON.
 * `"`, `\` e quebras de linha viram 2 bytes, então 2× o teto cobre o pior caso
 * realista (nos documentos da skill o JSON saiu 2%–7% maior que o HTML), e
 * 1 MiB sobra para os demais campos.
 */
const PUT_JSON_BODY_LIMIT = 2 * MAX_HTML_BYTES + 1024 * 1024;

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * Story 49.12 (AC14) — `{ corte, dMaisN }` da parcial, ou `null` (final,
 * upload manual ou payload anterior à 49.12). Campo ADITIVO do GET (contrato 35).
 */
export function parcialDoDetalhe(ehParcial: boolean | null, situacao: unknown): { corte: string; dMaisN: number } | null {
  if (ehParcial !== true || !situacao || typeof situacao !== "object") return null;
  const s = situacao as { modo?: unknown; corte?: unknown; dMaisN?: unknown };
  if (s.modo !== "parcial" || typeof s.corte !== "string" || typeof s.dMaisN !== "number") return null;
  return { corte: s.corte, dMaisN: s.dMaisN };
}
const commentParamSchema = z.object({
  id: z.string().uuid(),
  commentId: z.string().uuid(),
});

const updateBodySchema = z
  .object({
    campaignName: z.string().trim().min(1).max(300).optional(),
    html: z.string().min(1).optional(),
    // Vínculo com etapa (stageType "debriefing"): uuid vincula, null desvincula.
    stageId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (d) => d.campaignName !== undefined || d.html !== undefined || d.stageId !== undefined,
    { message: "informe campaignName, html e/ou stageId" },
  );

// Lista: sem filtro = todos; stageId = docs da etapa; unassigned = sem etapa.
const listQuerySchema = z.object({
  stageId: z.string().uuid().optional(),
  unassigned: z.coerce.boolean().optional(),
});

const commentBodySchema = z
  .object({
    text: z.string().trim().min(1).max(5000),
    // Story 37.3 — âncora opcional (pin estilo Figma): % da largura/altura
    // do doc. Ambos presentes ou ambos ausentes.
    anchorX: z.number().min(0).max(100).optional(),
    anchorY: z.number().min(0).max(100).optional(),
  })
  .refine((d) => (d.anchorX === undefined) === (d.anchorY === undefined), {
    message: "anchorX e anchorY devem vir juntos",
  });

/** Extrai o valor de um field de texto do multipart (pode vir single ou array). */
function multipartFieldValue(field: unknown): string | undefined {
  const single = Array.isArray(field) ? field[0] : field;
  if (single && typeof single === "object" && "value" in single) {
    const v = (single as { value: unknown }).value;
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

function isHtmlFile(file: MultipartFile): boolean {
  if (file.mimetype === "text/html") return true;
  // Fallback por extensão — browsers às vezes mandam application/octet-stream.
  return /\.html?$/i.test(file.filename ?? "");
}

/**
 * Lê o arquivo HTML do multipart e valida tipo/tamanho.
 * Retorna { html, fileName } ou um erro pronto pra reply.
 */
async function readHtmlUpload(
  file: MultipartFile
): Promise<
  | { ok: true; html: string; fileName: string }
  | { ok: false; code: number; error: string }
> {
  if (!isHtmlFile(file)) {
    return {
      ok: false,
      code: 400,
      error: "Tipo de arquivo não suportado. Envie um .html",
    };
  }

  let buffer: Buffer;
  try {
    buffer = await file.toBuffer();
  } catch {
    return { ok: false, code: 413, error: MSG_LIMITE_HTML };
  }
  if (buffer.byteLength > MAX_HTML_BYTES) {
    return { ok: false, code: 413, error: MSG_LIMITE_HTML };
  }

  return { ok: true, html: buffer.toString("utf-8"), fileName: file.filename };
}

export default fp(async function debriefingsRoutes(fastify) {
  const editors = alias(users, "editors");

  // ----------------------------------------------------------
  // GET /api/debriefings — lista SEM o html (payload leve)
  // ----------------------------------------------------------
  fastify.get("/api/debriefings", async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "query inválida" });

    const stageFilter = query.data.stageId
      ? eq(debriefings.stageId, query.data.stageId)
      : query.data.unassigned
        ? isNull(debriefings.stageId)
        : undefined;

    const listSelect = fastify.db
      .select({
        id: debriefings.id,
        campaignName: debriefings.campaignName,
        stageId: debriefings.stageId,
        fileName: debriefings.fileName,
        createdAt: debriefings.createdAt,
        updatedAt: debriefings.updatedAt,
        authorName: users.name,
        authorAvatarUrl: users.avatarUrl,
        editorName: editors.name,
      })
      .from(debriefings)
      .innerJoin(users, eq(debriefings.createdBy, users.id))
      .leftJoin(editors, eq(debriefings.updatedBy, editors.id))
      .orderBy(desc(debriefings.createdAt));

    const [rows, counts] = await Promise.all([
      stageFilter ? listSelect.where(stageFilter) : listSelect,
      fastify.db
        .select({
          debriefingId: debriefingComments.debriefingId,
          count: sql<number>`count(*)::int`,
        })
        .from(debriefingComments)
        .groupBy(debriefingComments.debriefingId),
    ]);

    const countById = new Map(counts.map((c) => [c.debriefingId, c.count]));
    return {
      debriefings: rows.map((r) => ({
        ...r,
        commentCount: countById.get(r.id) ?? 0,
      })),
    };
  });

  // ----------------------------------------------------------
  // GET /api/debriefings/:id — detalhe COM html
  // ----------------------------------------------------------
  fastify.get("/api/debriefings/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "id inválido" });
    }

    const [row] = await fastify.db
      .select({
        id: debriefings.id,
        campaignName: debriefings.campaignName,
        stageId: debriefings.stageId,
        html: debriefings.html,
        fileName: debriefings.fileName,
        createdAt: debriefings.createdAt,
        updatedAt: debriefings.updatedAt,
        authorName: users.name,
        authorAvatarUrl: users.avatarUrl,
        editorName: editors.name,
        // Story 49.12 (AC14) — o viewer avisa que o documento é parcial. Lido do
        // payload GERADO (tabela irmã); upload manual não tem linha → null.
        ehParcial: debriefingPayloads.parcial,
        situacao: sql<unknown>`${debriefingPayloads.payload} -> 'situacao'`,
      })
      .from(debriefings)
      .innerJoin(users, eq(debriefings.createdBy, users.id))
      .leftJoin(editors, eq(debriefings.updatedBy, editors.id))
      .leftJoin(debriefingPayloads, eq(debriefingPayloads.debriefingId, debriefings.id))
      .where(eq(debriefings.id, params.data.id))
      .limit(1);

    if (!row) return reply.code(404).send({ error: "debriefing não encontrado" });
    const { ehParcial, situacao, ...detalhe } = row;
    return { ...detalhe, parcial: parcialDoDetalhe(ehParcial, situacao) };
  });

  // ----------------------------------------------------------
  // POST /api/debriefings — multipart: campaignName + arquivo .html
  // ----------------------------------------------------------
  fastify.post(
    "/api/debriefings",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: "Nenhum arquivo enviado" });
      }

      const campaignName = multipartFieldValue(file.fields.campaignName)?.trim();
      if (!campaignName) {
        return reply.code(400).send({ error: "campaignName é obrigatório" });
      }

      // Vínculo opcional com etapa (multipart field stageId).
      const stageIdRaw = multipartFieldValue(file.fields.stageId)?.trim();
      if (stageIdRaw && !z.string().uuid().safeParse(stageIdRaw).success) {
        return reply.code(400).send({ error: "stageId inválido" });
      }

      const upload = await readHtmlUpload(file);
      if (!upload.ok) {
        return reply.code(upload.code).send({ error: upload.error });
      }

      const [created] = await fastify.db
        .insert(debriefings)
        .values({
          campaignName,
          stageId: stageIdRaw || null,
          html: upload.html,
          fileName: upload.fileName,
          createdBy: request.userId,
        })
        .returning({ id: debriefings.id });

      return reply.code(201).send({ id: created.id });
    }
  );

  // ----------------------------------------------------------
  // PUT /api/debriefings/:id — JSON { campaignName?, html? } OU multipart
  // (novo arquivo substitui o html; campaignName opcional junto)
  // ----------------------------------------------------------
  fastify.put(
    "/api/debriefings/:id",
    {
      bodyLimit: PUT_JSON_BODY_LIMIT,
      // Corpo acima do bodyLimit nem chega ao handler: responde com a mesma
      // mensagem de limite do upload. Qualquer outro erro sobe para o handler
      // global do app (relançado).
      errorHandler(erro, _request, reply) {
        if (erro.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
          return reply.code(413).send({ error: MSG_LIMITE_HTML });
        }
        throw erro;
      },
    },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "id inválido" });
      }

      const [existing] = await fastify.db
        .select({ id: debriefings.id })
        .from(debriefings)
        .where(eq(debriefings.id, params.data.id))
        .limit(1);
      if (!existing) {
        return reply.code(404).send({ error: "debriefing não encontrado" });
      }

      const changes: Partial<{
        campaignName: string;
        html: string;
        fileName: string;
        stageId: string | null;
      }> = {};

      if (request.isMultipart()) {
        const file = await request.file();
        if (!file) {
          return reply.code(400).send({ error: "Nenhum arquivo enviado" });
        }
        const upload = await readHtmlUpload(file);
        if (!upload.ok) {
          return reply.code(upload.code).send({ error: upload.error });
        }
        changes.html = upload.html;
        changes.fileName = upload.fileName;
        const campaignName = multipartFieldValue(file.fields.campaignName)?.trim();
        if (campaignName) changes.campaignName = campaignName;
      } else {
        const body = updateBodySchema.safeParse(request.body);
        if (!body.success) {
          return reply
            .code(400)
            .send({ error: body.error.issues[0]?.message ?? "body inválido" });
        }
        if (body.data.campaignName !== undefined) {
          changes.campaignName = body.data.campaignName;
        }
        if (body.data.html !== undefined) {
          if (Buffer.byteLength(body.data.html, "utf8") > MAX_HTML_BYTES) {
            return reply.code(413).send({ error: MSG_LIMITE_HTML });
          }
          changes.html = body.data.html;
        }
        if (body.data.stageId !== undefined) changes.stageId = body.data.stageId;
      }

      await fastify.db
        .update(debriefings)
        .set({ ...changes, updatedBy: request.userId, updatedAt: new Date() })
        .where(eq(debriefings.id, params.data.id));

      return { ok: true };
    }
  );

  // ----------------------------------------------------------
  // DELETE /api/debriefings/:id — comentários caem em cascade
  // ----------------------------------------------------------
  fastify.delete("/api/debriefings/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "id inválido" });
    }

    const deleted = await fastify.db
      .delete(debriefings)
      .where(eq(debriefings.id, params.data.id))
      .returning({ id: debriefings.id });

    if (deleted.length === 0) {
      return reply.code(404).send({ error: "debriefing não encontrado" });
    }
    return { ok: true };
  });

  // ----------------------------------------------------------
  // GET /api/debriefings/:id/comments
  // ----------------------------------------------------------
  fastify.get("/api/debriefings/:id/comments", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "id inválido" });
    }

    const rows = await fastify.db
      .select({
        id: debriefingComments.id,
        text: debriefingComments.text,
        createdAt: debriefingComments.createdAt,
        anchorX: debriefingComments.anchorX,
        anchorY: debriefingComments.anchorY,
        userId: debriefingComments.userId,
        userName: users.name,
        userAvatarUrl: users.avatarUrl,
      })
      .from(debriefingComments)
      .innerJoin(users, eq(debriefingComments.userId, users.id))
      .where(eq(debriefingComments.debriefingId, params.data.id))
      .orderBy(debriefingComments.createdAt);

    return {
      comments: rows.map(({ userId, ...rest }) => ({
        ...rest,
        mine: userId === request.userId,
      })),
    };
  });

  // ----------------------------------------------------------
  // POST /api/debriefings/:id/comments
  // ----------------------------------------------------------
  fastify.post("/api/debriefings/:id/comments", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "id inválido" });
    }
    const body = commentBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "text é obrigatório" });
    }

    const [debriefing] = await fastify.db
      .select({ id: debriefings.id })
      .from(debriefings)
      .where(eq(debriefings.id, params.data.id))
      .limit(1);
    if (!debriefing) {
      return reply.code(404).send({ error: "debriefing não encontrado" });
    }

    const [created] = await fastify.db
      .insert(debriefingComments)
      .values({
        debriefingId: params.data.id,
        userId: request.userId,
        text: body.data.text,
        anchorX: body.data.anchorX,
        anchorY: body.data.anchorY,
      })
      .returning({ id: debriefingComments.id });

    return reply.code(201).send({ id: created.id });
  });

  // ----------------------------------------------------------
  // DELETE /api/debriefings/:id/comments/:commentId — só o autor
  // ----------------------------------------------------------
  fastify.delete(
    "/api/debriefings/:id/comments/:commentId",
    async (request, reply) => {
      const params = commentParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "params inválidos" });
      }

      const [comment] = await fastify.db
        .select({
          id: debriefingComments.id,
          userId: debriefingComments.userId,
          debriefingId: debriefingComments.debriefingId,
        })
        .from(debriefingComments)
        .where(eq(debriefingComments.id, params.data.commentId))
        .limit(1);

      if (!comment || comment.debriefingId !== params.data.id) {
        return reply.code(404).send({ error: "comentário não encontrado" });
      }
      if (comment.userId !== request.userId) {
        return reply
          .code(403)
          .send({ error: "apenas o autor pode excluir o comentário" });
      }

      await fastify.db
        .delete(debriefingComments)
        .where(eq(debriefingComments.id, params.data.commentId));

      return { ok: true };
    }
  );
});
