import { describe, expect, it } from "vitest";
import {
  ordemDeBusca,
  precisaBuscarInsights,
} from "../services/instagram-post-metrics.js";

const agora = new Date("2026-09-16T12:00:00Z");
const horasAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000);
const diasAtras = (d: number) => new Date(agora.getTime() - d * 86_400_000);

describe("precisaBuscarInsights", () => {
  it("post nunca buscado sempre vale a chamada", () => {
    expect(precisaBuscarInsights(diasAtras(400), null, agora)).toBe(true);
  });

  it("post de hoje: vale rebuscar a cada 2 horas", () => {
    expect(precisaBuscarInsights(horasAtras(5), horasAtras(1), agora)).toBe(false);
    expect(precisaBuscarInsights(horasAtras(5), horasAtras(3), agora)).toBe(true);
  });

  it("post da semana: 12 horas", () => {
    expect(precisaBuscarInsights(diasAtras(4), horasAtras(6), agora)).toBe(false);
    expect(precisaBuscarInsights(diasAtras(4), horasAtras(13), agora)).toBe(true);
  });

  it("post do mês: 3 dias", () => {
    expect(precisaBuscarInsights(diasAtras(20), diasAtras(1), agora)).toBe(false);
    expect(precisaBuscarInsights(diasAtras(20), diasAtras(4), agora)).toBe(true);
  });

  it("post com mais de 30 dias nunca é rebuscado", () => {
    // O número já congelou; perguntar de novo só queima cota da Meta.
    expect(precisaBuscarInsights(diasAtras(90), diasAtras(60), agora)).toBe(false);
  });
});

describe("ordemDeBusca", () => {
  it("nunca buscado vem primeiro; depois, o mais novo", () => {
    const r = ordemDeBusca([
      { id: "velho-com-dado", postadoEm: diasAtras(10), insightsEm: diasAtras(9) },
      { id: "novo-com-dado", postadoEm: diasAtras(1), insightsEm: diasAtras(1) },
      { id: "sem-dado-velho", postadoEm: diasAtras(20), insightsEm: null },
      { id: "sem-dado-novo", postadoEm: diasAtras(2), insightsEm: null },
    ]);
    expect(r.map((x) => x.id)).toEqual([
      "sem-dado-novo",
      "sem-dado-velho",
      "novo-com-dado",
      "velho-com-dado",
    ]);
  });
});
