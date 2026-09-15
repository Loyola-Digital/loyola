import { describe, expect, it } from "vitest";
import { leadsDaLp } from "../leads-da-lp";

describe("leadsDaLp", () => {
  it("LP com formulário continua na planilha, mesmo com pixel", () => {
    // A LPA: nada muda para ela.
    expect(leadsDaLp({ total: 96, hot: 82, cold: 14 }, 120, "todos")).toEqual({
      leads: 96,
      fonte: "planilha",
    });
  });

  it("LP sem nenhum lead na planilha usa o pixel", () => {
    // A LPB: sem formulário, a planilha fica zerada.
    expect(leadsDaLp({ total: 0, hot: 0, cold: 0 }, 20, "todos")).toEqual({
      leads: 20,
      fonte: "pixel",
    });
  });

  it("LP que nem aparece na planilha também usa o pixel", () => {
    expect(leadsDaLp(undefined, 20, "todos")).toEqual({ leads: 20, fonte: "pixel" });
  });

  it("o filtro Hot/Cold não troca a fonte", () => {
    // Planilha só com cold: no filtro Hot a linha segue na planilha (0), não
    // pula para o pixel.
    expect(leadsDaLp({ total: 5, hot: 0, cold: 5 }, 30, "hot")).toEqual({
      leads: 0,
      fonte: "planilha",
    });
  });

  it("aplica o filtro na planilha", () => {
    expect(leadsDaLp({ total: 96, hot: 82, cold: 14 }, 0, "cold").leads).toBe(14);
  });

  it("sem planilha e sem pixel: zero, marcado como pixel", () => {
    expect(leadsDaLp(undefined, 0, "todos")).toEqual({ leads: 0, fonte: "pixel" });
  });
});
