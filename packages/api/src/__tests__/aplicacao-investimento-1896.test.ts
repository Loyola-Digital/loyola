import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_CONTRACT_VERSION } from "@loyola-x/shared";
import { diaDaCelula, lerAbaDeAplicacao } from "../routes/stage-application.js";
import {
  diarioDeAplicacoes,
  ehAplicacaoDaMeta,
  resumir,
  type AplicacaoDaEtapa,
} from "../services/etapa-de-aplicacao.js";

/**
 * Story 18.96 — aplicações por dia na etapa de Aplicação (AC8, AC9).
 *
 * O cabeçalho imita a aba do Tally do `dg-pg05-out-26` (18.92): `Submitted at`
 * vem como hora de parede SEM fuso (`2026-10-20 15:49:52`).
 */

const HEADERS = ["Submitted at", "email", "utm_source"];

describe.each(["UTC", "America/Sao_Paulo"])("Story 18.96 — o dia da célula (TZ=%s)", (tz) => {
  let anterior: string | undefined;
  beforeAll(() => {
    anterior = process.env.TZ;
    process.env.TZ = tz;
  });
  afterAll(() => {
    process.env.TZ = anterior;
  });

  it("controle: o fuso do processo mudou mesmo", () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(tz === "UTC" ? 0 : 180);
  });

  it("dd/mm/aaaa é o dia escrito — não a meia-noite do servidor convertida", () => {
    expect(diaDaCelula("20/10/2026")).toBe("2026-10-20");
    expect(diaDaCelula("5/1/2026 23:59")).toBe("2026-01-05");
  });

  it("aaaa-mm-dd com hora e sem fuso (o Tally) é o dia escrito, mesmo às 22h", () => {
    expect(diaDaCelula("2026-10-20 22:15:03")).toBe("2026-10-20");
    expect(diaDaCelula("2026-10-20")).toBe("2026-10-20");
  });

  it("instante com fuso explícito cai no dia de Brasília", () => {
    // 01:30Z do dia 21 = 22:30 do dia 20 em Brasília.
    expect(diaDaCelula("2026-10-21T01:30:00Z")).toBe("2026-10-20");
    expect(diaDaCelula("2026-10-20T22:30:00-03:00")).toBe("2026-10-20");
  });

  it("célula vazia ou ilegível não tem dia", () => {
    expect(diaDaCelula(undefined)).toBeNull();
    expect(diaDaCelula("")).toBeNull();
    expect(diaDaCelula("ontem")).toBeNull();
  });

  it("aplicação montada sem `dia` usa o dia de `data` em Brasília", () => {
    const a: AplicacaoDaEtapa = {
      email: "x@x.com",
      data: new Date("2026-10-21T01:30:00Z"),
      utmSource: "meta",
      utmMedium: "",
    };
    expect(Object.keys(diarioDeAplicacoes([a]).dias)).toEqual(["2026-10-20"]);
  });
});

describe("Story 18.96 — aplicação da Meta (P6)", () => {
  it("só `meta` e `meta-ads`, com trim e minúsculas", () => {
    expect(ehAplicacaoDaMeta("meta")).toBe(true);
    expect(ehAplicacaoDaMeta(" Meta-Ads ")).toBe(true);
    // O investimento é só Meta: Google não entra no denominador.
    expect(ehAplicacaoDaMeta("google-ads")).toBe(false);
    expect(ehAplicacaoDaMeta("instagram")).toBe(false);
    expect(ehAplicacaoDaMeta("")).toBe(false);
    expect(ehAplicacaoDaMeta(null)).toBe(false);
  });
});

describe("Story 18.96 — diário de aplicações (AC8)", () => {
  const dados = {
    headers: HEADERS,
    rows: [
      ["2026-10-20 09:00:00", "a@x.com", "meta"],
      ["2026-10-20 22:15:03", "b@x.com", "organico"],
      ["2026-10-21 10:00:00", "c@x.com", "meta-ads"],
      ["2026-10-21 11:00:00", "d@x.com", "google-ads"],
      // Sem data reconhecível: entra no período (e no card), mas em dia nenhum.
      ["", "e@x.com", "meta"],
      ["sei lá", "f@x.com", ""],
    ],
  };

  const { aplicacoes } = lerAbaDeAplicacao(dados, {}, null);
  const diario = diarioDeAplicacoes(aplicacoes);

  it("a leitura grava o dia junto com a data", () => {
    expect(aplicacoes.map((a) => a.dia)).toEqual([
      "2026-10-20",
      "2026-10-20",
      "2026-10-21",
      "2026-10-21",
      null,
      null,
    ]);
  });

  it("conta total e pagas por dia", () => {
    expect(diario.dias).toEqual({
      "2026-10-20": { total: 2, pagas: 1 },
      "2026-10-21": { total: 2, pagas: 1 },
    });
  });

  it("as sem data vão para o balde próprio, com a origem", () => {
    expect(diario.semData).toEqual({ total: 2, pagas: 1 });
  });

  it("Σ dias + sem data = o card Aplicações (`resumo.aplicacoes`)", () => {
    const soma =
      Object.values(diario.dias).reduce((s, d) => s + d.total, 0) + diario.semData.total;
    expect(soma).toBe(resumir(aplicacoes, []).aplicacoes);
    expect(soma).toBe(6);
  });

  it("o período que corta pela data também corta o dia (mesma linha, mesma decisão)", () => {
    const de21 = new Date(2026, 9, 21, 0, 0, 0, 0);
    const lida = lerAbaDeAplicacao(dados, {}, de21);
    const d = diarioDeAplicacoes(lida.aplicacoes);
    expect(Object.keys(d.dias)).toEqual(["2026-10-21"]);
    // As sem data continuam: `dentroDoPeriodo` deixa entrar.
    expect(d.semData.total).toBe(2);
    expect(resumir(lida.aplicacoes, []).aplicacoes).toBe(4);
  });
});

describe("Story 18.96 — contrato (AC9)", () => {
  it("o campo novo subiu o contrato", () => {
    expect(API_CONTRACT_VERSION).toBeGreaterThanOrEqual(57);
  });
});
