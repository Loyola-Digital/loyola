/**
 * Swipe Files — biblioteca de referências de anúncios (área Global).
 *
 * Acervo compartilhado do time: não é escopado por projeto, o recorte vem dos
 * filtros. Guest não entra (ferramenta interna).
 *
 * Upload é por URL assinada: o browser fala direto com o bucket, então arquivo
 * grande não passa pela API (que tem teto de 10MB no multipart) nem ocupa
 * memória do container.
 */

import { z } from "zod";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import fp from "fastify-plugin";
import { swipeFiles, users } from "../db/schema.js";
import { fetchLinkPreview } from "../services/link-preview.js";
import {
  ErroDeAnalise,
  analisarReferencia,
  podeAnalisar,
} from "../services/swipe-analise.js";
import {
  MAX_UPLOAD_BYTES,
  deleteObject,
  isStorageConfigured,
  presignUpload,
  type StorageConfig,
} from "../services/object-storage.js";

const idParam = z.object({ id: z.string().uuid() });

const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  platform: z.string().trim().max(40).optional(),
  format: z.string().trim().max(40).optional(),
  niche: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(60).optional(),
  kind: z.enum(["image", "video", "pdf", "link"]).optional(),
  favorites: z.enum(["1", "true"]).optional(),
});

const createBody = z.object({
  title: z.string().trim().min(1).max(200),
  assetKind: z.enum(["image", "video", "pdf", "link"]),
  notes: z.string().trim().max(4000).optional(),
  fileUrl: z.string().trim().max(2000).optional(),
  fileKey: z.string().trim().max(500).optional(),
  fileMime: z.string().trim().max(100).optional(),
  fileSizeBytes: z.coerce.number().int().min(0).optional(),
  width: z.coerce.number().int().min(0).optional(),
  height: z.coerce.number().int().min(0).optional(),
  sourceUrl: z.string().trim().max(2000).optional(),
  brand: z.string().trim().max(120).optional(),
  niche: z.string().trim().max(120).optional(),
  platform: z.string().trim().max(40).optional(),
  format: z.string().trim().max(40).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

const updateBody = createBody.partial().extend({ isFavorite: z.boolean().optional() });

const presignBody = z.object({
  mime: z.string().trim().min(1).max(100),
  sizeBytes: z.coerce.number().int().min(1).optional(),
});

const previewBody = z.object({ url: z.string().trim().min(1).max(2000) });

/** Colunas da listagem + quem subiu. */
const listColumns = {
  id: swipeFiles.id,
  title: swipeFiles.title,
  notes: swipeFiles.notes,
  assetKind: swipeFiles.assetKind,
  fileUrl: swipeFiles.fileUrl,
  fileMime: swipeFiles.fileMime,
  // O card de PDF mostra o tamanho no lugar da miniatura que não existe.
  fileSizeBytes: swipeFiles.fileSizeBytes,
  width: swipeFiles.width,
  height: swipeFiles.height,
  sourceUrl: swipeFiles.sourceUrl,
  ogTitle: swipeFiles.ogTitle,
  ogDescription: swipeFiles.ogDescription,
  ogImage: swipeFiles.ogImage,
  ogSiteName: swipeFiles.ogSiteName,
  brand: swipeFiles.brand,
  niche: swipeFiles.niche,
  platform: swipeFiles.platform,
  format: swipeFiles.format,
  tags: swipeFiles.tags,
  isFavorite: swipeFiles.isFavorite,
  createdBy: swipeFiles.createdBy,
  createdByName: users.name,
  createdAt: swipeFiles.createdAt,
};

export default fp(async function swipeFilesRoutes(fastify) {
  const base = "/api/swipe-files";

  const storage = (): StorageConfig => ({
    endpoint: fastify.config.STORAGE_ENDPOINT,
    accessKeyId: fastify.config.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: fastify.config.STORAGE_SECRET_ACCESS_KEY,
    bucket: fastify.config.STORAGE_BUCKET,
    publicUrl: fastify.config.STORAGE_PUBLIC_URL,
    region: fastify.config.STORAGE_REGION,
    forcePathStyle: fastify.config.STORAGE_FORCE_PATH_STYLE === "true",
  });

  function denyGuest(request: { userRole?: string }): boolean {
    return request.userRole === "guest";
  }

  // ---- GET / — lista com filtros ----
  fastify.get(base, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const q = listQuery.safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: "Filtros inválidos" });
    const f = q.data;

    const conds = [];
    if (f.platform) conds.push(eq(swipeFiles.platform, f.platform));
    if (f.format) conds.push(eq(swipeFiles.format, f.format));
    if (f.niche) conds.push(eq(swipeFiles.niche, f.niche));
    if (f.brand) conds.push(eq(swipeFiles.brand, f.brand));
    if (f.kind) conds.push(eq(swipeFiles.assetKind, f.kind));
    if (f.favorites) conds.push(eq(swipeFiles.isFavorite, true));
    // Contém a tag — o índice GIN atende esse operador.
    if (f.tag) conds.push(sql`${swipeFiles.tags} @> ${JSON.stringify([f.tag])}::jsonb`);
    if (f.q) {
      const like = `%${f.q}%`;
      conds.push(
        or(
          ilike(swipeFiles.title, like),
          ilike(swipeFiles.notes, like),
          ilike(swipeFiles.brand, like),
          ilike(swipeFiles.ogTitle, like),
        ),
      );
    }

    const rows = await fastify.db
      .select(listColumns)
      .from(swipeFiles)
      .leftJoin(users, eq(users.id, swipeFiles.createdBy))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(swipeFiles.createdAt))
      .limit(300);

    // Facetas pros filtros — o front não deve inventar a lista de opções.
    const facetRows = await fastify.db
      .select({
        platform: swipeFiles.platform,
        format: swipeFiles.format,
        niche: swipeFiles.niche,
        brand: swipeFiles.brand,
        tags: swipeFiles.tags,
      })
      .from(swipeFiles);

    const uniq = (vals: (string | null)[]) =>
      [...new Set(vals.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "pt-BR"));

    return {
      items: rows,
      facets: {
        platform: uniq(facetRows.map((r) => r.platform)),
        format: uniq(facetRows.map((r) => r.format)),
        niche: uniq(facetRows.map((r) => r.niche)),
        brand: uniq(facetRows.map((r) => r.brand)),
        tags: uniq(facetRows.flatMap((r) => r.tags ?? [])),
      },
      storageReady: isStorageConfigured(storage()),
    };
  });

  // ---- POST /presign — URL assinada de upload ----
  fastify.post(`${base}/presign`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const body = presignBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

    if (!isStorageConfigured(storage())) {
      return reply.code(503).send({
        error:
          "Upload indisponível: bucket não configurado no servidor. Você ainda pode adicionar referências por link.",
        code: "STORAGE_NOT_CONFIGURED",
      });
    }
    // O tamanho já chegava e era IGNORADO: um arquivo acima do teto passava
    // pelo presign e só falhava no bucket, com erro que não diz o que houve.
    if (body.data.sizeBytes && body.data.sizeBytes > MAX_UPLOAD_BYTES) {
      const mb = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
      return reply.code(400).send({ error: `Arquivo maior que o limite de ${mb} MB.` });
    }

    try {
      return await presignUpload(storage(), { mime: body.data.mime, prefix: "swipe" });
    } catch (err) {
      // O log carrega o mime: sem ele, "falha ao preparar o upload" no console
      // do navegador não diz qual tipo de arquivo derrubou.
      fastify.log.error({ err, mime: body.data.mime }, "presign de swipe file falhou");
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : "Falha ao preparar o upload" });
    }
  });

  /**
   * Lê a referência e sugere como catalogá-la.
   *
   * O arquivo vem por multipart e **não passa pelo bucket**: a análise acontece
   * antes de a pessoa decidir salvar, e subir para descartar depois deixaria
   * lixo no R2 a cada tentativa.
   */
  fastify.post(`${base}/analisar`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });

    const arquivo = await request.file();
    if (!arquivo) return reply.code(400).send({ error: "Envie a imagem ou o PDF." });

    if (!podeAnalisar(arquivo.mimetype)) {
      return reply.code(400).send({
        error: "Só dá para analisar imagem ou PDF. Vídeo precisa ser catalogado à mão.",
      });
    }

    const buffer = await arquivo.toBuffer();
    if (buffer.length === 0) return reply.code(400).send({ error: "Arquivo vazio." });

    // A origem vem como campo do multipart: uma landing page em PDF diz muito
    // mais quando se sabe o domínio de onde veio.
    const campos = arquivo.fields as Record<string, { value?: unknown } | undefined>;
    const origem = typeof campos?.origem?.value === "string" ? campos.origem.value : undefined;

    try {
      const sugestao = await analisarReferencia(
        fastify.claude.client,
        { buffer, mimeType: arquivo.mimetype },
        { nomeDoArquivo: arquivo.filename, origem },
      );
      return { sugestao };
    } catch (err) {
      fastify.log.error({ err, mime: arquivo.mimetype }, "analise de swipe file falhou");
      // 502: a falha é do provedor, não do que o cliente mandou — a tela usa
      // isso para oferecer o preenchimento manual em vez de culpar o arquivo.
      return reply.code(502).send({
        error: err instanceof ErroDeAnalise ? err.message : "Não consegui analisar agora.",
      });
    }
  });

  // ---- POST /preview — busca o Open Graph de um link ----
  fastify.post(
    `${base}/preview`,
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
      const body = previewBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "URL inválida" });
      try {
        return await fetchLinkPreview(body.data.url);
      } catch (err) {
        return reply.code(422).send({
          error: err instanceof Error ? err.message : "Não consegui ler esse link",
          code: "PREVIEW_FAILED",
        });
      }
    },
  );

  // ---- POST / — cria a referência ----
  fastify.post(base, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const body = createBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });
    const d = body.data;

    if (d.assetKind === "link" && !d.sourceUrl) {
      return reply.code(400).send({ error: "Referência de link precisa da URL." });
    }
    if (d.assetKind !== "link" && !d.fileUrl) {
      return reply.code(400).send({ error: "Referência de arquivo precisa do upload concluído." });
    }

    // Busca o preview no servidor quando há link. Falha aqui não impede o
    // cadastro: a referência vale mesmo sem thumbnail.
    let og = { title: null, description: null, image: null, siteName: null } as Awaited<
      ReturnType<typeof fetchLinkPreview>
    >;
    let ogFetchedAt: Date | null = null;
    if (d.sourceUrl) {
      try {
        og = await fetchLinkPreview(d.sourceUrl);
        ogFetchedAt = new Date();
      } catch {
        /* segue sem preview */
      }
    }

    // O insert era a única operação sem tratamento na rota: qualquer recusa do
    // banco virava 500 sem corpo, e o navegador mostrava só o número.
    try {
      const [created] = await fastify.db
      .insert(swipeFiles)
      .values({
        title: d.title,
        notes: d.notes || null,
        assetKind: d.assetKind,
        fileUrl: d.fileUrl || null,
        fileKey: d.fileKey || null,
        fileMime: d.fileMime || null,
        fileSizeBytes: d.fileSizeBytes ?? null,
        width: d.width ?? null,
        height: d.height ?? null,
        sourceUrl: d.sourceUrl || null,
        ogTitle: og.title,
        ogDescription: og.description,
        ogImage: og.image,
        ogSiteName: og.siteName,
        ogFetchedAt,
        brand: d.brand || null,
        niche: d.niche || null,
        platform: d.platform || null,
        format: d.format || null,
        tags: d.tags ?? [],
        createdBy: request.userId,
      })
      .returning({ id: swipeFiles.id });

      return reply.code(201).send(created);
    } catch (err) {
      fastify.log.error(
        { err, assetKind: d.assetKind, fileMime: d.fileMime },
        "falha ao gravar swipe file",
      );
      return reply.code(500).send({
        error: "Não consegui salvar a referência. O arquivo subiu, mas o registro falhou.",
      });
    }
  });

  // ---- PATCH /:id ----
  fastify.patch(`${base}/:id`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const params = idParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "ID inválido" });
    const body = updateBody.safeParse(request.body);
    if (!body.success || Object.keys(body.data).length === 0) {
      return reply.code(400).send({ error: "Dados inválidos" });
    }
    const d = body.data;

    const updates: Partial<typeof swipeFiles.$inferInsert> = { updatedAt: new Date() };
    if (d.title !== undefined) updates.title = d.title;
    if (d.notes !== undefined) updates.notes = d.notes || null;
    if (d.brand !== undefined) updates.brand = d.brand || null;
    if (d.niche !== undefined) updates.niche = d.niche || null;
    if (d.platform !== undefined) updates.platform = d.platform || null;
    if (d.format !== undefined) updates.format = d.format || null;
    if (d.tags !== undefined) updates.tags = d.tags;
    if (d.isFavorite !== undefined) updates.isFavorite = d.isFavorite;

    const [updated] = await fastify.db
      .update(swipeFiles)
      .set(updates)
      .where(eq(swipeFiles.id, params.data.id))
      .returning({ id: swipeFiles.id });
    if (!updated) return reply.code(404).send({ error: "Referência não encontrada" });
    return { ok: true };
  });

  // ---- DELETE /:id ----
  fastify.delete(`${base}/:id`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const params = idParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "ID inválido" });

    const [row] = await fastify.db
      .select({ fileKey: swipeFiles.fileKey })
      .from(swipeFiles)
      .where(eq(swipeFiles.id, params.data.id))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "Referência não encontrada" });

    await fastify.db.delete(swipeFiles).where(eq(swipeFiles.id, params.data.id));

    // Objeto órfão no bucket é barato; registro pendurado por falha de rede no
    // storage seria pior. Por isso o delete do banco vem primeiro.
    if (row.fileKey) {
      try {
        await deleteObject(storage(), row.fileKey);
      } catch (err) {
        fastify.log.warn({ err, key: row.fileKey }, "[swipe-files] objeto não removido do bucket");
      }
    }
    return { ok: true };
  });
});
