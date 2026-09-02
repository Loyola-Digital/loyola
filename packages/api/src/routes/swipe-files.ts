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

import { Readable } from "node:stream";
import { z } from "zod";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import fp from "fastify-plugin";
import { swipeClickupAlerts, swipeFiles, users } from "../db/schema.js";
import { fetchLinkPreview } from "../services/link-preview.js";
import {
  ErroDeAnalise,
  analisarReferencia,
  podeAnalisar,
} from "../services/swipe-analise.js";
import { avisarNoClickUp } from "../services/swipe-clickup-aviso.js";
import {
  planejarImportacao,
  type ItemParaImportar,
} from "../services/swipe-import-clickup.js";
import {
  MAX_UPLOAD_BYTES,
  checarStorage,
  deleteObject,
  explicarErroDeStorage,
  isAllowedMime,
  isStorageConfigured,
  testarEscrita,
  uploadDireto,
  type StorageConfig,
  pareceplaceholder,
  urlPublica,
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

const previewBody = z.object({ url: z.string().trim().min(1).max(2000) });

/** Colunas da listagem + quem subiu. */
const listColumns = {
  id: swipeFiles.id,
  title: swipeFiles.title,
  notes: swipeFiles.notes,
  assetKind: swipeFiles.assetKind,
  fileUrl: swipeFiles.fileUrl,
  // A chave vem junto: é dela que sai a URL pública, não do `fileUrl`.
  fileKey: swipeFiles.fileKey,
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
      // A URL sai da CHAVE, não do que está gravado: assim, arrumar a variável
      // de ambiente conserta as linhas antigas junto com as novas.
      items: rows.map((r) => ({ ...r, fileUrl: urlPublica(r, fastify.config.STORAGE_PUBLIC_URL) })),
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

  /**
   * Lê a referência e sugere como catalogá-la, em NDJSON.
   *
   * O arquivo vem por multipart e **não passa pelo bucket**: a análise acontece
   * antes de a pessoa decidir salvar, e subir para descartar depois deixaria
   * lixo no bucket a cada tentativa.
   *
   * ## Por que NDJSON, para uma resposta só
   *
   * Ler um PDF leva de 20 a 60 segundos — medido: 17 s para 0,45 MB. Um POST
   * que não manda nada nesse tempo é cortado pelo proxy, e a tela fica pendurada
   * sem erro nem resultado. Foi o que aconteceu. Mandar um passo assim que cada
   * etapa começa mantém a conexão viva E diz o que está acontecendo — a mesma
   * coisa que resolveu o agente do BI.
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

    // Daqui em diante a resposta é do socket. Os headers já acumulados vão
    // junto — é onde mora o `Access-Control-Allow-Origin`.
    reply.hijack();
    reply.raw.writeHead(200, {
      ...(reply.getHeaders() as Record<string, number | string | string[]>),
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    });

    const escrever = (linha: unknown) => {
      if (!reply.raw.writableEnded) reply.raw.write(`${JSON.stringify(linha)}\n`);
    };

    escrever({ tipo: "lendo", bytes: buffer.length });

    /**
     * Um sinal a cada 10 s enquanto o modelo pensa.
     *
     * O stream para a Anthropic mantém AQUELA conexão viva; esta aqui é outra.
     * Sem o pulso, o proxy entre o navegador e nós corta pelo mesmo motivo.
     */
    const pulso = setInterval(() => escrever({ tipo: "analisando" }), 10_000);

    try {
      const sugestao = await analisarReferencia(
        fastify.claude.client,
        { buffer, mimeType: arquivo.mimetype },
        { nomeDoArquivo: arquivo.filename, origem },
      );
      escrever({ tipo: "pronto", sugestao });
    } catch (err) {
      fastify.log.error({ err, mime: arquivo.mimetype }, "analise de swipe file falhou");
      escrever({
        tipo: "erro",
        error: err instanceof ErroDeAnalise ? err.message : "Não consegui analisar agora.",
      });
    } finally {
      clearInterval(pulso);
      reply.raw.end();
    }
  });

  /**
   * Sobe o arquivo PELO SERVIDOR.
   *
   * O caminho anterior (URL assinada, navegador → bucket) é mais barato, mas o
   * Supabase Storage responde 500 ao `PUT` assinado. O erro é dele, não tem
   * corpo útil e acontece na tela de quem está trabalhando — não é algo que se
   * conserta com paciência.
   *
   * Aqui o SDK fala com o bucket a partir do servidor, como já faz para apagar
   * objeto. E em STREAM: um vídeo de 200 MB nunca fica inteiro na memória.
   */
  fastify.post(
    `${base}/upload`,
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });

      if (!isStorageConfigured(storage())) {
        return reply.code(503).send({
          error: "Upload indisponível: bucket não configurado no servidor.",
          code: "STORAGE_NOT_CONFIGURED",
        });
      }

      // Base ainda no valor de exemplo: recusar ANTES de subir.
      //
      // O contrário já aconteceu — o arquivo foi para o bucket, a tela disse
      // que deu certo, e o link salvo apontava para `seuprojeto.supabase.co`.
      // Falhar aqui custa uma tentativa; deixar passar custa uma referência que
      // parece existir e não abre.
      if (pareceplaceholder(fastify.config.STORAGE_PUBLIC_URL)) {
        return reply.code(503).send({
          error:
            "STORAGE_PUBLIC_URL ainda está com o valor de exemplo no servidor. " +
            "O arquivo subiria, mas o link não abriria.",
          code: "STORAGE_PUBLIC_URL_PLACEHOLDER",
        });
      }

      // O teto global do multipart é 10 MB (app.ts) e vídeo de anúncio passa
      // disso com folga. O limite desta rota é o do bucket.
      const arquivo = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });
      if (!arquivo) return reply.code(400).send({ error: "Envie o arquivo." });

      if (!isAllowedMime(arquivo.mimetype)) {
        return reply.code(400).send({ error: `Tipo não permitido: ${arquivo.mimetype}` });
      }

      try {
        const r = await uploadDireto(storage(), {
          corpo: arquivo.file,
          mime: arquivo.mimetype,
          prefix: "swipe",
        });

        // `truncated` é como o multipart avisa que cortou no limite — sem esta
        // checagem o arquivo entraria PELA METADE, com URL válida e conteúdo
        // quebrado, que é pior que falhar.
        if (arquivo.file.truncated) {
          await deleteObject(storage(), r.key).catch(() => {});
          const mb = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
          return reply.code(400).send({ error: `Arquivo maior que o limite de ${mb} MB.` });
        }

        return r;
      } catch (err) {
        // O erro do SDK carrega o código do S3 (`NoSuchBucket`, `AccessDenied`),
        // que é o que distingue bucket inexistente de credencial errada — duas
        // coisas que se resolvem de formas opostas. Só a `message` vira
        // "Internal Server Error" e não deixa ninguém agir.
        const detalhe = explicarErroDeStorage(err);
        fastify.log.error(
          { err, mime: arquivo.mimetype, codigo: detalhe.codigo, status: detalhe.status },
          "upload de swipe file falhou",
        );
        return reply.code(502).send({
          error: detalhe.mensagem,
          codigo: detalhe.codigo,
          // A dica de onde olhar: sem isto, "falhou" manda a pessoa ao suporte.
          diagnostico: `${base}/storage-check`,
        });
      }
    },
  );

  /**
   * Diz se o bucket está alcançável, sem subir arquivo nenhum.
   *
   * Existe porque a pergunta "por que o upload falha" tinha três respostas
   * possíveis — bucket inexistente, credencial sem permissão, arquivo — e a
   * única forma de distinguir era tentar subir e ler o erro cru.
   */
  fastify.get(`${base}/storage-check`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });

    const leitura = await checarStorage(storage());
    // Só testa escrita se a leitura passou: sem bucket, o teste de escrita
    // repetiria o mesmo erro com outro nome.
    const escrita = leitura.ok ? await testarEscrita(storage()) : { ok: false };

    return {
      configurado: isStorageConfigured(storage()),
      bucket: leitura.bucket,
      endpoint: leitura.endpoint,
      alcancaOBucket: leitura.ok,
      podeGravar: escrita.ok,
      erro: leitura.erro ?? ("erro" in escrita ? escrita.erro : undefined) ?? null,
    };
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

    // O nome de quem subiu, para o aviso não sair anônimo. Falha aqui não
    // impede nada: sem nome o aviso ainda é útil.
    const [autor] = request.userId
      ? await fastify.db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, request.userId))
          .limit(1)
      : [];
    const autorDoAviso = autor?.name ?? null;

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

      // O aviso sai DEPOIS de gravar, e sem `await` no caminho crítico: quem
      // subiu já tem a referência salva, e esperar o ClickUp só atrasaria a
      // tela por uma coisa que não muda o resultado.
      void avisarNoClickUp(fastify as never, {
        id: created!.id,
        titulo: d.title,
        assetKind: d.assetKind,
        autor: autorDoAviso,
        notas: d.notes ?? null,
        marca: d.brand ?? null,
        nicho: d.niche ?? null,
        plataforma: d.platform ?? null,
        formato: d.format ?? null,
        tags: d.tags ?? [],
        origem: d.sourceUrl ?? null,
      });

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

  // ============================================================
  // Aviso no ClickUp — configuração
  // ============================================================

  const configBody = z.object({
    enabled: z.boolean().default(true),
    channelId: z.string().trim().min(1).max(120),
    channelName: z.string().trim().max(200).optional(),
    videoChannelId: z.string().trim().max(120).nullish(),
    videoChannelName: z.string().trim().max(200).nullish(),
    mentionUsers: z
      .array(z.object({ id: z.string().min(1), username: z.string().min(1) }))
      .max(10)
      .default([]),
  });

  fastify.get(`${base}/clickup-alert`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const [cfg] = await fastify.db.select().from(swipeClickupAlerts).limit(1);
    return {
      config: cfg ?? null,
      // A tela precisa saber se dá para configurar antes de oferecer o formulário.
      clickupPronto: fastify.clickupService.isConfigured(),
    };
  });

  fastify.put(`${base}/clickup-alert`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const body = configBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

    const valores = {
      enabled: body.data.enabled,
      channelId: body.data.channelId,
      channelName: body.data.channelName ?? null,
      videoChannelId: body.data.videoChannelId ?? null,
      videoChannelName: body.data.videoChannelName ?? null,
      mentionUsers: body.data.mentionUsers,
      updatedAt: new Date(),
    };

    // Configuração única: atualiza a que existe ou cria a primeira. Um `upsert`
    // por id não serviria — o id é gerado, e quem salva não o conhece.
    const [existente] = await fastify.db
      .select({ id: swipeClickupAlerts.id })
      .from(swipeClickupAlerts)
      .limit(1);

    const [salvo] = existente
      ? await fastify.db
          .update(swipeClickupAlerts)
          .set(valores)
          .where(eq(swipeClickupAlerts.id, existente.id))
          .returning()
      : await fastify.db
          .insert(swipeClickupAlerts)
          .values({ ...valores, createdBy: request.userId ?? null })
          .returning();

    return salvo;
  });

  /**
   * Canais e membros do ClickUp, SEM projeto na URL.
   *
   * As rotas equivalentes em `event-payment-alerts` pedem `projectId`, mas só
   * para validar formato — o workspace do ClickUp é um só. O Swipe Files não
   * tem projeto, e inventar um só para passar na validação seria mentir na URL.
   */
  fastify.get(`${base}/clickup-channels`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    if (!fastify.clickupService.isConfigured()) {
      return reply.code(409).send({ error: "ClickUp não configurado no servidor" });
    }
    try {
      return { channels: await fastify.clickupService.getChatChannels() };
    } catch (err) {
      return reply
        .code(502)
        .send({ error: err instanceof Error ? err.message : "Erro ao listar canais" });
    }
  });

  fastify.get(`${base}/clickup-members`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    if (!fastify.clickupService.isConfigured()) {
      return reply.code(409).send({ error: "ClickUp não configurado no servidor" });
    }
    try {
      return { members: await fastify.clickupService.getWorkspaceMembers() };
    } catch (err) {
      return reply
        .code(502)
        .send({ error: err instanceof Error ? err.message : "Erro ao listar membros" });
    }
  });

  /** Manda uma mensagem de teste — é como se confere o canal sem subir nada. */
  fastify.post(`${base}/clickup-alert/test`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    if (!fastify.clickupService.isConfigured()) {
      return reply.code(503).send({ error: "ClickUp não configurado no servidor." });
    }

    const [cfg] = await fastify.db.select().from(swipeClickupAlerts).limit(1);
    if (!cfg) return reply.code(400).send({ error: "Configure o canal antes de testar." });

    const r = await avisarNoClickUp(fastify as never, {
      id: "teste",
      titulo: "Teste de aviso — nenhuma referência foi criada",
      assetKind: "link",
      autor: "Loyola X",
      notas: "Se você está lendo isto no canal certo, o aviso está funcionando.",
      marca: null,
      nicho: null,
      plataforma: null,
      formato: null,
      tags: ["teste"],
      origem: null,
    });

    if (!r.enviado) {
      return reply.code(502).send({ error: `Não consegui enviar (${r.motivo}).` });
    }
    return { ok: true };
  });

  /**
   * Traz para a biblioteca o que ja estava num canal de chat do ClickUp.
   *
   * ## Por que roda AQUI e nao num script
   *
   * As chaves do bucket so existem no servidor. Um script na maquina de alguem
   * consegue ler o ClickUp e escrever no banco, mas nao consegue subir o
   * binario - e sem o binario a referencia e uma linha que nao abre.
   *
   * ## O aviso fica de fora, de proposito
   *
   * Cada referencia salva pela tela manda uma mensagem de volta ao canal (ver
   * `avisarNoClickUp`). Fazer isso aqui despejaria centenas de mensagens no
   * mesmo canal que estamos importando - e, na importacao seguinte, elas
   * virariam referencias. Este caminho grava sem avisar.
   *
   * ## NDJSON
   *
   * Sao centenas de itens e de megabytes: leva minutos. Um POST calado e
   * cortado pelo proxy e a tela fica pendurada - o mesmo problema que a
   * analise ja teve. Cada item resolvido vira uma linha.
   */
  fastify.post(`${base}/importar-clickup`, async (request, reply) => {
    // Importar cria centenas de registros de uma vez. Nao e operacao de
    // biblioteca, e de administracao.
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Só admin pode importar." });
    }
    if (!request.userId) return reply.code(401).send({ error: "Sem usuário." });

    const corpo = z
      .object({
        channelId: z.string().trim().min(1).max(60),
        /** Sem isto, so planeja e conta - nada e gravado. */
        confirmar: z.boolean().optional(),
        /** Manda imagem e PDF para a IA catalogar. Video nunca vai. */
        analisar: z.boolean().optional(),
        limite: z.coerce.number().int().min(1).max(1000).optional(),
      })
      .safeParse(request.body);
    if (!corpo.success) return reply.code(400).send({ error: "Parâmetros inválidos." });
    const { channelId, confirmar, analisar, limite } = corpo.data;

    if (!fastify.clickupService.isConfigured()) {
      return reply.code(503).send({ error: "ClickUp não configurado no servidor." });
    }
    if (!isStorageConfigured(storage()) || pareceplaceholder(fastify.config.STORAGE_PUBLIC_URL)) {
      return reply.code(503).send({ error: "Storage não configurado no servidor." });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      ...(reply.getHeaders() as Record<string, number | string | string[]>),
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    });
    const escrever = (linha: unknown) => {
      if (!reply.raw.writableEnded) reply.raw.write(`${JSON.stringify(linha)}\n`);
    };

    // Ler o canal inteiro leva dezenas de segundos antes do primeiro item.
    const pulso = setInterval(() => escrever({ tipo: "trabalhando" }), 10_000);

    try {
      escrever({ tipo: "lendo-canal" });
      const msgs = await fastify.clickupService.getChatChannelMessages(channelId, {
        comThreads: true,
      });

      const plano = planejarImportacao(msgs);

      // O que ja entrou numa rodada anterior. Sem este corte, retomar uma
      // importacao interrompida tentaria subir tudo de novo - o indice unico
      // barraria a gravacao, mas so DEPOIS do download e do upload.
      const jaTem = new Set<string>();
      const chaves = plano.map((i) => i.importKey);
      for (let i = 0; i < chaves.length; i += 500) {
        const linhas = await fastify.db
          .select({ k: swipeFiles.importKey })
          .from(swipeFiles)
          .where(inArray(swipeFiles.importKey, chaves.slice(i, i + 500)));
        for (const l of linhas) if (l.k) jaTem.add(l.k);
      }

      const pendentes = plano.filter((i) => !jaTem.has(i.importKey));
      const novos = pendentes.slice(0, limite ?? pendentes.length);

      escrever({
        tipo: "plano",
        mensagens: msgs.length,
        total: plano.length,
        jaImportados: plano.length - pendentes.length,
        // `pendentes` e o alvo real; `aImportar` e so o que cabe NESTE lote.
        // A tela importa em lotes e precisa dos dois para nao reiniciar a
        // contagem a cada rodada.
        pendentes: pendentes.length,
        aImportar: novos.length,
        comArquivo: novos.filter((i) => i.anexo).length,
      });

      if (!confirmar) {
        escrever({ tipo: "fim", simulado: true, criados: 0, falhas: 0 });
        return;
      }

      let criados = 0;
      let falhas = 0;

      for (const [i, item] of novos.entries()) {
        try {
          const gravado = await importarUm(item, Boolean(analisar), request.userId);
          criados++;
          escrever({
            tipo: "item",
            i: i + 1,
            de: novos.length,
            titulo: gravado.titulo,
            kind: item.kind,
            status: "ok",
          });
        } catch (err) {
          falhas++;
          // Uma referencia que falhou nao pode parar as outras: o motivo
          // costuma ser dela (anexo apagado, tipo recusado), nao da rodada.
          fastify.log.warn({ err, importKey: item.importKey }, "item de importacao falhou");
          escrever({
            tipo: "item",
            i: i + 1,
            de: novos.length,
            titulo: item.titulo,
            kind: item.kind,
            status: "erro",
            erro: err instanceof Error ? err.message : "falhou",
          });
        }
      }

      escrever({ tipo: "fim", criados, falhas, ignorados: plano.length - novos.length });
    } catch (err) {
      fastify.log.error({ err, channelId }, "importacao do clickup falhou");
      escrever({
        tipo: "erro",
        error: err instanceof Error ? err.message : "Não consegui importar.",
      });
    } finally {
      clearInterval(pulso);
      reply.raw.end();
    }
  });

  /** Baixa, sobe, cataloga e grava um item. Lanca quando nao da. */
  async function importarUm(
    item: ItemParaImportar,
    analisar: boolean,
    userId: string,
  ): Promise<{ titulo: string }> {
    let fileUrl: string | null = null;
    let fileKey: string | null = null;
    let fileMime: string | null = null;
    let fileSizeBytes: number | null = null;
    let sugestao: Awaited<ReturnType<typeof analisarReferencia>> | null = null;

    if (item.anexo) {
      const resposta = await fetch(item.anexo.url, { redirect: "follow" });
      if (!resposta.ok || !resposta.body) {
        throw new Error(`anexo respondeu ${resposta.status}`);
      }

      const tamanho = Number(resposta.headers.get("content-length") ?? 0);

      /**
       * Buffer quando a IA vai ler; stream quando nao.
       *
       * A analise precisa dos bytes inteiros na memoria para virar base64.
       * Video nao e analisavel e e o que pesa, entao vai direto do ClickUp ao
       * bucket sem passar pela RAM do container.
       *
       * O teto de 32 MB e da API da Anthropic, nao nosso: um PDF acima disso e
       * recusado la, e baixa-lo para a memoria seria gastar por nada.
       */
      const vaiAnalisar =
        analisar && podeAnalisar(item.anexo.mime) && tamanho > 0 && tamanho <= 32 * 1024 * 1024;

      if (vaiAnalisar) {
        const buffer = Buffer.from(await resposta.arrayBuffer());
        fileSizeBytes = buffer.length;
        const r = await uploadDireto(storage(), {
          corpo: Readable.from(buffer),
          mime: item.anexo.mime,
          prefix: "swipe",
        });
        fileUrl = r.publicUrl;
        fileKey = r.key;
        try {
          sugestao = await analisarReferencia(
            fastify.claude.client,
            { buffer, mimeType: item.anexo.mime },
            { nomeDoArquivo: item.anexo.nome, origem: item.origem ?? undefined },
          );
        } catch (err) {
          // O arquivo ja esta no bucket e a referencia vale sem as facetas.
          // Perder a catalogacao e um campo em branco; perder o arquivo seria
          // ter de baixar tudo de novo.
          fastify.log.warn({ err, importKey: item.importKey }, "analise da importacao falhou");
        }
      } else {
        const r = await uploadDireto(storage(), {
          corpo: Readable.fromWeb(resposta.body as never),
          mime: item.anexo.mime,
          prefix: "swipe",
        });
        fileUrl = r.publicUrl;
        fileKey = r.key;
        fileSizeBytes = tamanho || null;
      }
      fileMime = item.anexo.mime;
    }

    // O que a IA sugeriu vence o que o parsing adivinhou - ela viu a imagem.
    // Mas so quando trouxe algo: campo vazio dela nao apaga o que ja tinhamos.
    const titulo = (sugestao?.titulo || item.titulo).slice(0, 200);
    const notas = [sugestao?.anotacoes, item.notas].filter(Boolean).join("\n\n").slice(0, 4000);

    await fastify.db.insert(swipeFiles).values({
      title: titulo,
      notes: notas || null,
      assetKind: item.kind,
      fileUrl,
      fileKey,
      fileMime,
      fileSizeBytes,
      sourceUrl: item.origem,
      brand: sugestao?.marca ?? null,
      niche: sugestao?.nicho ?? null,
      platform: sugestao?.plataforma ?? null,
      format: sugestao?.formato ?? null,
      tags: sugestao?.tags ?? [],
      importKey: item.importKey,
      createdBy: userId,
    });

    return { titulo };
  }
});
