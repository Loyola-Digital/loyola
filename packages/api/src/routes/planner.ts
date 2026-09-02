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
import { plannerCampaigns, plannerGoogleCalendars } from "../db/schema.js";
import { normalizarFase, type FaseDoPlanner } from "../services/planner.js";
import {
  corParaCampanha,
  emailDaServiceAccount,
  eventosDaAgenda,
  nomeDaAgenda,
  separarTitulo,
} from "../services/planner-google.js";

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

  /**
   * Nova ordem das campanhas, de uma vez.
   *
   * Em lote, e não um PUT por card: arrastar um item no meio muda a posição de
   * todos os que vêm depois, e mandar N requisições deixaria a lista embaralhada
   * se uma falhasse — cada uma gravando uma ordem que já não é a atual.
   *
   * A posição é o ÍNDICE na lista recebida. Recalcular do zero em vez de
   * mandar deltas evita que duas pessoas arrastando ao mesmo tempo produzam
   * uma sequência com buracos ou empates.
   */
  fastify.put(`${base}/ordem`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const b = z
      .object({ ids: z.array(z.string().uuid()).max(200) })
      .safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: "Lista de ids inválida" });

    const existentes = await fastify.db
      .select({ id: plannerCampaigns.id })
      .from(plannerCampaigns);
    const conhecidos = new Set(existentes.map((c) => c.id));

    // Id que não existe mais é ignorado, não recusado: quem arrastou pode estar
    // com uma lista de trinta segundos atrás, e derrubar a reordenação inteira
    // por causa de uma campanha que alguém apagou seria pior.
    const validos = b.data.ids.filter((id) => conhecidos.has(id));

    await Promise.all(
      validos.map((id, indice) =>
        fastify.db
          .update(plannerCampaigns)
          .set({ sortOrder: indice, updatedAt: new Date() })
          .where(eq(plannerCampaigns.id, id)),
      ),
    );

    return { ok: true, ordenadas: validos.length, ignoradas: b.data.ids.length - validos.length };
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

  // ============================================================
  // Agenda do Google
  // ============================================================
  //
  // O time já planeja lá: a agenda "[FZ] Agenda Geral" tem 20 eventos e todos
  // são fases de campanha (`FZL3 - Prod. Captação`, `[FZ BLACK] Definições`).
  // O Planner só não sabia ler.

  const google = "/api/planner/google";

  fastify.get(google + "/agendas", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const agendas = await fastify.db
      .select()
      .from(plannerGoogleCalendars)
      .orderBy(asc(plannerGoogleCalendars.createdAt));
    return {
      agendas,
      // Vai na resposta para a tela mostrar o e-mail a compartilhar sem que
      // alguém precise procurá-lo no `.env`.
      emailParaCompartilhar: emailDaServiceAccount(),
    };
  });

  fastify.post(google + "/agendas", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const b = z.object({ calendarId: z.string().trim().min(3).max(300) }).safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: "Informe o ID da agenda" });

    // Confere o acesso ANTES de gravar: uma agenda cadastrada que não abre
    // vira erro toda vez que alguém tenta importar.
    let label: string;
    try {
      label = await nomeDaAgenda(b.data.calendarId);
    } catch (erro) {
      return reply
        .code(400)
        .send({ error: erro instanceof Error ? erro.message : "Não consegui abrir a agenda" });
    }

    const [criada] = await fastify.db
      .insert(plannerGoogleCalendars)
      .values({ calendarId: b.data.calendarId, label, createdBy: request.userId ?? null })
      .onConflictDoUpdate({ target: plannerGoogleCalendars.calendarId, set: { label } })
      .returning();

    return reply.code(201).send(criada);
  });

  fastify.delete(google + "/agendas/:id", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    await fastify.db.delete(plannerGoogleCalendars).where(eq(plannerGoogleCalendars.id, p.data.id));
    return { ok: true };
  });

  /**
   * Traz os eventos da agenda para o Planner.
   *
   * ## O que é criado e o que é atualizado
   *
   * A fase guarda `googleEventId`. Na reimportação, quem tem esse campo é
   * ATUALIZADO e quem não tem fica intocado — o Google manda nas fases dele, o
   * Planner manda nas próprias. Sem isso, reimportar duplicaria tudo.
   *
   * ## Evento sem campanha no título
   *
   * Vai para uma campanha chamada "Agenda", em vez de virar uma campanha nova
   * por evento. Uma reunião solta não é um lançamento.
   */
  fastify.post(google + "/importar", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const b = z
      .object({
        calendarId: z.string().trim().min(3).max(300),
        mesesAtras: z.number().int().min(0).max(24).default(6),
        mesesAFrente: z.number().int().min(1).max(24).default(12),
        /** Evento com HORA é reunião, não fase — fica de fora por padrão. */
        incluirComHora: z.boolean().default(false),
      })
      .safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: "Dados inválidos" });

    const de = new Date();
    de.setMonth(de.getMonth() - b.data.mesesAtras);
    const ate = new Date();
    ate.setMonth(ate.getMonth() + b.data.mesesAFrente);

    let eventos;
    try {
      eventos = await eventosDaAgenda(b.data.calendarId, de, ate);
    } catch (erro) {
      return reply
        .code(502)
        .send({ error: erro instanceof Error ? erro.message : "Não consegui ler a agenda" });
    }

    const aproveitados = eventos.filter((e) => b.data.incluirComHora || !e.temHora);

    // Agrupa por campanha ANTES de tocar no banco: assim cada campanha é uma
    // escrita só, e não uma por fase.
    type FaseImportada = {
      id: string;
      name: string;
      start: string;
      end: string;
      googleEventId: string;
    };
    const porCampanha = new Map<string, FaseImportada[]>();
    for (const e of aproveitados) {
      const { campanha, fase } = separarTitulo(e.titulo);
      const chave = campanha || "Agenda";
      const lista = porCampanha.get(chave) ?? [];
      lista.push({
        id: "g" + e.id.slice(0, 24),
        name: fase,
        start: e.inicio,
        end: e.fim,
        googleEventId: e.id,
      });
      porCampanha.set(chave, lista);
    }

    const existentes = await fastify.db.select().from(plannerCampaigns);
    let criadas = 0;
    let atualizadas = 0;
    let fasesTocadas = 0;

    for (const [nome, fasesDoGoogle] of porCampanha) {
      const atual = existentes.find((c) => c.name.toLowerCase() === nome.toLowerCase());

      if (!atual) {
        await fastify.db.insert(plannerCampaigns).values({
          name: nome,
          color: corParaCampanha(nome, PALETA),
          sortOrder: existentes.length + criadas,
          phases: fasesDoGoogle.map(normalizarFase),
          createdBy: request.userId ?? null,
        });
        criadas += 1;
        fasesTocadas += fasesDoGoogle.length;
        continue;
      }

      // Mantém as fases feitas à mão; substitui as que vieram do Google.
      const manuais = atual.phases.filter((f) => !f.googleEventId);
      const antesPorEvento = new Map(
        atual.phases.filter((f) => f.googleEventId).map((f) => [f.googleEventId as string, f]),
      );

      const novas = fasesDoGoogle.map((f) => {
        // Preserva o id da fase quando ela já existia: a seleção na tela e o
        // desfazer apontam para ele.
        const antes = antesPorEvento.get(f.googleEventId);
        return normalizarFase(antes ? { ...f, id: antes.id } : f);
      });

      await fastify.db
        .update(plannerCampaigns)
        .set({ phases: [...manuais, ...novas], updatedAt: new Date() })
        .where(eq(plannerCampaigns.id, atual.id));
      atualizadas += 1;
      fasesTocadas += novas.length;
    }

    await fastify.db
      .update(plannerGoogleCalendars)
      .set({ lastImportedAt: new Date() })
      .where(eq(plannerGoogleCalendars.calendarId, b.data.calendarId));

    return {
      lidos: eventos.length,
      // A diferença entre lidos e importados é informação: dizer só "importei
      // 20" esconderia as reuniões que ficaram de fora de propósito.
      ignoradosPorTerHora: eventos.length - aproveitados.length,
      campanhasCriadas: criadas,
      campanhasAtualizadas: atualizadas,
      fases: fasesTocadas,
    };
  });

});
