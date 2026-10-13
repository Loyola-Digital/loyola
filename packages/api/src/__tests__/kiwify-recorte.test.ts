/**
 * O recorte da etapa: qual venda da Kiwify é desta etapa, e não de outra.
 *
 * ## Por que isto precisa de teste
 *
 * O mesmo produto vende em mais de um funil. Medido na conta DG & CPDF em
 * 13/10/2026: "Super Funcionário com Claude 2 Ed." tem três ofertas (Lote
 * Promocional 191 vendas, Lote 1 95, Lote 2 42) e "Claude para Negócios"
 * tem quatro. Errar o recorte não dá erro nenhum — dá faturamento de um funil
 * aparecendo no número do outro, que é exatamente o que ninguém nota.
 *
 * O filtro é conferido pelo SQL que gera, sem banco: o que importa é QUAIS
 * condições entram, e cada uma delas foi medida contra dados reais.
 */

import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { SEM_OFERTA, filtroDoRecorte } from "../services/kiwify-vendas-cache.js";

const PROJ = "738cda16-c5be-4268-9c98-92e46c359569";

/** O filtro como SQL + parâmetros, que é o que o banco vai receber. */
function consulta(recorte: Parameters<typeof filtroDoRecorte>[1]) {
  const q = new PgDialect().sqlToQuery(and(...filtroDoRecorte(PROJ, recorte))!);
  return { sql: q.sql, params: q.params };
}

describe("recorte por oferta", () => {
  it("filtra pela oferta escolhida, não só pelo produto", () => {
    // O pedido: um produto tem duas ofertas, cada uma vendendo para um funil.
    const { sql, params } = consulta({ productIds: ["prod-1"], offerIds: ["oferta-lote-1"] });
    expect(sql).toContain('"offer_id" in');
    expect(params).toContain("oferta-lote-1");
    expect(params).toContain("prod-1");
  });

  it("aceita várias ofertas do mesmo produto", () => {
    const { sql, params } = consulta({
      productIds: ["prod-1"],
      offerIds: ["lote-1", "lote-2"],
    });
    expect(sql).toContain('"offer_id" in');
    expect(params).toEqual(expect.arrayContaining(["lote-1", "lote-2"]));
  });

  it("sem oferta marcada, pega todas as ofertas do produto", () => {
    // Vazio é "todas", não "nenhuma": ligar a fonte sem escolher oferta
    // zeraria a etapa, e o padrão não pode surpreender.
    const { sql } = consulta({ productIds: ["prod-1"], offerIds: [] });
    expect(sql).not.toContain("offer_id");
    expect(sql).toContain('"product_id" in');
  });

  it("`sem-oferta` vira IS NULL e pode vir junto de ofertas de verdade", () => {
    // 91 das 574 vendas medidas não tinham oferta. Sem esta escolha elas não
    // teriam como entrar no recorte de jeito nenhum.
    const { sql, params } = consulta({
      productIds: [],
      offerIds: [SEM_OFERTA, "lote-1"],
    });
    expect(sql).toContain('"offer_id" is null');
    expect(sql).toContain("or");
    expect(params).toContain("lote-1");
    expect(params).not.toContain(SEM_OFERTA);
  });

  it("`sem-oferta` sozinha não gera OR pendurado", () => {
    const { sql } = consulta({ productIds: [], offerIds: [SEM_OFERTA] });
    expect(sql).toContain('"offer_id" is null');
    expect(sql).not.toContain('"offer_id" in');
  });
});

describe("janela da etapa", () => {
  it("corta pela data de APROVAÇÃO, caindo para a de criação", () => {
    // A mesma regra de `dataDaVenda` no adaptador. Se o corte usasse
    // `criada_em` e o agregador datasse pela aprovação, a venda criada no dia
    // 30 e paga no dia 2 ficaria fora de uma etapa que começa no dia 1 — e
    // dentro do mês em que o dinheiro entrou.
    const { sql } = consulta({ productIds: [], offerIds: [], startDate: "2026-09-01" });
    expect(sql).toContain("coalesce");
    expect(sql).toContain("aprovada_em");
    expect(sql).toContain("criada_em");
    expect(sql).not.toMatch(/"criada_em"\s*>=/);
  });

  it("o fim é inclusivo: quem escreve 30/09 quer o dia 30 inteiro", () => {
    const { sql, params } = consulta({
      productIds: [],
      offerIds: [],
      endDate: "2026-09-30",
    });
    expect(sql).toContain("interval '1 day'");
    expect(params).toContain("2026-09-30T00:00:00Z");
  });

  it("sem janela, não filtra data nenhuma", () => {
    // É o comportamento de antes da 0172, e tem de continuar sendo o padrão:
    // etapa sem data pega tudo que a sincronização tem.
    const { sql } = consulta({ productIds: ["prod-1"], offerIds: [] });
    expect(sql).not.toContain("coalesce");
  });

  it("início e fim juntos fecham a janela dos dois lados", () => {
    // O caso que a janela existe para resolver: produto SEM oferta
    // reaproveitado em outro funil. Medido: "Churrasco com Netão", 216 vendas
    // em 92 dias, `offer_id` NULL em todas — só a data separa.
    const { sql } = consulta({
      productIds: ["churrasco"],
      offerIds: [],
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    expect(sql.match(/coalesce/g)).toHaveLength(2);
    expect(sql).toContain(">=");
    expect(sql).toContain("<");
  });
});

describe("o projeto sempre entra", () => {
  it("nenhum recorte escapa do filtro de projeto", () => {
    // Sem isto, a etapa de um expert leria a venda de outro — as vendas de
    // todos os projetos moram na mesma tabela.
    for (const recorte of [
      { productIds: [], offerIds: [] },
      { productIds: ["p"], offerIds: ["o"], startDate: "2026-01-01", endDate: "2026-12-31" },
    ]) {
      const { sql, params } = consulta(recorte);
      expect(sql).toContain('"project_id"');
      expect(params).toContain(PROJ);
    }
  });
});
