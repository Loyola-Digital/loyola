// Story 29.45 (AC5) — os seis casos que o AC exige, sobre a função pura.
import { describe, it, expect } from "vitest";
import {
  classifyEntityChartsState,
  httpStatusOf,
} from "@/lib/utils/perpetual-entity-charts-state";

const base = { loading: false, isError: false, status: null, plottedCount: 3 };

describe("classifyEntityChartsState", () => {
  // AC5.1 — a precedência é o que evita o bloco vermelho piscando durante um
  // refetch. Testada com erro E vazio simultâneos, que é o pior caso.
  it("loading vence isError e plottedCount", () => {
    expect(
      classifyEntityChartsState({ loading: true, isError: true, status: 500, plottedCount: 0 }),
    ).toEqual({ kind: "loading" });
  });

  // AC5.2
  it("404 vira erro-versao", () => {
    expect(
      classifyEntityChartsState({ ...base, isError: true, status: 404 }),
    ).toEqual({ kind: "erro-versao" });
  });

  // AC5.3 — o status precisa sobreviver: é o que aparece na tela e o que faz o
  // relato do gestor ser acionável.
  it("500 vira erro preservando o status", () => {
    expect(
      classifyEntityChartsState({ ...base, isError: true, status: 500 }),
    ).toEqual({ kind: "erro", status: 500 });
  });

  // AC5.4 — erro sem status (falha de rede) não pode ser confundido com 404.
  it("erro sem status vira erro com status null, nunca erro-versao", () => {
    expect(
      classifyEntityChartsState({ ...base, isError: true, status: undefined }),
    ).toEqual({ kind: "erro", status: null });
  });

  // AC5.5
  it("sem erro e sem série vira vazio", () => {
    expect(classifyEntityChartsState({ ...base, plottedCount: 0 })).toEqual({ kind: "vazio" });
  });

  // AC5.6 — regressão da 29.42: o caminho feliz continua sendo o caminho feliz.
  it("sem erro e com série vira ok", () => {
    expect(classifyEntityChartsState({ ...base, plottedCount: 1 })).toEqual({ kind: "ok" });
  });

  // Erro vence vazio: uma requisição que falhou não sabe o que o período tem.
  it("erro com plottedCount zero continua sendo erro, não vazio", () => {
    expect(
      classifyEntityChartsState({ ...base, isError: true, status: 503, plottedCount: 0 }),
    ).toEqual({ kind: "erro", status: 503 });
  });
});

describe("httpStatusOf", () => {
  it("lê o status que o api-client anexa ao Error", () => {
    const e = Object.assign(new Error("API error: 404"), { status: 404 });
    expect(httpStatusOf(e)).toBe(404);
  });

  it("devolve null para erro sem status, null e undefined", () => {
    expect(httpStatusOf(new Error("network"))).toBeNull();
    expect(httpStatusOf(null)).toBeNull();
    expect(httpStatusOf(undefined)).toBeNull();
  });

  it("ignora status que não é número", () => {
    expect(httpStatusOf({ status: "404" })).toBeNull();
  });
});
