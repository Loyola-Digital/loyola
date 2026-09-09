/**
 * Story 47.1 — as rotas do dicionário sobre um repositório EM MEMÓRIA.
 *
 * O que se prova aqui é o encadeamento carregar → decidir → gravar e a forma
 * das respostas (AC 5, 6, 7, 8, 9, 10, 14 da spec). O que as consultas fazem
 * de verdade está em `nomenclatura-repositorio.test.ts`.
 */
import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import nomenclaturaRoutes from "../routes/nomenclatura.js";
import type { Repositorio } from "../services/nomenclatura/repositorio.js";

type Linha = Record<string, unknown> & { id: string; active: boolean };
type Log = { entity: string; entityId: string; action: string; before: unknown; after: unknown; author: string | null };

function memoria() {
  const t: Record<string, Linha[]> = { experts: [], produtos: [], funis: [], ofertas: [], lps: [], dicionario: [] };
  const campanhas: Record<string, unknown>[] = [];
  const changelog: Log[] = [];
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const NOME: Record<string, string> = { experts: "naming_experts", produtos: "naming_products", funis: "naming_funnels", ofertas: "naming_offers", lps: "naming_landing_pages", dicionario: "naming_dictionary_values" };
  const COL: Record<string, string> = { experts: "expertId", produtos: "productId", funis: "funnelId", ofertas: "offerId", lps: "landingPageId" };

  const ativos = (xs: Linha[], inativos: boolean) => (inativos ? xs : xs.filter((x) => x.active));
  const contar = (col: string, v: unknown) => campanhas.filter((c) => c[col] === v).length;

  const repo = {
    async inserir(e: string, v: Record<string, unknown>, author: string | null) {
      const linha = { id: id(), active: true, ...v } as Linha;
      t[e].push(linha);
      changelog.push({ entity: NOME[e], entityId: linha.id, action: "create", before: null, after: linha, author });
      return linha;
    },
    async atualizar(e: string, antes: Linha, patch: Record<string, unknown>, author: string | null, action = "update") {
      const i = t[e].findIndex((x) => x.id === antes.id);
      const depois = { ...t[e][i], ...patch };
      t[e][i] = depois;
      changelog.push({ entity: NOME[e], entityId: antes.id, action, before: antes, after: depois, author });
      return depois;
    },
    async excluir(e: string, antes: Linha, author: string | null) {
      t[e] = t[e].filter((x) => x.id !== antes.id);
      changelog.push({ entity: NOME[e], entityId: antes.id, action: "delete", before: antes, after: null, author });
    },
    async porId(e: string, i: string) {
      return t[e].find((x) => x.id === i);
    },
    async alternarAtivo(e: string, antes: Linha, ativo: boolean, author: string | null) {
      return repo.atualizar(e, antes, { active: ativo }, author, ativo ? "reactivate" : "deactivate");
    },
    async usoPorFk(col: string) {
      const m = new Map<string, number>();
      for (const c of campanhas) if (c[col]) m.set(c[col] as string, (m.get(c[col] as string) ?? 0) + 1);
      return m;
    },
    async usoPorValor(type: string) {
      const m = new Map<string, number>();
      for (const c of campanhas) m.set(c[type] as string, (m.get(c[type] as string) ?? 0) + 1);
      return m;
    },
    async campanhasQueUsam(col: string, i: string) {
      return contar(col, i);
    },
    async campanhasComValor(type: string, v: string) {
      return contar(type, v);
    },
    async referenciasDe(e: string, linha: Linha) {
      const refs: { tipo: string; id: string; rotulo: string }[] = [];
      if (e === "experts") {
        for (const k of ["produtos", "funis", "ofertas"]) for (const x of t[k].filter((x) => x.expertId === linha.id)) refs.push({ tipo: k.slice(0, -1), id: x.id, rotulo: String(x.code ?? x.slug) });
      }
      if (["experts", "produtos", "funis", "ofertas"].includes(e)) {
        for (const l of t.lps.filter((l) => l[COL[e]] === linha.id)) refs.push({ tipo: "lp", id: l.id, rotulo: String(l.slug) });
      }
      if (e === "dicionario") {
        for (const c of campanhas.filter((c) => c[linha.type as string] === linha.value)) refs.push({ tipo: "campanha", id: c.id as string, rotulo: c.name as string });
      } else {
        for (const c of campanhas.filter((c) => c[COL[e]] === linha.id)) refs.push({ tipo: "campanha", id: c.id as string, rotulo: c.name as string });
      }
      return refs;
    },
    experts: {
      listar: async (inativos: boolean) => ativos(t.experts, inativos),
      porCode: async (code: string) => t.experts.find((x) => x.code === code),
      contagens: async () => ({ produtos: new Map(), funis: new Map(), ofertas: new Map(), lps: new Map() }),
      filhosAtivos: async (expertId: string) => ({
        produtos: t.produtos.filter((x) => x.expertId === expertId && x.active),
        funis: t.funis.filter((x) => x.expertId === expertId && x.active),
        ofertas: t.ofertas.filter((x) => x.expertId === expertId && x.active),
        lps: t.lps.filter((x) => x.expertId === expertId && x.active),
      }),
    },
    produtos: {
      listar: async (expertId: string | undefined, inativos: boolean) => ativos(t.produtos.filter((x) => !expertId || x.expertId === expertId), inativos),
      porSlug: async (expertId: string, slug: string) => t.produtos.find((x) => x.expertId === expertId && x.slug === slug),
    },
    funis: {
      listar: async (expertId: string | undefined, inativos: boolean) => ativos(t.funis.filter((x) => !expertId || x.expertId === expertId), inativos),
      porCode: async (expertId: string, code: string) => t.funis.find((x) => x.expertId === expertId && x.code === code),
      codigos: async (expertId: string) => t.funis.filter((x) => x.expertId === expertId).map((x) => x.code as string),
    },
    ofertas: {
      listar: async (expertId: string | undefined, inativos: boolean) => ativos(t.ofertas.filter((x) => !expertId || x.expertId === expertId), inativos),
      porCode: async (expertId: string, code: string) => t.ofertas.find((x) => x.expertId === expertId && x.code === code),
      codigos: async (expertId: string) => t.ofertas.filter((x) => x.expertId === expertId).map((x) => x.code as string),
    },
    lps: {
      listar: async (f: Record<string, string | undefined>, inativos: boolean) =>
        ativos(t.lps.filter((x) => Object.entries(f).every(([k, v]) => !v || x[k] === v)), inativos),
      porCode: async (c: Record<string, string>, code: string) =>
        t.lps.find((x) => x.expertId === c.expertId && x.productId === c.productId && x.funnelId === c.funnelId && x.offerId === c.offerId && x.code === code),
      codigos: async (c: Record<string, string>) =>
        t.lps.filter((x) => x.expertId === c.expertId && x.productId === c.productId && x.funnelId === c.funnelId && x.offerId === c.offerId).map((x) => x.code as string),
    },
    dicionario: {
      listar: async (type: string | undefined, inativos: boolean) => ativos(t.dicionario.filter((x) => !type || x.type === type), inativos),
      porValor: async (type: string, value: string) => t.dicionario.find((x) => x.type === type && x.value === value),
    },
  };
  return { repo: repo as unknown as Repositorio, t, campanhas, changelog };
}

const USUARIO = "10000000-0000-4000-8000-000000000001";

async function montarApp(repo: Repositorio) {
  const app = Fastify();
  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");
  app.addHook("onRequest", async (req) => {
    req.userId = USUARIO;
    req.userRole = (req.headers["x-papel"] as string) || "strategist";
  });
  app.decorate("db", {} as never);
  app.decorate("nomenclaturaRepo", repo);
  await app.register(nomenclaturaRoutes);
  await app.ready();
  return app;
}

/** bbe com churrasco, a01, of01 e of02; fz vazio. */
async function cenario(app: FastifyInstance) {
  const post = async (url: string, payload: Record<string, unknown>) => (await app.inject({ method: "POST", url, payload })).json();
  const bbe = await post("/api/nomenclatura/experts", { code: "bbe", name: "BBE" });
  const fz = await post("/api/nomenclatura/experts", { code: "fz", name: "FZ" });
  const churrasco = await post("/api/nomenclatura/produtos", { expertId: bbe.id, slug: "churrasco", name: "Churrasco" });
  const a01 = await post("/api/nomenclatura/funis", { expertId: bbe.id, code: "a01", description: "VSL direto para checkout" });
  const of01 = await post("/api/nomenclatura/ofertas", { expertId: bbe.id, code: "of01", description: "oferta com ticket médio de R$ 347" });
  const of02 = await post("/api/nomenclatura/ofertas", { expertId: bbe.id, code: "of02", description: "oferta com ticket médio de R$ 297" });
  return { bbe, fz, churrasco, a01, of01, of02 };
}

describe("rotas da nomenclatura", () => {
  let app: FastifyInstance;
  let mem: ReturnType<typeof memoria>;

  beforeEach(async () => {
    mem = memoria();
    app = await montarApp(mem.repo);
  });

  it("guest recebe 403 em GET, POST, PATCH e DELETE (D3)", async () => {
    const h = { "x-papel": "guest" };
    expect((await app.inject({ method: "GET", url: "/api/nomenclatura/ofertas", headers: h })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/experts", headers: h, payload: { code: "bbe", name: "x" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "PATCH", url: `/api/nomenclatura/ofertas/${USUARIO}`, headers: h, payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `/api/nomenclatura/ofertas/${USUARIO}`, headers: h })).statusCode).toBe(403);
    expect(mem.t.experts).toHaveLength(0);
  });

  it("copywriter escreve (a spec não restringe por papel)", async () => {
    const r = await app.inject({ method: "POST", url: "/api/nomenclatura/experts", headers: { "x-papel": "copywriter" }, payload: { code: "bbe", name: "BBE" } });
    expect(r.statusCode).toBe(201);
  });

  it("AC 5: nova oferta para bbe sugere of03; salvar of02 de novo cita a descrição da existente", async () => {
    const { bbe } = await cenario(app);
    const sugestao = await app.inject({ method: "GET", url: `/api/nomenclatura/ofertas/proximo-codigo?expertId=${bbe.id}` });
    expect(sugestao.json()).toEqual({ codigo: "of03" });

    const dup = await app.inject({ method: "POST", url: "/api/nomenclatura/ofertas", payload: { expertId: bbe.id, code: "of02", description: "outra" } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ error: 'of02 já existe para bbe: "oferta com ticket médio de R$ 297". Use of03.', campo: "code", sugestao: "of03" });

    const semCodigo = await app.inject({ method: "POST", url: "/api/nomenclatura/ofertas", payload: { expertId: bbe.id, description: "R$ 500 com bump" } });
    expect(semCodigo.statusCode).toBe(201);
    expect(semCodigo.json()).toMatchObject({ code: "of03", rotulo: "of03 — R$ 500 com bump", usadoEm: 0 });
  });

  it("AC 6: a01 para bbe e a01 para fz coexistem; a01 de novo para bbe não", async () => {
    const { bbe, fz } = await cenario(app);
    const fzA01 = await app.inject({ method: "POST", url: "/api/nomenclatura/funis", payload: { expertId: fz.id, code: "a01", description: "Quiz → VSL" } });
    expect(fzA01.statusCode).toBe(201);
    const bbeA01 = await app.inject({ method: "POST", url: "/api/nomenclatura/funis", payload: { expertId: bbe.id, code: "a01", description: "x" } });
    expect(bbeA01.statusCode).toBe(409);
    expect(bbeA01.json().error).toContain("a01 já existe para bbe");
  });

  it("AC 7: LP sugere lpa depois lpb, gera o slug e ignora slug do body", async () => {
    const { bbe, churrasco, a01, of01 } = await cenario(app);
    const comb = { expertId: bbe.id, productId: churrasco.id, funnelId: a01.id, offerId: of01.id };
    const q = new URLSearchParams(comb).toString();
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/lps/proximo-codigo?${q}` })).json()).toEqual({ codigo: "lpa", slug: "bbe-churrasco-a01-of01-lpa" });

    const lpa = await app.inject({ method: "POST", url: "/api/nomenclatura/lps", payload: { ...comb, slug: "hackeado", url: "https://ex.com/a" } });
    expect(lpa.statusCode).toBe(201);
    expect(lpa.json()).toMatchObject({ code: "lpa", slug: "bbe-churrasco-a01-of01-lpa", rotulo: "lpa — bbe-churrasco-a01-of01-lpa" });

    const lpb = await app.inject({ method: "POST", url: "/api/nomenclatura/lps", payload: comb });
    expect(lpb.json()).toMatchObject({ code: "lpb", slug: "bbe-churrasco-a01-of01-lpb" });

    const dup = await app.inject({ method: "POST", url: "/api/nomenclatura/lps", payload: { ...comb, code: "lpa" } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ sugestao: "lpc" });
  });

  it("AC 8: LP com produto de outro expert → 422 apontando productId", async () => {
    const { bbe, fz, a01, of01 } = await cenario(app);
    const produtoFz = (await app.inject({ method: "POST", url: "/api/nomenclatura/produtos", payload: { expertId: fz.id, slug: "hamburguer", name: "H" } })).json();
    const r = await app.inject({ method: "POST", url: "/api/nomenclatura/lps", payload: { expertId: bbe.id, productId: produtoFz.id, funnelId: a01.id, offerId: of01.id } });
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ campo: "productId" });
  });

  it("AC 9: excluir oferta usada → 409 com a lista e podeDesativar; desativada some da lista e volta com inativos=1", async () => {
    const { bbe, of02 } = await cenario(app);
    mem.campanhas.push({ id: "c1", name: "bbe_churrasco_a01_of02_2026_hot_cbo_videos_lpa", offerId: of02.id, expertId: bbe.id });

    const del = await app.inject({ method: "DELETE", url: `/api/nomenclatura/ofertas/${of02.id}` });
    expect(del.statusCode).toBe(409);
    expect(del.json()).toMatchObject({ podeDesativar: true, referencias: [{ tipo: "campanha", id: "c1", rotulo: "bbe_churrasco_a01_of02_2026_hot_cbo_videos_lpa" }] });
    expect(mem.t.ofertas.find((o) => o.id === of02.id)).toBeDefined();

    const des = await app.inject({ method: "POST", url: `/api/nomenclatura/ofertas/${of02.id}/desativar` });
    expect(des.json()).toMatchObject({ active: false });

    const soAtivas = (await app.inject({ method: "GET", url: `/api/nomenclatura/ofertas?expertId=${bbe.id}` })).json();
    expect(soAtivas.map((o: { code: string }) => o.code)).toEqual(["of01"]);
    const comInativas = (await app.inject({ method: "GET", url: `/api/nomenclatura/ofertas?expertId=${bbe.id}&inativos=1` })).json();
    expect(comInativas.map((o: { code: string; usadoEm: number }) => [o.code, o.usadoEm])).toEqual([["of01", 0], ["of02", 1]]);

    // reaproveitar of02 continua proibido mesmo inativa (regra 4)
    const reuso = await app.inject({ method: "POST", url: "/api/nomenclatura/ofertas", payload: { expertId: bbe.id, code: "of02", description: "nova" } });
    expect(reuso.statusCode).toBe(409);

    const rea = await app.inject({ method: "POST", url: `/api/nomenclatura/ofertas/${of02.id}/reativar` });
    expect(rea.json()).toMatchObject({ active: true });
    expect(mem.changelog.filter((l) => l.entityId === of02.id).map((l) => l.action)).toEqual(["create", "deactivate", "reactivate"]);
  });

  it("AC 10: oferta usada não troca de código (409 usadoEm); a descrição troca e o changelog guarda before/after", async () => {
    const { of02 } = await cenario(app);
    mem.campanhas.push({ id: "c1", name: "x", offerId: of02.id });

    const troca = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ofertas/${of02.id}`, payload: { code: "of09" } });
    expect(troca.statusCode).toBe(409);
    expect(troca.json()).toMatchObject({ usadoEm: 1, campo: "code" });

    const desc = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ofertas/${of02.id}`, payload: { description: "oferta com ticket médio de R$ 297, 12x" } });
    expect(desc.statusCode).toBe(200);
    const log = mem.changelog.at(-1)!;
    expect(log).toMatchObject({ entity: "naming_offers", entityId: of02.id, action: "update", author: USUARIO });
    expect((log.before as Linha).description).toBe("oferta com ticket médio de R$ 297");
    expect((log.after as Linha).description).toBe("oferta com ticket médio de R$ 297, 12x");
  });

  it("sem uso, o código troca — e o conflito com outro código do expert é barrado", async () => {
    const { of02 } = await cenario(app);
    const ok = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ofertas/${of02.id}`, payload: { code: "OF05" } });
    expect(ok.json()).toMatchObject({ code: "of05" });
    const conflito = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ofertas/${of02.id}`, payload: { code: "of01" } });
    expect(conflito.statusCode).toBe(409);
  });

  it("AC 14: slug de produto é normalizado; com _ é 400 nomeando o campo", async () => {
    const { bbe } = await cenario(app);
    const ok = await app.inject({ method: "POST", url: "/api/nomenclatura/produtos", payload: { expertId: bbe.id, slug: "Churrasco Premium", name: "CP" } });
    expect(ok.json()).toMatchObject({ slug: "churrasco-premium" });
    const ruim = await app.inject({ method: "POST", url: "/api/nomenclatura/produtos", payload: { expertId: bbe.id, slug: "churrasco_premium", name: "CP" } });
    expect(ruim.statusCode).toBe(400);
    expect(ruim.json()).toMatchObject({ campo: "slug" });
    expect(ruim.json().error).toContain("_");
  });

  it("sigla do expert é imutável desde a criação; o nome não", async () => {
    const { bbe } = await cenario(app);
    const code = await app.inject({ method: "PATCH", url: `/api/nomenclatura/experts/${bbe.id}`, payload: { code: "bbx" } });
    expect(code.statusCode).toBe(409);
    const nome = await app.inject({ method: "PATCH", url: `/api/nomenclatura/experts/${bbe.id}`, payload: { name: "Netão" } });
    expect(nome.json()).toMatchObject({ code: "bbe", name: "Netão" });
  });

  it("desativar expert cascateia, informa o impacto antes e deixa uma linha de changelog por registro", async () => {
    const { bbe, churrasco, a01, of01 } = await cenario(app);
    await app.inject({ method: "POST", url: "/api/nomenclatura/lps", payload: { expertId: bbe.id, productId: churrasco.id, funnelId: a01.id, offerId: of01.id } });

    const impacto = await app.inject({ method: "GET", url: `/api/nomenclatura/experts/${bbe.id}/impacto-da-desativacao` });
    expect(impacto.json()).toEqual({ produtos: 1, funis: 1, ofertas: 2, lps: 1 });
    expect(mem.t.produtos[0].active).toBe(true);

    const antes = mem.changelog.length;
    const r = await app.inject({ method: "POST", url: `/api/nomenclatura/experts/${bbe.id}/desativar` });
    expect(r.json()).toMatchObject({ active: false, desativados: { produtos: 1, funis: 1, ofertas: 2, lps: 1 } });
    expect(mem.t.produtos.every((p) => !p.active)).toBe(true);
    expect(mem.t.lps.every((l) => !l.active)).toBe(true);
    expect(mem.changelog.length - antes).toBe(6);
    expect(mem.changelog.slice(antes).every((l) => l.action === "deactivate")).toBe(true);
  });

  it("valor fixo: cadastrar carrossel em formato; trocar valor usado é 409, ordem e descrição editam", async () => {
    const novo = await app.inject({ method: "POST", url: "/api/nomenclatura/dicionario", payload: { type: "format", value: "Carrossel", sortOrder: 3 } });
    expect(novo.json()).toMatchObject({ type: "format", value: "carrossel", sortOrder: 3 });
    const dup = await app.inject({ method: "POST", url: "/api/nomenclatura/dicionario", payload: { type: "format", value: "carrossel" } });
    expect(dup.statusCode).toBe(409);
    mem.campanhas.push({ id: "c1", name: "x", format: "carrossel" });
    const troca = await app.inject({ method: "PATCH", url: `/api/nomenclatura/dicionario/${novo.json().id}`, payload: { value: "carousel" } });
    expect(troca.statusCode).toBe(409);
    expect(troca.json()).toMatchObject({ usadoEm: 1 });
    const lista = (await app.inject({ method: "GET", url: "/api/nomenclatura/dicionario?type=format" })).json();
    expect(lista[0]).toMatchObject({ value: "carrossel", usadoEm: 1 });
    const del = await app.inject({ method: "DELETE", url: `/api/nomenclatura/dicionario/${novo.json().id}` });
    expect(del.statusCode).toBe(409);
  });

  it("excluir sem referência apaga de verdade (204) e registra delete", async () => {
    const { of01 } = await cenario(app);
    const r = await app.inject({ method: "DELETE", url: `/api/nomenclatura/ofertas/${of01.id}` });
    expect(r.statusCode).toBe(204);
    expect(mem.t.ofertas.find((o) => o.id === of01.id)).toBeUndefined();
    expect(mem.changelog.at(-1)).toMatchObject({ action: "delete", entityId: of01.id });
  });

  it("QA-471-01: UNIQUE estourado na corrida entre checagem e INSERT vira 409, não 500", async () => {
    const { bbe } = await cenario(app);
    // O repositório em memória "perde a corrida": a checagem não viu of03, o banco viu.
    const original = mem.repo.inserir;
    mem.repo.inserir = (async () => {
      const erroDoDriver = Object.assign(new Error('duplicate key value violates unique constraint "uq_naming_offers_expert_code"'), { code: "23505", constraint: "uq_naming_offers_expert_code" });
      throw Object.assign(new Error("Failed query: insert into naming_offers"), { cause: erroDoDriver });
    }) as typeof original;
    const r = await app.inject({ method: "POST", url: "/api/nomenclatura/ofertas", payload: { expertId: bbe.id, description: "corrida" } });
    mem.repo.inserir = original;
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toContain("acabou de ser cadastrado");
  });

  it("id inexistente → 404; id malformado → 400", async () => {
    expect((await app.inject({ method: "PATCH", url: `/api/nomenclatura/funis/${USUARIO}`, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: "/api/nomenclatura/funis/abc", payload: {} })).statusCode).toBe(400);
  });
});
