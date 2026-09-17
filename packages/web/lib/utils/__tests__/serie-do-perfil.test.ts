import { describe, expect, it } from "vitest";
import {
  METRICAS_DIARIAS,
  METRICAS_MENSAIS,
  serieDiaria,
  serieMensal,
} from "../serie-do-perfil";

const entries = [
  {
    name: "reach",
    values: [
      { value: 73770, end_time: "2026-09-04T07:00:00+0000" },
      { value: 62628, end_time: "2026-09-05T07:00:00+0000" },
    ],
  },
  { name: "follower_count", values: [{ value: 536, end_time: "2026-09-04T07:00:00+0000" }] },
  // A Meta devolve estas VAZIAS quando pedidas como série.
  { name: "views", values: [] },
];

describe("serieDiaria", () => {
  it("monta os pontos com rótulo dd/MM", () => {
    const s = serieDiaria(entries, "reach");
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ rotulo: "04/09", fim: "2026-09-04T07:00:00+0000", valor: 73770 });
  });

  it("o rótulo sai da string, não do fuso do navegador", () => {
    // Convertendo para Date, 07:00Z vira 04/09 04:00 em São Paulo — mas em
    // outro fuso viraria 03/09, e o eixo mudaria de dia sozinho.
    expect(serieDiaria(entries, "reach")[0]!.rotulo).toBe("04/09");
  });

  it("métrica sem série devolve vazio (não uma linha em zero)", () => {
    expect(serieDiaria(entries, "views")).toEqual([]);
    expect(serieDiaria(entries, "profile_views")).toEqual([]);
    expect(serieDiaria(undefined, "reach")).toEqual([]);
  });
});

describe("serieMensal", () => {
  const meses = [
    { mes: "2026-07", alcance: 1_000_000, crescimento: -2255 },
    { mes: "2026-08", alcance: 1_400_000, crescimento: 4134 },
  ];

  it("rótulo curto e ordem preservada", () => {
    expect(serieMensal(meses, "alcance")).toEqual([
      { rotulo: "Jul/26", valor: 1_000_000 },
      { rotulo: "Ago/26", valor: 1_400_000 },
    ]);
  });

  it("saldo negativo continua negativo", () => {
    expect(serieMensal(meses, "crescimento")[0]!.valor).toBe(-2255);
  });

  it("campo ausente vira zero, sem quebrar o gráfico", () => {
    expect(serieMensal(meses, "views")[0]!.valor).toBe(0);
    expect(serieMensal(undefined, "alcance")).toEqual([]);
  });
});

describe("catálogo de métricas", () => {
  it("o diário só oferece o que a Meta entrega em série", () => {
    // Medido: das nove testadas, só estas duas voltam com pontos.
    expect(METRICAS_DIARIAS.map((m) => m.chave)).toEqual(["reach", "follower_count"]);
  });

  it("toda métrica tem rótulo, dica e cor", () => {
    for (const m of [...METRICAS_DIARIAS, ...METRICAS_MENSAIS]) {
      expect(m.rotulo.length).toBeGreaterThan(0);
      expect(m.dica.length).toBeGreaterThan(10);
      expect(m.cor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
