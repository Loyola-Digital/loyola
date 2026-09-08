import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { filterSheetRowsByDays } from "@/lib/utils/spreadsheet-filters";

/**
 * Story 18.80 — a janela do filtro de planilha tem `days` dias, não `days + 1`.
 *
 * ## O defeito
 *
 * O filtro é inclusivo nas duas pontas. Com `cutoff = hoje - days`, isso
 * devolvia **oito** dias para o seletor de sete. E o resultado cruza com dado
 * da Meta, que sempre veio com sete (`traffic-analytics.ts:1191` usa
 * `days - 1`): leads de 8 dias sobre investimento de 7, em CPL, CAC, ROAS e no
 * Top Criativos. **O erro tinha direção — sempre otimista.**
 *
 * ## Medido antes de corrigir (08/09/2026)
 *
 * ```
 * bbe-fc1-a1-mai-26 · leads · 7 dias    16 reais → 24 exibidos   (+50%)
 * bbe-pr2-ago-26    · leads · 7 dias    26 reais → 34 exibidos   (+31%)
 * pps1  · vendas do perpétuo · 30 dias  35 reais → 43 exibidos   (+23%)
 * ```
 *
 * ⚠️ A magnitude oscila com o que caiu no dia extra — no BBE, 01/09 sozinho
 * tinha mais leads que qualquer dia da janela. Num dia comum a distorção fica
 * perto de 1/7 (~14%). **O defeito não oscilava.**
 *
 * ## O relógio é congelado nestes testes
 *
 * A função lê `new Date()`. Sem congelar, o teste passa hoje e falha na virada
 * do mês — e alguém gasta uma manhã com um vermelho que não é defeito.
 */

const COL = { date: "data" };

function planilha(datas: string[]) {
  return {
    mapping: COL,
    rows: datas.map((d) => ({ named: { date: d } })),
  } as unknown as Parameters<typeof filterSheetRowsByDays>[0];
}

/** As datas que sobreviveram ao filtro, ordenadas. */
function sobreviveram(datas: string[], days: number): string[] {
  return filterSheetRowsByDays(planilha(datas), days)
    .map((r) => (r.named as { date: string }).date)
    .sort();
}

beforeEach(() => {
  vi.useFakeTimers();
  // 08/09/2026 às 13h local — meio do dia, para o teste não depender de fuso.
  vi.setSystemTime(new Date(2026, 8, 8, 13, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Story 18.80 — a janela tem exatamente `days` dias", () => {
  const NOVE_DIAS = [
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
    "2026-09-07",
    "2026-09-08",
  ];

  it("7 dias devolve 7 linhas — 02/09 a 08/09", () => {
    const r = sobreviveram(NOVE_DIAS, 7);
    expect(r).toHaveLength(7);
    expect(r[0]).toBe("2026-09-02");
    expect(r[r.length - 1]).toBe("2026-09-08");
  });

  /**
   * ⚠️ Este é o teste que falha com o defeito de volta. Trocar `days - 1` por
   * `days` faz 01/09 entrar, e a asserção quebra.
   */
  it("o dia anterior à janela fica de FORA", () => {
    expect(sobreviveram(NOVE_DIAS, 7)).not.toContain("2026-09-01");
  });

  it("hoje está DENTRO — uma janela que termina hoje inclui hoje", () => {
    expect(sobreviveram(NOVE_DIAS, 7)).toContain("2026-09-08");
  });

  it("1 dia devolve só hoje", () => {
    expect(sobreviveram(NOVE_DIAS, 1)).toEqual(["2026-09-08"]);
  });

  it("30 dias pega tudo o que existe aqui, e nada além", () => {
    expect(sobreviveram(NOVE_DIAS, 30)).toHaveLength(9);
  });
});

describe("Story 18.80 — a régua bate com a da API", () => {
  /**
   * A API usa `hoje - (days - 1)` desde sempre
   * (`traffic-analytics.ts:1191`), e a Story 44.27 fixou a mesma régua em
   * `inicioDaJanela`. É o cruzamento entre as duas que produzia o defeito, então
   * a igualdade das janelas é o que este teste trava.
   */
  const inicioDaJanelaComoNaApi = (dias: number, ate: string): string => {
    const d = new Date(`${ate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (dias - 1));
    return d.toISOString().slice(0, 10);
  };

  for (const dias of [1, 7, 14, 30, 90]) {
    it(`${dias} dias: o primeiro dia aceito é o mesmo que a API calcula`, () => {
      const esperado = inicioDaJanelaComoNaApi(dias, "2026-09-08");
      // Uma linha exatamente no primeiro dia da janela e outra um dia antes.
      const anterior = inicioDaJanelaComoNaApi(dias + 1, "2026-09-08");
      const r = sobreviveram([anterior, esperado], dias);
      expect(r).toContain(esperado);
      expect(r).not.toContain(anterior);
    });
  }
});

describe("Story 18.80 — o que não mudou", () => {
  it("sem coluna de data mapeada, devolve tudo (não há como filtrar)", () => {
    const semData = {
      mapping: {},
      rows: [{ named: { date: "2026-01-01" } }, { named: { date: "2026-09-08" } }],
    } as unknown as Parameters<typeof filterSheetRowsByDays>[0];
    expect(filterSheetRowsByDays(semData, 7)).toHaveLength(2);
  });

  it("linha com data ilegível é descartada, não vira hoje", () => {
    const r = sobreviveram(["não é data", "2026-09-05"], 7);
    expect(r).toEqual(["2026-09-05"]);
  });

  it("data futura fica de fora", () => {
    expect(sobreviveram(["2026-09-20", "2026-09-05"], 7)).toEqual(["2026-09-05"]);
  });

  it("planilha ausente devolve lista vazia", () => {
    expect(filterSheetRowsByDays(undefined, 7)).toEqual([]);
  });

  it("aceita data em formato brasileiro", () => {
    expect(sobreviveram(["05/09/2026"], 7)).toEqual(["05/09/2026"]);
  });
});

describe("Story 18.80 — borda que a correção introduziu", () => {
  /**
   * `days = 0` não vem do seletor, mas `- (0 - 1)` daria `+1` e jogaria o
   * cutoff para amanhã — a função devolveria vazio para qualquer entrada. O
   * `Math.max(0, ...)` faz `0` se comportar como `1`.
   */
  it("days = 0 não joga o corte para o futuro", () => {
    expect(sobreviveram(["2026-09-08", "2026-09-07"], 0)).toEqual(["2026-09-08"]);
  });
});
