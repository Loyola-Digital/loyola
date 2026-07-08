/**
 * Epic 38 / Story 38.1 — Log de Campanha
 *
 * Registro fixo por funil das ações executadas na campanha (disparo de
 * e-mail/WhatsApp/SMS, publicações, ações no gerenciador de anúncios, etc.).
 * Substitui a planilha manual. Acesso segue as regras das rotas de funil:
 * guest precisa de membership no projeto, e pode ler E escrever (o time de
 * tráfego lança ações).
 */

import { z } from "zod";
import { and, desc, eq, gte, ilike } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  campaignLogEntries,
  funnels,
  instagramAccounts,
  instagramAccountProjects,
  mauticConnections,
  projects,
  projectMembers,
  users,
} from "../db/schema.js";
import { decryptMauticPassword, listAllMauticEmails } from "../services/mautic.js";

const funnelParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const entryParamsSchema = funnelParamsSchema.extend({
  entryId: z.string().uuid(),
});

const listQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(3650).default(90),
  evento: z.string().trim().max(80).optional(),
  aplicativo: z.string().trim().max(80).optional(),
  categoria: z.string().trim().max(80).optional(),
  /** Busca textual nas observações. */
  q: z.string().trim().max(200).optional(),
});

// Aceita ISO completo ou o formato do <input type="datetime-local"> (sem tz —
// interpretado como horário local do servidor, mesmo racional do saleDate).
const occurredAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "occurredAt inválido");

const baseEntryObject = z.object({
  occurredAt: occurredAtSchema,
  evento: z.string().trim().min(1).max(80),
  aplicativo: z.string().trim().max(80).nullable().optional().or(z.literal("").transform(() => null)),
  categoria: z.string().trim().max(80).nullable().optional().or(z.literal("").transform(() => null)),
  notes: z.string().trim().max(2000).nullable().optional().or(z.literal("").transform(() => null)),
  responsavel: z.string().trim().max(255).nullable().optional().or(z.literal("").transform(() => null)),
});

const createEntrySchema = baseEntryObject;
const updateEntrySchema = baseEntryObject.partial();

/**
 * Normaliza nome do usuário pra exibição: detecta Clerk ID literal
 * ("user_xxx"), cópia do email ou placeholder "Usuário" e tenta derivar do
 * local-part do email. Mesma lógica de manual-sales.ts/funnel-stages.ts,
 * com o caso extra do placeholder (emails @placeholder.dev não ajudam —
 * mantém como está; o dialog grava o nome real da sessão em `responsavel`).
 */
/**
 * Código do funil pra casar com o nome dos emails no Mautic (mesma regra do
 * dashboard 32.2 em routes/mautic.ts): 2 primeiros segmentos do nome
 * (ex.: "dg-pg02-abr-26" → "dg-pg02"). O matchCode do funil sobrescreve.
 */
function funnelMatchToken(funnelName: string): string {
  const segs = funnelName.trim().split("-").filter(Boolean);
  if (segs.length >= 2) return `${segs[0]}-${segs[1]}`;
  return funnelName.trim();
}

function displayUserName(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const looksLikeClerkId = typeof name === "string" && /^user_[A-Za-z0-9]+$/.test(name);
  const isPlaceholderName = name === "Usuário";
  const nameIsEmail = name && email && name === email;
  if (name && !looksLikeClerkId && !nameIsEmail && !isPlaceholderName) return name;

  if (email && !email.endsWith("@placeholder.dev")) {
    const local = email.split("@")[0].split("+")[0];
    return local
      .replace(/[._-]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return name ?? "Usuário";
}

function shapeEntry(
  r: typeof campaignLogEntries.$inferSelect,
  author?: { name: string | null; avatarUrl: string | null } | null,
) {
  return {
    id: r.id,
    funnelId: r.funnelId,
    occurredAt: r.occurredAt.toISOString(),
    evento: r.evento,
    aplicativo: r.aplicativo,
    categoria: r.categoria,
    notes: r.notes,
    responsavel: r.responsavel,
    source: r.source,
    createdBy: r.createdBy,
    authorName: author?.name ?? null,
    authorAvatarUrl: author?.avatarUrl ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export default fp(async function campaignLogRoutes(fastify) {
  /** Valida projeto + funil (+ membership quando guest). null = sem acesso. */
  async function getFunnelContext(
    projectId: string,
    funnelId: string,
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

    const [funnel] = await fastify.db
      .select({
        id: funnels.id,
        name: funnels.name,
        matchCode: funnels.matchCode,
        createdAt: funnels.createdAt,
        archivedAt: funnels.archivedAt,
      })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  // ---------------------------------------------------------------
  // GET — lista entradas do log (filtros opcionais)
  // ---------------------------------------------------------------
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/campaign-log",
    async (request, reply) => {
      const params = funnelParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const funnel = await getFunnelContext(
        params.data.projectId,
        params.data.funnelId,
        request.userId,
        request.userRole,
      );
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const since = new Date(Date.now() - query.data.days * 24 * 60 * 60 * 1000);
      const conditions = [
        eq(campaignLogEntries.funnelId, params.data.funnelId),
        gte(campaignLogEntries.occurredAt, since),
      ];
      if (query.data.evento) conditions.push(eq(campaignLogEntries.evento, query.data.evento));
      if (query.data.aplicativo) conditions.push(eq(campaignLogEntries.aplicativo, query.data.aplicativo));
      if (query.data.categoria) conditions.push(eq(campaignLogEntries.categoria, query.data.categoria));
      if (query.data.q) conditions.push(ilike(campaignLogEntries.notes, `%${query.data.q}%`));

      const rows = await fastify.db
        .select({
          entry: campaignLogEntries,
          authorName: users.name,
          authorEmail: users.email,
          authorAvatarUrl: users.avatarUrl,
        })
        .from(campaignLogEntries)
        .innerJoin(users, eq(campaignLogEntries.createdBy, users.id))
        .where(and(...conditions))
        .orderBy(desc(campaignLogEntries.occurredAt));

      return {
        entries: rows.map((r) =>
          shapeEntry(r.entry, {
            name: displayUserName(r.authorName, r.authorEmail),
            avatarUrl: r.authorAvatarUrl,
          }),
        ),
      };
    },
  );

  // ---------------------------------------------------------------
  // POST — cria entrada
  // ---------------------------------------------------------------
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/campaign-log",
    async (request, reply) => {
      const params = funnelParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = createEntrySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
      }

      const funnel = await getFunnelContext(
        params.data.projectId,
        params.data.funnelId,
        request.userId,
        request.userRole,
      );
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const occurredAt = new Date(body.data.occurredAt);
      if (isNaN(occurredAt.getTime())) {
        return reply.code(400).send({ error: "Data/hora da ação inválida" });
      }

      const [created] = await fastify.db
        .insert(campaignLogEntries)
        .values({
          funnelId: params.data.funnelId,
          occurredAt,
          evento: body.data.evento,
          aplicativo: body.data.aplicativo ?? null,
          categoria: body.data.categoria ?? null,
          notes: body.data.notes ?? null,
          responsavel: body.data.responsavel ?? null,
          createdBy: request.userId,
        })
        .returning();

      return reply.code(201).send(shapeEntry(created));
    },
  );

  // ---------------------------------------------------------------
  // PATCH — edita entrada (parcial)
  // ---------------------------------------------------------------
  fastify.patch(
    "/api/projects/:projectId/funnels/:funnelId/campaign-log/:entryId",
    async (request, reply) => {
      const params = entryParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = updateEntrySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
      }

      const funnel = await getFunnelContext(
        params.data.projectId,
        params.data.funnelId,
        request.userId,
        request.userRole,
      );
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const updates: Partial<typeof campaignLogEntries.$inferInsert> = {};
      if (body.data.occurredAt !== undefined) {
        const occurredAt = new Date(body.data.occurredAt);
        if (isNaN(occurredAt.getTime())) {
          return reply.code(400).send({ error: "Data/hora da ação inválida" });
        }
        updates.occurredAt = occurredAt;
      }
      if (body.data.evento !== undefined) updates.evento = body.data.evento;
      if (body.data.aplicativo !== undefined) updates.aplicativo = body.data.aplicativo ?? null;
      if (body.data.categoria !== undefined) updates.categoria = body.data.categoria ?? null;
      if (body.data.notes !== undefined) updates.notes = body.data.notes ?? null;
      if (body.data.responsavel !== undefined) updates.responsavel = body.data.responsavel ?? null;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: "Nenhum campo pra atualizar" });
      }
      updates.updatedAt = new Date();

      const [updated] = await fastify.db
        .update(campaignLogEntries)
        .set(updates)
        .where(
          and(
            eq(campaignLogEntries.id, params.data.entryId),
            eq(campaignLogEntries.funnelId, params.data.funnelId),
          ),
        )
        .returning();

      if (!updated) return reply.code(404).send({ error: "Entrada não encontrada" });
      return shapeEntry(updated);
    },
  );

  // ---------------------------------------------------------------
  // POST /sync — Stories 38.2a/38.2b: importa entradas automáticas.
  //  · Mautic: disparos de e-mail broadcast ("list") já enviados, cujo nome
  //    contém o código do funil (matchCode override ou prefixo do nome —
  //    mesma regra do dashboard Mautic 32.2).
  //  · Instagram: posts das contas do projeto publicados ENQUANTO a campanha
  //    está ativa (timestamp >= funnels.createdAt; funil arquivado não
  //    sincroniza) — "se o post saiu com a campanha rodando, é dela".
  // Dedup por source_id — re-sincronizar não duplica. Fontes independentes:
  // falha em uma não derruba a outra.
  // ---------------------------------------------------------------
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/campaign-log/sync",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const params = funnelParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const funnel = await getFunnelContext(
        params.data.projectId,
        params.data.funnelId,
        request.userId,
        request.userRole,
      );
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const empty = { connected: false, matched: 0, created: 0 };
      // Campanha arquivada não acumula entradas novas — histórico congela.
      if (funnel.archivedAt) {
        return { archived: true, mautic: empty, instagram: empty };
      }

      // ---- Mautic (38.2a) ----
      let mauticResult = { ...empty };
      const [conn] = await fastify.db
        .select()
        .from(mauticConnections)
        .where(eq(mauticConnections.projectId, params.data.projectId))
        .limit(1);
      if (conn) {
        try {
          const password = decryptMauticPassword(conn.passwordEncrypted, conn.passwordIv);
          const token = (funnel.matchCode ?? funnelMatchToken(funnel.name)).toLowerCase();
          const emails = await listAllMauticEmails(conn.baseUrl, conn.username, password);
          // Broadcast ("list") já enviado + nome com o código do funil.
          const matched = emails.filter(
            (e) => e.emailType === "list" && e.sent > 0 && e.name.toLowerCase().includes(token),
          );
          let created = 0;
          for (const email of matched) {
            const occurredRaw = email.publishUp ?? email.dateAdded;
            if (!occurredRaw) continue;
            const occurredAt = new Date(occurredRaw);
            if (isNaN(occurredAt.getTime())) continue;
            const inserted = await fastify.db
              .insert(campaignLogEntries)
              .values({
                funnelId: params.data.funnelId,
                occurredAt,
                evento: "Disparo de e-mail",
                aplicativo: "Mautic",
                categoria: null,
                notes: `${email.name} · ${email.sent.toLocaleString("pt-BR")} enviados`,
                responsavel: "Mautic (auto)",
                source: "mautic",
                sourceId: `mautic-email:${email.id}`,
                createdBy: request.userId,
              })
              .onConflictDoNothing()
              .returning({ id: campaignLogEntries.id });
            if (inserted.length > 0) created += 1;
          }
          mauticResult = { connected: true, matched: matched.length, created };
        } catch (err) {
          fastify.log.warn({ err }, "campaign-log sync: Mautic falhou (segue Instagram)");
          mauticResult = { connected: true, matched: 0, created: 0 };
        }
      }

      // ---- Instagram (38.2b) ----
      let instagramResult = { ...empty };
      const igAccounts = await fastify.db
        .select({ id: instagramAccounts.id })
        .from(instagramAccounts)
        .innerJoin(
          instagramAccountProjects,
          and(
            eq(instagramAccountProjects.accountId, instagramAccounts.id),
            eq(instagramAccountProjects.projectId, params.data.projectId),
          ),
        )
        .where(eq(instagramAccounts.isActive, true));

      if (igAccounts.length > 0) {
        const funnelStart = funnel.createdAt;
        let matched = 0;
        let created = 0;
        for (const account of igAccounts) {
          try {
            const media = await fastify.instagramService.getMediaListBasic(account.id, 50);
            for (const post of media) {
              const publishedAt = new Date(post.timestamp);
              if (isNaN(publishedAt.getTime()) || publishedAt < funnelStart) continue;
              matched += 1;

              const categoria =
                post.media_type === "CAROUSEL_ALBUM"
                  ? "Carrossel"
                  : post.media_type === "VIDEO"
                    ? "Reel"
                    : "Feed";
              const captionLine =
                (post.caption ?? "").split("\n")[0].trim().slice(0, 120) || "(sem legenda)";
              const notes = post.permalink ? `${captionLine} · ${post.permalink}` : captionLine;

              const inserted = await fastify.db
                .insert(campaignLogEntries)
                .values({
                  funnelId: params.data.funnelId,
                  occurredAt: publishedAt,
                  evento: "Publicação em rede-social",
                  aplicativo: "Instagram",
                  categoria,
                  notes,
                  responsavel: "Instagram (auto)",
                  source: "instagram",
                  sourceId: `ig-media:${post.id}`,
                  createdBy: request.userId,
                })
                .onConflictDoNothing()
                .returning({ id: campaignLogEntries.id });
              if (inserted.length > 0) created += 1;
            }
            instagramResult = { connected: true, matched, created };
          } catch (err) {
            fastify.log.warn({ err }, "campaign-log sync: Instagram falhou (conta segue)");
            instagramResult = { connected: true, matched, created };
          }
        }
      }

      return { archived: false, mautic: mauticResult, instagram: instagramResult };
    },
  );

  // ---------------------------------------------------------------
  // DELETE — remove entrada
  // ---------------------------------------------------------------
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/campaign-log/:entryId",
    async (request, reply) => {
      const params = entryParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const funnel = await getFunnelContext(
        params.data.projectId,
        params.data.funnelId,
        request.userId,
        request.userRole,
      );
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      // Entrada automática não pode ser excluída — o dedup (source_id) a
      // recriaria no próximo sync. Ela some quando a origem sumir.
      const [existing] = await fastify.db
        .select({ source: campaignLogEntries.source })
        .from(campaignLogEntries)
        .where(
          and(
            eq(campaignLogEntries.id, params.data.entryId),
            eq(campaignLogEntries.funnelId, params.data.funnelId),
          ),
        )
        .limit(1);
      if (!existing) return reply.code(404).send({ error: "Entrada não encontrada" });
      if (existing.source !== "manual") {
        return reply.code(400).send({
          error: "Entrada automática (sync) não pode ser excluída — ela voltaria no próximo sync",
        });
      }

      const deleted = await fastify.db
        .delete(campaignLogEntries)
        .where(
          and(
            eq(campaignLogEntries.id, params.data.entryId),
            eq(campaignLogEntries.funnelId, params.data.funnelId),
          ),
        )
        .returning({ id: campaignLogEntries.id });

      if (deleted.length === 0) return reply.code(404).send({ error: "Entrada não encontrada" });
      return { ok: true };
    },
  );
});
