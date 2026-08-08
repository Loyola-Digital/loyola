import { describe, it, expect } from "vitest";
import {
  requiredRateForTargetCac,
  worstChainGap,
  decomposeCac,
  type ChainRate,
} from "../cac-protocol";

/** Cadeia de 3 elos que encadeiam, para o cálculo ficar conferível na mão. */
const cadeia = (valores: Array<number | null>): ChainRate[] => {
  const defs = [
    { key: "a", label: "A", numerator: "b1", denominator: "b0" },
    { key: "b", label: "B", numerator: "b2", denominator: "b1" },
    { key: "c", label: "C", numerator: "b3", denominator: "b2" },
  ];
  return defs.map((d, i) => ({
    ...d,
    value: valores[i],
    status: valores[i] == null ? ("MISSING" as const) : ("MEASURED" as const),
    source: "teste",
    windowStart: "2026-08-01",
    windowEnd: "2026-08-07",
    measuredAt: null,
  }));
};

const CPC = { kind: "CPC" as const, value: 2 };

describe("requiredRateForTargetCac", () => {
  it("substituir a etapa pela taxa necessaria produz EXATAMENTE o CAC alvo", () => {
    // Este e o teste que importa: a inversao tem que ser o inverso do calculo.
    const rates = cadeia([0.5, 0.4, 0.1]);
    const alvo = 150;
    const r = requiredRateForTargetCac(CPC, rates, alvo, "b");
    expect(r.required).not.toBeNull();

    const comNecessaria = rates.map((x) =>
      x.key === "b" ? { ...x, value: r.required } : x,
    );
    expect(decomposeCac(CPC, comNecessaria).cac).toBeCloseTo(alvo, 8);
  });

  it("bate com a formula calculada a mao", () => {
    // custo 2, alvo 100, demais = 0,5 x 0,1 = 0,05  ->  2 / (100 x 0,05) = 0,4
    const r = requiredRateForTargetCac(CPC, cadeia([0.5, 0.4, 0.1]), 100, "b");
    expect(r.required).toBeCloseTo(0.4, 10);
  });

  it("gap sai em pontos percentuais, com sinal", () => {
    // atual 0,4 e necessaria 0,4 -> gap 0. Com atual 0,3, gap = -10 pp.
    const r = requiredRateForTargetCac(CPC, cadeia([0.5, 0.3, 0.1]), 100, "b");
    // demais continuam 0,5 x 0,1 -> necessaria 0,4; atual 0,3
    expect(r.required).toBeCloseTo(0.4, 10);
    expect(r.gapPp).toBeCloseTo(-10, 8);
  });

  it("taxa necessaria acima de 100% NAO e truncada — impossivel nao vira 'quase la'", () => {
    // Alvo agressivo: nem 100% nesta etapa fecha a conta.
    const r = requiredRateForTargetCac(CPC, cadeia([0.5, 0.4, 0.01]), 100, "b");
    expect(r.required).toBeGreaterThan(1);
    expect(r.attainable).toBe(false);
    expect(r.required).not.toBe(1);
  });

  it("qualquer OUTRA etapa ausente devolve null com o motivo — nunca assume 100%", () => {
    const r = requiredRateForTargetCac(CPC, cadeia([0.5, 0.4, null]), 100, "b");
    expect(r.required).toBeNull();
    expect(r.reason).toMatch(/sem medição/);
    expect(r.reason).toContain("C");
  });

  it("a propria etapa ausente NAO impede o calculo da necessaria", () => {
    // Saber quanto ela precisaria ser e util justamente quando ela nao foi medida.
    const r = requiredRateForTargetCac(CPC, cadeia([0.5, null, 0.1]), 100, "b");
    expect(r.required).toBeCloseTo(0.4, 10);
    expect(r.gapPp).toBeNull(); // sem atual, nao ha gap
  });

  it("CAC alvo ausente devolve null com o motivo", () => {
    const r = requiredRateForTargetCac(CPC, cadeia([0.5, 0.4, 0.1]), null, "b");
    expect(r.required).toBeNull();
    expect(r.reason).toMatch(/CAC alvo/);
  });

  it("custo de entrada ausente devolve null com o motivo", () => {
    const r = requiredRateForTargetCac(null, cadeia([0.5, 0.4, 0.1]), 100, "b");
    expect(r.required).toBeNull();
    expect(r.reason).toMatch(/custo da entrada/);
  });

  it("etapa fora da arquitetura devolve null", () => {
    const r = requiredRateForTargetCac(CPC, cadeia([0.5, 0.4, 0.1]), 100, "inexistente");
    expect(r.required).toBeNull();
    expect(r.reason).toMatch(/fora da arquitetura/);
  });

  it("CPM entra dividido por 1000 (U-04)", () => {
    const porCpm = requiredRateForTargetCac(
      { kind: "CPM", value: 2000 }, cadeia([0.5, 0.4, 0.1]), 100, "b");
    const porCpc = requiredRateForTargetCac(
      { kind: "CPC", value: 2 }, cadeia([0.5, 0.4, 0.1]), 100, "b");
    expect(porCpm.required).toBeCloseTo(porCpc.required as number, 10);
  });
});

describe("worstChainGap", () => {
  it("alvo FOLGADO (acima do CAC atual) nao tem gap negativo", () => {
    // CAC atual = 2 / (0,5 x 0,4 x 0,1) = 100. Alvo 300 e mais frouxo que o
    // realizado — toda etapa ja comporta, e "nenhuma" e a resposta certa.
    const rates = cadeia([0.5, 0.4, 0.1]);
    const rs = rates.map((r) => requiredRateForTargetCac(CPC, rates, 300, r.key));
    expect(worstChainGap(rs)).toBeNull();
  });

  it("alvo APERTADO aponta a etapa mais distante da meta", () => {
    const rates = cadeia([0.5, 0.4, 0.1]);
    const rs = rates.map((r) => requiredRateForTargetCac(CPC, rates, 50, r.key));
    const pior = worstChainGap(rs);
    expect(pior).not.toBeNull();
    expect(pior!.gapPp).toBeLessThan(0);
    // E o pior de todos, nao apenas um qualquer que esteja abaixo.
    const gaps = rs.map((r) => r.gapPp).filter((g): g is number => g != null);
    expect(pior!.gapPp).toBe(Math.min(...gaps));
  });

  it("nenhuma etapa abaixo da meta devolve null", () => {
    const rates = cadeia([0.9, 0.9, 0.9]);
    // Alvo folgadissimo: toda etapa ja comporta.
    const rs = rates.map((r) => requiredRateForTargetCac(CPC, rates, 100000, r.key));
    expect(worstChainGap(rs)).toBeNull();
  });
});
