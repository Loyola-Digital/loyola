import { describe, it, expect } from "vitest";
import { parseDate } from "../routes/stage-sales-data.js";

/**
 * Story pós-42.10 — a data brasileira perdia a hora.
 *
 * `agruparEmCheckouts` (18.68) junta linhas do mesmo comprador a menos de 60
 * segundos. Com a hora zerada, duas compras do mesmo e-mail no mesmo dia ficam
 * a 0 segundos e viram UM checkout — mesmo com horas de diferença.
 *
 * Strings reais das planilhas de produção (2026-08-25).
 */
describe("parseDate preserva a hora no formato brasileiro", () => {
  it("dd/mm/aaaa hh:mm:ss", () => {
    const d = parseDate("25/06/2026 15:43:00")!;
    expect(d.getHours()).toBe(15);
    expect(d.getMinutes()).toBe(43);
    expect(d.getDate()).toBe(25);
    expect(d.getMonth()).toBe(5); // junho
  });

  it("dd/mm/aaaa hh:mm, sem segundos", () => {
    const d = parseDate("19/06/2026 15:54")!;
    expect(d.getHours()).toBe(15);
    expect(d.getMinutes()).toBe(54);
  });

  it("duas compras do mesmo dia ficam a HORAS de distância, não a zero", () => {
    // O defeito em uma linha: antes, as duas caíam em 00:00 e a janela de 60s
    // as fundia num checkout só.
    const a = parseDate("19/06/2026 12:54:00")!;
    const b = parseDate("19/06/2026 15:54:44")!;
    const segundos = (b.getTime() - a.getTime()) / 1000;
    expect(segundos).toBeGreaterThan(60);
    expect(Math.round(segundos)).toBe(10844);
  });

  it("sem hora, continua à meia-noite — é o melhor palpite disponível", () => {
    const d = parseDate("19/06/2026")!;
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(19);
  });

  it("o dia NÃO é confundido com o mês", () => {
    // `new Date("06/07/2026")` leria 7 de junho. A captura explícita evita.
    const d = parseDate("06/07/2026 10:00:00")!;
    expect(d.getDate()).toBe(6);
    expect(d.getMonth()).toBe(6); // julho
  });

  it("ISO continua funcionando", () => {
    const d = parseDate("2026-06-25 15:43:00")!;
    expect(d.getDate()).toBe(25);
    expect(d.getHours()).toBe(15);
  });

  it("vazio e lixo devolvem null", () => {
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate("sem data")).toBeNull();
  });
});
