/**
 * Planner de campanhas — CRUD.
 *
 * ## Por que não há sincronização em tempo real aqui
 *
 * O planner original (Firebase) precisava de um algoritmo de merge por campanha
 * porque não tinha servidor: dois navegadores escreviam direto no Firestore, e
 * o que chegava podia apagar o que a pessoa estava digitando. Aqui há banco e
 * há transação — a campanha inteira é a unidade de escrita, e o último a
 * salvar vence, que é o mesmo resultado do merge original sem o algoritmo.
 *
 * O que se perde é a atualização instantânea entre abas. O que se ganha é não
 * ter uma máquina de estado de conflito para manter. Se o tempo real virar
 * necessidade, o caminho é o que o resto do app já faz: invalidar a query.
 *
 * ## Escopo global, sem projeto obrigatório
 *
 * O planner é do TIME. "FZ — BLACK" é planejado meses antes de virar projeto no
 * app, e exigir o vínculo na criação impediria justamente o uso principal.
 */

import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import fp from "fastify-plugin";
import { plannerCampaigns } from "../db/schema.js";
import { normalizarFase, type FaseDoPlanner } from "../services/planner.js";

/** Paleta cíclica — a mesma do planner original. */
export const PALETA = [
  "#6D5BD0",
  "#C2851B",
  "#2D7F8C",
  "#C4503F",
  "#4B8B3B",
  "#B0457B",
  "#3F6FB5",
  "#8A6A3C",
  "#9A3F8F",
  "#2F8F6E",
] as const;

/** As fases que uma campanha nova ganha. Vieram da planilha do time. */
export const FASES_PADRAO = [
  "Definições",
  "Prod. Captação",
  "Exec. Captação",
  "Exec. CPL",
  "Exec. Carrinho",
] as const;

const faseSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().max(200),
  start: z.string().trim().max(10),
  end: z.string().trim().max(10),
});

const corSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{3,8}$/, "Cor precisa ser hex com #");

const criarSchema = z.object({
  name: z.string().trim().min(1).max(200),
  color: corSchema.optional(),
  projectId: z.string().uuid().nullable().optional(),
  phases: z.array(faseSchema).max(60).optional(),
});

const atualizarSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  color: corSchema.optional(),
  projectId: z.string().uuid().nullable().optional(),
  // Máximo de 60 fases: acima disso não é mais um cronograma, é uma planilha —
  // e o calendário fica ilegível muito antes.
  phases: z.array(faseSchema).max(60).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

/** Um id curto e legível, no formato do planner original. */
function novoId(indice: number): string {
  return `p${indice.toString(36)}${Date.now().toString(36).slice(-4)}`;
}

export default fp(async function plannerRoutes(fastify) {
  const base = "/api/planner/campanhas";

  function denyGuest(request: { userRole?: string }): boolean {
    return request.userRole === "guest";
  }

  // ---- GET / — todas as campanhas, na ordem ----
  fastify.get(base, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const campanhas = await fastify.db
      .select()
      .from(plannerCampaigns)
      .orderBy(asc(plannerCampaigns.sortOrder), asc(plannerCampaigns.createdAt));
    return { campanhas };
  });

  // ---- POST / — cria ----
  fastify.post(base, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const b = criarSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: "Dados inválidos" });

    // A cor cicla pela paleta e a ordem vai para o fim: a campanha nova aparece
    // embaixo, onde quem criou está olhando.
    const [{ total }] = await fastify.db
      .select({ total: sql<number>`count(*)::int` })
      .from(plannerCampaigns);

    const fases: FaseDoPlanner[] = (
      b.data.phases ??
      FASES_PADRAO.map((name, i) => ({ id: novoId(i), name, start: "", end: "" }))
    ).map(normalizarFase);

    const [criada] = await fastify.db
      .insert(plannerCampaigns)
      .values({
        name: b.data.name,
        color: b.data.color ?? PALETA[(total ?? 0) % PALETA.length]!,
        projectId: b.data.projectId ?? null,
        sortOrder: total ?? 0,
        phases: fases,
        createdBy: request.userId ?? null,
      })
      .returning();

    return reply.code(201).send(criada);
  });

  // ---- PUT /:id — atualiza (a campanha inteira é a unidade) ----
  fastify.put(`${base}/:id`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const b = atualizarSchema.safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Dados inválidos" });

    const mudanca: Record<string, unknown> = { updatedAt: new Date() };
    if (b.data.name !== undefined) mudanca.name = b.data.name;
    if (b.data.color !== undefined) mudanca.color = b.data.color;
    if (b.data.projectId !== undefined) mudanca.projectId = b.data.projectId;
    if (b.data.sortOrder !== undefined) mudanca.sortOrder = b.data.sortOrder;
    // A normalização acontece no servidor, sempre: a tela pode confiar que o
    // que voltou está arrumado, e um cliente antigo não grava data inválida.
    if (b.data.phases !== undefined) mudanca.phases = b.data.phases.map(normalizarFase);

    const [atualizada] = await fastify.db
      .update(plannerCampaigns)
      .set(mudanca)
      .where(eq(plannerCampaigns.id, p.data.id))
      .returning();

    if (!atualizada) return reply.code(404).send({ error: "Campanha não encontrada" });
    return atualizada;
  });

  // ---- POST /:id/duplicar ----
  fastify.post(`${base}/:id/duplicar`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [origem] = await fastify.db
      .select()
      .from(plannerCampaigns)
      .where(eq(plannerCampaigns.id, p.data.id))
      .limit(1);
    if (!origem) return reply.code(404).send({ error: "Campanha não encontrada" });

    // Fases ganham id novo: manter os antigos faria a seleção na tela apontar
    // para duas barras ao mesmo tempo.
    const fases = origem.phases.map((f, i) => ({ ...f, id: novoId(i) }));

    const [copia] = await fastify.db
      .insert(plannerCampaigns)
      .values({
        name: `${origem.name} (cópia)`,
        color: origem.color,
        projectId: origem.projectId,
        // Logo abaixo da original: duplicar para comparar só ajuda se as duas
        // ficarem lado a lado.
        sortOrder: origem.sortOrder + 1,
        phases: fases,
        createdBy: request.userId ?? null,
      })
      .returning();

    // Empurra quem vinha depois, para a cópia caber sem colidir na ordenação.
    await fastify.db
      .update(plannerCampaigns)
      .set({ sortOrder: sql`${plannerCampaigns.sortOrder} + 1` })
      .where(sql`${plannerCampaigns.sortOrder} > ${origem.sortOrder} AND ${plannerCampaigns.id} <> ${copia!.id}`);

    return reply.code(201).send(copia);
  });

  // ---- DELETE /:id ----
  fastify.delete(`${base}/:id`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const apagadas = await fastify.db
      .delete(plannerCampaigns)
      .where(eq(plannerCampaigns.id, p.data.id))
      .returning({ id: plannerCampaigns.id });

    if (apagadas.length === 0) return reply.code(404).send({ error: "Campanha não encontrada" });
    return { ok: true };
  });
});
