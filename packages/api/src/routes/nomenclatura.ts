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
import { LPMIX, NA, montarSlugDeLp, parseCampaignName, sugerirClassificacao } from "@loyola-x/shared";
import { CAMPOS_DO_NOME, montarCampanha } from "../services/nomenclatura/campanhas.js";
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
  type: z.enum(["year", "temperature", "auction", "format"]).optional(),
});
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD");

const TIPOS_DE_VALOR = ["year", "temperature", "auction", "format"] as const;

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
      return { produtos: filhos.produtos.length, funis: filhos.funis.length, ofertas: filhos.ofertas.length, lps: filhos.lps.length };
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
        const depois = antes.active ? await r.alternarAtivo("experts", antes, false, author) : antes;
        return {
          ...depois,
          desativados: { produtos: filhos.produtos.length, funis: filhos.funis.length, ofertas: filhos.ofertas.length, lps: filhos.lps.length },
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
        const referencias = await r.referenciasDe(entidade, antes as { id: string; type?: TipoDeValor; value?: string });
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
      const [linhas, uso] = await Promise.all([r.produtos.listar(q.expertId, querInativos(q)), r.usoPorFk("productId")]);
      return linhas.map((p) => ({ ...p, usadoEm: uso.get(p.id) ?? 0 }));
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
          exigirNaoUsado(await r.campanhasQueUsam("productId", id), "slug");
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
        const [linhas, uso] = await Promise.all([acesso(r).listar(q.expertId, querInativos(q)), r.usoPorFk(cfg.coluna)]);
        return linhas.map((l) => ({ ...l, rotulo: rotuloDe(l.code, l.description), usadoEm: uso.get(l.id) ?? 0 }));
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
            exigirNaoUsado(await r.campanhasQueUsam(cfg.coluna, id), "code");
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

  // ─────────────────────────── legadas (Story 47.5) ───────────────────────────
  const legadaParams = z.object({ projectId: uuid, campaignId: z.string().min(1).max(64) });

  fastify.get(
    "/api/nomenclatura/legadas",
    tentar(async (request) => {
      autor(request);
      const q = parse(z.object({ projectId: uuid.optional(), fila: z.enum(["pendentes", "ignoradas", "classificadas", "todas"]).default("pendentes"), q: z.string().max(200).optional() }), request.query);
      const r = repo();
      const [{ nomes, gasto, decisoes }, experts, snap] = await Promise.all([r.legadas.listar({ projectId: q.projectId, q: q.q }), r.experts.listar(true), r.snapshot(false)]);
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
