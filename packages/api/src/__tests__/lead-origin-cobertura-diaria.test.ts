import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  funnelSurveys,
  funnelSpreadsheets,
  stageLeadScoringSchemas,
  funnelStages,
  metaAdInsightsDaily,
} from "../db/schema.js";
import {
  calcularTetos,
  coberturaAtipica,
  mediana,
  type CoberturaDiaria,
  type SerieDeCampanha,
} from "@loyola-x/shared";

/**
 * Story 44.12 — o produtor de `CoberturaDiaria`.
 *
 * O que estes testes travam não é a aritmética (ela mora no `shared` e já está
 * testada) — é o **contrato do dado**: contagens em vez de frações, quem conta
 * como atribuído, e a divergência deliberada entre a soma dos dias e o total
 * único.
 *
 * ⚠️ Verificados por REVERSÃO.
 */

const readSheetData = vi.hoisted(() => vi.fn());
vi.mock("../services/google-sheets.js", () => ({ readSheetData }));

const { computeLeadOriginForStage } = await import("../services/lead-origin-sync.js");

/**
 * `db` falso que roteia por TABELA, como o molde da Story 36.9 — estendido para
 * as duas consultas que a 44.12 acrescentou: o `projectId` da etapa (com
 * `innerJoin`) e o mapa `adId → campanha` (com `selectDistinct`).
 */
function fakeDb(opts: {
  projectId?: string | null;
  /** adIds que EXISTEM em `meta_ad_insights_daily` — os que "resolvem". */
  adsConhecidos?: string[];
  planilha?: Record<string, unknown>;
}) {
  const { projectId = "proj-1", adsConhecidos = [], planilha = {} } = opts;

  const encadear = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    chain.where = () => chain;
    chain.innerJoin = () => chain;
    chain.limit = () => Promise.resolve(rows);
    chain.then = (r: (v: unknown[]) => unknown) => Promise.resolve(rows).then(r);
    return chain;
  };

  const paraTabela = (table: unknown): unknown[] => {
    if (table === funnelStages) return projectId ? [{ projectId }] : [];
    if (table === stageLeadScoringSchemas) return [];
    if (table === funnelSurveys) return [];
    if (table === funnelSpreadsheets) {
      return [{ spreadsheetId: "ss1", sheetName: "leads", label: "Leads", columnMapping: planilha }];
    }
    if (table === metaAdInsightsDaily) {
      return adsConhecidos.map((adId) => ({ adId, campaignId: `camp-${adId}` }));
    }
    throw new Error("tabela inesperada na query");
  };

  return {
    select: () => ({ from: (t: unknown) => encadear(paraTabela(t)) }),
    selectDistinct: () => ({ from: (t: unknown) => encadear(paraTabela(t)) }),
  } as never;
}

const CABECALHO = ["E-mail", "Telefone", "utm_content", "Data"];
const planilha = (rows: string[][]) => {
  readSheetData.mockResolvedValue({ headers: CABECALHO, rows });
};

beforeEach(() => {
  readSheetData.mockReset();
});

describe("coberturaDiaria — contagens, nunca frações", () => {
  it("agrupa por dia com leads atribuídos e totais", async () => {
    planilha([
      ["ana@x.com", "", "111111111", "01/08/2026"],
      ["bru@x.com", "", "", "01/08/2026"],
      ["caio@x.com", "", "111111111", "02/08/2026"],
    ]);
    const p = await computeLeadOriginForStage(fakeDb({ adsConhecidos: ["111111111"] }), "s1");
    expect(p?.coberturaDiaria).toEqual([
      { date: "2026-08-01", leadsAtribuidos: 1, leadsTotais: 2 },
      { date: "2026-08-02", leadsAtribuidos: 1, leadsTotais: 1 },
    ]);
    // ⚠️ Se viesse fração pronta, `coberturaDaJanela` (razão de SOMAS) não teria
    // como somar numerador e denominador da janela — daria outro número.
    for (const d of p!.coberturaDiaria) {
      expect(Number.isInteger(d.leadsAtribuidos)).toBe(true);
      expect(Number.isInteger(d.leadsTotais)).toBe(true);
    }
  });

  it("a série sai ordenada por data", async () => {
    planilha([
      ["a@x.com", "", "", "10/08/2026"],
      ["b@x.com", "", "", "03/08/2026"],
      ["c@x.com", "", "", "07/08/2026"],
    ]);
    const p = await computeLeadOriginForStage(fakeDb({}), "s1");
    expect(p?.coberturaDiaria.map((d) => d.date)).toEqual([
      "2026-08-03",
      "2026-08-07",
      "2026-08-10",
    ]);
  });
});

describe("coberturaDiaria — quem conta como ATRIBUÍDO (Decisão 1 do @po)", () => {
  it("`utm_content` que NÃO resolve para anúncio conhecido não conta", async () => {
    // Decisão do @po: cobertura é razão, e o numerador do convLP conta só id
    // resolvido. Contar id não resolvido compararia populações diferentes.
    planilha([
      ["ana@x.com", "", "111111111", "01/08/2026"], // conhecido
      ["bru@x.com", "", "999999999", "01/08/2026"], // NÃO conhecido (cache velho / outra conta)
    ]);
    const p = await computeLeadOriginForStage(fakeDb({ adsConhecidos: ["111111111"] }), "s1");
    expect(p?.coberturaDiaria[0]).toEqual({
      date: "2026-08-01",
      leadsAtribuidos: 1,
      leadsTotais: 2,
    });
  });

  it("`utm_content` que não parece Ad ID não conta — mesma regra da atribuição", async () => {
    // `comoAdId` exige 5+ dígitos. "lp-a" é rótulo de LP, não anúncio.
    planilha([["ana@x.com", "", "lp-a", "01/08/2026"]]);
    const p = await computeLeadOriginForStage(fakeDb({ adsConhecidos: ["lp-a"] }), "s1");
    expect(p?.coberturaDiaria[0]?.leadsAtribuidos).toBe(0);
  });

  it("sem projectId resolvido, nada é atribuído — não inventa cobertura", async () => {
    planilha([["ana@x.com", "", "111111111", "01/08/2026"]]);
    const p = await computeLeadOriginForStage(
      fakeDb({ projectId: null, adsConhecidos: ["111111111"] }),
      "s1",
    );
    expect(p?.coberturaDiaria[0]?.leadsAtribuidos).toBe(0);
    expect(p?.coberturaDiaria[0]?.leadsTotais).toBe(1);
  });
});

describe("coberturaDiaria — a divergência DELIBERADA com uniqueLeads (Decisão 2)", () => {
  it("lead em dois dias conta 1 no global e 2 na série — e isso está certo", async () => {
    // ⚠️ Este teste existe para impedir um "conserto". A soma dos dias divergir
    // do total único parece o defeito do QA-44-01 e NÃO é: lá o denominador era
    // único e o numerador somava por campanha (passava de 100%); aqui os dois
    // lados são do MESMO dia, então cada janela é sempre ≤ 1.
    planilha([
      ["ana@x.com", "", "111111111", "03/08/2026"],
      ["ana@x.com", "", "111111111", "11/08/2026"],
    ]);
    const p = await computeLeadOriginForStage(fakeDb({ adsConhecidos: ["111111111"] }), "s1");

    expect(p?.uniqueLeads).toBe(1);
    const somaDosDias = p!.coberturaDiaria.reduce((s, d) => s + d.leadsTotais, 0);
    expect(somaDosDias).toBe(2);
    expect(somaDosDias).not.toBe(p?.uniqueLeads);

    // E a razão de cada dia continua ≤ 1, que é o invariante que importa.
    for (const d of p!.coberturaDiaria) {
      expect(d.leadsAtribuidos).toBeLessThanOrEqual(d.leadsTotais);
    }
  });

  it("o mesmo lead DUAS vezes no mesmo dia conta uma só", async () => {
    planilha([
      ["ana@x.com", "", "111111111", "03/08/2026"],
      ["ana@x.com", "", "111111111", "03/08/2026"],
    ]);
    const p = await computeLeadOriginForStage(fakeDb({ adsConhecidos: ["111111111"] }), "s1");
    expect(p?.coberturaDiaria).toEqual([
      { date: "2026-08-03", leadsAtribuidos: 1, leadsTotais: 1 },
    ]);
  });
});

describe("coberturaDiaria — linha sem data é declarada, não corrigida", () => {
  it("data ilegível fica FORA da série e entra em `leadsSemData`", async () => {
    planilha([
      ["ana@x.com", "", "111111111", "01/08/2026"],
      ["bru@x.com", "", "111111111", "sem data nenhuma"],
    ]);
    const p = await computeLeadOriginForStage(fakeDb({ adsConhecidos: ["111111111"] }), "s1");
    expect(p?.leadsSemData).toBe(1);
    expect(p?.coberturaDiaria).toHaveLength(1);
    // Continua contada no total único — some da SÉRIE, não do lead.
    expect(p?.uniqueLeads).toBe(2);
  });

  it("linha sem identificador não entra na cobertura — não dá para deduplicar", async () => {
    planilha([
      ["ana@x.com", "", "111111111", "01/08/2026"],
      ["", "", "111111111", "01/08/2026"], // sem e-mail nem telefone
    ]);
    const p = await computeLeadOriginForStage(fakeDb({ adsConhecidos: ["111111111"] }), "s1");
    // `uniqueLeads` já a ignora pelo mesmo motivo; contá-la aqui inflaria o
    // denominador da cobertura contra um numerador que não pode crescer.
    expect(p?.coberturaDiaria[0]?.leadsTotais).toBe(1);
    expect(p?.leadsSemData).toBe(0);
  });
});

describe("coberturaDiaria — o dado alimenta a guarda de ponta a ponta", () => {
  const dia = (date: string, over: Partial<{ landingPageViews: number; leadsAtribuidos: number }> = {}) => ({
    date,
    spend: 100,
    impressions: 10_000,
    linkClicks: 200,
    landingPageViews: 200,
    checkouts: 0,
    leadsAtribuidos: 20,
    ...over,
  });

  it("janela com cobertura 20 p.p. abaixo da mediana é BARRADA pela guarda", async () => {
    // 14 dias: a primeira semana com rastreio ruim (50%), a segunda boa (100%).
    // A primeira semana tem conversão APARENTE melhor — é exatamente a armadilha
    // que a guarda existe para pegar.
    const dias = Array.from({ length: 14 }, (_, i) =>
      dia(`2026-08-${String(i + 1).padStart(2, "0")}`, { leadsAtribuidos: i < 7 ? 60 : 20 }),
    );
    const serie: SerieDeCampanha[] = [{ campaignId: "c1", fonte: "ad-level", dias }];

    const cobertura: CoberturaDiaria[] = dias.map((d, i) => ({
      date: d.date,
      leadsAtribuidos: i < 7 ? 50 : 100,
      leadsTotais: 100,
    }));

    const semGuarda = calcularTetos(serie, "gratuita");
    const comGuarda = calcularTetos(serie, "gratuita", { coberturaDaEtapa: cobertura });

    // Sem a guarda, o teto vem da semana de rastreio ruim (conversão inflada).
    expect(semGuarda.convLP.valor).toBeGreaterThan(comGuarda.convLP.valor ?? 0);

    // Com a guarda, a janela vencedora NÃO pode ser atípica. Afirmar a
    // PROPRIEDADE, não um número — as janelas de 7 dias corridos atravessam a
    // virada de rastreio, então prever qual vence é palpite, e palpite quebra o
    // teste quando o cenário muda sem que a regra mude.
    const medianaDaEtapa = mediana(cobertura.map((c) => c.leadsAtribuidos / c.leadsTotais))!;
    const janela = (comGuarda.convLP as { coberturaJanela?: number }).coberturaJanela;
    expect(janela).toBeDefined();
    expect(coberturaAtipica(janela!, medianaDaEtapa)).toBe(false);
  });
});
