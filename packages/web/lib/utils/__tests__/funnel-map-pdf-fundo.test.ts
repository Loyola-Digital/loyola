import { describe, expect, it } from "vitest";
import { corOpaca } from "../funnel-map-pdf";

describe("corOpaca", () => {
  it("recusa o transparente que o navegador devolve para quem não pinta fundo", () => {
    // O bug: a área do mapa devolvia exatamente isto, que é string não vazia e
    // passava como cor. O PNG saía sem fundo e o texto branco sumia no papel.
    expect(corOpaca("rgba(0, 0, 0, 0)")).toBe(false);
    expect(corOpaca("transparent")).toBe(false);
  });

  it("recusa vazio e nulo", () => {
    expect(corOpaca("")).toBe(false);
    expect(corOpaca(null)).toBe(false);
    expect(corOpaca(undefined)).toBe(false);
  });

  it("recusa semitransparente — o card é 60% e não segura contraste sozinho", () => {
    expect(corOpaca("rgba(24, 24, 27, 0.6)")).toBe(false);
    expect(corOpaca("rgb(24 24 27 / 60%)")).toBe(false);
  });

  it("aceita rgb sem alfa, que é opaco", () => {
    expect(corOpaca("rgb(9, 9, 11)")).toBe(true);
  });

  it("aceita alfa 1, nas duas sintaxes", () => {
    expect(corOpaca("rgba(250, 249, 245, 1)")).toBe(true);
    expect(corOpaca("rgb(250 249 245 / 100%)")).toBe(true);
  });

  it("aceita hex e nome de cor", () => {
    expect(corOpaca("#ffffff")).toBe(true);
    expect(corOpaca("white")).toBe(true);
  });
});
