/**
 * Story 49.16 — a nota da tabela "Criativo × Faixa" descreve o critério que
 * escolheu o link do criativo.
 *
 * O link sai de `postDoGrupo(porVolume, spendPorAdId, postPorAdId)`: o anúncio
 * de maior investimento entre os que têm post. Sem ad-level no período todo
 * investimento por anúncio é 0, e fica o primeiro com post na ordem de volume
 * de respondentes. A nota dizia "maior investimento" nos dois casos.
 *
 * A fixture tem criativo na pesquisa (a da 49.15 não tinha — TEST-001 do gate
 * dela): três anúncios no mesmo Ad Name, em que o de mais respondentes NÃO tem
 * post e o de maior investimento NÃO é o segundo em respondentes. Assim cada
 * critério aponta um post diferente e o link prova qual foi usado.
 *
 * O caminho principal é o orquestrador (`gerarDebriefing`): config → motores
 * reais → guardas → render → gravar. O render a partir do payload completo
 * (`renderDebriefing`) fecha a prova de que só a nota depende do ad-level.
 */

import { describe, expect, it } from "vitest";
import {
  computeDebriefingAudience,
  type AnuncioDiaInput,
  type DebriefingAudienceInput,
} from "../services/debriefing-audience-engine.js";
import type { DebriefingConfig, DebriefingConfigLancamento } from "../services/debriefing-config.js";
import {
  gerarDebriefing,
  type DependenciasDaGeracao,
  type ParametrosDaGeracao,
} from "../services/debriefing-generate.js";
import { validateDebriefing } from "../services/debriefing-guards.js";
import { computeDebriefingMoneyTime } from "../services/debriefing-money-time-engine.js";
import { montarPayloadDebriefing, type DebriefingPayload } from "../services/debriefing-payload.js";
import { renderDebriefing } from "../services/debriefing-render.js";
import {
  GERADO_EM,
  configSintetica,
  entradaAudienceSintetica,
  entradaMoneyTimeSintetica,
} from "./fixtures/debriefing-payload-sintetico.js";

type Dimensao = DebriefingConfigLancamento["dimensaoDeCriativo"];

const AD_NAME = "lanc-ia-01";
/** Mais respondentes (3), sem post: o critério "mais respondentes" o pula. */
const AD_SEM_POST = "120000000000000004";
/** 2 respondentes, post no Instagram, pouco investimento. */
const AD_MAIS_RESP_COM_POST = "120000000000000001";
/** 1 respondente, post no Facebook, o maior investimento entre os que têm post. */
const AD_MAIOR_INVEST = "120000000000000003";

const POST_IG = "https://www.instagram.com/p/MAIS-RESPONDENTES/";
const POST_FB = "https://www.facebook.com/100000000000001/posts/200000000000003";

const ANUNCIOS: AnuncioDiaInput[] = [
  { adId: AD_SEM_POST, adName: AD_NAME, campaignId: "c-cap-hot", campaignName: "lanc--vendas-captacao--hot--cbo", dia: "2026-04-20", spendBruto: 200, impressoes: 9000, linkClicks: 150 },
  { adId: AD_MAIS_RESP_COM_POST, adName: AD_NAME, campaignId: "c-cap-hot", campaignName: "lanc--vendas-captacao--hot--cbo", dia: "2026-04-20", spendBruto: 10, impressoes: 1000, linkClicks: 20 },
  { adId: AD_MAIOR_INVEST, adName: AD_NAME, campaignId: "c-cap-hot", campaignName: "lanc--vendas-captacao--hot--cbo", dia: "2026-04-21", spendBruto: 90, impressoes: 5000, linkClicks: 90 },
];

const NOTA_MAIOR_INVESTIMENTO =
  "O nome abre o post publicado (Instagram; sem ele, Facebook) do anúncio de maior investimento do Ad Name; sem post público, o Ads Manager.";
const NOTA_MAIS_RESPONDENTES =
  "O nome abre o post publicado (Instagram; sem ele, Facebook) do anúncio com mais respondentes do Ad Name, entre os que têm post publicado, porque não há investimento por anúncio no período (sem ad-level); sem post público, o Ads Manager.";

/** A entrada do Motor II com criativo na pesquisa: 6 respondentes em 3 anúncios do mesmo Ad Name. */
function entradaComCriativo(base: DebriefingAudienceInput, dimensao: Dimensao, comAdLevel: boolean): DebriefingAudienceInput {
  const modelo = base.respondentes[0]!;
  const porAnuncio: [string, string][] = [
    [AD_SEM_POST, "A"],
    [AD_SEM_POST, "B"],
    [AD_SEM_POST, "C"],
    [AD_MAIS_RESP_COM_POST, "A"],
    [AD_MAIS_RESP_COM_POST, "D"],
    [AD_MAIOR_INVEST, "B"],
  ];
  return {
    ...base,
    config: { ...base.config, dimensaoDeCriativo: dimensao },
    respondentes: porAnuncio.map(([adId, faixa], i) => ({
      ...modelo,
      linha: i + 1,
      linhaTemRespondente: true,
      emailCru: `r${i + 1}@x.com`,
      dataRespostaCru: "19/04/2026",
      utmContentCru: adId,
      respostas: { faixa, Sexo: "Feminino" },
    })),
    criativos: {
      anuncios: comAdLevel ? ANUNCIOS : [],
      nomesDeAnuncio: { [AD_SEM_POST]: AD_NAME, [AD_MAIS_RESP_COM_POST]: AD_NAME, [AD_MAIOR_INVEST]: AD_NAME },
      contaDeAnuncios: "act_1",
      postsDosAnuncios: { [AD_MAIS_RESP_COM_POST]: POST_IG, [AD_MAIOR_INVEST]: POST_FB },
    },
  };
}

const configCom = (dimensao: Dimensao): DebriefingConfigLancamento => ({ ...configSintetica(), dimensaoDeCriativo: dimensao });

function payloadDe(dimensao: Dimensao, comAdLevel: boolean, geradoEm: string | Date = GERADO_EM): DebriefingPayload {
  const config = configCom(dimensao);
  const mtIn = { ...entradaMoneyTimeSintetica(), config };
  const auIn = entradaComCriativo(entradaAudienceSintetica(mtIn), dimensao, comAdLevel);
  return montarPayloadDebriefing(computeDebriefingMoneyTime(mtIn), computeDebriefingAudience(auIn), config, geradoEm);
}

const P = "10000000-0000-4000-8000-000000000001";
const F = "20000000-0000-4000-8000-000000000001";
const S = "30000000-0000-4000-8000-000000000001";
const U = "40000000-0000-4000-8000-000000000001";
const PARAMS: ParametrosDaGeracao = { projectId: P, funnelId: F, stageId: S, userId: U, userRole: "user", investimentoOficial: null };

async function gerar(dimensao: Dimensao, comAdLevel: boolean) {
  const d: DependenciasDaGeracao = {
    async resolverEtapa() {
      return { stageId: S, stageName: "Debriefing", stageType: "debriefing", funnelId: F, funnelName: "PG02", projectId: P, projectName: "Expert" };
    },
    async carregarConfig(stageId): Promise<DebriefingConfig> {
      return { ...configCom(dimensao), stageId };
    },
    async etapasDeDebriefingDoFunil() {
      return [];
    },
    async ultimoPayloadSalvoDoFunil() {
      return null;
    },
    async calcularPayload(c, geradoEm) {
      return payloadDe(c.dimensaoDeCriativo, comAdLevel, geradoEm);
    },
    async nomes() {
      return { funis: { [F]: "PG02" }, etapas: {} };
    },
    async gravar() {
      return { id: "50000000-0000-4000-8000-000000000001" };
    },
    async estadoDoSyncDaMidia() {
      return [];
    },
    agora: () => new Date(GERADO_EM),
  };
  const r = await gerarDebriefing(d, PARAMS);
  expect(r.body).not.toHaveProperty("erro");
  expect(r.status).toBe(200);
  return r.body as { html: string; payload: DebriefingPayload };
}

/** A nota (`<p class="tnote">`) que acompanha a tabela de criativos. */
function notaDaTabela(html: string): string {
  const m = html.match(/<p class="tnote">Ordem do payload \(por volume\)\.[^<]*<\/p>/);
  expect(m, "a nota da tabela Criativo × Faixa precisa estar no documento").not.toBeNull();
  return m![0];
}

/** O href do nome do criativo na tabela. */
function hrefDoCriativo(html: string, nome: string): string | null {
  const m = html.match(new RegExp(`<a href="([^"]+)"[^>]*>${nome}</a>`));
  return m ? m[1]!.replace(/&amp;/g, "&") : null;
}

const DIMENSOES = ["ia-humano", "video-estatico", "nenhuma"] as const;

describe("AC4 (a) — a fixture tem criativo na pesquisa e o link entra no documento", () => {
  it.each(DIMENSOES)("\"%s\": um criativo com 6 respondentes e os três ad_ids, na ordem de volume", (dimensao) => {
    for (const comAdLevel of [true, false]) {
      const cx = payloadDe(dimensao, comAdLevel).publico.criativoXFaixa;
      expect(cx.aplicavel).toBe(true);
      expect(cx.criativos).toHaveLength(1);
      expect(cx.criativos[0]).toMatchObject({ nome: AD_NAME, n: 6, adIdPrincipal: AD_SEM_POST });
      expect(cx.criativos[0]!.linkDoPost).not.toBeNull();
    }
  });
});

describe.each(DIMENSOES)("AC1 — dimensão \"%s\"", (dimensao) => {
  it("sem ad-level: a nota diz \"mais respondentes, entre os que têm post\", sem citar investimento como critério", async () => {
    const { html, payload } = await gerar(dimensao, false);
    expect(payload.publico.tipoDeCriativo.adLevel.aplicavel).toBe(false);
    const nota = notaDaTabela(html);
    expect(nota).toContain(NOTA_MAIS_RESPONDENTES);
    expect(nota).not.toContain("maior investimento");
    // A cascata IG → FB → Ads Manager (R7-9) continua escrita.
    expect(nota).toContain("(Instagram; sem ele, Facebook)");
    expect(nota).toContain("sem post público, o Ads Manager");
  });

  it("com ad-level: a nota continua \"anúncio de maior investimento\", como antes", async () => {
    const { html, payload } = await gerar(dimensao, true);
    expect(payload.publico.tipoDeCriativo.adLevel.aplicavel).toBe(true);
    const nota = notaDaTabela(html);
    expect(nota).toContain(NOTA_MAIOR_INVESTIMENTO);
    expect(nota).not.toContain("mais respondentes");
  });

  it("AC2 — o link escolhido segue o critério que a nota descreve (e não mudou)", async () => {
    // Sem ad-level: o de mais respondentes COM post (o de mais respondentes não tem post).
    const sem = await gerar(dimensao, false);
    expect(sem.payload.publico.criativoXFaixa.criativos[0]!.linkDoPost).toBe(POST_IG);
    expect(hrefDoCriativo(sem.html, AD_NAME)).toBe(POST_IG);
    // Com ad-level: o de maior investimento entre os que têm post (o sem post gastou mais, e fica fora).
    const com = await gerar(dimensao, true);
    expect(com.payload.publico.criativoXFaixa.criativos[0]!.linkDoPost).toBe(POST_FB);
    expect(hrefDoCriativo(com.html, AD_NAME)).toBe(POST_FB);
  });
});

describe("AC3 — só a nota depende do ad-level (render a partir do payload completo)", () => {
  it.each(DIMENSOES)("\"%s\": virar só `adLevel.aplicavel` no payload troca a nota e nada mais", (dimensao) => {
    const p = payloadDe(dimensao, false);
    const entrada = { comparacao: null, rotulos: { projeto: "Expert", lancamento: "PG02", etapas: {}, funis: { [F]: "PG02" } }, alertas: validateDebriefing(p).alertas };
    const semAdLevel = renderDebriefing({ ...entrada, payload: p });
    const virado = structuredClone(p);
    virado.publico.tipoDeCriativo.adLevel = { aplicavel: true, linhas: ANUNCIOS.length };
    const comAdLevel = renderDebriefing({ ...entrada, payload: virado });

    expect(notaDaTabela(semAdLevel)).toContain(NOTA_MAIS_RESPONDENTES);
    expect(notaDaTabela(comAdLevel)).toContain(NOTA_MAIOR_INVESTIMENTO);
    // Trocando a nota de volta, os dois documentos são o mesmo — exceto o bloco
    // "Mídia por criativo indisponível", que já dependia do ad-level (dimensão exibida).
    const semOAviso = (h: string) => h.replace(/<div class="warn"[^>]*><b>Mídia por criativo indisponível<\/b>[\s\S]*?<\/div>/, "");
    expect(semOAviso(semAdLevel).replace(NOTA_MAIS_RESPONDENTES, NOTA_MAIOR_INVESTIMENTO)).toBe(semOAviso(comAdLevel));
  });
});
