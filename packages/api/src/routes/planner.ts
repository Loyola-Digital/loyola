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
import {
  normalizarFase,
  planejarSincronia,
  vinculosDoServidor,
  type FaseDoPlanner,
} from "../services/planner.js";
import { importarDaAgenda } from "../services/planner-sync.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { registrarNoPlanner } from "../services/planner-auditoria.js";
import { chaveDeTexto } from "../services/planner-anual.js";
import {
  apagarEvento,
  atualizarEvento,
  criarEvento,
  emailDaServiceAccount,
  nomeDaAgenda,
  tituloParaGoogle,
} from "../services/planner-google.js";
import { PALETA_DO_GOOGLE } from "../services/cores-do-google.js";

/**
 * Paleta cíclica — as onze cores de evento do Google Calendar.
 *
 * Era um conjunto próprio, herdado do planner original. O time olha as duas
 * telas, e um lançamento roxo aqui e vermelho no Google perde exatamente o que
 * a cor faz num calendário: reconhecer de relance. Ver `cores-do-google.ts`.
 */
export const PALETA = PALETA_DO_GOOGLE;

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
  /**
   * Precisa estar AQUI, e nao so no banco.
   *
   * O Zod remove o que nao declara. Sem esta linha, qualquer edicao de uma
   * campanha importada apagava o vinculo de TODAS as fases com o Google -- e a
   * reimportacao seguinte, que so preserva quem nao tem o campo, as trataria
   * como manuais e somaria as do Google por cima, duplicando o cronograma
   * inteiro. Nenhuma campanha chegou a duplicar porque ninguem reimportou
   * depois de editar; o defeito estava armado.
   */
  googleEventId: z.string().trim().max(1024).optional(),
  googleSyncPendente: z.boolean().optional(),
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
  /** Agenda que espelha esta campanha. Vazio = vive so aqui. */
  googleCalendarId: z.string().trim().max(300).nullable().optional(),
});

const atualizarSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  color: corSchema.optional(),
  projectId: z.string().uuid().nullable().optional(),
  // Máximo de 60 fases: acima disso não é mais um cronograma, é uma planilha —
  // e o calendário fica ilegível muito antes.
  phases: z.array(faseSchema).max(60).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  googleCalendarId: z.string().trim().max(300).nullable().optional(),
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
    if (denyGuest(request))
      return reply.code(403).send({ error: "Acesso negado" });
    const campanhas = await fastify.db
      .select()
      .from(plannerCampaigns)
      .orderBy(
        asc(plannerCampaigns.sortOrder),
        asc(plannerCampaigns.createdAt),
      );
    return { campanhas };
  });

  // ---- POST / — cria ----
  fastify.post(base, async (request, reply) => {
    if (denyGuest(request))
      return reply.code(403).send({ error: "Acesso negado" });
    const b = criarSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: "Dados inválidos" });
    const { criada, aviso } = await criarCampanha(b.data, request.userId ?? null);
    return reply.code(201).send(aviso ? { ...criada, avisoGoogle: aviso } : criada);
  });

  /**
   * Cria a campanha e espelha na agenda. Mora fora da rota porque a API
   * pública (`/api/public/v1/planner`) cria pelo MESMO caminho — uma segunda
   * cópia divergiria no primeiro ajuste do espelho.
   */
  async function criarCampanha(
    dados: z.infer<typeof criarSchema>,
    userId: string | null,
  ) {
    // A cor cicla pela paleta e a ordem vai para o fim: a campanha nova aparece
    // embaixo, onde quem criou está olhando.
    const [{ total }] = await fastify.db
      .select({ total: sql<number>`count(*)::int` })
      .from(plannerCampaigns);

    // O desfazer da exclusão volta com os ids dos eventos que a exclusão
    // apagou: mantê-los faz o Google RESTAURAR os mesmos eventos (o PATCH
    // leva `status: confirmed`). Só não vale o id que outra campanha usa.
    const deOutras = await eventosDeOutras(null);
    const fases: FaseDoPlanner[] = (
      dados.phases ??
      FASES_PADRAO.map((name, i) => ({
        id: novoId(i),
        name,
        start: "",
        end: "",
      }))
    ).map((f) => {
      const n = normalizarFase(f);
      if (n.googleEventId && deOutras.has(n.googleEventId)) delete n.googleEventId;
      return n;
    });

    // Campanha nova nasce ja na agenda, quando ha uma escolhida: criar aqui e
    // ter de lembrar de espelhar depois seria o passo que todo mundo esquece.
    const agendaNova = dados.googleCalendarId ?? null;
    // Os ids que o Google devolveu PRECISAM ir para o banco. Antes o retorno
    // era descartado: os eventos nasciam na agenda, as fases ficavam sem
    // vínculo, e a importação seguinte os trazia de volta como fases novas —
    // cada campanha criada já ligada a uma agenda nascia com cards em dobro.
    const { fases: comVinculo, aviso } = await espelharNoGoogle({
      agenda: agendaNova,
      nomeAntes: dados.name,
      nomeDepois: dados.name,
      fasesAntes: [],
      fasesDepois: fases,
    });

    const [criada] = await fastify.db
      .insert(plannerCampaigns)
      .values({
        name: dados.name,
        color: dados.color ?? PALETA[(total ?? 0) % PALETA.length]!,
        projectId: dados.projectId ?? null,
        googleCalendarId: agendaNova,
        sortOrder: total ?? 0,
        phases: comVinculo ?? fases,
        createdBy: userId,
      })
      .returning();

    return { criada: criada!, aviso };
  }

  // ---- PUT /:id — atualiza (a campanha inteira é a unidade) ----
  fastify.put(`${base}/:id`, async (request, reply) => {
    if (denyGuest(request))
      return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const b = atualizarSchema.safeParse(request.body);
    if (!p.success || !b.success)
      return reply.code(400).send({ error: "Dados inválidos" });
    const salva = await salvarCampanha(p.data.id, b.data);
    if (!salva) return reply.code(404).send({ error: "Campanha não encontrada" });
    // O aviso viaja junto com a campanha salva: o trabalho local NAO se perde
    // porque o Google recusou, e quem editou fica sabendo que a agenda ficou
    // para tras.
    return salva.aviso ? { ...salva.atualizada, avisoGoogle: salva.aviso } : salva.atualizada;
  });

  /**
   * Grava a campanha e espelha o que mudou na agenda. `null` = não existe.
   *
   * Compartilhada com a API pública pelo mesmo motivo de `criarCampanha`.
   */
  async function salvarCampanha(id: string, dados: z.infer<typeof atualizarSchema>) {
    // Precisa do estado ANTERIOR para saber o que mudou na agenda: sem ele
    // nao da para distinguir "fase nova" de "fase que so foi salva de novo",
    // e cada gravacao reescreveria a agenda inteira.
    const [antes] = await fastify.db
      .select()
      .from(plannerCampaigns)
      .where(eq(plannerCampaigns.id, id))
      .limit(1);
    if (!antes) return null;

    const mudanca: Record<string, unknown> = { updatedAt: new Date() };
    if (dados.name !== undefined) mudanca.name = dados.name;
    if (dados.color !== undefined) mudanca.color = dados.color;
    if (dados.projectId !== undefined) mudanca.projectId = dados.projectId;
    if (dados.sortOrder !== undefined) mudanca.sortOrder = dados.sortOrder;
    if (dados.googleCalendarId !== undefined)
      mudanca.googleCalendarId = dados.googleCalendarId;
    // A normalização acontece no servidor, sempre: a tela pode confiar que o
    // que voltou está arrumado, e um cliente antigo não grava data inválida.
    if (dados.phases !== undefined)
      mudanca.phases = dados.phases.map(normalizarFase);

    const nomeDepois = (dados.name ?? antes.name) as string;
    if (mudanca.phases) {
      mudanca.phases = vinculosDoServidor(
        mudanca.phases as FaseDoPlanner[],
        antes.phases as FaseDoPlanner[],
        await eventosDeOutras(id),
      );
    }
    const fasesDepois = (mudanca.phases ?? antes.phases) as FaseDoPlanner[];
    const agenda = (dados.googleCalendarId ?? antes.googleCalendarId) as
      string | null;

    const { fases: fasesFinais, aviso } = await espelharNoGoogle({
      agenda,
      nomeAntes: antes.name,
      nomeDepois,
      fasesAntes: antes.phases as FaseDoPlanner[],
      fasesDepois,
    });
    // Os ids que o Google acabou de dar precisam ir para o banco na MESMA
    // gravacao: um evento criado cuja fase nao guardou o id vira orfao, e o
    // proximo save cria outro em cima.
    if (fasesFinais) mudanca.phases = fasesFinais;

    const [atualizada] = await fastify.db
      .update(plannerCampaigns)
      .set(mudanca)
      .where(eq(plannerCampaigns.id, id))
      .returning();

    if (!atualizada) return null;
    return { atualizada, aviso };
  }

  // ==========================================================================
  // API PÚBLICA (X-API-Key) — calendário do Planner para o Claude da Ágatha.
  //
  // Mesmo caminho da tela (`criarCampanha` / `salvarCampanha`): o que entra
  // por aqui espelha no Google Calendar exatamente como uma edição na tela.
  //
  // A diferença é a UNIDADE: a tela salva a campanha inteira; aqui a fase é
  // editada sozinha. Um modelo que precisasse reenviar todas as fases para
  // mudar uma apagaria, cedo ou tarde, a que ele esqueceu de copiar.
  //
  // Contrato completo: `docs/llms.txt` → "Planner".
  // ==========================================================================
  const pub = "/api/public/v1/planner";
  const LER = requireScope("planner:read", "planner:write");
  const ESCREVER = requireScope("planner:write");
  const DATA = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD")
    .nullable()
    .optional();

  async function agendasConectadas() {
    return fastify.db
      .select({ id: plannerGoogleCalendars.calendarId, nome: plannerGoogleCalendars.label })
      .from(plannerGoogleCalendars);
  }

  /** A agenda pelo id OU pelo nome ("FZ" acha "🇺🇸 [FZ] Agenda Geral"). */
  async function resolverAgenda(texto: string) {
    const agendas = await agendasConectadas();
    const exata = agendas.find((a) => a.id === texto);
    if (exata) return { agenda: exata, agendas };
    const k = chaveDeTexto(texto);
    const achadas = agendas.filter((a) => chaveDeTexto(a.nome).includes(k));
    return { agenda: achadas.length === 1 ? achadas[0]! : null, agendas };
  }

  function campanhaPublica(
    c: typeof plannerCampaigns.$inferSelect,
    nomes: Map<string, string>,
  ) {
    return {
      id: c.id,
      nome: c.name,
      cor: c.color,
      projectId: c.projectId,
      agenda: c.googleCalendarId
        ? { id: c.googleCalendarId, nome: nomes.get(c.googleCalendarId) ?? null }
        : null,
      fases: ((c.phases ?? []) as FaseDoPlanner[]).map((f) => ({
        id: f.id,
        nome: f.name,
        inicio: f.start || null,
        fim: f.end || null,
        // Tem evento no Google e ele está em dia com a fase.
        noGoogle: Boolean(f.googleEventId) && !f.googleSyncPendente,
      })),
      atualizadoEm: c.updatedAt,
    };
  }

  async function nomesDasAgendas() {
    return new Map((await agendasConectadas()).map((a) => [a.id, a.nome]));
  }

  async function campanhaPorId(id: string) {
    const [c] = await fastify.db
      .select()
      .from(plannerCampaigns)
      .where(eq(plannerCampaigns.id, id))
      .limit(1);
    return c ?? null;
  }

  const idDaChave = (request: { apiKey?: { id: string } }) => request.apiKey?.id ?? null;

  fastify.get(`${pub}/agendas`, { preHandler: LER }, async () => ({
    agendas: await agendasConectadas(),
  }));

  fastify.get(`${pub}/campanhas`, { preHandler: LER }, async (request, reply) => {
    const q = z
      .object({
        projectId: z.string().uuid().optional(),
        de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        busca: z.string().max(120).optional(),
      })
      .safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({ error: "Filtros: projectId (uuid), de/ate (AAAA-MM-DD), busca (texto)." });
    }
    const todas = await fastify.db
      .select()
      .from(plannerCampaigns)
      .orderBy(asc(plannerCampaigns.sortOrder), asc(plannerCampaigns.createdAt));
    const { projectId, de, ate, busca } = q.data;
    const filtradas = todas.filter((c) => {
      if (projectId && c.projectId !== projectId) return false;
      if (busca && !chaveDeTexto(c.name).includes(chaveDeTexto(busca))) return false;
      if (de || ate) {
        // Entra quem tem ALGUMA fase cruzando a janela.
        return ((c.phases ?? []) as FaseDoPlanner[]).some((f) => {
          if (!f.start) return false;
          const fim = f.end || f.start;
          return (!ate || f.start <= ate) && (!de || fim >= de);
        });
      }
      return true;
    });
    const nomes = await nomesDasAgendas();
    return { campanhas: filtradas.map((c) => campanhaPublica(c, nomes)) };
  });

  fastify.get(`${pub}/campanhas/:id`, { preHandler: LER }, async (request, reply) => {
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "id inválido" });
    const c = await campanhaPorId(p.data.id);
    if (!c) return reply.code(404).send({ error: "Campanha não encontrada" });
    return campanhaPublica(c, await nomesDasAgendas());
  });

  fastify.post(`${pub}/campanhas`, { preHandler: ESCREVER }, async (request, reply) => {
    const b = z
      .object({
        nome: z.string().trim().min(1).max(200),
        projectId: z.string().uuid().nullable().optional(),
        cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        agenda: z.string().max(300).nullable().optional(),
        fases: z
          .array(z.object({ nome: z.string().trim().min(1).max(200), inicio: DATA, fim: DATA }))
          .max(60)
          .optional(),
      })
      .safeParse(request.body);
    if (!b.success) {
      return reply.code(400).send({
        error: "Esperado { nome, projectId?, cor? (#rrggbb), agenda? (id ou nome), fases?: [{ nome, inicio?, fim? }] }.",
        detalhes: b.error.flatten(),
      });
    }
    let agendaId: string | null = null;
    if (b.data.agenda) {
      const { agenda, agendas } = await resolverAgenda(b.data.agenda);
      if (!agenda) {
        return reply.code(400).send({
          error: `Agenda "${b.data.agenda}" não identificada. Conectadas: ${agendas.map((a) => a.nome).join(" | ")}.`,
        });
      }
      agendaId = agenda.id;
    }
    const { criada, aviso } = await criarCampanha(
      {
        name: b.data.nome,
        color: b.data.cor,
        projectId: b.data.projectId ?? null,
        googleCalendarId: agendaId,
        // Sem fases = sem fases. As fases-padrão da tela são rascunho para
        // quem clica; aqui virariam quatro cards vazios que ninguém pediu.
        phases: (b.data.fases ?? []).map((f, i) => ({
          id: novoId(i),
          name: f.nome,
          start: f.inicio ?? "",
          end: f.fim ?? "",
        })),
      },
      null,
    );
    await registrarNoPlanner(fastify.db, request.log, {
      apiKeyId: idDaChave(request),
      acao: "campanha.criar",
      projectId: criada.projectId,
      detalhe: { campanhaId: criada.id, pedido: b.data },
    });
    return reply
      .code(201)
      .send({ ...campanhaPublica(criada, await nomesDasAgendas()), ...(aviso ? { avisoGoogle: aviso } : {}) });
  });

  fastify.patch(`${pub}/campanhas/:id`, { preHandler: ESCREVER }, async (request, reply) => {
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const b = z
      .object({
        nome: z.string().trim().min(1).max(200).optional(),
        projectId: z.string().uuid().nullable().optional(),
        cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        agenda: z.string().max(300).nullable().optional(),
      })
      .safeParse(request.body);
    if (!p.success || !b.success) {
      return reply.code(400).send({ error: "Esperado { nome?, projectId?, cor?, agenda? (id, nome ou null para desligar) }." });
    }
    const antes = await campanhaPorId(p.data.id);
    if (!antes) return reply.code(404).send({ error: "Campanha não encontrada" });

    let googleCalendarId: string | null | undefined;
    if (b.data.agenda === null) googleCalendarId = null;
    else if (b.data.agenda) {
      const { agenda, agendas } = await resolverAgenda(b.data.agenda);
      if (!agenda) {
        return reply.code(400).send({
          error: `Agenda "${b.data.agenda}" não identificada. Conectadas: ${agendas.map((a) => a.nome).join(" | ")}.`,
        });
      }
      googleCalendarId = agenda.id;
    }
    const salva = await salvarCampanha(p.data.id, {
      name: b.data.nome,
      color: b.data.cor,
      projectId: b.data.projectId,
      googleCalendarId,
    });
    if (!salva) return reply.code(404).send({ error: "Campanha não encontrada" });
    await registrarNoPlanner(fastify.db, request.log, {
      apiKeyId: idDaChave(request),
      acao: "campanha.editar",
      projectId: salva.atualizada.projectId,
      detalhe: {
        campanhaId: antes.id,
        antes: { nome: antes.name, cor: antes.color, projectId: antes.projectId, agenda: antes.googleCalendarId },
        pedido: b.data,
      },
    });
    return {
      ...campanhaPublica(salva.atualizada, await nomesDasAgendas()),
      ...(salva.aviso ? { avisoGoogle: salva.aviso } : {}),
    };
  });

  /** Aplica uma mudança nas fases e salva pelo caminho da tela. */
  async function mudarFases(
    request: { apiKey?: { id: string }; log: typeof fastify.log },
    campanhaId: string,
    acao: string,
    mudar: (fases: FaseDoPlanner[]) => FaseDoPlanner[] | string,
  ) {
    const antes = await campanhaPorId(campanhaId);
    if (!antes) return { status: 404 as const, corpo: { error: "Campanha não encontrada" } };
    const fasesAntes = (antes.phases ?? []) as FaseDoPlanner[];
    const r = mudar(fasesAntes.map((f) => ({ ...f })));
    if (typeof r === "string") return { status: 404 as const, corpo: { error: r } };
    const salva = await salvarCampanha(campanhaId, { phases: r });
    if (!salva) return { status: 404 as const, corpo: { error: "Campanha não encontrada" } };
    await registrarNoPlanner(fastify.db, request.log, {
      apiKeyId: idDaChave(request),
      acao,
      projectId: salva.atualizada.projectId,
      detalhe: {
        campanhaId,
        antes: fasesAntes.map(({ id, name, start, end }) => ({ id, name, start, end })),
        depois: ((salva.atualizada.phases ?? []) as FaseDoPlanner[]).map(({ id, name, start, end }) => ({ id, name, start, end })),
      },
    });
    return {
      status: 200 as const,
      corpo: {
        ...campanhaPublica(salva.atualizada, await nomesDasAgendas()),
        ...(salva.aviso ? { avisoGoogle: salva.aviso } : {}),
      },
    };
  }

  fastify.post(`${pub}/campanhas/:id/fases`, { preHandler: ESCREVER }, async (request, reply) => {
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const b = z
      .object({ nome: z.string().trim().min(1).max(200), inicio: DATA, fim: DATA })
      .safeParse(request.body);
    if (!p.success || !b.success) {
      return reply.code(400).send({ error: "Esperado { nome, inicio? (AAAA-MM-DD), fim? (AAAA-MM-DD) }." });
    }
    let novaId = "";
    const r = await mudarFases(request, p.data.id, "fase.criar", (fases) => {
      novaId = novoId(fases.length);
      return [...fases, { id: novaId, name: b.data.nome, start: b.data.inicio ?? "", end: b.data.fim ?? "" }];
    });
    return reply.code(r.status === 200 ? 201 : r.status).send({ ...r.corpo, faseCriada: novaId || undefined });
  });

  fastify.patch(`${pub}/campanhas/:id/fases/:faseId`, { preHandler: ESCREVER }, async (request, reply) => {
    const p = z.object({ id: z.string().uuid(), faseId: z.string().min(1).max(64) }).safeParse(request.params);
    const b = z
      .object({ nome: z.string().trim().min(1).max(200).optional(), inicio: DATA, fim: DATA })
      .safeParse(request.body);
    if (!p.success || !b.success) {
      return reply.code(400).send({ error: "Esperado { nome?, inicio?, fim? } — data AAAA-MM-DD, null limpa." });
    }
    const r = await mudarFases(request, p.data.id, "fase.editar", (fases) => {
      const f = fases.find((x) => x.id === p.data.faseId);
      if (!f) return `Fase ${p.data.faseId} não existe nesta campanha.`;
      if (b.data.nome !== undefined) f.name = b.data.nome;
      if (b.data.inicio !== undefined) f.start = b.data.inicio ?? "";
      if (b.data.fim !== undefined) f.end = b.data.fim ?? "";
      return fases;
    });
    return reply.code(r.status).send(r.corpo);
  });

  fastify.delete(`${pub}/campanhas/:id/fases/:faseId`, { preHandler: ESCREVER }, async (request, reply) => {
    const p = z.object({ id: z.string().uuid(), faseId: z.string().min(1).max(64) }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "id inválido" });
    const r = await mudarFases(request, p.data.id, "fase.excluir", (fases) =>
      fases.some((f) => f.id === p.data.faseId)
        ? fases.filter((f) => f.id !== p.data.faseId)
        : `Fase ${p.data.faseId} não existe nesta campanha.`,
    );
    return reply.code(r.status).send(r.corpo);
  });

  /**
   * Leva para a agenda o que mudou aqui.
   *
   * ## Nunca derruba o salvamento
   *
   * A campanha e do Planner; a agenda e um espelho. Se o Google esta fora do ar
   * ou a permissao mudou, o trabalho de quem estava planejando tem de ser
   * gravado do mesmo jeito -- perder a edicao para proteger a consistencia de
   * um espelho seria o pior dos dois mundos. A falha volta como aviso.
   *
   * ## Fase que falhou fica sem id, e isso e proposital
   *
   * Sem `googleEventId`, o proximo save a trata como nova e tenta de novo.
   * E a retomada mais simples que existe: sem fila, sem estado extra, e o
   * proprio uso normal do Planner conserta o que ficou para tras.
   */
  /**
   * Os eventos do Google que JÁ são de alguma campanha (menos `excetoId`).
   *
   * Um evento tem uma dona só. Duas campanhas com o mesmo id se atropelavam:
   * editar uma movia o evento da outra, e excluir uma apagava o da outra.
   */
  async function eventosDeOutras(excetoId: string | null): Promise<Set<string>> {
    const todas = await fastify.db
      .select({ id: plannerCampaigns.id, phases: plannerCampaigns.phases })
      .from(plannerCampaigns);
    const ids = new Set<string>();
    for (const c of todas) {
      if (c.id === excetoId) continue;
      for (const f of (c.phases ?? []) as FaseDoPlanner[]) {
        if (f.googleEventId) ids.add(f.googleEventId);
      }
    }
    return ids;
  }

  async function espelharNoGoogle(e: {
    agenda: string | null;
    nomeAntes: string;
    nomeDepois: string;
    fasesAntes: FaseDoPlanner[];
    fasesDepois: FaseDoPlanner[];
  }): Promise<{ fases: FaseDoPlanner[] | null; aviso: string | null }> {
    if (!e.agenda || !emailDaServiceAccount())
      return { fases: null, aviso: null };

    const acao = planejarSincronia({
      nomeAntes: e.nomeAntes,
      nomeDepois: e.nomeDepois,
      fasesAntes: e.fasesAntes,
      fasesDepois: e.fasesDepois,
    });
    if (!acao.criar.length && !acao.atualizar.length && !acao.apagar.length) {
      return { fases: null, aviso: null };
    }

    const porId = new Map(e.fasesDepois.map((f) => [f.id, { ...f }]));
    let falhas = 0;
    let motivo: string | null = null;

    const anotar = (err: unknown) => {
      falhas++;
      // A primeira mensagem basta: dez falhas seguidas sao a mesma causa (sem
      // permissao, sem rede), e concatenar dez copias nao ajuda ninguem.
      motivo ??=
        err instanceof Error ? err.message : "Falha ao falar com o Google";
    };

    for (const fase of acao.criar) {
      const alvo = porId.get(fase.id);
      try {
        const id = await criarEvento(e.agenda, {
          titulo: tituloParaGoogle(e.nomeDepois, fase.name),
          inicio: fase.start,
          fim: fase.end,
        });
        if (alvo) {
          alvo.googleEventId = id;
          delete alvo.googleSyncPendente;
        }
      } catch (err) {
        anotar(err);
        // Fase nova sem evento nao precisa de marca: sem `googleEventId` ela ja
        // conta como nova no proximo save, e a importacao a preserva.
      }
    }

    for (const { fase, eventId } of acao.atualizar) {
      const alvo = porId.get(fase.id);
      try {
        const id = await atualizarEvento(e.agenda, eventId, {
          titulo: tituloParaGoogle(e.nomeDepois, fase.name),
          inicio: fase.start,
          fim: fase.end,
        });
        // O id pode ser OUTRO: o evento tinha sumido do Google e foi recriado.
        if (alvo) {
          if (id !== eventId) alvo.googleEventId = id;
          delete alvo.googleSyncPendente;
        }
      } catch (err) {
        anotar(err);
        // AQUI a marca importa: o evento existe no Google com os dados velhos,
        // e a versao boa e a daqui. Sem marca, a proxima importacao a desfaz.
        if (alvo) alvo.googleSyncPendente = true;
      }
    }

    for (const eventId of acao.apagar) {
      try {
        await apagarEvento(e.agenda, eventId);
      } catch (err) {
        anotar(err);
      }
    }

    // A fase perdeu a data: o evento foi apagado e o id nao aponta mais para
    // nada. Mante-lo faria o proximo save tentar atualizar um evento morto.
    for (const f of porId.values()) if (!f.start) delete f.googleEventId;

    return {
      fases: [...porId.values()],
      aviso: falhas
        ? `${falhas} altera${falhas === 1 ? "ção" : "ções"} não chegou à agenda do Google: ${motivo}`
        : null,
    };
  }

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
    if (denyGuest(request))
      return reply.code(403).send({ error: "Acesso negado" });
    const b = z
      .object({ ids: z.array(z.string().uuid()).max(200) })
      .safeParse(request.body);
    if (!b.success)
      return reply.code(400).send({ error: "Lista de ids inválida" });

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

    return {
      ok: true,
      ordenadas: validos.length,
      ignoradas: b.data.ids.length - validos.length,
    };
  });

  // ---- POST /:id/duplicar ----
  fastify.post(`${base}/:id/duplicar`, async (request, reply) => {
    if (denyGuest(request))
      return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!p.success)
      return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [origem] = await fastify.db
      .select()
      .from(plannerCampaigns)
      .where(eq(plannerCampaigns.id, p.data.id))
      .limit(1);
    if (!origem)
      return reply.code(404).send({ error: "Campanha não encontrada" });

    // Fases ganham id novo: manter os antigos faria a seleção na tela apontar
    // para duas barras ao mesmo tempo.
    //
    // E perdem o vínculo com o Google: a cópia apontando para os eventos da
    // ORIGINAL faria editar a cópia mover a agenda da original, e excluir a
    // cópia apagar os eventos dela.
    const fases = origem.phases.map((f, i) => {
      const copia = { ...f, id: novoId(i) };
      delete copia.googleEventId;
      delete copia.googleSyncPendente;
      return copia;
    });

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
      .where(
        sql`${plannerCampaigns.sortOrder} > ${origem.sortOrder} AND ${plannerCampaigns.id} <> ${copia!.id}`,
      );

    return reply.code(201).send(copia);
  });

  // ---- DELETE /:id ----
  fastify.delete(`${base}/:id`, async (request, reply) => {
    if (denyGuest(request))
      return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!p.success)
      return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [apagada] = await fastify.db
      .delete(plannerCampaigns)
      .where(eq(plannerCampaigns.id, p.data.id))
      .returning();

    if (!apagada)
      return reply.code(404).send({ error: "Campanha não encontrada" });

    /**
     * Os eventos saem da agenda junto.
     *
     * Deixa-los seria pior que apagar: o time continuaria vendo no Google um
     * cronograma que nao existe mais, e sem nada no Planner para corrigi-lo.
     *
     * O Desfazer da tela recria a campanha por POST, e ai `espelharNoGoogle`
     * cria eventos novos -- os ids antigos ja nao valem, e `atualizarEvento`
     * trata 404 criando outro. A volta funciona; o que ela nao preserva e o id
     * do evento, que ninguem ve.
     */
    const agenda = apagada.googleCalendarId;
    if (agenda && emailDaServiceAccount()) {
      // O evento que outra campanha também usa NÃO é desta: era o que
      // acontecia ao excluir a campanha fantasma — lá se iam os eventos da
      // verdadeira (FZL4, FZM3, DGL3 em 21/09/2026).
      const deOutras = await eventosDeOutras(apagada.id);
      for (const f of (apagada.phases ?? []) as FaseDoPlanner[]) {
        if (!f.googleEventId || deOutras.has(f.googleEventId)) continue;
        try {
          await apagarEvento(agenda, f.googleEventId);
        } catch (err) {
          // A campanha ja saiu do banco. Falhar aqui deixaria um evento orfao
          // na agenda, o que e ruim -- mas devolver erro faria a tela dizer
          // que a exclusao falhou, quando ela funcionou.
          fastify.log.warn(
            { err, eventId: f.googleEventId },
            "evento orfao na agenda do Google",
          );
        }
      }
    }

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
    if (denyGuest(request))
      return reply.code(403).send({ error: "Acesso negado" });
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
    if (denyGuest(request))
      return reply.code(403).send({ error: "Acesso negado" });
    const b = z
      .object({ calendarId: z.string().trim().min(3).max(300) })
      .safeParse(request.body);
    if (!b.success)
      return reply.code(400).send({ error: "Informe o ID da agenda" });

    // Confere o acesso ANTES de gravar: uma agenda cadastrada que não abre
    // vira erro toda vez que alguém tenta importar.
    let label: string;
    try {
      label = await nomeDaAgenda(b.data.calendarId);
    } catch (erro) {
      return reply
        .code(400)
        .send({
          error:
            erro instanceof Error
              ? erro.message
              : "Não consegui abrir a agenda",
        });
    }

    const [criada] = await fastify.db
      .insert(plannerGoogleCalendars)
      .values({
        calendarId: b.data.calendarId,
        label,
        createdBy: request.userId ?? null,
      })
      .onConflictDoUpdate({
        target: plannerGoogleCalendars.calendarId,
        set: { label },
      })
      .returning();

    return reply.code(201).send(criada);
  });

  fastify.delete(google + "/agendas/:id", async (request, reply) => {
    if (denyGuest(request))
      return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!p.success)
      return reply.code(400).send({ error: "Parâmetros inválidos" });
    await fastify.db
      .delete(plannerGoogleCalendars)
      .where(eq(plannerGoogleCalendars.id, p.data.id));
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
    if (denyGuest(request))
      return reply.code(403).send({ error: "Acesso negado" });
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

    // A regra de merge mora no serviço: o agendador chama a MESMA função, e
    // duas cópias divergiriam no primeiro ajuste.
    try {
      return await importarDaAgenda(fastify.db, b.data.calendarId, PALETA, {
        mesesAtras: b.data.mesesAtras,
        mesesAFrente: b.data.mesesAFrente,
        incluirComHora: b.data.incluirComHora,
        criadoPor: request.userId ?? null,
      });
    } catch (erro) {
      return reply
        .code(502)
        .send({
          error:
            erro instanceof Error ? erro.message : "Não consegui ler a agenda",
        });
    }
  });
});
