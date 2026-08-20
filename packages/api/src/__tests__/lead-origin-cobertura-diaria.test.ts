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

const { computeLeadOriginForStage, findColIdx, ALIASES } = await import("../services/lead-origin-sync.js");

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

describe("mapeamento por ÍNDICE — a coluna de cabeçalho vazio (Story 44.12)", () => {
  /**
   * Export do Tally: as três primeiras colunas têm cabeçalho VAZIO e a data mora
   * na terceira. Com cabeçalho vazio nem o mapeamento por nome alcança — 9 das
   * 15 etapas em cache não tinham data nenhuma, e isso só ficou visível quando
   * a cobertura diária passou a precisar dela.
   */
  const TALLY = ["", "", "", "name", "email", "phone", "utm_content"];
  const linhaTally = (data: string, email: string, content: string) => [
    "Ar7OOAo",
    "Zjz88go",
    data,
    "Carol",
    email,
    "5511999999",
    content,
  ];

  it("sem mapeamento, a data de cabeçalho vazio fica ilegível — o estado ANTERIOR", async () => {
    readSheetData.mockResolvedValue({
      headers: TALLY,
      rows: [linhaTally("29/03/2026", "a@x.com", "111111111")],
    });
    const p = await computeLeadOriginForStage(fakeDb({ adsConhecidos: ["111111111"] }), "s1");
    expect(p?.coberturaDiaria).toEqual([]);
    expect(p?.leadsSemData).toBe(1);
  });

  it('`{"date": "2"}` resolve a coluna por índice e a cobertura passa a existir', async () => {
    readSheetData.mockResolvedValue({
      headers: TALLY,
      rows: [
        linhaTally("29/03/2026", "a@x.com", "111111111"),
        linhaTally("30/03/2026", "b@x.com", "999999999"),
      ],
    });
    const p = await computeLeadOriginForStage(
      fakeDb({ adsConhecidos: ["111111111"], planilha: { date: "2" } }),
      "s1",
    );
    expect(p?.leadsSemData).toBe(0);
    expect(p?.coberturaDiaria).toEqual([
      { date: "2026-03-29", leadsAtribuidos: 1, leadsTotais: 1 },
      { date: "2026-03-30", leadsAtribuidos: 0, leadsTotais: 1 },
    ]);
  });

  it("⚠️ o NOME vence o índice — coluna literalmente chamada '2' não é sequestrada", async () => {
    // Inverter a ordem faria o índice roubar este caso, e a planilha passaria a
    // ler a terceira coluna em vez da chamada "2".
    readSheetData.mockResolvedValue({
      headers: ["email", "2", "outra", "utm_content"],
      rows: [["a@x.com", "05/04/2026", "lixo", "111111111"]],
    });
    const p = await computeLeadOriginForStage(
      fakeDb({ adsConhecidos: ["111111111"], planilha: { date: "2" } }),
      "s1",
    );
    expect(p?.coberturaDiaria[0]?.date).toBe("2026-04-05");
  });

  it("índice fora do intervalo cai nos aliases, não estoura", async () => {
    readSheetData.mockResolvedValue({
      headers: ["email", "Data", "utm_content"],
      rows: [["a@x.com", "07/04/2026", "111111111"]],
    });
    const p = await computeLeadOriginForStage(
      fakeDb({ adsConhecidos: ["111111111"], planilha: { date: "99" } }),
      "s1",
    );
    // Caiu no alias "data" e resolveu.
    expect(p?.coberturaDiaria[0]?.date).toBe("2026-04-07");
  });

  it("NÃO adivinha por conteúdo — coluna de data sem cabeçalho e sem mapeamento continua ilegível", async () => {
    // Procurar "uma coluna que pareça data" é como se lê a coluna errada em
    // silêncio. Índice é explícito: alguém escreveu 2, alguém responde por ele.
    readSheetData.mockResolvedValue({
      headers: ["email", "", "utm_content"],
      rows: [["a@x.com", "09/04/2026", "111111111"]],
    });
    const p = await computeLeadOriginForStage(fakeDb({ adsConhecidos: ["111111111"] }), "s1");
    expect(p?.coberturaDiaria).toEqual([]);
    expect(p?.leadsSemData).toBe(1);
  });
});

/**
 * Story 44.12 — a coluna de data que a PESQUISA já mapeou.
 *
 * Levantamento de produção (2026-08-19): das 9 etapas em cache sem data
 * resolvida, 7 **já tinham** a coluna certa apontada no painel, em
 * `funnel_surveys.column_mapping.timestamp`. O sync não a lia — os dois ramos de
 * pesquisa devolviam `columnMapping: null` — e caía nos `ALIASES`, que em duas
 * delas escolhiam uma coluna PIOR que a mapeada.
 */
describe("coberturaDiaria — a data mapeada na pesquisa tem precedência sobre o alias", () => {
  /** Reproduz `fz-m2-jul26`: o alias acha `Data Conversão`, que está VAZIA. */
  const CABECALHO_PESQUISA = [
    "E-mail",
    "Telefone",
    "utm_content",
    "Submitted at",
    "Data Conversão",
    "Respondent ID",
  ];

  function fakeDbPesquisa(opts: {
    kind: "pesquisa" | "lead_scoring";
    surveyMapping: Record<string, string> | null;
    adsConhecidos?: string[];
  }) {
    const { kind, surveyMapping, adsConhecidos = [] } = opts;
    const encadear = (rows: unknown[]) => {
      const chain: Record<string, unknown> = {};
      chain.where = () => chain;
      chain.innerJoin = () => chain;
      chain.limit = () => Promise.resolve(rows);
      chain.then = (r: (v: unknown[]) => unknown) => Promise.resolve(rows).then(r);
      return chain;
    };
    const paraTabela = (table: unknown): unknown[] => {
      if (table === funnelStages) return [{ projectId: "proj-1" }];
      if (table === stageLeadScoringSchemas) {
        return kind === "lead_scoring" ? [{ surveyId: "sv1" }] : [];
      }
      if (table === funnelSurveys) {
        return [{ spreadsheetId: "ss1", sheetName: "Pesquisa", columnMapping: surveyMapping }];
      }
      if (table === funnelSpreadsheets) return [];
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

  const linhas = [
    ["ana@x.com", "", "111111111", "2026-08-01 10:00:00", "", "resp-1"],
    ["bru@x.com", "", "", "2026-08-02 11:00:00", "", "resp-2"],
  ];

  it("usa a coluna do `timestamp` da pesquisa, não a que o alias acharia", async () => {
    readSheetData.mockResolvedValue({ headers: CABECALHO_PESQUISA, rows: linhas });
    const p = await computeLeadOriginForStage(
      fakeDbPesquisa({
        kind: "pesquisa",
        surveyMapping: { timestamp: "Submitted at" },
        adsConhecidos: ["111111111"],
      }),
      "s1",
    );
    expect(p?.coberturaDiaria).toEqual([
      { date: "2026-08-01", leadsAtribuidos: 1, leadsTotais: 1 },
      { date: "2026-08-02", leadsAtribuidos: 0, leadsTotais: 1 },
    ]);
    expect(p?.leadsSemData).toBe(0);
  });

  it("o mesmo vale para a fonte `lead_scoring`", async () => {
    readSheetData.mockResolvedValue({ headers: CABECALHO_PESQUISA, rows: linhas });
    const p = await computeLeadOriginForStage(
      fakeDbPesquisa({ kind: "lead_scoring", surveyMapping: { timestamp: "Submitted at" } }),
      "s1",
    );
    expect(p?.fonte).toBe("lead_scoring");
    expect(p?.coberturaDiaria.map((d) => d.date)).toEqual(["2026-08-01", "2026-08-02"]);
  });

  it("SEM `timestamp` mapeado, o alias continua sendo a única via", async () => {
    // Trava que a mudança é opt-in: pesquisa sem mapeamento se comporta como
    // antes — aqui o alias acha a `Data Conversão` vazia e a série sai vazia,
    // com as linhas DECLARADAS em `leadsSemData` (regra 7.4), não inventadas.
    readSheetData.mockResolvedValue({ headers: CABECALHO_PESQUISA, rows: linhas });
    const p = await computeLeadOriginForStage(
      fakeDbPesquisa({ kind: "pesquisa", surveyMapping: {} }),
      "s1",
    );
    expect(p?.coberturaDiaria).toEqual([]);
    expect(p?.leadsSemData).toBe(2);
  });

  it("promove também o `utm_content` — é ele que decide quem está atribuído", async () => {
    // Medido em produção: a `pps1` guarda o Ad ID numa coluna chamada `co=`,
    // que nenhum alias acha, e saía com cobertura 0% tendo 70 de 77 rastreados.
    readSheetData.mockResolvedValue({
      headers: ["E-mail", "Telefone", "co=", "Submitted at", "Data Conversão", "Respondent ID"],
      rows: [
        ["ana@x.com", "", "111111111", "2026-08-01 10:00:00", "", "resp-1"],
        ["bru@x.com", "", "222222222", "2026-08-01 11:00:00", "", "resp-2"],
      ],
    });
    const p = await computeLeadOriginForStage(
      fakeDbPesquisa({
        kind: "pesquisa",
        surveyMapping: { timestamp: "Submitted at", utm_content: "co=" },
        adsConhecidos: ["111111111"],
      }),
      "s1",
    );
    expect(p?.coberturaDiaria).toEqual([
      { date: "2026-08-01", leadsAtribuidos: 1, leadsTotais: 2 },
    ]);
  });

  it("`utm_source` NÃO é promovido — mudaria Pago/Orgânico de cache publicado", async () => {
    // A fronteira desta story. `classifyOrigem` lê `utm_source`; promovê-lo
    // reclassificaria etapas cujo número já está em outras abas.
    readSheetData.mockResolvedValue({
      headers: ["E-mail", "Telefone", "co=", "Submitted at", "s=", "Respondent ID"],
      rows: [["ana@x.com", "", "111111111", "2026-08-01 10:00:00", "meta", "resp-1"]],
    });
    const p = await computeLeadOriginForStage(
      fakeDbPesquisa({
        kind: "pesquisa",
        surveyMapping: { timestamp: "Submitted at", utm_content: "co=", utm_source: "s=" },
        adsConhecidos: ["111111111"],
      }),
      "s1",
    );
    // A coluna `s=` fica ilegível para o classificador — como antes desta story.
    expect(p?.byOrigin.find((o) => o.origem === "Pago")).toBeUndefined();
  });

  it("SÓ a data é promovida — `email` segue no alias, para não trocar o dedup", async () => {
    // ⚠️ Promover as outras chaves trocaria o identificador de dedup de caches
    // já publicados. Duas linhas com o MESMO e-mail e `Respondent ID`
    // diferentes: o único tem que continuar sendo 1.
    readSheetData.mockResolvedValue({
      headers: CABECALHO_PESQUISA,
      rows: [
        ["ana@x.com", "", "", "2026-08-01 10:00:00", "", "resp-1"],
        ["ana@x.com", "", "", "2026-08-02 11:00:00", "", "resp-2"],
      ],
    });
    const p = await computeLeadOriginForStage(
      fakeDbPesquisa({
        kind: "pesquisa",
        surveyMapping: { timestamp: "Submitted at", email: "Respondent ID" },
      }),
      "s1",
    );
    expect(p?.uniqueLeads).toBe(1);
    expect(p?.coberturaDiaria.map((d) => d.leadsTotais)).toEqual([1, 1]);
  });

  it("a fronteira INTEIRA: das 7 chaves do mapping, só `date` e `utm_content` são promovidas", async () => {
    /**
     * QA-4412-06 — o teste anterior trava `email` e o de cima trava
     * `utm_source`. Furando a fronteira chave a chave, `phone`, `utm_medium` e
     * `utm_term` não faziam NENHUM teste falhar: a story afirmava uma fronteira
     * inteira e havia meia.
     *
     * Os três livres não são inofensivos pelo argumento da própria story:
     * `utm_medium` alimenta `classifyCanal` e `utm_term` alimenta
     * `classifyTemperatura` — ambos publicados no endpoint público —, e `phone`
     * é a metade do identificador de dedup do lead sem e-mail.
     *
     * Método: o mapping traz as SETE chaves, e as cinco que devem ficar de fora
     * apontam para colunas-isca VAZIAS. Se `dataMapeadaNaSurvey` promover
     * qualquer uma delas, o valor lido cai para vazio e a asserção quebra.
     * A data é o controle POSITIVO: o alias resolveria `Data Conversão` (vazia),
     * então a série só existe porque `timestamp` foi promovido de fato.
     */
    readSheetData.mockResolvedValue({
      headers: [
        "E-mail",
        "Telefone",
        "utm_source",
        "utm_medium",
        "utm_term",
        "Submitted at",
        "Data Conversão",
        "isca-email",
        "isca-phone",
        "isca-source",
        "isca-medium",
        "isca-term",
      ],
      rows: [["ana@x.com", "11999998888", "meta", "cpc", "quente", "2026-08-01 10:00:00", "", "", "", "", "", ""]],
    });
    const p = await computeLeadOriginForStage(
      fakeDbPesquisa({
        kind: "pesquisa",
        surveyMapping: {
          timestamp: "Submitted at",
          email: "isca-email",
          phone: "isca-phone",
          utm_source: "isca-source",
          utm_medium: "isca-medium",
          utm_term: "isca-term",
        },
      }),
      "s1",
    );

    // Controle positivo: a data FOI promovida (o alias cairia na coluna vazia).
    expect(p?.coberturaDiaria).toEqual([{ date: "2026-08-01", leadsAtribuidos: 0, leadsTotais: 1 }]);

    // As cinco que ficam no alias, numa asserção só.
    expect({
      email: p?.identifiersFilled.email,
      phone: p?.identifiersFilled.phone,
      source: p?.byUtm.source[0]?.value,
      medium: p?.byUtm.medium[0]?.value,
      term: p?.byUtm.term[0]?.value,
    }).toEqual({ email: 1, phone: 1, source: "meta", medium: "cpc", term: "quente" });
  });

  it("leadsPorCampanhaDia: o numerador da Conv. LP, por campanha e por dia (44.10 AC1)", async () => {
    /**
     * Story 44.10 — a SEGUNDA saída do laço. Dois anúncios de campanhas
     * diferentes, no mesmo dia, mais um lead sem `utm_content`.
     *
     * ⚠️ O que este teste trava, além do agrupamento: `coberturaDiaria`
     * **continua igual**. Ela alimenta a guarda em produção, e trocar a chave
     * do mapa por `campaignId|date` em vez de acrescentar um segundo mapa
     * desligaria a guarda nas 7 etapas gratuitas.
     */
    readSheetData.mockResolvedValue({
      headers: CABECALHO_PESQUISA,
      rows: [
        ["a@x.com", "", "111111111", "2026-08-01 10:00:00", "", "r1"],
        ["b@x.com", "", "222222222", "2026-08-01 11:00:00", "", "r2"],
        ["c@x.com", "", "111111111", "2026-08-01 12:00:00", "", "r3"],
        ["d@x.com", "", "", "2026-08-01 13:00:00", "", "r4"],
        ["e@x.com", "", "111111111", "2026-08-02 10:00:00", "", "r5"],
      ],
    });
    const p = await computeLeadOriginForStage(
      fakeDbPesquisa({
        kind: "pesquisa",
        surveyMapping: { timestamp: "Submitted at" },
        adsConhecidos: ["111111111", "222222222"],
      }),
      "s1",
    );

    expect(p?.leadsPorCampanhaDia).toEqual([
      { campaignId: "camp-111111111", date: "2026-08-01", leads: 2 },
      { campaignId: "camp-111111111", date: "2026-08-02", leads: 1 },
      { campaignId: "camp-222222222", date: "2026-08-01", leads: 1 },
    ]);

    // A primeira saída não mudou: 4 atribuídos de 5 totais no dia 01 — o lead
    // sem `utm_content` conta no total e em campanha nenhuma.
    expect(p?.coberturaDiaria).toEqual([
      { date: "2026-08-01", leadsAtribuidos: 3, leadsTotais: 4 },
      { date: "2026-08-02", leadsAtribuidos: 1, leadsTotais: 1 },
    ]);

    // Σ por campanha (4) < Σ leadsTotais (5). É a distância que `coberturaLeads`
    // reporta, e "consertar" a diferença é o que a AC6 da 44.3 proíbe.
    const somaCampanha = p!.leadsPorCampanhaDia.reduce((a, x) => a + x.leads, 0);
    const somaTotal = p!.coberturaDiaria.reduce((a, d) => a + d.leadsTotais, 0);
    expect(somaCampanha).toBe(4);
    expect(somaTotal).toBe(5);
  });

  it("o MESMO lead em duas campanhas: a série por campanha SOBREPÕE, o deduplicado não (QA-4410-01)", async () => {
    /**
     * Achado do gate, medido em produção: na `bbe-pr1-mar-26/Captação gratuita`
     * a soma de `leadsPorCampanhaDia` dava **196** contra **192** de
     * `coberturaDiaria.leadsAtribuidos` — 4 a mais.
     *
     * A causa é a mesma pessoa preenchendo a pesquisa duas vezes no mesmo dia,
     * vindo de anúncios de campanhas diferentes. `coberturaDiaria` deduplica
     * por dia (`Set` de chave) e conta 1; a série por campanha contava 1 em
     * cada campanha.
     *
     * ⚠️ É a MESMA classe do QA-44-01, que a Story 44.3 já corrigiu uma vez
     * (`85bfcba8` — "coberturaLeads é união das chaves, não soma dos
     * conjuntos"). O numerador da `convLP` não pode exceder o de `atribuídos`.
     */
    readSheetData.mockResolvedValue({
      headers: CABECALHO_PESQUISA,
      rows: [
        ["ana@x.com", "", "111111111", "2026-08-01 10:00:00", "", "r1"],
        ["ana@x.com", "", "222222222", "2026-08-01 15:00:00", "", "r2"],
      ],
    });
    const p = await computeLeadOriginForStage(
      fakeDbPesquisa({
        kind: "pesquisa",
        surveyMapping: { timestamp: "Submitted at" },
        adsConhecidos: ["111111111", "222222222"],
      }),
      "s1",
    );

    // Uma pessoa, um dia: a cobertura conta 1 de 1.
    expect(p?.coberturaDiaria).toEqual([{ date: "2026-08-01", leadsAtribuidos: 1, leadsTotais: 1 }]);

    // ⚠️ E a série por campanha conta 1 em CADA — somando 2. Isso está CERTO
    // pela regra da 44.3: "quantos leads esta campanha trouxe" tem resposta
    // legítima com o mesmo lead em duas. O que não pode é SOMAR essas
    // respostas para derivar uma taxa sobre denominador deduplicado, e é
    // exatamente o que o consumidor deixou de fazer — ver o teste irmão em
    // `public-cadeia-cac.test.ts` ("o Atual da Conv. LP usa o numerador
    // deduplicado").
    expect(p?.leadsPorCampanhaDia).toEqual([
      { campaignId: "camp-111111111", date: "2026-08-01", leads: 1 },
      { campaignId: "camp-222222222", date: "2026-08-01", leads: 1 },
    ]);
    const somaPorCampanha = p!.leadsPorCampanhaDia.reduce((a, x) => a + x.leads, 0);
    const deduplicado = p!.coberturaDiaria.reduce((a, d) => a + d.leadsAtribuidos, 0);
    expect(somaPorCampanha).toBe(2);
    expect(deduplicado).toBe(1);
  });

  it("sem anúncio conhecido, a série por campanha fica VAZIA — não inventa campanha", async () => {
    readSheetData.mockResolvedValue({
      headers: CABECALHO_PESQUISA,
      rows: [["a@x.com", "", "999999999", "2026-08-01 10:00:00", "", "r1"]],
    });
    const p = await computeLeadOriginForStage(
      fakeDbPesquisa({ kind: "pesquisa", surveyMapping: { timestamp: "Submitted at" }, adsConhecidos: [] }),
      "s1",
    );
    expect(p?.leadsPorCampanhaDia).toEqual([]);
    // E o dia continua existindo com o lead no total — a cobertura é 0/1.
    expect(p?.coberturaDiaria).toEqual([{ date: "2026-08-01", leadsAtribuidos: 0, leadsTotais: 1 }]);
  });

  it("PONTA A PONTA: a cobertura que sai do produtor barra a janela no consumidor", async () => {
    /**
     * QA-4412-07 (AC7, linha 6) — o teste que já existia chamava `calcularTetos`
     * com uma `cobertura` montada à mão. Ele prova a guarda, não a LIGAÇÃO: se o
     * produtor parasse de emitir `coberturaDiaria`, ou emitisse no formato
     * errado, aquele teste seguiria verde. Foi por essa fresta que o QA-4412-01
     * passou despercebido.
     *
     * Aqui a cobertura vem de `computeLeadOriginForStage` — planilha de verdade,
     * dedup de verdade, atribuição de verdade — e entra em `calcularTetos` sem
     * ninguém tocar no meio do caminho.
     *
     * Cenário: 14 dias, 2 leads por dia. Na primeira semana só 1 dos 2 carrega
     * `utm_content` que resolve para ad conhecido (rastreio 50%); na segunda,
     * os 2 carregam (100%). A série de campanha dá à primeira semana a conversão
     * APARENTE melhor — a armadilha exata que a guarda existe para pegar.
     */
    const linhas14: string[][] = [];
    for (let i = 0; i < 14; i++) {
      const d = `2026-08-${String(i + 1).padStart(2, "0")}`;
      const rastreados = i < 7 ? 1 : 2;
      for (let j = 0; j < 2; j++) {
        linhas14.push([`lead${i}-${j}@x.com`, "", j < rastreados ? "111111111" : "", `${d} 10:00:00`, "", `r${i}-${j}`]);
      }
    }
    readSheetData.mockResolvedValue({ headers: CABECALHO_PESQUISA, rows: linhas14 });
    const p = await computeLeadOriginForStage(
      fakeDbPesquisa({
        kind: "pesquisa",
        surveyMapping: { timestamp: "Submitted at" },
        adsConhecidos: ["111111111"],
      }),
      "s1",
    );

    // O produtor entregou a série que o consumidor espera — 50% depois 100%.
    expect(p?.coberturaDiaria).toHaveLength(14);
    expect(p?.coberturaDiaria.map((c) => `${c.leadsAtribuidos}/${c.leadsTotais}`)).toEqual([
      ...Array(7).fill("1/2"),
      ...Array(7).fill("2/2"),
    ]);

    const serie: SerieDeCampanha[] = [
      {
        campaignId: "c1",
        fonte: "ad-level",
        dias: p!.coberturaDiaria.map((c, i) => ({
          date: c.date,
          spend: 100,
          impressions: 10_000,
          linkClicks: 200,
          landingPageViews: 200,
          checkouts: 0,
          leadsAtribuidos: i < 7 ? 60 : 20,
        })),
      },
    ];

    const semGuarda = calcularTetos(serie, "gratuita");
    const comGuarda = calcularTetos(serie, "gratuita", { coberturaDaEtapa: p!.coberturaDiaria });

    // Sem guarda o teto vem da semana de rastreio ruim; com guarda, não.
    expect(semGuarda.convLP.valor).toBeGreaterThan(comGuarda.convLP.valor ?? 0);

    // E a janela que sobrou não é atípica perante a mediana da série PRODUZIDA.
    const medianaDaEtapa = mediana(p!.coberturaDiaria.map((c) => c.leadsAtribuidos / c.leadsTotais))!;
    const janela = (comGuarda.convLP as { coberturaJanela?: number }).coberturaJanela;
    expect(janela).toBeDefined();
    expect(coberturaAtipica(janela!, medianaDaEtapa)).toBe(false);
  });
});

describe("findColIdx — a segunda passada, agora que o script de diagnóstico a importa (QA-4412-08)", () => {
  /**
   * `findColIdx` era privada e o script `diag-cobertura-colunas.ts` mantinha uma
   * CÓPIA dela. A cópia não era fiel: a segunda passada tinha só
   * `h.includes(na)`, sem o guarda `h.length > 2` e sem o `na.includes(h)`.
   *
   * Consequência: o script SUB-reportava a resolução por alias, e o
   * levantamento das etapas do BBE sai justamente dessa saída. Agora ela é
   * importada — e por isso passa a ser superfície pública que merece trava.
   *
   * ⚠️ Medido: nas 15 etapas em cache hoje a divergência não muda NENHUMA linha
   * da saída. Ela é real (os casos abaixo), mas não é um número errado que
   * alguém tenha lido — é a armadilha da próxima rodada.
   */
  it("casa pelo alias que CONTÉM o header, não só pelo header que contém o alias", () => {
    // `"carimbodedatahora".includes("hora")` — o ramo que faltava na cópia.
    expect(findColIdx(["hora"], ALIASES.date)).toBe(0);
    expect(findColIdx(["Carimbo"], ALIASES.date)).toBe(0);
  });

  it("o guarda de tamanho impede header de 1–2 letras de casar com qualquer alias", () => {
    // Sem `h.length > 2`, `"date".includes("dt")` seria falso, mas headers
    // curtos como `s=`/`co=` normalizam para 1 letra e casariam por acidente.
    expect(findColIdx(["dt"], ALIASES.date)).toBe(-1);
    expect(findColIdx(["s"], ALIASES.utmSource)).toBe(-1);
  });

  it("exact normalizado continua vencendo o contains", () => {
    // `Data Conversão` casaria por contains, mas `data` é exato e vem antes.
    expect(findColIdx(["Data Conversão", "data"], ALIASES.date)).toBe(1);
  });
});
