/**
 * Story 43.9 — insights por anúncio lidos do banco.
 *
 * O que se testa aqui é a AGREGAÇÃO: somar dias, juntar `actions` por tipo e
 * decidir o que fazer com métrica de vídeo ausente. A consulta em si (o
 * predicado do drizzle) não é testável sem banco, e um mock que devolve o que
 * eu mandei não prova filtro nenhum — seria decoração.
 */
import { describe, it, expect } from "vitest";
import { somarVideoMetrics } from "../services/meta-db-source.js";

describe("somarVideoMetrics — soma os dias, não pega o último", () => {
  it("soma cada faixa de retenção entre os dias", () => {
    const r = somarVideoMetrics([
      { p25: 10, p50: 5, p75: 3, p100: 1, thruplay: 4 },
      { p25: 20, p50: 9, p75: 4, p100: 2, thruplay: 6 },
    ]);
    expect(r).toEqual({ p25: 30, p50: 14, p75: 7, p100: 3, thruplay: 10 });
  });

  it("o defeito que isto evita: NÃO devolve o valor do último dia", () => {
    // Trocar a soma por `?? último` daria { p25: 20 } — plausível, e errado por
    // um fator que cresce com o tamanho do range.
    const r = somarVideoMetrics([{ p25: 10, p50: 0, p75: 0, p100: 0, thruplay: 0 },
                                 { p25: 20, p50: 0, p75: 0, p100: 0, thruplay: 0 }]);
    expect(r!.p25).toBe(30);
    expect(r!.p25).not.toBe(20);
  });

  it("sem NENHUM dia com métrica, devolve null — não um objeto de zeros", () => {
    // `null` é "a Meta não devolveu reprodução"; zeros seriam "medimos e deu
    // zero". A diferença decide se o criativo fica FORA do ranking de hook ou
    // aparece como o pior dele (Story 29.65, AC3).
    expect(somarVideoMetrics([null, undefined])).toBeNull();
    expect(somarVideoMetrics([])).toBeNull();
  });

  it("dia sem métrica no meio não zera o total", () => {
    const r = somarVideoMetrics([
      { p25: 10, p50: 0, p75: 0, p100: 0, thruplay: 0 },
      null,
      { p25: 5, p50: 0, p75: 0, p100: 0, thruplay: 0 },
    ]);
    expect(r!.p25).toBe(15);
  });

  it("opcionais só aparecem se algum dia os trouxe", () => {
    // `views3s: 0` diria "medimos e deu zero" onde o certo é "não veio".
    const sem = somarVideoMetrics([{ p25: 1, p50: 0, p75: 0, p100: 0, thruplay: 0 }]);
    expect(sem).not.toHaveProperty("views3s");
    expect(sem).not.toHaveProperty("plays");

    const com = somarVideoMetrics([
      { p25: 1, p50: 0, p75: 0, p100: 0, thruplay: 0, views3s: 7 },
      { p25: 1, p50: 0, p75: 0, p100: 0, thruplay: 0, views3s: 3 },
    ]);
    expect(com!.views3s).toBe(10);
    expect(com).not.toHaveProperty("plays");
  });

  it("um dia com o opcional e outro sem: soma o que existe, não descarta", () => {
    const r = somarVideoMetrics([
      { p25: 1, p50: 0, p75: 0, p100: 0, thruplay: 0, views3s: 7 },
      { p25: 1, p50: 0, p75: 0, p100: 0, thruplay: 0 },
    ]);
    expect(r!.views3s).toBe(7);
  });

  it("valor não-numérico não vira NaN no total", () => {
    // O jsonb vem do banco: um dia gravado torto não pode contaminar o range.
    const r = somarVideoMetrics([
      { p25: 10, p50: 0, p75: 0, p100: 0, thruplay: 0 },
      { p25: "x" as unknown as number, p50: 0, p75: 0, p100: 0, thruplay: 0 },
    ]);
    expect(r!.p25).toBe(10);
    expect(Number.isNaN(r!.p25)).toBe(false);
  });
});
