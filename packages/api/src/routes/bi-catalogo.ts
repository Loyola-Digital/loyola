/**
 * O catálogo semântico, para o construtor de BI.
 *
 * Estático de propósito: o catálogo é declarado em código (é a fronteira de
 * segurança da feature), então esta rota não consulta banco nenhum. O que
 * consulta é `/valores`, que busca os valores distintos de uma dimensão para o
 * autocomplete de filtro.
 */

import { z } from "zod";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import fp from "fastify-plugin";
import { metaAdInsightsDaily, projects } from "../db/schema.js";
import { campo, catalogoParaApi } from "../services/bi/catalogo.js";

/**
 * Dimensões cujos valores dá para listar hoje, e a coluna de cada uma.
 *
 * Mapa FECHADO: é o que impede a dimensão vinda da URL de virar nome de coluna.
 * Dimensão fora daqui é 400, não SQL.
 */
const COLUNA_DA_DIMENSAO = {
  "trafego.campaign": metaAdInsightsDaily.campaignName,
  "trafego.adset": metaAdInsightsDaily.adsetName,
  "trafego.ad": metaAdInsightsDaily.adName,
} as const;

const LIMITE_MAX = 100;

export default fp(async function biCatalogoRoutes(fastify) {
  fastify.get("/api/bi/catalogo", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    return catalogoParaApi();
  });

  fastify.get("/api/bi/valores", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

    const q = z
      .object({
        projectId: z.string().uuid(),
        dimension: z.string().min(1).max(120),
        search: z.string().max(120).optional(),
        limit: z.coerce.number().int().min(1).max(LIMITE_MAX).default(50),
      })
      .safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    // Duas checagens, e as duas importam: a primeira garante que a dimensão
    // existe no catálogo; a segunda, que sabemos listar os valores dela. Uma
    // dimensão válida sem fonte de valores é 400 explicativo, não lista vazia.
    const def = campo(q.data.dimension);
    if (!def || def.role !== "dimension") {
      return reply.code(400).send({ error: `Dimensão desconhecida: ${q.data.dimension}` });
    }
    const coluna = COLUNA_DA_DIMENSAO[q.data.dimension as keyof typeof COLUNA_DA_DIMENSAO];
    if (!coluna) {
      return reply.code(400).send({
        error: `Ainda não sei listar os valores de "${def.label}".`,
      });
    }

    const [projeto] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, q.data.projectId))
      .limit(1);
    if (!projeto) return reply.code(404).send({ error: "Projeto não encontrado" });

    const filtros = [
      eq(metaAdInsightsDaily.projectId, q.data.projectId),
      sql`${coluna} IS NOT NULL AND ${coluna} <> ''`,
    ];
    // O termo entra parametrizado: `ilike` do Drizzle não concatena string.
    if (q.data.search) filtros.push(ilike(coluna, `%${q.data.search}%`));

    const linhas = await fastify.db
      .selectDistinct({ value: coluna })
      .from(metaAdInsightsDaily)
      .where(and(...filtros))
      .orderBy(desc(coluna))
      .limit(q.data.limit);

    return { values: linhas.map((l) => ({ value: l.value })).filter((v) => v.value) };
  });
});
