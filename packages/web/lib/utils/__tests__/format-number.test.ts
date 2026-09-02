import { describe, it, expect } from "vitest";
import { fmtInt, fmtCurrency, fmtPercent, fmtEixo } from "../format-number";

/**
 * Story 18.73 — a tabela do AC1, mais as armadilhas que o gate do @qa apontou.
 */
describe("fmtInt — contagem", () => {
  it("o caso do relato: 1.1K vira o número inteiro", () => {
    // "Venda Ingressos Únicos 1.1K" e "Ingresso+OrderBump: 1.3K".
    expect(fmtInt(1147)).toBe("1.147");
    expect(fmtInt(1312)).toBe("1.312");
  });

  it("1.147 e 1.199 deixam de ser o mesmo número na tela", () => {
    // Era exatamente isso que a abreviação apagava: os dois viravam "1.1K".
    expect(fmtInt(1147)).not.toBe(fmtInt(1199));
  });

  it("nunca abrevia, em nenhuma ordem de grandeza", () => {
    for (const v of [1_000, 9_999, 1_000_000, 123_456_789]) {
      expect(fmtInt(v)).not.toMatch(/[KM]/);
    }
    expect(fmtInt(1_234_567)).toBe("1.234.567");
  });

  it("contagem não tem fração — arredondar aqui é correto", () => {
    expect(fmtInt(1147.6)).toBe("1.148");
    expect(fmtInt(1147.2)).toBe("1.147");
  });

  it("ausência é travessão, e zero é zero", () => {
    expect(fmtInt(null)).toBe("—");
    expect(fmtInt(undefined)).toBe("—");
    expect(fmtInt(0)).toBe("0");
  });
});

describe("fmtCurrency — dinheiro com centavos", () => {
  it("mostra os centavos que a abreviação comia", () => {
    expect(fmtCurrency(47382.15)).toContain("47.382,15");
    expect(fmtCurrency(1234.5)).toContain("1.234,50");
    expect(fmtCurrency(1234567.891)).toContain("1.234.567,89");
  });

  it("pt-BR de verdade: ponto no milhar, vírgula no decimal", () => {
    const s = fmtCurrency(1234567.89);
    expect(s).toContain("1.234.567,89");
    expect(s).not.toContain("1,234,567");
  });

  it("nunca abrevia", () => {
    expect(fmtCurrency(47382.15)).not.toMatch(/[KM]/);
    expect(fmtCurrency(2_500_000)).not.toMatch(/[KM]/);
  });

  it("valor pequeno e negativo mantêm as duas casas", () => {
    expect(fmtCurrency(0.5)).toContain("0,50");
    expect(fmtCurrency(-1234.5)).toContain("1.234,50");
  });

  it("ausência é travessão", () => {
    expect(fmtCurrency(null)).toBe("—");
    expect(fmtCurrency(undefined)).toBe("—");
  });

  it("zero é um resultado, não ausência de dado", () => {
    // O formatador antigo devolvia "—" para zero (`val === 0`), e um criativo
    // que gastou sem faturar ficava igual a um sem dado nenhum.
    expect(fmtCurrency(0)).not.toBe("—");
    expect(fmtCurrency(0)).toContain("0,00");
  });
});

describe("fmtPercent — duas casas sempre", () => {
  it("deixa de arredondar para inteiro", () => {
    expect(fmtPercent(45.671)).toBe("45,67%");
    expect(fmtPercent(1.34)).toBe("1,34%");
    expect(fmtPercent(88.09)).toBe("88,09%");
  });

  it("duas casas mesmo quando não há fração", () => {
    expect(fmtPercent(46)).toBe("46,00%");
    expect(fmtPercent(0)).toBe("0,00%");
  });

  it("percentuais próximos param de colidir", () => {
    // Com toFixed(0) os três viravam "46%".
    expect(new Set([fmtPercent(45.6), fmtPercent(46.0), fmtPercent(46.4)]).size).toBe(3);
  });

  it("ausência é travessão", () => {
    expect(fmtPercent(null)).toBe("—");
    expect(fmtPercent(undefined)).toBe("—");
  });
});

describe("valores que não são número não podem virar 'NaN' na tela", () => {
  it("NaN e Infinity caem no travessão", () => {
    for (const f of [fmtInt, fmtCurrency, fmtPercent]) {
      expect(f(NaN)).toBe("—");
      expect(f(Infinity)).toBe("—");
      expect(f(-Infinity)).toBe("—");
    }
  });
});

describe("fmtEixo — a única exceção autorizada (AC6)", () => {
  it("continua abreviando, porque o tick repete o valor", () => {
    expect(fmtEixo(60000, "currency")).toBe("R$60.0K");
    expect(fmtEixo(2_500_000)).toBe("2.5M");
    expect(fmtEixo(450)).toBe("450");
  });

  it("negativo abrevia pelo módulo, não vira '-0.5K' errado", () => {
    expect(fmtEixo(-1500)).toBe("-1.5K");
  });

  it("o conteúdo da tela NÃO usa isto — o eixo abrevia, o resto não", () => {
    expect(fmtEixo(1147)).toMatch(/K/);
    expect(fmtInt(1147)).not.toMatch(/K/);
  });
});
