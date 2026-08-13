import { describe, it, expect } from "vitest";
import {
  deveIncluirVendasManuais,
  subtypeDasVendasManuais,
} from "../routes/stage-sales-data";

/**
 * Regressão do dg-pg04: a seção TMB exibia "3 vendas / R$ 6.375" quando havia
 * 1 TMB de verdade — as 2 vendas manuais do produto principal estavam sendo
 * somadas em TODO subtype pedido.
 */
describe("vendas manuais — a qual subtype pertencem", () => {
  describe("etapa de Vendas", () => {
    it("a manual é do produto principal", () => {
      expect(subtypeDasVendasManuais("sales")).toBe("main_product");
    });

    it("entra em main_product", () => {
      expect(deveIncluirVendasManuais("sales", ["main_product"])).toBe(true);
    });

    it("NÃO entra em tmb — era o bug", () => {
      expect(deveIncluirVendasManuais("sales", ["tmb"])).toBe(false);
    });

    it("NÃO entra em capture", () => {
      expect(deveIncluirVendasManuais("sales", ["capture"])).toBe(false);
    });

    it("entra uma vez só no CSV main_product,tmb", () => {
      // O total combinado do topo não pode mudar por causa da correção.
      expect(deveIncluirVendasManuais("sales", ["main_product", "tmb"])).toBe(true);
    });
  });

  describe("etapa Paga", () => {
    it("a manual é ingresso — pertence a capture", () => {
      expect(subtypeDasVendasManuais("paid")).toBe("capture");
      expect(deveIncluirVendasManuais("paid", ["capture"])).toBe(true);
    });

    it("não vaza pro produto principal da Paga", () => {
      expect(deveIncluirVendasManuais("paid", ["main_product"])).toBe(false);
    });
  });
});
