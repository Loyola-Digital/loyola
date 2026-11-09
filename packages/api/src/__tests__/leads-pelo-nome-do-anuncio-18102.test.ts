import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chaveDoNomeSeUnico, nomesQueIdentificamUmCriativo } from "@loyola-x/shared";
import {
  chavesDeLeadsPagosPorAnuncio,
  chavesDeLeadsPagosPorNome,
  leadsPagosDoCriativo,
} from "../utils/leads-pagos-por-criativo.js";

/**
 * Story 18.102 — a rota `creative-performance` conta também a linha cujo
 * `utm_content` é o NOME do anúncio (o caso do `bbe-m1-out26`: ~100 leads na
 * planilha, 1 na coluna Leads). Mesmos casos do teste do web, para as duas
 * pontas darem o mesmo número (AC4).
 */

// Aba como a do chamado: email | source | content
const COL = { email: 0, utmSource: 1, utmContent: 2 };
const AD01 = "ad01-bbe-m1-out26--ate-o-curso-entrou-em-promocao";
const ADV01 = "adv01-bbe-m1-out26--netao";
const AD04 = "ad04-bbe-m1-out26--caixinha-de-perguntas";
const ID_DO_AD01 = "120248715768060489";

/** Leads de cada grupo, com a unicidade calculada sobre TODOS os nomes. */
function contar(linhas: string[][], grupos: { nome: string; ids: string[] }[]): number[] {
  const porAnuncio = chavesDeLeadsPagosPorAnuncio(linhas, COL);
  const porNome = chavesDeLeadsPagosPorNome(porAnuncio);
  const unicos = nomesQueIdentificamUmCriativo(grupos.map((g) => g.nome));
  return grupos.map((g) =>
    leadsPagosDoCriativo(porAnuncio, g.ids, {
      chavesPorNome: porNome,
      chaveDoNome: chaveDoNomeSeUnico(g.nome, unicos),
    }),
  );
}

describe("Story 18.102 — leads pelo nome do anúncio na rota (AC4/AC6)", () => {
  it("o caso do chamado: ad01 com 5 linhas por nome + 1 por ID → 6", () => {
    const linhas = [
      ...["a", "b", "c", "d", "e"].map((p) => [`${p}@x.com`, "meta", AD01]),
      ["f@x.com", "meta", ID_DO_AD01],
    ];
    const [ad01] = contar(linhas, [{ nome: AD01, ids: [ID_DO_AD01] }]);
    expect(ad01).toBe(6);
    // O defeito: só por ad_id.
    expect(leadsPagosDoCriativo(chavesDeLeadsPagosPorAnuncio(linhas, COL), [ID_DO_AD01])).toBe(1);
  });

  it("(a)/(b)/(c)/(d): ID, nome, os dois com o mesmo e-mail, caixa e espaços", () => {
    const linhas = [
      ["a@x.com", "meta", ID_DO_AD01],
      [" A@x.com", "meta", AD01], // mesma pessoa por nome
      ["b@x.com", "meta", `  ${AD01.toUpperCase()} `],
    ];
    expect(contar(linhas, [{ nome: AD01, ids: [ID_DO_AD01] }])).toEqual([2]);
  });

  it("(e)/(f)/(g): outro criativo, origem não paga, vazio e macro não contam", () => {
    const linhas = [
      ["a@x.com", "meta", AD04],
      ["b@x.com", "ig", AD01],
      ["c@x.com", "meta", ""],
      ["d@x.com", "meta", "{{ad.name}}"],
    ];
    expect(contar(linhas, [{ nome: AD01, ids: ["1"] }, { nome: ADV01, ids: ["2"] }])).toEqual([0, 0]);
  });

  it("(h) a mesma pessoa em dois criativos → 1 em cada", () => {
    const linhas = [
      ["p@x.com", "meta", ADV01],
      ["p@x.com", "meta", AD04],
    ];
    expect(contar(linhas, [{ nome: ADV01, ids: ["1"] }, { nome: AD04, ids: ["2"] }])).toEqual([1, 1]);
  });

  it("(j) grupos que só diferem por maiúsculas → o nome não atribui; o ID atribui", () => {
    const grupos = [{ nome: "AD01", ids: ["1"] }, { nome: "ad01", ids: ["2"] }];
    expect(contar([["a@x.com", "meta", "ad01"]], grupos)).toEqual([0, 0]);
    expect(contar([["a@x.com", "meta", "2"]], grupos)).toEqual([0, 1]);
  });

  it("sem `pelonome`, a conta é a de antes (só por ad_id)", () => {
    const porAnuncio = chavesDeLeadsPagosPorAnuncio([["a@x.com", "meta", AD01]], COL);
    expect(leadsPagosDoCriativo(porAnuncio, ["1"])).toBe(0);
  });
});

describe("Story 18.102 — fio na rota e cache (AC4)", () => {
  const rota = readFileSync(
    new URL("../routes/stage-creative-performance.ts", import.meta.url),
    "utf8",
  );

  it("a rota monta o mapa por nome e passa a chave do nome ao contar o grupo", () => {
    expect(rota).toMatch(/chavesDeLeadsPagosPorNome\(chavesPagasPorAnuncio\)/);
    expect(rota).toMatch(/nomesQueIdentificamUmCriativo\(groupedByName\.keys\(\)\)/);
    expect(rota).toMatch(/chaveDoNome: chaveDoNomeSeUnico\(group\.adName, nomesUnicos\)/);
  });

  it("a versão do cache subiu para v8 (sem ela, 2 h de número antigo)", async () => {
    const { VERSAO_DO_CACHE_CREATIVE_PERFORMANCE } = await import(
      "../routes/stage-creative-performance.js"
    );
    expect(Number(VERSAO_DO_CACHE_CREATIVE_PERFORMANCE.slice(1))).toBeGreaterThanOrEqual(8);
  });
});
