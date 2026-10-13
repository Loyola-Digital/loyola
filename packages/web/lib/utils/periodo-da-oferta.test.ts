import { describe, expect, it } from "vitest";
import { periodoCurto } from "./periodo-da-oferta";

describe("periodoCurto", () => {
  it("mostra as duas pontas do período de uma oferta", () => {
    // Lote Promocional, medido na conta DG & CPDF.
    expect(periodoCurto("2026-09-29", "2026-10-10")).toBe("29/09 → 10/10");
  });

  it("não repete o dia quando a oferta vendeu num só", () => {
    expect(periodoCurto("2026-10-06", "2026-10-06")).toBe("06/10");
  });

  it("mostra o ano quando o período atravessa a virada", () => {
    // O perpétuo é o caso: "Supervisão Online" vendeu de set/2025 a out/2026,
    // e sem o ano "24/09 → 10/10" pareceria duas semanas.
    expect(periodoCurto("2025-09-24", "2026-10-10")).toBe("24/09/25 → 10/10/26");
  });

  it("não inventa período quando a oferta não tem venda", () => {
    expect(periodoCurto(null, null)).toBe("");
    expect(periodoCurto(null, "2026-10-10")).toBe("");
  });

  it("não desloca o dia por fuso", () => {
    // `new Date("2026-10-07")` é meia-noite UTC: em UTC-3 vira 06/10. Formatar
    // pela string evita que a lista mostre um dia a menos que o banco.
    expect(periodoCurto("2026-10-07", null)).toBe("07/10");
  });
});
