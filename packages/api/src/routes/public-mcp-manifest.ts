/**
 * O que a `main` espera do MCP — para o próprio MCP se comparar.
 *
 * O painel já tem esse detector: cada lado carrega sua cópia compilada de
 * `API_CONTRACT_VERSION`, a API publica a dela em `/api/health` e o web compara.
 * O `contract.ts` registra, duas vezes, que o MCP ficou de fora disso — e o
 * preço apareceu: cinco tools de julho só chegaram ao gateway em agosto.
 *
 * Esta rota é a metade que faltava. Ela responde "a main tem estas 18 tools e
 * está no contrato v3"; o MCP compara com o que ele mesmo registrou e avisa
 * quando está atrás. Read-only e sem dado de negócio: é metadado de versão.
 */

import fp from "fastify-plugin";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { API_CONTRACT_VERSION, TOOLS_DO_MCP } from "@loyola-x/shared";
import { requireScope } from "../middleware/api-key-auth.js";

const PUBLIC_READ_SCOPE = "meta:read";

/**
 * Quando este build foi gerado.
 *
 * Mesmo recurso do `/api/health`: `RAILWAY_GIT_COMMIT_SHA` não chega ao runtime
 * em produção, e o mtime do módulo responde sem depender de configuração. Serve
 * para o MCP dizer "meu bundle é de julho, a API é de agosto" em vez de só
 * "faltam tools" — a distância no tempo é o que torna o aviso convincente.
 */
function builtAt(): string | null {
  try {
    return statSync(fileURLToPath(import.meta.url)).mtime.toISOString();
  } catch {
    return null;
  }
}

export default fp(async function publicMcpManifestRoutes(fastify) {
  fastify.get(
    "/api/public/v1/mcp-manifest",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async () => ({
      contract: API_CONTRACT_VERSION,
      tools: [...TOOLS_DO_MCP],
      total: TOOLS_DO_MCP.length,
      builtAt: builtAt(),
    }),
  );
});
