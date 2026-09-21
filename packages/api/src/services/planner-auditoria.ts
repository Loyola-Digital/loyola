/**
 * Registro do que a API pública gravou no Planner.
 *
 * Nunca derruba a gravação: o dado do Planner é o que importa, e perder uma
 * edição porque o log falhou seria trocar o principal pelo acessório. A falha
 * vai para o log do servidor.
 */

import type { FastifyBaseLogger } from "fastify";
import type { Database } from "../db/client.js";
import { plannerApiAudit } from "../db/schema.js";

export async function registrarNoPlanner(
  db: Database,
  log: FastifyBaseLogger,
  entrada: { apiKeyId: string | null; acao: string; projectId?: string | null; detalhe: unknown },
): Promise<void> {
  try {
    await db.insert(plannerApiAudit).values({
      apiKeyId: entrada.apiKeyId,
      acao: entrada.acao,
      projectId: entrada.projectId ?? null,
      detalhe: entrada.detalhe as object,
    });
  } catch (err) {
    log.warn({ err, acao: entrada.acao }, "auditoria do Planner não gravou");
  }
}
