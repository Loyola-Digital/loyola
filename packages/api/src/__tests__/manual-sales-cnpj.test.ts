/**
 * A venda manual aceita CNPJ — e a coluna cabe o que a validação aceita.
 *
 * ## O 500 que ninguém conseguia ler
 *
 * Em 06/10/2026, cadastrar uma venda de R$ 30.000 na etapa Evento do BBE-PR2
 * devolveu `500 Internal Server Error`. O motivo estava três camadas abaixo:
 *
 *     value too long for type character varying(11)
 *
 * `customer_cpf` nasceu `varchar(11)`, de quando só havia CPF. A Story 19.15
 * passou a aceitar CNPJ na validação e no corpo da rota (`max(14)`), e ninguém
 * alargou a coluna. Toda venda para pessoa jurídica morria — e como o erro
 * vinha do banco, quem preenchia o formulário via só "Internal Server Error",
 * sem pista do campo culpado.
 *
 * ## Por que o teste olha para o SCHEMA, e não só para a validação
 *
 * Validar que `isValidCpfOrCnpj` aceita CNPJ não teria pego nada: ela já
 * aceitava. O defeito morava na distância entre o que a validação deixa passar
 * e o que a coluna comporta — e essa distância só aparece quando as duas são
 * comparadas. É isso que o segundo teste faz.
 */

import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { manualSales } from "../db/schema.js";
import { isValidCpfOrCnpj } from "../routes/manual-sales.js";

/** O tamanho declarado de uma coluna varchar do schema. */
function tamanhoDaColuna(nome: string): number | undefined {
  const coluna = getTableConfig(manualSales).columns.find((c) => c.name === nome);
  return (coluna as unknown as { length?: number } | undefined)?.length;
}

describe("CPF/CNPJ na venda manual", () => {
  it("a coluna cabe os 14 dígitos que a validação aceita", () => {
    // O corpo da rota aceita `max(14)` e `isValidCpfOrCnpj` valida CNPJ.
    // Uma coluna menor que isso transforma venda de PJ em 500 do banco.
    expect(tamanhoDaColuna("customer_cpf")).toBeGreaterThanOrEqual(14);
  });

  it("aceita CNPJ válido — o caso que derrubava a venda", () => {
    // O CNPJ real da venda de 06/10/2026 que devolveu 500.
    expect(isValidCpfOrCnpj("47400494000165")).toBe(true);
    expect(isValidCpfOrCnpj("47.400.494/0001-65")).toBe(true);
  });

  it("continua aceitando CPF — as 16 vendas antigas são todas PF", () => {
    expect(isValidCpfOrCnpj("529.982.247-25")).toBe(true);
    expect(isValidCpfOrCnpj("52998224725")).toBe(true);
  });

  it("documento inválido continua sendo recusado antes do banco", () => {
    expect(isValidCpfOrCnpj("11111111111")).toBe(false);
    expect(isValidCpfOrCnpj("47400494000100")).toBe(false);
    expect(isValidCpfOrCnpj("123")).toBe(false);
  });
});
