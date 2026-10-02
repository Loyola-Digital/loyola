/**
 * Story 49.3 — loader do Motor I (`debriefing-money-time-loader.ts`).
 *
 * As peças puras são testadas direto; o I/O roda sobre um Postgres de verdade
 * (PGlite em memória, DDL mínima das tabelas lidas — nada toca o `.env`, que
 * aponta para produção). Só a leitura do Google é trocada por um dicionário:
 * planilha ausente nele = Google fora, e o loader precisa LANÇAR, não devolver
 * lista vazia.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pg-proxy";
import { CLASSIFICADOR_VERSAO } from "@loyola-x/shared";
import * as schema from "../db/schema.js";
import type { Database } from "../db/client.js";
import type { DebriefingConfigLancamento } from "../services/debriefing-config.js";
import {
  DebriefingDadoIndisponivelError,
  comNomeDeCampanha,
  configClassificadorDe,
  escolherVinculoDaFonte,
  lerFonteDeLead,
  lerPlanilhaDeVenda,
  lerVendasManuais,
  linkClicksDeActions,
  loadDebriefingMoneyTimeInput,
  normalizarTiposDeProduto,
} from "../services/debriefing-money-time-loader.js";
import { CRITERIO_DE_UNICO_HEADLINE, computeDebriefingMoneyTime } from "../services/debriefing-money-time-engine.js";

// ---------------------------------------------------------------------------
// Peças puras
// ---------------------------------------------------------------------------

describe("AC12 — link_click: ausente ≠ zero (nunca parseActionCount)", () => {
  it.each([
    [null, null],
    [undefined, null],
    [[], null],
    [[{ action_type: "landing_page_view", value: "9" }], null],
    [[{ action_type: "link_click", value: "0" }], 0],
    [[{ action_type: "link_click", value: "35882" }], 35882],
    [[{ action_type: "link_click", value: 12 }], 12],
    [[{ action_type: "link_click", value: "abc" }], null],
    ["não é array", null],
  ])("%j → %s", (actions, esperado) => {
    expect(linkClicksDeActions(actions)).toBe(esperado);
  });
});

describe("AC2/AC12 — planilha de venda: célula crua até o motor", () => {
  const headers = ["ID", "Email", "Produto", "Preço", "Valor líquido", "Data", "Status"];
  const base = {
    planilhaId: "s",
    stageId: "cap",
    stageType: "paid",
    nome: "Vendas",
    plataforma: "main_product",
    headers,
    mapping: { transactionId: "ID", email: "Email", productName: "Produto", valorBruto: "Valor líquido", dataVenda: "Data", status: "Status" },
  };

  it("'4.000' chega como string (não pré-parseado) e da coluna de preço BRUTO", () => {
    const r = lerPlanilhaDeVenda({ ...base, rows: [["K1", "a@x.com", "Imersão", "4.000", "3.580,00", "20/04/2026", "paid"]] }, {});
    expect(r.vendas[0]!.valorBrutoCru).toBe("4.000");
    expect(typeof r.vendas[0]!.valorBrutoCru).toBe("string");
    expect(r.precoMappingDivergente).toBe('Vendas: mapping "Valor líquido" trocado por "Preço"');
  });

  it("tipo por product_types; fora do mapa = default da etapa e tipoClassificado = false", () => {
    const tipos = normalizarTiposDeProduto([{ " Gravação ": "order_bump", Lixo: "nao-existe" }]);
    expect(tipos).toEqual({ "gravação": "order_bump" });
    const r = lerPlanilhaDeVenda(
      {
        ...base,
        rows: [
          ["K1", "a@x.com", "Gravação", "197", "", "20/04/2026", "paid"],
          ["K2", "b@x.com", "Combo novo", "296", "", "20/04/2026", "paid"],
          ["", "", "", "", "", "", ""],
        ],
      },
      tipos,
    );
    expect(r.vendas.map((v) => [v.tipo, v.tipoClassificado])).toEqual([
      ["order_bump", true],
      ["ingresso", false],
    ]);
    const vendas = lerPlanilhaDeVenda({ ...base, stageType: "sales", rows: [["K", "c@x.com", "X", "1", "", "1/5/2026", "paid"]] }, {});
    expect(vendas.vendas[0]!.tipo).toBe("principal");
  });

  it("sem coluna de preço: lança DADO_INDISPONIVEL (exceto TMB, cujo valor é excluído)", () => {
    const semPreco = { ...base, headers: ["ID", "Email", "Produto", "Data"], mapping: { transactionId: "ID" }, rows: [] };
    expect(() => lerPlanilhaDeVenda(semPreco, {})).toThrow(DebriefingDadoIndisponivelError);
    expect(() => lerPlanilhaDeVenda({ ...semPreco, plataforma: "tmb" }, {})).not.toThrow();
  });

  it("temColunaId/temColunaProduto só quando o mapping aponta para cabeçalho que existe", () => {
    const r = lerPlanilhaDeVenda({ ...base, mapping: { ...base.mapping, transactionId: "Transaction" }, rows: [] }, {});
    expect(r.planilha).toMatchObject({ temColunaId: false, temColunaProduto: true, temColunaStatus: true });
  });

  it("41.12 R7-4/R7-5: `camada2Vale` sai do tipo da etapa pelo ponto único (`camada2ValeNaEtapa`)", () => {
    const vale = (stageType: string | null) => lerPlanilhaDeVenda({ ...base, stageType, rows: [] }, {}).planilha.camada2Vale;
    expect(vale("paid")).toBe(true);
    expect(vale("event_capture")).toBe(false);
    expect(vale("sales")).toBe(false);
    expect(vale("event")).toBe(false);
    expect(vale(null)).toBe(false);
    const manual = (stageType: string | null) => lerVendasManuais("e", stageType, [], {}).planilha.camada2Vale;
    expect(manual("paid")).toBe(true);
    expect(manual("event_capture")).toBe(false);
    expect(manual("sales")).toBe(false);
  });
});

describe("leads, nome de campanha e config do classificador (puros)", () => {
  it("fonte de lead sem e-mail nem telefone é declarada, não some", () => {
    expect(lerFonteDeLead({ label: "x", headers: ["nome"], rows: [["Fulano"]], mapping: {} })).toEqual({
      leads: [],
      semIdentificador: true,
    });
  });

  it("TEST-004 (Q24): a data do lead vem de mapping.timestamp mesmo com cabeçalho fora dos apelidos", () => {
    const r = lerFonteDeLead({
      label: "pesquisa",
      headers: ["Quando respondeu", "E-mail"],
      rows: [["17/04/2026 10:00:00", "a@x.com"]],
      mapping: { timestamp: "Quando respondeu", email: "E-mail" },
    });
    expect(r.leads).toEqual([
      { emailCru: "a@x.com", telefoneCru: null, dataCriacaoCru: "17/04/2026 10:00:00", utm: { source: null, medium: null, campaign: null, term: null } },
    ]);
  });

  it("decisão 3A: venda manual → linha crua, valor do numeric sem ambiguidade, tipo pela regra da etapa, sem nome do cliente", () => {
    const r = lerVendasManuais(
      "prin",
      "sales",
      [
        { id: "m1", value: "4000.00", product: " Mentoria ", customerEmail: " m@x.com ", customerPhone: "553199990000.0", sellerName: " Netão ", saleDate: new Date("2026-05-13T15:00:00Z") },
        { id: "m2", value: 1097, product: null, customerEmail: null, customerPhone: null, sellerName: "", saleDate: "2026-05-14T15:00:00Z" },
      ],
      { "imersão": "ingresso" },
    );
    expect(r.planilha).toEqual({
      planilhaId: "prin:manual",
      stageId: "prin",
      nome: "Vendas manuais",
      plataforma: "manual",
      temColunaStatus: false,
      temColunaId: true,
      temColunaProduto: true,
      camada2Vale: false, // etapa `sales`: fora da camada 2 (R7-4)
    });
    expect(r.vendas[0]).toEqual({
      planilhaId: "prin:manual",
      linha: 1,
      idDaVendaCru: "m1",
      produto: "Mentoria",
      tipo: "principal",
      tipoClassificado: false,
      valorBrutoCru: "4000,00",
      moeda: null,
      statusCru: null,
      emailCru: "m@x.com",
      telefoneCru: "553199990000.0",
      dataVendaCru: "2026-05-13T15:00:00.000Z",
      utm: {},
      sellerName: "Netão",
    });
    expect(r.vendas[1]).toMatchObject({ valorBrutoCru: "1097,00", produto: null, emailCru: null, sellerName: null });
    // Na captação (etapa paga) a manual é ingresso, como no painel.
    expect(lerVendasManuais("cap", "paid", [{ ...r.vendas[0]!, id: "x", value: "99.00", product: "Imersão", customerEmail: null, customerPhone: null, sellerName: null, saleDate: "2026-04-20T12:00:00Z" }], { "imersão": "ingresso" }).vendas[0]).toMatchObject({
      tipo: "ingresso",
      tipoClassificado: true,
    });
  });

  it("comNomeDeCampanha preenche pelo id e não muta a entrada", () => {
    const utm = { source: "fb", campaign: "111" };
    const r = comNomeDeCampanha(utm, new Map([["111", "dg--vendas-captacao--hot"]]));
    expect(r.campaignName).toBe("dg--vendas-captacao--hot");
    expect(utm).toEqual({ source: "fb", campaign: "111" });
  });

  it("regra 9: comNomeDeCampanha casa o id desembrulhado ({\"111\",\"111\"}) e deixa a célula como veio", () => {
    const nomes = new Map([["111", "dg--vendas-captacao--hot"]]);
    expect(comNomeDeCampanha({ campaign: '{"111","111"}' }, nomes)).toEqual({ campaign: '{"111","111"}', campaignName: "dg--vendas-captacao--hot" });
    expect(comNomeDeCampanha({ campaign: '{"111","222"}' }, nomes).campaignName).toBeUndefined();
  });

  it("TEST-005 (QA-M5): venda manual com produto no product_types segue o mapa, não o default da etapa", () => {
    const m = { id: "m", value: "296.00", customerEmail: null, customerPhone: null, sellerName: null, saleDate: "2026-04-25T12:00:00Z" };
    const tipos = normalizarTiposDeProduto([{ "Combo VIP": "combo", "Gravação": "order_bump" }]);
    const r = lerVendasManuais("cap", "paid", [{ ...m, product: " combo vip " }, { ...m, id: "m2", product: "Gravação" }, { ...m, id: "m3", product: "Outro" }], tipos);
    expect(r.vendas.map((v) => [v.tipo, v.tipoClassificado])).toEqual([
      ["combo", true],
      ["order_bump", true],
      ["ingresso", false], // fora do mapa: default da etapa paga
    ]);
    // no principal, o mapa também vence o default ("principal")
    expect(lerVendasManuais("prin", "sales", [{ ...m, product: "Gravação" }], tipos).vendas[0]).toMatchObject({ tipo: "order_bump", tipoClassificado: true });
  });

  it("configClassificadorDe normaliza e une aliases e closers", () => {
    const c = configClassificadorDe(
      { closerMediums: ["x1"], closerPorSellerName: false, ferramentasDeAtendimento: [] },
      [{ canonicalName: " Isabela ", aliases: ["isa", "ISABELA"] }],
      [{ name: "Netão" }],
    );
    expect(c).toEqual({ closerMediums: ["x1"], closerNomes: ["isa", "isabela", "netão"], closerPorSellerName: false, ferramentasDeAtendimento: [] });
  });
});

describe("REL-001 — escolherVinculoDaFonte: qual vínculo vale quando a aba está em mais de uma etapa", () => {
  const headers = ["ID", "Produto", "Email", "Preço"];
  const completo = { transactionId: "ID", productName: "Produto" };
  it("mais colunas da camada 1 mapeadas vence, mesmo vindo depois e sendo de etapa leads-*", () => {
    const r = escolherVinculoDaFonte(
      [
        { stageId: "a", papel: "vendas-downsell", mapping: { transactionId: "ID" } },
        { stageId: "b", papel: "leads-downsell", mapping: completo },
      ],
      headers,
    );
    expect(r).toEqual({
      indice: 1,
      criterio: "mapeamento-id-e-produto",
      colunas: [
        { temColunaId: true, temColunaProduto: false },
        { temColunaId: true, temColunaProduto: true },
      ],
    });
  });

  it("mapeamento que aponta para cabeçalho inexistente não conta", () => {
    const r = escolherVinculoDaFonte(
      [
        { stageId: "a", papel: "leads-downsell", mapping: { transactionId: "Transaction", productName: "Product" } },
        { stageId: "b", papel: "leads-captacao", mapping: { productName: "Produto" } },
      ],
      headers,
    );
    expect(r.indice).toBe(1);
    expect(r.criterio).toBe("mapeamento-id-e-produto");
  });

  it("empate no mapeamento → etapa vendas-*; empate também no papel → primeira na ordem da config, registrado", () => {
    expect(
      escolherVinculoDaFonte(
        [
          { stageId: "a", papel: "leads-downsell", mapping: completo },
          { stageId: "b", papel: "vendas-downsell", mapping: completo },
        ],
        headers,
      ),
    ).toMatchObject({ indice: 1, criterio: "papel-de-vendas" });
    expect(
      escolherVinculoDaFonte(
        [
          { stageId: "c", papel: "leads-captacao", mapping: {} },
          { stageId: "a", papel: "vendas-captacao", mapping: completo },
          { stageId: "b", papel: "vendas-principal", mapping: completo },
        ],
        headers,
      ),
    ).toMatchObject({ indice: 1, criterio: "empate-ordem-da-config" });
    expect(
      escolherVinculoDaFonte(
        [
          { stageId: "a", papel: "leads-captacao", mapping: {} },
          { stageId: "b", papel: "leads-downsell", mapping: {} },
        ],
        headers,
      ),
    ).toMatchObject({ indice: 0, criterio: "empate-ordem-da-config" });
  });
});

// ---------------------------------------------------------------------------
// I/O sobre PGlite
// ---------------------------------------------------------------------------

const P = "10000000-0000-4000-8000-000000000001";
const P2 = "10000000-0000-4000-8000-000000000002";
const F = "20000000-0000-4000-8000-000000000001";
const F2 = "20000000-0000-4000-8000-000000000002";
const CAP = "30000000-0000-4000-8000-000000000001";
const PRIN = "30000000-0000-4000-8000-000000000002";
const OUTRA = "30000000-0000-4000-8000-000000000003";
const DE_OUTRO_FUNIL = "30000000-0000-4000-8000-000000000004";
const DS_VENDAS = "30000000-0000-4000-8000-000000000005";
const DS_LEADS = "30000000-0000-4000-8000-000000000006";

const DDL = `
CREATE TABLE funnel_stages (
  id uuid PRIMARY KEY, funnel_id uuid NOT NULL, stage_type varchar(20), campaigns jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE stage_sales_spreadsheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stage_id uuid NOT NULL, subtype varchar(20) NOT NULL,
  spreadsheet_id varchar(255) NOT NULL, spreadsheet_name varchar(255) NOT NULL DEFAULT '', sheet_name varchar(255) NOT NULL,
  column_mapping jsonb NOT NULL DEFAULT '{}', order_bump_products jsonb NOT NULL DEFAULT '[]', product_types jsonb
);
CREATE TABLE funnel_spreadsheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funnel_id uuid NOT NULL, stage_id uuid, label varchar(255) NOT NULL,
  type text NOT NULL, platform varchar(20), spreadsheet_id varchar(255) NOT NULL, spreadsheet_name varchar(255) NOT NULL,
  sheet_name varchar(255) NOT NULL, column_mapping jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE funnel_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funnel_id uuid NOT NULL, stage_id uuid,
  spreadsheet_id varchar(255) NOT NULL, spreadsheet_name varchar(255) NOT NULL, sheet_name varchar(255) NOT NULL,
  survey_type text NOT NULL DEFAULT 'paid', column_mapping jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE meta_campaign_insights_daily (
  project_id uuid NOT NULL, campaign_id varchar(64) NOT NULL, date_start varchar(10) NOT NULL,
  spend numeric NOT NULL DEFAULT 0, impressions numeric NOT NULL DEFAULT 0, reach numeric NOT NULL DEFAULT 0,
  clicks numeric NOT NULL DEFAULT 0, actions jsonb, action_values jsonb, last_synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, campaign_id, date_start)
);
CREATE TABLE meta_ad_insights_daily (
  project_id uuid NOT NULL, ad_id varchar(64) NOT NULL, date_start varchar(10) NOT NULL,
  campaign_id varchar(64), campaign_name varchar(500)
);
CREATE TABLE seller_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, canonical_name varchar(255) NOT NULL,
  aliases jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE stage_event_closers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stage_id uuid NOT NULL, name varchar(255) NOT NULL
);
CREATE TABLE manual_sales (
  id uuid PRIMARY KEY, stage_id uuid NOT NULL, customer_name varchar(255) NOT NULL, customer_email varchar(255),
  customer_phone varchar(50), value numeric(12,2) NOT NULL, product varchar(255), seller_name varchar(255) NOT NULL,
  sale_date timestamptz NOT NULL, refunded_at timestamptz
);
`;

const lk = (n: string) => `[{"action_type":"link_click","value":"${n}"}]`;
const SEED = `
INSERT INTO funnel_stages VALUES
  ('${CAP}', '${F}', 'paid', '[{"id":"111","name":"dg--vendas-captacao--hot"},{"id":"333","name":"dg--vendas-captacao--cold"}]'),
  ('${PRIN}', '${F}', 'sales', '[{"id":"222","name":"dg--vendas-principal--hot"},{"id":"333","name":"dg--vendas-captacao--cold"}]'),
  ('${OUTRA}', '${F}', 'free', '[{"id":"999","name":"outra-etapa"}]'),
  ('${DE_OUTRO_FUNIL}', '${F2}', 'sales', '[]'),
  ('${DS_VENDAS}', '${F}', 'sales', '[]'),
  ('${DS_LEADS}', '${F}', 'free', '[]');
INSERT INTO stage_sales_spreadsheets (stage_id, subtype, spreadsheet_id, sheet_name, column_mapping, product_types) VALUES
  ('${CAP}', 'capture', 'g-cap', 'n8n-captacao',
   '{"transactionId":"ID","email":"Email","telefone":"Telefone","productName":"Produto","valorBruto":"Valor líquido","dataVenda":"Data","status":"Status","utm_source":"utm_source","utm_medium":"utm_medium","utm_campaign":"utm_campaign","utm_term":"utm_term"}',
   '{"Imersão":"ingresso","Gravação":"order_bump"}'),
  ('${PRIN}', 'main_product', 'g-prin', 'vendas-principal',
   '{"transactionId":"ID","email":"Email","productName":"Produto","valorBruto":"Preço","dataVenda":"Data","status":"Status","closer":"Closer"}', NULL),
  -- REL-001: a MESMA aba ligada à Downsell Vendas (com ID + produto) e, abaixo, à Downsell Captação (sem).
  ('${DS_VENDAS}', 'main_product', 'g-ds', 'n8n-kiwify-downsell',
   '{"transactionId":"ID","email":"Email","productName":"Produto","valorBruto":"Preço","dataVenda":"Data","status":"Status"}', NULL);
INSERT INTO funnel_surveys (funnel_id, stage_id, spreadsheet_id, spreadsheet_name, sheet_name, column_mapping) VALUES
  ('${F}', '${CAP}', 'g-pesq', 'Pesquisa', 'respostas', '{}');
INSERT INTO funnel_spreadsheets (funnel_id, stage_id, label, type, spreadsheet_id, spreadsheet_name, sheet_name, column_mapping) VALUES
  ('${F}', NULL, 'Leads gerais', 'leads', 'g-leads', 'Leads', 'base', '{"email":"email","phone":"telefone","date":"data"}'),
  ('${F}', NULL, 'Upsell', 'perpetual_upsell', 'g-nao-ler-1', 'Upsell', 'x', '{}'),
  ('${F}', '${OUTRA}', 'Leads da outra etapa', 'leads', 'g-nao-ler-2', 'Outra', 'x', '{}'),
  ('${F}', '${CAP}', 'Lista sem contato', 'leads', 'g-semid', 'Sem contato', 'nomes', '{}'),
  ('${F}', '${DS_LEADS}', 'Downsell', 'sales', 'g-ds', 'Downsell', 'n8n-kiwify-downsell', '{"email":"Email","valorBruto":"Preço","dataVenda":"Data","status":"Status"}');
INSERT INTO meta_campaign_insights_daily (project_id, campaign_id, date_start, spend, impressions, actions) VALUES
  ('${P}', '111', '2026-04-20', 1000.50, 50000, '${lk("700")}'),
  ('${P}', '111', '2026-04-21', 10, 800, NULL),
  ('${P}', '222', '2026-05-12', 300, 9000, '${lk("0")}'),
  ('${P}', '222', '2026-05-17', 40, 900, '${lk("5")}'),
  ('${P}', '333', '2026-04-20', 50, 1000, '[{"action_type":"landing_page_view","value":"9"}]'),
  ('${P}', '111', '2026-03-01', 999, 1, NULL),
  ('${P}', '999', '2026-04-20', 777, 1, NULL),
  ('${P2}', '111', '2026-04-20', 555, 1, NULL);
INSERT INTO meta_ad_insights_daily VALUES
  ('${P}', 'ad1', '2026-04-20', '444', 'dg--vendas-captacao--cold--abo'),
  ('${P}', 'ad2', '2026-04-21', '444', 'dg--vendas-captacao--cold--abo');
INSERT INTO seller_aliases (project_id, canonical_name, aliases) VALUES
  ('${P}', 'Isabela Comercial', '["isabela","isa"]'),
  ('${P2}', 'Outro Projeto', '["outro"]');
INSERT INTO stage_event_closers (stage_id, name) VALUES ('${PRIN}', 'Netão'), ('${DE_OUTRO_FUNIL}', 'Fulano');
INSERT INTO manual_sales (id, stage_id, customer_name, customer_email, customer_phone, value, product, seller_name, sale_date, refunded_at) VALUES
  ('40000000-0000-4000-8000-000000000001', '${PRIN}', 'Cliente Manual Um', 'm@x.com', '553199990000', 2500.00, 'Mentoria', 'Netão', '2026-05-13 15:00:00+00', NULL),
  ('40000000-0000-4000-8000-000000000002', '${PRIN}', 'Cliente Reembolsado', 'r@x.com', NULL, 900.00, 'Mentoria', 'Netão', '2026-05-13 16:00:00+00', '2026-05-20 10:00:00+00'),
  ('40000000-0000-4000-8000-000000000003', '${OUTRA}', 'Cliente Outra Etapa', 'o@x.com', NULL, 700.00, 'X', 'Ana', '2026-05-13 16:00:00+00', NULL),
  ('40000000-0000-4000-8000-000000000004', '${CAP}', 'Cliente Pix Captacao', 'pix@x.com', NULL, 99.00, 'Imersão', 'Ana', '2026-04-25 15:00:00+00', NULL);
`;

const PLANILHAS: Record<string, { headers: string[]; rows: string[][] }> = {
  "g-cap|n8n-captacao": {
    headers: ["ID", "Email", "Telefone", "Produto", "Preço", "Valor líquido", "Data", "Status", "utm_source", "utm_medium", "utm_campaign", "utm_term"],
    rows: [
      ["K1", "a@x.com", "553175058180.0", "Imersão", "4.000", "3.580,00", "2026-04-18T02:00:00Z", "paid", "facebook", "cpc", "111", "lp|hot|ad"],
      ["K2", "b@x.com", "", "Gravação", "197,00", "180", "20/04/2026", "paid", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", ""],
      ["K3", "c@x.com", "", "Produto Novo", "99", "90", "20/04/2026", "paid", "ig", "", "444", ""],
    ],
  },
  "g-prin|vendas-principal": {
    headers: ["ID", "Email", "Produto", "Preço", "Data", "Status", "Closer"],
    rows: [
      ["P1", "a@x.com", "Mentoria", "1.097,00", "12/05/2026", "paid", ""],
      ["P2", "z@x.com", "Mentoria", "1.097,00", "13/05/2026", "paid", "Netão"],
    ],
  },
  "g-pesq|respostas": {
    headers: ["Carimbo de data/hora", "E-mail", "WhatsApp", "utm_source", "utm_term"],
    rows: [["17/04/2026", "a@x.com", "553175058180", "facebook", "lp|hot|ad"]],
  },
  "g-semid|nomes": { headers: ["nome"], rows: [["Fulano"]] },
  "g-ds|n8n-kiwify-downsell": {
    headers: ["ID", "Email", "Produto", "Preço", "Data", "Status"],
    rows: [
      ["D1", "d1@x.com", "Downsell", "197,00", "17/05/2026", "paid"],
      ["D2", "d2@x.com", "Downsell", "297,00", "17/05/2026", "paid"],
    ],
  },
  "g-leads|base": {
    headers: ["data", "email", "telefone"],
    rows: [
      ["16/04/2026", "z@x.com", ""],
      ["", "", ""],
    ],
  },
};

const lerFalso = async (spreadsheetId: string, sheetName: string) => {
  const p = PLANILHAS[`${spreadsheetId}|${sheetName}`];
  if (!p) throw new Error(`Sheets data error (403): ${spreadsheetId}`);
  return { headers: [...p.headers], rows: p.rows.map((r) => [...r]) };
};

const config: DebriefingConfigLancamento = {
  tipoDeFunil: "launch",
  stageId: "debriefing",
  funnelId: F,
  projectId: P,
  datasChave: {
    inicioCaptacao: "2026-04-17",
    aberturaCarrinho: "2026-05-11",
    fimCarrinho: "2026-05-15",
    reabertura: { houve: false },
    downsell: { houve: false },
  },
  lancamentoComparacaoFunnelId: null,
  etapas: [
    { stageId: CAP, papel: "vendas-captacao" },
    { stageId: PRIN, papel: "vendas-principal" },
  ],
  perguntasConfirmadas: {},
  closerMediums: ["x1"],
  closerPorSellerName: true,
  ferramentasDeAtendimento: ["letalk"],
  dimensaoDeCriativo: "nenhuma",
  imposto: { valor: 0.1215, origem: "default" },
  validado: true,
  validadoEm: null,
  validadoPor: null,
  avisos: [],
};

let pg: PGlite;
let db: Database;

// O PGlite (WASM) leva dezenas de segundos para subir num disco frio; com o
// timeout padrão de hook (10 s) o arquivo falhava de forma intermitente no
// merge da 49.4. Mesmo orçamento do `debriefing-config-store.test.ts`.
beforeAll(async () => {
  const comoString = (v: string) => v;
  pg = new PGlite({ parsers: { 1082: comoString, 1114: comoString, 1184: comoString, 1700: comoString } });
  await pg.exec(DDL);
  await pg.exec(SEED);
  db = drizzle(
    async (sql, params) => {
      const r = await pg.query(sql, params as unknown[], { rowMode: "array" });
      return { rows: r.rows as unknown[] };
    },
    { schema },
  ) as unknown as Database;
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe("AC12 — loadDebriefingMoneyTimeInput sobre Postgres real", () => {
  it("vendas: célula crua, coluna bruta, tipo, telefone com .0, linha vazia ignorada", async () => {
    const r = await loadDebriefingMoneyTimeInput(db, { config }, { lerPlanilha: lerFalso });
    const k1 = r.vendas.find((v) => v.idDaVendaCru === "K1")!;
    expect(k1.valorBrutoCru).toBe("4.000");
    expect(k1.telefoneCru).toBe("553175058180.0");
    expect(k1.tipo).toBe("ingresso");
    expect(r.vendas.find((v) => v.idDaVendaCru === "K2")).toMatchObject({ tipo: "order_bump", tipoClassificado: true });
    expect(r.vendas.find((v) => v.idDaVendaCru === "K3")).toMatchObject({ tipo: "ingresso", tipoClassificado: false });
    expect(r.vendas.find((v) => v.idDaVendaCru === "P2")!.sellerName).toBe("Netão");
    expect(r.vendas.filter((v) => !v.planilhaId.endsWith(":manual"))).toHaveLength(5);
    expect(r.diagnostico.precoMappingDivergente).toEqual(['n8n-captacao: mapping "Valor líquido" trocado por "Preço"']);
    expect(r.planilhas.map((p) => [p.plataforma, p.temColunaId, p.temColunaProduto])).toEqual([
      ["capture", true, true],
      ["main_product", true, true],
      ["manual", true, true],
      ["manual", true, true],
    ]);
  });

  it("nome da campanha das UTMs: funnel_stages.campaigns primeiro, meta_ad_insights_daily depois", async () => {
    const r = await loadDebriefingMoneyTimeInput(db, { config }, { lerPlanilha: lerFalso });
    expect(r.vendas.find((v) => v.idDaVendaCru === "K1")!.utm.campaignName).toBe("dg--vendas-captacao--hot");
    expect(r.vendas.find((v) => v.idDaVendaCru === "K3")!.utm.campaignName).toBe("dg--vendas-captacao--cold--abo");
  });

  it("mídia: spend cru só das campanhas vinculadas, no período, do projeto; link_click null × 0; campanha em 2 etapas conta 1×", async () => {
    const r = await loadDebriefingMoneyTimeInput(db, { config }, { lerPlanilha: lerFalso });
    const m = r.midia.map((x) => [x.stageId, x.campaignId, x.dia, x.spendBruto, x.linkClicks]);
    expect(m).toEqual([
      [CAP, "111", "2026-04-20", 1000.5, 700],
      [CAP, "111", "2026-04-21", 10, null],
      [PRIN, "222", "2026-05-12", 300, 0],
      [CAP, "333", "2026-04-20", 50, null],
    ]);
    expect(r.diagnostico.campanhasEmMaisDeUmaEtapa).toEqual([{ campaignId: "333", etapas: [CAP, PRIN] }]);
  });

  it("decisão 2A: a mídia é lida na janela da config — o downsell até 18/05 traz a linha de 17/05", async () => {
    const semExtra = await loadDebriefingMoneyTimeInput(db, { config }, { lerPlanilha: lerFalso });
    expect(semExtra.diagnostico.janela).toMatchObject({ inicio: "2026-04-17", fim: "2026-05-15", fimPor: "fimCarrinho" });
    expect(semExtra.midia.some((m) => m.dia === "2026-05-17")).toBe(false);
    const comDownsell = {
      ...config,
      datasChave: { ...config.datasChave, downsell: { houve: true as const, abertura: "2026-05-16", fim: "2026-05-18" } },
    };
    const r = await loadDebriefingMoneyTimeInput(db, { config: comDownsell }, { lerPlanilha: lerFalso });
    expect(r.diagnostico.janela).toMatchObject({ fim: "2026-05-18", fimPor: "downsell.fim" });
    expect(r.midia.filter((m) => m.dia === "2026-05-17").map((m) => [m.campaignId, m.spendBruto, m.linkClicks])).toEqual([["222", 40, 5]]);
  });

  it("decisão 3A: vendas manuais da etapa, sem as reembolsadas e sem as de etapa fora do lançamento", async () => {
    const r = await loadDebriefingMoneyTimeInput(db, { config }, { lerPlanilha: lerFalso });
    expect(r.diagnostico.vendasManuais).toEqual([
      { stageId: CAP, linhas: 1 },
      { stageId: PRIN, linhas: 1 },
    ]);
    const manuais = r.vendas.filter((v) => v.planilhaId.endsWith(":manual"));
    expect(manuais.map((v) => [v.idDaVendaCru, v.valorBrutoCru, v.tipo, v.sellerName, v.dataVendaCru])).toEqual([
      ["40000000-0000-4000-8000-000000000004", "99,00", "ingresso", "Ana", "2026-04-25T15:00:00.000Z"],
      ["40000000-0000-4000-8000-000000000001", "2500,00", "principal", "Netão", "2026-05-13T15:00:00.000Z"],
    ]);
    expect(JSON.stringify(r.vendas)).not.toMatch(/Cliente/); // nome do cliente nunca é lido
  });

  it("leads: fontes da etapa + do funil sem etapa; nunca as de venda nem as de etapa fora do lançamento", async () => {
    const r = await loadDebriefingMoneyTimeInput(db, { config }, { lerPlanilha: lerFalso });
    expect(r.diagnostico.fontesDeLead.map((f) => [f.label, f.linhas, f.semIdentificador])).toEqual([
      ["Pesquisa / respostas", 1, false],
      ["Leads gerais · base", 1, false],
      // TEST-004 (Q8b): fonte sem e-mail nem telefone chega ao diagnóstico, não some.
      ["Lista sem contato · nomes", 0, true],
    ]);
    expect(r.leads[0]).toMatchObject({ emailCru: "a@x.com", telefoneCru: "553175058180", dataCriacaoCru: "17/04/2026" });
  });

  it("config do classificador montada uma vez: aliases do projeto + closers do funil, versão da 49.2", async () => {
    const r = await loadDebriefingMoneyTimeInput(db, { config }, { lerPlanilha: lerFalso });
    expect(r.configClassificador).toEqual({
      closerMediums: ["x1"],
      closerNomes: ["isa", "isabela", "isabela comercial", "netão"],
      closerPorSellerName: true,
      ferramentasDeAtendimento: ["letalk"],
    });
    expect(r.classificador.versao).toBe(CLASSIFICADOR_VERSAO);
  });

  it("planilha que falha ao ler lança DADO_INDISPONIVEL — nunca vira lista vazia", async () => {
    for (const quebrada of ["g-cap|n8n-captacao", "g-leads|base"]) {
      const ler = (id: string, aba: string) =>
        `${id}|${aba}` === quebrada ? Promise.reject(new Error("Sheets data error (500)")) : lerFalso(id, aba);
      const erro = await loadDebriefingMoneyTimeInput(db, { config }, { lerPlanilha: ler }).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(DebriefingDadoIndisponivelError);
      expect((erro as DebriefingDadoIndisponivelError).toResponse()).toMatchObject({ erro: "DADO_INDISPONIVEL" });
      expect((erro as DebriefingDadoIndisponivelError).detalhe).toContain(quebrada.split("|")[1]!);
    }
  });

  it("etapa da config que saiu do funil lança DADO_INDISPONIVEL", async () => {
    const outra = { ...config, etapas: [...config.etapas, { stageId: DE_OUTRO_FUNIL, papel: "vendas-downsell" as const }] };
    await expect(loadDebriefingMoneyTimeInput(db, { config: outra }, { lerPlanilha: lerFalso })).rejects.toThrow(
      DebriefingDadoIndisponivelError,
    );
  });

  it("ponta a ponta: '4.000' sai do motor como 4000, '1.097,00' como 1097, D+0 pelo ingresso que cruza a meia-noite", async () => {
    const carregado = await loadDebriefingMoneyTimeInput(db, { config }, { lerPlanilha: lerFalso });
    const r = computeDebriefingMoneyTime({ ...carregado, criterioDeUnico: CRITERIO_DE_UNICO_HEADLINE });
    expect(r.produtosNaoClassificados).toEqual([{ produto: "Produto Novo", vendas: 1, faturamento: 99, tiposAssumidos: ["ingresso"] }]);
    // 3A: a manual da captação (PIX, R$ 99) é ingresso e conta como comprador.
    expect(r.captacao.faturamentoIngresso.valor).toBe(4000 + 99 + 99);
    expect(r.ingressosUnicos).toBe(3); // a (Imersão), c (Produto Novo → ingresso), pix (manual)
    // 3A: a manual do principal (R$ 2.500, Netão) entra; a reembolsada (R$ 900) não.
    expect(r.faturamentoPrincipal.valor).toBe(2 * 1097 + 2500);
    expect(r.vendasManuais.porGrupo.principal).toEqual({ vendas: 1, faturamento: 2500 });
    expect(r.auditoriaDeVendas.find((x) => x.fonte === "manual")).toMatchObject({
      canal: "Sem track real",
      fechamento: "closer",
      valor: 2500,
    });
    expect(JSON.stringify(r)).not.toMatch(/Cliente|553199990000/);
    expect(r.midia.porEtapa[CAP]!.investimentoBruto).toBeCloseTo(1060.5, 9);
    expect(r.midia.porEtapa[CAP]!.linkClicks).toBe(700);
    expect(r.midia.porEtapa[PRIN]!.linkClicks).toBe(0);
    const a = r.auditoriaDeVendas.find((x) => x.txId === "P1")!;
    expect(a).toMatchObject({ canal: "Pago Quente", fechamento: "sem-closer", origemDaData: "lead-email", dMais: 0 });
    expect(r.auditoriaDeVendas.find((x) => x.txId === "P2")).toMatchObject({
      canal: "Sem track real",
      fechamento: "closer",
      origemDaData: "lead-email",
      dMais: -1,
    });
    expect(r.coorte.basePreLancamento).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(/@x\.com|75058180/);
  });
});

describe("REL-001 — a mesma aba ligada a duas etapas é lida UMA vez (PGlite)", () => {
  const comDownsell = (etapas: DebriefingConfigLancamento["etapas"]): DebriefingConfigLancamento => ({
    ...config,
    datasChave: { ...config.datasChave, downsell: { houve: true, abertura: "2026-05-16", fim: "2026-05-18" } },
    etapas: [...config.etapas, ...etapas],
  });

  it("Downsell Captação (leads-downsell, sem ID/produto) ANTES da Downsell Vendas: vale a de vendas; faturamento simples; declarado", async () => {
    const lidas: string[] = [];
    const ler = (id: string, aba: string) => {
      lidas.push(`${id}|${aba}`);
      return lerFalso(id, aba);
    };
    const cfg = comDownsell([
      { stageId: DS_LEADS, papel: "leads-downsell" },
      { stageId: DS_VENDAS, papel: "vendas-downsell" },
    ]);
    const carregado = await loadDebriefingMoneyTimeInput(db, { config: cfg }, { lerPlanilha: ler });
    expect(lidas.filter((x) => x === "g-ds|n8n-kiwify-downsell")).toHaveLength(1);
    expect(carregado.vendas.filter((v) => v.idDaVendaCru === "D1" || v.idDaVendaCru === "D2")).toHaveLength(2);
    const daAba = carregado.diagnostico.planilhasDeVenda.filter((p) => p.nome === "n8n-kiwify-downsell");
    expect(daAba.map((p) => [p.stageId, p.linhas])).toEqual([[DS_VENDAS, 2]]);
    expect(carregado.diagnostico.fontesDuplicadas).toHaveLength(1);
    const f = carregado.diagnostico.fontesDuplicadas[0]!;
    expect(f).toMatchObject({
      aba: "n8n-kiwify-downsell",
      stageIdQueVale: DS_VENDAS,
      criterio: "mapeamento-id-e-produto",
      linhasNaoRelidas: 2,
    });
    expect(f.vinculos.map((v) => [v.stageId, v.papel, v.temColunaId, v.temColunaProduto])).toEqual([
      [DS_LEADS, "leads-downsell", false, false],
      [DS_VENDAS, "vendas-downsell", true, true],
    ]);
    expect(f.vale).toBe(daAba[0]!.planilhaId);
    expect(carregado.fontesDuplicadas).toEqual(carregado.diagnostico.fontesDuplicadas);

    const r = computeDebriefingMoneyTime({ ...carregado, criterioDeUnico: CRITERIO_DE_UNICO_HEADLINE });
    expect(r.downsell).toEqual({ aplicavel: true, vendas: 2, faturamento: 197 + 297 });
    expect(r.higiene.fontesDuplicadas).toEqual(carregado.diagnostico.fontesDuplicadas);
    expect(r.lacunas.map((l) => l.codigo)).toContain("FONTE_EM_MAIS_DE_UMA_ETAPA");
    // a cópia sem ID/produto não chega ao motor — a lacuna genérica da camada 1 não aparece por ela
    expect(r.higiene.dedupNaoAplicada).toEqual([]);
  });

  it("aba ligada a uma etapa só: nada declarado", async () => {
    const carregado = await loadDebriefingMoneyTimeInput(db, { config: comDownsell([{ stageId: DS_VENDAS, papel: "vendas-downsell" }]) }, { lerPlanilha: lerFalso });
    expect(carregado.diagnostico.fontesDuplicadas).toEqual([]);
    const r = computeDebriefingMoneyTime({ ...carregado, criterioDeUnico: CRITERIO_DE_UNICO_HEADLINE });
    expect(r.downsell.faturamento).toBe(494);
    expect(r.lacunas.some((l) => l.codigo === "FONTE_EM_MAIS_DE_UMA_ETAPA")).toBe(false);
  });
});
