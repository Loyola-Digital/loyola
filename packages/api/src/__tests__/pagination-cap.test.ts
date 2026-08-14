import { describe, it, expect } from "vitest";
import { avaliarCap, mensagemTruncamento } from "../services/pagination-cap.js";

describe("avaliarCap", () => {
  it("continua enquanto há próxima página e o teto não foi atingido", () => {
    expect(avaliarCap("https://graph.facebook.com/next", 100, 500)).toEqual({
      continuar: true,
      truncado: false,
    });
  });

  it("para SEM truncamento quando os dados acabam", () => {
    // Fim natural: a Meta não ofereceu próxima página. Não é truncamento, e não
    // pode gerar aviso — senão o log vira ruído em toda chamada normal.
    expect(avaliarCap(undefined, 100, 500)).toEqual({ continuar: false, truncado: false });
    expect(avaliarCap(null, 4999, 5000)).toEqual({ continuar: false, truncado: false });
  });

  it("para COM truncamento quando havia mais e o teto cortou", () => {
    expect(avaliarCap("https://graph.facebook.com/next", 500, 500)).toEqual({
      continuar: false,
      truncado: true,
    });
  });

  it("trata o limite exato como atingido", () => {
    // 499 continua, 500 corta. Sem off-by-one silencioso.
    expect(avaliarCap("next", 499, 500).continuar).toBe(true);
    expect(avaliarCap("next", 500, 500).continuar).toBe(false);
    expect(avaliarCap("next", 501, 500).truncado).toBe(true);
  });

  it("distingue os dois motivos de parar", () => {
    // É a distinção que a story inteira defende: parar porque acabou e parar
    // porque cortou produzem a MESMA resposta hoje, e significam coisas opostas.
    const acabou = avaliarCap(undefined, 300, 500);
    const cortou = avaliarCap("next", 500, 500);
    expect(acabou.continuar).toBe(cortou.continuar); // ambos param
    expect(acabou.truncado).not.toBe(cortou.truncado); // por motivos diferentes
  });
});

describe("mensagemTruncamento", () => {
  it("nomeia origem, teto e contexto", () => {
    const m = mensagemTruncamento("fetchAllAdSetInsightsImpl", 500, "conta=123, 30d");
    expect(m).toContain("fetchAllAdSetInsightsImpl");
    expect(m).toContain("500");
    expect(m).toContain("conta=123, 30d");
    expect(m).toContain("INCOMPLETA");
  });

  it("mantém prefixo comum para busca no log", () => {
    // Quem procurar "cap de" acha qualquer ponto de truncamento do arquivo.
    expect(mensagemTruncamento("f", 1, "c")).toMatch(/^\[meta-ads\] cap de /);
  });
});
