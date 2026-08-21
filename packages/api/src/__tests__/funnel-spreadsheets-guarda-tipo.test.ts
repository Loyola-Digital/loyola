/**
 * Story 29.55 — a aba genérica não edita nem apaga planilha com tela própria.
 *
 * ⚠️ Verificado por REVERSÃO, e o que o teste observa não é o status: é se o
 * banco foi TOCADO. Com a guarda colocada depois da escrita, a resposta seria
 * 409 e o dado já estaria gravado — um teste que só olha `statusCode` passaria
 * feliz com o defeito de volta.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";
import funnelSpreadsheetsRoutes, { ehGerenciadaPorOutraTela } from "../routes/funnel-spreadsheets.js";

const PROJ = "30000000-0000-4000-8000-000000000003";
const FUNNEL = "40000000-0000-4000-8000-000000000004";
const SHEET = "50000000-0000-4000-8000-000000000005";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

/** O banco foi tocado? É o que este arquivo existe para responder. */
let escreveu: { update: Record<string, unknown> | null; deletou: boolean };

/** `select` do vínculo funil↔projeto (sempre o primeiro da fila). */
function filaFunnel() {
  mockSelect.mockReturnValueOnce({
    from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: FUNNEL, projectId: PROJ }]) }) }),
  });
}

/** `select` da planilha existente. */
function filaSheet(linhas: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(linhas) }) }),
  });
}

const mockDbPlugin = fp(async (fastify) => {
  fastify.decorate("db", {
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
  } as unknown as Database);
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
  await app.register(funnelSpreadsheetsRoutes);
  await app.ready();
  return app;
}

const url = () => `/api/projects/${PROJ}/funnels/${FUNNEL}/spreadsheets/${SHEET}`;

/** O mapeamento que a tela genérica mandaria — sem `valorBruto`, sem `productName`. */
const PAYLOAD_GENERICO = {
  columnMapping: {
    name: "Nome",
    email: "E-mail",
    phone: "Telefone",
    date: "Data Criação",
    status: "Evento",
    value: "Moeda de recebimento",
  },
};

/** O registro do perpétuo, com o vocabulário DELE. */
const PLANILHA_DO_PERPETUO = {
  id: SHEET,
  funnelId: FUNNEL,
  type: "perpetual_sales",
  label: "Vendas",
  spreadsheetId: "abc",
  spreadsheetName: "[BBE-A1] KPIs Aquisição",
  sheetName: "n8n-Kiwify",
  columnMapping: {
    email: "E-mail",
    transactionId: "Transaction",
    valorBruto: "Preço Original",
    productName: "Produto",
    dataVenda: "Data Criação",
    status: "Evento",
  },
  stageId: null,
  createdBy: "60000000-0000-4000-8000-000000000006",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PLANILHA_COMUM = { ...PLANILHA_DO_PERPETUO, type: "sales" };

beforeEach(() => {
  mockSelect.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  escreveu = { update: null, deletou: false };
  mockUpdate.mockImplementation(() => ({
    set: (patch: Record<string, unknown>) => {
      escreveu.update = patch;
      return { where: () => ({ returning: () => Promise.resolve([PLANILHA_COMUM]) }) };
    },
  }));
  mockDelete.mockImplementation(() => ({
    where: () => {
      escreveu.deletou = true;
      return { returning: () => Promise.resolve([PLANILHA_COMUM]) };
    },
  }));
});

describe("AC1 — o PUT recusa planilha com tela própria", () => {
  it("perpetual_sales devolve 409 E o update NÃO acontece", async () => {
    filaFunnel();
    filaSheet([PLANILHA_DO_PERPETUO]);
    const app = await buildApp();
    const res = await app.inject({ method: "PUT", url: url(), payload: PAYLOAD_GENERICO });

    expect(res.statusCode).toBe(409);
    // ⚠️ A asserção que importa: sem ela, mover a guarda para depois do
    // `update` deixaria este teste verde com o mapeamento já destruído.
    expect(escreveu.update).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it("a mensagem diz ONDE se edita — senão o 409 vira beco", async () => {
    filaFunnel();
    filaSheet([PLANILHA_DO_PERPETUO]);
    const app = await buildApp();
    const res = await app.inject({ method: "PUT", url: url(), payload: PAYLOAD_GENERICO });
    expect(res.json().error).toContain("dashboard do funil perpétuo");
    await app.close();
  });

  it("perpetual_upsell também", async () => {
    filaFunnel();
    filaSheet([{ ...PLANILHA_DO_PERPETUO, type: "perpetual_upsell" }]);
    const app = await buildApp();
    const res = await app.inject({ method: "PUT", url: url(), payload: PAYLOAD_GENERICO });
    expect(res.statusCode).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it("planilha comum continua editável — a guarda não pode fechar a porta certa", async () => {
    filaFunnel();
    filaSheet([PLANILHA_COMUM]);
    const app = await buildApp();
    const res = await app.inject({ method: "PUT", url: url(), payload: PAYLOAD_GENERICO });
    expect(res.statusCode).toBe(200);
    expect(escreveu.update).toMatchObject({ columnMapping: PAYLOAD_GENERICO.columnMapping });
    await app.close();
  });
});

describe("AC2 — o DELETE recusa planilha com tela própria", () => {
  it("perpetual_sales devolve 409 E nada é apagado", async () => {
    filaFunnel();
    filaSheet([PLANILHA_DO_PERPETUO]);
    const app = await buildApp();
    const res = await app.inject({ method: "DELETE", url: url() });

    expect(res.statusCode).toBe(409);
    expect(escreveu.deletou).toBe(false);
    expect(mockDelete).not.toHaveBeenCalled();
    await app.close();
  });

  it("planilha comum continua removível", async () => {
    filaFunnel();
    filaSheet([PLANILHA_COMUM]);
    const app = await buildApp();
    const res = await app.inject({ method: "DELETE", url: url() });
    expect(res.statusCode).toBe(200);
    expect(escreveu.deletou).toBe(true);
    await app.close();
  });
});

describe("a lista de tipos gerenciados", () => {
  it("cobre os dois do perpétuo e nenhum dos genéricos", () => {
    expect(ehGerenciadaPorOutraTela("perpetual_sales")).toBe(true);
    expect(ehGerenciadaPorOutraTela("perpetual_upsell")).toBe(true);
    for (const t of ["leads", "sales", "custom", "applications"]) {
      expect(ehGerenciadaPorOutraTela(t)).toBe(false);
    }
  });
});
