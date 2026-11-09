import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  FunnelSpreadsheetData,
  FunnelSpreadsheetRow,
} from "@/lib/types/funnel-spreadsheet";
import { aplicarLeadsDaPlanilha } from "@/lib/utils/leads-dos-criativos";
import {
  countLeadsByOriginForAds,
  enrichWithPaidLeads,
  type AggregatedCreative,
} from "@/lib/utils/top-creatives";
import {
  chaveDoNomeSeUnico,
  nomesQueIdentificamUmCriativo,
  utmContentEhONomeDoCriativo,
} from "@loyola-x/shared/src/leads-pagos";

/**
 * Story 18.102 — leads do criativo também quando o `utm_content` traz o NOME
 * do anúncio.
 *
 * O caso do chamado (BBE M1 › Captação Gratuita, 09/11/2026): os anúncios do
 * `bbe-m1-out26` saíram com `utm_content={{ad.name}}`. A planilha tinha ~100
 * leads e a coluna Leads mostrava 1 — a única linha que veio com o ad_id.
 */

const AD01 = "ad01-bbe-m1-out26--ate-o-curso-entrou-em-promocao";
const ADV01 = "adv01-bbe-m1-out26--netao";
const AD04 = "ad04-bbe-m1-out26--caixinha-de-perguntas";
const AD02 = "ad02-bbe-m1-out26--cupom-fiscal";
const AD03 = "ad03-bbe-m1-out26--qual-e-o-seu-ponto";
const AD05 = "ad05-bbe-m1-out26--conversa-no-whatsapp";
const ADV02 = "adv02-bbe-m1-out26--netao";

/** O ad_id real da única linha que veio com o padrão por ID. */
const ID_DO_AD01 = "120248715768060489";

function linha(content: string, source: string, email: string, data = "08/11/2026 10:00"): FunnelSpreadsheetRow {
  return {
    values: [email, "", "", source, content, "", "", data],
    named: { email, utm_source: source, utm_content: content, date: data },
  };
}

function planilha(rows: FunnelSpreadsheetRow[]): FunnelSpreadsheetData {
  return {
    headers: ["email", "telefone", "campaign", "source", "content", "medium", "term", "data"],
    rows,
    mapping: {
      email: "email",
      utm_campaign: "campaign",
      utm_source: "source",
      utm_content: "content",
      utm_medium: "medium",
      utm_term: "term",
      date: "data",
    },
    totalRows: rows.length,
  };
}

/**
 * AC7 — as 20 primeiras linhas reais da planilha (ordem e `content`
 * preservados, e-mails trocados) + a última, a única com o ad_id. A pessoa
 * `p14` entrou por dois criativos (adv01 e ad04), como na planilha.
 */
function amostraReal(): FunnelSpreadsheetRow[] {
  const seq = [
    AD04, AD04, AD04, ADV01, AD04, AD05, AD01, AD01, ADV01, AD01,
    ADV01, ADV01, AD02, ADV01, AD04, ADV01, AD01, AD01, ADV01, AD03,
  ];
  const rows = seq.map((content, i) =>
    linha(content, "meta", i === 14 ? "p13@exemplo.com" : `p${i}@exemplo.com`),
  );
  rows.push(linha(ID_DO_AD01, "meta", "p20@exemplo.com", "2026-11-09"));
  return rows;
}

/** Os criativos como a rota devolve: uma linha por nome, com os ad_ids. */
const daApi = (adName: string, adIds: string[]) => ({ adId: adIds[0], adName, adIds, leads: 0 });
const CRIATIVOS = [
  daApi(ADV01, ["900000000000000001", "900000000000000002"]),
  daApi(AD01, [ID_DO_AD01, "900000000000000011"]),
  daApi(ADV02, ["900000000000000021"]),
  daApi(AD04, ["900000000000000031"]),
  daApi(AD02, ["900000000000000041"]),
  daApi(AD03, ["900000000000000051"]),
  daApi(AD05, ["900000000000000061"]),
];

const leadsPorNome = (lista: { adName: string; leads: number }[]) =>
  Object.fromEntries(lista.map((c) => [c.adName, c.leads]));

/** Um card do Top Criativos — só os campos que a contagem lê. */
const card = (name: string, ids: string[]) =>
  ({ name, ids, spend: 100 }) as unknown as AggregatedCreative;

describe("Story 18.102 — o dado real do bbe-m1-out26 (AC2/AC7)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T12:00:00-03:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("ad01 sai de 1 para 6; cada criativo conta as suas linhas com o nome", () => {
    const r = leadsPorNome(aplicarLeadsDaPlanilha(CRIATIVOS, planilha(amostraReal()), 7, {}));
    // Mutação (o defeito): só por ad_id → ad01 = 1, todos os outros = 0.
    expect(r[AD01]).toBe(6);
    expect(r[ADV01]).toBe(7);
    expect(r[AD04]).toBe(5);
    expect(r[AD02]).toBe(1);
    expect(r[AD03]).toBe(1);
    expect(r[AD05]).toBe(1);
    expect(r[ADV02]).toBe(0);
  });

  it("o Top Criativos (visão por nome) mostra os MESMOS números (AC3)", () => {
    const p = planilha(amostraReal());
    const tabela = leadsPorNome(aplicarLeadsDaPlanilha(CRIATIVOS, p, 7, {}));
    const galeria = enrichWithPaidLeads(
      CRIATIVOS.map((c) => card(c.adName, c.adIds)),
      p.rows,
      true,
      true,
    );
    for (const g of galeria) expect(g.leadsPagos).toBe(tabela[g.name]);
  });
});

describe("Story 18.102 — casos-limite (AC6)", () => {
  const conta = (rows: FunnelSpreadsheetRow[], ids: string[], nome: string | null) =>
    countLeadsByOriginForAds(rows, ids, true, true, nome).leadsPagos;
  const ID = "900000000000000099";
  const NOME = AD01.toLowerCase();

  it("(a) só ID → conta, com ou sem chave de nome", () => {
    expect(conta([linha(ID, "meta", "a@x.com")], [ID], null)).toBe(1);
    expect(conta([linha(ID, "meta", "a@x.com")], [ID], NOME)).toBe(1);
  });

  it("(b) só nome → conta; sem chave de nome (comportamento antigo) → não conta", () => {
    expect(conta([linha(AD01, "meta", "a@x.com")], [ID], NOME)).toBe(1);
    expect(conta([linha(AD01, "meta", "a@x.com")], [ID], null)).toBe(0);
  });

  it("(c) ID e nome, mesmo e-mail → 1 (mais uma pessoa só pelo nome → 2)", () => {
    const rows = [
      linha(ID, "meta", "a@x.com"),
      linha(AD01, "meta", " A@X.com "), // a mesma pessoa, por nome
      linha(AD01, "meta", "c@x.com"),
    ];
    // Sem dedup: 3. Sem o nome: 1.
    expect(conta(rows, [ID], NOME)).toBe(2);
  });

  it("(d) espaços nas pontas e maiúsculas diferentes → conta", () => {
    expect(conta([linha(`  ${AD01.toUpperCase()} `, "meta", "a@x.com")], [ID], NOME)).toBe(1);
  });

  it("(e) nome de OUTRO criativo → não conta", () => {
    expect(conta([linha(AD02, "meta", "a@x.com")], [ID], NOME)).toBe(0);
  });

  it("(f) origem não paga com o nome certo → vai para orgânico, não para Leads", () => {
    const r = countLeadsByOriginForAds([linha(AD01, "ig", "a@x.com")], [ID], true, true, NOME);
    expect(r.leadsPagos).toBe(0);
    expect(r.leadsOrg).toBe(1);
  });

  it("(g) content vazio ou macro não resolvida → não conta", () => {
    expect(conta([linha("", "meta", "a@x.com")], [ID], NOME)).toBe(0);
    expect(conta([linha("{{ad.name}}", "meta", "a@x.com")], [ID], NOME)).toBe(0);
    expect(utmContentEhONomeDoCriativo("", "")).toBe(false);
  });

  it("(h) a mesma pessoa em dois criativos → 1 em cada", () => {
    const rows = [linha(ADV01, "meta", "p@x.com"), linha(AD04, "meta", "p@x.com")];
    const g = enrichWithPaidLeads([card(ADV01, ["1"]), card(AD04, ["2"])], rows, true, true);
    expect(g.map((c) => c.leadsPagos)).toEqual([1, 1]);
  });

  it("(i) visão por anúncio: dois anúncios com o mesmo nome → a linha só com o nome não conta em nenhum", () => {
    const rows = [linha(ADV01, "meta", "a@x.com"), linha("1", "meta", "b@x.com")];
    const doisCards = enrichWithPaidLeads([card(ADV01, ["1"]), card(ADV01, ["2"])], rows, true, true);
    // Mutação (contar o nome em todos): [2, 1] — o total da visão dobraria.
    expect(doisCards.map((c) => c.leadsPagos)).toEqual([1, 0]);
    // Um anúncio só com aquele nome → conta.
    const umCard = enrichWithPaidLeads([card(ADV01, ["1"])], rows, true, true);
    expect(umCard[0].leadsPagos).toBe(2);
  });

  it("(j) grupos que só diferem por maiúsculas → nome não atribui; ID atribui", () => {
    const grupos = [card("AD01", ["1"]), card("ad01", ["2"])];
    const soNome = enrichWithPaidLeads(grupos, [linha("ad01", "meta", "a@x.com")], true, true);
    expect(soNome.map((c) => c.leadsPagos)).toEqual([0, 0]);
    const comId = enrichWithPaidLeads(grupos, [linha("2", "meta", "a@x.com")], true, true);
    expect(comId.map((c) => c.leadsPagos)).toEqual([0, 1]);
  });

  it("(j) no Desempenho de Criativos também (QA TEST-001): AD01 × ad01 → nome não atribui; ID atribui", () => {
    // Os grupos da rota usam `trim()` sem baixar a caixa: `AD01` e `ad01` são duas linhas da tabela.
    const grupos = [daApi("AD01", ["1"]), daApi("ad01", ["2"])];
    // Sem a coluna de data mapeada, `filterSheetRowsByDays` devolve todas as linhas.
    const semData = (rows: FunnelSpreadsheetRow[]): FunnelSpreadsheetData => {
      const p = planilha(rows);
      return { ...p, mapping: { ...p.mapping, date: undefined } };
    };
    const soNome = aplicarLeadsDaPlanilha(grupos, semData([linha("ad01", "meta", "a@x.com")]), 30, {});
    // Mutação (sem unicidade): [1, 1] — a mesma pessoa nas duas linhas da tabela.
    expect(soNome.map((c) => c.leads)).toEqual([0, 0]);
    const comId = aplicarLeadsDaPlanilha(grupos, semData([linha("2", "meta", "a@x.com")]), 30, {});
    expect(comId.map((c) => c.leads)).toEqual([0, 1]);
  });
});

describe("Story 18.102 — a unicidade no shared (AC1)", () => {
  it("nome repetido (inclusive só na caixa) fica de fora; vazio nunca entra", () => {
    const unicos = nomesQueIdentificamUmCriativo(["ad01", " AD01", "ad02", "", null, undefined]);
    expect([...unicos]).toEqual(["ad02"]);
    expect(chaveDoNomeSeUnico("ad01", unicos)).toBeNull();
    expect(chaveDoNomeSeUnico(" AD02 ", unicos)).toBe("ad02");
  });

  it("a visão por nome da galeria não usa o nome quando o card não tem nome", () => {
    const g = enrichWithPaidLeads(
      [{ ids: ["1"], spend: 1 } as unknown as AggregatedCreative],
      [linha("", "meta", "a@x.com")],
      true,
      true,
    );
    expect(g[0].leadsPagos).toBe(0);
  });
});
