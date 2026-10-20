import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lerAbaDeAplicacao } from "../routes/stage-application.js";

/**
 * Story 18.92 — a etapa de Aplicação lê a aba do formulário do Tally.
 *
 * O cabeçalho imita a aba `Pesquisa-Aplicacao-Comercial` do `dg-pg05-out-26`
 * (lida em 20/10/2026): a data se chama `Submitted at` e o formulário repete
 * `email`/`utm_source` em um bloco por página, com um terceiro `E-mail`.
 */

const HEADERS = [
  "Submitted at",
  "Nome",
  "email",
  "utm_source",
  "utm_medium",
  "Nome (página 2)",
  "email",
  "utm_source",
  "utm_medium",
  "E-mail",
];

function linha(campos: Partial<Record<number, string>>): string[] {
  return HEADERS.map((_, i) => campos[i] ?? "");
}

const de20 = new Date(2026, 9, 20, 0, 0, 0, 0);

describe("Story 18.92 — leitura da aba de aplicação (AC8)", () => {
  it("`Submitted at` é a data: o período passa a valer nessa aba", () => {
    const dados = {
      headers: HEADERS,
      rows: [
        linha({ 0: "2026-10-20 15:49:52", 2: "hoje@x.com" }),
        linha({ 0: "2026-09-01 10:00:00", 2: "antiga@x.com" }),
      ],
    };
    const lida = lerAbaDeAplicacao(dados, {}, de20);
    expect(lida.semColuna).toEqual([]);
    expect(lida.aplicacoes.map((a) => a.email)).toEqual(["hoje@x.com"]);
    expect(lida.aplicacoes[0].data).not.toBeNull();
  });

  it("resposta só no 2º bloco não fica sem e-mail nem sem origem", () => {
    const dados = {
      headers: HEADERS,
      rows: [linha({ 0: "2026-10-20 15:49:52", 6: "Pagina2@X.com", 7: "fb", 8: "120247" })],
    };
    const [a] = lerAbaDeAplicacao(dados, {}, null).aplicacoes;
    expect(a.email).toBe("pagina2@x.com");
    expect(a.utmSource).toBe("fb");
    expect(a.utmMedium).toBe("120247");
  });

  it("resposta só no 3º bloco (`E-mail`) também tem e-mail", () => {
    const dados = { headers: HEADERS, rows: [linha({ 0: "2026-10-20 15:49:52", 9: "terceiro@x.com" })] };
    expect(lerAbaDeAplicacao(dados, {}, null).aplicacoes[0].email).toBe("terceiro@x.com");
  });

  it("com mais de um bloco preenchido, vale o primeiro valor não vazio", () => {
    const dados = {
      headers: HEADERS,
      rows: [linha({ 0: "2026-10-20 15:49:52", 2: "primeiro@x.com", 3: "ig", 6: "segundo@x.com", 7: "fb" })],
    };
    const [a] = lerAbaDeAplicacao(dados, {}, null).aplicacoes;
    expect(a.email).toBe("primeiro@x.com");
    expect(a.utmSource).toBe("ig");
  });

  it("coluna mapeada manda sozinha (é o caso do BBE): não procura as outras", () => {
    const dados = {
      headers: HEADERS,
      rows: [linha({ 0: "2026-10-20 15:49:52", 2: "bloco1@x.com", 9: "mapeada@x.com" })],
    };
    const [a] = lerAbaDeAplicacao(dados, { email: "E-mail" }, null).aplicacoes;
    expect(a.email).toBe("mapeada@x.com");
  });

  it("sem coluna de data nem de e-mail: diz quais faltaram (AC5/P4)", () => {
    const dados = { headers: ["Nome", "Telefone"], rows: [["Ana", "119"]] };
    const lida = lerAbaDeAplicacao(dados, {}, de20);
    expect(lida.semColuna).toEqual(["e-mail", "data"]);
    // Sem data a linha entra em todos os períodos — por isso o aviso existe.
    expect(lida.aplicacoes).toHaveLength(1);
  });
});

describe("Story 18.92 — o fio da rota (AC5, AC6)", () => {
  const rota = readFileSync(new URL("../routes/stage-application.ts", import.meta.url), "utf8");
  const pesquisas = readFileSync(new URL("../routes/google-sheets.ts", import.meta.url), "utf8");

  it("o dashboard lê cada aba pelo leitor novo", () => {
    expect(rota).toContain("lerAbaDeAplicacao(dados, s.columnMapping ?? {}, de)");
  });

  it("a pesquisa vinculada com o id da etapa conta no dashboard dela", () => {
    expect(rota).toContain("(s) => s.stageId === p.data.stageId || s.stageId === null");
    expect(pesquisas).toContain("stageId: body.data.stageId ?? null");
  });

  it("os avisos dizem qual coluna faltou e o efeito no número", () => {
    expect(rota).toContain(
      'Não achei a coluna de data na aba "${s.sheetName}": as aplicações dela entram em todos os períodos.',
    );
    expect(rota).toContain(
      'Não achei a coluna de e-mail na aba "${s.sheetName}": as aplicações dela não se cruzam com as vendas.',
    );
  });
});
