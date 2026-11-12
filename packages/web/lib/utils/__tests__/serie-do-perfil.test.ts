import { describe, expect, it } from "vitest";
import {
  METRICAS_DIARIAS,
  METRICAS_MENSAIS,
  serieDiaria,
  serieDiariaComparada,
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

describe("serieDiariaComparada", () => {
  /** N dias de alcance, terminando em 30/09. */
  const serie = (valores: number[], ate = 30) => [
    {
      name: "reach",
      values: valores.map((value, i) => ({
        value,
        end_time: `2026-09-${String(ate - valores.length + 1 + i).padStart(2, "0")}T07:00:00+0000`,
      })),
    },
  ];

  it("os dois últimos dias saem da linha cheia e entram na tracejada", () => {
    const s = serieDiariaComparada(serie([10, 20, 30, 40, 50]), undefined, "reach");
    expect(s.map((p) => p.valorFechado)).toEqual([10, 20, 30, null, null]);
    expect(s.map((p) => p.fechando)).toEqual([null, null, 30, 40, 50]);
    expect(s.map((p) => p.parcial)).toEqual([false, false, false, true, true]);
  });

  it("o valor cheio continua disponível em todos os dias", () => {
    const s = serieDiariaComparada(serie([10, 20, 30, 40, 50]), undefined, "reach");
    expect(s.map((p) => p.valor)).toEqual([10, 20, 30, 40, 50]);
  });

  it("o período anterior entra alinhado pelo FIM", () => {
    // 31 pontos antes contra 30 agora: o último de lá fica sob o último de cá.
    const antes = serie(Array.from({ length: 6 }, (_, i) => (i + 1) * 100));
    const s = serieDiariaComparada(serie([1, 2, 3, 4, 5]), antes, "reach");
    expect(s.map((p) => p.anterior)).toEqual([200, 300, 400, 500, 600]);
  });

  it("sem período anterior a linha de comparação não existe", () => {
    const s = serieDiariaComparada(serie([1, 2, 3]), undefined, "reach");
    expect(s.every((p) => p.anterior === null)).toBe(true);
  });

  // Num período de 2 dias, cortar 2 deixaria o gráfico sem nenhuma linha.
  it("série curta não perde a linha cheia", () => {
    const s = serieDiariaComparada(serie([10, 20]), undefined, "reach");
    expect(s.map((p) => p.valorFechado)).toEqual([10, 20]);
    expect(s.every((p) => p.fechando === null)).toBe(true);
    expect(s.every((p) => !p.parcial)).toBe(true);
  });

  it("sem dado nenhum devolve vazio", () => {
    expect(serieDiariaComparada(undefined, undefined, "reach")).toEqual([]);
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

  // Desenhado como zero, o mês sem dado parecia um mês em que o perfil morreu
  // (auditado em 21/09/2026: views de mar/25 e meses gravados pela metade).
  it("campo ausente fica FORA do gráfico, não vira zero", () => {
    expect(serieMensal(meses, "views")).toEqual([]);
    expect(serieMensal(undefined, "alcance")).toEqual([]);
  });

  it("mês sem dado da Meta fica fora do gráfico", () => {
    const s = serieMensal(
      [
        { mes: "2026-07", semDados: true, alcance: 0 },
        { mes: "2026-08", semDados: false, alcance: 500 },
      ],
      "alcance",
    );
    expect(s.map((p) => p.valor)).toEqual([500]);
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
