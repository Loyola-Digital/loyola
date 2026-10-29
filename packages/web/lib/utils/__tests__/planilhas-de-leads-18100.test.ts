import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ColumnMapping,
  FunnelSpreadsheet,
  FunnelSpreadsheetData,
  FunnelSpreadsheetRow,
} from "@/lib/types/funnel-spreadsheet";
import {
  CAMPOS_DO_PONTO_4,
  CAMPOS_DOS_NOMES,
  ehFallbackSemLeads,
  escolherPlanilhasDeLeads,
  linhaSemPrefixoDeId,
  planilhasDeLeadsDaEtapa,
  unirAbasCruasDeLeads,
  unirPlanilhasDeLeads,
} from "@/lib/utils/planilhas-de-leads";
import { aggregateSpreadsheetByDate } from "@/lib/utils/funnel-metrics";
import { filterSheetRowsByDays } from "@/lib/utils/spreadsheet-filters";
import { countLeadsByOriginForAds } from "@/lib/utils/top-creatives";
import { contarLeadsDaPlanilha, type LeadsPorTemperatura } from "@/lib/utils/contagem-de-leads";
import { campanhasSemFormulario, leadsDaLp, lpsDaPlanilha, lpsParaOPixel } from "@/lib/utils/leads-da-lp";
import {
  CHAVE_SEM_LINK,
  montarLinhasDeLpPorUrl,
  type AnuncioDaLp,
  type LpPorAnuncio,
  type LpRow,
} from "@/lib/utils/lps-do-lancamento";

/**
 * Story 18.100 — várias planilhas de leads na mesma etapa (web).
 *
 * A fixture tem a forma da Captação Gratuita do dg-bf26 (29/10/2026): a aba do
 * formulário da LP (`n8n-leads-captacao`) e a do Lead Form da Meta
 * (`facebook-lead-form`). É a MESMA de
 * `packages/api/src/__tests__/planilhas-de-leads-18100.test.ts`: os números do
 * Top Criativos aqui e os leads por criativo lá têm que bater (18.89, AC3).
 */

const AD1 = "120249521398100208";
const AD2 = "120249690395770208";

interface Aba {
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
}

const N8N: Aba = {
  headers: ["data", "nome", "email", "source", "campaign", "content", "term"],
  mapping: { date: "data", email: "email", utm_source: "source", utm_campaign: "campaign", utm_content: "content", utm_term: "term" },
  rows: [
    ["28/10/2026", "A", "a@x.com", "meta", "120249521382590208", AD1, "x_hot_lpf"],
    ["29/10/2026", "B", "b@x.com", "meta", "120249521382590208", AD2, "x_hot_lpf"],
    ["29/10/2026", "", "", "meta", "120249521382590208", AD1, "x_hot_lpf"],
    ["29/10/2026", "C", "c@x.com", "ig", "dgbf26", AD1, ""],
  ],
};

const LEAD_FORM: Aba = {
  headers: [
    "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id",
    "campaign_name", "Nome completo", "email", "phone_number", "term_padrão", "source_padrão",
  ],
  mapping: {
    date: "created_time", name: "Nome completo", email: "email", phone: "phone_number",
    utm_source: "source_padrão", utm_medium: "adset_id", utm_content: "ad_id",
    utm_campaign: "campaign_id", utm_term: "term_padrão",
  },
  rows: [
    ["l1", "2026-10-29T05:48:26-05:00", `ag:${AD1}`, "ad18", "as:120249690395760208", "conj",
      "c:120249689901480208", "camp", "A", "a@x.com", "+55", "Facebook_x_hot_lpredirect|y|ad18", "meta"],
    ["l2", "2026-10-28T22:54:52-05:00", `ag:${AD2}`, "adv09", "as:120249690395760208", "conj",
      "c:120249688590340208", "camp", "", "", "+55", "Instagram_x_hot_lpredirect|y|adv09", "meta"],
  ],
};

/** O contorno n8n da P-4: as linhas do Lead Form gravadas no formato da n8n. */
const ABA_UNICA: Aba = {
  ...N8N,
  rows: [
    ...N8N.rows,
    ["29/10/2026", "A", "a@x.com", "meta", "120249689901480208", AD1, "Facebook_x_hot_lpredirect|y|ad18"],
    ["29/10/2026", "", "", "meta", "120249688590340208", AD2, "Instagram_x_hot_lpredirect|y|adv09"],
  ],
};

/** O que a rota `/data` devolve para a aba (`funnel-spreadsheets.ts:350-389`). */
function comoARota(aba: Aba): FunnelSpreadsheetData {
  const chaves = Object.keys(aba.mapping) as (keyof ColumnMapping)[];
  const rows: FunnelSpreadsheetRow[] = aba.rows.map((values) => {
    const named: FunnelSpreadsheetRow["named"] = {};
    for (const k of chaves) {
      const i = aba.headers.findIndex((h) => h.trim().toLowerCase() === aba.mapping[k]!.trim().toLowerCase());
      if (i >= 0) named[k] = values[i] ?? "";
    }
    return { values, named };
  });
  return { headers: aba.headers, rows, mapping: aba.mapping, totalRows: rows.length };
}

const planilha = (id: string, type: FunnelSpreadsheet["type"], createdAt: string) =>
  ({ id, type, createdAt }) as FunnelSpreadsheet;
const PN8N = planilha("808de374-9e61-419c-a3f9-7666455d9b8d", "leads", "2026-10-05T11:30:57.466Z");
const PFORM = planilha("91d17ca3-3670-492d-b465-096d85212a39", "leads", "2026-10-29T11:55:43.228Z");
const PVENDAS = planilha("b5c521b8-6c90-4749-8930-6b4ba818b0d8", "sales", "2026-10-05T11:31:46.531Z");

const uniao = (...abas: [FunnelSpreadsheet, Aba][]) =>
  unirPlanilhasDeLeads(abas.map(([p, a]) => ({ planilha: p, dados: comoARota(a) })))!;

/** Card Leads por dia (`use-crossed-funnel-metrics.ts`), sem janela. */
function cardPorDia(d: FunnelSpreadsheetData) {
  const mapa = aggregateSpreadsheetByDate(d.rows, !!d.mapping.utm_source, !!d.mapping.date);
  return Object.fromEntries(
    [...mapa].sort(([a], [b]) => (a < b ? -1 : 1)).map(([dia, v]) => [dia, v.leadsPagos + v.leadsOrg + v.leadsSemTrack]),
  );
}
const totalDoCard = (d: FunnelSpreadsheetData) => Object.values(cardPorDia(d)).reduce((a, b) => a + b, 0);
const topCriativos = (d: FunnelSpreadsheetData, grupo: string[]) =>
  countLeadsByOriginForAds(d.rows, grupo, !!d.mapping.utm_content, !!d.mapping.utm_source).leadsPagos;

describe("Story 18.100 — a escolha das planilhas (AC2)", () => {
  it("todas as `leads`, em createdAt e id, qualquer que seja a ordem de entrada", () => {
    const esperado = [PN8N.id, PFORM.id];
    expect(escolherPlanilhasDeLeads([PFORM, PVENDAS, PN8N]).map((p) => p.id)).toEqual(esperado);
    expect(escolherPlanilhasDeLeads([PN8N, PVENDAS, PFORM]).map((p) => p.id)).toEqual(esperado);
    // empate de createdAt: o id decide
    const b = planilha("b", "leads", "2026-01-01T00:00:00Z");
    const a = planilha("a", "leads", "2026-01-01T00:00:00Z");
    expect(escolherPlanilhasDeLeads([b, a]).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("sem `leads`, a primeira vinculada (AC6); sem nenhuma, vazio", () => {
    const outra = planilha("c", "custom", "2026-01-01T00:00:00Z");
    expect(escolherPlanilhasDeLeads([PVENDAS, outra]).map((p) => p.id)).toEqual([PVENDAS.id]);
    expect(ehFallbackSemLeads(escolherPlanilhasDeLeads([PVENDAS]))).toBe(true);
    expect(ehFallbackSemLeads(escolherPlanilhasDeLeads([PN8N]))).toBe(false);
    expect(escolherPlanilhasDeLeads([])).toEqual([]);
    expect(escolherPlanilhasDeLeads(undefined)).toEqual([]);
  });

  it("o ponto 4 e o ponto 5 usam a lista SEM fallback", () => {
    expect(planilhasDeLeadsDaEtapa([PVENDAS])).toEqual([]);
    expect(planilhasDeLeadsDaEtapa([PFORM, PN8N]).map((p) => p.id)).toEqual([PN8N.id, PFORM.id]);
  });
});

describe("Story 18.100 — a união do `named` (AC3, AC4a)", () => {
  it("concatena na ordem, sem prefixo de id, com o mapeamento de ALGUMA planilha", () => {
    const u = uniao([PN8N, N8N], [PFORM, LEAD_FORM]);
    expect(u.rows).toHaveLength(6);
    expect(u.totalRows).toBe(6);
    expect(u.headers).toEqual([]);
    expect(u.rows[4].named).toMatchObject({
      utm_content: AD1,
      utm_medium: "120249690395760208",
      utm_campaign: "120249689901480208",
      utm_source: "meta",
    });
    // a n8n não mapeia utm_medium; o Lead Form mapeia → a união mapeia
    expect(u.mapping.utm_medium).toBe("adset_id");
    expect(u.mapping.date).toBe("data");
  });

  it("enquanto alguma planilha não carregou, não há número (nada de parcial)", () => {
    expect(unirPlanilhasDeLeads([{ planilha: PN8N, dados: comoARota(N8N) }, { planilha: PFORM, dados: undefined }])).toBeUndefined();
    expect(unirPlanilhasDeLeads([])).toBeUndefined();
  });

  it("uma planilha só: mesmos cabeçalhos e mesmas linhas (AC6)", () => {
    const d = comoARota(N8N);
    const u = unirPlanilhasDeLeads([{ planilha: PN8N, dados: d }])!;
    expect(u.headers).toEqual(d.headers);
    expect(u.rows).toEqual(d.rows);
  });

  it("fallback (etapa sem `leads`): a planilha volta intacta, como hoje (AC6)", () => {
    const d = comoARota({ ...N8N, rows: [["29/10/2026", "x", "x@x.com", "meta", "c:1", "ag:2", ""]] });
    expect(unirPlanilhasDeLeads([{ planilha: PVENDAS, dados: d }])).toBe(d);
  });

  it("linhaSemPrefixoDeId não mexe na linha sem prefixo", () => {
    const r = comoARota(N8N).rows[0];
    expect(linhaSemPrefixoDeId(r)).toBe(r);
  });
});

describe("Story 18.100 — dedup de cada contador (AC3, P-5 opção b)", () => {
  it("a mesma pessoa, no mesmo dia e anúncio, nas duas planilhas → card 1, Top Criativos 1", () => {
    const form: Aba = { ...LEAD_FORM, rows: [{ ...LEAD_FORM.rows[0] }].map(() => {
      const r = [...LEAD_FORM.rows[0]];
      r[1] = "2026-10-28T10:00:00-05:00"; // 12:00 de 28/10 em Brasília, como a n8n
      return r;
    }) };
    const u = uniao([PN8N, { ...N8N, rows: [N8N.rows[0]] }], [PFORM, form]);
    expect(cardPorDia(u)).toEqual({ "2026-10-28": 1 });
    expect(topCriativos(u, [AD1])).toBe(1);
  });

  it("exemplo do @architect: n8n em 28/10 e Lead Form em 29/10 → card 2, Top Criativos 1", () => {
    const u = uniao([PN8N, { ...N8N, rows: [N8N.rows[0]] }], [PFORM, { ...LEAD_FORM, rows: [LEAD_FORM.rows[0]] }]);
    expect(cardPorDia(u)).toEqual({ "2026-10-28": 1, "2026-10-29": 1 });
    expect(topCriativos(u, [AD1])).toBe(1);
  });

  it("duas linhas sem e-mail, uma em cada planilha → 2 no card e 2 no Top Criativos", () => {
    const n8n = { ...N8N, rows: [["29/10/2026", "", "", "meta", "1", AD2, ""]] };
    const u = uniao([PN8N, n8n], [PFORM, { ...LEAD_FORM, rows: [LEAD_FORM.rows[1]] }]);
    expect(totalDoCard(u)).toBe(2);
    expect(topCriativos(u, [AD2])).toBe(2);
  });

  it("a união [A, B] dá o mesmo que uma aba única com A e B (P-4), no card e no Top Criativos", () => {
    const u = uniao([PN8N, N8N], [PFORM, LEAD_FORM]);
    const unica = uniao([PN8N, ABA_UNICA]);
    expect(cardPorDia(u)).toEqual(cardPorDia(unica));
    for (const g of [[AD1], [AD2], [AD1, AD2]]) expect(topCriativos(u, g)).toBe(topCriativos(unica, g));
  });

  it("entregar as planilhas em outra ordem dá a mesma ordem de união e os mesmos números", () => {
    const abas = new Map([[PN8N.id, N8N], [PFORM.id, LEAD_FORM]]);
    const via = (entrada: FunnelSpreadsheet[]) =>
      unirPlanilhasDeLeads(escolherPlanilhasDeLeads(entrada).map((p) => ({ planilha: p, dados: comoARota(abas.get(p.id)!) })))!;
    const a = via([PN8N, PFORM]);
    const b = via([PFORM, PN8N]);
    expect(b.rows).toEqual(a.rows);
    expect(cardPorDia(b)).toEqual(cardPorDia(a));
  });

  it("paridade com a API (mesma fixture): AD1 2, AD2 2, os dois 4; só a n8n 3", () => {
    const u = uniao([PN8N, N8N], [PFORM, LEAD_FORM]);
    expect(topCriativos(u, [AD1])).toBe(2);
    expect(topCriativos(u, [AD2])).toBe(2);
    expect(topCriativos(u, [AD1, AD2])).toBe(4);
    expect(topCriativos(uniao([PN8N, N8N]), [AD1, AD2])).toBe(3);
  });

  it("o lead do Lead Form de 22:54 −05:00 entra no card em 29/10 (AC5)", () => {
    const u = uniao([PFORM, { ...LEAD_FORM, rows: [LEAD_FORM.rows[1]] }]);
    expect(cardPorDia(u)).toEqual({ "2026-10-29": 1 });
  });
});

describe("Story 18.100 — card na janela do seletor (AC1, AC9)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T15:00:00-03:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("a Captação Gratuita soma as duas planilhas: 4 da n8n + os do Lead Form", () => {
    const so = uniao([PN8N, N8N]);
    const u = uniao([PN8N, N8N], [PFORM, LEAD_FORM]);
    const card = (d: FunnelSpreadsheetData) => {
      const mapa = aggregateSpreadsheetByDate(filterSheetRowsByDays(d, 90), !!d.mapping.utm_source, !!d.mapping.date);
      return [...mapa.values()].reduce((s, v) => s + v.leadsPagos + v.leadsOrg + v.leadsSemTrack, 0);
    };
    expect(card(so)).toBe(4);
    // a@x.com em outro dia (+1) e a linha sem e-mail (+1)
    expect(card(u)).toBe(6);
  });
});

describe("Story 18.100 — flags \"alguma planilha mapeia\" (AC6, S-2)", () => {
  it("uma planilha sem utm_source mapeado não faz as linhas da outra virarem sem track", () => {
    const semOrigem: Aba = {
      headers: ["data", "email", "content"],
      mapping: { date: "data", email: "email", utm_content: "content" },
      rows: [["29/10/2026", "z@x.com", AD1]],
    };
    const p = planilha("z", "leads", "2026-10-30T00:00:00Z");
    const u = uniao([PN8N, { ...N8N, rows: [N8N.rows[1]] }], [p, semOrigem]);
    const mapa = aggregateSpreadsheetByDate(u.rows, !!u.mapping.utm_source, !!u.mapping.date);
    expect(mapa.get("2026-10-29")).toMatchObject({ leadsPagos: 1, leadsOrg: 0, leadsSemTrack: 1 });
    // Só a planilha sem origem: tudo sem track, como hoje.
    const so = uniao([p, semOrigem]);
    const mapaSo = aggregateSpreadsheetByDate(so.rows, !!so.mapping.utm_source, !!so.mapping.date);
    expect(mapaSo.get("2026-10-29")).toMatchObject({ leadsPagos: 0, leadsSemTrack: 1 });
  });
});

describe("Story 18.100 — LP do Lead Form e pixel (AC4e, S-7)", () => {
  it("o texto `lpredirect` dá a LP `lpr` — a mesma do rótulo `LPR` da API", () => {
    const u = uniao([PN8N, N8N], [PFORM, LEAD_FORM]);
    expect([...lpsDaPlanilha(u.rows)].sort()).toEqual(["lpf", "lpr"]);
    // A API gera o rótulo pela mesma regex sobre o nome da campanha, e a tabela
    // de LPs junta por `lpName.toLowerCase()` (`useLpPerformanceData.ts:136`).
    const nomeDaCampanha = "dg-l01-bf26-nov-26_leads-form-captacao_2026-10-28_hot_cbo_vencedores-v2_lpredirect";
    const m = nomeDaCampanha.toLowerCase().match(/lp([a-z])/);
    expect(`LP${m![1].toUpperCase()}`.toLowerCase()).toBe("lpr");
  });

  it("as campanhas `_lpredirect` nunca somam pixel: a regex estrita não as lê como LP", () => {
    const campanhas = [
      { id: "lf1", name: "dg-l01-bf26-nov-26_leads-form-captacao_2026-10-28_hot_cbo_vencedores-v1_lpredirect" },
      { id: "lpf", name: "dg-l01-bf26-nov-26_leads-captacao_2026-10-15_hot_cbo_estaticos_lpf" },
    ];
    const u = uniao([PN8N, N8N], [PFORM, LEAD_FORM]);
    expect(campanhasSemFormulario(campanhas, lpsDaPlanilha(u.rows))).toEqual([]);
    expect(campanhasSemFormulario(campanhas, lpsDaPlanilha(uniao([PN8N, N8N]).rows))).toEqual([]);
  });

  it("LP sem formulário numa etapa de duas planilhas: só ela soma pixel", () => {
    const campanhas = [
      { id: "lpf", name: "x_hot_lpf" },
      { id: "lpb", name: "x_hot_lpb" },
    ];
    const u = uniao([PN8N, N8N], [PFORM, LEAD_FORM]);
    // lpf tem lead na planilha → não soma pixel; lpb não tem → soma.
    expect(campanhasSemFormulario(campanhas, lpsDaPlanilha(u.rows))).toEqual(["lpb"]);
  });
});

describe("Story 18.100 — ponto 4 pelo column_mapping, no layout comum (AC4d)", () => {
  const JANELA = { days: 90, hoje: "2026-10-29" };
  const contar = (abas: { headers: string[]; rows: string[][]; columnMapping: ColumnMapping | null }[]) => {
    const u = unirAbasCruasDeLeads(abas, CAMPOS_DO_PONTO_4);
    return contarLeadsDaPlanilha({ headers: u.headers, rows: u.rows }, { ...JANELA, colunaDeData: u.colunaDeData });
  };
  const aba = (a: Aba) => ({ headers: a.headers, rows: a.rows, columnMapping: a.mapping });

  it("a aba do Lead Form pelo mapeamento: anúncio de `ad_id` (sem `ag:`), origem de `source_padrão`", () => {
    const c = contar([aba(LEAD_FORM)]);
    expect(c.leads).toEqual({ [AD1]: 1, [AD2]: 1 });
    // A origem é provada pelo `leadsByLp` (o `leadsPagosPorAnuncio` não recebe
    // linha com `lpredirect`, AC4e/A-6): `meta` conta como paga…
    expect(c.leadsByLp.lpr?.total).toBe(2);
    // …e uma linha `ig` NÃO conta como paga por padrão (hoje, sem coluna de
    // origem, `isPaidRow` contaria toda linha como paga).
    const comIg = contar([{ ...aba(LEAD_FORM), rows: [LEAD_FORM.rows[0]].map((r) => {
      const n = [...r];
      n[12] = "ig";
      return n;
    }) }]);
    expect(comIg.leadsByLp.lpr).toBeUndefined();
    expect(comIg.leads[AD1]).toBe(1);
  });

  it("AC4e: o Lead Form entra na LP `lpr`, em `leads` e `terms`, e NÃO em `leadsPagosPorAnuncio`", () => {
    const c = contar([aba(N8N), aba(LEAD_FORM)]);
    const soN8n = contar([aba(N8N)]);
    expect(c.leadsByLp.lpr).toEqual({ hot: 2, cold: 0, total: 2 });
    expect(c.leadsByLp.lpf).toEqual(soN8n.leadsByLp.lpf);
    // A-6: igual ao da n8n sozinha
    expect(c.leadsPagosPorAnuncio).toEqual(soN8n.leadsPagosPorAnuncio);
    expect(c.leads[AD1]).toBe(4);
    expect(c.leads[AD2]).toBe(2);
    expect(c.terms[AD1]).toBe("hot");
    expect(c.totalLeads).toBe(6);
  });

  it("a regra é POR LINHA: a linha da n8n sem `lpredirect` num anúncio de Lead Form continua", () => {
    const AD3 = "120249690395780208"; // um anúncio que só existe no Lead Form…
    const form = { ...aba(LEAD_FORM), rows: [LEAD_FORM.rows[0]].map((r) => {
      const n = [...r];
      n[2] = `ag:${AD3}`;
      return n;
    }) };
    // …e uma linha da n8n (sem `lpredirect`) que caiu no mesmo anúncio
    const n8n = { ...aba(N8N), rows: [["29/10/2026", "D", "d@x.com", "meta", "1", AD3, "x_hot_lpf"]] };
    const c = contar([n8n, form]);
    expect(c.leadsPagosPorAnuncio[AD3]).toEqual({ hot: 1, cold: 0, total: 1 });
    expect(c.leads[AD3]).toBe(2);
  });

  it("exceção 7 do AC6: numa planilha só, a linha com `lpredirect` sai do modo URL e fica no `lpr`", () => {
    const c = contar([aba(LEAD_FORM)]);
    expect(c.leadsPagosPorAnuncio).toEqual({});
    expect(c.leadsByLp.lpr?.total).toBe(2);
  });

  describe("o Desempenho por LP nos dois modos (A-6)", () => {
    const anuncio = (adId: string, url: string | null): AnuncioDaLp => ({
      adId,
      campaignId: "c",
      campaignName: "camp_hot",
      temperature: "hot",
      url,
      lpKey: url ? url.replace(/^https?:\/\//, "").replace(/\/$/, "") : null,
      causa: url ? null : "sem_link_na_meta",
      spend: 100,
      impressions: 1000,
      clicks: 10,
      landingPageViews: 8,
      pixelLeads: 0,
      vendas: 0,
      faturamento: 0,
    });
    const CAPTURA_B = "https://lps.danilogato.com.br/dg-pg-l01-bf26-captura-b/";
    const SNDFLW = "https://sndflw.com/i/y6OX4mzLPW66EzwkQqjv";
    const AD_SEM_LINK = "120249690395790208";
    const lpPorAnuncio: LpPorAnuncio = {
      anuncios: [anuncio(AD1, CAPTURA_B), anuncio(AD2, SNDFLW), anuncio(AD_SEM_LINK, null)],
      campanhasSemDadoPorAnuncio: [],
    };
    const linhasUrl = (leadsPorAnuncio: Record<string, LeadsPorTemperatura>) =>
      montarLinhasDeLpPorUrl({ lpPorAnuncio, correcoes: {}, leadsPorAnuncio, publico: "todos", dataDoImposto: "2026-10-29" });
    const comSemLink = { ...aba(LEAD_FORM), rows: [...LEAD_FORM.rows, ["l3", "2026-10-29T08:00:00-05:00", `ag:${AD_SEM_LINK}`, "x", "as:1", "x", "c:1", "x", "E", "e@x.com", "+55", "x_hot_lpredirect", "meta"]] };

    it("modo URL: as linhas de página e o \"Sem link resolvido\" com os leads da n8n sozinha", () => {
      const comLeadForm = linhasUrl(contar([aba(N8N), comSemLink]).leadsPagosPorAnuncio);
      const soN8n = linhasUrl(contar([aba(N8N)]).leadsPagosPorAnuncio);
      const leadsPorLinha = (rows: LpRow[]) => Object.fromEntries(rows.map((r) => [r.lpKey, r.leads]));
      expect(leadsPorLinha(comLeadForm)).toEqual(leadsPorLinha(soN8n));
      // a n8n tem 2 pagos em AD1 (captura-b) e 1 em AD2 (sndflw)
      expect(comLeadForm.find((r) => r.lpKey === "lps.danilogato.com.br/dg-pg-l01-bf26-captura-b")?.leads).toBe(2);
      expect(comLeadForm.find((r) => r.lpKey === "sndflw.com/i/y6OX4mzLPW66EzwkQqjv")?.leads).toBe(1);
      expect(comLeadForm.find((r) => r.lpKey === CHAVE_SEM_LINK)?.leads ?? 0).toBe(0);
    });

    it("modo rótulo: a linha `LPR` da API casa com `lpr` e mostra os leads da planilha", () => {
      const c = contar([aba(N8N), aba(LEAD_FORM)]);
      // A chave da linha é `entry.lpName.toLowerCase()` (`useLpPerformanceData.ts:136`).
      const chave = "LPR".toLowerCase();
      expect(leadsDaLp(c.leadsByLp[chave], 7, "todos")).toEqual({ leads: 2, fonte: "planilha" });
      // Só com a n8n: a linha `LPR` existia pelo gasto, com o pixel (o defeito).
      expect(leadsDaLp(contar([aba(N8N)]).leadsByLp[chave], 7, "todos")).toEqual({ leads: 7, fonte: "pixel" });
    });
  });

  it("pixel: se só linhas com `lpredirect` marcam LP, nenhuma campanha soma pixel", () => {
    const campanhas = [{ id: "lpb", name: "x_hot_lpb" }];
    const soLeadForm = uniao([PN8N, { ...N8N, rows: [N8N.rows[3]] }], [PFORM, LEAD_FORM]);
    expect([...lpsDaPlanilha(soLeadForm.rows)]).toEqual(["lpr"]);
    expect([...lpsParaOPixel(soLeadForm.rows)]).toEqual([]);
    expect(campanhasSemFormulario(campanhas, lpsParaOPixel(soLeadForm.rows))).toEqual([]);
    // Com LP de verdade marcada (a n8n), o conjunto inteiro vale, com o `lpr`.
    const comN8n = uniao([PN8N, N8N], [PFORM, LEAD_FORM]);
    expect([...lpsParaOPixel(comN8n.rows)].sort()).toEqual(["lpf", "lpr"]);
    expect(campanhasSemFormulario(campanhas, lpsParaOPixel(comN8n.rows))).toEqual(["lpb"]);
  });

  it("a mesma pessoa nas duas planilhas, na mesma LP → 2 no Desempenho por LP (conta linhas)", () => {
    const form = { ...aba(LEAD_FORM), rows: [LEAD_FORM.rows[0]].map((r) => {
      const n = [...r];
      n[11] = "x_hot_lpf";
      return n;
    }) };
    const c = contar([{ ...aba(N8N), rows: [N8N.rows[0]] }, form]);
    expect(c.leadsByLp.lpf?.total).toBe(2);
  });

  it("campo ausente do mapeamento → a busca por cabeçalho de hoje", () => {
    const semTermo = { ...aba(N8N), columnMapping: { ...N8N.mapping, utm_term: undefined } };
    const c = contar([semTermo]);
    expect(c.leadsByLp.lpf?.total).toBe(3); // `term` achado pelo cabeçalho
  });

  it("planilha sem column_mapping → as posições de reserva 5/7 de hoje", () => {
    const headers = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const rows = [["", "", "", "", "", AD1, "", "x_lpc_cold"]];
    const c = contar([{ headers, rows, columnMapping: null }]);
    const hoje = contarLeadsDaPlanilha({ headers, rows }, { ...JANELA, colunaDeData: undefined });
    expect(c.leads).toEqual(hoje.leads);
    expect(c.leadsByLp).toEqual(hoje.leadsByLp);
    expect(c.leadsByLp.lpc).toEqual({ hot: 0, cold: 1, total: 1 });
  });

  it("uma planilha cujo mapeamento bate com o cabeçalho: o mesmo de hoje (AC6)", () => {
    const hoje = contarLeadsDaPlanilha({ headers: N8N.headers, rows: N8N.rows }, { ...JANELA, colunaDeData: "data" });
    const depois = contar([aba(N8N)]);
    expect(depois.leads).toEqual(hoje.leads);
    expect(depois.leadsByLp).toEqual(hoje.leadsByLp);
    expect(depois.leadsPagosPorAnuncio).toEqual(hoje.leadsPagosPorAnuncio);
    expect(depois.totalLeads).toBe(hoje.totalLeads);
  });

  it("C-T0-3: sem `date` mapeada, a data chega vazia mesmo com a coluna `data`", () => {
    const evento = {
      headers: ["NOME", "Ingresso", "EMAIL", "CPF", "EMPRESA", "PLACA", "TELEFONE", "CONVIDADO", "Email da venda", "data", "Tipo"],
      rows: [["P", "vip", "p@x.com", "1", "e", "ABC1234", "+55", "", "", "29/10/2026 10:00:00", "x"]],
      columnMapping: { name: "NOME", email: "EMAIL", phone: "TELEFONE" } as ColumnMapping,
    };
    // Com outra planilha que mapeia `date`: a do evento fica fora da janela (semData).
    const unida = contar([aba(N8N), evento]);
    expect(unida.totalLeads).toBe(4);
    expect(unida.janela.semData).toBe(1);
    // Sozinha, sem `date` mapeada: sem janela, como hoje.
    const so = contar([evento]);
    expect(so.janela.aplicada).toBe(false);
    expect(so.totalLeads).toBe(1);
    expect(unirAbasCruasDeLeads([evento], CAMPOS_DO_PONTO_4).headers).not.toContain("date");
  });

  it("o mapa de nomes não usa a reserva por posição (como nunca usou)", () => {
    const headers = ["a", "b", "c", "d", "e", "f", "Ad Name"];
    const u = unirAbasCruasDeLeads([{ headers, rows: [["", "", "", "", "", AD1, "nome"]], columnMapping: {} }], CAMPOS_DOS_NOMES);
    expect(u.headers).toEqual(["ad name"]);
    const comLeadForm = unirAbasCruasDeLeads([aba(LEAD_FORM)], CAMPOS_DOS_NOMES);
    expect(comLeadForm.headers).toEqual(["utm_content", "ad name"]);
    expect(comLeadForm.rows[0]).toEqual([AD1, "ad18"]);
  });
});
