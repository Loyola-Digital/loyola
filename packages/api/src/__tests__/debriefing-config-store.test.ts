/**
 * Story 49.1 (QA fix, iteração 1) — o store Drizzle REAL
 * (`criarDebriefingConfigStore`) e as rotas sobre um Postgres de verdade.
 *
 * O banco é PGlite (Postgres em WASM, em memória, devDependency da API): roda
 * a migration 0161 de verdade sobre uma DDL mínima das tabelas que o store lê.
 * Nada toca o `.env` (que aponta para produção). O drizzle fala com ele pelo
 * `pg-proxy`, e os parsers de DATE/TIMESTAMP/NUMERIC devolvem string como o
 * node-postgres de produção — sem isso a comparação de premissa por JSON
 * acusaria "mudou" sempre (falso defeito).
 *
 * O que prende (mutações que sobreviviam com o store em memória — gate QA):
 *   M11 — o UPDATE do PUT deixa de zerar `validado`;
 *   M12 — `etapasComPesquisa` ignora `funnel_surveys`;
 *   M13 — o join do contexto troca `projects.id` → a checagem de IDOR compara
 *         o id errado;
 * mais REL-001 (dois "salvar" simultâneos → 500), REL-002 + R4-14 (funil de
 * comparação apagado: gera como edição única com COMPARACAO_REMOVIDA, sem
 * bloquear) e R4-12 (coluna `ferramentas_de_atendimento`).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pg-proxy";
import Fastify, { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import * as schema from "../db/schema.js";
import type { Database } from "../db/client.js";
import debriefingConfigRoutes from "../routes/debriefing-config.js";
import {
  DebriefingConfigError,
  criarDebriefingConfigStore,
  loadDebriefingConfig,
  loadDebriefingConfigRaw,
  valoresDaLinha,
  type DebriefingConfigStore,
  type ValoresDaConfig,
} from "../services/debriefing-config.js";

const MIGRATION = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations", "0161_debriefing_configs.sql");

const P = "10000000-0000-4000-8000-000000000001";
const P2 = "10000000-0000-4000-8000-000000000002";
const F = "20000000-0000-4000-8000-000000000001"; // lançamento da etapa
const FC = "20000000-0000-4000-8000-000000000002"; // comparação (mesmo projeto)
const FO = "20000000-0000-4000-8000-000000000003"; // outro projeto
const FM = "20000000-0000-4000-8000-000000000004"; // mobile
const D = "30000000-0000-4000-8000-000000000001"; // etapa Debriefing
const CAP = "30000000-0000-4000-8000-000000000002"; // captação, COM pesquisa
const PRIN = "30000000-0000-4000-8000-000000000004"; // principal, sem pesquisa
const DO = "30000000-0000-4000-8000-000000000009"; // Debriefing do outro projeto
const DM = "30000000-0000-4000-8000-00000000000a"; // Debriefing do funil mobile
const U = "40000000-0000-4000-8000-000000000001";

/** DDL mínima das tabelas que o store lê (colunas de `schema.ts` usadas nos selects). */
const DDL = `
CREATE TABLE users (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE projects (id uuid PRIMARY KEY, name varchar(100) NOT NULL);
CREATE TABLE funnels (
  id uuid PRIMARY KEY, name varchar(255) NOT NULL, type text NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE funnel_stages (
  id uuid PRIMARY KEY, name varchar(255) NOT NULL, stage_type varchar(20) NOT NULL,
  funnel_id uuid NOT NULL REFERENCES funnels(id) ON DELETE CASCADE, sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE funnel_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funnel_id uuid NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES funnel_stages(id) ON DELETE CASCADE
);
CREATE TABLE expert_report_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  imposto_pct numeric(6, 4)
);
`;

const SEED = `
INSERT INTO users VALUES ('${U}', 'Fulano do Time');
INSERT INTO projects VALUES ('${P}', 'Expert A'), ('${P2}', 'Expert B');
INSERT INTO funnels VALUES
  ('${F}', 'xx-pg09', 'launch', '${P}'), ('${FC}', 'xx-pg08', 'launch', '${P}'),
  ('${FO}', 'yy-pg01', 'launch', '${P2}'), ('${FM}', 'app', 'mobile', '${P}');
INSERT INTO funnel_stages VALUES
  ('${D}', 'Debriefing', 'debriefing', '${F}', 9), ('${CAP}', 'Captação', 'event_capture', '${F}', 1),
  ('${PRIN}', 'Principal', 'sales', '${F}', 2), ('${DO}', 'Debriefing B', 'debriefing', '${FO}', 1),
  ('${DM}', 'Debriefing app', 'debriefing', '${FM}', 1);
INSERT INTO funnel_surveys (funnel_id, stage_id) VALUES ('${F}', '${CAP}');
INSERT INTO expert_report_configs (project_id, imposto_pct) VALUES ('${P}', 0.0800);
`;

/** Perguntas da planilha (a única leitura que não é SQL — fica fora do PGlite). */
const PERGUNTAS = [
  { key: "faixa", label: "Faixa" },
  { key: "q_renda", label: "Qual sua renda?" },
];

let pg: PGlite;
let db: Database;
let app: FastifyInstance;

/**
 * Barreira opcional DEPOIS da leitura da linha: com ela, N requisições leem
 * "sem linha" antes de qualquer uma gravar — a corrida do primeiro "salvar"
 * acontece de verdade, em vez de depender da sorte do agendador.
 */
let barreira: { faltam: number; liberar: () => void; aberta: Promise<void> } | null = null;
function armarBarreira(n: number): void {
  let liberar = () => {};
  const aberta = new Promise<void>((r) => (liberar = r));
  barreira = { faltam: n, liberar, aberta };
}

/** Store real; só `perguntasDaEtapa` (planilha do Google) é trocada. */
function storeReal(d: Database): DebriefingConfigStore {
  const real = criarDebriefingConfigStore(d);
  return {
    ...real,
    perguntasDaEtapa: async () => PERGUNTAS,
    async linhaDaConfig(stageId) {
      const linha = await real.linhaDaConfig(stageId);
      if (barreira) {
        const b = barreira;
        if (--b.faltam === 0) b.liberar();
        await b.aberta;
      }
      return linha;
    },
  };
}

const url = (p = P, f = F, s = D) => `/api/projects/${p}/funnels/${f}/stages/${s}/debriefing/config`;

function corpo(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    datasChave: {
      inicioCaptacao: "2026-04-17",
      aberturaCarrinho: "2026-05-12",
      fimCarrinho: "2026-05-16",
      reabertura: { houve: false },
      downsell: { houve: false },
    },
    lancamentoComparacaoFunnelId: null,
    etapas: [
      { stageId: CAP, papel: "leads-captacao" },
      { stageId: PRIN, papel: "vendas-principal" },
    ],
    perguntasConfirmadas: { [CAP]: { faixa: null, renda: "q_renda" } },
    closerMediums: [" X1 ", "comercial"],
    closerPorSellerName: false,
    ferramentasDeAtendimento: [],
    dimensaoDeCriativo: "nenhuma",
    ...over,
  };
}

interface LinhaCrua {
  validado: boolean;
  validado_em: string | null;
  validado_por: string | null;
  closer_mediums: string[] | null;
  inicio_captacao: string | null;
  lancamento_comparacao_funnel_id: string | null;
}

async function linhaDoBanco(stageId = D): Promise<LinhaCrua | undefined> {
  const r = await pg.query<LinhaCrua>(
    `SELECT validado, validado_em::text, validado_por, closer_mediums, inicio_captacao::text,
            lancamento_comparacao_funnel_id
       FROM debriefing_configs WHERE stage_id = $1`,
    [stageId],
  );
  return r.rows[0];
}

async function contarLinhas(): Promise<number> {
  return (await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM debriefing_configs")).rows[0].n;
}

async function put(payload: Record<string, unknown>, u = url()) {
  return app.inject({ method: "PUT", url: u, payload });
}
async function validar(u = url()) {
  return app.inject({ method: "POST", url: `${u}/validate` });
}

async function erroDe(p: Promise<unknown>): Promise<DebriefingConfigError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof DebriefingConfigError) return err;
    throw err;
  }
  throw new Error("deveria ter lançado DebriefingConfigError");
}

beforeAll(async () => {
  // DATE (1082), TIMESTAMP (1114), TIMESTAMPTZ (1184) e NUMERIC (1700) voltam
  // como string, igual ao node-postgres do drizzle em produção.
  const comoString = (v: string) => v;
  pg = new PGlite({ parsers: { 1082: comoString, 1114: comoString, 1184: comoString, 1700: comoString } });
  await pg.exec(DDL);
  await pg.exec(readFileSync(MIGRATION, "utf8"));
  db = drizzle(
    async (sql, params) => {
      const r = await pg.query(sql, params as unknown[], { rowMode: "array" });
      return { rows: r.rows as unknown[] };
    },
    { schema },
  ) as unknown as Database;

  app = Fastify();
  app.decorate("db", db);
  await app.register(
    fp(async (f) => {
      f.addHook("onRequest", async (request) => {
        request.userId = U;
        request.userRole = (request.headers["x-role"] as string | undefined) ?? "user";
      });
    }),
  );
  await app.register(debriefingConfigRoutes, { criarStore: storeReal });
  await app.ready();
}, 60_000);

beforeEach(async () => {
  barreira = null;
  await pg.exec(
    "TRUNCATE debriefing_configs, funnel_surveys, expert_report_configs, funnel_stages, funnels, projects, users CASCADE;",
  );
  await pg.exec(SEED);
});

afterAll(async () => {
  await app?.close();
  await pg?.close();
});

describe("store real — contexto da etapa e IDOR (QA M13)", () => {
  it("contextoDaEtapa devolve funil e PROJETO do funil (join real)", async () => {
    const ctx = await criarDebriefingConfigStore(db).contextoDaEtapa(D);
    expect(ctx).toEqual({
      stageId: D,
      stageName: "Debriefing",
      stageType: "debriefing",
      funnelId: F,
      funnelName: "xx-pg09",
      funnelType: "launch",
      projectId: P,
      projectName: "Expert A",
    });
    expect(await criarDebriefingConfigStore(db).contextoDaEtapa("30000000-0000-4000-8000-0000000000ff")).toBeNull();
  });

  it("URL certa → 200; projeto ou funil trocados na URL → 404 e nada gravado", async () => {
    expect((await app.inject({ method: "GET", url: url() })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: url(P2, F, D) })).statusCode).toBe(404);
    expect((await put(corpo(), url(P, FC, D))).statusCode).toBe(404);
    expect((await put(corpo(), url(P, F, DO))).statusCode).toBe(404); // etapa de outro projeto sob a URL deste
    expect((await validar(url(P2, F, D))).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: url(P, F, CAP) })).statusCode).toBe(404); // não é Debriefing
    expect((await app.inject({ method: "GET", url: url(), headers: { "x-role": "guest" } })).statusCode).toBe(403);
    expect(await contarLinhas()).toBe(0);
  });
});

describe("store real — gravação, reset de validado e upsert (QA M11, REL-001)", () => {
  it("PUT cria a linha com mediums normalizados, datas como string e validado=false", async () => {
    const r = await put(corpo());
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, validacaoResetada: false });
    expect(await linhaDoBanco()).toMatchObject({
      validado: false,
      validado_por: null,
      closer_mediums: ["x1", "comercial"],
      inicio_captacao: "2026-04-17",
    });
  });

  it("validate grava validado/validado_em/validado_por; sem config → 404", async () => {
    expect((await validar()).statusCode).toBe(404);
    expect(await criarDebriefingConfigStore(db).marcarValidado(D, U)).toBeNull();
    await put(corpo());
    const r = await validar();
    expect(r.statusCode).toBe(200);
    const l = await linhaDoBanco();
    expect(l?.validado).toBe(true);
    expect(l?.validado_por).toBe(U);
    expect(l?.validado_em).not.toBeNull();
  });

  it("PUT com a mesma premissa reordenada NÃO reseta validado no banco", async () => {
    await put(corpo());
    await validar();
    const r = await put(
      corpo({
        closerMediums: ["comercial", "x1"],
        etapas: [
          { stageId: PRIN, papel: "vendas-principal" },
          { stageId: CAP, papel: "leads-captacao" },
        ],
      }),
    );
    expect(r.json()).toEqual({ ok: true, validacaoResetada: false });
    expect((await linhaDoBanco())?.validado).toBe(true);
  });

  it("PUT trocando SÓ o papel de uma etapa zera validado, validado_em e validado_por NO BANCO", async () => {
    await put(corpo());
    await validar();
    const r = await put(
      corpo({
        etapas: [
          { stageId: CAP, papel: "leads-captacao" },
          { stageId: PRIN, papel: "vendas-captacao" },
        ],
      }),
    );
    expect(r.json()).toEqual({ ok: true, validacaoResetada: true });
    expect(await linhaDoBanco()).toMatchObject({ validado: false, validado_em: null, validado_por: null });
  });

  it("PUT mudando uma data zera validado no banco", async () => {
    await put(corpo());
    await validar();
    const datas = { ...(corpo().datasChave as Record<string, unknown>), fimCarrinho: "2026-05-17" };
    expect((await put(corpo({ datasChave: datas }))).json().validacaoResetada).toBe(true);
    expect((await linhaDoBanco())?.validado).toBe(false);
  });

  it("gravar sem linha lida, duas vezes, não estoura o UNIQUE (upsert) e fica 1 linha", async () => {
    const store = criarDebriefingConfigStore(db);
    const v = (fim: string): ValoresDaConfig => ({
      inicioCaptacao: "2026-04-17",
      aberturaCarrinho: "2026-05-12",
      fimCarrinho: fim,
      reabertura: { houve: false },
      downsell: { houve: false },
      lancamentoComparacaoFunnelId: null,
      etapas: [{ stageId: CAP, papel: "leads-captacao" }],
      perguntasConfirmadas: {},
      closerMediums: [],
      closerPorSellerName: false,
      ferramentasDeAtendimento: [],
      dimensaoDeCriativo: "nenhuma",
    });
    await store.gravar(D, v("2026-05-16"), { resetarValidado: true });
    await store.gravar(D, v("2026-05-17"), { resetarValidado: true });
    expect(await contarLinhas()).toBe(1);
    expect((await pg.query<{ f: string }>("SELECT fim_carrinho::text AS f FROM debriefing_configs")).rows[0].f).toBe(
      "2026-05-17",
    );
  });

  it("upsert por cima de linha validada que a requisição não viu reseta a conferência", async () => {
    await put(corpo());
    await validar();
    const store = criarDebriefingConfigStore(db);
    const linha = await store.linhaDaConfig(D);
    expect(linha?.validado).toBe(true);
    // Corrida: a outra requisição leu "sem linha" antes desta existir.
    await store.gravar(D, valoresDaLinha(linha!), { resetarValidado: true });
    expect((await linhaDoBanco())?.validado).toBe(false);
  });

  it("dois PUTs simultâneos no primeiro salvar → os dois 200, nenhum 500, 1 linha", async () => {
    armarBarreira(2); // os dois leem "sem linha" antes de qualquer um gravar
    const [a, b] = await Promise.all([put(corpo()), put(corpo({ closerPorSellerName: true }))]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(await contarLinhas()).toBe(1);
    expect((await linhaDoBanco())?.validado).toBe(false);
  });
});

describe("store real — etapas com pesquisa vêm de funnel_surveys (QA M12)", () => {
  it("só a etapa com linha em funnel_surveys conta como 'com pesquisa'", async () => {
    const store = criarDebriefingConfigStore(db);
    expect(await store.etapasComPesquisa([CAP, PRIN])).toEqual([CAP]);
    expect(await store.etapasComPesquisa([PRIN])).toEqual([]);
    expect(await store.etapasComPesquisa([])).toEqual([]);
  });

  it("faixa ausente na etapa com pesquisa → CONFIG_INCOMPLETA nomeando a etapa; a sem pesquisa não exige", async () => {
    await put(corpo({ perguntasConfirmadas: {} }));
    await validar();
    const err = await erroDe(loadDebriefingConfig(db, D));
    expect(err.erro).toBe("CONFIG_INCOMPLETA");
    expect(err.camposFaltantes).toEqual([
      `perguntasConfirmadas[${CAP}].faixa (chave da pergunta ou null = "sem faixa A→D")`,
    ]);
  });
});

describe("store real — carregador e contrato", () => {
  it("fora da lista e sem validado → COMBINACAO_NAO_VALIDADA; validado → contrato launch", async () => {
    expect((await erroDe(loadDebriefingConfig(db, D))).erro).toBe("COMBINACAO_NAO_VALIDADA"); // sem config
    await put(corpo());
    expect((await erroDe(loadDebriefingConfig(db, D))).erro).toBe("COMBINACAO_NAO_VALIDADA");
    await validar();
    const cfg = await loadDebriefingConfig(db, D);
    if (cfg.tipoDeFunil !== "launch") throw new Error("esperava launch");
    expect(cfg.datasChave).toEqual({
      inicioCaptacao: "2026-04-17",
      aberturaCarrinho: "2026-05-12",
      fimCarrinho: "2026-05-16",
      reabertura: { houve: false },
      downsell: { houve: false },
    });
    expect(cfg.perguntasConfirmadas).toEqual({ [CAP]: { faixa: null, renda: "q_renda" } });
    expect(cfg.closerMediums).toEqual(["x1", "comercial"]);
    expect(cfg.imposto).toEqual({ valor: 0.08, origem: "project" });
    expect(cfg.validadoPor).toBe(U);
  });

  it("mobile: PUT → 422 sem gravar; validate → 422", async () => {
    const r = await put({}, url(P, FM, DM));
    expect(r.statusCode).toBe(422);
    expect(r.json().erro).toBe("TIPO_DE_FUNIL_NAO_SUPORTADO");
    expect((await validar(url(P, FM, DM))).statusCode).toBe(422);
    expect(await contarLinhas()).toBe(0);
  });

  it("apagar a etapa de debriefing apaga a config (CASCADE)", async () => {
    await put(corpo());
    await pg.exec(`DELETE FROM funnel_stages WHERE id = '${D}'`);
    expect(await contarLinhas()).toBe(0);
  });
});

describe("store real — funil de comparação apagado (QA REL-002 + decisão do dono R4-14)", () => {
  it("a comparação continua gravada; a config segue validada e gera como edição única com COMPARACAO_REMOVIDA", async () => {
    await put(corpo({ lancamentoComparacaoFunnelId: FC }));
    await validar();
    await expect(loadDebriefingConfig(db, D)).resolves.toMatchObject({ lancamentoComparacaoFunnelId: FC });

    // Sem FK: apagar o funil não é barrado nem apaga a premissa em silêncio.
    await pg.exec(`DELETE FROM funnels WHERE id = '${FC}'`);
    expect((await linhaDoBanco())?.lancamento_comparacao_funnel_id).toBe(FC);

    const cru = await loadDebriefingConfigRaw(db, D);
    expect(cru?.config?.comparacaoRemovida).toBe(true);
    expect(cru?.config?.validado).toBe(true);
    const cfg = await loadDebriefingConfig(db, D);
    if (cfg.tipoDeFunil !== "launch") throw new Error("esperava launch");
    expect(cfg.lancamentoComparacaoFunnelId).toBeNull();
    expect(cfg.avisos.map((a) => a.codigo)).toEqual(["COMPARACAO_REMOVIDA"]);

    const get = (await app.inject({ method: "GET", url: url() })).json();
    expect(get.bloqueio).toBeNull();
    expect(get.config.validado).toBe(true);
    expect(get.config.comparacaoRemovida).toBe(true);
    expect(get.camposFaltantes).toEqual([]);
    expect(get.avisos.map((a: { codigo: string }) => a.codigo)).toEqual(["COMPARACAO_REMOVIDA"]);

    // Limpar a comparação órfã não muda o que o gerador faz: não reseta.
    expect((await put(corpo())).json().validacaoResetada).toBe(false);
    expect((await linhaDoBanco())?.validado).toBe(true);
    // Trocar por outro funil do projeto É premissa nova.
    await pg.exec(`INSERT INTO funnels (id, project_id, name, type) VALUES ('${FC}', '${P}', 'xx-pg08', 'launch')`);
    expect((await put(corpo({ lancamentoComparacaoFunnelId: FC }))).json().validacaoResetada).toBe(true);
  });

  it("ferramentas_de_atendimento (R4-12): omitida grava NULL e bloqueia; lista normalizada no banco e no contrato", async () => {
    const semFerramentas = corpo();
    delete semFerramentas.ferramentasDeAtendimento;
    await put(semFerramentas);
    await validar();
    expect((await pg.query<{ f: unknown }>("SELECT ferramentas_de_atendimento AS f FROM debriefing_configs")).rows[0].f).toBeNull();
    expect((await erroDe(loadDebriefingConfig(db, D))).camposFaltantes).toEqual([
      "ferramentasDeAtendimento (lista vazia é resposta válida)",
    ]);
    // Responder é premissa nova: zera validado no banco.
    expect((await put(corpo({ ferramentasDeAtendimento: [" LeTalk ", "chatwoot"] }))).json().validacaoResetada).toBe(true);
    expect((await pg.query<{ f: unknown }>("SELECT ferramentas_de_atendimento AS f FROM debriefing_configs")).rows[0].f).toEqual([
      "letalk",
      "chatwoot",
    ]);
    await validar();
    expect(await loadDebriefingConfig(db, D)).toMatchObject({ ferramentasDeAtendimento: ["letalk", "chatwoot"] });
  });
});
