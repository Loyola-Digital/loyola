/**
 * A chave com que uma etapa encontra as campanhas dela (migration 0169).
 *
 * ## O que não funcionava
 *
 * A etapa casava campanha por `código do funil` + um SUFIXO DE FASE adivinhado
 * do nome dela (`resolveStagePhaseSuffix` → leads / vendas-captacao /
 * vendas-principal). O sufixo volta `null` em funil perpétuo, em etapa `cpl` e
 * `event`, e em nome que não bate com as regex — e `null` significa não casar
 * nada, em silêncio.
 *
 * No perpétuo isso é estrutural: a regra do token é "dois primeiros segmentos
 * do nome", que faz `fz-a1` e `fz-a2` virarem o MESMO código. As duas etapas
 * disputariam as mesmas campanhas, então a saída honesta era não popular
 * nenhuma.
 *
 * O código por etapa resolve isso sendo a chave COMPLETA: `fz-a1` casa
 * `fz-a1-2026` e não casa `fz-a2-2026`.
 */

import { describe, expect, it } from "vitest";
import {
  campanhaCasaComAEtapa,
  codigoDaEtapa,
} from "../services/funnel-match-code.js";

const funil = { name: "BBE_HAMBURGUER_PERPÉTUO", matchCode: null };
const comCodigo = { name: "BBE_HAMBURGUER_PERPÉTUO", matchCode: "hamburguer" };

describe("codigoDaEtapa", () => {
  it("código da etapa é a chave completa — sem sufixo adivinhado em cima", () => {
    // Mesmo com um sufixo de fase disponível, ele é descartado: quem digitou
    // `fz-a1` disse o que quer, e exigir `leads` também tiraria campanha dele.
    const chave = codigoDaEtapa(funil, { matchCode: "fz-a1" }, "leads");
    expect(chave).toEqual({ codigo: "fz-a1", sufixo: null, origem: "etapa" });
  });

  it("apara e baixa a caixa — `  FZ-A1 ` digitado na tela casa igual", () => {
    expect(codigoDaEtapa(funil, { matchCode: "  FZ-A1 " }, null).codigo).toBe("fz-a1");
  });

  it("só espaço em branco conta como vazio, não como código", () => {
    // Senão a etapa casaria com TODA campanha (substring de "" é sempre true).
    expect(codigoDaEtapa(funil, { matchCode: "   " }, null).origem).toBe("nenhuma");
  });

  it("sem código na etapa, é o funil + fase — o comportamento de antes, intacto", () => {
    expect(codigoDaEtapa(comCodigo, { matchCode: null }, "leads")).toEqual({
      codigo: "hamburguer",
      sufixo: "leads",
      origem: "funil-com-fase",
    });
  });

  it("sem código na etapa e sem fase, não casa nada — é o caso que o campo resolve", () => {
    expect(codigoDaEtapa(comCodigo, { matchCode: null }, null)).toEqual({
      codigo: null,
      sufixo: null,
      origem: "nenhuma",
    });
  });

  it("sem código na etapa, cai no NOME do funil quando ele não tem código", () => {
    expect(codigoDaEtapa(funil, { matchCode: null }, "leads").codigo).toBe(
      "bbe_hamburguer_perpétuo",
    );
  });

  it("funil sem código e sem nome não casa nada", () => {
    expect(codigoDaEtapa({ name: null, matchCode: null }, { matchCode: null }, "leads").codigo).toBe(
      null,
    );
  });
});

describe("campanhaCasaComAEtapa", () => {
  const fzA1 = codigoDaEtapa(funil, { matchCode: "fz-a1" }, null);

  it("o caso do pedido: a campanha nova cai na etapa certa", () => {
    expect(campanhaCasaComAEtapa("fz-a1-2026", fzA1)).toBe(true);
  });

  it("e NÃO cai na etapa vizinha — é isto que a regra dos 2 segmentos errava", () => {
    expect(campanhaCasaComAEtapa("fz-a2-2026", fzA1)).toBe(false);
  });

  it("ignora a caixa do nome da campanha", () => {
    expect(campanhaCasaComAEtapa("[FZ-A1] Hot Outubro", fzA1)).toBe(true);
  });

  it("com sufixo de fase, exige os DOIS termos", () => {
    const chave = codigoDaEtapa(comCodigo, { matchCode: null }, "leads");
    expect(campanhaCasaComAEtapa("hamburguer-leads-broad", chave)).toBe(true);
    // Só o código não basta: senão a etapa de captação levaria a de vendas.
    expect(campanhaCasaComAEtapa("hamburguer-vendas-principal", chave)).toBe(false);
    expect(campanhaCasaComAEtapa("outro-leads", chave)).toBe(false);
  });

  it("chave sem código não casa com ninguém, nem com nome vazio", () => {
    const nenhuma = codigoDaEtapa(comCodigo, { matchCode: null }, null);
    expect(campanhaCasaComAEtapa("qualquer coisa", nenhuma)).toBe(false);
    expect(campanhaCasaComAEtapa("", nenhuma)).toBe(false);
  });
});
