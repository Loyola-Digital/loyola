import { describe, it, expect } from "vitest";
import {
  ehCaptacaoPaga,
  temDashboardDeVendas,
  ehEtapaDeCaptacao,
} from "../utils/stage-types.js";

/**
 * Story 19.14.
 *
 * O caso que estes testes existem para travar não é `paid` — é `event_capture`.
 * O tipo nasceu em `e3b8ea9d` prometendo se comportar como a Captação Paga, e
 * o frontend passou dois dias com metade do dashboard apagado porque comparava
 * `stageType === "paid"` literal em 28 pontos. O helper é a resposta; sem teste
 * ele volta a ser uma string solta que alguém reescreve à mão no próximo tipo.
 *
 * Importa via `utils/stage-types.js` de propósito: é o reexport que os 5 pontos
 * da API usam. Se a ponte para o `shared` quebrar, isto falha aqui.
 */
describe("stage-types — agrupamento de tipos de etapa", () => {
  describe("ehCaptacaoPaga", () => {
    it("aceita paid", () => {
      expect(ehCaptacaoPaga("paid")).toBe(true);
    });

    it("aceita event_capture — a razão de o helper existir", () => {
      expect(ehCaptacaoPaga("event_capture")).toBe(true);
    });

    it("recusa free e sales", () => {
      expect(ehCaptacaoPaga("free")).toBe(false);
      expect(ehCaptacaoPaga("sales")).toBe(false);
    });

    it("recusa os demais tipos sem tratá-los como paga", () => {
      for (const t of ["cpl", "event", "debriefing", "comercial", "lyrio"]) {
        expect(ehCaptacaoPaga(t)).toBe(false);
      }
    });

    it("trata ausência de tipo como false, não como erro", () => {
      expect(ehCaptacaoPaga(null)).toBe(false);
      expect(ehCaptacaoPaga(undefined)).toBe(false);
      expect(ehCaptacaoPaga("")).toBe(false);
    });
  });

  describe("temDashboardDeVendas", () => {
    it("cobre paid, event_capture e sales", () => {
      expect(temDashboardDeVendas("paid")).toBe(true);
      expect(temDashboardDeVendas("event_capture")).toBe(true);
      expect(temDashboardDeVendas("sales")).toBe(true);
    });

    it("não cobre free — etapa gratuita não tem faturamento", () => {
      expect(temDashboardDeVendas("free")).toBe(false);
      expect(temDashboardDeVendas(null)).toBe(false);
    });
  });

  describe("ehEtapaDeCaptacao", () => {
    it("cobre paid, event_capture e free", () => {
      expect(ehEtapaDeCaptacao("paid")).toBe(true);
      expect(ehEtapaDeCaptacao("event_capture")).toBe(true);
      expect(ehEtapaDeCaptacao("free")).toBe(true);
    });

    it("não cobre sales — etapa de venda não capta lead", () => {
      expect(ehEtapaDeCaptacao("sales")).toBe(false);
      expect(ehEtapaDeCaptacao(undefined)).toBe(false);
    });
  });
});
