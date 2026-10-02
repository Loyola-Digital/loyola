/**
 * A entidade `produtos` e a lista de entidades que o validador aceita.
 *
 * ## O bug que estes testes travam
 *
 * `querySpecSchema` tinha o enum de entidades escrito à mão. Quando `produtos`
 * nasceu no catálogo, a lista do schema ficou para trás — e o sintoma foi
 * cruel: a IA montava o widget CERTO, o validador recusava com "entidade
 * inválida", e a autocorreção refazia tudo numa entidade pior. A explicação na
 * tela dizia que `produtos` "não estava disponível", o que era verdade e
 * inútil.
 *
 * Por isso o primeiro teste compara as duas listas em vez de conferir nomes:
 * é a divergência que precisa ser impossível, não uma entidade específica.
 */

import { describe, expect, it } from "vitest";
import { CAMPOS, ENTIDADES } from "../services/bi/catalogo.js";
import { CAMPO_DE_DATA, querySpecSchema } from "../services/bi/query.js";

describe("entidades do catálogo x do validador", () => {
  it("toda entidade do catálogo é aceita pelo validador", () => {
    for (const e of ENTIDADES) {
      // Uma métrica real da própria entidade: o schema exige pelo menos uma, e
      // o que está em teste aqui é a lista de entidades, não a de métricas.
      const metrica = CAMPOS.find((c) => c.entity === e.key && c.role === "metric")?.key;
      expect(metrica, `entidade "${e.key}" sem métrica no catálogo`).toBeTruthy();
      const r = querySpecSchema.safeParse({
        entity: e.key,
        metrics: [metrica],
        dimensions: [],
        filters: { [CAMPO_DE_DATA[e.key]]: { operator: "$between", value: ["2026-10-01", "2026-10-01"] } },
        order_by: [],
        limit: 10,
        date_granularity: "day",
      });
      expect(r.success, `entidade "${e.key}" recusada pelo querySpecSchema`).toBe(true);
    }
  });

  it("toda entidade tem campo de data declarado", () => {
    for (const e of ENTIDADES) {
      expect(CAMPO_DE_DATA[e.key], `entidade "${e.key}" sem campo de data`).toBeTruthy();
    }
  });

  it("todo campo do catálogo pertence a uma entidade que existe", () => {
    const chaves = new Set(ENTIDADES.map((e) => e.key));
    for (const c of CAMPOS) {
      expect(chaves.has(c.entity), `campo "${c.key}" aponta para entidade inexistente`).toBe(true);
    }
  });
});

describe("catálogo de produtos", () => {
  const daEntidade = CAMPOS.filter((c) => c.entity === "produtos");

  it("dá para quebrar por produto e por funil, e medir faturamento", () => {
    const chaves = daEntidade.map((c) => c.key);
    expect(chaves).toContain("produtos.produto");
    expect(chaves).toContain("produtos.funil");
    expect(chaves).toContain("produtos.bruto");
    expect(chaves).toContain("produtos.vendas");
  });

  it("a descrição avisa que conta LINHA, não comprador — a diferença dos order bumps", () => {
    const vendas = daEntidade.find((c) => c.key === "produtos.vendas");
    expect(vendas?.description.toLowerCase()).toContain("comprador");
  });

  it("a entidade `vendas` manda quem procura produto para cá, não para si mesma", () => {
    const vendas = ENTIDADES.find((e) => e.key === "vendas");
    expect(vendas?.descricao).toContain("`produtos`");
  });
});
