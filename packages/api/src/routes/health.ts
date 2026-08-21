import fp from "fastify-plugin";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { API_CONTRACT_VERSION } from "@loyola-x/shared";

/**
 * Story 29.46 — commit que está de fato rodando.
 *
 * O Railway injeta `RAILWAY_GIT_COMMIT_SHA` no build. Fora dele (local, teste)
 * a variável não existe, e `null` é a resposta honesta: ausência de informação
 * não é erro, e inventar um valor aqui derrubaria a única finalidade do campo,
 * que é dizer com precisão qual build atendeu a requisição.
 */
function deployedCommit(): string | null {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : null;
}

/**
 * Quando este código foi construído — a data do arquivo que está rodando.
 *
 * Existe porque `commit` vem `null` em produção: a variável do Railway não
 * chega ao runtime, e sem ela não havia como responder "a API no ar é de
 * quando?". Essa pergunta apareceu duas vezes num dia, das duas com o mesmo
 * sintoma: uma tela nova pedindo uma rota que o backend ainda não tinha e
 * devolvendo "Not Found", o que manda todo mundo procurar erro no lugar errado.
 *
 * O mtime do próprio módulo responde sem depender de configuração nenhuma: ele
 * é escrito quando o build gera o bundle.
 */
function buildTime(): string | null {
  try {
    return statSync(fileURLToPath(import.meta.url)).mtime.toISOString();
  } catch {
    return null;
  }
}

export default fp(async function healthRoutes(fastify) {
  fastify.get("/api/health", async (_request, reply) => {
    // `contract` e `commit` também no caminho de erro: quando o banco cai,
    // saber qual build está no ar é MAIS útil, não menos.
    const build = {
      contract: API_CONTRACT_VERSION,
      commit: deployedCommit(),
      builtAt: buildTime(),
    };
    try {
      await fastify.db.execute(sql`SELECT 1`);
      return {
        status: "ok",
        db: "connected",
        timestamp: new Date().toISOString(),
        ...build,
      };
    } catch {
      reply.code(503);
      return {
        status: "error",
        db: "disconnected",
        timestamp: new Date().toISOString(),
        ...build,
      };
    }
  });
});
