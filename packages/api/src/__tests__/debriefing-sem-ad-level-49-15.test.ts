/**
 * Story 49.15 — convenção de criativo "nenhuma" sem ad-level no período.
 *
 * O Motor II marca `tipoDeCriativo.adLevel.motivo = "SEM_AD_LEVEL"` nos dois
 * ramos (é o fato: não há linha em `meta_ad_insights_daily`), mas só registra a
 * lacuna quando a dimensão de tipo é exibida. A F11 e o WF9 exigiam a lacuna
 * sem olhar a dimensão → 422 em toda geração com "nenhuma" e sem anúncios.
 *
 * Os payloads saem dos motores REAIS sobre a entrada sintética da 49.5, com a
 * dimensão e o ad-level trocados; o caminho de ponta a ponta passa pelo
 * orquestrador (`gerarDebriefing`): config → motores → guardas → render → gravar.
 */

import { describe, expect, it } from "vitest";
import { computeDebriefingAudience, type AnuncioDiaInput } from "../services/debriefing-audience-engine.js";
import type { DebriefingConfigLancamento } from "../services/debriefing-config.js";
import {
  gerarDebriefing,
  type DependenciasDaGeracao,
  type ParametrosDaGeracao,
  type RegistroDoDebriefing,
} from "../services/debriefing-generate.js";
import { lacunasExigidas, validateDebriefing } from "../services/debriefing-guards.js";
import { computeDebriefingMoneyTime } from "../services/debriefing-money-time-engine.js";
import { montarPayloadDebriefing, type DebriefingPayload } from "../services/debriefing-payload.js";
import {
  GERADO_EM,
  configSintetica,
  entradaAudienceSintetica,
  entradaMoneyTimeSintetica,
} from "./fixtures/debriefing-payload-sintetico.js";

type Dimensao = DebriefingConfigLancamento["dimensaoDeCriativo"];

/** Ad-level sintético da captação: um anúncio por tipo da convenção ia-humano. */
const ANUNCIOS: AnuncioDiaInput[] = [
  {
    adId: "120000000000000001",
    adName: "lanc-ia-01",
    campaignId: "c-cap-hot",
    campaignName: "lanc--vendas-captacao--hot--cbo",
    dia: "2026-04-20",
    spendBruto: 60,
    impressoes: 6000,
    linkClicks: 120,
  },
  {
    adId: "120000000000000002",
    adName: "lanc-h-02",
    campaignId: "c-cap-hot",
    campaignName: "lanc--vendas-captacao--hot--cbo",
    dia: "2026-04-21",
    spendBruto: 40,
    impressoes: 4000,
    linkClicks: 80,
  },
];

const configCom = (dimensao: Dimensao): DebriefingConfigLancamento => ({ ...configSintetica(), dimensaoDeCriativo: dimensao });

/** O payload dos motores reais com a dimensão e o ad-level escolhidos. */
function payloadDe(dimensao: Dimensao, comAdLevel: boolean, geradoEm: string | Date = GERADO_EM): DebriefingPayload {
  const config = configCom(dimensao);
  const mtIn = { ...entradaMoneyTimeSintetica(), config };
  const auBase = entradaAudienceSintetica(mtIn);
  const auIn = {
    ...auBase,
    config: { ...auBase.config, dimensaoDeCriativo: dimensao },
    criativos: { ...auBase.criativos, anuncios: comAdLevel ? ANUNCIOS : [] },
  };
  return montarPayloadDebriefing(computeDebriefingMoneyTime(mtIn), computeDebriefingAudience(auIn), config, geradoEm);
}

const P = "10000000-0000-4000-8000-000000000001";
const F = "20000000-0000-4000-8000-000000000001";
const S = "30000000-0000-4000-8000-000000000001";
const U = "40000000-0000-4000-8000-000000000001";
const PARAMS: ParametrosDaGeracao = { projectId: P, funnelId: F, stageId: S, userId: U, userRole: "user", investimentoOficial: null };

/**
 * Dependências falsas do orquestrador: a config sai da "49.1" com a dimensão
 * dada e o `calcularPayload` roda os motores sobre ela (a dimensão atravessa
 * config → motores → guardas → render). `ajustar` muta o payload calculado.
 */
function deps(dimensao: Dimensao, comAdLevel: boolean, ajustar?: (p: DebriefingPayload) => void) {
  const gravados: RegistroDoDebriefing[] = [];
  const d: DependenciasDaGeracao = {
    async resolverEtapa() {
      return { stageId: S, stageName: "Debriefing", stageType: "debriefing", funnelId: F, funnelName: "PG02", projectId: P, projectName: "Expert" };
    },
    async carregarConfig(stageId) {
      return { ...configCom(dimensao), stageId };
    },
    async etapasDeDebriefingDoFunil() {
      return [];
    },
    async ultimoPayloadSalvoDoFunil() {
      return null;
    },
    async calcularPayload(c, geradoEm) {
      const p = payloadDe(c.dimensaoDeCriativo, comAdLevel, geradoEm);
      ajustar?.(p);
      return p;
    },
    async nomes() {
      return { funis: { [F]: "PG02" }, etapas: {} };
    },
    async gravar(r) {
      gravados.push(r);
      return { id: "50000000-0000-4000-8000-000000000001" };
    },
    agora: () => new Date(GERADO_EM),
  };
  return { d, gravados };
}

async function gerar(dimensao: Dimensao, comAdLevel: boolean, ajustar?: (p: DebriefingPayload) => void) {
  const { d, gravados } = deps(dimensao, comAdLevel, ajustar);
  const r = await gerarDebriefing(d, PARAMS);
  return { r, gravados };
}

const htmlDe = (r: Awaited<ReturnType<typeof gerarDebriefing>>): string => (r.body as { html: string }).html;

/** Textos do documento que falam de métrica POR TIPO de criativo sem ad-level. */
const FALA_DE_TIPO_SEM_AD_LEVEL = [/por tipo de criativo não medidos/, /Mídia por criativo indisponível/, /Criativo por tipo/];

describe("AC1 — \"nenhuma\" sem ad-level: a geração não falha", () => {
  it("as guardas não bloqueiam: F11 passa e nada viola", () => {
    const g = validateDebriefing(payloadDe("nenhuma", false));
    expect(g.invariantes.find((i) => i.codigo === "F11")).toMatchObject({ status: "passed" });
    expect(g.violacoes).toEqual([]);
    expect(g.bloqueado).toBe(false);
  });

  it("de ponta a ponta pelo orquestrador: 200 e grava UMA vez, com a dimensão \"nenhuma\" no payload", async () => {
    const { r, gravados } = await gerar("nenhuma", false);
    expect(r.body).not.toHaveProperty("erro");
    expect(r.status).toBe(200);
    expect(gravados).toHaveLength(1);
    expect(gravados[0]!.payload.config.dimensaoDeCriativo).toBe("nenhuma");
    expect(gravados[0]!.payload.publico.tipoDeCriativo).toMatchObject({ aplicavel: false, adLevel: { aplicavel: false, linhas: 0 } });
  });
});

describe("AC2 — o documento não fala do que não exibe", () => {
  it("nenhuma lacuna exigida nem registrada sobre ad-level; nenhum WF9", () => {
    const p = payloadDe("nenhuma", false);
    expect(lacunasExigidas(p).map((e) => e.codigo)).not.toContain("SEM_AD_LEVEL");
    expect(p.lacunas.map((l) => l.codigo)).not.toContain("SEM_AD_LEVEL");
    expect(validateDebriefing(p).alertas.map((a) => a.codigo)).not.toContain("WF9");
  });

  it("o HTML gerado não cita métrica por tipo de criativo; a dimensão aparece como lacuna escrita", async () => {
    const { r } = await gerar("nenhuma", false);
    const html = htmlDe(r);
    for (const re of FALA_DE_TIPO_SEM_AD_LEVEL) expect(html).not.toMatch(re);
    expect(html).not.toContain("<b>WF9</b>");
    expect(html).toContain("Dimensão de criativo (nenhuma)");
    expect((r.body as { alertas: { codigo: string }[] }).alertas.map((a) => a.codigo)).not.toContain("WF9");
  });

  it("o WF9 de conflito de tipo continua valendo com a dimensão exibida (só o pedaço do ad-level depende dela)", () => {
    const p = payloadDe("ia-humano", true);
    p.publico.tipoDeCriativo.conflitosDeTipo.push({
      adId: "120000000000000003",
      adName: "lanc-ia-h-03",
      campaignName: null,
      pistaDoNome: "ambiguo",
      pistaDaCampanha: null,
      motivo: "IA_E_HUMANO_NO_NOME",
    });
    const wf9 = validateDebriefing(p).alertas.find((a) => a.codigo === "WF9");
    expect(wf9).toMatchObject({ quantidade: 1 });
    expect(wf9!.mensagem).not.toMatch(/sem ad-level/);
  });
});

describe.each(["ia-humano", "video-estatico"] as const)("AC3 — dimensão \"%s\" sem ad-level: nada muda", (dimensao) => {
  it("a lacuna SEM_AD_LEVEL é registrada, exigida e a geração passa", () => {
    const p = payloadDe(dimensao, false);
    expect(p.lacunas.map((l) => l.codigo)).toContain("SEM_AD_LEVEL");
    expect(lacunasExigidas(p).map((e) => e.codigo)).toContain("SEM_AD_LEVEL");
    expect(validateDebriefing(p).bloqueado).toBe(false);
  });

  it("sem a lacuna no payload, a F11 reprova citando SEM_AD_LEVEL", () => {
    const p = payloadDe(dimensao, false);
    p.lacunas = p.lacunas.filter((l) => l.codigo !== "SEM_AD_LEVEL");
    const f11 = validateDebriefing(p).invariantes.find((i) => i.codigo === "F11")!;
    expect(f11.status).toBe("failed");
    expect(f11.detalhe).toContain("lacuna SEM_AD_LEVEL ausente");
  });

  it("o WF9 avisa sobre métrica por tipo de criativo", () => {
    const wf9 = validateDebriefing(payloadDe(dimensao, false)).alertas.find((a) => a.codigo === "WF9");
    expect(wf9?.mensagem).toContain("sem ad-level no período (CTR, CPC e custo por tipo de criativo não medidos)");
  });

  it("de ponta a ponta: o HTML mostra \"Mídia por criativo indisponível\"; sem a lacuna, 422 INVARIANTE_VIOLADO e nada gravado", async () => {
    const ok = await gerar(dimensao, false);
    expect(ok.r.status).toBe(200);
    expect(htmlDe(ok.r)).toMatch(/Mídia por criativo indisponível/);
    expect(htmlDe(ok.r)).toContain("<b>WF9</b>");

    const sem = await gerar(dimensao, false, (p) => {
      p.lacunas = p.lacunas.filter((l) => l.codigo !== "SEM_AD_LEVEL");
    });
    expect(sem.r.status).toBe(422);
    expect(sem.r.body).toMatchObject({ erro: "INVARIANTE_VIOLADO" });
    expect(JSON.stringify(sem.r.body)).toContain("SEM_AD_LEVEL");
    expect(sem.gravados).toHaveLength(0);
  });
});

describe("\"nenhuma\" COM ad-level: segue sem exigência e sem aviso (já era assim)", () => {
  it("nada sobre ad-level é exigido nem avisado, e a geração passa", async () => {
    const p = payloadDe("nenhuma", true);
    expect(p.publico.tipoDeCriativo.adLevel).toEqual({ aplicavel: true, linhas: ANUNCIOS.length });
    expect(lacunasExigidas(p).map((e) => e.codigo)).not.toContain("SEM_AD_LEVEL");
    expect(validateDebriefing(p).alertas.map((a) => a.codigo)).not.toContain("WF9");
    const { r } = await gerar("nenhuma", true);
    expect(r.status).toBe(200);
  });
});
