import { describe, expect, it } from "vitest";
import { canalComTemperatura, classifyCanal, classifyTemperatura } from "../utils/lead-origin.js";

/**
 * Story 48.11 — o corte canal × temperatura que alimenta as quatro fontes
 * pagas do simulador do Painel de Planejamento (`meta_quente`, `meta_frio`,
 * `google_quente`, `google_frio`).
 *
 * Sem ele, `buyers-origin` só sabe dizer "Meta Ads" agregado, e a tela
 * repetiria o mesmo número nos dois campos como se fossem duas medições.
 */
describe("canalComTemperatura", () => {
  it("separa quente de frio dentro da MESMA plataforma", () => {
    expect(canalComTemperatura("meta", "cpc", "hot|videos|lp1")).toBe("Meta Ads · quente");
    expect(canalComTemperatura("meta", "cpc", "cold|videos|lp1")).toBe("Meta Ads · frio");
    expect(canalComTemperatura("google", "cpc", "quente")).toBe("Google Ads · quente");
  });

  it("lead pago sem termo estruturado vira `indefinido` — aparece, não some", () => {
    expect(canalComTemperatura("meta", "cpc", null)).toBe("Meta Ads · indefinido");
    expect(canalComTemperatura("meta", "cpc", "videos|lp1")).toBe("Meta Ads · indefinido");
  });

  it("os dois pedaços são os mesmos das outras telas — canal e temperatura", () => {
    // Se `classifyCanal` ou `classifyTemperatura` mudarem, esta composição muda
    // junto: é o que impede a fonte paga do simulador de divergir do dashboard.
    expect(canalComTemperatura("meta", "cpc", "hot")).toBe(
      `${classifyCanal("meta", "cpc")} · ${classifyTemperatura("hot")}`,
    );
  });

  it("o separador é o mesmo que a tela quebra para achar a fonte", () => {
    const [canal, temperatura] = canalComTemperatura("meta", "cpc", "hot").split(" · ");
    expect(canal).toBe("Meta Ads");
    expect(temperatura).toBe("quente");
  });
});
