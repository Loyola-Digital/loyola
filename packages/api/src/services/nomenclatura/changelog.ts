/**
 * Story 47.1 — a ÚNICA porta de escrita do changelog (spec § 4.8, regra 7).
 *
 * Nenhum handler chama `insert(namingChangelog)`. Quem escreve em qualquer
 * tabela `naming_*` passa por `repositorio.ts`, que chama isto. Se um `grep`
 * por `namingChangelog` achar algo em `routes/`, é reprovação.
 */

import { and, desc, eq } from "drizzle-orm";
import { namingChangelog } from "../../db/schema.js";
import type { Conexao } from "./conexao.js";

export type AcaoDoChangelog = "create" | "update" | "delete" | "deactivate" | "reactivate" | "publish";

export interface EntradaDoChangelog {
  entity: string;
  entityId: string;
  action: AcaoDoChangelog;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  author: string | null;
}

/** Só o que muda de fato — `updatedAt` e afins não são mudança de significado. */
const IGNORADOS = new Set(["updatedAt", "createdAt"]);

export function semRuido(linha: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!linha) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(linha)) {
    if (IGNORADOS.has(k)) continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

export async function registrarNoChangelog(db: Conexao, e: EntradaDoChangelog): Promise<void> {
  await db.insert(namingChangelog).values({
    entity: e.entity,
    entityId: e.entityId,
    action: e.action,
    before: semRuido(e.before),
    after: semRuido(e.after),
    author: e.author,
  });
}

export async function listarChangelog(
  db: Conexao,
  filtros: { entity?: string; entityId?: string; limit: number },
) {
  const cond = [
    filtros.entity ? eq(namingChangelog.entity, filtros.entity) : undefined,
    filtros.entityId ? eq(namingChangelog.entityId, filtros.entityId) : undefined,
  ].filter(Boolean);
  const base = db.select().from(namingChangelog);
  const q = cond.length ? base.where(and(...(cond as never[]))) : base;
  return q.orderBy(desc(namingChangelog.createdAt)).limit(filtros.limit);
}
