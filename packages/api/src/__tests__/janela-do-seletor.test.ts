import { describe, it, expect } from "vitest";
import { inicioDaJanela, shiftDayKey, businessToday } from "../utils/sale-date.js";

/**
 * Story 44.27 — a régua ÚNICA do seletor de período.
 *
 * Havia duas: as vendas do perpétuo cortavam com `-days` (N+1 dias) e o
 * investimento com `(days − 1)` (N dias). Com `days = 7` em 07/09/2026 a
 * tabela listava OITO dias: a venda de 31/08 entrava, o investimento não. O
 * dia órfão somava receita sem somar custo, e a Tendência de 7 dias emitia
 * 1.61x onde os seletores de 30d/90d, para a mesma janela, emitiam 1.36x.
 *
 * A diferença era exatamente o investimento de um dia — R$ 4.646,80 com 31/08
 * contra R$ 3.922,21 sem ele.
 */
describe("inicioDaJanela — a régua única do seletor (Story 44.27)", () => {
  it("uma janela de N dias terminando hoje INCLUI hoje", () => {
    // 7 dias terminando em 07/09 = 01/09..07/09
    expect(inicioDaJanela(7, "2026-09-07")).toBe("2026-09-01");
    expect(inicioDaJanela(30, "2026-09-07")).toBe("2026-08-09");
    expect(inicioDaJanela(90, "2026-09-07")).toBe("2026-06-10");
  });

  it("a janela tem exatamente N dias — nem N+1", () => {
    for (const n of [1, 7, 14, 30, 90, 365]) {
      const de = inicioDaJanela(n, "2026-09-07");
      const dias = Math.round(
        (Date.parse("2026-09-07T00:00:00Z") - Date.parse(`${de}T00:00:00Z`)) / 86_400_000,
      ) + 1;
      expect(dias).toBe(n);
    }
  });

  /**
   * ⚠️ A régua ANTIGA, para o contraste ficar no teste.
   *
   * `shiftDayKey(hoje, -7)` devolve 31/08 — um dia a mais. Era esse dia que
   * entrava com venda e sem investimento.
   */
  it("a régua antiga (-days) devolvia um dia a mais — o dia órfão do chamado", () => {
    expect(shiftDayKey("2026-09-07", -7)).toBe("2026-08-31");
    expect(inicioDaJanela(7, "2026-09-07")).toBe("2026-09-01");
    expect(shiftDayKey("2026-09-07", -7)).not.toBe(inicioDaJanela(7, "2026-09-07"));
  });

  it("janela de 1 dia é só hoje", () => {
    expect(inicioDaJanela(1, "2026-09-07")).toBe("2026-09-07");
  });

  it("atravessa virada de mês e de ano sem escorregar", () => {
    expect(inicioDaJanela(7, "2026-01-03")).toBe("2025-12-28");
    expect(inicioDaJanela(30, "2026-03-01")).toBe("2026-01-31"); // 2026 não é bissexto
  });

  it("sem `ate`, ancora no dia de negócio corrente", () => {
    expect(inicioDaJanela(1)).toBe(businessToday());
  });
});
