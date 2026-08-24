/**
 * A conciliação é o que decide se o aviso aparece na tela do time. Um falso
 * positivo aqui custa caro: manda alguém caçar venda que não sumiu.
 */
import { describe, it, expect } from "vitest";
import { conciliar, diaNormalizado, quantidadeDeIngressos, type VendaDaKiwify, type VendaDaPlanilha } from "../services/kiwify-reconciliation.js";

const k = (over: Partial<VendaDaKiwify>): VendaDaKiwify => ({
  id: "uuid-1", reference: "ABC123", email: "a@x.com", data: "2026-08-10", valor: 1097, produto: "Curso", ...over,
});
const p = (over: Partial<VendaDaPlanilha>): VendaDaPlanilha => ({
  chave: "uuid-1", email: "a@x.com", data: "2026-08-10", valor: 1097, produto: "Curso", ...over,
});

describe("conciliação planilha × Kiwify", () => {
  it("casa pelo id da venda", () => {
    const r = conciliar([p({})], [k({})]);
    expect(r.bate).toBe(true);
    expect(r.diferenca).toBe(0);
  });

  it("casa quando a planilha guardou o reference em vez do id", () => {
    // Caso real: a coluna de id da planilha do BBE tem UUID em umas linhas e
    // reference ("OMR7BXV") em outras.
    const r = conciliar([p({ chave: "OMR7BXV", email: null })], [k({ id: "uuid-9", reference: "OMR7BXV" })]);
    expect(r.bate).toBe(true);
  });

  it("casa por e-mail quando não há id de nenhum lado", () => {
    const r = conciliar([p({ chave: null })], [k({ id: "outro", reference: null })]);
    expect(r.bate).toBe(true);
  });

  it("aponta a venda que o webhook perdeu", () => {
    const r = conciliar([p({})], [k({}), k({ id: "uuid-2", reference: "DEF456", email: "b@x.com" })]);
    expect(r.soNaKiwify).toHaveLength(1);
    expect(r.soNaKiwify[0].email).toBe("b@x.com");
    expect(r.diferenca).toBe(1);
    expect(r.bate).toBe(false);
  });

  it("aponta a linha que só existe na planilha", () => {
    const r = conciliar([p({}), p({ chave: "uuid-3", email: "c@x.com" })], [k({})]);
    expect(r.soNaPlanilha).toHaveLength(1);
    expect(r.soNaPlanilha[0].email).toBe("c@x.com");
    expect(r.diferenca).toBe(-1);
  });

  it("não casa duas vendas do mesmo cliente com uma linha só", () => {
    // Quem compra duas vezes tem duas vendas. Casar as duas com a mesma linha
    // esconderia exatamente a venda que está faltando.
    const r = conciliar(
      [p({ chave: null, email: "recompra@x.com" })],
      [k({ id: "v1", reference: null, email: "recompra@x.com" }), k({ id: "v2", reference: null, email: "recompra@x.com" })],
    );
    expect(r.soNaKiwify).toHaveLength(1);
    expect(r.bate).toBe(false);
  });

  it("separa a linha sem chave em vez de acusar divergência", () => {
    const r = conciliar([p({ chave: null, email: null })], []);
    expect(r.planilhaSemChave).toBe(1);
    expect(r.soNaPlanilha).toHaveLength(0);
  });

  it("ignora caixa e espaço nas chaves", () => {
    const r = conciliar([p({ chave: "  UUID-1 ", email: "  A@X.COM " })], [k({})]);
    expect(r.bate).toBe(true);
  });

  it("os dois lados vazios batem, sem inventar divergência", () => {
    const r = conciliar([], []);
    expect(r.bate).toBe(true);
    expect(r.diferenca).toBe(0);
  });
});

describe("data da planilha", () => {
  it("entende o formato ISO que a aba de captação grava", () => {
    expect(diaNormalizado("2026-07-09T22:57:29.686Z")).toBe("2026-07-09");
  });

  it("entende o formato brasileiro que a aba de produto grava", () => {
    // Sem isto, "01/08/2026" < "2026-07-01" é verdadeiro na comparação de
    // texto e a janela descarta TODAS as linhas — dando "bate" com zero.
    expect(diaNormalizado("01/08/2026 17:00:48")).toBe("2026-08-01");
    expect(diaNormalizado("05/08/2026 12:20")).toBe("2026-08-05");
  });

  it("recusa o que não reconhece em vez de chutar", () => {
    expect(diaNormalizado("01/08/26")).toBeNull();
    expect(diaNormalizado("ontem")).toBeNull();
    expect(diaNormalizado("")).toBeNull();
    expect(diaNormalizado(null)).toBeNull();
  });

  it("a data brasileira convertida entra na janela certa", () => {
    const dia = diaNormalizado("01/08/2026 17:00:48")!;
    expect(dia >= "2026-07-01" && dia <= "2026-08-24").toBe(true);
  });
});

describe("quantidade de ingressos por venda", () => {
  const UNITARIO = 1097;

  it("conta 3 ingressos quando o base é 3x o unitário", () => {
    // Caso real: WILLIAM VIEIRA GOMES, 21/08, base R$ 3.291 = 1097 × 3.
    expect(quantidadeDeIngressos(3291, UNITARIO)).toBe(3);
  });

  it("conta 1 no preço cheio", () => {
    expect(quantidadeDeIngressos(1097, UNITARIO)).toBe(1);
  });

  it("preço promocional é um ingresso mais barato, não fração", () => {
    // 797 e 1000 aparecem na conta real: 0,727 e 0,912 do unitário.
    expect(quantidadeDeIngressos(797, UNITARIO)).toBe(1);
    expect(quantidadeDeIngressos(1000, UNITARIO)).toBe(1);
  });

  it("não confunde juros de parcelamento com quantidade", () => {
    // charge_amount de 1097 parcelado chega a 1361 (1,24×). Se alguém passar o
    // valor cobrado por engano, ainda assim não vira 1 ingresso a mais.
    expect(quantidadeDeIngressos(1361.46, UNITARIO)).toBe(1);
    expect(quantidadeDeIngressos(1214.48, UNITARIO)).toBe(1);
  });

  it("valor negociado no meio do caminho não vira 2", () => {
    expect(quantidadeDeIngressos(1755, UNITARIO)).toBe(1); // 1,6×
  });

  it("sem preço unitário configurado, toda venda vale 1", () => {
    expect(quantidadeDeIngressos(3291, null)).toBe(1);
    expect(quantidadeDeIngressos(3291, 0)).toBe(1);
  });

  it("aguenta centavos de arredondamento", () => {
    expect(quantidadeDeIngressos(2194.01, UNITARIO)).toBe(2);
  });
});
