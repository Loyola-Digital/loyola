import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Roda o bloco com `process.env.TZ = tz` e devolve o fuso de antes.
 * `process.env.TZ = undefined` grava a STRING "undefined" (que o Node lê como
 * UTC) e vazaria para os blocos seguintes — por isso o `delete`.
 */
function noFuso(tz: string) {
  let anterior: string | undefined;
  beforeAll(() => {
    anterior = process.env.TZ;
    process.env.TZ = tz;
  });
  afterAll(() => {
    if (anterior === undefined) delete process.env.TZ;
    else process.env.TZ = anterior;
  });
}
import { API_CONTRACT_VERSION } from "@loyola-x/shared";
import { readFileSync } from "node:fs";
import { diaDaCelula, janelaDoDashboard, lerAbaDeAplicacao } from "../routes/stage-application.js";
import {
  diarioDeAplicacoes,
  ehAplicacaoDaMeta,
  entraNaJanela,
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
  noFuso(tz);

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

  it("data que não existe vira o dia do rollover — o mesmo do `Date` (QA DATA-001)", () => {
    expect(diaDaCelula("31/02/2026")).toBe("2026-03-03");
    expect(diaDaCelula("29/02/2028")).toBe("2028-02-29");
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
    const lida = lerAbaDeAplicacao(dados, {}, "2026-10-21");
    const d = diarioDeAplicacoes(lida.aplicacoes);
    expect(Object.keys(d.dias)).toEqual(["2026-10-21"]);
    // As sem data continuam: `dentroDoPeriodo` deixa entrar.
    expect(d.semData.total).toBe(2);
    expect(resumir(lida.aplicacoes, []).aplicacoes).toBe(4);
  });
});

describe("Story 18.96 — a janela é a da Meta (QA REQ-001, DATA-002, TEST-001)", () => {
  it("7d terminando em 27/10 começa em 21/10: sete dias, hoje incluído (= /campaign-daily)", () => {
    expect(janelaDoDashboard(7, "2026-10-27")).toBe("2026-10-21");
    expect(janelaDoDashboard(1, "2026-10-27")).toBe("2026-10-27");
    expect(janelaDoDashboard(undefined, "2026-10-27")).toBeNull();
  });

  it("a aplicação de hoje − 7 fica FORA do 7d; a de hoje − 6 entra", () => {
    const dados = {
      headers: HEADERS,
      rows: [
        ["2026-10-20 23:59:59", "fora@x.com", "meta"],
        ["2026-10-21 00:00:01", "dentro@x.com", "meta"],
      ],
    };
    const lida = lerAbaDeAplicacao(dados, {}, janelaDoDashboard(7, "2026-10-27"));
    expect(lida.aplicacoes.map((a) => a.email)).toEqual(["dentro@x.com"]);
  });

  describe.each(["UTC", "America/Sao_Paulo"])("célula em UTC (TZ=%s)", (tz) => {
    noFuso(tz);

    it("corta pelo dia de Brasília — o mesmo dia da tabela, em qualquer fuso do processo", () => {
      // 01:30Z do dia 21 = 22:30 do dia 20 em Brasília → fora de uma janela que começa no 21.
      const dados = { headers: HEADERS, rows: [["2026-10-21T01:30:00Z", "z@x.com", "meta"]] };
      expect(lerAbaDeAplicacao(dados, {}, "2026-10-21").aplicacoes).toEqual([]);
      expect(lerAbaDeAplicacao(dados, {}, "2026-10-20").aplicacoes).toHaveLength(1);
      // Cortar pela meia-noite do PROCESSO só diverge da regra quando o processo
      // não está em Brasília — é a rodada TZ=UTC (o fuso de produção) que pega.
    });
  });

  it("sem dia, a linha entra (a regra de dentroDoPeriodo)", () => {
    expect(entraNaJanela(null, "2026-10-21")).toBe(true);
    expect(entraNaJanela("2026-10-20", null)).toBe(true);
    expect(entraNaJanela("2026-10-20", "2026-10-21")).toBe(false);
    expect(entraNaJanela("2026-10-21", "2026-10-21")).toBe(true);
  });

  it("o fio: o dashboard corta aplicações E vendas pela janela da régua do shared", () => {
    const rota = readFileSync(new URL("../routes/stage-application.ts", import.meta.url), "utf8");
    expect(rota).toContain("const inicio = janelaDoDashboard(q.data.days, businessToday());");
    expect(rota).toContain("if (!entraNaJanela(data ? diaDaCelula(bruto) : null, inicio)) return;");
    expect(rota).toContain("desde: inicio");
    // A régua antiga (hoje − days) não pode voltar.
    expect(rota).not.toMatch(/setDate\(de\.getDate\(\) - q\.data\.days\)/);
  });
});

describe("Story 18.96 — contrato (AC9)", () => {
  it("o campo novo subiu o contrato", () => {
    expect(API_CONTRACT_VERSION).toBeGreaterThanOrEqual(57);
  });
});
