import { describe, it, expect } from "vitest";
import { somarVideoMetrics } from "../services/video-metrics-agg.js";

const dia = (p25: number, p50: number, p75: number, p100: number, thruplay: number) => ({
  p25, p50, p75, p100, thruplay,
});

describe("somarVideoMetrics", () => {
  // Os 4 casos que o AC2 da Story 43.2 exige.

  it("soma 3 dias com vídeo", () => {
    const r = somarVideoMetrics([dia(10, 8, 5, 3, 4), dia(20, 15, 9, 6, 7), dia(5, 4, 2, 1, 2)]);
    expect(r).toEqual({ p25: 35, p50: 27, p75: 16, p100: 10, thruplay: 13 });
  });

  it("soma só os dias que têm, ignorando null no meio", () => {
    const r = somarVideoMetrics([dia(10, 8, 5, 3, 4), null, dia(20, 15, 9, 6, 7), null]);
    expect(r).toEqual({ p25: 30, p50: 23, p75: 14, p100: 9, thruplay: 11 });
  });

  it("devolve null quando nenhuma linha tem vídeo", () => {
    expect(somarVideoMetrics([null, null, undefined])).toBeNull();
    expect(somarVideoMetrics([])).toBeNull();
  });

  it("um único dia devolve o próprio dia", () => {
    expect(somarVideoMetrics([dia(10, 8, 5, 3, 4)])).toEqual(dia(10, 8, 5, 3, 4));
  });

  // --- Distinção que a story protege explicitamente ---

  it("NÃO transforma ausência de vídeo em zeros", () => {
    // `{0,0,0,0,0}` faria "não é vídeo" parecer "é vídeo que ninguém assistiu".
    expect(somarVideoMetrics([null])).toBeNull();
    expect(somarVideoMetrics([null])).not.toEqual(dia(0, 0, 0, 0, 0));
  });

  it("um dia legitimamente zerado continua sendo vídeo", () => {
    // Diferente do caso acima: aqui HÁ linha de vídeo, com retenção zero.
    expect(somarVideoMetrics([dia(0, 0, 0, 0, 0)])).toEqual(dia(0, 0, 0, 0, 0));
  });

  // --- Robustez: a coluna é jsonb sem $type<>, então a forma não é garantida ---

  it("ignora entradas que não são objeto", () => {
    expect(somarVideoMetrics(["texto", 42, true, [1, 2]])).toBeNull();
  });

  it("ignora campos não numéricos dentro de uma linha válida", () => {
    const r = somarVideoMetrics([{ p25: 10, origem: "meta", p75: null, p50: 4 }]);
    expect(r).toEqual({ p25: 10, p50: 4 });
  });

  it("ignora NaN e Infinity", () => {
    const r = somarVideoMetrics([{ p25: 10 }, { p25: NaN }, { p25: Infinity }]);
    expect(r).toEqual({ p25: 10 });
  });

  // --- Preparo para a Story 43.3 ---

  it("soma campos novos sem precisar ser alterada", () => {
    // A 43.3 acrescenta views3s e plays. Com soma dinâmica sobre as chaves,
    // esta função não precisa mudar — e nenhum campo novo deixa de somar por
    // esquecimento numa lista fixa.
    const r = somarVideoMetrics([
      { p25: 10, views3s: 100, plays: 120 },
      { p25: 20, views3s: 200, plays: 240 },
    ]);
    expect(r).toEqual({ p25: 30, views3s: 300, plays: 360 });
  });

  it("dias com conjuntos de campos diferentes somam o que cada um tem", () => {
    // Histórico antigo (sem views3s) convivendo com dias novos.
    const r = somarVideoMetrics([{ p25: 10, p75: 5 }, { p25: 20, p75: 9, views3s: 300 }]);
    expect(r).toEqual({ p25: 30, p75: 14, views3s: 300 });
  });

  it("não muta as linhas de entrada", () => {
    const d1 = dia(10, 8, 5, 3, 4);
    const d2 = dia(20, 15, 9, 6, 7);
    somarVideoMetrics([d1, d2]);
    expect(d1).toEqual(dia(10, 8, 5, 3, 4));
    expect(d2).toEqual(dia(20, 15, 9, 6, 7));
  });
});
