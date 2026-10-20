import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chavesDeLeadsPagosPorAnuncio,
  leadsPagosDoCriativo,
} from "../utils/leads-pagos-por-criativo.js";

/**
 * Story 18.89 — leads por criativo na rota `creative-performance`, pela regra
 * do Top Criativos.
 *
 * O caso do chamado (`fzl4-bf26` / Captação Gratuita, 19/10/2026):
 * `ad04-fz-l4-bf26--melhores-amigos` tem 4 anúncios com 5 + 20 + 6 + 8 linhas
 * pagas. A etapa não tem planilha de vendas `capture`, e a rota devolvia
 * `leads: 0` para todo criativo. A fixture reproduz a forma do caso, com uma
 * pessoa que entrou por dois dos anúncios → 38.
 */

const A = "120256585781700273"; // representante (`group.adIds[0]`)
const B = "120256585925960273";
const C = "120256647081630273";
const D = "120256647081750273";
const GRUPO = [A, B, C, D];

// Aba como a `n8n-leads-captacao`: email | source | content
const COL = { email: 0, utmSource: 1, utmContent: 2 };

function linhasDoAd04(): string[][] {
  const rows: string[][] = [];
  const add = (adId: string, n: number, p: string) => {
    for (let i = 0; i < n; i++) rows.push([`${p}${i}@x.com`, "meta", adId]);
  };
  add(A, 4, "a");
  rows.push(["repetida@x.com", "meta", A]);
  add(B, 19, "b");
  rows.push([" REPETIDA@x.com", "meta", B]); // mesma pessoa, em outro anúncio
  add(C, 6, "c");
  add(D, 8, "d");
  return rows;
}

describe("Story 18.89 — leads pagos por criativo (AC1)", () => {
  it("o ad04: 39 linhas em 4 anúncios, 1 e-mail em dois → 38", () => {
    const chaves = chavesDeLeadsPagosPorAnuncio(linhasDoAd04(), COL);
    expect(leadsPagosDoCriativo(chaves, GRUPO)).toBe(38);
    // O defeito do web: só o representante.
    expect(leadsPagosDoCriativo(chaves, [A])).toBe(5);
  });

  it("ig, vazio e `google` não contam; meta-ads e google-ads contam", () => {
    const rows = [
      ["m@x.com", "meta", A],
      ["ma@x.com", " Meta-Ads ", A],
      ["ga@x.com", "google-ads", B],
      ["g@x.com", "google", B],
      ["ig@x.com", "ig", C],
      ["v@x.com", "", C],
    ];
    expect(leadsPagosDoCriativo(chavesDeLeadsPagosPorAnuncio(rows, COL), GRUPO)).toBe(3);
  });

  it("linha sem e-mail conta 1; sem coluna de e-mail, cada linha conta 1", () => {
    const rows = [["", "meta", A], ["", "meta", B], ["x@x.com", "meta", B]];
    expect(leadsPagosDoCriativo(chavesDeLeadsPagosPorAnuncio(rows, COL), GRUPO)).toBe(3);
    const semEmail = chavesDeLeadsPagosPorAnuncio(rows, { ...COL, email: -1 });
    expect(leadsPagosDoCriativo(semEmail, GRUPO)).toBe(3);
  });

  it("`co=` no formato da planilha é lido como o ad_id (utmContentEfetivo)", () => {
    const rows = [["x@x.com", "meta", `_${A}`]];
    expect(leadsPagosDoCriativo(chavesDeLeadsPagosPorAnuncio(rows, COL), [A])).toBe(1);
  });

  it("sem `utm_source` ou `utm_content` mapeado → 0, como no Top Criativos", () => {
    expect(chavesDeLeadsPagosPorAnuncio(linhasDoAd04(), { ...COL, utmSource: -1 }).size).toBe(0);
    expect(chavesDeLeadsPagosPorAnuncio(linhasDoAd04(), { ...COL, utmContent: -1 }).size).toBe(0);
  });

  it("ad_id repetido na lista do grupo não conta duas vezes", () => {
    const chaves = chavesDeLeadsPagosPorAnuncio(linhasDoAd04(), COL);
    expect(leadsPagosDoCriativo(chaves, [...GRUPO, A, B])).toBe(38);
  });
});

/**
 * O fio da rota — prova pela reversão (AC8). Cada `it` cai se o trecho voltar
 * ao que era antes da story.
 */
describe("Story 18.89 — fio da rota creative-performance", () => {
  const rota = readFileSync(
    new URL("../routes/stage-creative-performance.ts", import.meta.url),
    "utf-8",
  );

  it("lê a aba de leads SEM exigir a planilha de vendas (AC3)", () => {
    // Mutação: voltar `if (leadsSheet && salesSheet)` → etapa sem vendas = 0 leads.
    expect(rota).not.toMatch(/if \(leadsSheet && salesSheet\)/);
    expect(rota).toMatch(/if \(leadsSheet\) \{/);
    expect(rota).toMatch(
      /salesSheet\s*\?\s*readSheetData\(salesSheet\.spreadsheetId, salesSheet\.sheetName\)\s*:\s*Promise\.resolve\(null\)/,
    );
  });

  it("conta pela regra desta story, nas linhas da janela, com a coluna de origem", () => {
    expect(rota).toMatch(
      /chavesPagasPorAnuncio = chavesDeLeadsPagosPorAnuncio\(leadsNaJanela\.linhas, \{\s*utmContent: leadUtmContentIdx,\s*utmSource: leadUtmSourceIdx,\s*email: leadEmailIdx,\s*\}\)/,
    );
    expect(rota).toMatch(/const leadUtmSourceIdx = findCol\(leadsData\.headers, leadsMapping\.utm_source\)/);
  });

  it("o criativo soma TODOS os anúncios do grupo, sem a contagem de linhas", () => {
    // Mutação: voltar `totalLeads += leadsAgg.count` → todas as linhas, sem dedup.
    expect(rota).toMatch(/const totalLeads = leadsPagosDoCriativo\(chavesPagasPorAnuncio, group\.adIds\)/);
    expect(rota).not.toMatch(/totalLeads \+= leadsAgg\.count/);
  });

  it("a resposta leva a lista de anúncios do criativo (AC4)", () => {
    expect(rota).toMatch(/adIds: \[\.\.\.new Set\(group\.adIds\)\]/);
  });

  it("o cache sobe para `:v5` (AC7)", async () => {
    const { VERSAO_DO_CACHE_CREATIVE_PERFORMANCE } = await import(
      "../routes/stage-creative-performance.js"
    );
    // Mutação: ficar em `:v4` → o cache de 2 h serve `leads: 0` depois do deploy.
    expect(Number(VERSAO_DO_CACHE_CREATIVE_PERFORMANCE.slice(1))).toBeGreaterThanOrEqual(5);
  });

  it("o contrato subiu com a linha de histórico (AC7, check 8)", () => {
    const contrato = readFileSync(
      new URL("../../../shared/src/contract.ts", import.meta.url),
      "utf-8",
    );
    expect(contrato).toMatch(/\/\/ v53 \(Story 18\.89/);
    const versao = Number(contrato.match(/export const API_CONTRACT_VERSION = (\d+);/)?.[1]);
    expect(versao).toBeGreaterThanOrEqual(53);
  });
});
