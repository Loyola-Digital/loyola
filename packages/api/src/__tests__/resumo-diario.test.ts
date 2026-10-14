import { describe, it, expect } from "vitest";
import { ontemSaoPaulo, textoDoResumo, type LinhaDoResumo } from "../services/resumo-diario.js";

/**
 * O resumo fala todo dia — então ele é a parte que mais facilmente vira spam.
 * O que se testa aqui é o que cabe na tela do celular e o dia que ele cobre:
 * um resumo "de hoje" às 8h mostraria zeros e queimaria a confiança na
 * notificação inteira.
 */

const linha = (nome: string, investimento: number, faturamento: number): LinhaDoResumo => ({
  projectId: nome,
  nome,
  investimento,
  faturamento,
  roas: investimento > 0 ? faturamento / investimento : null,
});

describe("textoDoResumo", () => {
  it("o título traz o total e o ROAS geral", () => {
    const t = textoDoResumo([linha("DG", 13946, 19567), linha("BBE", 7338, 10063)]);
    expect(t.titulo).toBe("Ontem: R$ 21,3k → R$ 29,6k (1,39×)");
  });

  it("cada projeto vira uma linha com os dois lados da conta", () => {
    const t = textoDoResumo([linha("DG", 13946, 19567)]);
    expect(t.corpo).toBe("DG: R$ 13,9k → R$ 19,6k (1,40×)");
  });

  it("acima de quatro projetos corta pelos maiores e diz quantos sobraram", () => {
    // O sistema operacional corta o corpo sem avisar: melhor escolher o que cai.
    const t = textoDoResumo([
      linha("A", 100, 100),
      linha("B", 5000, 5000),
      linha("C", 200, 200),
      linha("D", 9000, 9000),
      linha("E", 300, 300),
      linha("F", 400, 400),
    ]);
    const linhas = t.corpo.split("\n");
    expect(linhas[0]).toContain("D:");
    expect(linhas[1]).toContain("B:");
    expect(linhas).toHaveLength(5);
    expect(linhas[4]).toBe("e mais 2 projetos");
  });

  it("um projeto sobrando fala no singular", () => {
    const t = textoDoResumo([
      linha("A", 5, 5),
      linha("B", 4, 4),
      linha("C", 3, 3),
      linha("D", 2, 2),
      linha("E", 1, 1),
    ]);
    expect(t.corpo.split("\n")[4]).toBe("e mais 1 projeto");
  });

  it("projeto sem investimento mostra travessão, não divisão por zero", () => {
    const t = textoDoResumo([linha("Parado", 0, 0)]);
    expect(t.corpo).toBe("Parado: R$ 0 → R$ 0 (—)");
    expect(t.titulo).toBe("Ontem: R$ 0 → R$ 0");
  });

  it("valor abaixo de mil aparece inteiro, não em `k`", () => {
    expect(textoDoResumo([linha("P", 620, 0)]).corpo).toBe("P: R$ 620 → R$ 0 (0,00×)");
  });
});

describe("ontemSaoPaulo", () => {
  it("de madrugada em UTC, ontem ainda é anteontem no calendário de lá", () => {
    // 15/10 01:00 UTC = 14/10 22:00 em SP, então "ontem" é 13/10.
    expect(ontemSaoPaulo(new Date("2026-10-15T01:00:00Z"))).toBe("2026-10-13");
  });

  it("às 8h de SP, ontem é o dia anterior", () => {
    // 14/10 11:00 UTC = 14/10 08:00 em SP.
    expect(ontemSaoPaulo(new Date("2026-10-14T11:00:00Z"))).toBe("2026-10-13");
  });
});
