import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";
import type { LaunchReportCarregado } from "../services/launch-report-loader.js";
import {
  lerVendasDaPlanilha,
  prepararVendasDoPeriodo,
} from "../services/launch-report-loader.js";
import { computeLaunchReportMetrics } from "../services/launch-report-engine.js";
import type { ResumoDedupVendas } from "../services/launch-report-guards.js";

/**
 * Story 41.10 · QA-41.10 TEST-001 — o fio rota → guardas.
 *
 * O loader devolve `{ metricas, dedup }` e a ROTA é quem repassa `dedup` para
 * `assertLaunchReport`, que transforma o resumo em W9/W10 dentro de `alertas[]`.
 * `ValidateOptions.dedup` é opcional: se um refactor deixar de repassar, o tsc
 * fica limpo, os testes do loader e das guardas continuam verdes e o relatório
 * passa a sair com os números deduplicados SEM o aviso. O QA cortou o repasse
 * nos dois handlers e nada falhou.
 *
 * Aqui o loader é substituído (sem banco nem Google) por um que devolve um
 * `dedup` conhecido, e o teste exige que W9 e W10 cheguem à resposta e ao que
 * é gravado no histórico — no Resumão e nos dois lados do Comparativo.
 *
 * ⚠️ Verificado por REVERSÃO: apagar `dedup: carregado.dedup` (Resumão) ou
 * trocar `{ dedup: c.dedup }` por `{}` (Comparativo) faz o teste do respectivo
 * relatório falhar.
 */

const loadLaunchReport = vi.fn();
vi.mock("../services/launch-report-loader.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/launch-report-loader.js")>()),
  loadLaunchReport: (...args: unknown[]) => loadLaunchReport(...args),
}));

// import depois do vi.mock (hoisted de qualquer forma; explícito para leitura)
const { default: launchReportsRoutes, comparativoRoutes } = await import(
  "../routes/launch-reports.js"
);

const PROJ = "30000000-0000-4000-8000-000000000003";
const FUNNEL = "40000000-0000-4000-8000-000000000004";
const STAGE_A = "50000000-0000-4000-8000-000000000005";
const STAGE_B = "50000000-0000-4000-8000-000000000006";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
/** O que o handler gravou no histórico (`.values(...)`). */
let gravado: Record<string, unknown> | null = null;

/** `select().from().innerJoin().innerJoin().where().limit()` → linhas. */
function filaEtapa(linhas: unknown[]) {
  const limit = () => Promise.resolve(linhas);
  const where = () => ({ limit });
  const join2 = () => ({ where });
  const join1 = () => ({ innerJoin: join2 });
  mockSelect.mockReturnValueOnce({ from: () => ({ innerJoin: join1 }) });
}

function filaInsert() {
  mockInsert.mockReturnValueOnce({
    values: (v: Record<string, unknown>) => {
      gravado = v;
      return {
        returning: () =>
          Promise.resolve([{ id: "70000000-0000-4000-8000-000000000007", createdAt: new Date(0) }]),
      };
    },
  });
}

const mockDbPlugin = fp(async (fastify) => {
  fastify.decorate("db", { select: mockSelect, insert: mockInsert } as unknown as Database);
});

const authStub = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request) => {
    (request as { userRole?: string; userId?: string }).userRole = "admin";
    (request as { userRole?: string; userId?: string }).userId =
      "60000000-0000-4000-8000-000000000006";
  });
});

async function buildApp() {
  const app = Fastify();
  await app.register(mockDbPlugin);
  await app.register(authStub);
  await app.register(launchReportsRoutes);
  await app.register(comparativoRoutes);
  await app.ready();
  return app;
}

const PERIODO = { inicio: "2026-05-01", fim: "2026-05-11" };

/** Métricas válidas (passam nas guardas) a partir de uma planilha mínima. */
function metricasValidas() {
  const lida = lerVendasDaPlanilha(
    {
      nome: "vendas",
      headers: ["ID", "Data", "E-mail", "Produto", "Preço"],
      rows: [
        ["P1", "09/05/2026 10:00:00", "a@x.com", "Ingresso", "99,00"],
        ["P2", "09/05/2026 11:00:00", "b@x.com", "Ingresso", "99,00"],
      ],
      mapping: {
        transactionId: "ID",
        productName: "Produto",
        dataVenda: "Data",
        email: "E-mail",
        valorBruto: "Preço",
      },
    },
    () => false,
  );
  const { vendas } = prepararVendasDoPeriodo(lida.linhas, lida.removidas, PERIODO);
  return computeLaunchReportMetrics({
    periodo: PERIODO,
    impostoPct: 0,
    impostoOrigem: "default",
    impostoJaAplicado: true,
    campanhas: [],
    vendas,
  });
}

const DEDUP_W9: ResumoDedupVendas = {
  removidasNaJanela: { linhas: 3, valor: 297 },
  naoAplicada: [],
};
const DEDUP_W10: ResumoDedupVendas = {
  removidasNaJanela: { linhas: 0, valor: 0 },
  naoAplicada: [{ planilha: "vendas-lado-b", faltando: [{ campo: "transactionId", colunaDoMapping: null }] }],
};
const DEDUP_W9_W10: ResumoDedupVendas = {
  removidasNaJanela: DEDUP_W9.removidasNaJanela,
  naoAplicada: DEDUP_W10.naoAplicada,
};

const carregado = (dedup: ResumoDedupVendas): LaunchReportCarregado => ({
  metricas: metricasValidas(),
  dedup,
});

const MSG_W9 = "3 linhas duplicadas por ID da venda removidas (R$ 297,00)";
const MSG_W10 = 'dedup por ID da venda não aplicada na planilha "vendas-lado-b"';

type AlertaResp = { codigo: string; mensagem: string };
const codigos = (as: AlertaResp[]) => as.map((a) => a.codigo).filter((c) => c === "W9" || c === "W10");
const msg = (as: AlertaResp[], codigo: string) => as.find((a) => a.codigo === codigo)?.mensagem ?? "";

beforeEach(() => {
  mockSelect.mockReset();
  mockInsert.mockReset();
  loadLaunchReport.mockReset();
  gravado = null;
});

describe("POST /resumao — o `dedup` do loader chega às guardas (W9/W10)", () => {
  it("W9 e W10 aparecem em `alertas` da resposta e no que é gravado", async () => {
    filaEtapa([{ stageId: STAGE_A, stageName: "Captação", projectName: "PG" }]);
    filaInsert();
    loadLaunchReport.mockResolvedValueOnce(carregado(DEDUP_W9_W10));

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${PROJ}/funnels/${FUNNEL}/stages/${STAGE_A}/reports/resumao`,
      payload: { formato: "json" },
    });

    expect(res.statusCode, res.body).toBe(200);
    const alertas = (res.json() as { alertas: AlertaResp[] }).alertas;
    expect(codigos(alertas)).toEqual(["W9", "W10"]);
    expect(msg(alertas, "W9")).toContain(MSG_W9);
    expect(msg(alertas, "W10")).toContain(MSG_W10);
    expect(codigos(gravado!.alertas as AlertaResp[])).toEqual(["W9", "W10"]);
  });
});

describe("POST /comparativo — o `dedup` de CADA lado chega às guardas daquele lado", () => {
  it("W9 do lado A fica em `alertas.a`, W10 do lado B em `alertas.b`, e os dois são gravados", async () => {
    filaEtapa([{ stageName: "Captação A", projectName: "PG" }]);
    filaEtapa([{ stageName: "Captação B", projectName: "PG" }]);
    filaInsert();
    loadLaunchReport
      .mockResolvedValueOnce(carregado(DEDUP_W9))
      .mockResolvedValueOnce(carregado(DEDUP_W10));

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${PROJ}/reports/comparativo`,
      payload: {
        a: { funnelId: FUNNEL, stageId: STAGE_A },
        b: { funnelId: FUNNEL, stageId: STAGE_B },
        formato: "json",
      },
    });

    expect(res.statusCode, res.body).toBe(200);
    const { alertas } = res.json() as { alertas: { a: AlertaResp[]; b: AlertaResp[] } };
    expect(codigos(alertas.a)).toEqual(["W9"]);
    expect(msg(alertas.a, "W9")).toContain(MSG_W9);
    expect(codigos(alertas.b)).toEqual(["W10"]);
    expect(msg(alertas.b, "W10")).toContain(MSG_W10);
    expect(codigos(gravado!.alertas as AlertaResp[])).toEqual(["W9", "W10"]);
  });
});
