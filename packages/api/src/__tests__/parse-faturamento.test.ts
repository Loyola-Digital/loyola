import { describe, it, expect } from "vitest";
import { parseFaturamento } from "../services/parse-faturamento";

describe("parseFaturamento", () => {
  it("número puro", () => {
    expect(parseFaturamento("30000")).toBe(30000);
    expect(parseFaturamento("0")).toBe(0);
  });

  it("formato BR com R$ e milhar", () => {
    expect(parseFaturamento("R$ 30.000")).toBe(30000);
    expect(parseFaturamento("R$ 30.000,00")).toBe(30000);
    expect(parseFaturamento("R$ 1.234.567,89")).toBe(1234567.89);
  });

  it("abreviações k / mil / mi", () => {
    expect(parseFaturamento("30k")).toBe(30000);
    expect(parseFaturamento("10 mil")).toBe(10000);
    expect(parseFaturamento("1,5 mi")).toBe(1500000);
    expect(parseFaturamento("2M")).toBe(2000000);
  });

  it("milhão / milhões por extenso", () => {
    expect(parseFaturamento("1 milhão")).toBe(1000000);
    expect(parseFaturamento("2 milhões")).toBe(2000000);
    expect(parseFaturamento("2 milhoes")).toBe(2000000);
    expect(parseFaturamento("50 milhões")).toBe(50000000);
  });

  it("não confunde palavra (mensais/mês/kg) com sufixo de escala", () => {
    expect(parseFaturamento("R$ 30.000 mensais")).toBe(30000);
    expect(parseFaturamento("20000 mensal")).toBe(20000);
    expect(parseFaturamento("50.000 mês")).toBe(50000);
    expect(parseFaturamento("acima de 50000 mensais")).toBe(50000);
    expect(parseFaturamento("100 metros quadrados")).toBe(100);
  });

  it("faixa intervalo → usa o piso", () => {
    expect(parseFaturamento("R$ 20.000 a R$ 60.000")).toBe(20000);
    expect(parseFaturamento("20.000 - 60.000")).toBe(20000);
    expect(parseFaturamento("de 60k a 90k")).toBe(60000);
  });

  it("faixa com unidade só no fim → escala propagada", () => {
    expect(parseFaturamento("de 30 a 50 mil")).toBe(30000);
    expect(parseFaturamento("entre 10 e 20 mil")).toBe(10000);
  });

  it("faixa 'acima de' → usa o maior", () => {
    expect(parseFaturamento("Acima de 100k")).toBe(100000);
    expect(parseFaturamento("mais de R$ 100.000")).toBe(100000);
    expect(parseFaturamento("a partir de 60 mil")).toBe(60000);
  });

  it("faixa 'até' → logo abaixo do teto (cai na faixa [.., X))", () => {
    expect(parseFaturamento("Até 10 mil")).toBe(9999);
    expect(parseFaturamento("menos de 5.000")).toBe(4999);
  });

  it("texto livre → ignora número sem contexto monetário", () => {
    expect(parseFaturamento("trabalho há 3 anos, faturo 50k")).toBe(50000);
    expect(parseFaturamento("tenho 2 lojas, faturamento 100k")).toBe(100000);
  });

  it("decimal US vs milhar BR", () => {
    expect(parseFaturamento("1,234.56")).toBe(1234.56); // US
    expect(parseFaturamento("30.50")).toBe(30.5); // decimal (2 casas)
    expect(parseFaturamento("30.000")).toBe(30000); // milhar (3 casas)
  });

  it("vazio / inválido → null", () => {
    expect(parseFaturamento("")).toBeNull();
    expect(parseFaturamento(null)).toBeNull();
    expect(parseFaturamento(undefined)).toBeNull();
    expect(parseFaturamento("não informado")).toBeNull();
    expect(parseFaturamento("—")).toBeNull();
  });
});
