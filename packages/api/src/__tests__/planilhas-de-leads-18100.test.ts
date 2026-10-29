import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import type { Database } from "../db/client.js";
import {
  consultaDasPlanilhasDeLeads,
  lerPlanilhasDeLeads,
  unirPlanilhasDeLeadsLidas,
  type PlanilhaDeLeads,
} from "../utils/planilhas-de-leads.js";
import {
  chavesDeLeadsPagosPorAnuncio,
  leadsPagosDoCriativo,
} from "../utils/leads-pagos-por-criativo.js";
import { semPrefixoDeId, diaDoInstante, remapearParaLayoutComum } from "@loyola-x/shared";
import { saleDayKey } from "../utils/sale-date.js";
import { recortarLinhasPelaJanela } from "../utils/janela-das-linhas.js";

/**
 * Story 18.100 (AC7) — a API lê TODAS as planilhas `leads` da etapa, no layout
 * comum, sem o prefixo de id do Lead Form.
 *
 * A fixture tem a forma da Captação Gratuita do dg-bf26 (29/10/2026): a aba do
 * formulário da LP (`n8n-leads-captacao`) e a do Lead Form da Meta
 * (`facebook-lead-form`, cabeçalhos `ad_id`, `source_padrão`, `term_padrão`,
 * ids com `c:`/`as:`/`ag:`, data ISO com −05:00). A MESMA fixture está em
 * `packages/web/lib/utils/__tests__/planilhas-de-leads-18100.test.ts`, e os
 * dois lados chegam aos mesmos números (paridade da 18.89, AC3).
 */

const AD1 = "120249521398100208";
const AD2 = "120249690395770208";

const N8N = {
  planilha: {
    id: "808de374-9e61-419c-a3f9-7666455d9b8d",
    label: "Leads",
    columnMapping: {
      date: "data",
      email: "email",
      utm_source: "source",
      utm_campaign: "campaign",
      utm_content: "content",
      utm_term: "term",
    },
  },
  dados: {
    headers: ["data", "nome", "email", "source", "campaign", "content", "term"],
    rows: [
      ["28/10/2026", "A", "a@x.com", "meta", "120249521382590208", AD1, "x_hot_lpf"],
      ["29/10/2026", "B", "b@x.com", "meta", "120249521382590208", AD2, "x_hot_lpf"],
      ["29/10/2026", "", "", "meta", "120249521382590208", AD1, "x_hot_lpf"],
      ["29/10/2026", "C", "c@x.com", "ig", "dgbf26", AD1, ""],
    ],
  },
};

const LEAD_FORM = {
  planilha: {
    id: "91d17ca3-3670-492d-b465-096d85212a39",
    label: "Leads Form",
    columnMapping: {
      date: "created_time",
      name: "Nome completo",
      email: "email",
      phone: "phone_number",
      utm_source: "source_padrão",
      utm_medium: "adset_id",
      utm_content: "ad_id",
      utm_campaign: "campaign_id",
      utm_term: "term_padrão",
    },
  },
  dados: {
    headers: [
      "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id",
      "campaign_name", "Nome completo", "email", "phone_number", "term_padrão", "source_padrão",
    ],
    rows: [
      // a@x.com já está na n8n, no MESMO anúncio, em outro dia (exemplo do @architect)
      ["l1", "2026-10-29T05:48:26-05:00", `ag:${AD1}`, "ad18", "as:120249690395760208", "conj",
        "c:120249689901480208", "camp", "A", "a@x.com", "+55", "Facebook_x_hot_lpredirect|y|ad18", "meta"],
      // sem e-mail; 22:54 em −05:00 é 00:54 de 29/10 em Brasília
      ["l2", "2026-10-28T22:54:52-05:00", `ag:${AD2}`, "adv09", "as:120249690395760208", "conj",
        "c:120249688590340208", "camp", "", "", "+55", "Instagram_x_hot_lpredirect|y|adv09", "meta"],
    ],
  },
};

/** O contorno n8n da P-4: as linhas do Lead Form gravadas no formato da n8n. */
const ABA_UNICA = {
  planilha: N8N.planilha,
  dados: {
    headers: N8N.dados.headers,
    rows: [
      ...N8N.dados.rows,
      ["29/10/2026", "A", "a@x.com", "meta", "120249689901480208", AD1, "Facebook_x_hot_lpredirect|y|ad18"],
      ["29/10/2026", "", "", "meta", "120249688590340208", AD2, "Instagram_x_hot_lpredirect|y|adv09"],
    ],
  },
};

const idx = (headers: string[], campo: string) => headers.indexOf(campo);
function leadsPagosNaUniao(uniao: ReturnType<typeof unirPlanilhasDeLeadsLidas>, grupo: string[]) {
  const chaves = chavesDeLeadsPagosPorAnuncio(uniao.rows, {
    utmContent: idx(uniao.headers, "utm_content"),
    utmSource: idx(uniao.headers, "utm_source"),
    email: idx(uniao.headers, "email"),
  });
  return leadsPagosDoCriativo(chaves, grupo);
}

describe("Story 18.100 — semPrefixoDeId pelo índice do shared (AC4a)", () => {
  it("cada prefixo só na sua coluna, só com id numérico, idempotente", () => {
    expect(semPrefixoDeId("utm_campaign", "c:120249689901480208")).toBe("120249689901480208");
    expect(semPrefixoDeId("utm_medium", "as:120249690395760208")).toBe("120249690395760208");
    expect(semPrefixoDeId("utm_content", `ag:${AD1}`)).toBe(AD1);
    expect(semPrefixoDeId("utm_content", `as:${AD1}`)).toBe(`as:${AD1}`);
    expect(semPrefixoDeId("utm_content", "ag:abc")).toBe("ag:abc");
    expect(semPrefixoDeId("utm_term", `ag:${AD1}`)).toBe(`ag:${AD1}`);
    const uma = semPrefixoDeId("utm_content", `ag:${AD1}`);
    expect(semPrefixoDeId("utm_content", uma)).toBe(uma);
  });
});

describe("Story 18.100 — o util da API (AC7)", () => {
  it("as planilhas saem em ORDER BY created_at, id (AC2)", () => {
    // `drizzle.mock()` monta o SQL sem conexão; só o `$client` difere do tipo real.
    const db = drizzle.mock({ schema }) as unknown as Database;
    const { sql, params } = consultaDasPlanilhasDeLeads(db, "16be180c-eebb-4f7e-8b73-f2186b2b792f").toSQL();
    expect(sql).toMatch(/order by "funnel_spreadsheets"\."created_at" asc, "funnel_spreadsheets"\."id" asc$/);
    expect(sql).not.toMatch(/limit/i);
    expect(params).toEqual(["16be180c-eebb-4f7e-8b73-f2186b2b792f", "leads"]);
  });

  it("une as duas no layout comum, cada uma pelo SEU mapeamento, sem prefixo", () => {
    const u = unirPlanilhasDeLeadsLidas([N8N, LEAD_FORM]);
    expect(u.headers).toEqual(["email", "date", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]);
    expect(u.rows).toHaveLength(6);
    // A n8n não mapeia utm_medium: a célula chega vazia.
    expect(u.rows[0]).toEqual(["a@x.com", "28/10/2026", "meta", "", "120249521382590208", AD1, "x_hot_lpf"]);
    // O Lead Form pela coluna mapeada (`ad_id`, `source_padrão`…), sem `c:`/`as:`/`ag:`.
    expect(u.rows[4]).toEqual([
      "a@x.com", "2026-10-29T05:48:26-05:00", "meta", "120249690395760208",
      "120249689901480208", AD1, "Facebook_x_hot_lpredirect|y|ad18",
    ]);
    expect(u.columnMapping).toEqual(Object.fromEntries(u.headers.map((h) => [h, h])));
    expect(u.fontes).toEqual([
      { id: N8N.planilha.id, label: "Leads", linhas: 4 },
      { id: LEAD_FORM.planilha.id, label: "Leads Form", linhas: 2 },
    ]);
  });

  it("lê na ordem recebida, por readSheetData", async () => {
    const lidas: string[] = [];
    const ler = async (id: string, aba: string) => {
      lidas.push(`${id}/${aba}`);
      return id === "s-n8n" ? N8N.dados : LEAD_FORM.dados;
    };
    const planilhas = [
      { ...N8N.planilha, spreadsheetId: "s-n8n", sheetName: "n8n-leads-captacao" },
      { ...LEAD_FORM.planilha, spreadsheetId: "s-form", sheetName: "facebook-lead-form" },
    ] as unknown as PlanilhaDeLeads[];
    const u = await lerPlanilhasDeLeads(planilhas, ler);
    expect(lidas).toEqual(["s-n8n/n8n-leads-captacao", "s-form/facebook-lead-form"]);
    expect(u.rows).toHaveLength(6);
  });

  it("uma planilha só: as mesmas colunas que o findCol de hoje achava (AC6)", () => {
    const u = unirPlanilhasDeLeadsLidas([N8N]);
    for (const campo of ["email", "date", "utm_source", "utm_content", "utm_term"] as const) {
      const hoje = N8N.dados.headers.indexOf(N8N.planilha.columnMapping[campo]);
      expect(u.rows.map((r) => r[idx(u.headers, campo)]), campo).toEqual(N8N.dados.rows.map((r) => r[hoje]));
    }
    expect(u.headers).not.toContain("utm_medium");
  });
});

describe("Story 18.100 — leads por criativo da união (AC3, ponto 6)", () => {
  it("o lead do Lead Form casa com o anúncio; a mesma pessoa no mesmo anúncio conta 1", () => {
    const u = unirPlanilhasDeLeadsLidas([N8N, LEAD_FORM]);
    // AD1: a@x.com (n8n e Lead Form → 1) + a linha sem e-mail da n8n → 2.
    expect(leadsPagosNaUniao(u, [AD1])).toBe(2);
    // AD2: b@x.com + a linha sem e-mail do Lead Form → 2.
    expect(leadsPagosNaUniao(u, [AD2])).toBe(2);
    // As duas linhas sem e-mail, uma em cada planilha, contam 2 (índice único).
    expect(leadsPagosNaUniao(u, [AD1, AD2])).toBe(4);
    // Só a n8n: o Lead Form fica de fora (o defeito).
    expect(leadsPagosNaUniao(unirPlanilhasDeLeadsLidas([N8N]), [AD1, AD2])).toBe(3);
  });

  it("a união [A, B] dá o mesmo que uma aba única com A e B (P-4)", () => {
    const uniao = unirPlanilhasDeLeadsLidas([N8N, LEAD_FORM]);
    const unica = unirPlanilhasDeLeadsLidas([ABA_UNICA]);
    for (const grupo of [[AD1], [AD2], [AD1, AD2]]) {
      expect(leadsPagosNaUniao(uniao, grupo), grupo.join()).toBe(leadsPagosNaUniao(unica, grupo));
    }
  });

  it("a janela da rota põe o lead de 22:54 −05:00 em 29/10 (AC5, saleDayKey)", () => {
    const u = unirPlanilhasDeLeadsLidas([N8N, LEAD_FORM]);
    const dataIdx = idx(u.headers, "date");
    expect(saleDayKey(u.rows[5][dataIdx])).toBe("2026-10-29");
    const soDia29 = recortarLinhasPelaJanela(u.rows, dataIdx, 1, "2026-10-29");
    // 3 da n8n em 29/10 + as 2 do Lead Form (07:48 e 00:54 de 29/10 em Brasília);
    // a de 28/10 fica fora.
    expect(soDia29.linhas).toHaveLength(5);
    expect(soDia29.linhas).not.toContain(u.rows[0]);
  });
});

describe("Story 18.100 — saleDayKey chama diaDoInstante sem mudar a saída (AC5)", () => {
  const casos: [string, string | null][] = [
    ["2026-10-29T22:30:00-05:00", "2026-10-30"],
    ["2026-10-29T05:48:26-05:00", "2026-10-29"],
    ["2026-07-21T01:18:00Z", "2026-07-20"],
    ["2026-07-12T23:50:33.624Z", "2026-07-12"],
    ["2026-04-15T17:35:10.016-03:00", "2026-04-15"],
    ["2026-10-29T22:30:00-0500", "2026-10-30"],
    ["29/10/2026", "2026-10-29"],
    ["24/05/2026 20:12:38", "2026-05-24"],
    ["2026-10-29", "2026-10-29"],
    ["", null],
    ["lixo", null],
  ];
  it.each(casos)("saleDayKey(%j) = %j, e o mesmo que o `new Date` de antes", (raw, esperado) => {
    expect(saleDayKey(raw)).toBe(esperado);
    const viaDate = (() => {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    })();
    if (diaDoInstante(raw) && viaDate) {
      const antes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(viaDate);
      expect(diaDoInstante(raw)).toBe(antes);
    }
  });

  it("ISO sem fuso segue pelo `new Date` (fora do escopo, P-1)", () => {
    expect(diaDoInstante("2026-08-27 01:30:00")).toBeNull();
  });
});

describe("Story 18.100 — remapearParaLayoutComum pela API (bare import, 19.14)", () => {
  it("chega como função pelo índice do shared", () => {
    expect(typeof remapearParaLayoutComum).toBe("function");
  });
});

describe("Story 18.100 — o fio das rotas (AC7)", () => {
  const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf-8");
  const desempenho = ler("../routes/stage-creative-performance.ts");
  const receita = ler("../routes/creative-revenue.ts");
  const util = ler("../utils/planilhas-de-leads.ts");

  it("ponto 6: todas as planilhas `leads`, pelo util; nada de `.limit(1)` na de leads", () => {
    expect(desempenho).toMatch(/const planilhasDeLeads = await buscarPlanilhasDeLeads\(fastify\.db, stageId\);/);
    expect(desempenho).toMatch(/lerPlanilhasDeLeads\(planilhasDeLeads\)/);
    expect(desempenho).toMatch(/const leadsMapping = leadsData\.columnMapping as/);
    expect(desempenho).not.toMatch(/eq\(funnelSpreadsheets\.type, "leads"\)/);
  });

  it("ponto 7: todas as planilhas `leads`, pelo util; vazio sem leads ou sem vendas", () => {
    expect(receita).toMatch(/const planilhasDeLeads = await buscarPlanilhasDeLeads\(fastify\.db, params\.data\.stageId\);/);
    expect(receita).toMatch(/if \(planilhasDeLeads\.length === 0 \|\| !salesSheet\) \{/);
    expect(receita).toMatch(/lerPlanilhasDeLeads\(planilhasDeLeads\)/);
    expect(receita).toMatch(/const leadsMapping = leadsData\.columnMapping as/);
    expect(receita).not.toMatch(/eq\(funnelSpreadsheets\.type, "leads"\)/);
  });

  it("o util importa o shared SÓ pelo índice (boot pelo dist, 19.14)", () => {
    expect(util).toMatch(/from "@loyola-x\/shared";/);
    expect(util).not.toMatch(/@loyola-x\/shared\/src/);
    expect(ler("../utils/sale-date.ts")).not.toMatch(/@loyola-x\/shared\/src/);
  });
});

describe("Story 18.100 — ponto 7, caminho legado: o lead só na segunda planilha (AC7)", () => {
  it("a união acha e-mail e anúncio do lead do Lead Form pelo mapeamento canônico", () => {
    // O laço legado (`creative-revenue.ts`) acha as colunas por
    // `findCol(leadsData.headers, leadsMapping.email/utm_content)`. Com a união,
    // o `leadsMapping` é o canônico — e o lead que só existe no Lead Form chega
    // com e-mail e anúncio (sem `ag:`), então a venda dele é atribuível.
    const u = unirPlanilhasDeLeadsLidas([
      { ...N8N, dados: { ...N8N.dados, rows: N8N.dados.rows.filter((r) => r[2] !== "a@x.com") } },
      LEAD_FORM,
    ]);
    const findCol = (headers: string[], name: string | undefined) =>
      name ? headers.findIndex((h) => h.trim().toLowerCase() === name.trim().toLowerCase()) : -1;
    const emailIdx = findCol(u.headers, u.columnMapping.email);
    const adIdx = findCol(u.headers, u.columnMapping.utm_content);
    const doComprador = u.rows.find((r) => r[emailIdx] === "a@x.com");
    expect(doComprador?.[adIdx]).toBe(AD1);
  });
});
