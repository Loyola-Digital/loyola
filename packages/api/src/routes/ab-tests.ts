/**
 * Testes A/B de página.
 *
 * ## O que esta feature é, e o que ela não é
 *
 * Ela **mede** variações que já estão no ar e diz se a diferença entre elas é
 * real. Ela **não distribui** tráfego — não há sorteio, cookie nem redirect
 * aqui. Quem manda 50/50 para duas URLs é o anúncio, o link do e-mail ou um
 * serviço de split à parte.
 *
 * A distinção importa porque é onde todo mundo se confunde: *link de split é
 * distribuição, não é o mecanismo de medição*. A conversão de cada variação é
 * medida do mesmo jeito com ou sem ele.
 *
 * ## De onde vêm os números
 *
 * Do Plausible, por URL exata e período. Nada de contador guardado aqui: seria
 * um segundo lugar onde o número mora, e os dois divergiriam no primeiro
 * reprocessamento do analytics.
 *
 * ## Quem decide o vencedor
 *
 * `services/ab-decisao.ts`, com teste de proporção e três estados. Não é
 * arg-max sobre a taxa — ver o cabeçalho de lá para o porquê.
 */

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { randomUUID } from "node:crypto";
import {
  abTests,
  plausibleConfig,
  plausibleProjectSites,
  projectMembers,
  projects,
} from "../db/schema.js";
import { decryptGa4Secret } from "../services/ga4.js";
import {
  contarVariacao,
  intervaloDoPeriodo,
  listarMetas,
  type PlausibleCreds,
  type PlausiblePeriodo,
} from "../services/plausible.js";
import {
  decidirVencedor,
  type ContagemDaVariacao,
} from "../services/ab-decisao.js";

const projectParams = z.object({ projectId: z.string().uuid() });
const testeParams = projectParams.extend({ testeId: z.string().uuid() });

const variacaoSchema = z.object({
  nome: z.string().trim().min(1).max(80),
  /**
   * O caminho, não a URL completa: é assim que o Plausible identifica a página
   * (`event:page` é `/oferta-b`, não `https://site.com/oferta-b`). Aceitar o
   * domínio aqui daria zero visitas sem nenhum erro visível.
   */
  url: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((v) => v.startsWith("/"), {
      message: "Use o caminho da página, começando com / (ex: /oferta-b)",
    }),
});

const corpoDoTeste = z.object({
  nome: z.string().trim().min(1).max(200),
  metaConversao: z.string().trim().max(200).nullable().optional(),
  variacoes: z.array(variacaoSchema).max(10).optional(),
  status: z.enum(["rascunho", "ativo", "encerrado"]).optional(),
});

export default fp(async (fastify) => {
  async function getProjectAccess(
    projectId: string,
    userId: string,
    userRole: string,
  ) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, userId),
          ),
        )
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

  async function lerCreds(): Promise<PlausibleCreds | null> {
    const [row] = await fastify.db.select().from(plausibleConfig).limit(1);
    if (!row) return null;
    return {
      baseUrl: row.baseUrl,
      apiKey: decryptGa4Secret(row.apiKeyEncrypted, row.apiKeyIv),
    };
  }

  /** Ids das variações nascem aqui: a tela manda nome e URL, não inventa id. */
  const comIds = (vs: { nome: string; url: string }[]) =>
    vs.map((v) => ({ id: randomUUID(), nome: v.nome, url: v.url }));

  // ---- GET metas do Plausible ----
  /**
   * As metas configuradas no site, para a tela oferecer uma LISTA.
   *
   * O nome precisa bater exato com o do Plausible: "Form: Submission" digitado
   * como "Form Submission" devolve zero sem nenhum erro. Campo de texto livre
   * aqui é uma armadilha, e quem cai nela não tem como saber que caiu.
   */
  fastify.get(
    "/api/projects/:projectId/ab-tests/metas",
    async (request, reply) => {
      const p = projectParams.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });
      const projeto = await getProjectAccess(
        p.data.projectId,
        request.userId!,
        request.userRole!,
      );
      if (!projeto)
        return reply.code(404).send({ error: "Projeto não encontrado" });

      const [site] = await fastify.db
        .select({ siteId: plausibleProjectSites.siteId })
        .from(plausibleProjectSites)
        .where(eq(plausibleProjectSites.projectId, p.data.projectId))
        .limit(1);
      const creds = site ? await lerCreds() : null;
      // Sem Plausible a tela cai no campo de texto — melhor que um erro que
      // impede de criar o teste.
      if (!site || !creds) return { metas: [] };

      try {
        return { metas: await listarMetas(creds, site.siteId) };
      } catch (err) {
        request.log.warn({ err }, "[ab-tests] nao consegui listar metas");
        return { metas: [] };
      }
    },
  );

  // ---- GET lista ----
  fastify.get("/api/projects/:projectId/ab-tests", async (request, reply) => {
    const p = projectParams.safeParse(request.params);
    if (!p.success)
      return reply.code(400).send({ error: "Parâmetros inválidos" });
    const projeto = await getProjectAccess(
      p.data.projectId,
      request.userId!,
      request.userRole!,
    );
    if (!projeto)
      return reply.code(404).send({ error: "Projeto não encontrado" });

    const testes = await fastify.db
      .select()
      .from(abTests)
      .where(eq(abTests.projectId, p.data.projectId))
      .orderBy(desc(abTests.createdAt));
    return { testes };
  });

  // ---- POST criar ----
  fastify.post("/api/projects/:projectId/ab-tests", async (request, reply) => {
    if (request.userRole === "guest")
      return reply.code(403).send({ error: "Acesso negado" });
    const p = projectParams.safeParse(request.params);
    const b = corpoDoTeste.safeParse(request.body);
    if (!p.success || !b.success) {
      return reply.code(400).send({
        error: "Dados inválidos",
        details: b.success ? undefined : b.error.flatten().fieldErrors,
      });
    }
    const projeto = await getProjectAccess(
      p.data.projectId,
      request.userId!,
      request.userRole!,
    );
    if (!projeto)
      return reply.code(404).send({ error: "Projeto não encontrado" });

    const [criado] = await fastify.db
      .insert(abTests)
      .values({
        projectId: p.data.projectId,
        nome: b.data.nome,
        metaConversao: b.data.metaConversao ?? null,
        variacoes: comIds(b.data.variacoes ?? []),
        createdBy: request.userId!,
      })
      .returning();
    return reply.code(201).send(criado);
  });

  // ---- PATCH editar ----
  fastify.patch(
    "/api/projects/:projectId/ab-tests/:testeId",
    async (request, reply) => {
      if (request.userRole === "guest")
        return reply.code(403).send({ error: "Acesso negado" });
      const p = testeParams.safeParse(request.params);
      const b = corpoDoTeste.partial().safeParse(request.body);
      if (!p.success || !b.success)
        return reply.code(400).send({ error: "Dados inválidos" });
      const projeto = await getProjectAccess(
        p.data.projectId,
        request.userId!,
        request.userRole!,
      );
      if (!projeto)
        return reply.code(404).send({ error: "Projeto não encontrado" });

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (b.data.nome !== undefined) patch.nome = b.data.nome;
      if (b.data.metaConversao !== undefined)
        patch.metaConversao = b.data.metaConversao;
      if (b.data.variacoes !== undefined)
        patch.variacoes = comIds(b.data.variacoes);
      if (b.data.status !== undefined) {
        patch.status = b.data.status;
        // As datas seguem o status sozinhas: pedir que a tela as mande abriria a
        // porta para um teste "ativo" sem início, e a janela de leitura some.
        if (b.data.status === "ativo") patch.iniciadoEm = new Date();
        if (b.data.status === "encerrado") patch.encerradoEm = new Date();
      }

      const [atualizado] = await fastify.db
        .update(abTests)
        .set(patch)
        .where(
          and(
            eq(abTests.id, p.data.testeId),
            eq(abTests.projectId, p.data.projectId),
          ),
        )
        .returning();
      if (!atualizado)
        return reply.code(404).send({ error: "Teste não encontrado" });
      return atualizado;
    },
  );

  // ---- DELETE ----
  fastify.delete(
    "/api/projects/:projectId/ab-tests/:testeId",
    async (request, reply) => {
      if (request.userRole === "guest")
        return reply.code(403).send({ error: "Acesso negado" });
      const p = testeParams.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });
      const projeto = await getProjectAccess(
        p.data.projectId,
        request.userId!,
        request.userRole!,
      );
      if (!projeto)
        return reply.code(404).send({ error: "Projeto não encontrado" });

      const [apagado] = await fastify.db
        .delete(abTests)
        .where(
          and(
            eq(abTests.id, p.data.testeId),
            eq(abTests.projectId, p.data.projectId),
          ),
        )
        .returning({ id: abTests.id });
      if (!apagado)
        return reply.code(404).send({ error: "Teste não encontrado" });
      return { ok: true };
    },
  );

  // ---- GET resultado ----
  /**
   * Conta as visitas e conversões de cada variação e devolve o veredito.
   *
   * O período pedido é o da tela, MAS um teste encerrado congela no
   * `encerradoEm`: sem isso o "vencedor" de um teste antigo continuaria mudando
   * conforme a página segue recebendo visita — e a decisão que já foi tomada
   * com base nele deixaria de bater com o que a tela mostra.
   */
  fastify.get(
    "/api/projects/:projectId/ab-tests/:testeId/resultado",
    async (request, reply) => {
      const p = testeParams.safeParse(request.params);
      const q = z
        .object({
          periodo: z
            .enum(["day", "7d", "30d", "month", "6mo", "12mo"])
            .default("30d"),
        })
        .safeParse(request.query);
      if (!p.success || !q.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });
      const projeto = await getProjectAccess(
        p.data.projectId,
        request.userId!,
        request.userRole!,
      );
      if (!projeto)
        return reply.code(404).send({ error: "Projeto não encontrado" });

      const [teste] = await fastify.db
        .select()
        .from(abTests)
        .where(
          and(
            eq(abTests.id, p.data.testeId),
            eq(abTests.projectId, p.data.projectId),
          ),
        )
        .limit(1);
      if (!teste)
        return reply.code(404).send({ error: "Teste não encontrado" });

      if (!teste.metaConversao) {
        return reply.code(409).send({
          error:
            "Escolha a meta de conversão do Plausible antes de ver o resultado.",
          code: "SEM_META",
        });
      }
      if (teste.variacoes.length < 2) {
        return reply.code(409).send({
          error: "Um teste precisa de pelo menos duas variações.",
          code: "POUCAS_VARIACOES",
        });
      }

      const [site] = await fastify.db
        .select({ siteId: plausibleProjectSites.siteId })
        .from(plausibleProjectSites)
        .where(eq(plausibleProjectSites.projectId, p.data.projectId))
        .limit(1);
      if (!site)
        return reply.code(409).send({
          error: "Este projeto não usa Plausible",
          code: "SEM_PLAUSIBLE",
        });

      const creds = await lerCreds();
      if (!creds)
        return reply
          .code(409)
          .send({ error: "Plausible não configurado", code: "SEM_PLAUSIBLE" });

      let [inicio, fim] = intervaloDoPeriodo(
        q.data.periodo as PlausiblePeriodo,
      );
      if (teste.iniciadoEm) {
        // Visita anterior ao início do teste não é do teste.
        const comeco = teste.iniciadoEm.toISOString().slice(0, 10);
        if (comeco > inicio) inicio = comeco;
      }
      if (teste.encerradoEm) {
        const termino = teste.encerradoEm.toISOString().slice(0, 10);
        if (termino < fim) fim = termino;
      }

      try {
        const contagens: ContagemDaVariacao[] = [];
        for (const v of teste.variacoes) {
          const { visitas, conversoes } = await contarVariacao(
            creds,
            site.siteId,
            inicio,
            fim,
            v.url,
            teste.metaConversao,
          );
          contagens.push({ id: v.id, nome: v.nome, visitas, conversoes });
        }
        return {
          teste: { id: teste.id, nome: teste.nome, status: teste.status },
          periodo: { inicio, fim },
          ...decidirVencedor(contagens),
        };
      } catch (err) {
        request.log.error(
          { err, testeId: teste.id },
          "[ab-tests] resultado falhou",
        );
        return reply.code(502).send({
          error:
            err instanceof Error
              ? err.message
              : "Erro ao consultar o Plausible",
          code: "PLAUSIBLE_FALHOU",
        });
      }
    },
  );
});
