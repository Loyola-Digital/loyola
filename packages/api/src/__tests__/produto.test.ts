/**
 * Story 29.53 (Fatia B) — a classificação de produto entra na conta.
 *
 * Cada teste aqui existe para FALHAR com um defeito específico de volta. A lista
 * de reversões está na story; os nomes dos `describe` seguem ela.
 */

import { describe, it, expect } from "vitest";
import { productKey, tipoDoProduto, quebraVazia, type TipoDeProduto } from "../utils/produto.js";

const TIPOS_DO_NETAO: Record<string, TipoDeProduto> = {
  "workshop burgers netão": "order_bump",
  "burgers netão": "order_bump",
};

describe("productKey — a chave que decide se a classificação pega", () => {
  it("normaliza caixa e espaço", () => {
    expect(productKey("  Workshop Burgers Netão  ")).toBe("workshop burgers netão");
    expect(productKey("IMERSÃO")).toBe(productKey("imersão"));
  });

  it("NÃO unifica nomes parecidos — igualdade exata, decisão da 29.49", () => {
    // Os dois convivem na planilha do Netão e são o mesmo produto para quem
    // olha. Unificá-los aqui reclassificaria em silêncio o que o gestor marcou.
    expect(productKey("Workshop Burgers Netão")).not.toBe(productKey("Burgers Netão"));
  });
});

describe("tipoDoProduto — produto ausente do mapa é `principal`", () => {
  /**
   * Reversão: "produto ausente do mapa deixa de virar `principal`".
   *
   * `normalizeProductTypes` grava só os bump/upsell — o mapa NUNCA tem os
   * principais. Se o default mudasse, todo funil não classificado (hoje, todos
   * menos um) zeraria a fatia principal.
   */
  it("o que não está no mapa conta como principal", () => {
    expect(tipoDoProduto("Curso Completo", TIPOS_DO_NETAO)).toBe("principal");
  });

  it("mapa vazio = comportamento anterior à story: tudo principal", () => {
    expect(tipoDoProduto("Workshop Burgers Netão", {})).toBe("principal");
  });

  it("classifica o bump quando está no mapa, em qualquer grafia", () => {
    expect(tipoDoProduto("Workshop Burgers Netão", TIPOS_DO_NETAO)).toBe("order_bump");
    expect(tipoDoProduto("  workshop burgers NETÃO ", TIPOS_DO_NETAO)).toBe("order_bump");
  });

  it("linha sem produto (coluna não mapeada ou célula vazia) é principal", () => {
    expect(tipoDoProduto(null, TIPOS_DO_NETAO)).toBe("principal");
    expect(tipoDoProduto("   ", TIPOS_DO_NETAO)).toBe("principal");
  });
});

describe("a quebra do card conta LINHAS, e por isso não fecha com o total", () => {
  /**
   * Reversão: "fatias do card contam compradores em vez de linhas" —
   * o número errado que parece certo é `109 + 20 = 129 ≠ 110`.
   *
   * Reproduz a forma do funil do Netão em miniatura: 3 compradores, um deles
   * levou o bump. São 4 linhas pagas e 3 compradores.
   */
  const linhas = [
    { produto: "Curso Completo", email: "ana@x.com" },
    { produto: "Workshop Burgers Netão", email: "ana@x.com" }, // o bump da Ana
    { produto: "Curso Completo", email: "bru@x.com" },
    { produto: "Curso Completo", email: "caio@x.com" },
  ];

  const quebra = quebraVazia();
  for (const l of linhas) quebra[tipoDoProduto(l.produto, TIPOS_DO_NETAO)] += 1;

  it("3 principais + 1 bump = 4 linhas", () => {
    expect(quebra).toEqual({ principal: 3, order_bump: 1, upsell: 0 });
  });

  it("as fatias somam LINHAS (4), não compradores (3)", () => {
    const compradores = new Set(linhas.map((l) => l.email)).size;
    const somaDasFatias = quebra.principal + quebra.order_bump + quebra.upsell;
    expect(compradores).toBe(3);
    expect(somaDasFatias).toBe(4);
    expect(somaDasFatias).not.toBe(compradores);
  });

  it("com a classificação desligada, o bump vira principal e a quebra some", () => {
    // Reversão: "`product_types` deixa de ser lido". Sem o mapa, todas as
    // linhas caem em `principal` — e é esse `order_bump: 0` que faz o card
    // esconder a quebra em vez de exibir "Principal 4" como se fosse dado.
    const semMapa = quebraVazia();
    for (const l of linhas) semMapa[tipoDoProduto(l.produto, {})] += 1;
    expect(semMapa).toEqual({ principal: 4, order_bump: 0, upsell: 0 });
  });
});
