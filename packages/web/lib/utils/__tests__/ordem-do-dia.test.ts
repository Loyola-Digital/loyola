// Story 18.82 — ordenação da tabela "Dados diários" pela coluna Dia (AC4, AC5).
import { describe, expect, it } from "vitest";
import {
  ORDEM_DO_DIA_PADRAO,
  inverterOrdemDoDia,
  ordenarLinhasPorDia,
} from "../ordem-do-dia";
import { buildDailyRows } from "../funnel-metrics";

type Linha = { date: string; spend: number };

// Fora de ordem de propósito, e cruzando a virada de ano: "2025-12-31" tem
// que ficar ANTES de "2026-01-01" em `asc` — é o que prova que comparar a
// string ISO é comparar a data.
const desordenadas: Linha[] = [
  { date: "2026-01-02", spend: 3 },
  { date: "2025-12-31", spend: 1 },
  { date: "2026-01-01", spend: 2 },
  { date: "2025-12-30", spend: 0 },
];

describe("ordenarLinhasPorDia (AC5)", () => {
  it("o padrão é desc: dia mais recente primeiro", () => {
    expect(ORDEM_DO_DIA_PADRAO).toBe("desc");
    expect(ordenarLinhasPorDia(desordenadas).map((l) => l.date)).toEqual([
      "2026-01-02",
      "2026-01-01",
      "2025-12-31",
      "2025-12-30",
    ]);
  });

  it("asc: dia mais antigo primeiro, atravessando a virada de ano", () => {
    expect(ordenarLinhasPorDia(desordenadas, "asc").map((l) => l.date)).toEqual([
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
  });

  it("NÃO muta a entrada — `rows` é compartilhado com os gráficos", () => {
    const antes = desordenadas.map((l) => l.date);
    const resultado = ordenarLinhasPorDia(desordenadas);
    expect(desordenadas.map((l) => l.date)).toEqual(antes);
    expect(resultado).not.toBe(desordenadas);
  });

  it("devolve as MESMAS linhas nas duas ordens — só a posição muda (AC3)", () => {
    const desc = ordenarLinhasPorDia(desordenadas, "desc");
    const asc = ordenarLinhasPorDia(desordenadas, "asc");
    expect([...desc].reverse()).toEqual(asc);
    expect(desc.reduce((s, l) => s + l.spend, 0)).toBe(
      desordenadas.reduce((s, l) => s + l.spend, 0),
    );
  });

  it("lista vazia e lista de um dia não quebram", () => {
    expect(ordenarLinhasPorDia([])).toEqual([]);
    expect(ordenarLinhasPorDia([{ date: "2026-05-05" }])).toEqual([{ date: "2026-05-05" }]);
  });
});

describe("inverterOrdemDoDia (AC2)", () => {
  it("alterna e volta", () => {
    expect(inverterOrdemDoDia("desc")).toBe("asc");
    expect(inverterOrdemDoDia("asc")).toBe("desc");
    expect(inverterOrdemDoDia(inverterOrdemDoDia("desc"))).toBe("desc");
  });
});

// AC4 — guarda: a FONTE continua ascendente. Se alguém "consertar" a ordem
// em `buildDailyRows` para atender a tabela, a projeção dos gráficos ancora
// no dia errado sem erro nenhum. Este teste é o alarme.
describe("buildDailyRows continua ascendente (AC4)", () => {
  it("entrega as linhas do dia mais antigo para o mais recente, mesmo recebendo fora de ordem", () => {
    const meta = new Map<
      string,
      { spend: number; impressions: number; linkClicks: number; lpView: number; checkoutInitiations: number }
    >();
    const vazio = { spend: 1, impressions: 10, linkClicks: 1, lpView: 1, checkoutInitiations: 0 };
    meta.set("2026-01-02", vazio);
    meta.set("2025-12-31", vazio);
    meta.set("2026-01-01", vazio);
    const rows = buildDailyRows(meta, new Map());
    expect(rows.map((r) => r.date)).toEqual(["2025-12-31", "2026-01-01", "2026-01-02"]);
  });
});
