import { describe, it, expect } from "vitest";
import { utmContentEfetivo, normalizeNumericId } from "../normalize-answer";

/**
 * Story 18.71 — lado do web.
 *
 * A regra em si é testada em `packages/api/src/__tests__/utm-value.test.ts`,
 * contra o mesmo módulo do `shared`. O que este arquivo prova é o que a suíte
 * da API **não** alcança: que o web resolve o módulo pelo subpath
 * (`@loyola-x/shared/src/utm-value`, reexportado por `normalize-answer`) e que
 * a tabela "Leads & vendas por UTM" agrupa o orgânico numa linha só.
 *
 * Import de VALOR vindo do shared já quebrou o `next build` antes, quando o web
 * só importava `import type` — por isso vale um teste dedicado à resolução.
 */
describe("web resolve o helper do shared pelo subpath", () => {
  it("as duas funções chegam de verdade, não como undefined", () => {
    expect(typeof utmContentEfetivo).toBe("function");
    expect(typeof normalizeNumericId).toBe("function");
  });
});

describe("AC6 — o orgânico agrupa numa linha só na dimensão Ad Name", () => {
  it("colapsa as vendas orgânicas que hoje viram um grupo cada", () => {
    // Células reais do bbe-pr2-ago-26: o `u` muda a cada venda, então hoje cada
    // uma abre um grupo próprio na tabela.
    const vendas = [
      '{"co":"org","u":"67fc1fbf-e534-4fde-b617-a10d66e21cf9","url":"x","v":1}',
      '{"co":"org","u":"55e1d0fe-3698-4526-a073-c8ec8959d6fa","url":"x","v":1}',
      // Formato 2, das abas do fz-l2 / fz-m2 / dg-pg02.
      '{"org","org"}',
    ];
    const grupos = new Set(vendas.map((v) => utmContentEfetivo(v)));
    expect([...grupos]).toEqual(["org"]);
    // Sem o fix seriam três grupos distintos.
    expect(new Set(vendas).size).toBe(3);
  });

  it("link_in_bio também é rótulo, não anúncio", () => {
    expect(utmContentEfetivo('{"co":"link_in_bio","url":"x","v":1}')).toBe("link_in_bio");
    expect(utmContentEfetivo('{"link_in_bio","link_in_bio"}')).toBe("link_in_bio");
  });

  it("macro não resolvida não vira um anúncio chamado {{ad.id}}", () => {
    expect(utmContentEfetivo("{{ad.id}}")).toBe("");
  });

  it("ad_id de verdade continua sendo a chave do criativo", () => {
    expect(
      utmContentEfetivo('{"co":"120247542282230489","url":"x","v":1}'),
    ).toBe("120247542282230489");
    expect(utmContentEfetivo("_120247542282230489")).toBe("120247542282230489");
  });
});
