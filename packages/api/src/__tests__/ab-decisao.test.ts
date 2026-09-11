import { describe, expect, it } from "vitest";
import {
  ALFA_PADRAO,
  amostraNecessaria,
  decidirVencedor,
  pValorBilateral,
  zDeDuasProporcoes,
  type ContagemDaVariacao,
} from "../services/ab-decisao.js";

const v = (
  nome: string,
  visitas: number,
  conversoes: number,
): ContagemDaVariacao => ({
  id: nome,
  nome,
  visitas,
  conversoes,
});

describe("zDeDuasProporcoes", () => {
  it("devolve null sem amostra — nunca 0", () => {
    // Zero contamina média, ordenação e export. É a regra que faz uma variação
    // que ninguém viu não parecer a pior de todas.
    expect(zDeDuasProporcoes(v("a", 0, 0), v("b", 10, 1))).toBeNull();
    expect(zDeDuasProporcoes(v("a", 10, 1), v("b", 0, 0))).toBeNull();
  });

  it("devolve null quando não há variância", () => {
    // As duas com 0% (ou as duas com 100%): não há o que distinguir, e a
    // fórmula dividiria por zero.
    expect(zDeDuasProporcoes(v("a", 100, 0), v("b", 100, 0))).toBeNull();
    expect(zDeDuasProporcoes(v("a", 100, 100), v("b", 100, 100))).toBeNull();
  });

  it("é zero quando as taxas são idênticas", () => {
    expect(zDeDuasProporcoes(v("a", 100, 10), v("b", 100, 10))).toBe(0);
  });

  it("troca de sinal quando os lados trocam", () => {
    const z = zDeDuasProporcoes(v("a", 1000, 200), v("b", 1000, 100))!;
    const inverso = zDeDuasProporcoes(v("b", 1000, 100), v("a", 1000, 200))!;
    expect(z).toBeGreaterThan(0);
    expect(inverso).toBeCloseTo(-z, 10);
  });
});

describe("pValorBilateral", () => {
  it("bate com os valores tabelados", () => {
    expect(pValorBilateral(1.959964)).toBeCloseTo(0.05, 4);
    expect(pValorBilateral(2.575829)).toBeCloseTo(0.01, 4);
    expect(pValorBilateral(0)).toBeCloseTo(1, 6);
  });

  it("não distingue o sinal — B pode ganhar ou perder de A", () => {
    expect(pValorBilateral(2)).toBeCloseTo(pValorBilateral(-2), 12);
  });
});

describe("decidirVencedor", () => {
  it("NÃO elege vencedor com 3 em 10 contra 2 em 10", () => {
    // O caso que motivou tudo: é exatamente isto que o VK coroa, com selo.
    const r = decidirVencedor([v("A", 10, 2), v("B", 10, 3)]);
    expect(r.estado).toBe("sem_amostra");
    expect(r.linhas.every((l) => !l.vencedora)).toBe(true);
  });

  it("diz que falta amostra e NOMEIA quem está magra", () => {
    const r = decidirVencedor([v("A", 500, 50), v("B", 12, 3)]);
    expect(r.estado).toBe("sem_amostra");
    expect(r.mensagem).toContain("B (12)");
    expect(r.mensagem).not.toContain("A (");
  });

  it("fica inconclusivo com amostra boa e diferença pequena", () => {
    // O estado que falta na maioria das ferramentas, e o mais comum na prática.
    const r = decidirVencedor([v("A", 1000, 100), v("B", 1000, 110)]);
    expect(r.estado).toBe("inconclusivo");
    expect(r.pValor).toBeGreaterThan(ALFA_PADRAO);
    expect(r.linhas.every((l) => !l.vencedora)).toBe(true);
  });

  it("declara vencedor quando a diferença é real", () => {
    const r = decidirVencedor([v("A", 1000, 100), v("B", 1000, 200)]);
    expect(r.estado).toBe("vencedor");
    expect(r.pValor!).toBeLessThan(ALFA_PADRAO);
    expect(r.linhas.find((l) => l.vencedora)!.nome).toBe("B");
  });

  it("só uma linha sai como vencedora", () => {
    const r = decidirVencedor([v("A", 1000, 100), v("B", 1000, 200)]);
    expect(r.linhas.filter((l) => l.vencedora)).toHaveLength(1);
  });

  it("taxa é null sem visita, não 0", () => {
    const r = decidirVencedor([v("A", 0, 0), v("B", 100, 10)]);
    expect(r.linhas.find((l) => l.nome === "A")!.taxa).toBeNull();
  });

  it("exige vencer TODAS, não só a pior", () => {
    // A ganha folgado de C mas empata com B. Coroar A seria dizer que ela é a
    // melhor quando não se sabe se é melhor que B.
    const r = decidirVencedor([
      v("A", 2000, 400),
      v("B", 2000, 390),
      v("C", 2000, 100),
    ]);
    expect(r.estado).toBe("inconclusivo");
  });

  it("aperta o alfa com mais variações (Bonferroni)", () => {
    // Quatro variações a 5% cada dariam ~14% de chance de coroar um vencedor
    // inexistente. O alfa efetivo cai proporcionalmente às comparações.
    const duas = decidirVencedor([v("A", 1000, 100), v("B", 1000, 200)]);
    const quatro = decidirVencedor([
      v("A", 1000, 100),
      v("B", 1000, 200),
      v("C", 1000, 100),
      v("D", 1000, 100),
    ]);
    expect(duas.comparacoes).toBe(1);
    expect(quatro.comparacoes).toBe(3);
    expect(quatro.alfaEfetivo).toBeCloseTo(ALFA_PADRAO / 3, 10);
    expect(duas.alfaEfetivo).toBe(ALFA_PADRAO);
  });

  it("recusa teste com menos de duas variações", () => {
    expect(decidirVencedor([v("A", 1000, 100)]).estado).toBe("sem_amostra");
    expect(decidirVencedor([]).estado).toBe("sem_amostra");
  });

  it("empate perfeito não vira vencedor", () => {
    const r = decidirVencedor([v("A", 1000, 100), v("B", 1000, 100)]);
    expect(r.estado).toBe("inconclusivo");
  });

  it("duas variações com 0% não travam nem coroam", () => {
    const r = decidirVencedor([v("A", 500, 0), v("B", 500, 0)]);
    expect(r.estado).toBe("inconclusivo");
    expect(r.linhas.every((l) => l.taxa === 0)).toBe(true);
  });
});

describe("amostraNecessaria", () => {
  it("dá a ordem de grandeza conhecida", () => {
    // De 5% para 7% (mde 0,02) pede ~2.400 por variação — número clássico de
    // calculadora de A/B. É o que diz se o teste tem chance no seu volume.
    const n = amostraNecessaria(0.05, 0.02)!;
    expect(n).toBeGreaterThan(1800);
    expect(n).toBeLessThan(3200);
  });

  it("quanto menor a diferença buscada, maior a amostra", () => {
    expect(amostraNecessaria(0.05, 0.01)!).toBeGreaterThan(
      amostraNecessaria(0.05, 0.02)!,
    );
  });

  it("null em entrada sem sentido", () => {
    expect(amostraNecessaria(0, 0.02)).toBeNull();
    expect(amostraNecessaria(1, 0.02)).toBeNull();
    expect(amostraNecessaria(0.05, 0)).toBeNull();
    // Taxa base + diferença passando de 100% não existe.
    expect(amostraNecessaria(0.95, 0.1)).toBeNull();
  });
});
