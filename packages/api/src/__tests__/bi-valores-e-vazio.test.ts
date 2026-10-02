/**
 * O agente escolhe VALORES de filtro, não só chaves — e widget vazio avisa.
 *
 * O caso real: o Alberto perguntou "as vendas do dia 01/10/26 dos workshops do
 * netão e a origem dessas vendas" (01/10/2026). A IA montou dois widgets,
 * respondeu que tinha feito, e os dois vieram sem dado nenhum. Um filtrava
 * `faturamento.funil $like "netão"` — nome que não existe: os funis do BBE são
 * `bbe-pr2-out-26`, `bbe_churrasco_perpétuo` e companhia.
 */

import { describe, expect, it } from "vitest";
import { listarParaMensagem, valorExiste, type ValoresConhecidos } from "../services/bi/valores.js";
import { porQueVazio } from "../services/bi/vazio.js";
import type { QuerySpec } from "../services/bi/query.js";

/** Os valores reais do projeto BBE, lidos do banco em 02/10/2026. */
const CONHECIDOS: ValoresConhecidos = {
  "faturamento.funil": [
    "bbe_churrasco_perpétuo",
    "bbe_hamburguer_perpétuo",
    "bbe-pr1-mar-26",
    "bbe-pr2-out-26",
  ],
  "vendas.produto": ["BLACK", "Sistema Margem 3X"],
};

describe("valorExiste", () => {
  it('recusa o apelido que a IA inventou ("netão" não é funil nenhum)', () => {
    expect(valorExiste("faturamento.funil", "$like", "netão", CONHECIDOS)).toBe(false);
  });

  it("aceita o valor que existe, escrito como está", () => {
    expect(valorExiste("faturamento.funil", "$eq", "bbe-pr2-out-26", CONHECIDOS)).toBe(true);
  });

  it("$like casa por pedaço, como o SQL vai casar", () => {
    expect(valorExiste("faturamento.funil", "$like", "churrasco", CONHECIDOS)).toBe(true);
  });

  it("acento e caixa não decidem nada — a intenção é a mesma", () => {
    expect(valorExiste("faturamento.funil", "$like", "CHURRASCO", CONHECIDOS)).toBe(true);
    expect(valorExiste("faturamento.funil", "$like", "perpetuo", CONHECIDOS)).toBe(true);
    expect(valorExiste("vendas.produto", "$eq", "black", CONHECIDOS)).toBe(true);
  });

  it("dimensão que não dá para enumerar passa — não dá para conferir, e inventar recusa é pior", () => {
    expect(valorExiste("trafego.campaign", "$eq", "qualquer coisa", CONHECIDOS)).toBe(true);
  });

  it("a mensagem de recusa leva os valores — é o que faz a 2ª tentativa acertar", () => {
    expect(listarParaMensagem("faturamento.funil", CONHECIDOS)).toContain("bbe-pr2-out-26");
  });
});

const spec = (filtros: QuerySpec["filters"] = {}): QuerySpec =>
  ({
    entity: "faturamento",
    metrics: ["faturamento.bruto"],
    dimensions: [],
    filters: {
      "faturamento.date": { operator: "$between", value: ["2026-10-01", "2026-10-01"] },
      ...filtros,
    },
    order_by: [],
    limit: 500,
    date_granularity: "day",
  }) as QuerySpec;

const PERIODO = { start: "2026-10-01", end: "2026-10-01" };

describe("porQueVazio", () => {
  it("widget com número não gera aviso nenhum", () => {
    const r = porQueVazio("Faturamento", spec(), { rows: [{ "faturamento.bruto": 7190.1 }] }, PERIODO);
    expect(r).toBeNull();
  });

  it("sem linha nenhuma, diz o período e os filtros usados", () => {
    const r = porQueVazio(
      "Faturamento dos workshops",
      spec({ "faturamento.funil": { operator: "$like", value: "netão" } }),
      { rows: [] },
      PERIODO,
    );
    expect(r).toContain("não encontrou nenhum registro");
    expect(r).toContain("2026-10-01");
    expect(r).toContain("netão");
  });

  it("linha que existe mas é toda zero é OUTRA conversa — e diz isso", () => {
    const r = porQueVazio("Faturamento", spec(), { rows: [{ "faturamento.bruto": 0 }] }, PERIODO);
    expect(r).toContain("veio zerado");
    expect(r).not.toContain("não encontrou");
  });

  it("intervalo aparece como intervalo, dia solto como dia", () => {
    const r = porQueVazio("X", spec(), { rows: [] }, { start: "2026-09-01", end: "2026-09-30" });
    expect(r).toContain("de 2026-09-01 a 2026-09-30");
  });

  it("sem filtro além do período, o aviso diz isso em vez de ficar ambíguo", () => {
    const r = porQueVazio("Aplicações por origem", spec(), { rows: [] }, PERIODO);
    expect(r).toContain("sem filtro além do período");
  });

  it("uma métrica com valor já basta para não avisar", () => {
    const comDuas = { ...spec(), metrics: ["faturamento.bruto", "faturamento.compradores"] };
    const r = porQueVazio(
      "Misto",
      comDuas,
      { rows: [{ "faturamento.bruto": 0, "faturamento.compradores": 3 }] },
      PERIODO,
    );
    expect(r).toBeNull();
  });
});
