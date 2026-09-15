import { describe, expect, it } from "vitest";
import {
  MEDIUM_DO_PIXEL,
  campanhasSemFormulario,
  leadsDaLp,
  lpsDaPlanilha,
  somarPixelNaPlanilha,
} from "../leads-da-lp";

describe("leadsDaLp", () => {
  it("LP com formulário continua na planilha, mesmo com pixel", () => {
    // A LPA: nada muda para ela.
    expect(leadsDaLp({ total: 96, hot: 82, cold: 14 }, 120, "todos")).toEqual({
      leads: 96,
      fonte: "planilha",
    });
  });

  it("LP sem nenhum lead na planilha usa o pixel", () => {
    // A LPB: sem formulário, a planilha fica zerada.
    expect(leadsDaLp({ total: 0, hot: 0, cold: 0 }, 20, "todos")).toEqual({
      leads: 20,
      fonte: "pixel",
    });
  });

  it("LP que nem aparece na planilha também usa o pixel", () => {
    expect(leadsDaLp(undefined, 20, "todos")).toEqual({ leads: 20, fonte: "pixel" });
  });

  it("o filtro Hot/Cold não troca a fonte", () => {
    // Planilha só com cold: no filtro Hot a linha segue na planilha (0), não
    // pula para o pixel.
    expect(leadsDaLp({ total: 5, hot: 0, cold: 5 }, 30, "hot")).toEqual({
      leads: 0,
      fonte: "planilha",
    });
  });

  it("aplica o filtro na planilha", () => {
    expect(leadsDaLp({ total: 96, hot: 82, cold: 14 }, 0, "cold").leads).toBe(14);
  });

  it("sem planilha e sem pixel: zero, marcado como pixel", () => {
    expect(leadsDaLp(undefined, 0, "todos")).toEqual({ leads: 0, fonte: "pixel" });
  });
});

describe("lpsDaPlanilha", () => {
  it("lê lpX do utm_term e do utm_content", () => {
    const lps = lpsDaPlanilha([
      { named: { utm_term: "hot-lpa" } },
      { named: { utm_content: "criativo_LPC" } },
      { named: { utm_term: "sem nada" } },
    ]);
    expect([...lps].sort()).toEqual(["lpa", "lpc"]);
  });
});

describe("campanhasSemFormulario", () => {
  const campanhas = [
    { id: "1", name: "fz-m3-set26--leads-captacao—cold-lpa" },
    { id: "2", name: "fz-m3-set26--leads-captacao—hot-lpb" },
    { id: "3", name: "fz-m3-set26--leads-captacao—cold-lpb" },
    { id: "4", name: "campanha alpha help" },
    { id: "5", name: "remarketing" },
  ];

  it("pega só as campanhas da LP que não está na planilha", () => {
    expect(campanhasSemFormulario(campanhas, new Set(["lpa"]))).toEqual(["2", "3"]);
  });

  it("'alpha' e 'help' não viram LP", () => {
    // Somariam pixel em cima de leads que já estão na planilha.
    expect(campanhasSemFormulario(campanhas, new Set(["lpa", "lpb"]))).toEqual([]);
  });

  it("planilha sem nenhuma LP marcada não soma nada", () => {
    // Não dá para saber quem não tem formulário; somar duplicaria.
    expect(campanhasSemFormulario(campanhas, new Set())).toEqual([]);
  });

  it("lpb no fim ou seguido de número também vale", () => {
    expect(
      campanhasSemFormulario(
        [
          { id: "a", name: "captacao lpb" },
          { id: "b", name: "captacao_lpb2_hot" },
        ],
        new Set(["lpa"]),
      ),
    ).toEqual(["a", "b"]);
  });
});

describe("somarPixelNaPlanilha", () => {
  const dia = (leadsPagos: number) => ({
    leadsPagos,
    leadsOrg: 1,
    leadsSemTrack: 0,
    faturamento: 0,
    leadsByMedium: { "123": leadsPagos },
  });

  it("soma o pixel nos leads pagos e no detalhamento por medium", () => {
    const r = somarPixelNaPlanilha(
      new Map([["2026-09-11", dia(10)]]),
      new Map([["2026-09-11", 4]]),
    );
    const d = r.get("2026-09-11")!;
    expect(d.leadsPagos).toBe(14);
    expect(d.leadsOrg).toBe(1);
    expect(d.leadsByMedium[MEDIUM_DO_PIXEL]).toBe(4);
    // O balão do Total fecha com a célula.
    expect(Object.values(d.leadsByMedium).reduce((a, b) => a + b, 0)).toBe(14);
  });

  it("cria o dia que só teve lead do pixel", () => {
    const r = somarPixelNaPlanilha(new Map(), new Map([["2026-09-12", 3]]));
    expect(r.get("2026-09-12")!.leadsPagos).toBe(3);
  });

  it("não mexe no mapa original", () => {
    const original = new Map([["2026-09-11", dia(10)]]);
    somarPixelNaPlanilha(original, new Map([["2026-09-11", 4]]));
    expect(original.get("2026-09-11")!.leadsPagos).toBe(10);
  });

  it("dia com zero no pixel não cria linha", () => {
    expect(somarPixelNaPlanilha(new Map(), new Map([["2026-09-12", 0]])).size).toBe(0);
  });
});
