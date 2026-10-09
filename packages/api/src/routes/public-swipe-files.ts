/**
 * O acervo do Swipe Files na API pública — as referências que o time guarda.
 *
 *   GET /api/public/v1/swipe-files            lista, com filtros e paginação
 *   GET /api/public/v1/swipe-files/facetas     o que dá para filtrar, com contagem
 *   GET /api/public/v1/swipe-files/:id         uma peça, com o texto extraído
 *
 * ## O que sai, e o que de propósito não sai
 *
 * Sai a referência: título, tipo, a peça em si (`fileUrl`), de onde veio
 * (`sourceUrl` e o Open Graph), e as etiquetas pelas quais o time organiza —
 * marca, nicho, plataforma, formato, tags.
 *
 * **Não sai quem subiu.** `createdBy` é dado de pessoa e não ajuda quem
 * consome a referência; uma API pública que entrega nome de funcionário junto
 * de cada item entrega o que ninguém pediu.
 *
 * ## O acervo é honesto sobre o que lhe falta
 *
 * Medido em 2026-09: das 117 referências de link, **90 não têm `og:image`**, e
 * as 291 peças de imagem/vídeo têm `width`/`height` nulos. Os campos vão como
 * estão, nulos inclusive — preencher com placeholder faria quem consome achar
 * que tem capa quando não tem. `semCapa` e `semDimensoes` dizem isso de frente,
 * para o consumidor decidir sem precisar adivinhar o significado de um `null`.
 *
 * ## Global, não por projeto
 *
 * `swipe_files` não tem `project_id`: o acervo é da casa, e a mesma referência
 * serve a qualquer expert. Por isso o caminho não leva projeto, ao contrário
 * das outras rotas públicas.
 */

import { z } from "zod";
import { and, asc, count, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import fp from "fastify-plugin";
import { swipeCollectionItems, swipeCollections, swipeFiles } from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";

/** Teto por página: o acervo tem centenas de peças e ninguém lê mil de uma vez. */
const MAX_POR_PAGINA = 100;

const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  marca: z.string().trim().max(120).optional(),
  nicho: z.string().trim().max(120).optional(),
  plataforma: z.string().trim().max(40).optional(),
  formato: z.string().trim().max(40).optional(),
  tag: z.string().trim().max(60).optional(),
  tipo: z.enum(["image", "video", "pdf", "link", "html", "doc"]).optional(),
  colecao: z.string().uuid().optional(),
  favoritos: z.coerce.boolean().optional(),
  limite: z.coerce.number().int().min(1).max(MAX_POR_PAGINA).default(50),
  pagina: z.coerce.number().int().min(1).default(1),
});

const idParam = z.object({ id: z.string().uuid() });

/** A peça como a API pública a entrega. Sem autor, por desenho. */
export function paraApi(r: typeof swipeFiles.$inferSelect) {
  return {
    id: r.id,
    titulo: r.title,
    notas: r.notes,
    tipo: r.assetKind,
    favorito: r.isFavorite,
    arquivo: r.fileUrl
      ? {
          url: r.fileUrl,
          mime: r.fileMime,
          bytes: r.fileSizeBytes,
          largura: r.width,
          altura: r.height,
          // As 291 peças medidas em 2026-09 estavam sem dimensão. Dizer isso
          // evita que quem consome trate `null` como "quadrado" ou como erro.
          semDimensoes: r.width == null || r.height == null,
        }
      : null,
    origem: r.sourceUrl
      ? {
          url: r.sourceUrl,
          titulo: r.ogTitle,
          descricao: r.ogDescription,
          imagem: r.ogImage,
          site: r.ogSiteName,
          lidoEm: r.ogFetchedAt?.toISOString() ?? null,
          // 90 dos 117 links não têm capa. É o normal do acervo, não uma falha
          // da leitura — quem monta uma galeria precisa de um lugar para cair.
          semCapa: !r.ogImage,
        }
      : null,
    marca: r.brand,
    nicho: r.niche,
    plataforma: r.platform,
    formato: r.format,
    tags: r.tags ?? [],
    criadoEm: r.createdAt.toISOString(),
    atualizadoEm: r.updatedAt.toISOString(),
  };
}

export default fp(async function publicSwipeFilesRoutes(fastify) {
  const base = "/api/public/v1/swipe-files";

  // ---- Lista ---------------------------------------------------------------

  fastify.get<{ Querystring: z.infer<typeof listQuery> }>(
    base,
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const q = listQuery.safeParse(request.query);
      if (!q.success) {
        return reply.code(400).send({
          error: "Filtros inválidos",
          code: "BAD_REQUEST",
          detalhes: q.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }
      const f = q.data;

      const conds = [];
      if (f.marca) conds.push(eq(swipeFiles.brand, f.marca));
      if (f.nicho) conds.push(eq(swipeFiles.niche, f.nicho));
      if (f.plataforma) conds.push(eq(swipeFiles.platform, f.plataforma));
      if (f.formato) conds.push(eq(swipeFiles.format, f.formato));
      if (f.tipo) conds.push(eq(swipeFiles.assetKind, f.tipo));
      if (f.favoritos) conds.push(eq(swipeFiles.isFavorite, true));
      // `tags` é jsonb: `?` pergunta se a chave existe no array.
      if (f.tag) conds.push(sql`${swipeFiles.tags} ? ${f.tag}`);
      if (f.q) {
        const alvo = `%${f.q}%`;
        conds.push(
          or(
            ilike(swipeFiles.title, alvo),
            ilike(swipeFiles.notes, alvo),
            ilike(swipeFiles.brand, alvo),
            ilike(swipeFiles.ogTitle, alvo),
          )!,
        );
      }
      if (f.colecao) {
        conds.push(
          sql`EXISTS (SELECT 1 FROM ${swipeCollectionItems} ci
                       WHERE ci.swipe_id = ${swipeFiles.id}
                         AND ci.collection_id = ${f.colecao})`,
        );
      }

      const onde = conds.length > 0 ? and(...conds) : undefined;

      const [{ total }] = await fastify.db
        .select({ total: count() })
        .from(swipeFiles)
        .where(onde);

      const linhas = await fastify.db
        .select()
        .from(swipeFiles)
        .where(onde)
        .orderBy(desc(swipeFiles.createdAt))
        .limit(f.limite)
        .offset((f.pagina - 1) * f.limite);

      return {
        total,
        pagina: f.pagina,
        limite: f.limite,
        // Quem consome não precisa calcular: `temMais` é a pergunta que ele faria.
        temMais: f.pagina * f.limite < total,
        itens: linhas.map(paraApi),
      };
    },
  );

  // ---- Facetas -------------------------------------------------------------

  /**
   * O que existe para filtrar, com quantos em cada.
   *
   * Sem isto, quem consome precisa baixar o acervo inteiro para descobrir que
   * plataformas existem — e adivinhar a grafia de cada uma. Medido em 2026-09:
   * 589 das 781 tags aparecem UMA vez só, então a lista de tags vem cortada
   * pelas mais usadas, com o total à parte.
   */
  fastify.get(
    `${base}/facetas`,
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async () => {
      async function porColuna(coluna: PgColumn, teto = 100) {
        const linhas = (await fastify.db
          .select({ valor: coluna, total: count() })
          .from(swipeFiles)
          .where(isNotNull(coluna))
          .groupBy(coluna)
          .orderBy(desc(count()))
          .limit(teto)) as { valor: string | null; total: number }[];
        // Coluna preenchida com espaço em branco existe no acervo e não é
        // filtro de nada — vira ruído numa lista que serve para escolher.
        return linhas.filter((l) => (l.valor ?? "").trim().length > 0);
      }

      const [marcas, nichos, plataformas, formatos, tipos, tags, colecoes, totais] =
        await Promise.all([
          porColuna(swipeFiles.brand),
          porColuna(swipeFiles.niche),
          porColuna(swipeFiles.platform),
          porColuna(swipeFiles.format),
          fastify.db
            .select({ valor: swipeFiles.assetKind, total: count() })
            .from(swipeFiles)
            .groupBy(swipeFiles.assetKind)
            .orderBy(desc(count())),
          fastify.db
            .select({
              valor: sql<string>`tag`,
              total: count(),
            })
            .from(sql`${swipeFiles}, jsonb_array_elements_text(${swipeFiles.tags}) AS tag`)
            .groupBy(sql`tag`)
            .orderBy(desc(count()))
            .limit(60),
          fastify.db
            .select({ id: swipeCollections.id, nome: swipeCollections.nome })
            .from(swipeCollections)
            .orderBy(asc(swipeCollections.nome)),
          fastify.db.select({ total: count() }).from(swipeFiles),
        ]);

      return {
        total: totais[0]?.total ?? 0,
        tipos,
        marcas,
        nichos,
        plataformas,
        formatos,
        // Cortada: a cauda de tags usadas uma vez só é ruído para quem filtra.
        tags,
        colecoes,
      };
    },
  );

  // ---- Uma peça ------------------------------------------------------------

  fastify.get<{ Params: z.infer<typeof idParam> }>(
    `${base}/:id`,
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const p = idParam.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "id inválido", code: "BAD_REQUEST" });

      const [linha] = await fastify.db
        .select()
        .from(swipeFiles)
        .where(eq(swipeFiles.id, p.data.id))
        .limit(1);
      if (!linha) {
        return reply.code(404).send({ error: "Referência não encontrada", code: "NOT_FOUND" });
      }

      // As coleções a que a peça pertence: é como o time agrupa, e quem
      // consome costuma querer "mais desta pasta" logo em seguida.
      const colecoes = await fastify.db
        .select({ id: swipeCollections.id, nome: swipeCollections.nome })
        .from(swipeCollectionItems)
        .innerJoin(swipeCollections, eq(swipeCollections.id, swipeCollectionItems.collectionId))
        .where(eq(swipeCollectionItems.swipeId, p.data.id))
        .orderBy(asc(swipeCollections.nome));

      return { ...paraApi(linha), colecoes };
    },
  );
});
