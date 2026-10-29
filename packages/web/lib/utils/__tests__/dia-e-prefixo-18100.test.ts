import { afterAll, describe, expect, it } from "vitest";
import { diaDoInstante, toBusinessDayKey, BUSINESS_TIMEZONE } from "@loyola-x/shared/src/dia-do-negocio";
import { semPrefixoDeId } from "@loyola-x/shared/src/utm-value";
import { utmContentEfetivo } from "@/lib/utils/normalize-answer";
import { normaliseDate } from "@/lib/utils/spreadsheet-filters";

/**
 * Story 18.100 — AC5 (o dia de São Paulo de um instante) e AC4a (o prefixo de
 * id do Lead Form), pelo subpath do shared que o web usa (19.14).
 *
 * O vitest do web fixa `TZ=America/Sao_Paulo`. O AC8 pede os MESMOS resultados
 * também em UTC (o fuso do servidor e do CI): a suíte roda duas vezes, trocando
 * `process.env.TZ` — o Node relê o fuso na troca.
 */

const TZ_ORIGINAL = process.env.TZ;
afterAll(() => {
  process.env.TZ = TZ_ORIGINAL;
});

const CASOS_DO_INSTANTE: [string, string | null][] = [
  ["2026-10-29T22:30:00-05:00", "2026-10-30"],
  ["2026-10-29T05:48:26-05:00", "2026-10-29"],
  ["2026-07-21T01:18:00Z", "2026-07-20"],
  ["2026-10-28T22:54:52-05:00", "2026-10-29"],
  ["2026-04-15T17:35:10.016-03:00", "2026-04-15"],
  ["2026-10-29 22:30-0500", "2026-10-30"],
  ["29/10/2026", null],
  ["2026-10-29", null],
  ["2026-08-27 01:30:00", null],
  ["", null],
  ["lixo", null],
];

for (const tz of ["UTC", "America/Sao_Paulo"]) {
  describe(`Story 18.100 — diaDoInstante e normaliseDate com TZ=${tz} (AC5)`, () => {
    it("o fuso do processo é mesmo o pedido", () => {
      process.env.TZ = tz;
      const offset = new Date("2026-10-29T12:00:00Z").getTimezoneOffset();
      expect(offset).toBe(tz === "UTC" ? 0 : 180);
    });

    it.each(CASOS_DO_INSTANTE)("diaDoInstante(%j) = %j", (raw, esperado) => {
      process.env.TZ = tz;
      expect(diaDoInstante(raw)).toBe(esperado);
    });

    it("normaliseDate leva o instante ao dia de São Paulo (30/10, não 29/10)", () => {
      process.env.TZ = tz;
      expect(normaliseDate("2026-10-29T22:30:00-05:00")).toBe("2026-10-30");
      expect(normaliseDate("2026-10-29T05:48:26-05:00")).toBe("2026-10-29");
    });

    it("data sem fuso: o mesmo de antes (dia escrito)", () => {
      process.env.TZ = tz;
      expect(normaliseDate("29/10/2026")).toBe("2026-10-29");
      expect(normaliseDate("29/10/2026 23:59:00")).toBe("2026-10-29");
      expect(normaliseDate("2026-10-29")).toBe("2026-10-29");
      expect(normaliseDate("2026-08-27 01:30:00")).toBe("2026-08-27");
      expect(normaliseDate("2026-08-27T01:30:00")).toBe("2026-08-27");
      expect(normaliseDate("")).toBeNull();
    });
  });
}

describe("Story 18.100 — o módulo do dia pelo subpath (19.14)", () => {
  it("as funções chegam de verdade", () => {
    expect(BUSINESS_TIMEZONE).toBe("America/Sao_Paulo");
    expect(toBusinessDayKey(new Date("2026-07-21T01:18:00Z"))).toBe("2026-07-20");
  });
});

describe("Story 18.100 — semPrefixoDeId (AC4a)", () => {
  it("c:, as: e ag:, cada um só na sua coluna", () => {
    expect(semPrefixoDeId("utm_campaign", "c:120249689901480208")).toBe("120249689901480208");
    expect(semPrefixoDeId("utm_medium", "as:120249690395760208")).toBe("120249690395760208");
    expect(semPrefixoDeId("utm_content", "ag:120249690395770208")).toBe("120249690395770208");
    expect(semPrefixoDeId("utm_campaign", "ag:1")).toBe("ag:1");
    expect(semPrefixoDeId("utm_medium", "c:1")).toBe("c:1");
  });

  it("`as:` em utm_content fica intacto; resto não numérico fica intacto", () => {
    expect(semPrefixoDeId("utm_content", "as:120249690395770208")).toBe("as:120249690395770208");
    expect(semPrefixoDeId("utm_content", "ag:abc")).toBe("ag:abc");
    expect(semPrefixoDeId("utm_content", "ag:")).toBe("ag:");
    expect(semPrefixoDeId("utm_term", "ag:1")).toBe("ag:1");
  });

  it("`_` do Sheets passa, e `normalizeNumericId`/`utmContentEfetivo` tiram depois", () => {
    expect(semPrefixoDeId("utm_content", "ag:_120249")).toBe("_120249");
    expect(utmContentEfetivo(semPrefixoDeId("utm_content", "ag:_120249"))).toBe("120249");
  });

  it("é idempotente", () => {
    for (const [c, v] of [["utm_content", "ag:1"], ["utm_campaign", "c:22"], ["utm_content", "ag:abc"], ["utm_medium", "x"]]) {
      expect(semPrefixoDeId(c, semPrefixoDeId(c, v))).toBe(semPrefixoDeId(c, v));
    }
  });

  it("o lead do Lead Form casa com o ad_id do anúncio", () => {
    expect(utmContentEfetivo(semPrefixoDeId("utm_content", "ag:120249690395770208"))).toBe("120249690395770208");
    // sem tirar o prefixo, não casa — o defeito
    expect(utmContentEfetivo("ag:120249690395770208")).not.toBe("120249690395770208");
  });

  it("a tabela de utmContentEfetivo da 18.71 não muda", () => {
    expect(utmContentEfetivo("120247234266910489")).toBe("120247234266910489");
    expect(utmContentEfetivo("_120247234266910489")).toBe("120247234266910489");
    expect(utmContentEfetivo('{"co":"1202","url":"x","v":1}')).toBe("1202");
    expect(utmContentEfetivo('{"url":"x","v":1}')).toBe("");
    expect(utmContentEfetivo('{"org","org"}')).toBe("org");
    expect(utmContentEfetivo('{"a","b"}')).toBe('{"a","b"}');
    expect(utmContentEfetivo("{{ad.id}}")).toBe("");
    expect(utmContentEfetivo("   ")).toBe("");
  });
});
