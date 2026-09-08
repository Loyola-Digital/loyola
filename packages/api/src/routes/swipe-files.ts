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
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  swipeClickupAlerts,
  swipeCollectionItems,
  swipeCollections,
  swipeFiles,
  users,
} from "../db/schema.js";
import { fetchLinkPreview } from "../services/link-preview.js";
import {
  ErroDeAnalise,
  analisarLink,
  analisarReferencia,
  podeAnalisar,
  ehHtml,
  textoDoHtml,
  ehDocumento,
  textoDoDocumento,
  MIME_DOCX,
} from "../services/swipe-analise.js";
import { avisarNoClickUp } from "../services/swipe-clickup-aviso.js";
import { contarFacetas } from "../services/swipe-facetas.js";
import {
  agruparPorAtributo,
  ehAgrupamento,
  limparNomeDaColecao,
  nomeLivre,
} from "../services/swipe-colecoes.js";
import {
  CABECALHO_DO_CATALOGO,
  instrucao,
  interpretarResposta,
  montarCatalogo,
} from "../services/swipe-busca-semantica.js";
import {
  planejarImportacao,
  type ItemParaImportar,
} from "../services/swipe-import-clickup.js";
import {
  MAX_UPLOAD_BYTES,
  checarStorage,
  deleteObject,
  explicarErroDeStorage,
  resolverMime,
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
  kind: z.enum(["image", "video", "pdf", "link", "html", "doc"]).optional(),
  favorites: z.enum(["1", "true"]).optional(),
  /** Só as peças desta coleção. */
  colecao: z.string().uuid().optional(),
  /** Devolve também os grupos por atributo — a "pasta automática". */
  agruparPor: z.string().trim().max(20).optional(),
});

const createBody = z.object({
  title: z.string().trim().min(1).max(200),
  assetKind: z.enum(["image", "video", "pdf", "link", "html", "doc"]),
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
    // Coleção entra como subconsulta e não como join: um join duplicaria a
    // peça que está em duas coleções, e a grade mostraria o mesmo card duas
    // vezes.
    if (f.colecao) {
      conds.push(
        sql`exists (select 1 from ${swipeCollectionItems} ci
                    where ci.swipe_id = ${swipeFiles.id} and ci.collection_id = ${f.colecao})`,
      );
    }
    if (f.q) {
      const like = `%${f.q}%`;
      conds.push(
        or(
          ilike(swipeFiles.title, like),
          ilike(swipeFiles.notes, like),
          ilike(swipeFiles.brand, like),
          ilike(swipeFiles.ogTitle, like),
          // As tags entram na busca porque a maioria delas é única: 589 das
          // 781 aparecem numa referência só. Como filtro elas não recortam
          // nada — como texto procurado, são o caminho mais curto até o item.
          sql`${swipeFiles.tags}::text ILIKE ${like}`,
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


    return {
      // A URL sai da CHAVE, não do que está gravado: assim, arrumar a variável
      // de ambiente conserta as linhas antigas junto com as novas.
      items: rows.map((r) => ({ ...r, fileUrl: urlPublica(r, fastify.config.STORAGE_PUBLIC_URL) })),
      // Com CONTAGEM e ordenadas por uso — ver `contarFacetas` para o porquê.
      facets: {
        platform: contarFacetas(facetRows.map((r) => r.platform)),
        format: contarFacetas(facetRows.map((r) => r.format)),
        niche: contarFacetas(facetRows.map((r) => r.niche)),
        brand: contarFacetas(facetRows.map((r) => r.brand)),
        tags: contarFacetas(facetRows.flatMap((r) => r.tags ?? [])),
      },
      /** Serve à tela para dizer "1 de 291" sem uma chamada a mais. */
      total: facetRows.length,
      /**
       * A "pasta automática": os mesmos itens, organizados por um atributo que
       * a IA já preencheu.
       *
       * Só os IDS, não as peças de novo — repetir os objetos dobraria o corpo
       * da resposta para dizer a mesma coisa. A tela remonta pela ordem.
       */
      grupos:
        f.agruparPor && ehAgrupamento(f.agruparPor)
          ? agruparPorAtributo(rows, f.agruparPor).map((g) => ({
              valor: g.valor,
              ids: g.pecas.map((p) => p.id),
            }))
          : null,
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
  /**
   * As referências de uma lista de ids.
   *
   * O mapa de funil prende referências aos blocos guardando só os ids — o
   * resto vem daqui na hora de desenhar. Sem esta rota, mostrar seis
   * miniaturas num mapa seria baixar as 291 da biblioteca e descartar 285.
   *
   * A ordem devolvida é a ORDEM PEDIDA, não a do banco: é ela que o bloco
   * mostra, e uma referência que troca de lugar sozinha entre dois carregamentos
   * parece que alguém mexeu no mapa.
   */
  fastify.get(`${base}/por-ids`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const q = z
      .object({ ids: z.string().min(1).max(4000) })
      .safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const ids = [...new Set(q.data.ids.split(",").map((s) => s.trim()).filter(Boolean))]
      .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
      .slice(0, 200);
    if (ids.length === 0) return { items: [] };

    const rows = await fastify.db
      .select(listColumns)
      .from(swipeFiles)
      .leftJoin(users, eq(users.id, swipeFiles.createdBy))
      .where(inArray(swipeFiles.id, ids));

    const porId = new Map(rows.map((r) => [r.id, r]));
    return {
      // Id que não existe mais some da lista em silêncio: a referência pode ter
      // sido apagada da biblioteca depois de presa ao bloco, e o mapa não deve
      // quebrar por isso.
      items: ids
        .map((id) => porId.get(id))
        .filter((r): r is (typeof rows)[number] => !!r)
        .map((r) => ({ ...r, fileUrl: urlPublica(r, fastify.config.STORAGE_PUBLIC_URL) })),
    };
  });

  /**
   * Busca por CONTEXTO — o que a peça É, não a palavra que ela contém.
   *
   * O catálogo inteiro vai no prompt, num bloco marcado para cache: ele muda
   * devagar, e sem o cache cada busca pagaria os ~27 mil tokens do zero. Ver
   * `swipe-busca-semantica.ts` para por que não são embeddings.
   *
   * Falha aqui NÃO é erro para quem buscou: a busca por texto já respondeu, e
   * isto é o complemento. Devolve lista vazia e a tela não mostra a seção.
   */
  fastify.post(`${base}/busca-contexto`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const b = z
      .object({ q: z.string().trim().min(2).max(300), limite: z.coerce.number().int().min(1).max(30).optional() })
      .safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: "Busca inválida" });

    const chave = process.env.ANTHROPIC_API_KEY;
    if (!chave) return { achados: [], indisponivel: "Análise por IA não configurada." };

    const refs = await fastify.db
      .select({
        id: swipeFiles.id,
        title: swipeFiles.title,
        notes: swipeFiles.notes,
        brand: swipeFiles.brand,
        niche: swipeFiles.niche,
        platform: swipeFiles.platform,
        format: swipeFiles.format,
        tags: swipeFiles.tags,
      })
      .from(swipeFiles)
      .orderBy(desc(swipeFiles.createdAt))
      .limit(1200);

    if (refs.length === 0) return { achados: [] };

    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: chave });
      const resposta = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        system: [
          {
            type: "text",
            text:
              "Você ajuda um time de marketing a achar peças numa biblioteca de referências de anúncios.\n\n" +
              `Catálogo (${CABECALHO_DO_CATALOGO}):\n` +
              montarCatalogo(refs),
            // O catálogo muda devagar e é o grosso do prompt: sem cache, cada
            // busca paga os ~27 mil tokens de novo.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: instrucao(b.data.q, b.data.limite ?? 12) }],
      });

      const texto = resposta.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("\n");
      return { achados: interpretarResposta(texto, refs) };
    } catch (e) {
      // Log e silêncio: a busca por texto já entregou algo, e um erro vermelho
      // aqui faria parecer que a busca inteira falhou.
      request.log.warn({ err: e }, "busca por contexto falhou");
      return { achados: [], indisponivel: "Não consegui buscar por contexto agora." };
    }
  });

  // ---- Coleções ----

  /**
   * As coleções, com quantas peças cada uma tem.
   *
   * A contagem vem no mesmo `GET` porque a tela mostra as duas coisas juntas —
   * uma coleção sem número na frente não diz se vale abrir.
   */
  fastify.get(`${base}/colecoes`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const linhas = await fastify.db
      .select({
        id: swipeCollections.id,
        nome: swipeCollections.nome,
        descricao: swipeCollections.descricao,
        parentId: swipeCollections.parentId,
        criadaEm: swipeCollections.createdAt,
        pecas: sql<number>`count(${swipeCollectionItems.swipeId})::int`,
        mexidaEm: sql<Date>`greatest(${swipeCollections.updatedAt}, coalesce(max(${swipeCollectionItems.addedAt}), ${swipeCollections.updatedAt}))`,
      })
      .from(swipeCollections)
      .leftJoin(swipeCollectionItems, eq(swipeCollectionItems.collectionId, swipeCollections.id))
      .groupBy(swipeCollections.id)
      // Por atividade: a coleção que acabou de receber peça é a que está em uso.
      .orderBy(
        desc(
          sql`greatest(${swipeCollections.updatedAt}, coalesce(max(${swipeCollectionItems.addedAt}), ${swipeCollections.updatedAt}))`,
        ),
      );

    return {
      colecoes: linhas.map((l) => ({
        ...l,
        criadaEm: l.criadaEm?.toISOString() ?? null,
        mexidaEm: l.mexidaEm ? new Date(l.mexidaEm).toISOString() : null,
      })),
    };
  });

  /** Cria uma coleção. Nome repetido ganha sufixo em vez de recusar o envio. */
  fastify.post(`${base}/colecoes`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const b = z
      .object({
        nome: z.string().max(200),
        descricao: z.string().max(2000).nullable().optional(),
        /** Onde ela mora. Vazio = na raiz. */
        parentId: z.string().uuid().nullable().optional(),
      })
      .safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: "Dados inválidos" });

    const nome = limparNomeDaColecao(b.data.nome);
    if (!nome) return reply.code(400).send({ error: "A coleção precisa de um nome." });

    const pai = b.data.parentId ?? null;

    /**
     * Já existe uma com esse nome NO MESMO LUGAR? Devolve ela.
     *
     * Subir a mesma pasta de novo é o caso comum — a segunda vez com mais
     * arquivos. Criar "Black Friday (2)" ao lado da original espalharia o
     * acervo em duas coleções que ninguém queria separadas.
     */
    const [jaExiste] = await fastify.db
      .select({ id: swipeCollections.id, nome: swipeCollections.nome })
      .from(swipeCollections)
      .where(
        pai
          ? and(eq(swipeCollections.parentId, pai), sql`lower(${swipeCollections.nome}) = lower(${nome})`)
          : and(isNull(swipeCollections.parentId), sql`lower(${swipeCollections.nome}) = lower(${nome})`),
      )
      .limit(1);
    if (jaExiste) return reply.code(200).send({ ...jaExiste, jaExistia: true });

    const existentes = await fastify.db
      .select({ nome: swipeCollections.nome })
      .from(swipeCollections)
      .where(pai ? eq(swipeCollections.parentId, pai) : isNull(swipeCollections.parentId));

    const [criada] = await fastify.db
      .insert(swipeCollections)
      .values({
        // Subir a mesma pasta duas vezes é comum — a segunda com mais
        // arquivos. Recusar pelo nome faria perder o envio inteiro.
        nome: nomeLivre(nome, existentes.map((e) => e.nome)),
        descricao: b.data.descricao ?? null,
        parentId: pai,
        createdBy: request.userId ?? null,
      })
      .returning();

    return reply.code(201).send(criada);
  });

  fastify.patch(`${base}/colecoes/:id`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const b = z
      .object({ nome: z.string().max(200).optional(), descricao: z.string().max(2000).nullable().optional() })
      .safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Dados inválidos" });

    const patch: { nome?: string; descricao?: string | null } = {};
    if (b.data.nome !== undefined) {
      const nome = limparNomeDaColecao(b.data.nome);
      if (!nome) return reply.code(400).send({ error: "A coleção precisa de um nome." });
      patch.nome = nome;
    }
    if (b.data.descricao !== undefined) patch.descricao = b.data.descricao;

    const [atualizada] = await fastify.db
      .update(swipeCollections)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(swipeCollections.id, p.data.id))
      .returning();

    if (!atualizada) return reply.code(404).send({ error: "Coleção não encontrada" });
    return atualizada;
  });

  /**
   * Apaga a coleção. As PEÇAS ficam.
   *
   * Só o vínculo cai (`ON DELETE CASCADE` na tabela de itens). Uma coleção é
   * um recorte da biblioteca, não um depósito: apagar "Black Friday 2026" não
   * pode levar junto os 47 criativos que continuam servindo a outros usos.
   */
  fastify.delete(`${base}/colecoes/:id`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const q = z
      .object({ comAsPecas: z.enum(["1", "true"]).optional() })
      .safeParse(request.query);
    if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const levarAsPecas = Boolean(q.data.comAsPecas);

    /**
     * A coleção e tudo que está dentro dela.
     *
     * Apagar a mãe já derruba as filhas por `CASCADE`, mas para saber QUAIS
     * peças ficariam órfãs é preciso conhecer a árvore antes — depois do
     * delete, os vínculos já não existem.
     */
    const arvore = await fastify.db.execute<{ id: string }>(sql`
      WITH RECURSIVE t AS (
        SELECT id FROM swipe_collections WHERE id = ${p.data.id}
        UNION ALL
        SELECT c.id FROM swipe_collections c JOIN t ON c.parent_id = t.id
      )
      SELECT id FROM t
    `);
    const ids = (arvore.rows ?? arvore).map((r: { id: string }) => r.id);
    if (ids.length === 0) return reply.code(404).send({ error: "Coleção não encontrada" });

    let pecasApagadas = 0;
    if (levarAsPecas) {
      /**
       * Só as peças EXCLUSIVAS desta árvore.
       *
       * Uma referência que também está em "Referências de escassez" não pode
       * sumir porque a coleção do lançamento foi apagada — ela foi separada
       * para dois usos, e um deles continua valendo.
       */
      const exclusivas = await fastify.db.execute<{ id: string; file_key: string | null }>(sql`
        SELECT s.id, s.file_key
        FROM swipe_files s
        WHERE EXISTS (
          SELECT 1 FROM swipe_collection_items i
          WHERE i.swipe_id = s.id AND i.collection_id = ANY(${ids}::uuid[])
        )
        AND NOT EXISTS (
          SELECT 1 FROM swipe_collection_items i
          WHERE i.swipe_id = s.id AND i.collection_id <> ALL(${ids}::uuid[])
        )
      `);
      const linhas = (exclusivas.rows ?? exclusivas) as { id: string; file_key: string | null }[];

      if (linhas.length > 0) {
        // O objeto sai do bucket ANTES da linha: sem a linha, ninguém mais
        // sabe qual é a chave, e o arquivo fica pago para sempre.
        await Promise.all(
          linhas
            .filter((l) => l.file_key)
            .map((l) => deleteObject(storage(), l.file_key as string).catch(() => {})),
        );
        await fastify.db.delete(swipeFiles).where(
          inArray(
            swipeFiles.id,
            linhas.map((l) => l.id),
          ),
        );
        pecasApagadas = linhas.length;
      }
    }

    await fastify.db.delete(swipeCollections).where(eq(swipeCollections.id, p.data.id));
    return { ok: true, colecoesApagadas: ids.length, pecasApagadas };
  });

  /** Põe ou tira peças de uma coleção. Repetir não duplica. */
  fastify.put(`${base}/colecoes/:id/pecas`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const b = z
      .object({
        adicionar: z.array(z.string().uuid()).max(500).optional(),
        remover: z.array(z.string().uuid()).max(500).optional(),
      })
      .safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Dados inválidos" });

    if (b.data.adicionar?.length) {
      await fastify.db
        .insert(swipeCollectionItems)
        .values(
          b.data.adicionar.map((swipeId) => ({
            collectionId: p.data.id,
            swipeId,
            addedBy: request.userId ?? null,
          })),
        )
        // Pôr de novo o que já está lá é um gesto normal (selecionar tudo e
        // arrastar); não pode virar erro.
        .onConflictDoNothing();
    }

    if (b.data.remover?.length) {
      await fastify.db
        .delete(swipeCollectionItems)
        .where(
          and(
            eq(swipeCollectionItems.collectionId, p.data.id),
            inArray(swipeCollectionItems.swipeId, b.data.remover),
          ),
        );
    }

    const [{ total }] = await fastify.db
      .select({ total: sql<number>`count(*)::int` })
      .from(swipeCollectionItems)
      .where(eq(swipeCollectionItems.collectionId, p.data.id));

    return { pecas: total ?? 0 };
  });

  /**
   * O texto de um documento, para LER na tela.
   *
   * O `.docx` é um ZIP com XML dentro — o navegador não abre. Sem isto, uma
   * transcrição subida vira um card que diz "Documento" e não mostra nada, que
   * é pior que não ter subido: parece que o arquivo se perdeu.
   *
   * A extração acontece aqui porque a `mammoth` vive no servidor, e mandá-la
   * para o navegador seria meio megabyte de biblioteca para ler um texto de
   * dois mil caracteres.
   */
  fastify.get(`${base}/:id/texto`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [item] = await fastify.db
      .select({
        assetKind: swipeFiles.assetKind,
        fileMime: swipeFiles.fileMime,
        fileUrl: swipeFiles.fileUrl,
        fileKey: swipeFiles.fileKey,
      })
      .from(swipeFiles)
      .where(eq(swipeFiles.id, p.data.id))
      .limit(1);
    if (!item) return reply.code(404).send({ error: "Referência não encontrada" });
    if (item.assetKind !== "doc") {
      return reply.code(400).send({ error: "Esta referência não é um documento." });
    }

    const url = urlPublica(item, fastify.config.STORAGE_PUBLIC_URL);
    if (!url) return reply.code(404).send({ error: "Arquivo não encontrado." });

    try {
      const r = await fetch(url);
      if (!r.ok) return reply.code(502).send({ error: "Não consegui buscar o arquivo." });
      const buffer = Buffer.from(await r.arrayBuffer());
      // Sem limite aqui: na análise o corte existe para caber no prompt; para
      // LER, cortar o documento no meio é esconder o fim da transcrição.
      const texto = await textoDoDocumento(buffer, item.fileMime ?? MIME_DOCX, 500_000);
      return { texto };
    } catch (err) {
      request.log.warn({ err, id: p.data.id }, "não consegui extrair o texto do documento");
      return reply.code(502).send({ error: "Não consegui ler este documento." });
    }
  });

  fastify.post(`${base}/analisar`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });

    const arquivo = await request.file();
    if (!arquivo) return reply.code(400).send({ error: "Envie a imagem ou o PDF." });

    /**
     * O tipo sai do NOME quando o cabeçalho é vago — mesmo motivo da rota de
     * upload: o navegador escreve `application/octet-stream` para arquivo do
     * disco, e a análise recusava a página com o arquivo certo em mãos.
     */
    const mimeReal = resolverMime(arquivo.filename, arquivo.mimetype) ?? arquivo.mimetype;

    // HTML entra por outro caminho: o modelo lê o TEXTO da página, não o
    // arquivo. Ver `textoDoHtml` para por que não mandamos o HTML cru.
    if (!podeAnalisar(mimeReal) && !ehHtml(mimeReal) && !ehDocumento(mimeReal)) {
      return reply.code(400).send({
        error:
          "Só dá para analisar imagem, PDF, página ou documento. Vídeo precisa ser catalogado à mão.",
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
      const sugestao = ehDocumento(mimeReal)
        ? /*
           * Transcrição, roteiro, briefing — o modelo lê o texto.
           *
           * É o melhor material que existe para catalogar VÍDEO: ele não
           * assiste, mas a transcrição diz o gancho, a oferta e a prova.
           */
          await analisarLink(fastify.claude.client, {
            url: origem ?? arquivo.filename ?? "documento",
            titulo: arquivo.filename ?? null,
            textoDaPagina: await textoDoDocumento(buffer, mimeReal),
          })
        : ehHtml(mimeReal)
        ? /*
           * A página salva é o melhor material de catalogação do acervo.
           *
           * Um link entrega só o Open Graph — título e uma linha. Aqui o
           * modelo lê a headline, a promessa, o preço e a prova, que é o que
           * faz a peça ser reencontrada três meses depois.
           */
          await analisarLink(fastify.claude.client, {
            url: origem ?? arquivo.filename ?? "página salva",
            titulo: arquivo.filename ?? null,
            textoDaPagina: textoDoHtml(buffer.toString("utf8")),
          })
        : await analisarReferencia(
            fastify.claude.client,
            { buffer, mimeType: mimeReal },
            { nomeDoArquivo: arquivo.filename, origem },
          );
      escrever({ tipo: "pronto", sugestao });
    } catch (err) {
      fastify.log.error({ err, mime: mimeReal }, "analise de swipe file falhou");
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
      /**
       * 120/min — dimensionado para o upload de PASTA.
       *
       * Eram 30, pensados para quem sobe um arquivo por vez. Uma pasta de 127
       * arquivos estourava no meio: os primeiros entravam, o resto levava 429
       * e virava "falhou" na tela, com o arquivo perfeitamente válido.
       *
       * Dois por segundo ainda protege o bucket de abuso, e o cliente respeita
       * o `retry-after` quando bate no teto — ver `useUploadToBucket`.
       */
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
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

      /**
       * O tipo sai do nome quando o cabeçalho não serve.
       *
       * O navegador escreve `application/octet-stream` no multipart com
       * frequência para arquivo vindo do disco — e a rota recusava um `.html`
       * legítimo com "Tipo não permitido: application/octet-stream". A pessoa
       * via o erro e não tinha o que fazer: o arquivo estava certo.
       */
      const mime = resolverMime(arquivo.filename, arquivo.mimetype);
      if (!mime) {
        return reply
          .code(400)
          .send({ error: `Tipo não permitido: ${arquivo.mimetype || "desconhecido"}` });
      }

      try {
        const r = await uploadDireto(storage(), {
          corpo: arquivo.file,
          // O mime RESOLVIDO vai para o bucket: é ele que o Supabase devolve
          // no `Content-Type`, e é ele que faz o navegador renderizar a página
          // em vez de baixá-la.
          mime,
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

  /**
   * A imagem de preview, quando da para usar.
   *
   * Devolve `undefined` em vez de lancar: a analise por texto funciona sem
   * imagem, e uma miniatura que nao baixou nao pode custar a catalogacao
   * inteira. Cinco megabytes de teto porque acima disso o custo do base64
   * nao se paga para uma imagem que e so contexto.
   */
  async function baixarPreview(
    url: string | null,
  ): Promise<{ buffer: Buffer; mimeType: string } | undefined> {
    if (!url) return undefined;
    try {
      const r = await fetch(url, { redirect: "follow" });
      const mime = (r.headers.get("content-type") ?? "").split(";")[0]!.trim();
      if (!r.ok || !podeAnalisar(mime) || mime === "application/pdf") return undefined;
      const buffer = Buffer.from(await r.arrayBuffer());
      return buffer.length > 0 && buffer.length <= 5 * 1024 * 1024
        ? { buffer, mimeType: mime }
        : undefined;
    } catch {
      return undefined;
    }
  }

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

    // O preview e buscado ANTES da analise: e ele que da titulo e descricao
    // para catalogar um link, que nao tem arquivo nenhum para o modelo ver.
    let og: Awaited<ReturnType<typeof fetchLinkPreview>> = {
      title: null,
      description: null,
      image: null,
      siteName: null,
    };
    let ogFetchedAt: Date | null = null;
    if (item.origem) {
      try {
        og = await fetchLinkPreview(item.origem);
        ogFetchedAt = new Date();
      } catch {
        /* segue sem preview */
      }
    }

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

    /**
     * Catalogar o que a IA nao consegue VER.
     *
     * Link nao tem arquivo e video ela nao le, entao os dois entravam sem
     * marca, nicho, formato nem tag -- e sem faceta a referencia existe mas
     * ninguem acha. Medido no acervo importado: 56 links e 21 videos, todos
     * com os cinco campos vazios.
     *
     * O material aqui e texto: o Open Graph da pagina, o endereco e a anotacao
     * de quem salvou -- que e a unica fonte que diz POR QUE aquilo foi salvo.
     * Quando o preview tem imagem, ela vai junto: numa landing page costuma ser
     * a propria dobra inicial, e ai o modelo para de depender so do endereco.
     */
    if (analisar && !sugestao && item.origem) {
      try {
        sugestao = await analisarLink(
          fastify.claude.client,
          {
            url: item.origem,
            titulo: og.title,
            descricao: og.description,
            siteName: og.siteName,
            notas: item.notas,
          },
          await baixarPreview(og.image),
        );
      } catch (err) {
        fastify.log.warn({ err, importKey: item.importKey }, "analise de link falhou");
      }
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
      ogTitle: og.title,
      ogDescription: og.description,
      ogImage: og.image,
      ogSiteName: og.siteName,
      ogFetchedAt,
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
