/**
 * Até onde o convidado enxerga dentro da empresa: um funil, uma etapa.
 *
 * ## Por que existe
 *
 * O convite dava acesso à EMPRESA inteira — quem entrava via todos os funis e
 * todas as etapas dela. Para vendedor contratado só para um evento, isso é
 * informação demais: ele precisa de um funil e de uma etapa ("bbe-pr2-ago-26",
 * etapa Evento). O escopo vive na mesma linha de `project_members` que já
 * autoriza a empresa; vazio significa "sem limite", que é o comportamento
 * antigo — nenhum convidado de hoje muda de comportamento.
 *
 * ## Onde é aplicado
 *
 * Num lugar só, o `guest-guard`, que já roda antes de toda requisição de
 * convidado. As rotas não precisam saber do escopo — inclusive as que nem
 * checam acesso hoje (`/api/funnels/:id/stages/:id/lp-campaigns` e
 * `creative-performance` não têm checagem nenhuma).
 *
 * As REGRAS são puras (o teste chama direto); no fim do arquivo há dois
 * atalhos que leem o banco, para as listas de funil e de etapa filtrarem.
 */

import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { projectMembers } from "../db/schema.js";

export interface EscopoDoConvidado {
  /** `null` = todos os funis da empresa. */
  funnelId: string | null;
  /** `null` = todas as etapas do funil. */
  stageId: string | null;
}

/**
 * O funil e a etapa que a URL está pedindo, quando ela pede.
 *
 * Cobre os dois formatos que existem: dentro da empresa
 * (`/api/projects/:p/funnels/:f/stages/:s/...`) e solto
 * (`/api/funnels/:f/stages/:s/...`). Rota que não fala de funil devolve os
 * dois `null` — e aí o escopo não tem o que barrar.
 */
export function funilEEtapaDaUrl(url: string): { funnelId: string | null; stageId: string | null } {
  const caminho = url.split("?")[0]!;
  const funil = caminho.match(/\/funnels\/([^/]+)/);
  const etapa = caminho.match(/\/stages\/([^/]+)/);
  return { funnelId: funil?.[1] ?? null, stageId: etapa?.[1] ?? null };
}

/**
 * A requisição cabe no escopo?
 *
 * Regras, em uma frase cada:
 * - escopo vazio libera tudo (convidado de hoje);
 * - URL que não cita funil nem etapa passa — o corte é por funil/etapa, e a
 *   página da empresa continua governada pelas permissões de módulo;
 * - funil ou etapa diferente do permitido é barrado;
 * - com etapa no escopo, a URL do FUNIL (sem etapa) passa: é a tela que lista
 *   as etapas, e a lista já vem filtrada.
 */
export function escopoPermite(escopo: EscopoDoConvidado, url: string): boolean {
  if (!escopo.funnelId && !escopo.stageId) return true;
  const pedido = funilEEtapaDaUrl(url);
  if (escopo.funnelId && pedido.funnelId && pedido.funnelId !== escopo.funnelId) return false;
  if (escopo.stageId && pedido.stageId && pedido.stageId !== escopo.stageId) return false;
  return true;
}

/**
 * Entre os acessos do convidado, algum permite esta URL?
 *
 * As rotas soltas (`/api/funnels/...`) não dizem de que empresa são, então a
 * checagem é contra todos os acessos da pessoa — quase sempre um só.
 */
export function algumEscopoPermite(escopos: EscopoDoConvidado[], url: string): boolean {
  return escopos.some((e) => escopoPermite(e, url));
}

/** O escopo que o convidado tem nesta empresa. `null` para quem não é convidado. */
async function escopoNaEmpresa(
  db: Database,
  userId: string,
  userRole: string | undefined,
  projectId: string,
): Promise<EscopoDoConvidado | null> {
  if (userRole !== "guest") return null;
  const [linha] = await db
    .select({ funnelId: projectMembers.funnelId, stageId: projectMembers.stageId })
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId)))
    .limit(1);
  return linha ?? null;
}

/** O único funil que este convidado pode ver, ou `null` (sem limite / não é convidado). */
export async function funilDoConvidado(
  db: Database,
  userId: string,
  userRole: string | undefined,
  projectId: string,
): Promise<string | null> {
  return (await escopoNaEmpresa(db, userId, userRole, projectId))?.funnelId ?? null;
}

/** A única etapa que este convidado pode ver, ou `null`. */
export async function etapaDoConvidado(
  db: Database,
  userId: string,
  userRole: string | undefined,
  projectId: string,
): Promise<string | null> {
  return (await escopoNaEmpresa(db, userId, userRole, projectId))?.stageId ?? null;
}
