/**
 * Story 29.49 — classificação de produtos da planilha do Perpétuo.
 *
 * As duas regras que decidem o que o gestor vê e o que fica gravado, testadas
 * sem HTTP e sem Google Sheets — mesmo padrão de `mergeConfigValues` (29.38).
 */

import { describe, it, expect } from "vitest";
import {
  aggregateProducts,
  normalizeProductTypes,
  productKey,
} from "../routes/perpetual-spreadsheets.js";

const HEADERS = ["Email", "Produto", "Valor"];
const linhas = (...produtos: string[]) => produtos.map((p) => ["a@b.com", p, "100"]);

describe("aggregateProducts", () => {
  it("sem coluna de produto mapeada, productMapped e false", () => {
    const r = aggregateProducts(HEADERS, linhas("X"), undefined, {});
    expect(r).toEqual({ productMapped: false, products: [] });
  });

  // Coluna renomeada no Sheets cai aqui. Para quem olha a tela e o mesmo beco
  // de "nao mapeada", e a acao e a mesma: voltar ao wizard.
  it("coluna mapeada que nao existe mais na planilha tambem e false", () => {
    const r = aggregateProducts(HEADERS, linhas("X"), "Produto Antigo", {});
    expect(r.productMapped).toBe(false);
  });

  it("coluna mapeada e planilha vazia: mapeada, sem produtos", () => {
    const r = aggregateProducts(HEADERS, [], "Produto", {});
    expect(r).toEqual({ productMapped: true, products: [] });
  });

  it("agrupa e conta, ordenando por contagem decrescente", () => {
    const r = aggregateProducts(
      HEADERS,
      linhas("Workshop", "Combo", "Workshop", "Workshop", "Combo"),
      "Produto",
      {},
    );
    expect(r.products.map((p) => [p.name, p.count])).toEqual([
      ["Workshop", 3],
      ["Combo", 2],
    ]);
  });

  // Sem isto o gestor classifica "Imersão" e nao entende por que "imersão"
  // continua contando como principal.
  it("dedup e case-insensitive, preservando o primeiro rotulo visto", () => {
    const r = aggregateProducts(HEADERS, linhas("Imersão", "imersão", " IMERSÃO "), "Produto", {});
    expect(r.products).toHaveLength(1);
    expect(r.products[0]).toMatchObject({ name: "Imersão", count: 3 });
  });

  it("produto ausente do mapa volta como principal", () => {
    const r = aggregateProducts(HEADERS, linhas("Workshop"), "Produto", {});
    expect(r.products[0].type).toBe("principal");
  });

  it("aplica o tipo salvo, casando pela chave canonica", () => {
    const r = aggregateProducts(
      HEADERS,
      linhas("Combo de Facas", "Mentoria Pro", "Workshop"),
      "Produto",
      { "combo de facas": "order_bump", "mentoria pro": "upsell" },
    );
    const porNome = Object.fromEntries(r.products.map((p) => [p.name, p.type]));
    expect(porNome).toEqual({
      "Combo de Facas": "order_bump",
      "Mentoria Pro": "upsell",
      Workshop: "principal",
    });
  });

  it("celula vazia nao vira produto", () => {
    const r = aggregateProducts(HEADERS, linhas("Workshop", "", "   "), "Produto", {});
    expect(r.products).toHaveLength(1);
  });
});

describe("normalizeProductTypes", () => {
  it("nao grava os principal — ausente ja significa principal", () => {
    const out = normalizeProductTypes({ Workshop: "principal", Combo: "order_bump" });
    expect(out).toEqual({ combo: "order_bump" });
  });

  it("grava com a chave canonica", () => {
    expect(normalizeProductTypes({ "  Combo De Facas ": "order_bump" })).toEqual({
      "combo de facas": "order_bump",
    });
  });

  it("mantem os tres tipos distintos", () => {
    const out = normalizeProductTypes({ A: "order_bump", B: "upsell", C: "principal" });
    expect(out).toEqual({ a: "order_bump", b: "upsell" });
  });

  it("ignora valor desconhecido em vez de gravar lixo", () => {
    expect(normalizeProductTypes({ A: "downsell" })).toEqual({});
  });

  it("mapa vazio continua vazio — planilha sem classificacao nao muda de comportamento", () => {
    expect(normalizeProductTypes({})).toEqual({});
  });
});

describe("productKey", () => {
  it("normaliza espaco e caixa", () => {
    expect(productKey("  Workshop DO Netão  ")).toBe("workshop do netão");
  });
});
