/**
 * A contagem de leads da planilha — o laço que saiu de `useCrossReferenceLeads`
 * para o teste provar a MESMA regra que o hook usa (Story 18.83/18.85).
 */

import { describe, expect, it } from "vitest";
import { contarLeadsDaPlanilha } from "@/lib/utils/contagem-de-leads";

const HEADERS = ["Nome", "E-mail", "utm_source", "utm_medium", "utm_campaign", "utm_content", "x", "utm_term"];
const linha = (source: string, content: string, term: string): string[] =>
  ["n", "e", source, "", "", content, "", term];

describe("contarLeadsDaPlanilha — leads pagos por anúncio (Story 18.83, AC4)", () => {
  const r = contarLeadsDaPlanilha({
    headers: HEADERS,
    rows: [
      linha("meta", "120247625370600489", "Instagram_Reels_bbe--hot--lpa|x|adv"),
      linha("meta", "120247625370600489", "Instagram_Reels_bbe--hot--lpa|x|adv"),
      linha("meta", "120247625370380489", "bbe--cold--lpa"),
      linha("ig", "120247625370380489", "bbe--cold--lpa"), // orgânico: não conta
      linha("meta", "", "bbe--hot--lpa"), // sem utm_content: sem anúncio
      linha("google", "_987", "sem-temperatura"), // `_` de texto forçado
    ],
  });

  it("conta só lead pago, por ad_id, com a temperatura do texto", () => {
    expect(r.leadsPagosPorAnuncio).toEqual({
      "120247625370600489": { hot: 2, cold: 0, total: 2 },
      "120247625370380489": { hot: 0, cold: 1, total: 1 },
      "987": { hot: 0, cold: 0, total: 1 },
    });
  });

  it("a regra do rótulo (lpX no texto) continua igual para a API antiga", () => {
    expect(r.leadsByLp).toEqual({ lpa: { hot: 3, cold: 1, total: 4 } });
  });

  it("`leads` por ad_id segue contando pagos e orgânicos (tabela de Criativos)", () => {
    expect(r.leads["120247625370380489"]).toBe(2);
    expect(r.totalLeads).toBe(5);
  });

  it("planilha vazia não quebra", () => {
    expect(contarLeadsDaPlanilha(undefined).totalLeads).toBe(0);
    expect(contarLeadsDaPlanilha({ headers: HEADERS, rows: [] }).leadsPagosPorAnuncio).toEqual({});
  });
});
