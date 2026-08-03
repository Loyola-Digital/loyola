/**
 * Story 41.9 — leituras dinâmicas (§C.5).
 *
 * O TESTE QUE IMPORTA é o de inversão: os mesmos cenários espelhados (frio
 * melhor que quente, margem negativa, estáticos melhores que vídeos) precisam
 * produzir texto que ACOMPANHA o dado. É a prova contra o bug que originou o
 * epic — um relatório que continuou dizendo "a conversão piorou" depois que ela
 * tinha melhorado, porque a frase estava fixa no template.
 */

import { describe, it, expect } from "vitest";
import {
  buildReadings,
  buildDataNotes,
  trendLabel,
  EMPATE_ROAS,
} from "../services/perpetual-report-readings.js";
import type { PerpetualReport, SegmentoRow } from "../services/perpetual-report-metrics.js";

function seg(over: Partial<SegmentoRow>): SegmentoRow {
  return {
    chave: "x",
    label: "X",
    investimento: 1000,
    pctInvestimento: 0.5,
    vendas: 10,
    faturamento: 2000,
    cac: 100,
    roas: 2,
    margem: 660,
    ...over,
  };
}

function makeReport(over: Partial<PerpetualReport> = {}): PerpetualReport {
  return {
    periodo: { inicio: "2026-07-01", fim: "2026-07-27", dias: 27 },
    kpis: {
      investimentoBruto: 1780,
      investimentoComImposto: 2000,
      vendas: 20,
      transacoes: 20,
      faturamentoBruto: 4000,
      ticketMedio: 200,
      cac: 100,
      roas: 2,
      margem: 1320.4,
      margemPct: 0.33,
      cacBreakeven: 166.02,
      cacVsBreakeven: -66.02,
      impressoes: 100000,
      cliques: 2000,
      ctr: 0.02,
      cpc: 1,
      cpm: 20,
    },
    memorialMargem: [],
    segmentos: {
      quenteFrio: [
        seg({ chave: "quente", label: "🔥 Quente", roas: 3, cac: 80, pctInvestimento: 0.6 }),
        seg({ chave: "frio", label: "❄️ Frio", roas: 1.2, cac: 160, pctInvestimento: 0.4 }),
      ],
      campanhas: [seg({ chave: "c1", label: "camp-1", roas: 2 })],
    },
    tendencia: { disponivel: true, metricas: [] },
    organico: { vendas: 0, faturamento: 0 },
    reconciliacao: { somaCampanhas: 20, sobreposicao: 0, semAtribuicao: 0 },
    alertas: [],
    fontes: {
      expert: "Netão",
      funil: "BBE-A1",
      produto: "Curso",
      prefixoCampanha: null,
      campanhasVinculadas: 2,
      receitaLiquidaPct: 0.8301,
      impostoPct: 0.1215,
    },
    ...over,
  };
}

// ------------------------------------------------------------------
// AC4 — teste de inversão
// ------------------------------------------------------------------

describe("AC4 — o texto acompanha o dado (prova contra o template fixo)", () => {
  it("margem positiva diz que COBRE; negativa diz que NÃO COBRE", () => {
    const positiva = buildReadings(makeReport())[0];
    expect(positiva).toContain("cobre o investimento");
    expect(positiva).not.toContain("não cobre");
    expect(positiva).toContain("sobra");

    const negativa = buildReadings(
      makeReport({
        kpis: { ...makeReport().kpis, margem: -1956.01, margemPct: -0.159, roas: 1.01 },
      }),
    )[0];
    expect(negativa).toContain("não cobre o investimento");
    expect(negativa).toContain("falta");
    expect(negativa).not.toContain("sobra");
  });

  it("quando o FRIO é melhor, é o frio que aparece como melhor", () => {
    const normal = buildReadings(makeReport()).join(" ");
    expect(normal).toMatch(/🔥 Quente performa melhor/);

    // Espelhado: mesmos números, papéis trocados.
    const invertido = buildReadings(
      makeReport({
        segmentos: {
          quenteFrio: [
            seg({ chave: "quente", label: "🔥 Quente", roas: 1.2, cac: 160, pctInvestimento: 0.6 }),
            seg({ chave: "frio", label: "❄️ Frio", roas: 3, cac: 80, pctInvestimento: 0.4 }),
          ],
          campanhas: [seg({ chave: "c1", label: "camp-1", roas: 2 })],
        },
      }),
    ).join(" ");
    expect(invertido).toMatch(/❄️ Frio performa melhor/);
    expect(invertido).not.toMatch(/🔥 Quente performa melhor/);
  });

  it("quando os ESTÁTICOS ganham, são eles que aparecem como melhores", () => {
    const base = makeReport();
    const videosGanham = buildReadings(
      makeReport({
        segmentos: {
          ...base.segmentos,
          formato: [
            seg({ chave: "videos", label: "Vídeos", roas: 2.5 }),
            seg({ chave: "estaticos", label: "Estáticos", roas: 1.2 }),
          ],
        },
      }),
    ).join(" ");
    expect(videosGanham).toMatch(/Vídeos entrega ROAS melhor/);

    const estaticosGanham = buildReadings(
      makeReport({
        segmentos: {
          ...base.segmentos,
          formato: [
            seg({ chave: "videos", label: "Vídeos", roas: 1.2 }),
            seg({ chave: "estaticos", label: "Estáticos", roas: 2.5 }),
          ],
        },
      }),
    ).join(" ");
    expect(estaticosGanham).toMatch(/Estáticos entrega ROAS melhor/);
    expect(estaticosGanham).not.toMatch(/Vídeos entrega ROAS melhor/);
  });

  it("CAC abaixo do breakeven diz 'com folga'; acima diz 'acima'", () => {
    const folga = buildReadings(makeReport()).join(" ");
    expect(folga).toContain("abaixo, com folga");

    const apertado = buildReadings(
      makeReport({
        kpis: { ...makeReport().kpis, cac: 58.33, cacBreakeven: 48.98, cacVsBreakeven: 9.35, ticketMedio: 59 },
      }),
    ).join(" ");
    expect(apertado).toContain("acima");
    expect(apertado).not.toContain("com folga");
  });
});

describe("AC4 — fronteira do empate de formato (§C.5 bloco 3)", () => {
  const base = makeReport();
  const comFormato = (roasA: number, roasB: number) =>
    buildReadings(
      makeReport({
        segmentos: {
          ...base.segmentos,
          formato: [
            seg({ chave: "videos", label: "Vídeos", roas: roasA }),
            seg({ chave: "estaticos", label: "Estáticos", roas: roasB }),
          ],
        },
      }),
    ).join(" ");

  it(`diferença de 0,14 (< ${EMPATE_ROAS}) declara empate`, () => {
    const texto = comFormato(2.0, 1.86);
    expect(texto).toContain("praticamente empatam");
    expect(texto).toContain("não é a alavanca");
  });

  it(`diferença de 0,16 (> ${EMPATE_ROAS}) declara vencedor`, () => {
    const texto = comFormato(2.0, 1.84);
    expect(texto).toContain("entrega ROAS melhor");
    expect(texto).not.toContain("empatam");
  });

  it("PPS-A1 da §C.10 (1,90 vs 1,86) é empate — a spec concorda", () => {
    expect(comFormato(1.9, 1.86)).toContain("praticamente empatam");
  });
});

// ------------------------------------------------------------------
// Blocos condicionais
// ------------------------------------------------------------------

describe("AC4 — blocos que não se aplicam somem (não viram 'sem dados')", () => {
  it("sem split de formato, nenhum bullet fala de formato", () => {
    const texto = buildReadings(makeReport()).join(" ");
    expect(texto).not.toMatch(/Vídeos|Estáticos|empatam/);
  });

  it("sem venda orgânica, nenhum bullet fala de orgânico", () => {
    const texto = buildReadings(makeReport()).join(" ");
    expect(texto).not.toContain("fora do tráfego pago");
  });

  it("com venda orgânica, o bullet aparece com o valor", () => {
    const texto = buildReadings(
      makeReport({ organico: { vendas: 3, faturamento: 1059.27 } }),
    ).join(" ");
    expect(texto).toContain("3 venda(s) fora do tráfego pago");
    expect(texto).toContain("ficam fora de CAC, ROAS e margem");
  });

  it("campanhas com ROAS < 1 são listadas com o quanto consomem", () => {
    const texto = buildReadings(
      makeReport({
        segmentos: {
          quenteFrio: makeReport().segmentos.quenteFrio,
          campanhas: [
            seg({ chave: "a", label: "camp-boa", roas: 3, investimento: 1000 }),
            seg({ chave: "b", label: "camp-ruim", roas: 0.8, investimento: 600 }),
          ],
        },
      }),
    ).join(" ");
    expect(texto).toContain("1 campanha(s) com ROAS abaixo de 1");
    expect(texto).toContain("camp-ruim");
    expect(texto).not.toContain("camp-boa");
  });

  it("gera entre 3 e 6 bullets", () => {
    const n = buildReadings(makeReport()).length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(6);
  });

  it("o ponto de equilíbrio é SEMPRE exibido (§C.5 bloco 5)", () => {
    expect(buildReadings(makeReport()).join(" ")).toContain("CAC precisa ficar abaixo de");
  });
});

// ------------------------------------------------------------------
// Tendência — CAC invertido (§C.4)
// ------------------------------------------------------------------

describe("AC3 — CAC tem sinal invertido na tendência", () => {
  it("CAC caindo é MELHORA; subindo é PIORA", () => {
    expect(trendLabel(-15, true).sentido).toBe("melhora");
    expect(trendLabel(15, true).sentido).toBe("piora");
  });

  it("ROAS caindo é PIORA; subindo é MELHORA — o oposto do CAC", () => {
    expect(trendLabel(-15, false).sentido).toBe("piora");
    expect(trendLabel(15, false).sentido).toBe("melhora");
  });

  it("variação abaixo de 1% é estável, não vira leitura falsa", () => {
    expect(trendLabel(0.4, true).sentido).toBe("estavel");
    expect(trendLabel(0.4, true).texto).toBe("estável");
  });

  it("sem dado devolve travessão, não zero", () => {
    expect(trendLabel(null, false).texto).toBe("—");
  });
});

// ------------------------------------------------------------------
// Notas de dado (AC5)
// ------------------------------------------------------------------

describe("AC5 — notas de dado", () => {
  it("sempre citam gross-up e memorial", () => {
    const notas = buildDataNotes(makeReport()).join(" ");
    expect(notas).toContain("gross-up");
    expect(notas).toContain("memorial");
  });

  it("alertas do motor viram nota em linguagem de quem lê", () => {
    const notas = buildDataNotes(
      makeReport({
        alertas: [
          { codigo: "W-P6", mensagem: "4 venda(s) sem campanha identificável" },
          { codigo: "W-P2", mensagem: "Amostra pequena (12 vendas)" },
        ],
      }),
    );
    expect(notas.some((n) => n.includes("sem campanha identificável"))).toBe(true);
    expect(notas.some((n) => n.includes("Amostra pequena"))).toBe(true);
    // Códigos são para o log, não para o leitor.
    expect(notas.join(" ")).not.toContain("W-P6");
  });

  it("seção ausente é explicada nas notas, não vira tabela vazia", () => {
    const notas = buildDataNotes(makeReport()).join(" ");
    expect(notas).toContain("Split de vídeos/estáticos não se aplica");
    expect(notas).toContain("público indisponível");
    expect(notas).toContain("criativo indisponível");
  });

  it("sobreposição é explicada — senão a tabela parece somar errado", () => {
    const notas = buildDataNotes(
      makeReport({ reconciliacao: { somaCampanhas: 22, sobreposicao: 2, semAtribuicao: 0 } }),
    ).join(" ");
    expect(notas).toContain("aparecem em mais de uma campanha");
  });
});
