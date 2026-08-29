/**
 * Os presets.
 *
 * O ponto destes testes é o AC5 da story: preset que referencie métrica
 * inexistente quebra o BUILD, não a tela de quem abriu o dashboard.
 */

import { describe, expect, it } from "vitest";
import { PRESETS, comPeriodo, preset, presetsParaApi } from "../services/bi/presets.js";
import { PADRAO_POR_TIPO, TIPOS_DE_WIDGET } from "../services/bi/dashboard.js";
import { ErroDeQuery, planejar, validarSpec } from "../services/bi/query.js";
import { campo } from "../services/bi/catalogo.js";

const PERIODO = { start: "2026-08-01", end: "2026-08-26" };

describe("T1 · todo preset é um querySpec válido", () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))("%s", (_id, p) => {
    const spec = comPeriodo(p.spec, PERIODO);
    expect(() => validarSpec(spec)).not.toThrow();
  });

  it("o período injetado é o filtro de data da entidade certa", () => {
    for (const p of PRESETS) {
      const spec = comPeriodo(p.spec, PERIODO);
      const chave = `${p.spec.entity}.date`;
      expect(spec.filters[chave]).toEqual({
        operator: "$between",
        value: [PERIODO.start, PERIODO.end],
      });
    }
  });

  it("o preset NÃO guarda período — senão 'últimos 30 dias' congelaria no dia em que foi salvo", () => {
    for (const p of PRESETS) {
      expect(p.spec.filters?.[`${p.spec.entity}.date`]).toBeUndefined();
    }
  });
});

describe("T2 · toda métrica e dimensão existe no catálogo", () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))("%s", (_id, p) => {
    for (const k of p.spec.metrics) {
      const c = campo(k);
      expect(c, `${p.id} usa métrica inexistente: ${k}`).not.toBeNull();
      expect(c!.role).toBe("metric");
      expect(c!.entity).toBe(p.spec.entity);
    }
    for (const k of p.spec.dimensions) {
      const c = campo(k);
      expect(c, `${p.id} usa dimensão inexistente: ${k}`).not.toBeNull();
      expect(c!.role).toBe("dimension");
      expect(c!.entity).toBe(p.spec.entity);
    }
  });

  it("a ordenação sempre aponta para algo que está no resultado", () => {
    for (const p of PRESETS) {
      const noResultado = new Set([...p.spec.metrics, ...p.spec.dimensions]);
      for (const o of p.spec.order_by) {
        expect(noResultado.has(o.field), `${p.id} ordena por ${o.field}, fora do resultado`).toBe(
          true,
        );
      }
    }
  });
});

describe("o preset ou funciona, ou diz por que não", () => {
  it("todo preset sem `bloqueado` é executável de verdade", () => {
    // A validação contra o catálogo não basta: `cpl_geral` existe no catálogo e
    // ainda assim não tem tradução no executor. Este teste é o que impede um
    // preset assim de entrar na galeria como se funcionasse.
    for (const p of PRESETS.filter((x) => !x.bloqueado)) {
      expect(() => planejar(comPeriodo(p.spec, PERIODO)), `${p.id} não é executável`).not.toThrow();
    }
  });

  it("todo preset bloqueado realmente falha — o aviso não é decorativo", () => {
    for (const p of PRESETS.filter((x) => x.bloqueado)) {
      expect(() => planejar(comPeriodo(p.spec, PERIODO)), `${p.id} já funciona`).toThrow(
        ErroDeQuery,
      );
    }
  });

  it("o motivo do bloqueio é uma frase, não um código", () => {
    for (const p of PRESETS.filter((x) => x.bloqueado)) {
      expect(p.bloqueado!.length).toBeGreaterThan(30);
    }
  });
});

describe("forma do catálogo de presets", () => {
  it("nenhum id repetido", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo tipo é um tipo de widget conhecido", () => {
    for (const p of PRESETS) expect(TIPOS_DE_WIDGET).toContain(p.tipo);
  });

  it("todo preset tem nome e descrição que explicam o número", () => {
    for (const p of PRESETS) {
      expect(p.nome.length).toBeGreaterThan(4);
      expect(p.descricao.length, `${p.id} tem descrição curta demais`).toBeGreaterThan(20);
    }
  });

  it("a galeria recebe rótulos em português, não chaves do banco", () => {
    const api = presetsParaApi();
    const investimento = api.find((p) => p.id === "investimento_periodo")!;
    expect(investimento.metricas).toEqual(["Investimento"]);
    expect(investimento.tamanho).toEqual(PADRAO_POR_TIPO.kpi);
  });

  it("as categorias agrupam o que a pessoa procura junto", () => {
    const categorias = new Set(PRESETS.map((p) => p.categoria));
    expect(categorias.size).toBeGreaterThanOrEqual(3);
    expect(categorias).toContain("Tráfego pago");
    expect(categorias).toContain("Vendas");
  });

  it("buscar por id devolve o preset, e id inventado devolve null", () => {
    expect(preset("investimento_periodo")?.nome).toBe("Investimento no período");
    expect(preset("nao_existe")).toBeNull();
  });
});
