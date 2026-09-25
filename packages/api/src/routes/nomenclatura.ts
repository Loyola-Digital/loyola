/**
 * Epic 47 / Story 47.1 — API do dicionário da nomenclatura de campanhas.
 *
 * Tudo sob `/api/nomenclatura`. Seis recursos com o mesmo contrato
 * (`experts · produtos · funis · ofertas · lps · dicionario`) mais o changelog:
 *
 *   GET    /{recurso}?inativos=1            lista (com `usadoEm` por linha)
 *   GET    /{recurso}/proximo-codigo        sugestão no escopo (funis, ofertas, lps)
 *   POST   /{recurso}                       cria
 *   PATCH  /{recurso}/:id                   edita (código travado quando usado)
 *   DELETE /{recurso}/:id                   hard delete só sem referência
 *   POST   /{recurso}/:id/desativar|reativar
 *   GET    /experts/:id/impacto-da-desativacao
 *   GET    /changelog?entity=&entityId=&limit=
 *
 * ## Quem decide o quê
 *
 * As regras (mensagens, status, imutabilidade, coerência) estão em
 * `services/nomenclatura/regras.ts` e são puras. As consultas e TODA escrita
 * (com changelog) estão em `repositorio.ts`. Este arquivo só encadeia as duas:
 * carrega, decide, grava. Um handler que escreva direto no banco é defeito.
 *
 * ## Permissões (D3)
 *
 * `guest` recebe 403 em tudo. Qualquer outro papel lê e escreve — a spec não
 * fala de papel, e o dicionário é dado operacional do tráfego.
 *
 * ## Erros (AC15)
 *
 * `{ error, campo?, usadoEm?, referencias?, sugestao? }` — 400 zod/normalização,
 * 403 papel, 404 não achado, 409 conflito/uso/publicada, 422 coerência.
 */

import { z } from "zod";
import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { LPMIX, NA, PREFIXO_DA_PARTE_DO_VIDEO, PREFIXO_DA_VARIAVEL, ROTULO_DA_PARTE_DO_VIDEO, TIPO_DE_CODIGO_DA_PARTE_DO_VIDEO, TIPO_DE_CODIGO_DA_VARIAVEL, ehVideo, escopoDoNnDoCriativo, formatoDoVideoGravado, montarSlugDeLp, parseAdName, parseCampaignName, parseVslName, proximoCodigoNumerado, siglaSemNumero, sugerirClassificacao } from "@loyola-x/shared";
import { CAMPOS_DO_NOME, montarCampanha } from "../services/nomenclatura/campanhas.js";
import { CAMPOS_DA_VSL_NO_BANCO, montarVsl } from "../services/nomenclatura/vsl.js";
import { montarAnuncio, numeroDoLancamentoNoPatch, proximoNnDeAnuncio } from "../services/nomenclatura/anuncios.js";
import { coberturaDeGasto, invalidarMapa, mapaDeDimensoes } from "../services/nomenclatura/mapa-de-campanhas.js";
import { listarChangelog } from "../services/nomenclatura/changelog.js";
import { tabelaInexistente, violaUnicidade } from "../utils/db-errors.js";
import {
  ErroDeNomenclatura,
  codigoValidado,
  conflitoDeCodigo,
  exigirMesmoExpert,
  exigirNaoUsado,
  exigirSemReferencias,
  podeAcessar,
  rotuloDe,
  sugerirCodigo,
} from "../services/nomenclatura/regras.js";
import {
  criarRepositorio,
  type Entidade,
  type EntidadeAtivavel,
  type Repositorio,
  type TipoDeValor,
  type TipoDeVariavelDeVsl,
} from "../services/nomenclatura/repositorio.js";

declare module "fastify" {
  interface FastifyInstance {
    /** Só para teste: um repositório em memória no lugar do Drizzle. */
    nomenclaturaRepo?: Repositorio;
  }
}

const uuid = z.string().uuid();
const idParams = z.object({ id: uuid });
const listaQuery = z.object({
  inativos: z.enum(["1", "true", "0", "false"]).optional(),
  expertId: uuid.optional(),
  productId: uuid.optional(),
  funnelId: uuid.optional(),
  offerId: uuid.optional(),
  type: z.enum(["year", "temperature", "auction", "format", "creative_type", "launch_type", "creative_origin"]).optional(),
});
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD");

/** Story 47.10: `creative_type` e `launch_type` são os do nome de anúncio; o CRUD é o mesmo. Story 47.12: `creative_origin` (ia · h) idem. */
const TIPOS_DE_VALOR = ["year", "temperature", "auction", "format", "creative_type", "launch_type", "creative_origin"] as const;

export default fp(async function nomenclaturaRoutes(fastify) {
  const repo = (): Repositorio => fastify.nomenclaturaRepo ?? criarRepositorio(fastify.db);

  /** Cascata roda em transação; no teste (repositório injetado) roda direto. */
  async function emTransacao<T>(fn: (r: Repositorio) => Promise<T>): Promise<T> {
    if (fastify.nomenclaturaRepo) return fn(fastify.nomenclaturaRepo);
    return fastify.db.transaction((tx) => fn(criarRepositorio(tx)));
  }

  /** 403 para guest; devolve o autor (userId) para o changelog. */
  function autor(request: FastifyRequest): string {
    if (!podeAcessar(request.userRole)) {
      throw new ErroDeNomenclatura(403, "Convidados não acessam a nomenclatura.");
    }
    return request.userId!;
  }

  /** Envolve o handler: erro de domínio vira status + corpo; o resto sobe. */
  function tentar<T>(fn: (request: FastifyRequest, reply: FastifyReply) => Promise<T>) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return await fn(request, reply);
      } catch (e) {
        if (e instanceof ErroDeNomenclatura) return reply.code(e.status).send(e.corpo());
        // Gate do @qa (QA-471-01): a checagem "já existe?" e o INSERT não são
        // atômicos. Duas pessoas cadastrando `of03` ao mesmo tempo passam as
        // duas pela checagem e a segunda estoura o UNIQUE do banco — que é a
        // garantia de verdade (regra 4). Sem isto, isso virava 500 "Erro
        // interno" para quem só pediu um código que acabou de ser ocupado.
        if (violaUnicidade(e)) {
          return reply.code(409).send({ error: "Esse código acabou de ser cadastrado por outra pessoa. Recarregue a lista e escolha o próximo." });
        }
        // Banco sem as tabelas `naming_*`: a migration 0142 ainda não rodou aqui.
        // É estado de ambiente, não defeito — e a tela precisa dizer isso.
        if (tabelaInexistente(e)) {
          return reply.code(503).send({
            error: "As tabelas da nomenclatura ainda não existem neste banco — a migration 0142 não rodou aqui. Em produção ela entra no deploy da API.",
            codigo: "migration-pendente",
          });
        }
        throw e;
      }
    };
  }

  function parse<S extends z.ZodTypeAny>(schema: S, dado: unknown): z.infer<S> {
    const r = schema.safeParse(dado);
    if (!r.success) {
      const primeiro = r.error.issues[0];
      throw new ErroDeNomenclatura(400, `${primeiro?.path.join(".") || "corpo"}: ${primeiro?.message ?? "inválido"}`, {
        campo: primeiro?.path.join(".") || undefined,
      });
    }
    return r.data;
  }

  const querInativos = (q: { inativos?: string }) => q.inativos === "1" || q.inativos === "true";

  async function existente<E extends Entidade>(r: Repositorio, entidade: E, id: string, rotulo: string) {
    const linha = await r.porId(entidade, id);
    if (!linha) throw new ErroDeNomenclatura(404, `${rotulo} não encontrado`);
    return linha;
  }

  /** Story 47.5: um projeto tem no máximo um expert (é o que deduz o expert das legadas). */
  async function exigirProjetoLivre(r: Repositorio, projectId: string, expertId: string | null) {
    const dono = await r.experts.porProjeto(projectId);
    if (dono && dono.id !== expertId) {
      throw new ErroDeNomenclatura(409, `Este projeto já está vinculado ao expert ${dono.code}. Um projeto tem um expert só.`, { campo: "projectId" });
    }
  }

  // ─────────────────────────── experts ───────────────────────────
  fastify.get(
    "/api/nomenclatura/experts",
    tentar(async (request) => {
      autor(request);
      const q = parse(listaQuery, request.query);
      const r = repo();
      const [linhas, uso, contagens] = await Promise.all([
        r.experts.listar(querInativos(q)),
        r.usoPorFk("expertId"),
        r.experts.contagens(),
      ]);
      return linhas.map((e) => ({
        ...e,
        usadoEm: uso.get(e.id) ?? 0,
        produtos: contagens.produtos.get(e.id) ?? 0,
        funis: contagens.funis.get(e.id) ?? 0,
        ofertas: contagens.ofertas.get(e.id) ?? 0,
        lps: contagens.lps.get(e.id) ?? 0,
      }));
    }),
  );

  fastify.post(
    "/api/nomenclatura/experts",
    tentar(async (request, reply) => {
      const author = autor(request);
      const b = parse(z.object({ code: z.string(), name: z.string().trim().min(1).max(120), projectId: uuid.nullable().optional() }), request.body);
      const r = repo();
      const code = codigoValidado(b.code, "expert", "code");
      const ja = await r.experts.porCode(code);
      if (ja) throw conflitoDeCodigo({ codigo: code, escopo: "a base", descricaoExistente: ja.name, sugestao: null, campo: "code" });
      if (b.projectId) await exigirProjetoLivre(r, b.projectId, null);
      const linha = await r.inserir("experts", { code, name: b.name, projectId: b.projectId ?? null }, author);
      return reply.code(201).send({ ...linha, usadoEm: 0 });
    }),
  );

  fastify.patch(
    "/api/nomenclatura/experts/:id",
    tentar(async (request) => {
      const author = autor(request);
      const { id } = parse(idParams, request.params);
      const b = parse(z.object({ code: z.string().optional(), name: z.string().trim().min(1).max(120).optional(), projectId: uuid.nullable().optional() }), request.body);
      // Sigla imutável DESDE A CRIAÇÃO (spec § 4.1; decisão do @po na 47.1).
      if (b.code !== undefined) {
        throw new ErroDeNomenclatura(409, "A sigla do expert não muda depois de criada. Para outro significado, crie outro expert.", { campo: "code" });
      }
      const r = repo();
      const antes = await existente(r, "experts", id, "Expert");
      const patch: Partial<typeof antes> = {};
      if (b.name !== undefined) patch.name = b.name;
      if (b.projectId !== undefined) {
        if (b.projectId) await exigirProjetoLivre(r, b.projectId, id);
        patch.projectId = b.projectId;
      }
      if (Object.keys(patch).length === 0) return antes;
      return r.atualizar("experts", antes, patch, author);
    }),
  );

  fastify.get(
    "/api/nomenclatura/experts/:id/impacto-da-desativacao",
    tentar(async (request) => {
      autor(request);
      const { id } = parse(idParams, request.params);
      const r = repo();
      await existente(r, "experts", id, "Expert");
      const filhos = await r.experts.filhosAtivos(id);
      return { produtos: filhos.produtos.length, funis: filhos.funis.length, ofertas: filhos.ofertas.length, lps: filhos.lps.length, variaveisDeVsl: filhos.variaveisDeVsl.length, partesDoVideo: filhos.partesDoVideo.length };
    }),
  );

  fastify.post(
    "/api/nomenclatura/experts/:id/desativar",
    tentar(async (request) => {
      const author = autor(request);
      const { id } = parse(idParams, request.params);
      // Cascata (spec § 5): UMA linha de changelog por registro afetado — senão
      // reativar um produto sozinho depois não teria `before`.
      return emTransacao(async (r) => {
        const antes = await existente(r, "experts", id, "Expert");
        const filhos = await r.experts.filhosAtivos(id);
        for (const p of filhos.produtos) await r.alternarAtivo("produtos", p, false, author);
        for (const f of filhos.funis) await r.alternarAtivo("funis", f, false, author);
        for (const o of filhos.ofertas) await r.alternarAtivo("ofertas", o, false, author);
        for (const l of filhos.lps) await r.alternarAtivo("lps", l, false, author);
        for (const v of filhos.variaveisDeVsl) await r.alternarAtivo("vslVariaveis", v, false, author);
        for (const h of filhos.partesDoVideo) await r.alternarAtivo("adPartes", h, false, author);
        const depois = antes.active ? await r.alternarAtivo("experts", antes, false, author) : antes;
        return {
          ...depois,
          desativados: { produtos: filhos.produtos.length, funis: filhos.funis.length, ofertas: filhos.ofertas.length, lps: filhos.lps.length, variaveisDeVsl: filhos.variaveisDeVsl.length, partesDoVideo: filhos.partesDoVideo.length },
        };
      });
    }),
  );

  // ──────────────── contrato comum: reativar / excluir ────────────────
  const ENTIDADES: { entidade: EntidadeAtivavel; rota: string; rotulo: string }[] = [
    { entidade: "experts", rota: "experts", rotulo: "Expert" },
    { entidade: "produtos", rota: "produtos", rotulo: "Produto" },
    { entidade: "funis", rota: "funis", rotulo: "Funil" },
    { entidade: "ofertas", rota: "ofertas", rotulo: "Oferta" },
    { entidade: "lps", rota: "lps", rotulo: "LP" },
    { entidade: "dicionario", rota: "dicionario", rotulo: "Valor" },
    /** Story 47.9 */
    { entidade: "vslVariaveis", rota: "vsl/variaveis", rotulo: "Variável de VSL" },
    // Story 47.12: hooks e bodies do vídeo
    { entidade: "adPartes", rota: "ads/partes", rotulo: "Hook/body" },
  ];

  for (const { entidade, rota, rotulo } of ENTIDADES) {
    fastify.post(
      `/api/nomenclatura/${rota}/:id/reativar`,
      tentar(async (request) => {
        const author = autor(request);
        const { id } = parse(idParams, request.params);
        const r = repo();
        const antes = await existente(r, entidade, id, rotulo);
        return antes.active ? antes : r.alternarAtivo(entidade, antes, true, author);
      }),
    );

    // Expert tem o próprio `desativar` (cascata). Os outros são simples.
    if (entidade !== "experts") {
      fastify.post(
        `/api/nomenclatura/${rota}/:id/desativar`,
        tentar(async (request) => {
          const author = autor(request);
          const { id } = parse(idParams, request.params);
          const r = repo();
          const antes = await existente(r, entidade, id, rotulo);
          return antes.active ? r.alternarAtivo(entidade, antes, false, author) : antes;
        }),
      );
    }

    fastify.delete(
      `/api/nomenclatura/${rota}/:id`,
      tentar(async (request, reply) => {
        const author = autor(request);
        const { id } = parse(idParams, request.params);
        const r = repo();
        const antes = await existente(r, entidade, id, rotulo);
        const referencias = await r.referenciasDe(entidade, antes as { id: string; type?: TipoDeValor | TipoDeVariavelDeVsl; value?: string });
        exigirSemReferencias(referencias);
        await r.excluir(entidade, antes, author);
        return reply.code(204).send();
      }),
    );
  }

  // ─────────────────────────── produtos ───────────────────────────
  fastify.get(
    "/api/nomenclatura/produtos",
    tentar(async (request) => {
      autor(request);
      const q = parse(listaQuery, request.query);
      const r = repo();
      // Story 47.9 (gate QA-479-01): o slug do produto entra no nome da VSL — VSL conta como uso.
      const [linhas, uso, usoVsl] = await Promise.all([r.produtos.listar(q.expertId, querInativos(q)), r.usoPorFk("productId"), r.usoEmVsls("productId")]);
      return linhas.map((p) => ({ ...p, usadoEm: (uso.get(p.id) ?? 0) + (usoVsl.get(p.id) ?? 0) }));
    }),
  );

  fastify.post(
    "/api/nomenclatura/produtos",
    tentar(async (request, reply) => {
      const author = autor(request);
      const b = parse(
        z.object({ expertId: uuid, slug: z.string(), name: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).optional() }),
        request.body,
      );
      const r = repo();
      const expert = await existente(r, "experts", b.expertId, "Expert");
      const slug = codigoValidado(b.slug, "produto", "slug");
      const ja = await r.produtos.porSlug(expert.id, slug);
      if (ja) throw conflitoDeCodigo({ codigo: slug, escopo: expert.code, descricaoExistente: ja.name, sugestao: null, campo: "slug" });
      const linha = await r.inserir("produtos", { expertId: expert.id, slug, name: b.name, description: b.description ?? null }, author);
      return reply.code(201).send({ ...linha, usadoEm: 0 });
    }),
  );

  fastify.patch(
    "/api/nomenclatura/produtos/:id",
    tentar(async (request) => {
      const author = autor(request);
      const { id } = parse(idParams, request.params);
      const b = parse(
        z.object({ slug: z.string().optional(), name: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(2000).nullable().optional() }),
        request.body,
      );
      const r = repo();
      const antes = await existente(r, "produtos", id, "Produto");
      const patch: Partial<typeof antes> = {};
      if (b.slug !== undefined) {
        const slug = codigoValidado(b.slug, "produto", "slug");
        if (slug !== antes.slug) {
          exigirNaoUsado((await r.campanhasQueUsam("productId", id)) + (await r.vslsQueUsam("productId", id)), "slug");
          const ja = await r.produtos.porSlug(antes.expertId, slug);
          if (ja) throw conflitoDeCodigo({ codigo: slug, escopo: "este expert", descricaoExistente: ja.name, sugestao: null, campo: "slug" });
          patch.slug = slug;
        }
      }
      if (b.name !== undefined) patch.name = b.name;
      if (b.description !== undefined) patch.description = b.description;
      if (Object.keys(patch).length === 0) return antes;
      return r.atualizar("produtos", antes, patch, author);
    }),
  );

  // ─────────────────── funis e ofertas (mesmo contrato) ───────────────────
  for (const cfg of [
    { entidade: "funis" as const, tipo: "funil" as const, coluna: "funnelId" as const, rotulo: "Funil" },
    { entidade: "ofertas" as const, tipo: "oferta" as const, coluna: "offerId" as const, rotulo: "Oferta" },
  ]) {
    const acesso = (r: Repositorio) => (cfg.entidade === "funis" ? r.funis : r.ofertas);

    fastify.get(
      `/api/nomenclatura/${cfg.entidade}`,
      tentar(async (request) => {
        autor(request);
        const q = parse(listaQuery, request.query);
        const r = repo();
        // Story 47.9 (AC3): a oferta é o pitch da VSL — VSL conta como uso da oferta.
        const [linhas, uso, usoVsl] = await Promise.all([acesso(r).listar(q.expertId, querInativos(q)), r.usoPorFk(cfg.coluna), cfg.entidade === "ofertas" ? r.usoEmVsls("offerId") : Promise.resolve(new Map<string, number>())]);
        return linhas.map((l) => ({ ...l, rotulo: rotuloDe(l.code, l.description), usadoEm: (uso.get(l.id) ?? 0) + (usoVsl.get(l.id) ?? 0) }));
      }),
    );

    fastify.get(
      `/api/nomenclatura/${cfg.entidade}/proximo-codigo`,
      tentar(async (request) => {
        autor(request);
        const q = parse(z.object({ expertId: uuid }), request.query);
        const r = repo();
        await existente(r, "experts", q.expertId, "Expert");
        return { codigo: sugerirCodigo(cfg.tipo, await acesso(r).codigos(q.expertId)) };
      }),
    );

    fastify.post(
      `/api/nomenclatura/${cfg.entidade}`,
      tentar(async (request, reply) => {
        const author = autor(request);
        const b = parse(
          z.object({ expertId: uuid, code: z.string().optional(), description: z.string().trim().min(1).max(2000), startedAt: dataIso.optional() }),
          request.body,
        );
        const r = repo();
        const expert = await existente(r, "experts", b.expertId, "Expert");
        const codigos = await acesso(r).codigos(expert.id);
        const sugestao = sugerirCodigo(cfg.tipo, codigos);
        const code = b.code !== undefined ? codigoValidado(b.code, cfg.tipo, "code") : sugestao;
        if (!code) throw new ErroDeNomenclatura(409, `Sequência de ${cfg.rotulo.toLowerCase()} esgotada para ${expert.code} (99 códigos).`, { campo: "code" });
        const ja = await acesso(r).porCode(expert.id, code);
        if (ja) throw conflitoDeCodigo({ codigo: code, escopo: expert.code, descricaoExistente: ja.description, sugestao, campo: "code" });
        const linha = await r.inserir(
          cfg.entidade,
          { expertId: expert.id, code, description: b.description, ...(b.startedAt ? { startedAt: b.startedAt } : {}) },
          author,
        );
        return reply.code(201).send({ ...linha, rotulo: rotuloDe(linha.code, linha.description), usadoEm: 0 });
      }),
    );

    fastify.patch(
      `/api/nomenclatura/${cfg.entidade}/:id`,
      tentar(async (request) => {
        const author = autor(request);
        const { id } = parse(idParams, request.params);
        const b = parse(
          z.object({ code: z.string().optional(), description: z.string().trim().min(1).max(2000).optional(), startedAt: dataIso.optional() }),
          request.body,
        );
        const r = repo();
        const antes = await existente(r, cfg.entidade, id, cfg.rotulo);
        const patch: Partial<typeof antes> = {};
        if (b.code !== undefined) {
          const code = codigoValidado(b.code, cfg.tipo, "code");
          if (code !== antes.code) {
            exigirNaoUsado((await r.campanhasQueUsam(cfg.coluna, id)) + (cfg.entidade === "ofertas" ? await r.vslsQueUsam("offerId", id) : 0), "code");
            const ja = await acesso(r).porCode(antes.expertId, code);
            if (ja) {
              const sugestao = sugerirCodigo(cfg.tipo, await acesso(r).codigos(antes.expertId));
              throw conflitoDeCodigo({ codigo: code, escopo: "este expert", descricaoExistente: ja.description, sugestao, campo: "code" });
            }
            patch.code = code;
          }
        }
        if (b.description !== undefined) patch.description = b.description;
        if (b.startedAt !== undefined) patch.startedAt = b.startedAt;
        if (Object.keys(patch).length === 0) return { ...antes, rotulo: rotuloDe(antes.code, antes.description) };
        const depois = await r.atualizar(cfg.entidade, antes, patch, author);
        return { ...depois, rotulo: rotuloDe(depois.code, depois.description) };
      }),
    );
  }

  // ─────────────────────────── LPs ───────────────────────────
  const combinacaoSchema = z.object({ expertId: uuid, productId: uuid, funnelId: uuid, offerId: uuid });

  /** Carrega produto/funil/oferta e exige que sejam do expert (spec § 5). */
  async function combinacaoCoerente(r: Repositorio, c: z.infer<typeof combinacaoSchema>) {
    const expert = await existente(r, "experts", c.expertId, "Expert");
    const [produto, funil, oferta] = await Promise.all([r.porId("produtos", c.productId), r.porId("funis", c.funnelId), r.porId("ofertas", c.offerId)]);
    exigirMesmoExpert(expert.id, [
      { campo: "productId", expertId: produto?.expertId, rotulo: "produto" },
      { campo: "funnelId", expertId: funil?.expertId, rotulo: "funil" },
      { campo: "offerId", expertId: oferta?.expertId, rotulo: "oferta" },
    ]);
    return { expert, produto: produto!, funil: funil!, oferta: oferta! };
  }

  fastify.get(
    "/api/nomenclatura/lps",
    tentar(async (request) => {
      autor(request);
      const q = parse(listaQuery, request.query);
      const r = repo();
      const [linhas, uso] = await Promise.all([
        r.lps.listar({ expertId: q.expertId, productId: q.productId, funnelId: q.funnelId, offerId: q.offerId }, querInativos(q)),
        r.usoPorFk("landingPageId"),
      ]);
      return linhas.map((l) => ({ ...l, rotulo: `${l.code} — ${l.slug}`, usadoEm: uso.get(l.id) ?? 0 }));
    }),
  );

  fastify.get(
    "/api/nomenclatura/lps/proximo-codigo",
    tentar(async (request) => {
      autor(request);
      const c = parse(combinacaoSchema, request.query);
      const r = repo();
      const { expert, produto, funil, oferta } = await combinacaoCoerente(r, c);
      const codigo = sugerirCodigo("lp", await r.lps.codigos(c));
      return {
        codigo,
        slug: codigo ? montarSlugDeLp({ expert: expert.code, produto: produto.slug, funil: funil.code, oferta: oferta.code, lp: codigo }) : null,
      };
    }),
  );

  fastify.post(
    "/api/nomenclatura/lps",
    tentar(async (request, reply) => {
      const author = autor(request);
      const b = parse(
        combinacaoSchema.extend({ code: z.string().optional(), url: z.string().trim().url().max(2000).optional(), description: z.string().trim().max(2000).optional() }),
        request.body,
      );
      const r = repo();
      const { expert, produto, funil, oferta } = await combinacaoCoerente(r, b);
      const codigos = await r.lps.codigos(b);
      const sugestao = sugerirCodigo("lp", codigos);
      const code = b.code !== undefined ? codigoValidado(b.code, "lp", "code") : sugestao;
      if (!code) throw new ErroDeNomenclatura(409, "Sequência de LPs esgotada nesta combinação (lpa…lpz).", { campo: "code" });
      const ja = await r.lps.porCode(b, code);
      if (ja) throw conflitoDeCodigo({ codigo: code, escopo: `${expert.code}/${produto.slug}/${funil.code}/${oferta.code}`, descricaoExistente: ja.description ?? ja.slug, sugestao, campo: "code" });
      // Slug GERADO — o `slug` do body, se vier, é ignorado (AC11).
      const slug = montarSlugDeLp({ expert: expert.code, produto: produto.slug, funil: funil.code, oferta: oferta.code, lp: code });
      const linha = await r.inserir(
        "lps",
        { expertId: expert.id, productId: produto.id, funnelId: funil.id, offerId: oferta.id, code, slug, url: b.url ?? null, description: b.description ?? null },
        author,
      );
      return reply.code(201).send({ ...linha, rotulo: `${linha.code} — ${linha.slug}`, usadoEm: 0 });
    }),
  );

  fastify.patch(
    "/api/nomenclatura/lps/:id",
    tentar(async (request) => {
      const author = autor(request);
      const { id } = parse(idParams, request.params);
      const b = parse(
        z.object({ code: z.string().optional(), url: z.string().trim().url().max(2000).nullable().optional(), description: z.string().trim().max(2000).nullable().optional() }),
        request.body,
      );
      const r = repo();
      const antes = await existente(r, "lps", id, "LP");
      const patch: Partial<typeof antes> = {};
      if (b.code !== undefined) {
        const code = codigoValidado(b.code, "lp", "code");
        if (code !== antes.code) {
          exigirNaoUsado(await r.campanhasQueUsam("landingPageId", id), "code");
          const ja = await r.lps.porCode(antes, code);
          if (ja) throw conflitoDeCodigo({ codigo: code, escopo: "esta combinação", descricaoExistente: ja.description ?? ja.slug, sugestao: sugerirCodigo("lp", await r.lps.codigos(antes)), campo: "code" });
          const { expert, produto, funil, oferta } = await combinacaoCoerente(r, antes);
          patch.code = code;
          patch.slug = montarSlugDeLp({ expert: expert.code, produto: produto.slug, funil: funil.code, oferta: oferta.code, lp: code });
        }
      }
      if (b.url !== undefined) patch.url = b.url;
      if (b.description !== undefined) patch.description = b.description;
      if (Object.keys(patch).length === 0) return antes;
      return r.atualizar("lps", antes, patch, author);
    }),
  );

  // ─────────────────────────── valores fixos ───────────────────────────
  fastify.get(
    "/api/nomenclatura/dicionario",
    tentar(async (request) => {
      autor(request);
      const q = parse(listaQuery, request.query);
      const r = repo();
      const linhas = await r.dicionario.listar(q.type, querInativos(q));
      const tipos = q.type ? [q.type] : TIPOS_DE_VALOR;
      const usos = new Map(await Promise.all(tipos.map(async (t) => [t, await r.usoPorValor(t)] as const)));
      return linhas.map((v) => ({ ...v, usadoEm: usos.get(v.type)?.get(v.value) ?? 0 }));
    }),
  );

  fastify.post(
    "/api/nomenclatura/dicionario",
    tentar(async (request, reply) => {
      const author = autor(request);
      const b = parse(
        z.object({ type: z.enum(TIPOS_DE_VALOR), value: z.string(), description: z.string().trim().max(500).optional(), sortOrder: z.number().int().min(0).max(9999).optional() }),
        request.body,
      );
      const r = repo();
      const value = codigoValidado(b.value, "valor", "value");
      const ja = await r.dicionario.porValor(b.type, value);
      if (ja) throw conflitoDeCodigo({ codigo: value, escopo: b.type, descricaoExistente: ja.description, sugestao: null, campo: "value" });
      const linha = await r.inserir("dicionario", { type: b.type, value, description: b.description ?? null, sortOrder: b.sortOrder ?? 0 }, author);
      return reply.code(201).send({ ...linha, usadoEm: 0 });
    }),
  );

  fastify.patch(
    "/api/nomenclatura/dicionario/:id",
    tentar(async (request) => {
      const author = autor(request);
      const { id } = parse(idParams, request.params);
      const b = parse(
        z.object({ value: z.string().optional(), description: z.string().trim().max(500).nullable().optional(), sortOrder: z.number().int().min(0).max(9999).optional() }),
        request.body,
      );
      const r = repo();
      const antes = await existente(r, "dicionario", id, "Valor");
      const patch: Partial<typeof antes> = {};
      if (b.value !== undefined) {
        const value = codigoValidado(b.value, "valor", "value");
        if (value !== antes.value) {
          exigirNaoUsado(await r.campanhasComValor(antes.type, antes.value), "value");
          const ja = await r.dicionario.porValor(antes.type, value);
          if (ja) throw conflitoDeCodigo({ codigo: value, escopo: antes.type, descricaoExistente: ja.description, sugestao: null, campo: "value" });
          patch.value = value;
        }
      }
      if (b.description !== undefined) patch.description = b.description;
      if (b.sortOrder !== undefined) patch.sortOrder = b.sortOrder;
      if (Object.keys(patch).length === 0) return antes;
      return r.atualizar("dicionario", antes, patch, author);
    }),
  );

  // ─────────────────── snapshot, campanhas e validador (Story 47.3) ───────────────────
  fastify.get(
    "/api/nomenclatura/dicionario/snapshot",
    tentar(async (request) => {
      autor(request);
      const q = parse(z.object({ inativos: z.enum(["1", "true", "0", "false"]).optional() }), request.query);
      return repo().snapshot(querInativos(q));
    }),
  );

  fastify.post(
    "/api/nomenclatura/validar-nome",
    tentar(async (request) => {
      autor(request);
      const b = parse(z.object({ name: z.string().max(300) }), request.body);
      const r = repo();
      // COM inativos: nome antigo continua legível (regra 4); o resultado traz avisos.
      const resultado = parseCampaignName(b.name, await r.snapshot(true));
      // Story 47.5: nome antigo do Meta já classificado — inválido como nome novo, mas reconhecido.
      const legado = resultado.valid ? undefined : await r.legadas.porNomeAntigo(b.name.trim());
      return legado ? { ...resultado, legado: { campanhaId: legado.id, name: legado.name } } : resultado;
    }),
  );

  const campanhaSchema = z.object({
    expertId: uuid,
    productId: uuid,
    funnelId: uuid,
    offerId: uuid.nullable(),
    landingPageId: uuid.nullable(),
    lpValue: z.enum([LPMIX, NA]).optional(),
    year: z.string().min(1).max(20),
    temperature: z.string().min(1).max(20),
    auction: z.string().min(1).max(20),
    format: z.string().min(1).max(20),
    suffix: z.string().regex(/^v\d{2}$/, "sufixo no formato vNN").nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    metaCampaignId: z.string().trim().max(40).nullable().optional(),
  });

  /** Rótulos para a listagem — códigos em vez de ids. */
  async function rotulosDeCampanhas(r: Repositorio) {
    const [ex, pr, fu, of, lp] = await Promise.all([r.experts.listar(true), r.produtos.listar(undefined, true), r.funis.listar(undefined, true), r.ofertas.listar(undefined, true), r.lps.listar({}, true)]);
    const mapa = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const m = { ex: mapa(ex), pr: mapa(pr), fu: mapa(fu), of: mapa(of), lp: mapa(lp) };
    return (c: { expertId: string; productId: string; funnelId: string; offerId: string | null; landingPageId: string | null; offerValue: string }) => ({
      expertCode: m.ex.get(c.expertId)?.code ?? "?",
      productSlug: m.pr.get(c.productId)?.slug ?? "?",
      funnelRotulo: (() => { const f = m.fu.get(c.funnelId); return f ? rotuloDe(f.code, f.description) : "?"; })(),
      offerRotulo: (() => { if (!c.offerId) return `${c.offerValue} — a campanha carrega mais de uma oferta`; const o = m.of.get(c.offerId); return o ? rotuloDe(o.code, o.description) : "?"; })(),
      lpSlug: c.landingPageId ? (m.lp.get(c.landingPageId)?.slug ?? "?") : null,
    });
  }

  fastify.get(
    "/api/nomenclatura/campanhas",
    tentar(async (request) => {
      autor(request);
      const q = parse(
        z.object({
          expertId: uuid.optional(),
          productId: uuid.optional(),
          funnelId: uuid.optional(),
          offerId: uuid.optional(),
          year: z.string().max(20).optional(),
          q: z.string().max(200).optional(),
          publicada: z.enum(["1", "0"]).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        request.query,
      );
      const r = repo();
      const [{ itens, total }, rotulos] = await Promise.all([
        r.campanhas.listar({ ...q, publicada: q.publicada === undefined ? undefined : q.publicada === "1" }),
        rotulosDeCampanhas(r),
      ]);
      return { itens: itens.map((c) => ({ ...c, ...rotulos(c) })), total };
    }),
  );

  fastify.get(
    "/api/nomenclatura/campanhas/:id",
    tentar(async (request) => {
      autor(request);
      const { id } = parse(idParams, request.params);
      const r = repo();
      const c = await existente(r, "campanhas", id, "Campanha");
      return { ...c, ...(await rotulosDeCampanhas(r))(c) };
    }),
  );

  fastify.post(
    "/api/nomenclatura/campanhas",
    tentar(async (request, reply) => {
      const author = autor(request);
      const b = parse(campanhaSchema, request.body);
      const r = repo();
      const m = await montarCampanha(r, b);
      const linha = await r.inserir(
        "campanhas",
        { ...m, fields: undefined, notes: b.notes ?? null, metaCampaignId: b.metaCampaignId ?? null, createdBy: author } as never,
        author,
      );
      invalidarMapa();
      return reply.code(201).send({ ...linha, ...(await rotulosDeCampanhas(r))(linha) });
    }),
  );

  fastify.patch(
    "/api/nomenclatura/campanhas/:id",
    tentar(async (request) => {
      const author = autor(request);
      const { id } = parse(idParams, request.params);
      const b = parse(campanhaSchema.partial(), request.body);
      const r = repo();
      const antes = await existente(r, "campanhas", id, "Campanha");
      // Regra 6: publicada não muda de nome. Só notas e id da Meta seguem editáveis.
      const mexeNoNome = CAMPOS_DO_NOME.some((c) => b[c] !== undefined && b[c] !== (antes as Record<string, unknown>)[c]);
      if (antes.publishedAt && mexeNoNome) {
        throw new ErroDeNomenclatura(409, "Campanha publicada: o nome está congelado na Meta. Duplique para criar outra.", { campo: "name" });
      }
      const patch: Record<string, unknown> = {};
      if (mexeNoNome) {
        const m = await montarCampanha(r, {
          expertId: b.expertId ?? antes.expertId,
          productId: b.productId ?? antes.productId,
          funnelId: b.funnelId ?? antes.funnelId,
          offerId: b.offerId === undefined ? antes.offerId : b.offerId,
          landingPageId: b.landingPageId === undefined ? antes.landingPageId : b.landingPageId,
          lpValue: (b.lpValue ?? (antes.landingPageId ? undefined : (antes.lpValue as typeof LPMIX | typeof NA))) as typeof LPMIX | typeof NA | undefined,
          year: b.year ?? antes.year,
          temperature: b.temperature ?? antes.temperature,
          auction: b.auction ?? antes.auction,
          format: b.format ?? antes.format,
          suffix: b.suffix === undefined ? antes.suffix : b.suffix,
        });
        Object.assign(patch, { ...m, fields: undefined });
      }
      if (b.notes !== undefined) patch.notes = b.notes;
      if (b.metaCampaignId !== undefined) patch.metaCampaignId = b.metaCampaignId;
      if (Object.keys(patch).length === 0) return { ...antes, ...(await rotulosDeCampanhas(r))(antes) };
      const depois = await r.atualizar("campanhas", antes, patch as never, author);
      invalidarMapa();
      return { ...depois, ...(await rotulosDeCampanhas(r))(depois) };
    }),
  );

  fastify.post(
    "/api/nomenclatura/campanhas/:id/publicar",
    tentar(async (request) => {
      const author = autor(request);
      const { id } = parse(idParams, request.params);
      const b = parse(z.object({ metaCampaignId: z.string().trim().max(40).optional() }).optional().default({}), request.body ?? {});
      const r = repo();
      const antes = await existente(r, "campanhas", id, "Campanha");
      if (antes.publishedAt) return antes;
      return r.atualizar("campanhas", antes, { publishedAt: new Date(), ...(b.metaCampaignId ? { metaCampaignId: b.metaCampaignId } : {}) } as never, author, "publish");
    }),
  );

  // ─────────────────────────── Story 47.9: Nome de VSL ───────────────────────────
  const tipoDeVariavel = z.enum(["lead", "problem", "solution"]);
  const ROTULO_DA_VARIAVEL: Record<TipoDeVariavelDeVsl, string> = { lead: "Lead", problem: "Mecanismo do problema", solution: "Mecanismo da solução" };

  fastify.get(
    "/api/nomenclatura/vsl/variaveis",
    tentar(async (request) => {
      autor(request);
      const q = parse(z.object({ inativos: z.enum(["1", "true", "0", "false"]).optional(), expertId: uuid.optional(), type: tipoDeVariavel.optional() }), request.query);
      const r = repo();
      const [linhas, lead, problem, solution] = await Promise.all([
        r.vslVariaveis.listar({ expertId: q.expertId, type: q.type }, querInativos(q)),
        r.usoEmVsls("leadId"),
        r.usoEmVsls("problemId"),
        r.usoEmVsls("solutionId"),
      ]);
      const uso = { lead, problem, solution };
      return linhas.map((v) => ({ ...v, rotulo: rotuloDe(v.code, v.description), usadoEm: uso[v.type].get(v.id) ?? 0 }));
    }),
  );

  /** Sugestão de código por (expert, tipo): `lead01`, `pr01`, `sol01` — o menor livre, inativos inclusos (decisão do dono, 2026-09-10). */
  fastify.get(
    "/api/nomenclatura/vsl/variaveis/proximo-codigo",
    tentar(async (request) => {
      autor(request);
      const q = parse(z.object({ expertId: uuid, type: tipoDeVariavel }), request.query);
      const r = repo();
      await existente(r, "experts", q.expertId, "Expert");
      return { codigo: proximoCodigoNumerado(PREFIXO_DA_VARIAVEL[q.type], await r.vslVariaveis.codigos(q.expertId, q.type)) };
    }),
  );

  fastify.post(
    "/api/nomenclatura/vsl/variaveis",
    tentar(async (request, reply) => {
      const author = autor(request);
      const b = parse(z.object({ expertId: uuid, type: tipoDeVariavel, code: z.string().optional(), description: z.string().trim().min(1).max(2000) }), request.body);
      const r = repo();
      const expert = await existente(r, "experts", b.expertId, "Expert");
      const codigos = await r.vslVariaveis.codigos(expert.id, b.type);
      const sugestao = proximoCodigoNumerado(PREFIXO_DA_VARIAVEL[b.type], codigos);
      const code = b.code !== undefined && b.code !== "" ? codigoValidado(b.code, TIPO_DE_CODIGO_DA_VARIAVEL[b.type], "code") : sugestao;
      if (!code) throw new ErroDeNomenclatura(409, `Sequência de ${ROTULO_DA_VARIAVEL[b.type].toLowerCase()} esgotada para ${expert.code} (99 códigos).`, { campo: "code" });
      const ja = await r.vslVariaveis.porCode(expert.id, b.type, code);
      if (ja) throw conflitoDeCodigo({ codigo: code, escopo: `${expert.code} (${ROTULO_DA_VARIAVEL[b.type].toLowerCase()})`, descricaoExistente: ja.description, sugestao, campo: "code" });
      const linha = await r.inserir("vslVariaveis", { expertId: expert.id, type: b.type, code, description: b.description }, author);
      return reply.code(201).send({ ...linha, rotulo: rotuloDe(linha.code, linha.description), usadoEm: 0 });
    }),
  );

  fastify.patch(
    "/api/nomenclatura/vsl/variaveis/:id",
    tentar(async (request) => {
      const author = autor(request);
      const { id } = parse(idParams, request.params);
      const b = parse(z.object({ code: z.string().optional(), description: z.string().trim().min(1).max(2000).optional() }), request.body);
      const r = repo();
      const antes = await existente(r, "vslVariaveis", id, "Variável de VSL");
      const patch: Partial<typeof antes> = {};
      if (b.code !== undefined) {
        const code = codigoValidado(b.code, TIPO_DE_CODIGO_DA_VARIAVEL[antes.type], "code");
        if (code !== antes.code) {
          const coluna = ({ lead: "leadId", problem: "problemId", solution: "solutionId" } as const)[antes.type];
          exigirNaoUsado(await r.vslsQueUsam(coluna, id), "code");
          const ja = await r.vslVariaveis.porCode(antes.expertId, antes.type, code);
          if (ja) {
            const sugestao = proximoCodigoNumerado(PREFIXO_DA_VARIAVEL[antes.type], await r.vslVariaveis.codigos(antes.expertId, antes.type));
            throw conflitoDeCodigo({ codigo: code, escopo: "este expert", descricaoExistente: ja.description, sugestao, campo: "code" });
          }
          patch.code = code;
        }
      }
      if (b.description !== undefined) patch.description = b.description;
      if (Object.keys(patch).length === 0) return { ...antes, rotulo: rotuloDe(antes.code, antes.description) };
      const depois = await r.atualizar("vslVariaveis", antes, patch, author);
      return { ...depois, rotulo: rotuloDe(depois.code, depois.description) };
    }),
  );

  fastify.get(
    "/api/nomenclatura/vsl/snapshot",
    tentar(async (request) => {
      autor(request);
      const q = parse(z.object({ inativos: z.enum(["1", "true", "0", "false"]).optional() }), request.query);
      return repo().snapshotDeVsl(querInativos(q));
    }),
  );

  fastify.post(
    "/api/nomenclatura/vsl/validar-nome",
    tentar(async (request) => {
      autor(request);
      const b = parse(z.object({ name: z.string().max(300) }), request.body);
      // COM inativos: nome antigo continua legível (regra 4).
      return parseVslName(b.name, await repo().snapshotDeVsl(true));
    }),
  );

  const vslSchema = z.object({
    expertId: uuid,
    productId: uuid,
    leadId: uuid,
    problemId: uuid,
    solutionId: uuid,
    offerId: uuid,
    /** Link da VSL no Drive (pedido do dono, 2026-09-10). Opcional. */
    url: z.string().trim().url().max(2000).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  });

  /** Rótulos para a listagem — códigos em vez de ids. */
  async function rotulosDeVsls(r: Repositorio) {
    const [ex, pr, of, va] = await Promise.all([r.experts.listar(true), r.produtos.listar(undefined, true), r.ofertas.listar(undefined, true), r.vslVariaveis.listar({}, true)]);
    const mapa = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const m = { ex: mapa(ex), pr: mapa(pr), of: mapa(of), va: mapa(va) };
    const variavel = (id: string) => { const v = m.va.get(id); return v ? rotuloDe(v.code, v.description) : "?"; };
    return (v: { expertId: string; productId: string; leadId: string; problemId: string; solutionId: string; offerId: string }) => ({
      expertCode: m.ex.get(v.expertId)?.code ?? "?",
      productSlug: m.pr.get(v.productId)?.slug ?? "?",
      leadRotulo: variavel(v.leadId),
      problemRotulo: variavel(v.problemId),
      solutionRotulo: variavel(v.solutionId),
      offerRotulo: (() => { const o = m.of.get(v.offerId); return o ? rotuloDe(o.code, o.description) : "?"; })(),
    });
  }

  fastify.get(
    "/api/nomenclatura/vsl/vsls",
    tentar(async (request) => {
      autor(request);
      const q = parse(
        z.object({
          expertId: uuid.optional(),
          productId: uuid.optional(),
          offerId: uuid.optional(),
          q: z.string().max(200).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        request.query,
      );
      const r = repo();
      const [{ itens, total }, rotulos] = await Promise.all([r.vsls.listar(q), rotulosDeVsls(r)]);
      return { itens: itens.map((v) => ({ ...v, ...rotulos(v) })), total };
    }),
  );

  fastify.get(
    "/api/nomenclatura/vsl/vsls/:id",
    tentar(async (request) => {
      autor(request);
      const { id } = parse(idParams, request.params);
      const r = repo();
      const v = await existente(r, "vsls", id, "VSL");
      return { ...v, ...(await rotulosDeVsls(r))(v) };
    }),
  );

  fastify.post(
    "/api/nomenclatura/vsl/vsls",
    tentar(async (request, reply) => {
      const author = autor(request);
      const b = parse(vslSchema, request.body);
      const r = repo();
      const m = await montarVsl(r, b);
      // D18: sem sufixo — mesma combinação é a mesma VSL.
      const ja = await r.vsls.porNome(m.name);
      if (ja) throw new ErroDeNomenclatura(409, `Já existe uma VSL com este nome: ${m.name}. Duas VSLs com a mesma combinação são a mesma VSL.`, { campo: "name", vslId: ja.id });
      const linha = await r.inserir("vsls", { ...m, fields: undefined, url: b.url ?? null, notes: b.notes ?? null, createdBy: author } as never, author);
      return reply.code(201).send({ ...linha, ...(await rotulosDeVsls(r))(linha) });
    }),
  );

  fastify.patch(
    "/api/nomenclatura/vsl/vsls/:id",
    tentar(async (request) => {
      const author = autor(request);
      const { id } = parse(idParams, request.params);
      const b = parse(vslSchema.partial(), request.body);
      const r = repo();
      const antes = await existente(r, "vsls", id, "VSL");
      const mexeNoNome = CAMPOS_DA_VSL_NO_BANCO.some((c) => b[c] !== undefined && b[c] !== antes[c]);
      const patch: Record<string, unknown> = {};
      if (mexeNoNome) {
        const m = await montarVsl(r, {
          expertId: b.expertId ?? antes.expertId,
          productId: b.productId ?? antes.productId,
          leadId: b.leadId ?? antes.leadId,
          problemId: b.problemId ?? antes.problemId,
          solutionId: b.solutionId ?? antes.solutionId,
          offerId: b.offerId ?? antes.offerId,
        });
        const ja = await r.vsls.porNome(m.name);
        if (ja && ja.id !== id) throw new ErroDeNomenclatura(409, `Já existe uma VSL com este nome: ${m.name}.`, { campo: "name", vslId: ja.id });
        Object.assign(patch, { ...m, fields: undefined });
      }
      if (b.url !== undefined) patch.url = b.url;
      if (b.notes !== undefined) patch.notes = b.notes;
      if (Object.keys(patch).length === 0) return { ...antes, ...(await rotulosDeVsls(r))(antes) };
      const depois = await r.atualizar("vsls", antes, patch as never, author);
      return { ...depois, ...(await rotulosDeVsls(r))(depois) };
    }),
  );
  // ─────────────────────────── Story 47.10: Nome de anúncio ───────────────────────────
  const mmAaaa = z.string().regex(/^(0[1-9]|1[0-2])-\d{4}$/, "data no formato mm-aaaa");
  const anuncioSchema = z.object({
    expertId: uuid,
    creativeType: z.string().min(1).max(20),
    creativeSeq: z.number().int().min(1).max(99).nullable().optional(),
    launchType: z.string().min(1).max(20),
    // Story 47.16 (AC6): ausente/null com `perpetuo` (e só com ela — o serviço decide pela sigla, com 400 no campo)
    launchSeq: z.number().int().min(1).max(99).nullable().optional(),
    date: mmAaaa,
    description: z.string().trim().max(200).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    // Story 47.13: só em adv (o serviço recusa fora dele)
    origin: z.string().trim().max(20).nullable().optional(),
    hookId: uuid.nullable().optional(),
    bodyId: uuid.nullable().optional(),
  });

  /** Story 47.13: além do expert, os códigos do hook/body (a lista mostra hNN/bNN, não ids) e a marca de padrão antigo. */
  const rotulosDeAnuncio = (r: Repositorio) => async (a: { expertId: string; creativeType: string; origin?: string | null; hookId?: string | null; bodyId?: string | null }) => ({
    expertCode: (await r.porId("experts", a.expertId))?.code ?? "?",
    hookCode: a.hookId ? ((await r.porId("adPartes", a.hookId))?.code ?? null) : null,
    bodyCode: a.bodyId ? ((await r.porId("adPartes", a.bodyId))?.code ?? null) : null,
    legado: ehVideo(a.creativeType) && !a.origin,
  });

  // ── Story 47.12: hooks e bodies do vídeo (molde literal de vsl/variaveis) ──
  const tipoDeParte = z.enum(["hook", "body"]);

  fastify.get(
    "/api/nomenclatura/ads/partes",
    tentar(async (request) => {
      autor(request);
      const q = parse(z.object({ inativos: z.enum(["1", "true", "0", "false"]).optional(), expertId: uuid.optional(), type: tipoDeParte.optional() }), request.query);
      const r = repo();
      const [linhas, hook, body] = await Promise.all([
        r.adPartes.listar({ expertId: q.expertId, type: q.type }, querInativos(q)),
        r.usoEmAnuncios("hook"),
        r.usoEmAnuncios("body"),
      ]);
      const uso = { hook, body };
      return linhas.map((v) => ({ ...v, rotulo: rotuloDe(v.code, v.description), usadoEm: uso[v.type].get(v.id) ?? 0 }));
    }),
  );

  /** Sugestão de código por (expert, tipo): `h01`, `b01` — o menor livre, inativos inclusos (mesma regra das variáveis de VSL). */
  fastify.get(
    "/api/nomenclatura/ads/partes/proximo-codigo",
    tentar(async (request) => {
      autor(request);
      const q = parse(z.object({ expertId: uuid, type: tipoDeParte }), request.query);
      const r = repo();
      await existente(r, "experts", q.expertId, "Expert");
      return { codigo: proximoCodigoNumerado(PREFIXO_DA_PARTE_DO_VIDEO[q.type], await r.adPartes.codigos(q.expertId, q.type)) };
    }),
  );

  fastify.post(
    "/api/nomenclatura/ads/partes",
    tentar(async (request, reply) => {
      const author = autor(request);
      const b = parse(z.object({ expertId: uuid, type: tipoDeParte, code: z.string().optional(), description: z.string().trim().min(1).max(2000) }), request.body);
      const r = repo();
      const expert = await existente(r, "experts", b.expertId, "Expert");
      const codigos = await r.adPartes.codigos(expert.id, b.type);
      const sugestao = proximoCodigoNumerado(PREFIXO_DA_PARTE_DO_VIDEO[b.type], codigos);
      const code = b.code !== undefined && b.code !== "" ? codigoValidado(b.code, TIPO_DE_CODIGO_DA_PARTE_DO_VIDEO[b.type], "code") : sugestao;
      if (!code) throw new ErroDeNomenclatura(409, `Sequência de ${ROTULO_DA_PARTE_DO_VIDEO[b.type].toLowerCase()} esgotada para ${expert.code} (99 códigos).`, { campo: "code" });
      const ja = await r.adPartes.porCode(expert.id, b.type, code);
      if (ja) throw conflitoDeCodigo({ codigo: code, escopo: `${expert.code} (${ROTULO_DA_PARTE_DO_VIDEO[b.type].toLowerCase()})`, descricaoExistente: ja.description, sugestao, campo: "code" });
      const linha = await r.inserir("adPartes", { expertId: expert.id, type: b.type, code, description: b.description }, author);
      return reply.code(201).send({ ...linha, rotulo: rotuloDe(linha.code, linha.description), usadoEm: 0 });
    }),
  );

  fastify.patch(
    "/api/nomenclatura/ads/partes/:id",
    tentar(async (request) => {
      const author = autor(request);
      const { id } = parse(idParams, request.params);
      const b = parse(z.object({ code: z.string().optional(), description: z.string().trim().min(1).max(2000).optional() }), request.body);
      const r = repo();
      const antes = await existente(r, "adPartes", id, "Hook/body");
      const patch: Partial<typeof antes> = {};
      if (b.code !== undefined) {
        const code = codigoValidado(b.code, TIPO_DE_CODIGO_DA_PARTE_DO_VIDEO[antes.type], "code");
        if (code !== antes.code) {
          // Código imutável depois de usado em anúncio (a 47.13 passa a gravar hook_id/body_id).
          exigirNaoUsado(await r.anunciosQueUsamParte(id), "code");
          const ja = await r.adPartes.porCode(antes.expertId, antes.type, code);
          if (ja) {
            const sugestao = proximoCodigoNumerado(PREFIXO_DA_PARTE_DO_VIDEO[antes.type], await r.adPartes.codigos(antes.expertId, antes.type));
            throw conflitoDeCodigo({ codigo: code, escopo: "este expert", descricaoExistente: ja.description, sugestao, campo: "code" });
          }
          patch.code = code;
        }
      }
      if (b.description !== undefined) patch.description = b.description;
      if (Object.keys(patch).length === 0) return { ...antes, rotulo: rotuloDe(antes.code, antes.description) };
      const depois = await r.atualizar("adPartes", antes, patch, author);
      return { ...depois, rotulo: rotuloDe(depois.code, depois.description) };
    }),
  );

  fastify.get(
    "/api/nomenclatura/ads/proximo",
    tentar(async (request) => {
      autor(request);
      // Story 47.18 (AC3/AC7): `creativeType` e `launchSeq` entram — o NN é do ESCOPO (expert + sigla + nº + tipo), e
      // `launchType = perpetuo` também (escopo sem número). O `escopo` na resposta é como o web reconhece esta versão:
      // a API antiga descarta os parâmetros novos em silêncio e não o devolve.
      const q = parse(
        z.object({
          expertId: uuid,
          launchType: z.string().max(20).optional(),
          creativeType: z.string().max(20).optional(),
          launchSeq: z.coerce.number().int().min(1).max(99).optional(),
        }),
        request.query,
      );
      const r = repo();
      await existente(r, "experts", q.expertId, "Expert");
      // Escopo incompleto (sem tipo, sem sigla, ou sigla com número sem o nº): nada a sugerir — a tela diz o que falta.
      const escopo = escopoDoNnDoCriativo(q);
      const nn = escopo ? proximoNnDeAnuncio((await r.anuncios.seqsDoEscopo(q.expertId, escopo)).map((s) => s.creativeSeq)) : null;
      // Story 47.16 (AC7): `perpetuo` não tem número — nada a sugerir. A sugestão do nº segue por expert + sigla.
      const maiorLancamento = q.launchType && !siglaSemNumero(q.launchType) ? await r.anuncios.maiorLancamento(q.expertId, q.launchType) : null;
      return { creativeSeq: nn, creativeSeqTexto: nn === null ? null : String(nn).padStart(2, "0"), launchSeqSugerido: maiorLancamento, escopo };
    }),
  );

  fastify.get(
    "/api/nomenclatura/ads/snapshot",
    tentar(async (request) => {
      autor(request);
      const q = parse(z.object({ inativos: z.enum(["1", "true", "0", "false"]).optional() }), request.query);
      return repo().snapshotDeAnuncios(querInativos(q));
    }),
  );

  fastify.post(
    "/api/nomenclatura/ads/validar-nome",
    tentar(async (request) => {
      autor(request);
      const b = parse(z.object({ name: z.string().max(300) }), request.body);
      return parseAdName(b.name, await repo().snapshotDeAnuncios(true));
    }),
  );

  fastify.get(
    "/api/nomenclatura/ads",
    tentar(async (request) => {
      autor(request);
      const q = parse(
        z.object({
          expertId: uuid.optional(),
          creativeType: z.string().max(20).optional(),
          launchType: z.string().max(20).optional(),
          // Story 47.13 (AC11)
          origin: z.string().max(20).optional(),
          hookId: uuid.optional(),
          bodyId: uuid.optional(),
          de: mmAaaa.optional(),
          ate: mmAaaa.optional(),
          q: z.string().max(200).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        request.query,
      );
      const r = repo();
      const paraData = (mm?: string) => (mm ? `${mm.slice(3)}-${mm.slice(0, 2)}-01` : undefined);
      const { itens, total } = await r.anuncios.listar({ ...q, de: paraData(q.de), ate: paraData(q.ate) });
      const [experts, partes] = await Promise.all([r.experts.listar(true), r.adPartes.listar({}, true)]);
      const codeDoExpert = new Map(experts.map((e) => [e.id, e.code]));
      const codeDaParte = new Map(partes.map((p) => [p.id, p.code]));
      return {
        itens: itens.map((a) => ({
          ...a,
          expertCode: codeDoExpert.get(a.expertId) ?? "?",
          hookCode: a.hookId ? (codeDaParte.get(a.hookId) ?? null) : null,
          bodyCode: a.bodyId ? (codeDaParte.get(a.bodyId) ?? null) : null,
          legado: ehVideo(a.creativeType) && !a.origin,
        })),
        total,
      };
    }),
  );

  fastify.get(
    "/api/nomenclatura/ads/:id",
    tentar(async (request) => {
      autor(request);
      const { id } = parse(idParams, request.params);
      const r = repo();
      const a = await existente(r, "anuncios", id, "Anúncio");
      return { ...a, ...(await rotulosDeAnuncio(r)(a)) };
    }),
  );

  fastify.post(
    "/api/nomenclatura/ads",
    tentar(async (request, reply) => {
      const author = autor(request);
      const b = parse(anuncioSchema, request.body);
      const r = repo();
      const m = await montarAnuncio(r, b);
      const linha = await r.inserir("anuncios", { ...m, fields: undefined, notes: b.notes ?? null, createdBy: author } as never, author);
      return reply.code(201).send({ ...linha, ...(await rotulosDeAnuncio(r)(linha)) });
    }),
  );

  fastify.patch(
    "/api/nomenclatura/ads/:id",
    tentar(async (request) => {
      const author = autor(request);
      const { id } = parse(idParams, request.params);
      // D23: depois de salvo, tipo e NN do criativo não mudam (o nome já foi para o Meta e para o arquivo do designer).
      const b = parse(
        z.object({
          launchType: z.string().min(1).max(20).optional(),
          // Story 47.16: `null` = sem número (só com `perpetuo`); omitido = regra de `numeroDoLancamentoNoPatch`
          launchSeq: z.number().int().min(1).max(99).nullable().optional(),
          date: mmAaaa.optional(),
          description: z.string().trim().max(200).nullable().optional(),
          notes: z.string().trim().max(4000).nullable().optional(),
          // Story 47.13: editáveis num vídeo v2 (como lançamento/data); num vídeo do padrão antigo são recusados (AC7)
          origin: z.string().trim().max(20).optional(),
          hookId: uuid.optional(),
          bodyId: uuid.optional(),
        }),
        request.body,
      );
      const r = repo();
      const antes = await existente(r, "anuncios", id, "Anúncio");
      const mexeNoNome = b.launchType !== undefined || b.launchSeq !== undefined || b.date !== undefined || b.description !== undefined || b.origin !== undefined || b.hookId !== undefined || b.bodyId !== undefined;
      const patch: Record<string, unknown> = {};
      if (mexeNoNome) {
        // 47.13 AC7 / 47.16 AC8: o vídeo re-grava no formato em que foi publicado (antigo, v2 ou v3), lido do `name`
        // gravado — v2 e v3 têm os dois hook_id, a coluna não distingue. O nome publicado não muda de formato (regra 6).
        const formato = ehVideo(antes.creativeType) ? formatoDoVideoGravado(antes.name) : "v3";
        const m = await montarAnuncio(
          r,
          {
            expertId: antes.expertId,
            creativeType: antes.creativeType,
            creativeSeq: antes.creativeSeq,
            launchType: b.launchType ?? antes.launchType,
            // Story 47.16 (PO-03/PO-04): trocar para `perpetuo` zera; de `perpetuo` para outra sigla sem número → 400 em launchSeq
            launchSeq: numeroDoLancamentoNoPatch(b, antes),
            date: b.date ?? `${antes.adDate.slice(5, 7)}-${antes.adDate.slice(0, 4)}`,
            description: b.description === undefined ? antes.description : b.description,
            origin: b.origin ?? antes.origin ?? null,
            hookId: b.hookId ?? antes.hookId ?? null,
            bodyId: b.bodyId ?? antes.bodyId ?? null,
          },
          { ignorarSeqDe: antes.id, formato },
        );
        Object.assign(patch, { ...m, fields: undefined });
      }
      if (b.notes !== undefined) patch.notes = b.notes;
      if (Object.keys(patch).length === 0) return { ...antes, ...(await rotulosDeAnuncio(r)(antes)) };
      const depois = await r.atualizar("anuncios", antes, patch as never, author);
      return { ...depois, ...(await rotulosDeAnuncio(r)(depois)) };
    }),
  );

  // ─────────────────── dimensões e cobertura (Story 47.6) ───────────────────
  fastify.get(
    "/api/nomenclatura/dimensoes",
    tentar(async (request) => {
      autor(request);
      const q = parse(z.object({ projectId: uuid }), request.query);
      if (fastify.nomenclaturaRepo) return {}; // teste: sem banco
      const mapa = await mapaDeDimensoes(fastify.db, q.projectId);
      return Object.fromEntries(mapa);
    }),
  );

  fastify.get(
    "/api/nomenclatura/cobertura",
    tentar(async (request) => {
      autor(request);
      const q = parse(z.object({ funnelId: uuid, days: z.coerce.number().int().min(1).max(365).default(30) }), request.query);
      const c = await coberturaDeGasto(fastify.db, q.funnelId, q.days);
      if (!c) throw new ErroDeNomenclatura(404, "Funil não encontrado.");
      return { funnelId: q.funnelId, days: q.days, ...c, vendas: { nota: "a cobertura de vendas sai no relatório do perpétuo (coberturaVinculo), que é quem atribui venda a campanha" } };
    }),
  );

  // ─────────────────────────── legadas (Story 47.5) ───────────────────────────
  const legadaParams = z.object({ projectId: uuid, campaignId: z.string().min(1).max(64) });

  fastify.get(
    "/api/nomenclatura/legadas",
    tentar(async (request) => {
      autor(request);
      const q = parse(z.object({ projectId: uuid.optional(), fila: z.enum(["pendentes", "ignoradas", "classificadas", "todas"]).default("pendentes"), q: z.string().max(200).optional() }), request.query);
      const r = repo();
      const [{ nomes: nomesBrutos, gasto, decisoes }, experts, snap, vinculadas] = await Promise.all([r.legadas.listar({ projectId: q.projectId, q: q.q }), r.experts.listar(true), r.snapshot(false), r.campanhas.metaIdsDoGerador()]);
      // Story 47.8 (AC6): campanha do gerador já colada no Meta tem `perpetuo` no nome e casaria com o
      // filtro de legadas. Se o id é de uma campanha do GERADOR, não é legada (a classificada segue pela decisão).
      const nomes = nomesBrutos.filter((n) => !vinculadas.has(n.campaignId));
      const expertDoProjeto = new Map(experts.filter((e) => e.projectId).map((e) => [e.projectId as string, e]));
      const itens = nomes
        .map((n) => {
          const decisao = decisoes.get(`${n.projectId}:${n.campaignId}`);
          const expert = expertDoProjeto.get(n.projectId);
          const g = gasto.get(n.campaignId);
          return {
            projectId: n.projectId,
            projeto: n.projeto,
            campaignId: n.campaignId,
            nome: n.nome,
            statusMeta: n.statusMeta,
            expert: expert ? { id: expert.id, code: expert.code, name: expert.name, active: expert.active } : null,
            gasto: g?.spend ?? 0,
            de: g?.de ?? null,
            ate: g?.ate ?? null,
            decisao: decisao ? { tipo: decisao.decision, namingCampaignId: decisao.namingCampaignId, reason: decisao.reason, em: decisao.createdAt } : null,
            sugestao: sugerirClassificacao(n.nome, snap, expert?.code),
          };
        })
        .filter((i) => (q.fila === "todas" ? true : q.fila === "pendentes" ? !i.decisao : i.decisao?.tipo === (q.fila === "ignoradas" ? "ignorada" : "classificada")))
        .sort((a, b) => b.gasto - a.gasto);
      const pendentes = nomes.filter((n) => !decisoes.get(`${n.projectId}:${n.campaignId}`));
      return {
        itens,
        resumo: { total: nomes.length, pendentes: pendentes.length, gastoPendente: pendentes.reduce((acc, n) => acc + (gasto.get(n.campaignId)?.spend ?? 0), 0) },
      };
    }),
  );

  fastify.post(
    "/api/nomenclatura/legadas/:projectId/:campaignId/classificar",
    tentar(async (request, reply) => {
      const author = autor(request);
      const { projectId, campaignId } = parse(legadaParams, request.params);
      // expertId vem do PROJETO, nunca do corpo (47.5 AC1 / Dev Notes).
      const b = parse(campanhaSchema.omit({ expertId: true }), request.body);
      const r = repo();
      const expert = await r.experts.porProjeto(projectId);
      if (!expert) throw new ErroDeNomenclatura(422, "Este projeto ainda não tem expert vinculado. Vincule em Dicionário › Experts antes de classificar.", { campo: "projectId" });
      const detalhe = await r.legadas.detalhe(projectId, campaignId);
      if (!detalhe) throw new ErroDeNomenclatura(404, "Campanha do Meta não encontrada neste projeto.");
      const ja = await r.legadas.decisao(projectId, campaignId);
      if (ja?.decision === "classificada") throw new ErroDeNomenclatura(409, "Esta campanha já foi classificada. Para refazer, use \"voltar para a fila\" — isso apaga a classificação.", { campo: "campaignId" });
      const m = await montarCampanha(r, { ...b, expertId: expert.id });
      const publishedAt = detalhe.primeiroGasto ? new Date(`${detalhe.primeiroGasto}T12:00:00Z`) : new Date();
      const linha = await r.inserir(
        "campanhas",
        { ...m, fields: undefined, origin: "legado", metaCampaignId: campaignId, metaCampaignName: detalhe.nome, publishedAt, notes: b.notes ?? null, createdBy: author } as never,
        author,
      );
      if (ja) await r.excluir("decisoes", ja, author); // estava "ignorada": a classificação substitui
      await r.inserir("decisoes", { projectId, campaignId, decision: "classificada", namingCampaignId: linha.id, reason: null, author }, author);
      invalidarMapa(projectId);
      return reply.code(201).send({ ...linha, ...(await rotulosDeCampanhas(r))(linha) });
    }),
  );

  fastify.post(
    "/api/nomenclatura/legadas/:projectId/:campaignId/ignorar",
    tentar(async (request, reply) => {
      const author = autor(request);
      const { projectId, campaignId } = parse(legadaParams, request.params);
      const b = parse(z.object({ reason: z.string().trim().max(500).optional() }).optional().default({}), request.body ?? {});
      const r = repo();
      const detalhe = await r.legadas.detalhe(projectId, campaignId);
      if (!detalhe) throw new ErroDeNomenclatura(404, "Campanha do Meta não encontrada neste projeto.");
      const ja = await r.legadas.decisao(projectId, campaignId);
      if (ja?.decision === "classificada") throw new ErroDeNomenclatura(409, "Campanha classificada não pode ser ignorada. Volte para a fila antes.", { campo: "campaignId" });
      if (ja) return ja;
      const d = await r.inserir("decisoes", { projectId, campaignId, decision: "ignorada", namingCampaignId: null, reason: b.reason ?? null, author }, author);
      return reply.code(201).send(d);
    }),
  );

  fastify.delete(
    "/api/nomenclatura/legadas/:projectId/:campaignId/decisao",
    tentar(async (request, reply) => {
      const author = autor(request);
      const { projectId, campaignId } = parse(legadaParams, request.params);
      const r = repo();
      const ja = await r.legadas.decisao(projectId, campaignId);
      if (!ja) return reply.code(204).send();
      // Decisão do @po (47.5 AC9): desfazer uma classificação APAGA o registro —
      // legada nasce publicada e Editar fica bloqueado; é o único conserto.
      if (ja.decision === "classificada" && ja.namingCampaignId) {
        const c = await r.porId("campanhas", ja.namingCampaignId);
        if (c) await r.excluir("campanhas", c, author);
      }
      await r.excluir("decisoes", ja, author);
      invalidarMapa(projectId);
      return reply.code(204).send();
    }),
  );

  // ─────────────────────────── changelog ───────────────────────────
  fastify.get(
    "/api/nomenclatura/changelog",
    tentar(async (request) => {
      autor(request);
      const q = parse(z.object({ entity: z.string().max(40).optional(), entityId: uuid.optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), request.query);
      return listarChangelog(fastify.db, q);
    }),
  );
});
