import { describe, it, expect } from "vitest";
import { utmContentEfetivo, normalizeNumericId } from "../utils/utm-value.js";

/**
 * Story 18.71. Os casos abaixo são células REAIS lidas das abas de venda de
 * produção em 2026-09-02 — não exemplos inventados.
 */
describe("utmContentEfetivo — os três formatos que a planilha entrega", () => {
  it("formato 1: objeto JSON com ad_id — as 2 vendas que sumiram do bbe-pr2", () => {
    // As duas linhas do relato do gestor: R$ 2.194,00 e R$ 797,00.
    expect(
      utmContentEfetivo(
        '{"co":"120247542282230489","url":"lps.netaobombeef.com/bbepr2-captura-a/","v":1}',
      ),
    ).toBe("120247542282230489");
    expect(
      utmContentEfetivo(
        '{"co":"120247234209500489","url":"lps.netaobombeef.com/bbepr2-captura-a/","v":1}',
      ),
    ).toBe("120247234209500489");
  });

  it("formato 1: o uuid `u` varia por venda e NÃO pode virar parte da chave", () => {
    // Sem isto, cada venda orgânica vira um grupo próprio na tabela por UTM.
    const a = '{"co":"org","u":"67fc1fbf-e534-4fde-b617-a10d66e21cf9","url":"x","v":1}';
    const b = '{"co":"org","u":"55e1d0fe-3698-4526-a073-c8ec8959d6fa","url":"x","v":1}';
    expect(utmContentEfetivo(a)).toBe("org");
    expect(utmContentEfetivo(b)).toBe("org");
    expect(utmContentEfetivo(a)).toBe(utmContentEfetivo(b));
  });

  it("formato 1: sem campo `co` não há criativo", () => {
    expect(utmContentEfetivo('{"url":"lps.netaobombeef.com/x/","v":1}')).toBe("");
    expect(utmContentEfetivo('{"co":null,"v":1}')).toBe("");
  });

  it("formato 2: par duplicado — NÃO é JSON, JSON.parse lança nele", () => {
    expect(() => JSON.parse('{"org","org"}')).toThrow();
    expect(utmContentEfetivo('{"org","org"}')).toBe("org");
    expect(utmContentEfetivo('{"link_in_bio","link_in_bio"}')).toBe("link_in_bio");
    expect(utmContentEfetivo('{"imersao","imersao"}')).toBe("imersao");
  });

  it("formato 2: par que NÃO é duplicado fica cru — escolher um lado seria inventar", () => {
    expect(utmContentEfetivo('{"a","b"}')).toBe('{"a","b"}');
    expect(utmContentEfetivo('{"",""}')).toBe('{"",""}');
  });

  it("formato 3: macro do Meta não substituída não é criativo", () => {
    expect(utmContentEfetivo("{{ad.id}}")).toBe("");
    expect(utmContentEfetivo("{{campaign.name}}")).toBe("");
  });

  it("o caminho comum não regride: id puro e `_` do Sheets", () => {
    expect(utmContentEfetivo("120247234266910489")).toBe("120247234266910489");
    expect(utmContentEfetivo("_120247234266910489")).toBe("120247234266910489");
    expect(utmContentEfetivo("  120247234266910489  ")).toBe("120247234266910489");
    expect(utmContentEfetivo("org")).toBe("org");
  });

  it("vazio, nulo e espaço em branco são ausência", () => {
    expect(utmContentEfetivo("")).toBe("");
    expect(utmContentEfetivo("   ")).toBe("");
    expect(utmContentEfetivo(null)).toBe("");
    expect(utmContentEfetivo(undefined)).toBe("");
  });

  it("célula de planilha é dado externo: NUNCA lança", () => {
    const lixo = [
      "{",
      "{}",
      '{"co":',
      '{"co":"a"',
      "{[}]",
      '{"co":{"co":"aninhado"}}',
      "{{}",
      '{"co":"a"}extra',
      " {",
      "{".repeat(5000),
    ];
    for (const v of lixo) expect(() => utmContentEfetivo(v)).not.toThrow();
  });

  it("objeto aninhado no `co` não vira '[object Object]' na tela", () => {
    // String({}) daria "[object Object]" e criaria um "anúncio" com esse nome.
    expect(utmContentEfetivo('{"co":{"x":1},"v":1}')).not.toContain("[object");
  });

  it("array JSON não é objeto de tracking", () => {
    expect(utmContentEfetivo('["org"]')).toBe('["org"]');
  });
});

describe("normalizeNumericId — id que vem da API do Meta, nunca da planilha", () => {
  it("continua fazendo só o strip do underscore", () => {
    expect(normalizeNumericId("_123")).toBe("123");
    expect(normalizeNumericId("123")).toBe("123");
    expect(normalizeNumericId("_abc")).toBe("_abc"); // só strip se o resto for numérico
    expect(normalizeNumericId("  _123  ")).toBe("123");
  });
});

/**
 * AC5 — teste diferencial. Reverter o fix tem que DERRUBAR o teste.
 *
 * `antesDoFix` é o corpo exato que estava em produção nos quatro arquivos. Se
 * alguém trocar `utmContentEfetivo` de volta por ele, as asserções abaixo
 * quebram. Um teste que passa nos dois estados não prova nada.
 */
describe("AC5 — o comportamento antigo falharia nestes casos", () => {
  function antesDoFix(id: string): string {
    const trimmed = id.trim();
    if (trimmed.startsWith("_")) {
      const rest = trimmed.slice(1);
      if (/^\d+$/.test(rest)) return rest;
    }
    return trimmed;
  }

  const celulasReais = [
    { cru: '{"co":"120247542282230489","url":"x","v":1}', esperado: "120247542282230489" },
    { cru: '{"org","org"}', esperado: "org" },
    { cru: "{{ad.id}}", esperado: "" },
  ];

  it.each(celulasReais)("$cru vira $esperado, e o corpo antigo NÃO chegava lá", ({ cru, esperado }) => {
    expect(utmContentEfetivo(cru)).toBe(esperado);
    expect(antesDoFix(cru)).not.toBe(esperado);
    // O que o corpo antigo devolvia: a célula inteira como chave de anúncio.
    expect(antesDoFix(cru)).toBe(cru);
  });

  it("nos valores normais, os dois concordam — o fix não muda o caminho comum", () => {
    for (const v of ["120247234266910489", "_120247234266910489", "org", "link_in_bio"]) {
      expect(utmContentEfetivo(v)).toBe(antesDoFix(v));
    }
  });
});
