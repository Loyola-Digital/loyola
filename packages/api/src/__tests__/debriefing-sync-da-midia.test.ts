/**
 * Story 49.12 — QA TEST-003 e REL-002: a leitura SQL do AC15
 * (`lerEstadoDoSyncDaMidia`) sobre Postgres de verdade (PGlite), com várias
 * contas: as das etapas e a do funil, o filtro por projeto, o fallback para as
 * contas ativas do projeto e a conta que a etapa aponta mas que NÃO está
 * vinculada ao projeto (o sync nunca a percorre — esperar não resolve).
 * Só as colunas que as consultas nomeiam (o Drizzle não lê as outras).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema.js";
import type { Database } from "../db/client.js";
import { contasAtrasadasNoCorte, gerarDebriefing, lerEstadoDoSyncDaMidia, type DependenciasDaGeracao } from "../services/debriefing-generate.js";
import type { DebriefingConfigLancamento, DebriefingConfigLancamentoEmAndamento } from "../services/debriefing-config.js";
import { configSintetica } from "./fixtures/debriefing-payload-sintetico.js";

const P = "10000000-0000-4000-8000-000000000001";
const P2 = "10000000-0000-4000-8000-000000000002";
const F = "20000000-0000-4000-8000-000000000001";
const S_CAP = "30000000-0000-4000-8000-000000000001";
const S_PRIN = "30000000-0000-4000-8000-000000000002";
const S_DEB = "30000000-0000-4000-8000-000000000003";
const A = { emDia: "a0000000-0000-4000-8000-000000000001", atrasada: "a0000000-0000-4000-8000-000000000002", parada: "a0000000-0000-4000-8000-000000000003", foraDoProjeto: "a0000000-0000-4000-8000-000000000004", inativa: "a0000000-0000-4000-8000-000000000005" };
const CORTE = "2026-10-06"; // fim do dia em Brasília = 2026-10-07T03:00Z

const DDL = `
CREATE TABLE meta_ads_accounts (id uuid PRIMARY KEY, account_name varchar(100) NOT NULL, meta_account_id varchar(50) NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE meta_ads_account_projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES meta_ads_accounts(id), project_id uuid NOT NULL);
CREATE TABLE funnels (id uuid PRIMARY KEY, meta_account_id uuid REFERENCES meta_ads_accounts(id));
CREATE TABLE funnel_stages (id uuid PRIMARY KEY, meta_account_id uuid REFERENCES meta_ads_accounts(id));
CREATE TABLE meta_sync_state (
  project_id uuid NOT NULL, account_id varchar(64) NOT NULL, kind varchar(32) NOT NULL,
  last_run_at timestamptz, last_success_at timestamptz, PRIMARY KEY (project_id, account_id, kind)
);
`;

let pg: PGlite;
let db: Database;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  db = drizzle(pg, { schema }) as unknown as Database;
}, 180_000);

afterAll(async () => {
  await pg?.close();
});

beforeEach(async () => {
  await pg.exec("TRUNCATE meta_sync_state, funnel_stages, funnels, meta_ads_account_projects, meta_ads_accounts CASCADE;");
  await pg.exec(`
    INSERT INTO meta_ads_accounts VALUES
      ('${A.emDia}', 'Conta em dia', '111', true), ('${A.atrasada}', 'Conta atrasada', '222', true),
      ('${A.parada}', 'Conta parada', '333', true), ('${A.foraDoProjeto}', 'Conta de outro projeto', '444', true),
      ('${A.inativa}', 'Conta inativa', '555', false);
    INSERT INTO meta_ads_account_projects (account_id, project_id) VALUES
      ('${A.emDia}', '${P}'), ('${A.atrasada}', '${P}'), ('${A.parada}', '${P}'), ('${A.inativa}', '${P}'), ('${A.foraDoProjeto}', '${P2}');
    INSERT INTO meta_sync_state VALUES
      ('${P}', '111', 'ad-daily', '2026-10-07T10:00Z', '2026-10-07T10:00Z'),
      ('${P}', '111', 'campaign-daily', '2026-10-07T10:00Z', '2026-10-07T10:00Z'),
      ('${P}', '222', 'ad-daily', '2026-10-06T20:00Z', '2026-10-06T20:00Z'),
      ('${P}', '333', 'ad-daily', '2026-10-07T10:00Z', '2026-10-07T10:00Z'),
      ('${P}', '333', 'campaign-daily', '2026-09-20T10:00Z', '2026-09-20T10:00Z'),
      -- estado de OUTRO projeto para a conta atrasada: não pode liberá-la
      ('${P2}', '222', 'ad-daily', '2026-10-07T10:00Z', '2026-10-07T10:00Z'),
      ('${P2}', '444', 'ad-daily', '2026-10-07T10:00Z', '2026-10-07T10:00Z');
  `);
});

function config(etapas: { stageId: string }[]): DebriefingConfigLancamento {
  return { ...configSintetica(), projectId: P, funnelId: F, etapas: etapas.map((e) => ({ stageId: e.stageId, papel: "vendas-captacao" as const })) };
}

describe("QA TEST-003 — lerEstadoDoSyncDaMidia (SQL das contas, Postgres real)", () => {
  it("contas das etapas + a do funil, estado só do projeto: em dia passa; atrasada e (conta parada não) bloqueiam", async () => {
    await pg.exec(`
      INSERT INTO funnels VALUES ('${F}', '${A.atrasada}');
      INSERT INTO funnel_stages VALUES ('${S_CAP}', '${A.emDia}'), ('${S_PRIN}', '${A.parada}'), ('${S_DEB}', NULL);
    `);
    const estado = await lerEstadoDoSyncDaMidia(db, config([{ stageId: S_CAP }, { stageId: S_PRIN }]));
    expect(estado).toEqual([
      { accountId: "111", nome: "Conta em dia", adDaily: { lastSuccessAt: "2026-10-07T10:00:00.000Z" }, campaignDaily: { lastRunAt: "2026-10-07T10:00:00.000Z", lastSuccessAt: "2026-10-07T10:00:00.000Z" }, vinculadaAoProjeto: true },
      { accountId: "222", nome: "Conta atrasada", adDaily: { lastSuccessAt: "2026-10-06T20:00:00.000Z" }, campaignDaily: null, vinculadaAoProjeto: true },
      { accountId: "333", nome: "Conta parada", adDaily: { lastSuccessAt: "2026-10-07T10:00:00.000Z" }, campaignDaily: { lastRunAt: "2026-09-20T10:00:00.000Z", lastSuccessAt: "2026-09-20T10:00:00.000Z" }, vinculadaAoProjeto: true },
    ]);
    expect(contasAtrasadasNoCorte(estado, CORTE).map((a) => a.accountId)).toEqual(["222"]);
  });

  it("a mesma conta em duas etapas e no funil aparece UMA vez", async () => {
    await pg.exec(`INSERT INTO funnels VALUES ('${F}', '${A.emDia}'); INSERT INTO funnel_stages VALUES ('${S_CAP}', '${A.emDia}'), ('${S_PRIN}', '${A.emDia}');`);
    expect((await lerEstadoDoSyncDaMidia(db, config([{ stageId: S_CAP }, { stageId: S_PRIN }]))).map((c) => c.accountId)).toEqual(["111"]);
  });

  it("sem conta na etapa nem no funil: as contas ATIVAS do projeto (a inativa e a de outro projeto ficam fora)", async () => {
    await pg.exec(`INSERT INTO funnels VALUES ('${F}', NULL); INSERT INTO funnel_stages VALUES ('${S_CAP}', NULL);`);
    const estado = await lerEstadoDoSyncDaMidia(db, config([{ stageId: S_CAP }]));
    expect(estado.map((c) => c.accountId)).toEqual(["111", "222", "333"]);
    expect(contasAtrasadasNoCorte(estado, CORTE).map((a) => a.accountId)).toEqual(["222"]);
  });

  it("REL-002 — conta da etapa que não está vinculada ao projeto: marcada fora do projeto (o estado de outro projeto não conta)", async () => {
    await pg.exec(`INSERT INTO funnels VALUES ('${F}', NULL); INSERT INTO funnel_stages VALUES ('${S_CAP}', '${A.foraDoProjeto}'), ('${S_PRIN}', '${A.emDia}');`);
    const estado = await lerEstadoDoSyncDaMidia(db, config([{ stageId: S_CAP }, { stageId: S_PRIN }]));
    expect(estado.find((c) => c.accountId === "444")).toEqual({ accountId: "444", nome: "Conta de outro projeto", adDaily: null, campaignDaily: null, vinculadaAoProjeto: false });
    expect(contasAtrasadasNoCorte(estado, CORTE)).toEqual([
      { accountId: "444", nome: "Conta de outro projeto", situacao: "não está vinculada ao projeto — o sync da Meta não a percorre", foraDoProjeto: true },
    ]);
  });
});

describe("QA REL-002 — a ação do 422 diz o que fazer com a conta fora do projeto", () => {
  async function gerar(contas: { stageId: string; conta: string | null }[]) {
    await pg.exec(`INSERT INTO funnels VALUES ('${F}', NULL);`);
    for (const c of contas) await pg.exec(`INSERT INTO funnel_stages VALUES ('${c.stageId}', ${c.conta ? `'${c.conta}'` : "NULL"});`);
    const s = configSintetica();
    const cfg: DebriefingConfigLancamentoEmAndamento = {
      ...s,
      projectId: P,
      funnelId: F,
      stageId: S_DEB,
      etapas: contas.map((c) => ({ stageId: c.stageId, papel: "vendas-captacao" as const })),
      situacaoDoLancamento: "em-andamento",
      datasChave: { inicioCaptacao: "2026-09-30", aberturaCarrinho: null, fimCarrinho: null, reabertura: null, downsell: null },
      aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "reabertura", "downsell"],
    };
    const deps: DependenciasDaGeracao = {
      resolverEtapa: async () => ({ stageId: S_DEB, stageName: "Debriefing", stageType: "debriefing", funnelId: F, funnelName: "PG05", projectId: P, projectName: "DG" }),
      carregarConfig: async () => cfg,
      etapasDeDebriefingDoFunil: async () => [],
      ultimoPayloadSalvoDoFunil: async () => null,
      calcularPayload: async () => {
        throw new Error("não pode calcular com a mídia atrasada");
      },
      nomes: async () => ({ funis: {}, etapas: {} }),
      gravar: async () => {
        throw new Error("não pode gravar");
      },
      estadoDoSyncDaMidia: (c) => lerEstadoDoSyncDaMidia(db, c),
      agora: () => new Date("2026-10-07T15:00:00.000Z"),
    };
    const r = await gerarDebriefing(deps, { projectId: P, funnelId: F, stageId: S_DEB, userId: "40000000-0000-4000-8000-000000000001", userRole: "user", investimentoOficial: null });
    expect(r.status).toBe(422);
    return r.body as { erro: string; detalhe: string; acao: string };
  }

  it("só a conta fora do projeto: a ação manda vincular ou tirar da etapa — e NÃO manda esperar o sync", async () => {
    const b = await gerar([{ stageId: S_CAP, conta: A.foraDoProjeto }]);
    expect(b.erro).toBe("MIDIA_DO_CORTE_NAO_SINCRONIZADA");
    expect(b.detalhe).toContain("444 (Conta de outro projeto) — não está vinculada ao projeto");
    expect(b.acao).toMatch(/^Vincular a conta 444 \(Conta de outro projeto\) ao projeto .* ou tirá-la da etapa\/funil do lançamento .* esperar não resolve; depois, gerar de novo$/);
    expect(b.acao).not.toMatch(/Esperar o próximo sync/);
  });

  it("conta fora do projeto E conta atrasada: as duas ações, cada uma para a sua conta", async () => {
    const b = await gerar([{ stageId: S_CAP, conta: A.foraDoProjeto }, { stageId: S_PRIN, conta: A.atrasada }]);
    expect(b.acao).toMatch(/^Vincular a conta 444 .*; e esperar o próximo sync da mídia da Meta .*; depois, gerar de novo$/);
    expect(b.acao).not.toContain("222");
  });
});
