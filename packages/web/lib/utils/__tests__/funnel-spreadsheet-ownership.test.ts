// Story 29.55 (AC3/AC4) — quem a aba genérica pode editar.
import { describe, it, expect } from "vitest";
import {
  ehGerenciadaPorOutraTela,
  ondeSeEdita,
} from "@/lib/utils/funnel-spreadsheet-ownership";

describe("ehGerenciadaPorOutraTela", () => {
  it("protege os dois tipos do perpetuo", () => {
    expect(ehGerenciadaPorOutraTela("perpetual_sales")).toBe(true);
    expect(ehGerenciadaPorOutraTela("perpetual_upsell")).toBe(true);
  });

  /**
   * Reversao: a lista esvazia. A aba volta a oferecer Editar na planilha do
   * perpetuo, e salvar apaga `valorBruto` e `productName`.
   */
  it("nao toca nos tipos que a aba governa — a guarda nao pode fechar a porta certa", () => {
    for (const t of ["leads", "sales", "custom", "applications"]) {
      expect(ehGerenciadaPorOutraTela(t)).toBe(false);
    }
  });
});

describe("ondeSeEdita", () => {
  it("diz o caminho, nao so que nao pode", () => {
    expect(ondeSeEdita("perpetual_sales")).toContain("dashboard do perpétuo");
    expect(ondeSeEdita("perpetual_upsell")).toContain("Ascensão");
  });

  it("planilha comum nao ganha aviso nenhum — a linha fica limpa", () => {
    expect(ondeSeEdita("sales")).toBeNull();
    expect(ondeSeEdita("leads")).toBeNull();
  });
});
