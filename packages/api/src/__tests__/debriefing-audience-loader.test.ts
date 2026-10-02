/**
 * Story 49.4 — loader do Motor II (`debriefing-audience-loader.ts`).
 *
 * Peças puras direto; o I/O roda sobre um Postgres de verdade (PGlite em
 * memória, DDL mínima das tabelas lidas — nada toca o `.env`, que aponta para
 * produção). Só a leitura do Google é trocada por um dicionário: planilha
 * ausente nele = Google fora, e o loader precisa LANÇAR, não devolver vazio.
 *
 * Também mora aqui:
 * - o diferencial de higiene: `compradoresCaptacao` do Motor II === o do
 *   Motor I (49.3) sobre a MESMA entrada suja (49.5 F3);
 * - a não regressão do `export` de `resolveColumnIndexes` (AC12 b): o payload
 *   de `computeSurveyForStage` congelado ANTES do export;
 * - o diferencial contra o Resumão (decisão 9): mesmo `%` sem e-mail repetido.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pg-proxy";
import { CLASSIFICADOR_VERSAO, classificarOrigem } from "@loyola-x/shared";
import * as schema from "../db/schema.js";
import type { Database } from "../db/client.js";
import type { DebriefingConfigLancamento } from "../services/debriefing-config.js";
import type { PlanilhaDeVendaInput, VendaCruaInput } from "../services/debriefing-money-time-engine.js";

type Aba = { headers: string[]; rows: string[][] };
const PLANILHAS: Record<string, Aba> = {};
const leituras: string[] = [];
const lerFalso = async (spreadsheetId: string, sheetName: string) => {
  leituras.push(`${spreadsheetId}|${sheetName}`);
  const p = PLANILHAS[`${spreadsheetId}|${sheetName}`];
  if (!p) throw new Error(`Sheets data error (403): ${spreadsheetId}`);
  return { headers: [...p.headers], rows: p.rows.map((r) => [...r]) };
};
const readSheetData = vi.hoisted(() => vi.fn());
vi.mock("../services/google-sheets.js", () => ({ readSheetData }));

const { computeSurveyForStage } = await import("../services/survey-aggregation.js");
const { computeDebriefingMoneyTime } = await import("../services/debriefing-money-time-engine.js");
const { DebriefingDadoIndisponivelError } = await import("../services/debriefing-money-time-loader.js");
const { computeDebriefingAudience } = await import("../services/debriefing-audience-engine.js");
const { janelaDoDebriefing } = await import("../services/debriefing-hygiene.js");
const {
  chavesComResposta,
  contaDoAdsManager,
  conteudoDaPlanilhaDeVenda,
  higienizarVendasDoDebriefing,
  identidadesDeVenda,
  lerPesquisa,
  loadDebriefingAudienceInput,
  memoizarLeitura,
} = await import("../services/debriefing-audience-loader.js");

// ---------------------------------------------------------------------------
// Peças puras
// ---------------------------------------------------------------------------

describe("peças puras do loader", () => {
  it("memoizarLeitura: cada aba uma vez; falha não fica em cache", async () => {
    let chamadas = 0;
    let falhar = true;
    const ler = memoizarLeitura(async () => {
      chamadas += 1;
      if (falhar) throw new Error("Google fora");
      return { headers: ["a"], rows: [] };
    });
    await expect(ler("s", "x")).rejects.toThrow("Google fora");
    falhar = false;
    await ler("s", "x");
    await ler("s", "x");
    expect(chamadas).toBe(2);
  });

  it("lerPesquisa: colunas do Resumão (resolveColumnIndexes), linha vazia pela regra dele, célula crua, nome de campanha", () => {
    const r = lerPesquisa(
      {
        pesquisaId: "p1",
        stageId: "cap",
        rotulo: "Pesquisa / respostas",
        headers: ["Carimbo de data/hora", "E-mail", "WhatsApp", "Sexo", "Faixa 1", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"],
        rows: [
          ["17/04/2026 10:00:00", "A@x.com ", "553175058180.0", "Feminino", "A", "fb", "cpc", "111", "lp|hot|ad", "120000000000000001"],
          ["", "", "", "Masculino", "B", "", "", "", "", ""],
          ["", "", "", "", "", "", "", "", "", ""],
        ],
        mapping: { email: "E-mail", faixa: "Faixa 1", questions: [{ columnName: "Sexo", label: "Sexo", showInDashboard: true }] },
      },
      new Map([["111", "dg--vendas-captacao--hot"]]),
    );
    expect(r.pesquisa).toEqual({ pesquisaId: "p1", stageId: "cap", rotulo: "Pesquisa / respostas", temColunaEmail: true, chavesDePergunta: ["Sexo", "faixa"], cabecalhoDaChave: { Sexo: "Sexo", faixa: "Faixa 1" } });
    expect(r.respostas).toHaveLength(3); // o motor conta as vazias (AC2)
    expect(r.respostas.map((x) => x.linhaTemRespondente)).toEqual([true, false, false]);
    expect(r.respostas[0]).toMatchObject({
      emailCru: "A@x.com",
      telefoneCru: "553175058180.0",
      dataRespostaCru: "17/04/2026 10:00:00",
      utm: { source: "fb", medium: "cpc", campaign: "111", term: "lp|hot|ad", campaignName: "dg--vendas-captacao--hot" },
      utmContentCru: "120000000000000001",
      respostas: { Sexo: "Feminino", faixa: "A" },
    });
  });

  it("utm_content da venda por linha (1-based, como a 49.3); planilha sem a coluna → mapa vazio", () => {
    const m = conteudoDaPlanilhaDeVenda("cap:s1", ["Email", "co="], [["a@x.com", "120000000000000001"], ["b@x.com", ""]], {});
    expect([...m.entries()]).toEqual([
      ["cap:s1#1", "120000000000000001"],
      ["cap:s1#2", null],
    ]);
    expect(conteudoDaPlanilhaDeVenda("x", ["Email"], [["a"]], {}).size).toBe(0);
  });

  it("identidades do lançamento anterior: só status pago; transação reembolsada sai inteira", () => {
    const ids = identidadesDeVenda(
      "s",
      ["ID", "Email", "Telefone", "Status"],
      [
        ["T1", "a@x.com", "", "paid"],
        ["T2", "b@x.com", "", "paid"],
        ["T2", "b@x.com", "", "refunded"],
        ["T3", "c@x.com", "", "refused"],
        ["T4", "", "11 97777-6666", "paid"],
        ["T5", "", "", "paid"],
      ],
      { transactionId: "ID", email: "Email", telefone: "Telefone", status: "Status" },
    );
    expect(ids).toEqual([
      { emailCru: "a@x.com", telefoneCru: null },
      { emailCru: null, telefoneCru: "11 97777-6666" },
    ]);
  });

  it("conta do Ads Manager só com dígitos; chaves de pergunta com resposta", () => {
    expect([contaDoAdsManager("act_3717530711643512"), contaDoAdsManager("123"), contaDoAdsManager("abc"), contaDoAdsManager(null)]).toEqual([
      "3717530711643512",
      "123",
      null,
      null,
    ]);
    const mapping = { email: "E-mail", questions: [{ columnName: "Sexo", label: "Sexo", showInDashboard: true }, { columnName: "Idade", label: "Idade", showInDashboard: true }] };
    expect(chavesComResposta(["E-mail", "Sexo", "Idade"], [["a@x.com", "F", ""], ["", "", "30"]], mapping)).toEqual(["Sexo"]);
    // modo legado: a chave é o apelido e o cabeçalho, a pergunta — os dois entram
    expect(chavesComResposta(["E-mail", "Qual é sua renda mensal?"], [["a@x.com", "5 mil"]], { email: "E-mail" })).toEqual([
      "Qual é sua renda mensal?",
      "renda_mensal",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Diferencial de higiene: Motor II × Motor I sobre a MESMA entrada suja
// ---------------------------------------------------------------------------

describe("higiene de vendas = a sequência da 49.3 (compradoresCaptacao idêntico — 49.5 F3)", () => {
  const CAP = "cap";
  const PRIN = "prin";
  const planilhas: PlanilhaDeVendaInput[] = [
    { planilhaId: "cap:s1", stageId: CAP, nome: "captacao", plataforma: "capture", temColunaStatus: true, temColunaId: true, temColunaProduto: true },
    { planilhaId: "cap:tmb", stageId: CAP, nome: "tmb", plataforma: "tmb", temColunaStatus: false, temColunaId: false, temColunaProduto: true },
    { planilhaId: "prin:s1", stageId: PRIN, nome: "principal", plataforma: "main_product", temColunaStatus: true, temColunaId: true, temColunaProduto: true },
    { planilhaId: "outra:s1", stageId: "fora", nome: "fora", plataforma: "sales", temColunaStatus: false, temColunaId: false, temColunaProduto: false },
    // decisão 3A: vendas manuais chegam como uma "planilha" a mais da etapa (`lerVendasManuais`)
    { planilhaId: "cap:manual", stageId: CAP, nome: "Vendas manuais", plataforma: "manual", temColunaStatus: false, temColunaId: true, temColunaProduto: true },
  ];
  let n = 0;
  const v = (p: Partial<VendaCruaInput>): VendaCruaInput => ({
    planilhaId: "cap:s1",
    linha: ++n,
    idDaVendaCru: null,
    produto: "Imersão",
    tipo: "ingresso",
    tipoClassificado: true,
    valorBrutoCru: "99,00",
    moeda: null,
    statusCru: "paid",
    emailCru: null,
    telefoneCru: null,
    dataVendaCru: "20/04/2026",
    utm: {},
    sellerName: null,
    ...p,
  });
  const vendas: VendaCruaInput[] = [
    v({ idDaVendaCru: "K1", emailCru: "a@x.com" }),
    v({ idDaVendaCru: "K1", emailCru: "a@x.com" }), // camada 1
    v({ idDaVendaCru: "K2", emailCru: "b@x.com", produto: "Combo", tipo: "combo", valorBrutoCru: "296" }), // só Combo
    v({ idDaVendaCru: "K3", emailCru: "c@x.com", produto: "Gravação", tipo: "order_bump" }), // só bump
    v({ idDaVendaCru: "K4", emailCru: "d@x.com", statusCru: "refunded" }),
    v({ idDaVendaCru: "K4", emailCru: "d@x.com" }), // pareada com o reembolso
    v({ idDaVendaCru: "K5", emailCru: "e@x.com", valorBrutoCru: "-99" }),
    v({ idDaVendaCru: "K6", emailCru: "f@x.com", valorBrutoCru: "" }),
    v({ idDaVendaCru: "K7", emailCru: "g@x.com", dataVendaCru: "01/03/2026" }), // fora do período
    v({ idDaVendaCru: "K8", emailCru: "h@x.com", dataVendaCru: "" }), // sem dia: fica
    v({ idDaVendaCru: "K9", telefoneCru: "5511977776666.0" }), // sem e-mail: comprador próprio
    v({ idDaVendaCru: "K10", emailCru: "i@x.com" }),
    v({ idDaVendaCru: "K11", emailCru: "I@x.com " }), // camada 2 (e-mail + produto)
    v({ idDaVendaCru: "K12", emailCru: "l@x.com", telefoneCru: "11 97777-6666" }), // mesmo telefone do K9
    v({ idDaVendaCru: "K13", emailCru: "m@x.com", statusCru: "refused" }),
    v({ planilhaId: "cap:tmb", emailCru: "j@x.com", valorBrutoCru: "" }), // TMB sem valor conta
    v({ planilhaId: "prin:s1", idDaVendaCru: "P1", emailCru: "a@x.com", produto: "Mentoria", tipo: "principal", valorBrutoCru: "4.000", dataVendaCru: "15/05/2026" }),
    v({ planilhaId: "prin:s1", idDaVendaCru: "P2", emailCru: "k@x.com", produto: "Mentoria", tipo: "principal", valorBrutoCru: "4.000", dataVendaCru: "05/05/2026" }), // antes da abertura
    v({ planilhaId: "outra:s1", emailCru: "n@x.com" }), // etapa fora da config
    v({ planilhaId: "cap:manual", idDaVendaCru: "m-1", emailCru: "pix@x.com", statusCru: null, valorBrutoCru: "99,00" }), // PIX lançado à mão
    v({ planilhaId: "cap:manual", idDaVendaCru: "m-2", emailCru: "a@x.com", statusCru: null, valorBrutoCru: "99,00" }), // camada 2 com a planilha
  ];
  const config = {
    datasChave: {
      inicioCaptacao: "2026-04-17",
      aberturaCarrinho: "2026-05-11",
      fimCarrinho: "2026-05-15",
      reabertura: { houve: false as const },
      downsell: { houve: false as const },
    },
    etapas: [
      { stageId: CAP, papel: "vendas-captacao" as const },
      { stageId: PRIN, papel: "vendas-principal" as const },
    ],
    imposto: { valor: 0.1215, origem: "default" as const },
  };
  const classificador = {
    versao: CLASSIFICADOR_VERSAO,
    classificar: (e: Parameters<typeof classificarOrigem>[0]) =>
      classificarOrigem(e, { closerMediums: [], closerNomes: [], closerPorSellerName: false, ferramentasDeAtendimento: [] }),
  };

  it("as mesmas chaves nos dois critérios, linha a linha das armadilhas", () => {
    const motorI = computeDebriefingMoneyTime({ config, criterioDeUnico: "porEmail", planilhas, vendas, leads: [], midia: [], classificador });
    const higienizadas = higienizarVendasDoDebriefing({ config, planilhas, vendas });
    const motorII = computeDebriefingAudience({
      config: { perguntasConfirmadas: {}, dimensaoDeCriativo: "nenhuma", imposto: config.imposto },
      janela: janelaDoDebriefing(config.datasChave),
      pesquisas: [],
      respondentes: [],
      compradores: higienizadas,
      criativos: { anuncios: [], nomesDeAnuncio: {}, contaDeAnuncios: null },
      classificador,
    });
    expect(motorII.compradoresCaptacao).toEqual(motorI.compradoresCaptacao);
    // a, b (só Combo), h (sem dia), K9 (sem e-mail), i, l, j (TMB), pix (manual) — c (só bump) fica fora
    expect(motorII.compradoresCaptacao.porEmail).toHaveLength(8);
    expect(motorII.compradoresCaptacao.porEmailOuTelefone).toHaveLength(7); // K9 e l@ são a mesma pessoa pelo telefone
    expect(higienizadas.filter((x) => x.comprouPrincipal)).toHaveLength(motorI.vendasPrincipal);
    expect(higienizadas.find((x) => x.emailCru === "b@x.com")).toMatchObject({ comprouCaptacao: true, comprouTierSuperior: true });
    expect(higienizadas.find((x) => x.emailCru === "c@x.com")).toMatchObject({ comprouCaptacao: false, comprouTierSuperior: true });
  });
});

// ---------------------------------------------------------------------------
// I/O sobre PGlite
// ---------------------------------------------------------------------------

const P = "10000000-0000-4000-8000-000000000001";
const F = "20000000-0000-4000-8000-000000000001";
const F_ANT = "20000000-0000-4000-8000-000000000002";
const F_ANT2 = "20000000-0000-4000-8000-000000000003";
const CAP = "30000000-0000-4000-8000-000000000001";
const PRIN = "30000000-0000-4000-8000-000000000002";
const OUTRA = "30000000-0000-4000-8000-000000000003";
const CAP_ANT = "30000000-0000-4000-8000-000000000004";
const CAP_ANT2 = "30000000-0000-4000-8000-000000000005";
const ST_RESUMAO = "30000000-0000-4000-8000-000000000009";
const F_RESUMAO = "20000000-0000-4000-8000-000000000009";
const CONTA = "40000000-0000-4000-8000-000000000001";
const CONTA_P = "40000000-0000-4000-8000-000000000002";
const CONTA_P2 = "40000000-0000-4000-8000-000000000003";
const CONTA_INATIVA = "40000000-0000-4000-8000-000000000004";
const P_DUAS = "10000000-0000-4000-8000-000000000002";
const AD1 = "120000000000000001";
const AD2 = "120000000000000002";

const DDL = `
CREATE TABLE funnels (id uuid PRIMARY KEY, meta_account_id uuid);
CREATE TABLE meta_ads_accounts (id uuid PRIMARY KEY, meta_account_id varchar(50) NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE meta_ads_account_projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, project_id uuid NOT NULL);
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
  campaign_id varchar(64), campaign_name varchar(500), ad_name varchar(500),
  spend numeric NOT NULL DEFAULT 0, impressions numeric NOT NULL DEFAULT 0, actions jsonb
);
CREATE TABLE meta_entity_names_cache (
  project_id uuid NOT NULL, entity_type varchar(20) NOT NULL, entity_id varchar(64) NOT NULL, entity_name varchar(500) NOT NULL
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

const SEED = `
INSERT INTO meta_ads_accounts VALUES ('${CONTA}', '3717530711643512', true), ('${CONTA_P}', 'act_555000111', true),
  ('${CONTA_P2}', '777000222', true), ('${CONTA_INATIVA}', '999000333', false);
INSERT INTO meta_ads_account_projects (account_id, project_id) VALUES ('${CONTA_P}', '${P}'), ('${CONTA_INATIVA}', '${P}'),
  ('${CONTA_P}', '${P_DUAS}'), ('${CONTA_P2}', '${P_DUAS}');
INSERT INTO funnels VALUES ('${F}', '${CONTA}'), ('${F_ANT}', NULL), ('${F_ANT2}', NULL);
INSERT INTO funnel_stages VALUES
  ('${CAP}', '${F}', 'paid', '[{"id":"111","name":"dg--vendas-captacao--hot"}]'),
  ('${PRIN}', '${F}', 'sales', '[{"id":"222","name":"dg--vendas-principal--hot"}]'),
  ('${OUTRA}', '${F}', 'free', '[]'),
  ('${CAP_ANT}', '${F_ANT}', 'paid', '[]'),
  ('${CAP_ANT2}', '${F_ANT2}', 'paid', '[]');
INSERT INTO stage_sales_spreadsheets (stage_id, subtype, spreadsheet_id, sheet_name, column_mapping, product_types) VALUES
  ('${CAP}', 'capture', 'g-cap', 'n8n-captacao',
   '{"transactionId":"ID","email":"Email","telefone":"Telefone","productName":"Produto","valorBruto":"Preço","dataVenda":"Data","status":"Status","utm_source":"utm_source","utm_campaign":"utm_campaign","utm_content":"utm_content"}',
   '{"Imersão":"ingresso","Combo":"combo","Gravação":"order_bump"}'),
  ('${PRIN}', 'main_product', 'g-prin', 'vendas-principal',
   '{"transactionId":"ID","email":"Email","productName":"Produto","valorBruto":"Preço","dataVenda":"Data","status":"Status"}', NULL),
  ('${CAP_ANT}', 'capture', 'g-ant', 'vendas-anterior', '{"transactionId":"ID","email":"Email","status":"Status"}', NULL),
  ('${CAP_ANT2}', 'capture', 'g-ant2', 'vendas-anterior', '{"email":"Email"}', NULL);
INSERT INTO funnel_surveys (id, funnel_id, stage_id, spreadsheet_id, spreadsheet_name, sheet_name, column_mapping) VALUES
  ('50000000-0000-4000-8000-000000000001', '${F}', '${CAP}', 'g-pesq', 'Pesquisa', 'respostas',
   '{"email":"E-mail","faixa":"Faixa 1","utm_content":"utm_content","questions":[{"columnName":"Sexo","label":"Sexo","showInDashboard":true}]}'),
  ('50000000-0000-4000-8000-000000000002', '${F}', NULL, 'g-outra', 'Outra', 'x', '{}'),
  ('50000000-0000-4000-8000-000000000009', '${F_RESUMAO}', '${ST_RESUMAO}', 'g-resumao', 'Resumão', 'respostas',
   '{"email":"E-mail","faixa":"Faixa 1","utm_source":"utm_source","utm_content":"utm_content","questions":[{"columnName":"Sexo","label":"Sexo","showInDashboard":true}]}'),
  ('50000000-0000-4000-8000-000000000003', '${F_ANT}', '${CAP_ANT}', 'g-pesq-ant', 'Pesquisa PG01', 'respostas',
   '{"email":"E-mail","questions":[{"columnName":"Sexo","label":"Sexo","showInDashboard":true}]}');
INSERT INTO funnel_spreadsheets (funnel_id, stage_id, label, type, spreadsheet_id, spreadsheet_name, sheet_name, column_mapping) VALUES
  ('${F_ANT}', NULL, 'Leads PG01', 'leads', 'g-leads-ant', 'Leads', 'base', '{"email":"email","phone":"telefone"}');
INSERT INTO meta_ad_insights_daily VALUES
  ('${P}', '${AD1}', '2026-04-20', '111', 'dg--vendas-captacao--hot', 'dg-pg02-ia-01', 100, 1000, '[{"action_type":"link_click","value":"50"}]'),
  ('${P}', '${AD1}', '2026-03-01', '111', 'dg--vendas-captacao--hot', 'nome antigo', 999, 1, NULL),
  ('${P}', '${AD2}', '2026-04-21', '222', 'dg--vendas-principal--hot', 'dg-pg02-h-02', 300, 3000, NULL);
INSERT INTO meta_entity_names_cache VALUES
  ('${P}', 'ad', '${AD2}', 'nome-do-entity-cache'),
  ('${P}', 'ad', '120000000000000009', 'dg-pg02-h-09');
`;

const CAP_HEADERS = ["ID", "Email", "Telefone", "Produto", "Preço", "Data", "Status", "utm_source", "utm_campaign", "utm_content"];
Object.assign(PLANILHAS, {
  "g-cap|n8n-captacao": {
    headers: CAP_HEADERS,
    rows: [
      ["K1", "a@x.com", "", "Imersão", "99", "20/04/2026", "paid", "fb", "111", AD1],
      ["K2", "b@x.com", "11 97777-6666", "Combo", "296", "20/04/2026", "paid", "", "", "120000000000000009"],
      ["K3", "c@x.com", "", "Gravação", "197", "20/04/2026", "refunded", "", "", ""],
    ],
  },
  "g-prin|vendas-principal": {
    headers: ["ID", "Email", "Produto", "Preço", "Data", "Status"],
    rows: [["P1", "a@x.com", "Mentoria", "4.000", "15/05/2026", "paid"]],
  },
  "g-pesq|respostas": {
    headers: ["Carimbo de data/hora", "E-mail", "Telefone", "Sexo", "Faixa 1", "utm_source", "utm_campaign", "utm_term", "utm_content"],
    rows: [
      ["17/04/2026", "a@x.com", "", "Feminino", "A", "fb", "111", "", AD1],
      ["18/04/2026", "x@x.com", "(11) 97777-6666", "Masculino", "D", "", "", "", "org"],
      ["", "", "", "", "", "", "", "", ""],
    ],
  },
  "g-ant|vendas-anterior": {
    headers: ["ID", "Email", "Status"],
    rows: [
      ["A1", "b@x.com", "paid"],
      ["A2", "q@x.com", "refunded"],
    ],
  },
  "g-ant2|vendas-anterior": { headers: ["Email"], rows: [["a@x.com"]] },
  "g-leads-ant|base": {
    headers: ["email", "telefone"],
    rows: [
      ["a@x.com", ""],
      ["w@x.com", ""],
    ],
  },
  "g-pesq-ant|respostas": { headers: ["E-mail", "Sexo"], rows: [["a@x.com", "F"]] },
  "g-outra|x": { headers: ["E-mail"], rows: [] },
});

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
  lancamentoComparacaoFunnelId: F_ANT,
  etapas: [
    { stageId: CAP, papel: "vendas-captacao" },
    { stageId: PRIN, papel: "vendas-principal" },
  ],
  perguntasConfirmadas: { [CAP]: { faixa: "faixa", sexo: "Sexo" } },
  closerMediums: ["x1"],
  closerPorSellerName: false,
  ferramentasDeAtendimento: [],
  dimensaoDeCriativo: "ia-humano",
  imposto: { valor: 0.1215, origem: "default" },
  validado: true,
  validadoEm: null,
  validadoPor: null,
  avisos: [],
};
const janela = { inicio: "2026-04-17", fim: "2026-05-15", fimPor: "fimCarrinho" as const, regra: "teste" };

let pg: PGlite;
let db: Database;
/** Tempo para o PGlite subir (WASM + DDL + seed) sob carga — o default do vitest é 10 s. */
const PGLITE_BEFORE_ALL_TIMEOUT_MS = 60_000;

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
  readSheetData.mockImplementation(lerFalso);
  // REL-001 (gate 49.4): o default de 10 s do vitest estourou com load average 13 (PGlite sobe o WASM aqui).
}, PGLITE_BEFORE_ALL_TIMEOUT_MS);

afterAll(async () => {
  await pg?.close();
});

describe("AC11 — loadDebriefingAudienceInput sobre Postgres real", () => {
  it("pesquisa das etapas confirmadas; a sem etapa vai para o diagnóstico; cada aba lida UMA vez", async () => {
    leituras.length = 0;
    const r = await loadDebriefingAudienceInput(db, { config }, { lerPlanilha: lerFalso });
    expect(r.pesquisas.map((p) => [p.stageId, p.chavesDePergunta])).toEqual([[CAP, ["Sexo", "faixa"]]]);
    expect(r.respondentes).toHaveLength(3);
    expect(r.diagnostico.pesquisasForaDaConfig).toEqual([{ rotulo: "Outra / x", stageId: null }]);
    const repetidas = leituras.filter((l, i) => leituras.indexOf(l) !== i);
    expect(repetidas).toEqual([]);
    expect(r.respondentes[0]!.utm.campaignName).toBe("dg--vendas-captacao--hot"); // resolvedor da 49.3
  });

  it("vendas higienizadas com utm_content; status reembolsado fora; flags por tipo", async () => {
    const r = await loadDebriefingAudienceInput(db, { config }, { lerPlanilha: lerFalso });
    expect(r.compradores.map((c) => [c.grupo, c.comprouCaptacao, c.comprouPrincipal, c.comprouTierSuperior, c.utmContentCru])).toEqual([
      ["captacao", true, false, false, AD1],
      ["captacao", true, false, true, "120000000000000009"],
      ["principal", false, true, false, null],
    ]);
    expect(r.classificador.versao).toBe(CLASSIFICADOR_VERSAO);
  });

  it("vendas manuais (decisão 3A da 49.3): o PIX conta como comprador; sem utm_content, a fonte aparece no diagnóstico", async () => {
    await pg.exec(`INSERT INTO manual_sales (id, stage_id, customer_name, customer_email, customer_phone, value, product, seller_name, sale_date)
      VALUES ('60000000-0000-4000-8000-000000000001', '${CAP}', 'Cliente Pix', 'pix@x.com', NULL, 99.00, 'Imersão', 'Ana', '2026-04-25 15:00:00+00')`);
    try {
      const r = await loadDebriefingAudienceInput(db, { config }, { lerPlanilha: lerFalso });
      expect(r.compradores.filter((c) => c.comprouCaptacao)).toHaveLength(3);
      expect(r.diagnostico.planilhasDeVendaSemUtmContent).toEqual(["vendas-principal", "Vendas manuais"]); // a do principal não tem a coluna
      expect(computeDebriefingAudience(r).compradoresCaptacao.porEmail).toHaveLength(3);
    } finally {
      await pg.exec(`DELETE FROM manual_sales`);
    }
  });

  it("ad-level só das campanhas de captação e do período; nome: insight mais recente > entity cache; conta do funil", async () => {
    const r = await loadDebriefingAudienceInput(db, { config }, { lerPlanilha: lerFalso });
    expect(r.criativos.anuncios.map((a) => [a.adId, a.dia, a.spendBruto, a.linkClicks])).toEqual([[AD1, "2026-04-20", 100, 50]]);
    expect(r.criativos.nomesDeAnuncio).toEqual({ [AD1]: "dg-pg02-ia-01", "120000000000000009": "dg-pg02-h-09" });
    expect(r.criativos.contaDeAnuncios).toBe("3717530711643512");
    expect(r.diagnostico.contaDeAnuncios).toBe("funil");
  });

  it("funil sem conta (o caso de produção): a única conta ATIVA do projeto; projeto com duas contas → sem link", async () => {
    const semConta = { ...config, funnelId: F_ANT, etapas: [], perguntasConfirmadas: {}, lancamentoComparacaoFunnelId: null };
    const r = await loadDebriefingAudienceInput(db, { config: semConta }, { lerPlanilha: lerFalso });
    expect([r.criativos.contaDeAnuncios, r.diagnostico.contaDeAnuncios]).toEqual(["555000111", "projeto"]);
    const duas = await loadDebriefingAudienceInput(db, { config: { ...semConta, projectId: P_DUAS } }, { lerPlanilha: lerFalso });
    expect([duas.criativos.contaDeAnuncios, duas.diagnostico.contaDeAnuncios]).toEqual([null, "ambigua"]);
  });

  it("base anterior com planilha de leads: leads+compradores, só compradores pagos, série pela pesquisa do anterior", async () => {
    const r = await loadDebriefingAudienceInput(db, { config }, { lerPlanilha: lerFalso });
    expect(r.baseAnterior).toEqual({
      funnelId: F_ANT,
      tipo: "leads+compradores",
      leads: [
        { emailCru: "a@x.com", telefoneCru: null },
        { emailCru: "w@x.com", telefoneCru: null },
        { emailCru: "a@x.com", telefoneCru: null },
      ],
      compradores: [{ emailCru: "b@x.com", telefoneCru: null }],
      chavesDePerguntaComResposta: ["Sexo"],
    });
  });

  it("base anterior: venda manual não reembolsada também é comprador (decisão 3A)", async () => {
    await pg.exec(`INSERT INTO manual_sales (id, stage_id, customer_name, customer_email, customer_phone, value, product, seller_name, sale_date, refunded_at) VALUES
      ('60000000-0000-4000-8000-000000000002', '${CAP_ANT}', 'Pix Anterior', NULL, '11 95555-4444', 99.00, 'Imersão', 'Ana', '2026-04-25 15:00:00+00', NULL),
      ('60000000-0000-4000-8000-000000000003', '${CAP_ANT}', 'Reembolsado', 'r@x.com', NULL, 99.00, 'Imersão', 'Ana', '2026-04-25 15:00:00+00', '2026-04-26 10:00:00+00')`);
    try {
      const r = await loadDebriefingAudienceInput(db, { config }, { lerPlanilha: lerFalso });
      expect(r.baseAnterior!.compradores).toEqual([
        { emailCru: "b@x.com", telefoneCru: null },
        { emailCru: null, telefoneCru: "11 95555-4444" },
      ]);
      expect(r.diagnostico.baseAnterior).toMatchObject({ vendasManuais: 1 });
    } finally {
      await pg.exec(`DELETE FROM manual_sales`);
    }
  });

  it("base anterior SEM leads nem pesquisa: tipo compradores (o motor declara BASE_ANTERIOR_SEM_LEADS)", async () => {
    const r = await loadDebriefingAudienceInput(db, { config: { ...config, lancamentoComparacaoFunnelId: F_ANT2 } }, { lerPlanilha: lerFalso });
    expect(r.baseAnterior).toMatchObject({ tipo: "compradores", leads: [], chavesDePerguntaComResposta: null });
    const m = computeDebriefingAudience(r);
    expect(m.lacunas.map((l) => l.codigo)).toContain("BASE_ANTERIOR_SEM_LEADS");
  });

  it("falha de leitura ≠ ausência: pesquisa, venda ou base anterior quebrada lança DADO_INDISPONIVEL", async () => {
    for (const quebrada of ["g-pesq|respostas", "g-leads-ant|base", "g-ant|vendas-anterior"]) {
      const ler = (id: string, aba: string) =>
        `${id}|${aba}` === quebrada ? Promise.reject(new Error("Sheets data error (500)")) : lerFalso(id, aba);
      const erro = await loadDebriefingAudienceInput(db, { config }, { lerPlanilha: ler }).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(DebriefingDadoIndisponivelError);
      expect((erro as InstanceType<typeof DebriefingDadoIndisponivelError>).toResponse()).toMatchObject({ erro: "DADO_INDISPONIVEL" });
    }
  });

  it("TEST-002 (QA-M14): pesquisa de etapa do funil FORA da config não é lida nem conta — vai ao diagnóstico", async () => {
    PLANILHAS["g-pesq-outra|respostas"] = {
      headers: ["E-mail", "Faixa 1"],
      rows: [["fora@x.com", "A"]],
    };
    await pg.exec(`INSERT INTO funnel_surveys (id, funnel_id, stage_id, spreadsheet_id, spreadsheet_name, sheet_name, column_mapping) VALUES
      ('50000000-0000-4000-8000-000000000004', '${F}', '${OUTRA}', 'g-pesq-outra', 'Pesquisa Gratuita', 'respostas', '{"email":"E-mail","faixa":"Faixa 1"}')`);
    try {
      leituras.length = 0;
      const r = await loadDebriefingAudienceInput(db, { config }, { lerPlanilha: lerFalso });
      expect(r.diagnostico.pesquisasForaDaConfig).toContainEqual({ rotulo: "Pesquisa Gratuita / respostas", stageId: OUTRA });
      expect(r.pesquisas.map((p) => p.stageId)).toEqual([CAP]);
      expect(r.respondentes).toHaveLength(3);
      expect(leituras).not.toContain("g-pesq-outra|respostas");
    } finally {
      await pg.exec(`DELETE FROM funnel_surveys WHERE id = '50000000-0000-4000-8000-000000000004'`);
      delete PLANILHAS["g-pesq-outra|respostas"];
    }
  });

  it("DEC-OWNER-1 (mecanismo): pesquisasExcluidas tira a pesquisa da etapa; sem o parâmetro nada muda", async () => {
    const PESQ_ID = "50000000-0000-4000-8000-000000000001";
    const padrao = await loadDebriefingAudienceInput(db, { config }, { lerPlanilha: lerFalso });
    const vazio = await loadDebriefingAudienceInput(db, { config, pesquisasExcluidas: [] }, { lerPlanilha: lerFalso });
    // o classificador é uma closure nova por carga: compara-se o que sai dele (o motor), não a função
    expect(JSON.stringify(computeDebriefingAudience(vazio))).toBe(JSON.stringify(computeDebriefingAudience(padrao)));
    expect(vazio.diagnostico).toEqual(padrao.diagnostico);
    expect(padrao.diagnostico.pesquisasExcluidas).toEqual([]);
    leituras.length = 0;
    const sem = await loadDebriefingAudienceInput(db, { config, pesquisasExcluidas: [PESQ_ID] }, { lerPlanilha: lerFalso });
    expect(sem.pesquisas).toEqual([]);
    expect(sem.respondentes).toEqual([]);
    expect(sem.diagnostico.pesquisasExcluidas).toEqual([{ pesquisaId: PESQ_ID, rotulo: "Pesquisa / respostas", stageId: CAP }]);
    expect(sem.compradores).toEqual(padrao.compradores); // as vendas não dependem da pesquisa
  });

  it("ponta a ponta: casamento por telefone, taxa de resposta, cross-launch e nenhum dado pessoal no payload", async () => {
    const r = computeDebriefingAudience(await loadDebriefingAudienceInput(db, { config }, { lerPlanilha: lerFalso }));
    expect(r.pesquisa).toMatchObject({ linhasLidas: 3, vazias: 1, duplicadasRemovidas: 0, respondentes: 2 });
    expect(r.casamento).toEqual({ porEmail: 1, porTelefone: 1, semMatch: 0 }); // x@ casa com b@ pelo telefone
    expect(r.taxaDeResposta).toMatchObject({ numerador: 2, denominador: 2 });
    expect(r.crossLaunch.jaEmBaseAnterior.captacao).toMatchObject({ numerador: 2, denominador: 2 });
    expect(r.criativoXFaixa.criativos[0]).toMatchObject({
      nome: "dg-pg02-ia-01",
      linkAdsManager: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=3717530711643512&selected_ad_ids=${AD1}`,
    });
    expect(JSON.stringify(r)).not.toMatch(/@x\.com|97777/);
  });
});

describe("merge da 49.3 iteração 2 (REL-001 herdado) — a aba ligada a duas etapas entra UMA vez no Motor II", () => {
  const LC = "30000000-0000-4000-8000-0000000000a1";
  const VC = "30000000-0000-4000-8000-0000000000a2";
  const cfgDup: DebriefingConfigLancamento = {
    ...config,
    etapas: [
      { stageId: LC, papel: "leads-captacao" }, // a cópia SEM ID/produto vem primeiro na config
      { stageId: VC, papel: "vendas-captacao" },
      { stageId: PRIN, papel: "vendas-principal" },
    ],
    perguntasConfirmadas: {},
    lancamentoComparacaoFunnelId: null,
  };

  it("vale o vínculo que o Motor I leu: linhas uma vez, compradoresCaptacao = 49.3, utm_content e diagnóstico do vínculo certo", async () => {
    PLANILHAS["g-dup|n8n-dup"] = {
      headers: ["ID", "Email", "Telefone", "Produto", "Preço", "Data", "Status", "conteudo"],
      rows: [
        ["D1", "", "11 96666-5555", "Imersão", "99", "20/04/2026", "paid", AD1], // sem e-mail: a camada 2 não a pegaria
        ["D2", "dup@x.com", "", "Imersão", "99", "20/04/2026", "paid", ""],
      ],
    };
    await pg.exec(`INSERT INTO funnel_stages VALUES ('${LC}', '${F}', 'paid', '[]'), ('${VC}', '${F}', 'paid', '[]');
      INSERT INTO stage_sales_spreadsheets (stage_id, subtype, spreadsheet_id, sheet_name, column_mapping, product_types) VALUES
        ('${LC}', 'capture', 'g-dup', 'n8n-dup', '{"email":"Email","telefone":"Telefone","valorBruto":"Preço","dataVenda":"Data","status":"Status"}', NULL),
        ('${VC}', 'capture', 'g-dup', 'n8n-dup',
         '{"transactionId":"ID","email":"Email","telefone":"Telefone","productName":"Produto","valorBruto":"Preço","dataVenda":"Data","status":"Status","utm_content":"conteudo"}',
         '{"Imersão":"ingresso"}');`);
    try {
      const { loadDebriefingMoneyTimeInput } = await import("../services/debriefing-money-time-loader.js");
      const mt = await loadDebriefingMoneyTimeInput(db, { config: cfgDup }, { lerPlanilha: lerFalso });
      expect(mt.diagnostico.fontesDuplicadas.map((f) => [f.aba, f.stageIdQueVale])).toEqual([["n8n-dup", VC]]);

      const r = await loadDebriefingAudienceInput(db, { config: cfgDup }, { lerPlanilha: lerFalso });
      const daAba = r.compradores.filter((c) => c.grupo === "captacao");
      expect(daAba).toHaveLength(2); // sem o REL-001 da 49.3: 4 (a aba entrava pelas duas etapas)
      expect(daAba.every((c) => c.planilhaId === mt.diagnostico.fontesDuplicadas[0]!.vale)).toBe(true);
      expect(daAba.map((c) => [c.comprouCaptacao, c.utmContentCru])).toEqual([
        [true, AD1],
        [true, null],
      ]);
      // o vínculo descartado (sem utm_content mapeado) não é relido — nem aparece como fonte sem utm_content
      expect(r.diagnostico.planilhasDeVendaSemUtmContent).not.toContain("n8n-dup");

      const motorII = computeDebriefingAudience(r);
      const motorI = computeDebriefingMoneyTime({ ...mt, criterioDeUnico: "porEmail" });
      expect(motorII.compradoresCaptacao).toEqual(motorI.compradoresCaptacao);
      expect(motorII.compradoresCaptacao.porEmail).toHaveLength(2);
    } finally {
      await pg.exec(`DELETE FROM stage_sales_spreadsheets WHERE stage_id IN ('${LC}', '${VC}'); DELETE FROM funnel_stages WHERE id IN ('${LC}', '${VC}');`);
      delete PLANILHAS["g-dup|n8n-dup"];
    }
  });
});

// ---------------------------------------------------------------------------
// AC12 (b) e decisão 9 — o Resumão (`computeSurveyForStage`)
// ---------------------------------------------------------------------------

const PESQ_RESUMAO: Aba = {
  headers: ["Carimbo de data/hora", "E-mail", "Sexo", "Faixa 1", "utm_source", "utm_term", "utm_content"],
  rows: [
    ["17/04/2026", "a@x.com", "Feminino", "A", "meta", "hot", "120000000000000001"],
    ["17/04/2026", "b@x.com", "feminino ", "B", "meta", "cold", "120000000000000001"],
    ["18/04/2026", "c@x.com", "Masculino", "D", "ig", "", "org"],
    ["18/04/2026", "d@x.com", "", "C", "", "", ""],
    ["", "", "", "", "", "", ""],
  ],
};
const MAPPING_RESUMAO = {
  email: "E-mail",
  faixa: "Faixa 1",
  utm_source: "utm_source",
  utm_content: "utm_content",
  questions: [{ columnName: "Sexo", label: "Sexo", showInDashboard: true }],
};

describe("AC12 (b) — computeSurveyForStage devolve o MESMO payload depois do export", () => {
  it("snapshot gravado com a função ainda não exportada", async () => {
    PLANILHAS["g-resumao|respostas"] = PESQ_RESUMAO;
    const payload = await computeSurveyForStage(db, ST_RESUMAO);
    expect(payload).toMatchInlineSnapshot(`
      {
        "byAdId": {
          "120000000000000001": {
            "Sexo": [
              {
                "count": 2,
                "label": "Feminino",
              },
            ],
            "faixa": [
              {
                "count": 1,
                "label": "A",
              },
              {
                "count": 1,
                "label": "B",
              },
            ],
          },
        },
        "byQuestion": {
          "Sexo": [
            {
              "count": 2,
              "label": "Feminino",
              "pct": 50,
            },
            {
              "count": 1,
              "label": "Masculino",
              "pct": 25,
            },
          ],
          "faixa": [
            {
              "count": 1,
              "label": "A",
              "pct": 25,
            },
            {
              "count": 1,
              "label": "B",
              "pct": 25,
            },
            {
              "count": 1,
              "label": "D",
              "pct": 25,
            },
            {
              "count": 1,
              "label": "C",
              "pct": 25,
            },
          ],
        },
        "byQuestionByOrigin": {
          "organico": {
            "Sexo": [
              {
                "count": 1,
                "label": "Masculino",
                "pct": 50,
              },
            ],
            "faixa": [
              {
                "count": 1,
                "label": "D",
                "pct": 50,
              },
              {
                "count": 1,
                "label": "C",
                "pct": 50,
              },
            ],
          },
          "pago": {
            "Sexo": [
              {
                "count": 2,
                "label": "Feminino",
                "pct": 100,
              },
            ],
            "faixa": [
              {
                "count": 1,
                "label": "A",
                "pct": 50,
              },
              {
                "count": 1,
                "label": "B",
                "pct": 50,
              },
            ],
          },
          "total": {
            "Sexo": [
              {
                "count": 2,
                "label": "Feminino",
                "pct": 50,
              },
              {
                "count": 1,
                "label": "Masculino",
                "pct": 25,
              },
            ],
            "faixa": [
              {
                "count": 1,
                "label": "A",
                "pct": 25,
              },
              {
                "count": 1,
                "label": "B",
                "pct": 25,
              },
              {
                "count": 1,
                "label": "D",
                "pct": 25,
              },
              {
                "count": 1,
                "label": "C",
                "pct": 25,
              },
            ],
          },
        },
        "byQuestionByTerm": {
          "organico": {
            "Sexo": [
              {
                "count": 1,
                "label": "Masculino",
                "pct": 100,
              },
            ],
            "faixa": [
              {
                "count": 1,
                "label": "D",
                "pct": 100,
              },
            ],
          },
          "pagoCold": {
            "Sexo": [
              {
                "count": 1,
                "label": "feminino",
                "pct": 100,
              },
            ],
            "faixa": [
              {
                "count": 1,
                "label": "B",
                "pct": 100,
              },
            ],
          },
          "pagoHot": {
            "Sexo": [
              {
                "count": 1,
                "label": "Feminino",
                "pct": 100,
              },
            ],
            "faixa": [
              {
                "count": 1,
                "label": "A",
                "pct": 100,
              },
            ],
          },
          "pagoTotal": {
            "Sexo": [
              {
                "count": 2,
                "label": "Feminino",
                "pct": 100,
              },
            ],
            "faixa": [
              {
                "count": 1,
                "label": "A",
                "pct": 50,
              },
              {
                "count": 1,
                "label": "B",
                "pct": 50,
              },
            ],
          },
          "total": {
            "Sexo": [
              {
                "count": 2,
                "label": "Feminino",
                "pct": 50,
              },
              {
                "count": 1,
                "label": "Masculino",
                "pct": 25,
              },
            ],
            "faixa": [
              {
                "count": 1,
                "label": "A",
                "pct": 25,
              },
              {
                "count": 1,
                "label": "B",
                "pct": 25,
              },
              {
                "count": 1,
                "label": "D",
                "pct": 25,
              },
              {
                "count": 1,
                "label": "C",
                "pct": 25,
              },
            ],
          },
        },
        "questions": [
          {
            "key": "Sexo",
            "label": "Sexo",
          },
          {
            "key": "faixa",
            "label": "Faixa (lead score)",
          },
        ],
        "termDenominators": {
          "organico": 1,
          "pagoCold": 1,
          "pagoHot": 1,
          "pagoTotal": 2,
          "total": 4,
        },
        "totalResponses": 4,
        "usingFallback": false,
      }
    `);
  });
});

describe("decisão 9 — diferencial contra o Resumão: mesmo % sem e-mail repetido; com repetido, só o n difere", () => {
  const motorSobre = (aba: Aba) => {
    const lida = lerPesquisa(
      { pesquisaId: "p", stageId: ST_RESUMAO, rotulo: "Resumão / respostas", headers: aba.headers, rows: aba.rows, mapping: MAPPING_RESUMAO },
      new Map(),
    );
    return computeDebriefingAudience({
      config: { perguntasConfirmadas: { [ST_RESUMAO]: { faixa: "faixa", sexo: "Sexo" } }, dimensaoDeCriativo: "nenhuma", imposto: config.imposto },
      janela,
      pesquisas: [lida.pesquisa],
      respondentes: lida.respostas,
      compradores: [],
      criativos: { anuncios: [], nomesDeAnuncio: {}, contaDeAnuncios: null },
      classificador: {
        versao: CLASSIFICADOR_VERSAO,
        classificar: (e) => classificarOrigem(e, { closerMediums: [], closerNomes: [], closerPorSellerName: false, ferramentasDeAtendimento: [] }),
      },
    });
  };

  it("sem e-mail repetido: n e % de cada valor coincidem com o byQuestion do Resumão", async () => {
    PLANILHAS["g-resumao|respostas"] = PESQ_RESUMAO;
    const resumao = (await computeSurveyForStage(db, ST_RESUMAO))!;
    const motor = motorSobre(PESQ_RESUMAO);
    expect(resumao.totalResponses).toBe(motor.pesquisa.respondentes);
    for (const campo of ["sexo", "faixa"] as const) {
      const dim = motor.dimensoes.find((d) => d.campo === campo)!;
      const doResumao = resumao.byQuestion[campo === "sexo" ? "Sexo" : "faixa"]!;
      // Empate de contagem: o Resumão mantém a ordem de chegada, o motor ordena pelo rótulo — compara como conjunto.
      const porRotulo = (a: unknown[], b: unknown[]) => String(a[0]).localeCompare(String(b[0]));
      expect(dim.total.valores.map((v) => [v.rotulo, v.n, v.pct.valor]).sort(porRotulo)).toEqual(
        doResumao.map((d) => [d.label, d.count, d.pct]).sort(porRotulo),
      );
    }
  });

  it("com e-mail repetido: o motor deduplica (n menor) e a diferença é só o n", async () => {
    const comRepetido: Aba = { ...PESQ_RESUMAO, rows: [...PESQ_RESUMAO.rows, ["19/04/2026", "a@x.com", "Masculino", "A", "meta", "hot", ""]] };
    PLANILHAS["g-resumao|respostas"] = comRepetido;
    const resumao = (await computeSurveyForStage(db, ST_RESUMAO))!;
    const motor = motorSobre(comRepetido);
    expect(resumao.totalResponses).toBe(5);
    expect(motor.pesquisa).toMatchObject({ respondentes: 4, duplicadasRemovidas: 1 });
    PLANILHAS["g-resumao|respostas"] = PESQ_RESUMAO;
  });
});

// ---------------------------------------------------------------------------
// Story 49.11 — série histórica com a LISTA de comparação (AC8) e a pesquisa
// de captação marcada (AC10 d). Acréscimo: os testes acima não mudam.
// ---------------------------------------------------------------------------

describe("Story 49.11 — loader: uma série por lançamento da lista; a base anterior é só a principal", () => {
  const F_ANT3 = "20000000-0000-4000-8000-0000000000b3";
  const PESQ_ANT3 = "50000000-0000-4000-8000-0000000000b1";
  const PESQ_ID = "50000000-0000-4000-8000-000000000001";

  beforeAll(async () => {
    await pg.exec(`
      ALTER TABLE funnels ADD COLUMN IF NOT EXISTS name varchar(255);
      UPDATE funnels SET name = 'xx-pg01' WHERE id = '${F_ANT}';
      UPDATE funnels SET name = 'xx-pg00' WHERE id = '${F_ANT2}';
      INSERT INTO funnels (id, meta_account_id, name) VALUES ('${F_ANT3}', NULL, 'xx-pg03');
      INSERT INTO funnel_surveys (id, funnel_id, stage_id, spreadsheet_id, spreadsheet_name, sheet_name, column_mapping) VALUES
        ('${PESQ_ANT3}', '${F_ANT3}', NULL, 'g-pesq-ant3', 'Pesquisa PG03', 'respostas',
         '{"email":"E-mail","faixa":"Faixa","questions":[{"columnName":"Qual seu sexo?","label":"Sexo","showInDashboard":true}]}');
    `);
    PLANILHAS["g-pesq-ant3|respostas"] = { headers: ["E-mail", "Faixa", "Qual seu sexo?"], rows: [["k@x.com", "A", ""]] };
  }, PGLITE_BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    delete PLANILHAS["g-pesq-ant3|respostas"];
  });

  const comLista = (lista: string[]): DebriefingConfigLancamento => ({ ...config, lancamentoComparacaoFunnelId: lista[0] ?? null, lancamentosComparacao: lista });

  it("(a, b) chaves por lançamento, na ordem da lista, com o nome; sem pesquisa = null; cada aba lida UMA vez", async () => {
    leituras.length = 0;
    const r = await loadDebriefingAudienceInput(db, { config: comLista([F_ANT, F_ANT3, F_ANT2]) }, { lerPlanilha: lerFalso });
    expect(r.seriesDeComparacao).toEqual([
      { funnelId: F_ANT, nome: "xx-pg01", chavesDePerguntaComResposta: ["Sexo"] },
      { funnelId: F_ANT3, nome: "xx-pg03", chavesDePerguntaComResposta: ["Faixa", "faixa"] }, // sexo sem resposta não conta
      { funnelId: F_ANT2, nome: "xx-pg00", chavesDePerguntaComResposta: null },
    ]);
    expect(leituras.filter((l, i) => leituras.indexOf(l) !== i)).toEqual([]);
    const m = computeDebriefingAudience(r);
    expect(m.serieHistorica?.lancamentos.map((l) => [l.funnelId, l.posicao, l.principal])).toEqual([
      [F_ANT, 1, true],
      [F_ANT3, 2, false],
      [F_ANT2, 3, false],
    ]);
    expect(m.dimensoes.every((d) => d.serieHistoricaMotivo === "COMPARACAO_SEM_PESQUISA" && d.lancamentosSemPesquisa?.[0] === F_ANT2)).toBe(true);
  });

  it("(e) base anterior e cross-launch = só a principal: idênticos aos de n = 1", async () => {
    const n1 = await loadDebriefingAudienceInput(db, { config }, { lerPlanilha: lerFalso });
    const n3 = await loadDebriefingAudienceInput(db, { config: comLista([F_ANT, F_ANT3, F_ANT2]) }, { lerPlanilha: lerFalso });
    expect(n3.baseAnterior).toEqual(n1.baseAnterior);
    expect(n3.diagnostico.baseAnterior).toEqual(n1.diagnostico.baseAnterior);
    expect(computeDebriefingAudience(n3).crossLaunch).toEqual(computeDebriefingAudience(n1).crossLaunch);
    // n = 1 pelo contrato novo: a série de 1 item e o MESMO payload do contrato antigo
    const novo1 = await loadDebriefingAudienceInput(db, { config: comLista([F_ANT]) }, { lerPlanilha: lerFalso });
    expect(novo1.seriesDeComparacao).toEqual([{ funnelId: F_ANT, nome: null, chavesDePerguntaComResposta: ["Sexo"] }]);
    expect(JSON.stringify(computeDebriefingAudience(novo1))).toBe(JSON.stringify(computeDebriefingAudience(n1)));
  });

  it("(a) falha de leitura de QUALQUER lançamento da lista = DADO_INDISPONIVEL, nunca 'sem série'", async () => {
    const ler = (id: string, aba: string) => (id === "g-pesq-ant3" ? Promise.reject(new Error("Sheets data error (500)")) : lerFalso(id, aba));
    const erro = await loadDebriefingAudienceInput(db, { config: comLista([F_ANT, F_ANT3]) }, { lerPlanilha: ler }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(DebriefingDadoIndisponivelError);
    expect((erro as InstanceType<typeof DebriefingDadoIndisponivelError>).detalhe).toContain("a pesquisa do lançamento de comparação");
  });

  it("(a) sem chamada nova à Meta: o loader não importa cliente da Meta nem faz fetch", () => {
    const fonte = readFileSync(fileURLToPath(new URL("../services/debriefing-audience-loader.ts", import.meta.url)), "utf8");
    expect(fonte).not.toMatch(/\bfetch\(|graph\.facebook|from "\.\/meta-(api|graph|client)/);
  });

  it("AC10 (d) — a pesquisa marcada em pesquisaDeCaptacaoPorEtapa sai marcada (por id, não por nome de aba)", async () => {
    const sem = await loadDebriefingAudienceInput(db, { config }, { lerPlanilha: lerFalso });
    expect(sem.pesquisas[0]!.pesquisaDeCaptacao).toBeUndefined();
    const marcada = await loadDebriefingAudienceInput(db, { config: { ...config, pesquisaDeCaptacaoPorEtapa: { [CAP]: PESQ_ID } } }, { lerPlanilha: lerFalso });
    expect(marcada.pesquisas.map((p) => [p.pesquisaId, p.pesquisaDeCaptacao])).toEqual([[PESQ_ID, true]]);
    const outra = await loadDebriefingAudienceInput(db, { config: { ...config, pesquisaDeCaptacaoPorEtapa: { [CAP]: PESQ_ANT3 } } }, { lerPlanilha: lerFalso });
    expect(outra.pesquisas[0]!.pesquisaDeCaptacao).toBeUndefined();
  });
});
