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
type Escopo = { creativeType: string; launchType: string; launchSeq: number | null };
/** Story 47.18: `launch_seq` NULL do `perpetuo` conta como UM valor (NULLS NOT DISTINCT) — `null === null`. */
const noEscopo = (a: Record<string, unknown>, expertId: string, e: Escopo) => a.expertId === expertId && a.launchType === e.launchType && (a.launchSeq ?? null) === e.launchSeq && a.creativeType === e.creativeType;
type Log = { entity: string; entityId: string; action: string; before: unknown; after: unknown; author: string | null };

function memoria() {
  const t: Record<string, Linha[]> = { experts: [], produtos: [], funis: [], ofertas: [], lps: [], dicionario: [], campanhas: [], decisoes: [], vslVariaveis: [], vsls: [], anuncios: [], adPartes: [] };
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
        // Story 47.13
        origins: f(t.dicionario.filter((v) => v.type === "creative_origin")).map((v) => ({ value: v.value, active: v.active })),
        partes: f(t.adPartes).map((p) => ({ expert: codeDe("experts", p.expertId), type: p.type, code: p.code, active: p.active })),
      };
    },
    anuncios: {
      listar: async (f: Record<string, unknown>) => {
        const itens = t.anuncios.filter((a) => ["expertId", "creativeType", "launchType", "origin", "hookId", "bodyId"].every((k) => !f[k] || a[k] === f[k]) && (!f.q || String(a.name).includes(String(f.q))) && (!f.de || String(a.adDate) >= String(f.de)) && (!f.ate || String(a.adDate) <= String(f.ate)));
        return { itens, total: itens.length };
      },
      // Story 47.18: o NN é do ESCOPO (expert + sigla + nº + tipo) — o mesmo filtro que `predicadoDoEscopoDoNn` monta (provado com PgDialect no teste do repositório)
      seqsDoEscopo: async (expertId: string, e: Escopo) => t.anuncios.filter((a) => noEscopo(a, expertId, e)).map((a) => ({ id: a.id, creativeSeq: a.creativeSeq as number })),
      porSeq: async (expertId: string, e: Escopo, seq: number) => t.anuncios.find((a) => noEscopo(a, expertId, e) && a.creativeSeq === seq),
      maiorLancamento: async (expertId: string, launchType: string) => {
        // Story 47.16 (PO-11): como o `max` do SQL, ignora o NULL do `perpetuo`
        const xs = t.anuncios.filter((a) => a.expertId === expertId && a.launchType === launchType).map((a) => a.launchSeq).filter((x): x is number => typeof x === "number");
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
      codigos: async (expertId: string, type: string) => t.vslVariaveis.filter((x) => x.expertId === expertId && x.type === type).map((x) => x.code as string),
    },
    // Story 47.12: hooks e bodies (mesmo desenho das variáveis de VSL)
    adPartes: {
      listar: async (f: { expertId?: string; type?: string }, inativos: boolean) => ativos(t.adPartes.filter((x) => (!f.expertId || x.expertId === f.expertId) && (!f.type || x.type === f.type)), inativos),
      porCode: async (expertId: string, type: string, code: string) => t.adPartes.find((x) => x.expertId === expertId && x.type === type && x.code === code),
      codigos: async (expertId: string, type: string) => t.adPartes.filter((x) => x.expertId === expertId && x.type === type).map((x) => x.code as string),
    },
    /** 47.13: uso de hook/body conta em `naming_ads` (hookId/bodyId); `usoDePartes` é injeção extra do teste da 47.12. */
    usoDePartes: new Map<string, number>(),
    async usoEmAnuncios(type: string) {
      const col = type === "hook" ? "hookId" : "bodyId";
      const m = new Map(this.usoDePartes);
      for (const a of t.anuncios) if (a[col]) m.set(a[col] as string, (m.get(a[col] as string) ?? 0) + 1);
      return m;
    },
    async anunciosQueUsamParte(i: string) {
      return (this.usoDePartes.get(i) ?? 0) + t.anuncios.filter((a) => a.hookId === i || a.bodyId === i).length;
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
      if (type === "creative_type" || type === "launch_type" || type === "creative_origin") {
        const col = type === "creative_type" ? "creativeType" : type === "launch_type" ? "launchType" : "origin";
        for (const a of t.anuncios) if (a[col]) m.set(a[col] as string, (m.get(a[col] as string) ?? 0) + 1);
        return m;
      }
      for (const c of campanhas) m.set(c[type] as string, (m.get(c[type] as string) ?? 0) + 1);
      return m;
    },
    async campanhasQueUsam(col: string, i: string) {
      return contar(col, i);
    },
    async campanhasComValor(type: string, v: string) {
      if (type === "creative_type" || type === "launch_type" || type === "creative_origin") return t.anuncios.filter((a) => a[type === "creative_type" ? "creativeType" : type === "launch_type" ? "launchType" : "origin"] === v).length;
      return contar(type, v);
    },
    async referenciasDe(e: string, linha: Linha) {
      const refs: { tipo: string; id: string; rotulo: string }[] = [];
      // Story 47.13: hook/body usado em anúncio de vídeo
      if (e === "adPartes") for (const a of t.anuncios.filter((a) => a.hookId === linha.id || a.bodyId === linha.id)) refs.push({ tipo: "anuncio", id: a.id, rotulo: String(a.name) });
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
        // Story 47.12: hooks/bodies do expert entram na cascata
        partesDoVideo: t.adPartes.filter((x) => x.expertId === expertId && x.active),
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
    expect(impacto.json()).toEqual({ produtos: 1, funis: 1, ofertas: 2, lps: 1, variaveisDeVsl: 0, partesDoVideo: 0 });
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
    // sem `code`: o servidor sugere lead01 / pr01 / sol01 (decisão do dono, 2026-09-10)
    const lead = await post("/api/nomenclatura/vsl/variaveis", { expertId: c.bbe.id, type: "lead", description: "quem foi demitido" });
    const problem = await post("/api/nomenclatura/vsl/variaveis", { expertId: c.bbe.id, type: "problem", description: "tenta sozinho" });
    const solution = await post("/api/nomenclatura/vsl/variaveis", { expertId: c.bbe.id, type: "solution", description: "agente pronto" });
    return { ...c, lead, problem, solution };
  }

  it("47.9 AC3/AC4: código é sigla + NN sugerido por (expert, tipo), único inclusive inativo, com a descrição e o próximo no conflito; formato fora da sigla → 400", async () => {
    const { bbe, lead, problem, solution } = await vslBase(app);
    expect(lead).toMatchObject({ code: "lead01", type: "lead", rotulo: "lead01 — quem foi demitido", usadoEm: 0 });
    expect(problem.code).toBe("pr01");
    expect(solution.code).toBe("sol01");
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/vsl/variaveis/proximo-codigo?expertId=${bbe.id}&type=lead` })).json()).toEqual({ codigo: "lead02" });
    const dup = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: bbe.id, type: "lead", code: "lead01", description: "outra" } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('lead01 já existe para bbe (lead): "quem foi demitido". Use lead02.');
    await app.inject({ method: "POST", url: `/api/nomenclatura/vsl/variaveis/${lead.id}/desativar` });
    // inativo continua ocupando o código (regra 4) e a sugestão pula para lead02
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: bbe.id, type: "lead", code: "lead01", description: "x" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: bbe.id, type: "lead", description: "segundo" } })).json().code).toBe("lead02");
    // formato: a sigla é do tipo — "lead01" não vale para problema; texto livre não vale para nada
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: bbe.id, type: "problem", code: "lead01", description: "x" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: bbe.id, type: "solution", code: "agente-pronto", description: "x" } })).statusCode).toBe(400);
    const semDescricao = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: bbe.id, type: "solution", description: "" } });
    expect(semDescricao.statusCode).toBe(400);
    // listagem por expert e tipo; inativos só com o flag
    const lista = (await app.inject({ method: "GET", url: `/api/nomenclatura/vsl/variaveis?expertId=${bbe.id}&type=lead` })).json();
    expect(lista.map((v: { code: string }) => v.code)).toEqual(["lead02"]);
    const comInativos = (await app.inject({ method: "GET", url: `/api/nomenclatura/vsl/variaveis?expertId=${bbe.id}&type=lead&inativos=1` })).json();
    expect(comInativos.map((v: { code: string }) => v.code)).toEqual(["lead01", "lead02"]);
  });

  it("47.9 AC2/AC5/AC9: POST vsls grava o nome gerado (oferta = pitch), ignora `name` do body; nome duplicado → 409; changelog", async () => {
    const { bbe, churrasco, of01, lead, problem, solution } = await vslBase(app);
    const corpo = { expertId: bbe.id, productId: churrasco.id, leadId: lead.id, problemId: problem.id, solutionId: solution.id, offerId: of01.id, name: "hackeado" };
    const r = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/vsls", payload: corpo });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ name: "vsl_bbe_churrasco_lead01_pr01_sol01_of01", leadValue: "lead01", offerValue: "of01", expertCode: "bbe", productSlug: "churrasco", leadRotulo: "lead01 — quem foi demitido", offerRotulo: "of01 — oferta com ticket médio de R$ 347" });
    expect(mem.changelog.at(-1)).toMatchObject({ entity: "naming_vsls", action: "create" });
    const dup = await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/vsls", payload: corpo });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toContain("Já existe uma VSL com este nome");
    const lista = (await app.inject({ method: "GET", url: `/api/nomenclatura/vsl/vsls?expertId=${bbe.id}&q=lead01` })).json();
    expect(lista.total).toBe(1);
    // validador: reconhece o nome; nome com prefixo errado é inválido
    const val = (await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/validar-nome", payload: { name: r.json().name } })).json();
    expect(val.valid).toBe(true);
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/validar-nome", payload: { name: "ad_bbe_churrasco_lead01_pr01_sol01_of01" } })).json().valid).toBe(false);
  });

  it("47.9 AC2/AC3: coerência — variável de outro expert → 422; variável do TIPO errado → 422; inativa → 422", async () => {
    const { bbe, fz, churrasco, of01, lead, problem, solution } = await vslBase(app);
    const leadDoFz = (await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/variaveis", payload: { expertId: fz.id, type: "lead", description: "x" } })).json();
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
    const troca = await app.inject({ method: "PATCH", url: `/api/nomenclatura/vsl/variaveis/${lead.id}`, payload: { code: "lead09" } });
    expect(troca.statusCode).toBe(409);
    expect(troca.json()).toMatchObject({ usadoEm: 1 });
    const desc = await app.inject({ method: "PATCH", url: `/api/nomenclatura/vsl/variaveis/${lead.id}`, payload: { description: "quem perdeu o emprego" } });
    expect(desc.statusCode).toBe(200);
    expect(mem.changelog.at(-1)).toMatchObject({ entity: "naming_vsl_variables", action: "update", before: { description: "quem foi demitido" }, after: { description: "quem perdeu o emprego" } });
    const del = await app.inject({ method: "DELETE", url: `/api/nomenclatura/vsl/variaveis/${problem.id}` });
    expect(del.statusCode).toBe(409);
    expect(del.json()).toMatchObject({ podeDesativar: true, referencias: [{ tipo: "vsl", rotulo: "vsl_bbe_churrasco_lead01_pr01_sol01_of01" }] });
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

  it("47.9 AC9: PATCH recalcula o nome quando muda um campo; link do Drive entra na criação e edita depois; guest → 403", async () => {
    const { bbe, churrasco, of01, of02, lead, problem, solution } = await vslBase(app);
    const v = (await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/vsls", payload: { expertId: bbe.id, productId: churrasco.id, leadId: lead.id, problemId: problem.id, solutionId: solution.id, offerId: of01.id, url: "https://drive.google.com/file/d/abc/view" } })).json();
    expect(v.url).toBe("https://drive.google.com/file/d/abc/view");
    const r = await app.inject({ method: "PATCH", url: `/api/nomenclatura/vsl/vsls/${v.id}`, payload: { offerId: of02.id } });
    expect(r.json().name).toBe("vsl_bbe_churrasco_lead01_pr01_sol01_of02");
    expect(r.json().offerValue).toBe("of02");
    expect(r.json().url).toBe("https://drive.google.com/file/d/abc/view"); // o link não se perde no recálculo
    const semLink = await app.inject({ method: "PATCH", url: `/api/nomenclatura/vsl/vsls/${v.id}`, payload: { url: null } });
    expect(semLink.json().url).toBeNull();
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/vsl/vsls", payload: { expertId: bbe.id, productId: churrasco.id, leadId: lead.id, problemId: problem.id, solutionId: solution.id, offerId: of01.id, url: "drive.google.com/x" } })).statusCode).toBe(400);
    const guest = await app.inject({ method: "GET", url: "/api/nomenclatura/vsl/vsls", headers: { "x-papel": "guest" } });
    expect(guest.statusCode).toBe(403);
  });

  // ─────────────── Story 47.10: Nome de anúncio ───────────────
  async function adsBase(app: FastifyInstance) {
    const c = await cenario(app);
    for (const [type, values] of Object.entries({ creative_type: ["ad", "adv", "carr"], launch_type: ["pg", "l", "m", "pr", "perpetuo"] })) {
      for (const value of values) await app.inject({ method: "POST", url: "/api/nomenclatura/dicionario", payload: { type, value, description: value } });
    }
    return c;
  }
  // Story 47.13: a amostra genérica de 4 campos passa a ser `ad` — `adv` tem 7 (v2). Os testes da 47.10 seguem iguais com o tipo trocado (AC12).
  const corpoBase = (expertId: string) => ({ expertId, creativeType: "ad", launchType: "pg", launchSeq: 2, date: "09-2026" });

  it("47.10 AC2: os dois tipos novos passam pelo CRUD de valores fixos, com usadoEm por anúncio e código travado quando usado", async () => {
    const { bbe } = await adsBase(app);
    const tipos = (await app.inject({ method: "GET", url: "/api/nomenclatura/dicionario?type=creative_type" })).json();
    expect(tipos.map((v: { value: string }) => v.value)).toEqual(["ad", "adv", "carr"]);
    await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: corpoBase(bbe.id) });
    const depois = (await app.inject({ method: "GET", url: "/api/nomenclatura/dicionario?type=creative_type" })).json();
    expect(depois.find((v: { value: string }) => v.value === "ad").usadoEm).toBe(1);
    const adv = depois.find((v: { value: string }) => v.value === "ad");
    expect((await app.inject({ method: "PATCH", url: `/api/nomenclatura/dicionario/${adv.id}`, payload: { value: "vid" } })).statusCode).toBe(409);
    const del = await app.inject({ method: "DELETE", url: `/api/nomenclatura/dicionario/${adv.id}` });
    // 47.16 (AC4, opção B): o nome sem descrição termina na data
    expect(del.json()).toMatchObject({ podeDesativar: true, referencias: [{ tipo: "anuncio", rotulo: "ad01_bbe_pg02_09-2026" }] });
  });

  // Story 47.18 — INVERTIDO: na 47.10 (AC3/AC8, Q3) o NN era "ÚNICO por expert, qualquer tipo" e o 2º criativo do
  // expert era `02` mesmo sendo de outro tipo. Agora o NN reinicia por lançamento (`{sigla}{NN}`) e por tipo.
  it("47.18 AC1/AC3/AC4: NN por (expert, sigla, nº, tipo) — sugestão no escopo; mesmo NN em outro lançamento ou outro tipo aceito; NN ocupado NO escopo → 409 com o dono DO escopo e o próximo", async () => {
    const { bbe, fz } = await adsBase(app);
    // escopo incompleto (sem tipo e sem nº): nada a sugerir — a tela diz o que falta
    const p0 = (await app.inject({ method: "GET", url: `/api/nomenclatura/ads/proximo?expertId=${bbe.id}` })).json();
    expect(p0).toEqual({ creativeSeq: null, creativeSeqTexto: null, launchSeqSugerido: null, escopo: null });
    const a1 = (await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), description: "Gancho Demissão" } })).json();
    expect(a1).toMatchObject({ creativeSeq: 1, structure: "ad01_bbe_pg02_09-2026--", name: "ad01_bbe_pg02_09-2026--gancho-demissao", adDate: "2026-09-01", expertCode: "bbe", legado: false });
    // outro TIPO no mesmo lançamento: sequência própria (na 47.10 era carr02)
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), creativeType: "carr" } })).json().structure).toBe("carr01_bbe_pg02_09-2026--");
    // outro LANÇAMENTO do mesmo tipo: recomeça (o pedido: "pg02 pode ter o ad01, ad02 também")
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), launchSeq: 3 } })).json().structure).toBe("ad01_bbe_pg03_09-2026--");
    // mesmo escopo: segue a sequência
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: corpoBase(bbe.id) })).json().structure).toBe("ad02_bbe_pg02_09-2026--");
    // fz tem a própria sequência
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: corpoBase(fz.id) })).json().creativeSeq).toBe(1);
    // sugestão no escopo; o nº do lançamento sugerido segue sendo o maior usado para (expert, sigla)
    const p = (await app.inject({ method: "GET", url: `/api/nomenclatura/ads/proximo?expertId=${bbe.id}&launchType=pg&creativeType=ad&launchSeq=2` })).json();
    expect(p).toEqual({ creativeSeq: 3, creativeSeqTexto: "03", launchSeqSugerido: 3, escopo: { creativeType: "ad", launchType: "pg", launchSeq: 2 } });
    // AC3, exemplo de aceite: lançamento novo → 01
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads/proximo?expertId=${bbe.id}&launchType=pg&creativeType=ad&launchSeq=5` })).json()).toMatchObject({ creativeSeq: 1, creativeSeqTexto: "01" });
    // sigla com número sem o nº: escopo incompleto, mas a sugestão do nº funciona com o que já há
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads/proximo?expertId=${bbe.id}&launchType=pg&creativeType=ad` })).json()).toEqual({ creativeSeq: null, creativeSeqTexto: null, launchSeqSugerido: 3, escopo: null });
    // AC4: NN ocupado NO ESCOPO → 409 nomeando o dono DO ESCOPO (o NN 1 do bbe tem três donos: ad pg02, carr pg02, ad pg03)
    const ocupado = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), launchSeq: 3, creativeSeq: 1 } });
    expect(ocupado.statusCode).toBe(409);
    expect(ocupado.json()).toMatchObject({ campo: "creativeSeq", sugestao: "02" });
    expect(ocupado.json().error).toBe("O NN 01 já é de ad01_bbe_pg03_09-2026 em pg03 (ad). O próximo livre é 02.");
    // AC4: o mesmo NN em outro escopo é aceito (o 02 está ocupado no pg02, não no pg03)
    const livre = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), launchSeq: 3, creativeSeq: 2 } });
    expect(livre.statusCode).toBe(201);
    expect(livre.json().structure).toBe("ad02_bbe_pg03_09-2026--");
    expect(mem.changelog.filter((l) => l.entity === "naming_ads" && l.action === "create")).toHaveLength(6);
  });

  it("47.18 AC1/AC4: perpetuo (nº NULL) conta como UM valor — dois ad01 de perpetuo do mesmo expert colidem; a sugestão de perpetuo segue a sequência", async () => {
    const { bbe } = await adsBase(app);
    const perp = { expertId: bbe.id, creativeType: "ad", launchType: "perpetuo", date: "09-2026" };
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: perp })).json()).toMatchObject({ creativeSeq: 1, launchSeq: null, name: "ad01_bbe_perpetuo_09-2026" });
    const dup = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...perp, creativeSeq: 1 } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe("O NN 01 já é de ad01_bbe_perpetuo_09-2026 em perpetuo (ad). O próximo livre é 02.");
    // a rota recebe `perpetuo` sem nº (um nº que venha é ignorado — o lançamento não tem número)
    for (const extra of ["", "&launchSeq=4"]) {
      expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads/proximo?expertId=${bbe.id}&launchType=perpetuo&creativeType=ad${extra}` })).json()).toEqual({ creativeSeq: 2, creativeSeqTexto: "02", launchSeqSugerido: null, escopo: { creativeType: "ad", launchType: "perpetuo", launchSeq: null } });
    }
  });

  it("47.18 AC5: PATCH que muda sigla/nº revalida o NN no escopo NOVO — ocupado → 409 com o dono e SEM oferecer outro NN; nada gravado; livre → 200 com o mesmo NN", async () => {
    const { bbe } = await adsBase(app);
    const a = (await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: corpoBase(bbe.id) })).json();
    await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), launchSeq: 3 } });
    await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { expertId: bbe.id, creativeType: "ad", launchType: "perpetuo", date: "09-2026" } });
    const antes = mem.changelog.length;
    const r = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: { launchSeq: 3 } });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ campo: "creativeSeq", sugestao: null });
    expect(r.json().error).toBe("O NN 01 já é de ad01_bbe_pg03_09-2026 em pg03 (ad). O NN do criativo não muda depois de salvo — mantenha o lançamento ou duplique o anúncio.");
    // de pg para perpetuo: o NULL do perpetuo também é escopo ocupado
    const paraPerpetuo = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: { launchType: "perpetuo", launchSeq: null } });
    expect(paraPerpetuo.statusCode).toBe(409);
    expect(paraPerpetuo.json().error).toContain("já é de ad01_bbe_perpetuo_09-2026 em perpetuo (ad)");
    expect(mem.changelog.length).toBe(antes);
    expect(mem.t.anuncios.find((x) => x.id === a.id)).toMatchObject({ launchSeq: 2, creativeSeq: 1 });
    // escopo novo livre: o NN não muda, só o lançamento
    const ok = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: { launchSeq: 4 } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ creativeSeq: 1, structure: "ad01_bbe_pg04_09-2026--" });
    // editar outra coisa no mesmo escopo não colide consigo mesmo (ignorarSeqDe)
    expect((await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: { date: "10-2026" } })).statusCode).toBe(200);
  });

  it("47.18 AC4: corrida no índice novo (uq_naming_ads_escopo_seq) → 409, não 500", async () => {
    const { bbe } = await adsBase(app);
    const original = mem.repo.inserir;
    mem.repo.inserir = (async () => {
      const erroDoDriver = Object.assign(new Error('duplicate key value violates unique constraint "uq_naming_ads_escopo_seq"'), { code: "23505", constraint: "uq_naming_ads_escopo_seq" });
      throw Object.assign(new Error("Failed query: insert into naming_ads"), { cause: erroDoDriver });
    }) as typeof original;
    const r = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: corpoBase(bbe.id) });
    mem.repo.inserir = original;
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toContain("acabou de ser cadastrado");
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
    expect(r.json()).toMatchObject({ structure: "ad01_bbe_pg03_10-2026--", name: "ad01_bbe_pg03_10-2026--prova-social", creativeSeq: 1 });
    // NN/tipo no corpo do PATCH: ignorados pelo schema (não são campos aceitos) — o NN continua 1
    const tenta = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: { creativeSeq: 9, creativeType: "ad", notes: "n" } });
    expect(tenta.json()).toMatchObject({ creativeSeq: 1, creativeType: "ad", notes: "n" });
    // o segundo é `carr` para o filtro por tipo ter o que separar (a base virou `ad` na 47.13)
    await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...corpoBase(bbe.id), creativeType: "carr", launchType: "l", date: "08-2026" } });
    const lista = (await app.inject({ method: "GET", url: `/api/nomenclatura/ads?expertId=${bbe.id}&creativeType=carr` })).json();
    expect(lista.total).toBe(1);
    // Story 47.18: outro tipo e outro lançamento — sequência própria (na 47.10 era carr02)
    expect(lista.itens[0].structure).toBe("carr01_bbe_l02_08-2026--");
    const periodo = (await app.inject({ method: "GET", url: `/api/nomenclatura/ads?de=09-2026&ate=12-2026` })).json();
    expect(periodo.itens.map((x: { structure: string }) => x.structure)).toEqual(["ad01_bbe_pg03_10-2026--"]);
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

  // ── Story 47.12: dicionário do vídeo — origem (ia · h) e hooks/bodies por expert ──
  async function partesBase(app: FastifyInstance) {
    const c = await cenario(app);
    const post = async (url: string, payload: Record<string, unknown>) => (await app.inject({ method: "POST", url, payload })).json();
    // sem `code`: o servidor sugere h01 / b01 (mesma regra das variáveis de VSL)
    const h01 = await post("/api/nomenclatura/ads/partes", { expertId: c.bbe.id, type: "hook", description: "pergunta: você já foi demitido?" });
    const b01 = await post("/api/nomenclatura/ads/partes", { expertId: c.bbe.id, type: "body", description: "prova social com 3 depoimentos" });
    return { ...c, h01, b01 };
  }

  it("47.12 AC5/AC6/AC9: hook/body — código h01/b01 sugerido por (expert, tipo), único inclusive inativo, descrição obrigatória, formato do tipo; rotulo e usadoEm na listagem", async () => {
    const { bbe, h01, b01 } = await partesBase(app);
    expect(h01).toMatchObject({ code: "h01", type: "hook", rotulo: "h01 — pergunta: você já foi demitido?", usadoEm: 0 });
    expect(b01).toMatchObject({ code: "b01", type: "body", usadoEm: 0 });
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads/partes/proximo-codigo?expertId=${bbe.id}&type=hook` })).json()).toEqual({ codigo: "h02" });
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads/partes/proximo-codigo?expertId=${bbe.id}&type=body` })).json()).toEqual({ codigo: "b02" });
    const dup = await app.inject({ method: "POST", url: "/api/nomenclatura/ads/partes", payload: { expertId: bbe.id, type: "hook", code: "h01", description: "outra" } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('h01 já existe para bbe (hook): "pergunta: você já foi demitido?". Use h02.');
    await app.inject({ method: "POST", url: `/api/nomenclatura/ads/partes/${h01.id}/desativar` });
    // inativo continua ocupando o código (regra 4) e a sugestão pula para h02
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads/partes", payload: { expertId: bbe.id, type: "hook", code: "h01", description: "x" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads/partes", payload: { expertId: bbe.id, type: "hook", description: "segundo" } })).json().code).toBe("h02");
    // formato: a sigla é do tipo — "h01" não vale para body; texto livre não vale para nada
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads/partes", payload: { expertId: bbe.id, type: "body", code: "h01", description: "x" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads/partes", payload: { expertId: bbe.id, type: "hook", code: "gancho-forte", description: "x" } })).statusCode).toBe(400);
    // descrição obrigatória
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads/partes", payload: { expertId: bbe.id, type: "body", description: "" } })).statusCode).toBe(400);
    // listagem por expert e tipo; inativos só com o flag
    const lista = (await app.inject({ method: "GET", url: `/api/nomenclatura/ads/partes?expertId=${bbe.id}&type=hook` })).json();
    expect(lista.map((v: { code: string }) => v.code)).toEqual(["h02"]);
    const comInativos = (await app.inject({ method: "GET", url: `/api/nomenclatura/ads/partes?expertId=${bbe.id}&type=hook&inativos=1` })).json();
    expect(comInativos.map((v: { code: string }) => v.code)).toEqual(["h01", "h02"]);
    // guest não lê nem escreve (D3)
    expect((await app.inject({ method: "GET", url: "/api/nomenclatura/ads/partes", headers: { "x-papel": "guest" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/nomenclatura/ads/partes", headers: { "x-papel": "guest" }, payload: { expertId: bbe.id, type: "hook", description: "x" } })).statusCode).toBe(403);
  });

  it("47.12 AC6: código de hook/body é imutável depois de usado em anúncio (409 com usadoEm); descrição segue editável; sem uso, troca de código vale e respeita unicidade", async () => {
    const { bbe, h01, b01 } = await partesBase(app);
    // sem uso: pode trocar (o repositório real só vai contar uso na 47.13)
    const troca = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/partes/${h01.id}`, payload: { code: "h05" } });
    expect(troca.statusCode).toBe(200);
    expect(troca.json().code).toBe("h05");
    // trocar para um código que já existe → 409 com sugestão
    const h06 = (await app.inject({ method: "POST", url: "/api/nomenclatura/ads/partes", payload: { expertId: bbe.id, type: "hook", code: "h06", description: "y" } })).json();
    expect((await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/partes/${h06.id}`, payload: { code: "h05" } })).statusCode).toBe(409);
    // usado em anúncio (injetado — a 47.13 é quem grava hook_id/body_id): código trava, descrição não
    // O fake tem `usoDePartes`; o tipo `Repositorio` não — o cast é do teste, não do contrato.
    (mem.repo as unknown as { usoDePartes: Map<string, number> }).usoDePartes.set(b01.id, 2);
    const travado = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/partes/${b01.id}`, payload: { code: "b09" } });
    expect(travado.statusCode).toBe(409);
    expect(travado.json()).toMatchObject({ usadoEm: 2 });
    const desc = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/partes/${b01.id}`, payload: { description: "prova social com 5 depoimentos" } });
    expect(desc.statusCode).toBe(200);
    expect(desc.json().rotulo).toBe("b01 — prova social com 5 depoimentos");
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads/partes?expertId=${bbe.id}&type=body` })).json()[0].usadoEm).toBe(2);
  });

  it("47.12 AC3/AC7: desativar o expert desativa hooks/bodies em cascata, e o impacto conta; `creative_origin` é servido pelo GET /dicionario sem código novo e com usadoEm 0", async () => {
    const { bbe, h01, b01 } = await partesBase(app);
    const impacto = (await app.inject({ method: "GET", url: `/api/nomenclatura/experts/${bbe.id}/impacto-da-desativacao` })).json();
    expect(impacto.partesDoVideo).toBe(2);
    const r = (await app.inject({ method: "POST", url: `/api/nomenclatura/experts/${bbe.id}/desativar` })).json();
    expect(r.desativados.partesDoVideo).toBe(2);
    const inativos = (await app.inject({ method: "GET", url: `/api/nomenclatura/ads/partes?expertId=${bbe.id}&inativos=1` })).json();
    expect(inativos.filter((p: { id: string; active: boolean }) => [h01.id, b01.id].includes(p.id)).every((p: { active: boolean }) => !p.active)).toBe(true);
    // origem do vídeo: mesmo CRUD de Valores fixos; o tipo novo passa pelo filtro do GET e pelo POST
    const ia = await app.inject({ method: "POST", url: "/api/nomenclatura/dicionario", payload: { type: "creative_origin", value: "ia", description: "feito por inteligência artificial" } });
    expect(ia.statusCode).toBe(201);
    const lista = (await app.inject({ method: "GET", url: "/api/nomenclatura/dicionario?type=creative_origin" })).json();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ value: "ia", usadoEm: 0 });
  });

  // ── Story 47.13: nome de vídeo v2 ─────────────────────────────────────────
  async function videoBase(app: FastifyInstance) {
    const c = await partesBase(app); // bbe com h01 e b01
    const post = async (url: string, payload: Record<string, unknown>) => (await app.inject({ method: "POST", url, payload })).json();
    for (const [type, values] of Object.entries({ creative_type: ["ad", "adv", "carr"], launch_type: ["pg", "l", "perpetuo"], creative_origin: ["ia", "h"] })) {
      for (const value of values) await post("/api/nomenclatura/dicionario", { type, value });
    }
    // o gestor do exemplo é `dg` (pg04); aqui o expert com hooks é bbe — o nome sai com bbe
    const h01Fz = await post("/api/nomenclatura/ads/partes", { expertId: c.fz.id, type: "hook", description: "hook do fz" });
    return { ...c, h01Fz, post };
  }

  // 47.16 (AC2/AC3): o POST de vídeo passou a gerar o v3 — hook e body GRAVADOS (hookId/bodyId, hookCode/bodyCode), fora do nome.
  it("47.13 AC1/AC6 + 47.16 AC2/AC3: POST adv grava origem, hook e body — nome v3 adv01_h_bbe_pg04_09-2026 — e a resposta traz hookCode/bodyCode e legado=false", async () => {
    const { bbe, h01, b01, post } = await videoBase(app);
    const a = await post("/api/nomenclatura/ads", { expertId: bbe.id, creativeType: "adv", launchType: "pg", launchSeq: 4, date: "09-2026", origin: "h", hookId: h01.id, bodyId: b01.id });
    expect(a).toMatchObject({ structure: "adv01_h_bbe_pg04_09-2026--", name: "adv01_h_bbe_pg04_09-2026", origin: "h", hookId: h01.id, bodyId: b01.id, hookCode: "h01", bodyCode: "b01", legado: false, expertCode: "bbe" });
    // usadoEm passou a contar de verdade → o código do hook trava (47.12 AC6 fecha aqui)
    const travado = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/partes/${h01.id}`, payload: { code: "h09" } });
    expect(travado.statusCode).toBe(409);
    expect(travado.json()).toMatchObject({ usadoEm: 1 });
    // origem conta como valor usado (imutável), e a referência do hook lista o anúncio
    const origens = (await app.inject({ method: "GET", url: "/api/nomenclatura/dicionario?type=creative_origin" })).json();
    expect(origens.find((v: { value: string }) => v.value === "h").usadoEm).toBe(1);
    const del = await app.inject({ method: "DELETE", url: `/api/nomenclatura/ads/partes/${b01.id}` });
    expect(del.statusCode).toBe(409);
    expect(del.json().referencias).toEqual([{ tipo: "anuncio", id: a.id, rotulo: "adv01_h_bbe_pg04_09-2026" }]);
  });

  it("47.13 AC6: adv exige os três (422); hook de OUTRO expert → 422; tipo trocado → 422; inativo → 422; origem fora do dicionário → 422", async () => {
    const { bbe, h01, b01, h01Fz } = await videoBase(app);
    const base = { expertId: bbe.id, creativeType: "adv", launchType: "pg", launchSeq: 4, date: "09-2026" };
    const semOrigem = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...base, hookId: h01.id, bodyId: b01.id } });
    expect(semOrigem.statusCode).toBe(422);
    expect(semOrigem.json()).toMatchObject({ campo: "origin" });
    const semHook = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...base, origin: "h", bodyId: b01.id } });
    expect(semHook.statusCode).toBe(422);
    expect(semHook.json().error).toContain("cadastre em Hooks e bodies");
    const outroExpert = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...base, origin: "h", hookId: h01Fz.id, bodyId: b01.id } });
    expect(outroExpert.statusCode).toBe(422);
    expect(outroExpert.json().error).toContain("não é de bbe");
    const tipoTrocado = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...base, origin: "h", hookId: b01.id, bodyId: h01.id } });
    expect(tipoTrocado.statusCode).toBe(422);
    expect(tipoTrocado.json().error).toContain("é body, não hook");
    const origemErrada = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...base, origin: "robo", hookId: h01.id, bodyId: b01.id } });
    expect(origemErrada.statusCode).toBe(422);
    await app.inject({ method: "POST", url: `/api/nomenclatura/ads/partes/${h01.id}/desativar` });
    const inativo = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...base, origin: "h", hookId: h01.id, bodyId: b01.id } });
    expect(inativo.statusCode).toBe(422);
    expect(inativo.json().error).toContain("está inativo");
  });

  it("47.13 AC1/AC6: fora de adv, origem/hook/body são recusados (400) — ad com origem é nome errado", async () => {
    const { bbe, h01, b01 } = await videoBase(app);
    const r = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { expertId: bbe.id, creativeType: "ad", launchType: "pg", launchSeq: 1, date: "09-2026", origin: "h" } });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ campo: "origin" });
    const r2 = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { expertId: bbe.id, creativeType: "carr", launchType: "pg", launchSeq: 1, date: "09-2026", hookId: h01.id, bodyId: b01.id } });
    expect(r2.statusCode).toBe(400);
    // null explícito não conta como presente
    const ok = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { expertId: bbe.id, creativeType: "ad", launchType: "pg", launchSeq: 1, date: "09-2026", origin: null, hookId: null, bodyId: null } });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().structure).toBe("ad01_bbe_pg01_09-2026--");
  });

  it("47.13 AC7: vídeo do padrão antigo edita descrição/lançamento/data sem os três, re-grava em 4 campos e vem marcado legado; mandar origem/hook/body nele → 400", async () => {
    const { bbe, h01, b01 } = await videoBase(app);
    // um adv de 4 campos gravado antes da 47.13 — inserido direto no fake, como está em produção
    mem.t.anuncios.push({ id: USUARIO, expertId: bbe.id, creativeType: "adv", creativeSeq: 7, launchType: "pg", launchSeq: 2, adDate: "2026-09-01", description: null, origin: null, hookId: null, bodyId: null, structure: "adv07_bbe_pg02_09-2026--", name: "adv07_bbe_pg02_09-2026--", notes: null, active: true, createdAt: "2026-09-01", updatedAt: "2026-09-01" });
    const lista = (await app.inject({ method: "GET", url: `/api/nomenclatura/ads?expertId=${bbe.id}` })).json();
    expect(lista.itens.find((a: { id: string }) => a.id === USUARIO)).toMatchObject({ legado: true, hookCode: null, bodyCode: null });
    const r = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${USUARIO}`, payload: { description: "prova social", launchSeq: 3 } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ structure: "adv07_bbe_pg03_09-2026--", name: "adv07_bbe_pg03_09-2026--prova-social", origin: null, legado: true });
    const migra = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${USUARIO}`, payload: { origin: "h", hookId: h01.id, bodyId: b01.id } });
    expect(migra.statusCode).toBe(400);
    // 47.16: duplicar cria no formato atual — o v3, não mais o v2
    expect(migra.json().error).toContain("duplique para criar no formato atual (v3)");
  });

  it("47.13 AC4/AC8/AC11: snapshot traz origens e partes por expert; validar-nome aceita v2 e padrão antigo; listagem filtra por origem/hook/body", async () => {
    const { bbe, h01, b01, post } = await videoBase(app);
    const snap = (await app.inject({ method: "GET", url: "/api/nomenclatura/ads/snapshot" })).json();
    expect(snap.origins.map((o: { value: string }) => o.value)).toEqual(["ia", "h"]);
    expect(snap.partes).toEqual(expect.arrayContaining([{ expert: "bbe", type: "hook", code: "h01", active: true }, { expert: "bbe", type: "body", code: "b01", active: true }, { expert: "fz", type: "hook", code: "h01", active: true }]));
    const v2 = (await app.inject({ method: "POST", url: "/api/nomenclatura/ads/validar-nome", payload: { name: "adv01_h_bbe_pg04_h01_b01_09-2026--" } })).json();
    // 47.16 (AC5, PO-02): o v2 passou a vir com aviso PRÓPRIO
    expect(v2).toMatchObject({ valid: true, video: true, legado: false, formato: "v2", avisos: ["padrão v2 (47.13): hook e body no nome — o nome novo (47.16) não os leva"] });
    const antigo = (await app.inject({ method: "POST", url: "/api/nomenclatura/ads/validar-nome", payload: { name: "adv03_bbe_pg02_09-2026--" } })).json();
    expect(antigo).toMatchObject({ valid: true, video: true, legado: true });
    expect(antigo.avisos).toContain("padrão antigo (47.10): sem origem, hook e body");
    const errado = (await app.inject({ method: "POST", url: "/api/nomenclatura/ads/validar-nome", payload: { name: "adv01_h_fz_pg04_h01_b01_09-2026--" } })).json();
    expect(errado.valid).toBe(false);
    expect(errado.errors).toContain("campo 6 (body): b01 não está cadastrado para fz");
    await post("/api/nomenclatura/ads", { expertId: bbe.id, creativeType: "adv", launchType: "pg", launchSeq: 4, date: "09-2026", origin: "h", hookId: h01.id, bodyId: b01.id });
    await post("/api/nomenclatura/ads", { expertId: bbe.id, creativeType: "ad", launchType: "pg", launchSeq: 4, date: "09-2026" });
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads?origin=h` })).json().total).toBe(1);
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads?hookId=${h01.id}` })).json().total).toBe(1);
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads?bodyId=${b01.id}` })).json().itens[0].hookCode).toBe("h01");
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads?expertId=${bbe.id}` })).json().total).toBe(2);
  });

  // ── Story 47.16: nome v3 — `perpetuo` sem número, hook/body fora do nome, `--` opcional ──
  it("47.16 AC1/AC6: POST com perpetuo SEM número grava launchSeq null e o nome v3; COM número → 400 em launchSeq; outra sigla sem número → 400 em launchSeq", async () => {
    const { bbe, h01, b01, post } = await videoBase(app);
    const v = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { expertId: bbe.id, creativeType: "adv", launchType: "perpetuo", date: "09-2026", origin: "ia", hookId: h01.id, bodyId: b01.id } });
    expect(v.statusCode).toBe(201);
    expect(v.json()).toMatchObject({ launchSeq: null, name: "adv01_ia_bbe_perpetuo_09-2026", structure: "adv01_ia_bbe_perpetuo_09-2026--", hookId: h01.id, bodyId: b01.id, hookCode: "h01", bodyCode: "b01" });
    // `null` explícito também é ausente
    const ad = await post("/api/nomenclatura/ads", { expertId: bbe.id, creativeType: "ad", launchType: "perpetuo", launchSeq: null, date: "09-2026" });
    // Story 47.18: `ad` é outro tipo — sequência própria no perpetuo (na 47.16 era ad02)
    expect(ad).toMatchObject({ launchSeq: null, name: "ad01_bbe_perpetuo_09-2026" });
    // o que chega na coluna: NULL — nenhum valor-sentinela
    expect(mem.t.anuncios.map((a) => a.launchSeq)).toEqual([null, null]);
    const comNumero = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { expertId: bbe.id, creativeType: "ad", launchType: "perpetuo", launchSeq: 4, date: "09-2026" } });
    expect(comNumero.statusCode).toBe(400);
    expect(comNumero.json()).toMatchObject({ campo: "launchSeq" });
    for (const semNumero of [{}, { launchSeq: null }]) {
      const r = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { expertId: bbe.id, creativeType: "ad", launchType: "pg", date: "09-2026", ...semNumero } });
      expect(r.statusCode).toBe(400);
      expect(r.json()).toMatchObject({ campo: "launchSeq" });
      expect(r.json().error).toContain("exige o número do lançamento");
    }
    expect(mem.t.anuncios).toHaveLength(2);
  });

  it("47.16 AC11: o 400 que a API ANTERIOR dá ao perpetuo sem número tem o texto que o web reconhece (fixa a assinatura do zod)", async () => {
    // O schema de `launchSeq` antes da 47.16, e o mesmo formato de `parse` (`caminho: mensagem`). O web
    // (`mensagemDeApiAtrasAoSalvarAnuncio`) reconhece estes dois textos; se o zod mudar a frase, é aqui que cai.
    const { z } = await import("zod");
    const antigo = z.object({ launchSeq: z.number().int().min(1).max(99) });
    const texto = (corpo: unknown) => {
      const i = antigo.safeParse(corpo).error!.issues[0]!;
      return `${i.path.join(".")}: ${i.message}`;
    };
    expect(texto({ launchSeq: null })).toBe("launchSeq: Invalid input: expected number, received null");
    expect(texto({})).toBe("launchSeq: Invalid input: expected number, received undefined");
    // e a API da 47.16 não devolve texto do zod nesse campo: aceita null/ausente
    const { bbe, post } = await videoBase(app);
    expect((await post("/api/nomenclatura/ads", { expertId: bbe.id, creativeType: "ad", launchType: "perpetuo", launchSeq: null, date: "09-2026" })).launchSeq).toBeNull();
  });

  it("47.16 AC3: no v3 hook e body continuam OBRIGATÓRIOS (422) — só saíram do nome", async () => {
    const { bbe, h01, b01 } = await videoBase(app);
    const base = { expertId: bbe.id, creativeType: "adv", launchType: "perpetuo", date: "09-2026", origin: "ia" };
    const semHook = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...base, bodyId: b01.id } });
    expect(semHook.statusCode).toBe(422);
    expect(semHook.json()).toMatchObject({ campo: "hookId" });
    const semBody = await app.inject({ method: "POST", url: "/api/nomenclatura/ads", payload: { ...base, hookId: h01.id } });
    expect(semBody.statusCode).toBe(422);
    expect(semBody.json()).toMatchObject({ campo: "bodyId" });
  });

  it("47.16 AC6 (PO-03/PO-04): PATCH para perpetuo ZERA o número; de perpetuo para pg sem número → 400 em launchSeq (nada gravado); com número → pg03", async () => {
    const { bbe, post } = await videoBase(app);
    const a = await post("/api/nomenclatura/ads", { expertId: bbe.id, creativeType: "ad", launchType: "pg", launchSeq: 4, date: "09-2026" });
    const paraPerpetuo = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: { launchType: "perpetuo" } });
    expect(paraPerpetuo.statusCode).toBe(200);
    expect(paraPerpetuo.json()).toMatchObject({ launchType: "perpetuo", launchSeq: null, name: "ad01_bbe_perpetuo_09-2026" });
    const volta = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: { launchType: "pg" } });
    expect(volta.statusCode).toBe(400);
    expect(volta.json()).toMatchObject({ campo: "launchSeq" });
    expect(volta.json().error).not.toMatch(/pg00|pgnull/);
    expect(mem.t.anuncios[0]).toMatchObject({ launchType: "perpetuo", launchSeq: null, name: "ad01_bbe_perpetuo_09-2026" });
    const comNumero = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: { launchType: "pg", launchSeq: 3 } });
    expect(comNumero.json()).toMatchObject({ launchType: "pg", launchSeq: 3, name: "ad01_bbe_pg03_09-2026" });
    const errado = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: { launchType: "perpetuo", launchSeq: 2 } });
    expect(errado.statusCode).toBe(400);
    expect(errado.json()).toMatchObject({ campo: "launchSeq" });
  });

  // QA 47.16 TEST-001: o corpo REAL do PATCH do gerador. Os literais abaixo são os que o web prova sair de
  // `corpoDaEdicaoDoAnuncio` (packages/web/lib/utils/__tests__/nomenclatura-anuncio.test.ts, "TEST-001") —
  // com `perpetuo`, `launchSeq: null` vai SEMPRE, explícito. Tirar o `.nullable()` do zod do PATCH dá 400 aqui.
  it("QA 47.16 TEST-001: PATCH com o corpo que o gerador envia (launchSeq: null explícito com perpetuo) → 200, sem número", async () => {
    const { bbe, h01, b01, post } = await videoBase(app);
    const a = await post("/api/nomenclatura/ads", { expertId: bbe.id, creativeType: "ad", launchType: "perpetuo", launchSeq: null, date: "09-2026" });
    const corpoDoGerador = { launchType: "perpetuo", launchSeq: null, date: "10-2026", description: "prova social", notes: null };
    const ad = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: corpoDoGerador });
    expect(ad.statusCode).toBe(200);
    expect(ad.json()).toMatchObject({ launchType: "perpetuo", launchSeq: null, name: "ad01_bbe_perpetuo_10-2026--prova-social" });

    // um dos 6 do dg no ar (v2): o gerador manda também origem, hook e body — trocar só a descrição
    const nome = "adv02_ia_bbe_perpetuo_h01_b01_09-2026";
    mem.t.anuncios.push({ id: USUARIO, expertId: bbe.id, creativeType: "adv", creativeSeq: 2, launchType: "perpetuo", launchSeq: null, adDate: "2026-09-01", description: null, origin: "ia", hookId: h01.id, bodyId: b01.id, structure: `${nome}--`, name: nome, notes: null, active: true, createdAt: "2026-09-23", updatedAt: "2026-09-23" });
    const corpoDoVideo = { launchType: "perpetuo", launchSeq: null, date: "09-2026", description: "prova social", notes: null, origin: "ia", hookId: h01.id, bodyId: b01.id };
    const v = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${USUARIO}`, payload: corpoDoVideo });
    expect(v.statusCode).toBe(200);
    expect(v.json()).toMatchObject({ launchSeq: null, name: "adv02_ia_bbe_perpetuo_h01_b01_09-2026--prova-social", legado: false });
  });

  it("QA 47.16 TEST-002: PATCH { launchSeq: null } num pg04 → 400 em launchSeq (null explícito NÃO mantém o 4 calado); nada gravado", async () => {
    const { bbe, post } = await videoBase(app);
    const a = await post("/api/nomenclatura/ads", { expertId: bbe.id, creativeType: "ad", launchType: "pg", launchSeq: 4, date: "09-2026" });
    const r = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${a.id}`, payload: { launchSeq: null } });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ campo: "launchSeq" });
    expect(mem.t.anuncios[0]).toMatchObject({ launchType: "pg", launchSeq: 4, name: "ad01_bbe_pg04_09-2026" });
  });

  it("47.16 AC7: /ads/proximo com perpetuo não sugere número; o maior da outra sigla ignora o NULL do perpetuo", async () => {
    const { bbe, post } = await videoBase(app);
    await post("/api/nomenclatura/ads", { expertId: bbe.id, creativeType: "ad", launchType: "perpetuo", date: "09-2026" });
    await post("/api/nomenclatura/ads", { expertId: bbe.id, creativeType: "ad", launchType: "pg", launchSeq: 4, date: "09-2026" });
    // Story 47.18: o NN é do escopo (bbe, perpetuo, ad) — 1 anúncio ali → 02 (na 47.16, por expert, era 03)
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads/proximo?expertId=${bbe.id}&launchType=perpetuo&creativeType=ad` })).json()).toEqual({ creativeSeq: 2, creativeSeqTexto: "02", launchSeqSugerido: null, escopo: { creativeType: "ad", launchType: "perpetuo", launchSeq: null } });
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads/proximo?expertId=${bbe.id}&launchType=pg` })).json().launchSeqSugerido).toBe(4);
    // dado inconsistente (perpetuo COM número, só possível por escrita manual no banco): a rota nem pergunta ao repositório
    mem.t.anuncios.push({ id: USUARIO, expertId: bbe.id, creativeType: "ad", creativeSeq: 9, launchType: "perpetuo", launchSeq: 3, adDate: "2026-09-01", description: null, origin: null, hookId: null, bodyId: null, structure: "x", name: "x", notes: null, active: true, createdAt: "2026-09-01", updatedAt: "2026-09-01" });
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads/proximo?expertId=${bbe.id}&launchType=perpetuo` })).json().launchSeqSugerido).toBeNull();
  });

  it("47.16 AC8/AC4/AC9: um dos 6 no ar (v2, sem `--`) edita SEM mudar de formato e SEM ganhar `--`; notas não re-gravam; o próximo NN é 07", async () => {
    const { bbe, h01, b01 } = await videoBase(app);
    const linha = (n: number, id: string) => {
      const nome = `adv0${n}_ia_bbe_perpetuo_h01_b01_09-2026`;
      return { id, expertId: bbe.id, creativeType: "adv", creativeSeq: n, launchType: "perpetuo", launchSeq: null, adDate: "2026-09-01", description: null, origin: "ia", hookId: h01.id, bodyId: b01.id, structure: `${nome}--`, name: nome, notes: null, active: true, createdAt: "2026-09-23", updatedAt: "2026-09-23" };
    };
    // como o script do AC9 grava: name = o do Meta, structure = name + `--`, launch_seq NULL
    mem.t.anuncios.push(linha(1, USUARIO), ...[2, 3, 4, 5, 6].map((n) => linha(n, `20000000-0000-4000-8000-00000000000${n}`)));
    // Story 47.18 (AC3, exemplos de aceite): adv + perpetuo → 07 (o escopo dos 6); ad + pg05 → 01 (na 47.16 o 07 valia para tudo)
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads/proximo?expertId=${bbe.id}&launchType=perpetuo&creativeType=adv` })).json()).toMatchObject({ creativeSeq: 7, creativeSeqTexto: "07" });
    expect((await app.inject({ method: "GET", url: `/api/nomenclatura/ads/proximo?expertId=${bbe.id}&launchType=pg&launchSeq=5&creativeType=ad` })).json()).toMatchObject({ creativeSeq: 1, creativeSeqTexto: "01" });
    const notas = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${USUARIO}`, payload: { notes: "no ar desde 21/09" } });
    expect(notas.json()).toMatchObject({ name: "adv01_ia_bbe_perpetuo_h01_b01_09-2026", structure: "adv01_ia_bbe_perpetuo_h01_b01_09-2026--", notes: "no ar desde 21/09" });
    const data = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${USUARIO}`, payload: { date: "10-2026" } });
    expect(data.statusCode).toBe(200);
    expect(data.json()).toMatchObject({ name: "adv01_ia_bbe_perpetuo_h01_b01_10-2026", structure: "adv01_ia_bbe_perpetuo_h01_b01_10-2026--", launchSeq: null, legado: false });
    const desc = await app.inject({ method: "PATCH", url: `/api/nomenclatura/ads/${USUARIO}`, payload: { description: "prova social" } });
    expect(desc.json().name).toBe("adv01_ia_bbe_perpetuo_h01_b01_10-2026--prova-social");
    // validar-nome aceita o nome do Meta como está
    const val = (await app.inject({ method: "POST", url: "/api/nomenclatura/ads/validar-nome", payload: { name: "adv02_ia_bbe_perpetuo_h01_b01_09-2026" } })).json();
    expect(val).toMatchObject({ valid: true, formato: "v2", errors: [] });
  });

  it("id inexistente → 404; id malformado → 400", async () => {
    expect((await app.inject({ method: "PATCH", url: `/api/nomenclatura/funis/${USUARIO}`, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: "/api/nomenclatura/funis/abc", payload: {} })).statusCode).toBe(400);
  });
});
