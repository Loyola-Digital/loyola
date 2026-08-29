/**
 * O executor de consultas do construtor de BI.
 *
 * O corpo traz o `querySpec` inteiro, e é seguro porque o executor só aceita
 * chave que exista no catálogo — não é o cliente que escolhe coluna, é ele que
 * escolhe entre as que declaramos. A partir da 45.5 o spec passa a vir salvo com
 * o widget, e esta rota vira o caminho do editor.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { projects } from "../db/schema.js";
import { ErroDeQuery, executarQuery, querySpecSchema } from "../services/bi/query.js";

const corpoSchema = z.object({
  projectId: z.string().uuid(),
  spec: querySpecSchema,
});

export default fp(async function biQueryRoutes(fastify) {
  fastify.post("/api/bi/query", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

    const corpo = corpoSchema.safeParse(request.body);
    if (!corpo.success) {
      return reply.code(400).send({
        error: "Consulta inválida",
        detalhes: corpo.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }

    const [projeto] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, corpo.data.projectId))
      .limit(1);
    if (!projeto) return reply.code(404).send({ error: "Projeto não encontrado" });

    try {
      const inicio = Date.now();
      const resultado = await executarQuery(corpo.data.spec, {
        db: fastify.db as never,
        projectId: corpo.data.projectId,
      });
      // O tempo volta junto: o editor precisa mostrar quando a consulta ficou
      // cara, e é o que vai justificar cache mais adiante.
      return { ...resultado, ms: Date.now() - inicio };
    } catch (erro) {
      // `ErroDeQuery` é sempre culpa do spec, nunca do banco — vira 400 com o
      // campo apontado, para a tela destacar em vez de mostrar erro genérico.
      if (erro instanceof ErroDeQuery) {
        return reply.code(400).send({ error: erro.message, campo: erro.campo });
      }
      request.log.error({ erro }, "falha ao executar querySpec");
      return reply.code(500).send({ error: "Não foi possível executar a consulta" });
    }
  });
});
