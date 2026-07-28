import { describe, it, expect } from "vitest";
import {
  assertReportScope,
  resolveImpostoPct,
  ReportScopeError,
  SCOPE_VALIDADO,
  type LaunchReportConfig,
} from "../services/launch-report-config";
import { META_TAX_RATE } from "../utils/meta-tax";

function cfg(over: Partial<LaunchReportConfig> = {}): LaunchReportConfig {
  return {
    stageId: "stage-1",
    projectId: "proj-1",
    projectName: "Danilo Gato",
    stageName: "Captação Paga",
    tipo: "pago",
    etapa: "vendas-captacao",
    entidadeCaptura: "vendas",
    dataInicio: null,
    dataFim: null,
    validado: false,
    validadoEm: null,
    validadoPor: null,
    impostoPct: META_TAX_RATE,
    impostoOrigem: "default",
    camposPesquisa: {},
    ...over,
  };
}

describe("assertReportScope — gate do §12.2", () => {
  it("libera a combinação de referência (pago/vendas-captacao) mesmo sem validado", () => {
    expect(() => assertReportScope(cfg())).not.toThrow();
  });

  it("bloqueia gratuito não validado", () => {
    expect(() => assertReportScope(cfg({ tipo: "gratuito", etapa: "leads-captacao" }))).toThrow(
      ReportScopeError,
    );
  });

  it("bloqueia perpétuo não validado", () => {
    expect(() => assertReportScope(cfg({ tipo: "perpetuo" }))).toThrow(ReportScopeError);
  });

  it("bloqueia etapa fora da captação, mesmo sendo pago", () => {
    expect(() => assertReportScope(cfg({ etapa: "vendas-principal" }))).toThrow(ReportScopeError);
    expect(() => assertReportScope(cfg({ etapa: "vendas-downsell" }))).toThrow(ReportScopeError);
    expect(() => assertReportScope(cfg({ etapa: "leads-downsell" }))).toThrow(ReportScopeError);
  });

  it("libera qualquer combinação quando o time marcou validado", () => {
    expect(() =>
      assertReportScope(cfg({ tipo: "gratuito", etapa: "leads-captacao", validado: true })),
    ).not.toThrow();
    expect(() =>
      assertReportScope(cfg({ tipo: "perpetuo", etapa: "vendas-principal", validado: true })),
    ).not.toThrow();
  });

  it("erro carrega código, detalhe com a combinação e ação sugerida", () => {
    try {
      assertReportScope(cfg({ tipo: "gratuito", etapa: "leads-captacao" }));
      throw new Error("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(ReportScopeError);
      const res = (err as ReportScopeError).toResponse();
      expect(res.erro).toBe("COMBINACAO_NAO_VALIDADA");
      expect(res.detalhe).toContain("Danilo Gato");
      expect(res.detalhe).toContain("gratuito");
      expect(res.detalhe).toContain("leads-captacao");
      expect(res.detalhe).toContain(SCOPE_VALIDADO.etapa);
      expect(res.acao.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveImpostoPct — procedência da alíquota", () => {
  it("override do stage vence o do projeto", () => {
    expect(resolveImpostoPct(0.08, 0.1)).toEqual({ valor: 0.08, origem: "stage" });
  });

  it("sem stage, usa o override do projeto", () => {
    expect(resolveImpostoPct(null, 0.1)).toEqual({ valor: 0.1, origem: "project" });
  });

  it("sem nenhum override, cai no META_TAX_RATE", () => {
    expect(resolveImpostoPct(null, null)).toEqual({ valor: META_TAX_RATE, origem: "default" });
  });

  it("aceita numeric do Postgres (string) nos dois níveis", () => {
    expect(resolveImpostoPct("0.1215", null)).toEqual({ valor: 0.1215, origem: "stage" });
    expect(resolveImpostoPct(null, "0.0800")).toEqual({ valor: 0.08, origem: "project" });
  });

  it("zero é override legítimo, não ausência", () => {
    expect(resolveImpostoPct(0, 0.1)).toEqual({ valor: 0, origem: "stage" });
  });

  it("string vazia / lixo não vira override", () => {
    expect(resolveImpostoPct("", null)).toEqual({ valor: META_TAX_RATE, origem: "default" });
    expect(resolveImpostoPct("abc", null)).toEqual({ valor: META_TAX_RATE, origem: "default" });
    expect(resolveImpostoPct(undefined, undefined)).toEqual({
      valor: META_TAX_RATE,
      origem: "default",
    });
  });
});
