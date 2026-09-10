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
  const t: Record<string, Linha[]> = { experts: [], produtos: [], funis: [], ofertas: [], lps: [], dicionario: [], campanhas: [], decisoes: [], vslVariaveis: [], vsls: [], anuncios: [] };
  /** Story 47.5: "cache de nomes" do Meta e gasto, em memória. */
  const meta: { projectId: string; projeto: string; campaignId: string; nome: string; statusMeta: string | null }[] = [];
  const gastoMeta: Record<string, { spend: number; de: string; ate: string }> = {};
  const campanhas: Record<string, unknown>[] = [];
  const changelog: Log[] = [];
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const NOME: Record<string, string> = { experts: "naming_experts", produtos: "naming_products", funis: "naming_funnels", ofertas: "naming_offers", lps: "naming_landing_pages", dicionario: "naming_dictionary_values", campanhas: "naming_campaigns", decisoes: "naming_legacy_decisions", vslVariaveis: "naming_vsl_variables", vsls: "naming_vsls", anuncios: "naming_ads" };
  const COL: Record<string, string> = { experts: "expertId", produtos: "productId", funis: "funnelId", ofertas: "offerId", lps: "landingPageId" };

  const ativos = (xs: Linha[], inativos: boolean) => (inativos ? xs : xs.filter((x) => x.active));
  const contar = (col: string, v: unknown) => [...campanhas, ...t.campanhas].filter((c) => c[col] === v).length;
  const codeDe = (e: string, id: unknown) => String(t[e].find((x) => x.id === id)?.code ?? t[e].find((x) => x.id === id)?.slug ?? "?");

  const repo = {
    async snapshot(inativos: boolean) {
      const f = (xs: Linha[]) => (inativos ? xs : xs.filter((x) => x.active));
      return {
        experts: f(t.experts).map((e) => ({ code: e.code, active: e.active })),
        produtos: f(t.produtos).map((p) => ({ expert: codeDe("experts", p.expertId), slug: p.slug, active: p.active })),
        funis: f(t.funis).map((x) => ({ expert: codeDe("experts", x.expertId), code: x.code, active: x.active })),
        ofertas: f(t.ofertas).map((x) => ({ expert: codeDe("experts", x.expertId), code: x.code, active: x.active })),
        lps: f(t.lps).map((l) => ({ expert: codeDe("experts", l.expertId), product: codeDe("produtos", l.productId), funnel: codeDe("funis", l.funnelId), offer: codeDe("ofertas", l.offerId), code: l.code, active: l.active })),
        valores: f(t.dicionario).map((v) => ({ type: v.type, value: v.value, active: v.active })),
      };
    },
    /** Story 47.10 */
    async snapshotDeAnuncios(inativos: boolean) {
      const f = (xs: Linha[]) => (inativos ? xs : xs.filter((x) => x.active));
      return {
        experts: f(t.experts).map((e) => ({ code: e.code, active: e.active })),
        creativeTypes: f(t.dicionario.filter((v) => v.type === "creative_type")).map((v) => ({ value: v.value, active: v.active })),
        launchTypes: f(t.dicionario.filter((v) => v.type === "launch_type")).map((v) => ({ value: v.value, active: v.active })),
      };
    },
    anuncios: {
      listar: async (f: Record<string, unknown>) => {
        const itens = t.anuncios.filter((a) => ["expertId", "creativeType", "launchType"].every((k) => !f[k] || a[k] === f[k]) && (!f.q || String(a.name).includes(String(f.q))) && (!f.de || String(a.adDate) >= String(f.de)) && (!f.ate || String(a.adDate) <= String(f.ate)));
        return { itens, total: itens.length };
      },
      seqsDoExpert: async (expertId: string) => t.anuncios.filter((a) => a.expertId === expertId).map((a) => ({ id: a.id, creativeSeq: a.creativeSeq as number })),
      porSeq: async (expertId: string, seq: number) => t.anuncios.find((a) => a.expertId === expertId && a.creativeSeq === seq),
      maiorLancamento: async (expertId: string, launchType: string) => {
        const xs = t.anuncios.filter((a) => a.expertId === expertId && a.launchType === launchType).map((a) => a.launchSeq as number);
        return xs.length ? Math.max(...xs) : null;
      },
    },
    /** Story 47.9 */
    async snapshotDeVsl(inativos: boolean) {
      const f = (xs: Linha[]) => (inativos ? xs : xs.filter((x) => x.active));
      return {
        experts: f(t.experts).map((e) => ({ code: e.code, active: e.active })),
        produtos: f(t.produtos).map((p) => ({ expert: codeDe("experts", p.expertId), slug: p.slug, active: p.active })),
        ofertas: f(t.ofertas).map((x) => ({ expert: codeDe("experts", x.expertId), code: x.code, active: x.active })),
        variaveis: f(t.vslVariaveis).map((v) => ({ expert: codeDe("experts", v.expertId), type: v.type, code: v.code, active: v.active })),
      };
    },
    vslVariaveis: {
      listar: async (f: { expertId?: string; type?: string }, inativos: boolean) => ativos(t.vslVariaveis.filter((x) => (!f.expertId || x.expertId === f.expertId) && (!f.type || x.type === f.type)), inativos),
      porCode: async (expertId: string, type: string, code: string) => t.vslVariaveis.find((x) => x.expertId === expertId && x.type === type && x.code === code),
    },
    vsls: {
      listar: async (f: Record<string, unknown>) => {
        const itens = t.vsls.filter((v) => ["expertId", "productId", "offerId"].every((k) => !f[k] || v[k] === f[k]) && (!f.q || String(v.name).includes(String(f.q))));
        return { itens, total: itens.length };
      },
      porNome: async (name: string) => t.vsls.find((v) => v.name === name),
    },
    async usoEmVsls(col: string) {
      const m = new Map<string, number>();
      for (const v of t.vsls) if (v[col]) m.set(v[col] as string, (m.get(v[col] as string) ?? 0) + 1);
      return m;
    },
    async vslsQueUsam(col: string, i: string) {
      return t.vsls.filter((v) => v[col] === i).length;
    },
    campanhas: {
      listar: async (f: Record<string, unknown>) => {
        const itens = t.campanhas.filter((c) => ["expertId", "productId", "funnelId", "offerId", "year"].every((k) => !f[k] || c[k] === f[k]) && (!f.q || String(c.name).includes(String(f.q))));
        return { itens, total: itens.length };
      },
      /** Story 47.8 (AC6). */
      metaIdsDoGerador: async () => new Set(t.campanhas.filter((c) => c.metaCampaignId && c.origin !== "legado").map((c) => String(c.metaCampaignId))),
      /** Story 47.8 (T5). */
      naoPublicadas: async () => t.campanhas.filter((c) => !c.publishedAt),
    },
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
      if (type === "creative_type" || type === "launch_type") {
        const col = type === "creative_type" ? "creativeType" : "launchType";
        for (const a of t.anuncios) m.set(a[col] as string, (m.get(a[col] as string) ?? 0) + 1);
        return m;
      }
      for (const c of campanhas) m.set(c[type] as string, (m.get(c[type] as string) ?? 0) + 1);
      return m;
    },
    async campanhasQueUsam(col: string, i: string) {
      return contar(col, i);
    },
    async campanhasComValor(type: string, v: string) {
      if (type === "creative_type" || type === "launch_type") return t.anuncios.filter((a) => a[type === "creative_type" ? "creativeType" : "launchType"] === v).length;
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
      if (e === "vslVariaveis") {
        const col = ({ lead: "leadId", problem: "problemId", solution: "solutionId" } as Record<string, string>)[linha.type as string];
        for (const v of t.vsls.filter((v) => v[col] === linha.id)) refs.push({ tipo: "vsl", id: v.id, rotulo: String(v.name) });
        return refs;
      }
      if (e === "ofertas" || e === "produtos" || e === "experts") {
        for (const v of t.vsls.filter((v) => v[COL[e]] === linha.id)) refs.push({ tipo: "vsl", id: v.id, rotulo: String(v.name) });
      }
      if (e === "dicionario" && (linha.type === "creative_type" || linha.type === "launch_type")) {
        for (const a of t.anuncios.filter((a) => a[linha.type === "creative_type" ? "creativeType" : "launchType"] === linha.value)) refs.push({ tipo: "anuncio", id: a.id, rotulo: String(a.name) });
        return refs;
      }
      if (e === "dicionario") {
        for (const c of campanhas.filter((c) => c[linha.type as string] === linha.value)) refs.push({ tipo: "campanha", id: c.id as string, rotulo: c.name as string });
      } else {
        for (const c of campanhas.filter((c) => c[COL[e]] === linha.id)) refs.push({ tipo: "campanha", id: c.id as string, rotulo: c.name as string });
      }
      return refs;
    },
    legadas: {
      listar: async (f: { projectId?: string; q?: string }) => {
        const nomes = meta.filter((m) => (!f.projectId || m.projectId === f.projectId) && (!f.q || m.nome.toLowerCase().includes(f.q.toLowerCase())) && /(^|[^a-z0-9])(a1|a2)([^a-z0-9]|$)|perpetuo|perpétuo/i.test(m.nome));
        return {
          nomes,
          gasto: new Map(nomes.filter((n) => gastoMeta[n.campaignId]).map((n) => [n.campaignId, gastoMeta[n.campaignId]])),
          decisoes: new Map(t.decisoes.map((d) => [`${d.projectId}:${d.campaignId}`, d])),
        };
      },
      detalhe: async (projectId: string, campaignId: string) => {
        const m = meta.find((x) => x.projectId === projectId && x.campaignId === campaignId);
        return m ? { nome: m.nome, primeiroGasto: gastoMeta[campaignId]?.de ?? null } : undefined;
      },
      decisao: async (projectId: string, campaignId: string) => t.decisoes.find((d) => d.projectId === projectId && d.campaignId === campaignId),
      porNomeAntigo: async (nome: string) => t.campanhas.find((c) => c.origin === "legado" && c.metaCampaignName === nome),
    },
    experts: {
      listar: async (inativos: boolean) => ativos(t.experts, inativos),
      porCode: async (code: string) => t.experts.find((x) => x.code === code),
      porProjeto: async (projectId: string) => t.experts.find((x) => x.projectId === projectId),
      contagens: async () => ({ produtos: new Map(), funis: new Map(), ofertas: new Map(), lps: new Map() }),
      filhosAtivos: async (expertId: string) => ({
        produtos: t.produtos.filter((x) => x.expertId === expertId && x.active),
        funis: t.funis.filter((x) => x.expertId === expertId && x.active),
        ofertas: t.ofertas.filter((x) => x.expertId === expertId && x.active),
        lps: t.lps.filter((x) => x.expertId === expertId && x.active),
        variaveisDeVsl: t.vslVariaveis.filter((x) => x.expertId === expertId && x.active),
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
  return { repo: repo as unknown as Repositorio, t, campanhas, changelog, meta, gastoMeta };
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
    mem.campanhas.push({ id: "c1", name: "bbe_a01_churrasco_of02_perpetuo_2026_hot_cbo_videos_lpa", offerId: of02.id, expertId: bbe.id });

    const del = await app.inject({ method: "DELETE", url: `/api/nomenclatura/ofertas/${of02.id}` });
    expect(del.statusCode).toBe(409);
    expect(del.json()).toMatchObject({ podeDesativar: true, referencias: [{ tipo: "campanha", id: "c1", rotulo: "bbe_a01_churrasco_of02_perpetuo_2026_hot_cbo_videos_lpa" }] });
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
    expect(impacto.json()).toEqual({ produtos: 1, funis: 1, ofertas: 2, lps: 1, variaveisDeVsl: 0 });
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

  // ─────────────── Story 47.3: campanhas, snapshot, validador ───────────────
  async function dicionarioBase(app: FastifyInstance) {
    for (const [type, values] of Object.entries({ year: ["2026"], temperature: ["hot"], auction: ["cbo"], format: ["videos"] })) {
      for (const value of values) await app.inject({ method: "POST", url: "/api/nomenclatura/dicionario", payload: { type, value } });
    }
  }

  it("AC 3/4 (servidor): POST campanha grava o nome gerado, ignora `name` do body, e o sufixo entra no fim", async () => {
    const { bbe, churrasco, a01, of01 } = await cenario(app);
    await dicionarioBase(app);
    const lpa = (await app.inject({ method: "POST", url: "/api/nomenclatura/lps", payload: { expertId: bbe.id, productId: churrasco.id, funnelId: a01.id, offerId: of01.id } })).json();
    const r = await app.inject({ method: "POST", url: "/api/nomenclatura/campanhas", payload: { expertId: bbe.id, productId: churrasco.id, funnelId: a01.id, offerId: of01.id, landingPageId: lpa.id, year: "2026", temperature: "hot", auction: "cbo", format: "videos", name: "hackeado" } });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ name: "bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_lpa", offerValue: "of01", lpValue: "lpa", expertCode: "bbe", productSlug: "churrasco", lpSlug: "bbe-churrasco-a01-of01-lpa" });
    const comSufixo = await app.inject({ method: "POST", url: "/api/nomenclatura/campanhas", payload: { expertId: bbe.id, productId: churrasco.id, funnelId: a01.id, offerId: null, landingPageId: null, lpValue: "na", year: "2026", temperature: "hot", auction: "cbo", format: "videos", suffix: "v02" } });
    expect(comSufixo.json()).toMatchObject({ name: "bbe_a01_churrasco_ofmix_perpetuo_2026_hot_cbo_videos_na_v02", offerValue: "ofmix", offerId: null, lpValue: "na" });
    expect(mem.changelog.filter((l) => l.entity === "naming_campaigns" && l.action === "create")).toHaveLength(2);
    // agora a oferta está USADA: código trava, descrição não
    const troca = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ofertas/${of01.id}`, payload: { code: "of07" } });
    expect(troca.statusCode).toBe(409);
    expect(troca.json()).toMatchObject({ usadoEm: 1 });
  });

  it("regra 8: valor fora do dicionário vigente e registro inativo não entram em nome novo", async () => {
    const { bbe, churrasco, a01, of01, of02 } = await cenario(app);
    await dicionarioBase(app);
    const base = { expertId: bbe.id, productId: churrasco.id, funnelId: a01.id, offerId: of01.id, landingPageId: null, lpValue: "na", year: "2026", temperature: "hot", auction: "cbo" };
    const formato = await app.inject({ method: "POST", url: "/api/nomenclatura/campanhas", payload: { ...base, format: "carrossel" } });
    expect(formato.statusCode).toBe(422);
    expect(formato.json().error).toContain('campo 9 (formato): "carrossel"');
    await app.inject({ method: "POST", url: `/api/nomenclatura/ofertas/${of02.id}/desativar` });
    const inativa = await app.inject({ method: "POST", url: "/api/nomenclatura/campanhas", payload: { ...base, offerId: of02.id, format: "videos" } });
    expect(inativa.statusCode).toBe(422);
    expect(inativa.json()).toMatchObject({ campo: "offerId" });
    // ...mas o validador de nome antigo aceita a oferta inativa, com aviso
    const val = await app.inject({ method: "POST", url: "/api/nomenclatura/validar-nome", payload: { name: "bbe_a01_churrasco_of02_perpetuo_2026_hot_cbo_videos_na" } });
    expect(val.json()).toMatchObject({ valid: true, avisos: ["campo 4 (oferta): of02 está inativa"] });
  });

  it("AC 8 (campanha): produto de outro expert → 422; LP de outra oferta → 422; com ofmix a LP de qualquer oferta serve", async () => {
    const { bbe, fz, churrasco, a01, of01, of02 } = await cenario(app);
    await dicionarioBase(app);
    const hamb = (await app.inject({ method: "POST", url: "/api/nomenclatura/produtos", payload: { expertId: fz.id, slug: "hamburguer", name: "H" } })).json();
    const base = { expertId: bbe.id, productId: churrasco.id, funnelId: a01.id, offerId: of01.id, landingPageId: null, lpValue: "na", year: "2026", temperature: "hot", auction: "cbo", format: "videos" };
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/campanhas", payload: { ...base, productId: hamb.id } })).json()).toMatchObject({ campo: "productId" });
    const lpDaOf02 = (await app.inject({ method: "POST", url: "/api/nomenclatura/lps", payload: { expertId: bbe.id, productId: churrasco.id, funnelId: a01.id, offerId: of02.id } })).json();
    const errada = await app.inject({ method: "POST", url: "/api/nomenclatura/campanhas", payload: { ...base, landingPageId: lpDaOf02.id } });
    expect(errada.statusCode).toBe(422);
    expect(errada.json().error).toContain("outra oferta");
    const ofmix = await app.inject({ method: "POST", url: "/api/nomenclatura/campanhas", payload: { ...base, offerId: null, landingPageId: lpDaOf02.id } });
    expect(ofmix.statusCode).toBe(201);
    expect(ofmix.json().name).toBe("bbe_a01_churrasco_ofmix_perpetuo_2026_hot_cbo_videos_lpa");
  });

  it("AC 11 (servidor): publicada não muda de nome (409); notas e id da Meta seguem editáveis; recalcula o nome enquanto não publicada", async () => {
    const { bbe, churrasco, a01, of01 } = await cenario(app);
    await dicionarioBase(app);
    await app.inject({ method: "POST", url: "/api/nomenclatura/dicionario", payload: { type: "temperature", value: "cold" } });
    const base = { expertId: bbe.id, productId: churrasco.id, funnelId: a01.id, offerId: of01.id, landingPageId: null, lpValue: "na", year: "2026", temperature: "hot", auction: "cbo", format: "videos" };
    const c = (await app.inject({ method: "POST", url: "/api/nomenclatura/campanhas", payload: base })).json();
    const fria = await app.inject({ method: "PATCH", url: `/api/nomenclatura/campanhas/${c.id}`, payload: { temperature: "cold" } });
    expect(fria.json().name).toBe("bbe_a01_churrasco_of01_perpetuo_2026_cold_cbo_videos_na");
    const pub = await app.inject({ method: "POST", url: `/api/nomenclatura/campanhas/${c.id}/publicar`, payload: { metaCampaignId: "123" } });
    expect(pub.json().publishedAt).toBeTruthy();
    expect(mem.changelog.at(-1)).toMatchObject({ action: "publish", entityId: c.id });
    const congelada = await app.inject({ method: "PATCH", url: `/api/nomenclatura/campanhas/${c.id}`, payload: { temperature: "hot" } });
    expect(congelada.statusCode).toBe(409);
    expect(congelada.json().error).toContain("congelado");
    const notas = await app.inject({ method: "PATCH", url: `/api/nomenclatura/campanhas/${c.id}`, payload: { notes: "campanha do fim de semana" } });
    expect(notas.statusCode).toBe(200);
    expect(notas.json().notes).toBe("campanha do fim de semana");
    const lista = (await app.inject({ method: "GET", url: `/api/nomenclatura/campanhas?expertId=${bbe.id}` })).json();
    expect(lista.total).toBe(1);
    expect(lista.itens[0]).toMatchObject({ name: "bbe_a01_churrasco_of01_perpetuo_2026_cold_cbo_videos_na", funnelRotulo: "a01 — VSL direto para checkout", offerRotulo: "of01 — oferta com ticket médio de R$ 347" });
  });

  it("snapshot: só ativos por padrão, com inativos=1 inclui", async () => {
    const { of02 } = await cenario(app);
    await app.inject({ method: "POST", url: `/api/nomenclatura/ofertas/${of02.id}/desativar` });
    const ativos = (await app.inject({ method: "GET", url: "/api/nomenclatura/dicionario/snapshot" })).json();
    expect(ativos.ofertas.map((o: { code: string }) => o.code)).toEqual(["of01"]);
    const todos = (await app.inject({ method: "GET", url: "/api/nomenclatura/dicionario/snapshot?inativos=1" })).json();
    expect(todos.ofertas.map((o: { code: string; active: boolean }) => [o.code, o.active])).toEqual([["of01", true], ["of02", false]]);
  });

  it("banco sem as tabelas (42P01) → 503 com a mensagem de migration pendente, não 500", async () => {
    const original = mem.repo.experts.listar;
    mem.repo.experts.listar = (async () => {
      const erroDoDriver = Object.assign(new Error('relation "naming_experts" does not exist'), { code: "42P01" });
      throw Object.assign(new Error("Failed query: select ..."), { cause: erroDoDriver });
    }) as unknown as typeof original;
    const r = await app.inject({ method: "GET", url: "/api/nomenclatura/experts" });
    mem.repo.experts.listar = original;
    expect(r.statusCode).toBe(503);
    expect(r.json()).toMatchObject({ codigo: "migration-pendente" });
    expect(r.json().error).toContain("migration 0142");
  });

  it("AC 1 (rota): ?expertId devolve só o que é daquele expert", async () => {
    const { bbe, fz } = await cenario(app);
    await app.inject({ method: "POST", url: "/api/nomenclatura/produtos", payload: { expertId: fz.id, slug: "hamburguer", name: "H" } });
    await app.inject({ method: "POST", url: "/api/nomenclatura/funis", payload: { expertId: fz.id, code: "a01", description: "Quiz" } });
    const pBbe = (await app.inject({ method: "GET", url: `/api/nomenclatura/produtos?expertId=${bbe.id}` })).json();
    const pFz = (await app.inject({ method: "GET", url: `/api/nomenclatura/produtos?expertId=${fz.id}` })).json();
    const fFz = (await app.inject({ method: "GET", url: `/api/nomenclatura/funis?expertId=${fz.id}` })).json();
    const oFz = (await app.inject({ method: "GET", url: `/api/nomenclatura/ofertas?expertId=${fz.id}` })).json();
    expect(pBbe.map((p: { slug: string }) => p.slug)).toEqual(["churrasco"]);
    expect(pFz.map((p: { slug: string }) => p.slug)).toEqual(["hamburguer"]);
    expect(fFz.map((f: { rotulo: string }) => f.rotulo)).toEqual(["a01 — Quiz"]);
    expect(oFz).toEqual([]);
  });

  // ─────────────── Story 47.5: legadas ───────────────
  const PROJ_BBE = "50000000-0000-4000-8000-000000000001";
  const PROJ_DG = "50000000-0000-4000-8000-000000000002";
  async function legadasBase(app: FastifyInstance) {
    const c = await cenario(app);
    await dicionarioBase(app);
    await app.inject({ method: "PATCH", url: `/api/nomenclatura/experts/${c.bbe.id}`, payload: { projectId: PROJ_BBE } });
    await app.inject({ method: "POST", url: "/api/nomenclatura/dicionario", payload: { type: "temperature", value: "cold" } });
    mem.meta.push(
      { projectId: PROJ_BBE, projeto: "BBE", campaignId: "111", nome: "bbe-a1-jul-26--venda--perpetuo--hot_cbo_videos", statusMeta: "ACTIVE" },
      { projectId: PROJ_BBE, projeto: "BBE", campaignId: "222", nome: "bbe-a10-lancamento-abril", statusMeta: "PAUSED" },
      { projectId: PROJ_DG, projeto: "DG & CPDF", campaignId: "333", nome: "[VENDAS] [PERPETUO] [CPF] [FRIO] - Manutenção", statusMeta: "ACTIVE" },
    );
    mem.gastoMeta["111"] = { spend: 1234.5, de: "2026-07-09", ate: "2026-09-01" };
    return c;
  }

  it("47.5 AC7: lista só o que casa com o filtro, com gasto, expert do projeto e sugestão; ordena por gasto", async () => {
    await legadasBase(app);
    const r = (await app.inject({ method: "GET", url: "/api/nomenclatura/legadas" })).json();
    expect(r.itens.map((i: { campaignId: string }) => i.campaignId)).toEqual(["111", "333"]); // a10 fica de fora
    expect(r.itens[0]).toMatchObject({ gasto: 1234.5, de: "2026-07-09", expert: { code: "bbe" }, decisao: null });
    expect(r.itens[0].sugestao.campos).toMatchObject({ expert: "bbe", funnel: "a01", product: "churrasco", year: "2026", temperature: "hot", auction: "cbo", format: "videos" });
    expect(r.itens[1]).toMatchObject({ expert: null, gasto: 0 });
    expect(r.itens[1].sugestao.campos).toMatchObject({ temperature: "cold" });
    expect(r.resumo).toEqual({ total: 2, pendentes: 2, gastoPendente: 1234.5 });
  });

  // ─────────────── Story 47.9: Nome VSL ───────────────
  async function vslBase(app: FastifyInstance) {
    const c = await cenario(app);
    const post = async (url: string, payload: Record<string, unknown>) => (await app.inject({ method: "POST", url, payload })).json();
    const lead = await post("/api/nomenclatura/vsl/variaveis", { expertId: c.bbe.id, type: "lead", code: "Demissão", description: "quem foi demitido" });
    const problem = await post("/api/nomenclatura/vsl/variaveis", { expertId: c.bbe.id, type: "problem", code: "falta-de-metodo", description: "tenta sozinho" });
    const solution = await post("/api/nomenclatura/vsl/variaveis", { expertId: c.bbe.id, type: "solution", code: "agente-pronto", description: "agente pronto" });
    return { ...c, lead, problem, solution };
  }

  it("47.9 AC3/AC4: variável normaliza o código, é única por (expert, tipo) inclusive inativa, com a descrição no conflito; mesmo código em tipos diferentes coexiste", async () => {
    const { bbe, lead } = await vslBase(app);
    expect(lead).toMatchObject({ code: "demissao", type: "lead", rotulo: "demissao — quem foi demitido", usadoEm: 0 });
    const dup = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: bbe.id, type: "lead", code: "demissao", description: "outra" } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('demissao já existe para bbe (lead): "quem foi demitido".');
    await app.inject({ method: "POST", url: `/api/nomenclatura/vsl/variaveis/${lead.id}/desativar` });
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: bbe.id, type: "lead", code: "demissao", description: "x" } })).statusCode).toBe(409);
    const outroTipo = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: bbe.id, type: "problem", code: "demissao", description: "como problema" } });
    expect(outroTipo.statusCode).toBe(201);
    const sublinhado = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: bbe.id, type: "solution", code: "agente_pronto", description: "x" } });
    expect(sublinhado.statusCode).toBe(400);
    const semDescricao = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: bbe.id, type: "solution", code: "novo", description: "" } });
    expect(semDescricao.statusCode).toBe(400);
    // listagem por expert e tipo; inativos só com o flag
    const lista = (await app.inject({ method: "GET", url: `/api/nomenclatura/vsl/variaveis?expertId=${bbe.id}&type=lead` })).json();
    expect(lista).toEqual([]);
    const comInativos = (await app.inject({ method: "GET", url: `/api/nomenclatura/vsl/variaveis?expertId=${bbe.id}&type=lead&inativos=1` })).json();
    expect(comInativos.map((v: { code: string }) => v.code)).toEqual(["demissao"]);
  });

  it("47.9 AC2/AC5/AC9: POST vsls grava o nome gerado (oferta = pitch), ignora `name` do body; nome duplicado → 409; changelog", async () => {
    const { bbe, churrasco, of01, lead, problem, solution } = await vslBase(app);
    const corpo = { expertId: bbe.id, productId: churrasco.id, leadId: lead.id, problemId: problem.id, solutionId: solution.id, offerId: of01.id, name: "hackeado" };
    const r = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/vsls", payload: corpo });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ name: "vsl_bbe_churrasco_demissao_falta-de-metodo_agente-pronto_of01", leadValue: "demissao", offerValue: "of01", expertCode: "bbe", productSlug: "churrasco", leadRotulo: "demissao — quem foi demitido", offerRotulo: "of01 — oferta com ticket médio de R$ 347" });
    expect(mem.changelog.at(-1)).toMatchObject({ entity: "naming_vsls", action: "create" });
    const dup = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/vsls", payload: corpo });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toContain("Já existe uma VSL com este nome");
    const lista = (await app.inject({ method: "GET", url: `/api/nomenclatura/vsl/vsls?expertId=${bbe.id}&q=demissao` })).json();
    expect(lista.total).toBe(1);
    // validador: reconhece o nome; nome com prefixo errado é inválido
    const val = (await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/validar-nome", payload: { name: r.json().name } })).json();
    expect(val.valid).toBe(true);
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/validar-nome", payload: { name: "ad_bbe_churrasco_demissao_falta-de-metodo_agente-pronto_of01" } })).json().valid).toBe(false);
  });

  it("47.9 AC2/AC3: coerência — variável de outro expert → 422; variável do TIPO errado → 422; inativa → 422", async () => {
    const { bbe, fz, churrasco, of01, lead, problem, solution } = await vslBase(app);
    const leadDoFz = (await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: fz.id, type: "lead", code: "outro", description: "x" } })).json();
    const base = { expertId: bbe.id, productId: churrasco.id, leadId: lead.id, problemId: problem.id, solutionId: solution.id, offerId: of01.id };
    const outroExpert = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/vsls", payload: { ...base, leadId: leadDoFz.id } });
    expect(outroExpert.statusCode).toBe(422);
    expect(outroExpert.json()).toMatchObject({ campo: "leadId" });
    const tipoErrado = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/vsls", payload: { ...base, problemId: lead.id } });
    expect(tipoErrado.statusCode).toBe(422);
    expect(tipoErrado.json().error).toContain("é lead, não mecanismo do problema");
    await app.inject({ method: "POST", url: `/api/nomenclatura/vsl/variaveis/${solution.id}/desativar` });
    const inativa = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/vsls", payload: base });
    expect(inativa.statusCode).toBe(422);
    expect(inativa.json()).toMatchObject({ campo: "solutionId" });
  });

  it("47.9 AC3: variável usada em VSL trava o código (409 com usadoEm), descrição segue editável; excluir é bloqueado com a lista e podeDesativar; a OFERTA conta a VSL como uso", async () => {
    const { bbe, churrasco, of01, lead, problem, solution } = await vslBase(app);
    await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/vsls", payload: { expertId: bbe.id, productId: churrasco.id, leadId: lead.id, problemId: problem.id, solutionId: solution.id, offerId: of01.id } });
    const troca = await app.inject({ method: "PATCH", url: `/api/nomenclatura/vsl/variaveis/${lead.id}`, payload: { code: "demitido" } });
    expect(troca.statusCode).toBe(409);
    expect(troca.json()).toMatchObject({ usadoEm: 1 });
    const desc = await app.inject({ method: "PATCH", url: `/api/nomenclatura/vsl/variaveis/${lead.id}`, payload: { description: "quem perdeu o emprego" } });
    expect(desc.statusCode).toBe(200);
    expect(mem.changelog.at(-1)).toMatchObject({ entity: "naming_vsl_variables", action: "update", before: { description: "quem foi demitido" }, after: { description: "quem perdeu o emprego" } });
    const del = await app.inject({ method: "DELETE", url: `/api/nomenclatura/vsl/variaveis/${problem.id}` });
    expect(del.statusCode).toBe(409);
    expect(del.json()).toMatchObject({ podeDesativar: true, referencias: [{ tipo: "vsl", rotulo: "vsl_bbe_churrasco_demissao_falta-de-metodo_agente-pronto_of01" }] });
    // a oferta: usadoEm soma a VSL; código travado; excluir bloqueado por vsl
    const ofertas = (await app.inject({ method: "GET", url: `/api/nomenclatura/ofertas?expertId=${bbe.id}` })).json();
    expect(ofertas.find((o: { id: string }) => o.id === of01.id).usadoEm).toBe(1);
    expect((await app.inject({ method: "PATCH", url: `/api/nomenclatura/ofertas/${of01.id}`, payload: { code: "of07" } })).statusCode).toBe(409);
    const delOferta = await app.inject({ method: "DELETE", url: `/api/nomenclatura/ofertas/${of01.id}` });
    expect(delOferta.json().referencias.some((r: { tipo: string }) => r.tipo === "vsl")).toBe(true);
    // gate QA-479-01: o PRODUTO também entra no nome da VSL — usadoEm e slug travado
    const produtos = (await app.inject({ method: "GET", url: `/api/nomenclatura/produtos?expertId=${bbe.id}` })).json();
    expect(produtos.find((p: { id: string }) => p.id === churrasco.id).usadoEm).toBe(1);
    const slug = await app.inject({ method: "PATCH", url: `/api/nomenclatura/produtos/${churrasco.id}`, payload: { slug: "churrasco-premium" } });
    expect(slug.statusCode).toBe(409);
    expect(slug.json()).toMatchObject({ usadoEm: 1 });
  });

  it("47.9 AC3: desativar o expert desativa as variáveis de VSL em cascata, e o impacto conta", async () => {
    const { bbe } = await vslBase(app);
    const impacto = (await app.inject({ method: "GET", url: `/api/nomenclatura/experts/${bbe.id}/impacto-da-desativacao` })).json();
    expect(impacto.variaveisDeVsl).toBe(3);
    const r = (await app.inject({ method: "POST", url: `/api/nomenclatura/experts/${bbe.id}/desativar` })).json();
    expect(r.desativados.variaveisDeVsl).toBe(3);
    expect(mem.t.vslVariaveis.every((v) => !v.active)).toBe(true);
  });

  it("47.9 AC9: PATCH recalcula o nome quando muda um campo; guest → 403", async () => {
    const { bbe, churrasco, of01, of02, lead, problem, solution } = await vslBase(app);
    const v = (await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/vsls", payload: { expertId: bbe.id, productId: churrasco.id, leadId: lead.id, problemId: problem.id, solutionId: solution.id, offerId: of01.id } })).json();
    const r = await app.inject({ method: "PATCH", url: `/api/nomenclatura/vsl/vsls/${v.id}`, payload: { offerId: of02.id } });
    expect(r.json().name).toBe("vsl_bbe_churrasco_demissao_falta-de-metodo_agente-pronto_of02");
    expect(r.json().offerValue).toBe("of02");
    const guest = await app.inject({ method: "GET", url: "/api/nomenclatura/vsl/vsls", headers: { "x-papel": "guest" } });
    expect(guest.statusCode).toBe(403);
  });

  // ─────────────── Story 47.10: Nome de anúncio ───────────────
  async function adsBase(app: FastifyInstance) {
    const c = await cenario(app);
    for (const [type, values] of Object.entries({ creative_type: ["ad", "adv", "carr"], launch_type: ["pg", "l", "m", "pr"] })) {
      for (const value of values) await app.inject({ method: "POST", url: "/api/nomenclatura/dicionario", payload: { type, value, description: value } });
    }
    return c;
  }
  const corpoBase = (expertId: string) => ({ expertId, creativeType: "adv", launchType: "pg", launchSeq: 2, date: "09-2026" });

  it("47.10 AC2: os dois tipos novos passam pelo CRUD de valores fixos, com usadoEm por anúncio e código travado quando usado", async () => {
    const { bbe } = await adsBase(app);
    const tipos = (await app.inject({ method: "GET", url: "/api/nomenclatura/dicionario?type=creative_type" })).json();
    expect(tipos.map((v: { value: string }) => v.value)).toEqual(["ad", "adv", "carr"]);
    await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: corpoBase(bbe.id) });
    const depois = (await app.inject({ method: "GET", url: "/api/nomenclatura/dicionario?type=creative_type" })).json();
    expect(depois.find((v: { value: string }) => v.value === "adv").usadoEm).toBe(1);
    const adv = depois.find((v: { value: string }) => v.value === "adv");
    expect((await app.inject({ method: "PATCH", url: `/api/nomenclatura/dicionario/${adv.id}`, payload: { value: "vid" } })).statusCode).toBe(409);
    const del = await app.inject({ method: "DELETE", url: `/api/nomenclatura/dicionario/${adv.id}` });
    expect(del.json()).toMatchObject({ podeDesativar: true, referencias: [{ tipo: "anuncio", rotulo: "adv01_bbe_pg02_09-2026--" }] });
  });

  it("47.10 AC3/AC4/AC8: NN sequencial ÚNICO por expert, qualquer tipo; sugestão pula os usados; NN ocupado → 409 com o dono e o próximo; estrutura e nome gravados", async () => {
    const { bbe, fz } = await adsBase(app);
    const p0 = (await app.inject({ method: "GET", url: `/api/nomenclatura/ads/proximo?expertId=${bbe.id}` })).json();
    expect(p0).toEqual({ creativeSeq: 1, creativeSeqTexto: "01", launchSeqSugerido: null });
    const a1 = (await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), description: "Gancho Demissão" } })).json();
    expect(a1).toMatchObject({ creativeSeq: 1, structure: "adv01_bbe_pg02_09-2026--", name: "adv01_bbe_pg02_09-2026--gancho-demissao", adDate: "2026-09-01", expertCode: "bbe" });
    const a2 = (await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), creativeType: "ad" } })).json();
    expect(a2.structure).toBe("ad02_bbe_pg02_09-2026--"); // Q3: 2º criativo do expert, mesmo sendo outro tipo
    // fz tem a própria sequência
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: corpoBase(fz.id) })).json().creativeSeq).toBe(1);
    // sugestão pula 01 e 02; o número do lançamento sugerido é o maior usado para (expert, sigla)
    const p = (await app.inject({ method: "GET", url: `/api/nomenclatura/ads/proximo?expertId=${bbe.id}&launchType=pg` })).json();
    expect(p).toEqual({ creativeSeq: 3, creativeSeqTexto: "03", launchSeqSugerido: 2 });
    // NN ocupado → 409 com quem ocupa e o próximo livre
    const corrida = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), creativeSeq: 1 } });
    expect(corrida.statusCode).toBe(409);
    expect(corrida.json()).toMatchObject({ campo: "creativeSeq", sugestao: "03" });
    expect(corrida.json().error).toContain("já é de adv01_bbe_pg02_09-2026--gancho-demissao");
    expect(mem.changelog.filter((l) => l.entity === "naming_ads" && l.action === "create")).toHaveLength(3);
  });

  it("47.10 AC4/AC6: tipo/sigla fora do dicionário ou inativos → 422; data fora de mm-aaaa e descrição com _ → 400; guest → 403", async () => {
    const { bbe } = await adsBase(app);
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), creativeType: "img" } })).json()).toMatchObject({ campo: "creativeType" });
    const carr = (await app.inject({ method: "GET", url: "/api/nomenclatura/dicionario?type=creative_type" })).json().find((v: { value: string }) => v.value === "carr");
    await app.inject({ method: "POST", url: `/api/nomenclatura/dicionario/${carr.id}/desativar` });
    const inativo = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), creativeType: "carr" } });
    expect(inativo.statusCode).toBe(422);
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), date: "2026-09" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), description: "gancho_dor" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/nomenclatura/ads", headers: { "x-papel": "guest" } })).statusCode).toBe(403);
    // validador: reconhece; carr inativo vira aviso
    const val = (await app.inject({ method: "POST", url: "/api/nomenclatura/ads/validar-nome", payload: { name: "carr05_bbe_pg02_09-2026--x" } })).json();
    expect(val.valid).toBe(true);
    expect(val.avisos).toEqual(["campo 1 (criativo): carr está inativo"]);
  });

  it("47.10 AC9: PATCH muda descrição/lançamento/data e recalcula; tipo e NN do criativo não são aceitos (D23); listagem filtra por expert, tipo, sigla e período", async () => {
    const { bbe } = await adsBase(app);
    const a = (await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: corpoBase(bbe.id) })).json();
    const r = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: { description: "prova social", launchSeq: 3, date: "10-2026" } });
    expect(r.json()).toMatchObject({ structure: "adv01_bbe_pg03_10-2026--", name: "adv01_bbe_pg03_10-2026--prova-social", creativeSeq: 1 });
    // NN/tipo no corpo do PATCH: ignorados pelo schema (não são campos aceitos) — o NN continua 1
    const tenta = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: { creativeSeq: 9, creativeType: "ad", notes: "n" } });
    expect(tenta.json()).toMatchObject({ creativeSeq: 1, creativeType: "adv", notes: "n" });
    await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), creativeType: "ad", launchType: "l", date: "08-2026" } });
    const lista = (await app.inject({ method: "GET", url: `/api/nomenclatura/ads?expertId=${bbe.id}&creativeType=ad` })).json();
    expect(lista.total).toBe(1);
    expect(lista.itens[0].structure).toBe("ad02_bbe_l02_08-2026--");
    const periodo = (await app.inject({ method: "GET", url: `/api/nomenclatura/ads?de=09-2026&ate=12-2026` })).json();
    expect(periodo.itens.map((x: { structure: string }) => x.structure)).toEqual(["adv01_bbe_pg03_10-2026--"]);
  });

  it("47.8 AC6: campanha do gerador com id da Meta colado NÃO aparece na fila de legadas (o nome v2 casa com o filtro)", async () => {
    const { bbe, churrasco, a01, of01 } = await legadasBase(app);
    // 111 é legada pendente; agora uma campanha do gerador é publicada com metaCampaignId = 111
    const c = (await app.inject({ method: "POST", url: "/api/nomenclatura/campanhas", payload: { expertId: bbe.id, productId: churrasco.id, funnelId: a01.id, offerId: of01.id, landingPageId: null, lpValue: "na", year: "2026", temperature: "hot", auction: "cbo", format: "videos" } })).json();
    expect(c.name).toContain("_perpetuo_");
    await app.inject({ method: "POST", url: `/api/nomenclatura/campanhas/${c.id}/publicar`, payload: { metaCampaignId: "111" } });
    const r = (await app.inject({ method: "GET", url: "/api/nomenclatura/legadas" })).json();
    expect(r.itens.map((i: { campaignId: string }) => i.campaignId)).toEqual(["333"]);
    expect(r.resumo).toEqual({ total: 1, pendentes: 1, gastoPendente: 0 });
    // `todas` também não a traz: vinculada não é legada em nenhuma fila
    const todas = (await app.inject({ method: "GET", url: "/api/nomenclatura/legadas?fila=todas" })).json();
    expect(todas.itens.map((i: { campaignId: string }) => i.campaignId)).toEqual(["333"]);
  });

  it("47.8 AC5 (T5): recalcular renomeia só as NÃO publicadas no padrão antigo, com changelog; é idempotente", async () => {
    const { bbe, churrasco, a01, of01 } = await cenario(app);
    await dicionarioBase(app);
    const base = { expertId: bbe.id, productId: churrasco.id, funnelId: a01.id, offerId: of01.id, offerValue: "of01", landingPageId: null, lpValue: "na", year: "2026", temperature: "hot", auction: "cbo", format: "videos", suffix: null };
    // duas linhas gravadas "ontem", no padrão v1; uma publicada (congelada) e uma não
    await mem.repo.inserir("campanhas", { ...base, name: "bbe_churrasco_a01_of01_2026_hot_cbo_videos_na", publishedAt: null } as never, null);
    await mem.repo.inserir("campanhas", { ...base, name: "bbe_churrasco_a01_of01_2026_hot_cbo_videos_na_v02", suffix: "v02", publishedAt: new Date("2026-09-09") } as never, null);
    const { recalcularNomesNaoPublicados } = await import("../services/nomenclatura/campanhas.js");
    const r1 = await recalcularNomesNaoPublicados(mem.repo, null);
    expect(r1.examinadas).toBe(1);
    expect(r1.renomeadas).toEqual([{ id: expect.any(String), de: "bbe_churrasco_a01_of01_2026_hot_cbo_videos_na", para: "bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_na" }]);
    expect(mem.t.campanhas.map((c) => c.name).sort()).toEqual(["bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_na", "bbe_churrasco_a01_of01_2026_hot_cbo_videos_na_v02"]);
    expect(mem.changelog.at(-1)).toMatchObject({ entity: "naming_campaigns", action: "update", before: { name: "bbe_churrasco_a01_of01_2026_hot_cbo_videos_na" }, after: { name: "bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_na" } });
    const r2 = await recalcularNomesNaoPublicados(mem.repo, null);
    expect(r2.renomeadas).toEqual([]);
  });

  it("47.5 AC8/AC9: classifica uma vez (nasce publicada no 1º gasto, origem legado, nome antigo guardado); 2ª → 409; desfazer apaga o registro", async () => {
    const { churrasco, a01, of01 } = await legadasBase(app);
    const corpo = { productId: churrasco.id, funnelId: a01.id, offerId: of01.id, landingPageId: null, lpValue: "na", year: "2026", temperature: "hot", auction: "cbo", format: "videos", expertId: "ignorado" };
    const r = await app.inject({ method: "POST", url: `/api/nomenclatura/legadas/${PROJ_BBE}/111/classificar`, payload: corpo });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ origin: "legado", metaCampaignId: "111", metaCampaignName: "bbe-a1-jul-26--venda--perpetuo--hot_cbo_videos", name: "bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_na" });
    expect(String(r.json().publishedAt)).toContain("2026-07-09");
    const de_novo = await app.inject({ method: "POST", url: `/api/nomenclatura/legadas/${PROJ_BBE}/111/classificar`, payload: corpo });
    expect(de_novo.statusCode).toBe(409);
    const lista = (await app.inject({ method: "GET", url: "/api/nomenclatura/legadas?fila=classificadas" })).json();
    expect(lista.itens.map((i: { campaignId: string }) => i.campaignId)).toEqual(["111"]);
    // publicada: não muda de nome
    const patch = await app.inject({ method: "PATCH", url: `/api/nomenclatura/campanhas/${r.json().id}`, payload: { temperature: "cold" } });
    expect(patch.statusCode).toBe(409);
    // validador reconhece o nome antigo
    const val = (await app.inject({ method: "POST", url: "/api/nomenclatura/validar-nome", payload: { name: "bbe-a1-jul-26--venda--perpetuo--hot_cbo_videos" } })).json();
    expect(val.valid).toBe(false);
    expect(val.legado).toMatchObject({ campanhaId: r.json().id, name: "bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_na" });
    // desfazer: apaga campanha E decisão; volta para a fila
    const del = await app.inject({ method: "DELETE", url: `/api/nomenclatura/legadas/${PROJ_BBE}/111/decisao` });
    expect(del.statusCode).toBe(204);
    expect(mem.t.campanhas).toHaveLength(0);
    expect(mem.changelog.filter((l) => l.entity === "naming_campaigns").map((l) => l.action)).toEqual(["create", "delete"]);
    const pend = (await app.inject({ method: "GET", url: "/api/nomenclatura/legadas" })).json();
    expect(pend.resumo.pendentes).toBe(2);
  });

  it("47.5 AC1/AC8: sem expert vinculado ao projeto → 422; projeto já vinculado a outro expert → 409", async () => {
    const { fz, churrasco, a01, of01 } = await legadasBase(app);
    const r = await app.inject({ method: "POST", url: `/api/nomenclatura/legadas/${PROJ_DG}/333/classificar`, payload: { productId: churrasco.id, funnelId: a01.id, offerId: of01.id, landingPageId: null, lpValue: "na", year: "2026", temperature: "cold", auction: "cbo", format: "videos" } });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toContain("expert vinculado");
    const dup = await app.inject({ method: "PATCH", url: `/api/nomenclatura/experts/${fz.id}`, payload: { projectId: PROJ_BBE } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toContain("bbe");
  });

  it("47.5 AC9/AC13: ignorar tira da fila com motivo; desfazer volta; classificada não pode ser ignorada", async () => {
    const { churrasco, a01, of01 } = await legadasBase(app);
    const ig = await app.inject({ method: "POST", url: `/api/nomenclatura/legadas/${PROJ_DG}/333/ignorar`, payload: { reason: "é lançamento" } });
    expect(ig.statusCode).toBe(201);
    expect((await app.inject({ method: "GET", url: "/api/nomenclatura/legadas" })).json().itens.map((i: { campaignId: string }) => i.campaignId)).toEqual(["111"]);
    expect((await app.inject({ method: "GET", url: "/api/nomenclatura/legadas?fila=ignoradas" })).json().itens[0]).toMatchObject({ campaignId: "333", decisao: { tipo: "ignorada", reason: "é lançamento" } });
    await app.inject({ method: "DELETE", url: `/api/nomenclatura/legadas/${PROJ_DG}/333/decisao` });
    expect((await app.inject({ method: "GET", url: "/api/nomenclatura/legadas" })).json().resumo.pendentes).toBe(2);
    await app.inject({ method: "POST", url: `/api/nomenclatura/legadas/${PROJ_BBE}/111/classificar`, payload: { productId: churrasco.id, funnelId: a01.id, offerId: of01.id, landingPageId: null, lpValue: "na", year: "2026", temperature: "hot", auction: "cbo", format: "videos" } });
    expect((await app.inject({ method: "POST", url: `/api/nomenclatura/legadas/${PROJ_BBE}/111/ignorar`, payload: {} })).statusCode).toBe(409);
  });

  it("id inexistente → 404; id malformado → 400", async () => {
    expect((await app.inject({ method: "PATCH", url: `/api/nomenclatura/funis/${USUARIO}`, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: "/api/nomenclatura/funis/abc", payload: {} })).statusCode).toBe(400);
  });
});
