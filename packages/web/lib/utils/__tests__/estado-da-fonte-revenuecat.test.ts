import { describe, expect, it } from "vitest";
import {
  avisoDoErroDaFonte,
  causaDoErro,
  estadoDaFonte,
  memorialDoErroDaFonte,
  tentarDeNovoNoRevenuecat,
} from "../estado-da-fonte-revenuecat";

/**
 * Story 42.14 (PO-D4 (7)) — o estado de uma fonte do RevenueCat. O erro tem a
 * causa (limite, permissão, outro) e nunca vira ausência nem zero.
 */
const erro = (status: number, message: string, body?: Record<string, unknown>) =>
  Object.assign(new Error(message), { status, body: body ?? { error: message } });

describe("estadoDaFonte", () => {
  it("429 → erro com a causa `limite` (não 'permissão', como a rota antiga dizia)", () => {
    const e = estadoDaFonte({ isLoading: false, error: erro(429, "Limite de consultas do RevenueCat", { error: "Limite de consultas do RevenueCat", details: "RevenueCat 429: Too Many Requests", causa: "limite" }), data: undefined });
    expect(e).toEqual({ tipo: "erro", causa: "limite", mensagem: "Limite de consultas do RevenueCat: RevenueCat 429: Too Many Requests" });
  });

  it("5xx → erro (causa `outro`) com a mensagem da API", () => {
    expect(estadoDaFonte({ isLoading: false, error: erro(502, "Falhou"), data: undefined })).toEqual({ tipo: "erro", causa: "outro", mensagem: "Falhou" });
  });

  it("404 DA ROTA (API anterior) → oculto; 404 de domínio → erro", () => {
    expect(estadoDaFonte({ isLoading: false, error: erro(404, "Not Found"), data: undefined })).toEqual({ tipo: "oculto" });
    expect(estadoDaFonte({ isLoading: false, error: erro(404, "Etapa não encontrada"), data: undefined })).toMatchObject({ tipo: "erro" });
  });

  it("a falha vence o dado em cache (a falha é testada antes da ausência)", () => {
    expect(estadoDaFonte({ isLoading: false, error: erro(500, "x"), data: [1] }).tipo).toBe("erro");
  });

  it("carregando e pronto; zero real é pronto, não ausência", () => {
    expect(estadoDaFonte({ isLoading: true, error: null, data: undefined })).toEqual({ tipo: "carregando" });
    expect(estadoDaFonte({ isLoading: false, error: null, data: 0 })).toEqual({ tipo: "pronto", dados: 0 });
  });
});

describe("causaDoErro — corpo, status e a mensagem do rcFetch", () => {
  it("a causa declarada no corpo vence", () => {
    expect(causaDoErro(erro(502, "x", { causa: "permissao" }))).toBe("permissao");
  });
  it("sem o corpo novo: status HTTP, depois o status do RevenueCat na mensagem", () => {
    expect(causaDoErro(erro(429, "x"))).toBe("limite");
    expect(causaDoErro(erro(403, "x"))).toBe("permissao");
    expect(causaDoErro(erro(502, "Erro", { error: "Erro", details: "RevenueCat 429: rate limited" }))).toBe("limite");
    expect(causaDoErro(erro(502, "Erro", { error: "Erro", details: "RevenueCat 403: forbidden" }))).toBe("permissao");
    expect(causaDoErro(erro(502, "RevenueCat 4290: não é 429"))).toBe("outro");
  });
});

describe("tentarDeNovoNoRevenuecat (PO-D4 (6))", () => {
  it("não insiste em 429 nem em 404; o 5xx segue o retry padrão (até 2)", () => {
    expect(tentarDeNovoNoRevenuecat(0, erro(429, "x"))).toBe(false);
    expect(tentarDeNovoNoRevenuecat(0, erro(404, "Not Found"))).toBe(false);
    expect(tentarDeNovoNoRevenuecat(0, erro(502, "x", { causa: "limite" }))).toBe(false);
    expect(tentarDeNovoNoRevenuecat(0, erro(502, "x"))).toBe(true);
    expect(tentarDeNovoNoRevenuecat(1, erro(502, "x"))).toBe(true);
    expect(tentarDeNovoNoRevenuecat(2, erro(502, "x"))).toBe(false);
  });
});

describe("memorial e aviso do erro (PO-D4 (3))", () => {
  const limite = { tipo: "erro" as const, causa: "limite" as const, mensagem: "RevenueCat 429: Too Many Requests" };

  it("o memorial diz a causa, a orientação e quem mais fica '—'", () => {
    const m = memorialDoErroDaFonte(limite, { fonte: "RevenueCat · metrics/revenue", periodo: "últimos 90 dias", dependentes: "o ROAS e a Margem" })!;
    expect(m.result).toBe("—");
    expect(m.values[0]).toEqual({ label: "Erro", value: "RevenueCat 429: Too Many Requests", source: "RevenueCat · metrics/revenue" });
    expect(m.note).toContain("25 consultas por minuto");
    expect(m.note).toContain("tente de novo em 1 minuto");
    expect(m.note).toContain("o ROAS e a Margem também fica");
    expect(m.period).toBe("últimos 90 dias");
  });

  it("estado que não é erro não tem memorial de erro nem aviso", () => {
    expect(memorialDoErroDaFonte({ tipo: "carregando" }, { fonte: "x", periodo: "y" })).toBeNull();
    expect(memorialDoErroDaFonte({ tipo: "pronto", dados: 1 }, { fonte: "x", periodo: "y" })).toBeNull();
    expect(avisoDoErroDaFonte({ tipo: "oculto" }, "x")).toBeNull();
  });

  it("o aviso do bloco traz a mensagem e a orientação", () => {
    expect(avisoDoErroDaFonte({ tipo: "erro", causa: "permissao", mensagem: "RevenueCat 403" }, "a receita")).toBe(
      "Não foi possível carregar a receita: RevenueCat 403. A Secret API Key do RevenueCat não tem a permissão de leitura de métricas (charts_metrics:overview:read). Verifique no painel do RevenueCat.",
    );
  });
});
