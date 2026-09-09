/**
 * Coleções e agrupamento do Swipe Files.
 *
 * O que protege: subir a mesma pasta duas vezes não perde o envio por causa do
 * nome, subpasta não vira coleção, e peça sem o atributo não some da tela de
 * quem escolheu agrupar.
 */

import { describe, expect, it } from "vitest";
import {
  agruparPorAtributo,
  criariaCiclo,
  limparNomeDaColecao,
  nomeDaPastaRaiz,
  nomeLivre,
} from "../services/swipe-colecoes.js";

describe("limparNomeDaColecao", () => {
  it("colapsa espaço e apara as pontas", () => {
    expect(limparNomeDaColecao("  Black   Friday  2026 ")).toBe(
      "Black Friday 2026",
    );
  });

  it("só espaço é ausência", () => {
    expect(limparNomeDaColecao("   ")).toBeNull();
    expect(limparNomeDaColecao(null)).toBeNull();
  });

  it("corta em 120 para não estourar a coluna", () => {
    expect(limparNomeDaColecao("x".repeat(300))).toHaveLength(120);
  });
});

describe("nomeDaPastaRaiz", () => {
  it("usa a pasta escolhida, não a subpasta", () => {
    expect(nomeDaPastaRaiz("Black Friday 2026/anuncios/peca-01.png")).toBe(
      "Black Friday 2026",
    );
  });

  it("aceita a barra do Windows", () => {
    expect(nomeDaPastaRaiz("Refs\\vsl\\a.png")).toBe("Refs");
  });

  it("arquivo solto não vira coleção", () => {
    expect(nomeDaPastaRaiz("peca-01.png")).toBeNull();
    expect(nomeDaPastaRaiz("")).toBeNull();
  });
});

describe("nomeLivre", () => {
  it("devolve o nome quando ele não existe", () => {
    expect(nomeLivre("Black Friday", ["Outra"])).toBe("Black Friday");
  });

  it("numera quando já existe — subir a mesma pasta de novo é comum", () => {
    expect(nomeLivre("Black Friday", ["Black Friday"])).toBe(
      "Black Friday (2)",
    );
    expect(
      nomeLivre("Black Friday", ["Black Friday", "Black Friday (2)"]),
    ).toBe("Black Friday (3)");
  });

  it("ignora a caixa ao comparar — o índice do banco também ignora", () => {
    expect(nomeLivre("black friday", ["BLACK FRIDAY"])).toBe(
      "black friday (2)",
    );
  });
});

describe("agruparPorAtributo", () => {
  const p = (brand: string | null, niche: string | null = null) => ({
    brand,
    niche,
    platform: null,
    format: null,
  });

  it("grupo maior primeiro — diz mais sobre o acervo", () => {
    const g = agruparPorAtributo(
      [p("Opal"), p("Rise"), p("Rise"), p("Rise")],
      "brand",
    );
    expect(g.map((x) => x.valor)).toEqual(["Rise", "Opal"]);
    expect(g[0].pecas).toHaveLength(3);
  });

  it("empate desfeito pelo nome — a lista não pode se remexer entre leituras", () => {
    const g = agruparPorAtributo([p("Zeta"), p("Alfa")], "brand");
    expect(g.map((x) => x.valor)).toEqual(["Alfa", "Zeta"]);
  });

  it("peça sem o atributo vai para um grupo próprio, no FIM", () => {
    const g = agruparPorAtributo([p(null), p("Opal"), p("  ")], "brand");
    expect(g[g.length - 1].valor).toBeNull();
    expect(g[g.length - 1].pecas).toHaveLength(2);
  });

  it("sem nenhuma peça órfã, não inventa o grupo vazio", () => {
    const g = agruparPorAtributo([p("Opal")], "brand");
    expect(g).toHaveLength(1);
    expect(g[0].valor).toBe("Opal");
  });

  it("agrupa por outro campo sem confundir com marca", () => {
    const g = agruparPorAtributo(
      [p("Opal", "finanças"), p("Rise", "finanças")],
      "niche",
    );
    expect(g).toEqual([
      {
        valor: "finanças",
        pecas: [p("Opal", "finanças"), p("Rise", "finanças")],
      },
    ]);
  });
});

/** raiz → filha → neta */
const arvore = new Map<string, string | null>([
  ["raiz", null],
  ["filha", "raiz"],
  ["neta", "filha"],
  ["solta", null],
]);

describe("criariaCiclo", () => {
  it("mover para a raiz nunca cicla", () => {
    expect(criariaCiclo("neta", null, arvore)).toBe(false);
  });

  it("mover para uma coleção de outro ramo é permitido", () => {
    expect(criariaCiclo("solta", "neta", arvore)).toBe(false);
  });

  it("recusa ser pai de si mesma", () => {
    expect(criariaCiclo("filha", "filha", arvore)).toBe(true);
  });

  it("recusa entrar na própria filha", () => {
    // O gesto natural que quebra tudo: arrastar a mãe para dentro da filha.
    expect(criariaCiclo("raiz", "filha", arvore)).toBe(true);
  });

  it("recusa entrar na própria neta — o ciclo indireto", () => {
    // O caso que uma checagem ingênua (só comparar com o pai direto) deixa
    // passar, e que some com o ramo inteiro da listagem.
    expect(criariaCiclo("raiz", "neta", arvore)).toBe(true);
  });

  it("termina mesmo com a árvore já corrompida", () => {
    // Se um ciclo entrou antes desta guarda existir, a função que impede
    // ciclos não pode ser justamente a que trava o servidor.
    const podre = new Map<string, string | null>([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(criariaCiclo("x", "a", podre)).toBe(false);
  });

  it("pai inexistente é tratado como raiz", () => {
    // A mãe pode ter sido apagada entre o carregamento da tela e o gesto.
    expect(criariaCiclo("solta", "fantasma", arvore)).toBe(false);
  });
});
