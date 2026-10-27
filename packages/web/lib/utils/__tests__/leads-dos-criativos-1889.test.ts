import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  FunnelSpreadsheet,
  FunnelSpreadsheetData,
  FunnelSpreadsheetRow,
} from "@/lib/types/funnel-spreadsheet";
import {
  adIdsDoCriativo,
  aplicarLeadsDaPlanilha,
  escolherPlanilhaDeLeads,
} from "@/lib/utils/leads-dos-criativos";
import { enrichWithPaidLeads, type AggregatedCreative } from "@/lib/utils/top-creatives";
import { PAID_SOURCES } from "@/lib/utils/funnel-metrics";
import {
  ORIGENS_PAGAS_DE_LEAD,
  chaveDoLead,
  ehOrigemPagaDeLead,
} from "@loyola-x/shared/src/leads-pagos";

/**
 * Story 18.89 — a coluna Leads do Desempenho de Criativos pela conta do Top
 * Criativos.
 *
 * O caso do chamado (`fzl4-bf26` / Captação Gratuita, 90 dias, 19/10/2026):
 * `ad04-fz-l4-bf26--melhores-amigos` tem 4 anúncios, com 5 + 20 + 6 + 8 linhas
 * na aba de leads, todas `source = meta`. O Top Criativos mostrava 38; a tabela,
 * 5 — as linhas do representante da linha (`…81700273`), porque a aba não tem a
 * coluna "Ad Name". A fixture reproduz a forma: 39 linhas, UMA pessoa entrou
 * por dois dos anúncios → 38.
 */

const AD04 = {
  a: "120256585781700273", // representante (`group.adIds[0]`), 5 linhas
  b: "120256585925960273", // 20 linhas
  c: "120256647081630273", // 6 linhas
  d: "120256647081750273", // 8 linhas
};
const NOME = "ad04-fz-l4-bf26--melhores-amigos";

function linha(adId: string, source: string, email: string, data = "15/10/2026"): FunnelSpreadsheetRow {
  return {
    values: [email, source, adId, data],
    named: { email, utm_source: source, utm_content: adId, date: data },
  };
}

function planilha(rows: FunnelSpreadsheetRow[], semSource = false): FunnelSpreadsheetData {
  return {
    headers: ["email", "source", "content", "data"],
    rows,
    mapping: {
      email: "email",
      ...(semSource ? {} : { utm_source: "source" }),
      utm_content: "content",
      date: "data",
    },
    totalRows: rows.length,
  };
}

/** 5 + 20 + 6 + 8 linhas pagas; o e-mail `repetida@` está em `a` e em `b`. */
function linhasDoAd04(): FunnelSpreadsheetRow[] {
  const rows: FunnelSpreadsheetRow[] = [];
  const add = (adId: string, n: number, prefixo: string) => {
    for (let i = 0; i < n; i++) rows.push(linha(adId, "meta", `${prefixo}${i}@x.com`));
  };
  add(AD04.a, 4, "a");
  rows.push(linha(AD04.a, "meta", "repetida@x.com"));
  add(AD04.b, 19, "b");
  rows.push(linha(AD04.b, "meta", " Repetida@X.com ")); // mesma pessoa
  add(AD04.c, 6, "c");
  add(AD04.d, 8, "d");
  return rows;
}

const criativoDaApi = (over: Partial<{ adIds: string[]; leads: number }> = {}) => ({
  adId: AD04.a,
  adName: NOME,
  leads: over.leads ?? 0,
  ...(over.adIds ? { adIds: over.adIds } : {}),
});

const TODOS = [AD04.a, AD04.b, AD04.c, AD04.d];

describe("Story 18.89 — Leads do criativo somam TODOS os anúncios (AC1/AC2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T15:00:00-03:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("o ad04: 39 linhas pagas em 4 anúncios, 1 e-mail em dois → 38", () => {
    const [r] = aplicarLeadsDaPlanilha([criativoDaApi({ adIds: TODOS })], planilha(linhasDoAd04()), 90, {});
    // Mutação (o defeito): contar só o representante → 5.
    expect(r.leads).toBe(38);
    expect(r.leads).not.toBe(5);
  });

  it("é o MESMO número do Top Criativos (mesma planilha, janela e função)", () => {
    const p = planilha(linhasDoAd04());
    const [tabela] = aplicarLeadsDaPlanilha([criativoDaApi({ adIds: TODOS })], p, 90, {});
    const galeria = enrichWithPaidLeads(
      [{ ids: TODOS, spend: 967.03 } as unknown as AggregatedCreative],
      // a galeria recorta com `filterSheetRowsByDays` antes — 90 dias inclui tudo aqui
      p.rows,
      true,
      true,
    );
    expect(tabela.leads).toBe(galeria[0].leadsPagos);
  });

  it("não depende da coluna Ad Name: com `adIds` da API, o nome nem é consultado (AC2)", () => {
    const p = planilha(linhasDoAd04());
    const semNome = aplicarLeadsDaPlanilha([criativoDaApi({ adIds: TODOS })], p, 90, {});
    const comNome = aplicarLeadsDaPlanilha([criativoDaApi({ adIds: TODOS })], p, 90, {
      [AD04.a]: NOME,
      [AD04.b]: NOME,
      [AD04.c]: NOME,
      [AD04.d]: NOME,
    });
    expect(semNome[0].leads).toBe(38);
    expect(comNome[0].leads).toBe(38);
  });

  it("origens: ig, vazio e `google` não contam; meta-ads e google-ads contam (P3)", () => {
    const rows = [
      linha(AD04.a, "meta", "m@x.com"),
      linha(AD04.a, "META ", "m2@x.com"), // trim + minúsculas
      linha(AD04.b, "meta-ads", "ma@x.com"),
      linha(AD04.c, "google-ads", "ga@x.com"),
      linha(AD04.c, "google", "g@x.com"),
      linha(AD04.d, "ig", "ig@x.com"),
      linha(AD04.d, "", "vazio@x.com"),
    ];
    const [r] = aplicarLeadsDaPlanilha([criativoDaApi({ adIds: TODOS })], planilha(rows), 90, {});
    expect(r.leads).toBe(4);
  });

  it("linha sem e-mail conta 1 (não dá para deduplicar)", () => {
    const rows = [linha(AD04.a, "meta", ""), linha(AD04.b, "meta", ""), linha(AD04.b, "meta", "x@x.com")];
    const [r] = aplicarLeadsDaPlanilha([criativoDaApi({ adIds: TODOS })], planilha(rows), 90, {});
    expect(r.leads).toBe(3);
  });

  it("aba sem `utm_source` mapeado → 0 pagos, como no Top Criativos", () => {
    const [r] = aplicarLeadsDaPlanilha(
      [criativoDaApi({ adIds: TODOS, leads: 7 })],
      planilha(linhasDoAd04(), true),
      90,
      {},
    );
    expect(r.leads).toBe(0);
  });

  it("recorta pela janela do seletor (AC5): lead de 2 meses atrás sai em 30 dias", () => {
    const rows = [linha(AD04.a, "meta", "novo@x.com", "15/10/2026"), linha(AD04.b, "meta", "velho@x.com", "10/08/2026")];
    const p = planilha(rows);
    expect(aplicarLeadsDaPlanilha([criativoDaApi({ adIds: TODOS })], p, 30, {})[0].leads).toBe(1);
    expect(aplicarLeadsDaPlanilha([criativoDaApi({ adIds: TODOS })], p, 90, {})[0].leads).toBe(2);
  });
});

describe("Story 18.89 — API antiga (sem `adIds`) nunca cai em um anúncio só (AC4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T15:00:00-03:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("reconstrói o grupo pelos nomes resolvidos (planilha ou Meta) → 38", () => {
    const nomes = { [AD04.a]: NOME, [AD04.b]: NOME, [AD04.c]: ` ${NOME.toUpperCase()} `, [AD04.d]: NOME, "999": "outro" };
    expect(adIdsDoCriativo(criativoDaApi(), nomes)?.sort()).toEqual([...TODOS].sort());
    const [r] = aplicarLeadsDaPlanilha([criativoDaApi()], planilha(linhasDoAd04()), 90, nomes);
    expect(r.leads).toBe(38);
  });

  it("sem o nome do representante → mantém o número da API, não conta o representante sozinho", () => {
    const [r] = aplicarLeadsDaPlanilha([criativoDaApi({ leads: 11 })], planilha(linhasDoAd04()), 90, {});
    expect(adIdsDoCriativo(criativoDaApi(), {})).toBeNull();
    expect(r.leads).toBe(11);
  });

  it("sem planilha carregada → a lista volta intacta (o número da API)", () => {
    const entrada = [criativoDaApi({ adIds: TODOS, leads: 38 })];
    expect(aplicarLeadsDaPlanilha(entrada, undefined, 90, {})).toBe(entrada);
  });
});

describe("Story 18.89 — a mesma planilha nas duas telas", () => {
  const p = (id: string, type: FunnelSpreadsheet["type"]) => ({ id, type }) as FunnelSpreadsheet;

  it("a de `leads`; sem ela, a primeira vinculada; sem nenhuma, null", () => {
    expect(escolherPlanilhaDeLeads([p("v", "sales"), p("l", "leads")])?.id).toBe("l");
    expect(escolherPlanilhaDeLeads([p("v", "sales")])?.id).toBe("v");
    expect(escolherPlanilhaDeLeads([])).toBeNull();
    expect(escolherPlanilhaDeLeads(undefined)).toBeNull();
  });
});

describe("Story 18.89 — uma lista de origens pagas (AC1, P3)", () => {
  it("é a do shared, e o PAID_SOURCES do web é ela mesma (não uma cópia)", () => {
    expect([...ORIGENS_PAGAS_DE_LEAD].sort()).toEqual(["google-ads", "meta", "meta-ads"]);
    expect(PAID_SOURCES).toBe(ORIGENS_PAGAS_DE_LEAD);
  });

  it("ehOrigemPagaDeLead normaliza; chaveDoLead deduplica e-mail e separa linhas sem e-mail", () => {
    expect(ehOrigemPagaDeLead(" Meta-Ads ")).toBe(true);
    expect(ehOrigemPagaDeLead("google")).toBe(false);
    expect(ehOrigemPagaDeLead(undefined)).toBe(false);
    expect(chaveDoLead(" A@X.com ", 1)).toBe(chaveDoLead("a@x.com", 2));
    expect(chaveDoLead("", 1)).not.toBe(chaveDoLead("", 2));
    expect(chaveDoLead(null, 3)).toBe(chaveDoLead(undefined, 3));
  });

  it("nenhuma outra cópia da lista no web fora do shared (contagem-de-leads tinha `{meta, google}`)", () => {
    for (const arquivo of ["../contagem-de-leads.ts", "../funnel-metrics.ts", "../top-creatives.ts"]) {
      const src = readFileSync(new URL(arquivo, import.meta.url), "utf-8");
      expect(src, arquivo).not.toMatch(/new Set\(\s*\[\s*"meta"/);
    }
  });
});

describe("Story 18.89 — o fio do hook (prova pela reversão, AC8)", () => {
  const hook = readFileSync(new URL("../../hooks/useStageCreativePerformance.ts", import.meta.url), "utf-8");

  it("o hook conta pela função desta story", () => {
    expect(hook).toMatch(/aplicarLeadsDaPlanilha\(\s*taxed\.creatives,\s*planilhaDeLeads\.data,\s*days,\s*crossrefQuery\.adNameByContent,?\s*\)/);
    expect(hook).toMatch(/escolherPlanilhaDeLeads\(planilhasDaEtapa\.data\?\.spreadsheets\)/);
  });

  it("o fallback de um anúncio só não existe mais", () => {
    // Mutação: voltar `crossrefQuery.leads[creative.adId]` → este teste cai.
    expect(hook).not.toMatch(/crossrefQuery\.leads\[/);
    expect(hook).not.toMatch(/leadsByAdName/);
  });

  it("a galeria escolhe a planilha pela mesma função", () => {
    const galeria = readFileSync(
      new URL("../../../components/funnels/top-creatives-gallery.tsx", import.meta.url),
      "utf-8",
    );
    expect(galeria).toMatch(/escolherPlanilhaDeLeads\(spreadsheetsData\?\.spreadsheets\)/);
  });
});
