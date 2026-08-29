/**
 * CRUD dos dashboards.
 *
 * O que estes testes protegem é o `PUT` parcial: é a diferença entre o canvas
 * salvar geometria e o canvas apagar o nome que alguém acabou de trocar.
 */

import { describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";
import biDashboardsRoutes from "../routes/bi-dashboards.js";
import {
  LIMITE_DE_WIDGETS,
  duplicarWidgets,
  hojeEmSaoPaulo,
  nomeDaCopia,
  resolverPeriodo,
  widgetsGuardados,
  type Widget,
} from "../services/bi/dashboard.js";

const PROJETO = "30000000-0000-4000-8000-000000000003";
const DASH = "40000000-0000-4000-8000-000000000004";
const USUARIO = "10000000-0000-4000-8000-000000000001";

function widget(over: Partial<Widget> = {}): Widget {
  return {
    id: "w1",
    tipo: "kpi",
    titulo: "Investimento",
    spec: {
      entity: "trafego",
      metrics: ["trafego.spend"],
      dimensions: [],
      filters: { "trafego.date": { operator: "$between", value: ["2026-08-01", "2026-08-26"] } },
      order_by: [],
      limit: 500,
      date_granularity: "day",
    },
    geometria: { x: 0, y: 0, w: 4, h: 3 },
    opcoes: {},
    ...over,
  };
}

const LINHA = {
  id: DASH,
  projectId: PROJETO,
  nome: "Visão geral",
  widgets: [widget()],
  dateRange: { preset: "last_30d" },
  createdBy: USUARIO,
  createdAt: new Date("2026-08-01T12:00:00Z"),
  updatedAt: new Date("2026-08-02T12:00:00Z"),
};

/**
 * Um `db` de mentira com fila de respostas.
 *
 * Cada `select` consome a próxima resposta da fila, na ordem em que a rota faz
 * as consultas — assim o teste diz "o projeto existe, o dashboard não" sem
 * precisar saber qual `where` foi montado.
 */
function fakeDb(fila: unknown[][]) {
  const capturado: Record<string, unknown> = {};
  const proximo = async () => fila.shift() ?? [];
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: proximo, orderBy: proximo })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((v: Record<string, unknown>) => {
        capturado.inserido = v;
        return { returning: async () => [{ ...LINHA, ...v }] };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((s: Record<string, unknown>) => {
        capturado.set = s;
        return { where: vi.fn(() => ({ returning: async () => [{ ...LINHA, ...s }] })) };
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({ returning: async () => fila.shift() ?? [] })),
    })),
  };
  return { db: db as unknown as Database, capturado };
}

async function montar(fila: unknown[][], role = "admin") {
  const { db, capturado } = fakeDb(fila);
  const app: FastifyInstance = Fastify();
  await app.register(
    fp(async (f) => {
      f.decorate("db", db);
    }),
  );
  await app.register(
    fp(async (f) => {
      f.addHook("preHandler", async (request) => {
        request.userId = USUARIO;
        request.userRole = role;
      });
    }),
  );
  await app.register(biDashboardsRoutes);
  await app.ready();
  return { app, capturado };
}

describe("T1 · o PUT parcial não apaga o que não veio", () => {
  it("mandar só o nome não toca em widgets nem em dateRange", async () => {
    const { app, capturado } = await montar([[{ id: PROJETO }], [LINHA]]);
    const r = await app.inject({
      method: "PUT",
      url: `/api/projects/${PROJETO}/bi/dashboards/${DASH}`,
      payload: { nome: "Diário do lançamento" },
    });
    expect(r.statusCode).toBe(200);
    const set = capturado.set as Record<string, unknown>;
    expect(set.nome).toBe("Diário do lançamento");
    expect(set).not.toHaveProperty("widgets");
    expect(set).not.toHaveProperty("dateRange");
    await app.close();
  });

  it("mandar só widgets não toca no nome", async () => {
    const { app, capturado } = await montar([[{ id: PROJETO }], [LINHA]]);
    const r = await app.inject({
      method: "PUT",
      url: `/api/projects/${PROJETO}/bi/dashboards/${DASH}`,
      payload: { widgets: [widget({ id: "w2" })] },
    });
    expect(r.statusCode).toBe(200);
    const set = capturado.set as Record<string, unknown>;
    expect(set).toHaveProperty("widgets");
    expect(set).not.toHaveProperty("nome");
    await app.close();
  });

  it("patch vazio é 400, não 200 sem efeito", async () => {
    const { app } = await montar([[{ id: PROJETO }], [LINHA]]);
    const r = await app.inject({
      method: "PUT",
      url: `/api/projects/${PROJETO}/bi/dashboards/${DASH}`,
      payload: {},
    });
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it("campo escrito errado é 400, não sucesso silencioso", async () => {
    // `widget` no lugar de `widgets` sairia como 200 sem salvar nada — a falha
    // que parece funcionar.
    const { app } = await montar([[{ id: PROJETO }], [LINHA]]);
    const r = await app.inject({
      method: "PUT",
      url: `/api/projects/${PROJETO}/bi/dashboards/${DASH}`,
      payload: { widget: [widget()] },
    });
    expect(r.statusCode).toBe(400);
    await app.close();
  });
});

describe("T2 · duplicar", () => {
  it("gera id novo para cada widget", () => {
    const originais = [widget({ id: "w1" }), widget({ id: "w2" })];
    const copias = duplicarWidgets(originais);
    expect(copias.map((w) => w.id)).not.toEqual(["w1", "w2"]);
    expect(new Set(copias.map((w) => w.id)).size).toBe(2);
    // Tudo o mais é igual — geometria e spec são o que se está copiando.
    expect(copias[0]!.geometria).toEqual(originais[0]!.geometria);
    expect(copias[0]!.spec).toEqual(originais[0]!.spec);
  });

  it("a rota copia widgets com ids novos e nome de cópia", async () => {
    const { app, capturado } = await montar([[{ id: PROJETO }], [LINHA]]);
    const r = await app.inject({
      method: "POST",
      url: `/api/projects/${PROJETO}/bi/dashboards/${DASH}/duplicate`,
    });
    expect(r.statusCode).toBe(201);
    const inserido = capturado.inserido as { nome: string; widgets: Widget[] };
    expect(inserido.nome).toBe("Visão geral (cópia)");
    expect(inserido.widgets[0]!.id).not.toBe("w1");
    await app.close();
  });

  it('duplicar a cópia não empilha "(cópia) (cópia)"', () => {
    expect(nomeDaCopia("Visão geral")).toBe("Visão geral (cópia)");
    expect(nomeDaCopia("Visão geral (cópia)")).toBe("Visão geral (cópia)");
  });
});

describe("T3 · acesso", () => {
  it("projeto inexistente é 404, não 403 — não confirma que existe", async () => {
    const { app } = await montar([[]]);
    const r = await app.inject({ method: "GET", url: `/api/projects/${PROJETO}/bi/dashboards` });
    expect(r.statusCode).toBe(404);
    await app.close();
  });

  it("guest é 404 antes de qualquer consulta", async () => {
    const { app } = await montar([[{ id: PROJETO }]], "guest");
    const r = await app.inject({ method: "GET", url: `/api/projects/${PROJETO}/bi/dashboards` });
    expect(r.statusCode).toBe(404);
    await app.close();
  });

  it("membro não-admin passa quando tem vínculo com o projeto", async () => {
    const { app } = await montar([[{ id: PROJETO }], [{ id: "m1" }], [LINHA]], "user");
    const r = await app.inject({ method: "GET", url: `/api/projects/${PROJETO}/bi/dashboards` });
    expect(r.statusCode).toBe(200);
    await app.close();
  });

  it("não-admin sem vínculo é 404", async () => {
    const { app } = await montar([[{ id: PROJETO }], []], "user");
    const r = await app.inject({ method: "GET", url: `/api/projects/${PROJETO}/bi/dashboards` });
    expect(r.statusCode).toBe(404);
    await app.close();
  });

  it("dashboard de outro projeto é 404", async () => {
    const { app } = await montar([[{ id: PROJETO }], []]);
    const r = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJETO}/bi/dashboards/${DASH}`,
    });
    expect(r.statusCode).toBe(404);
    await app.close();
  });
});

describe("T4 · limite de widgets", () => {
  it(`o widget ${LIMITE_DE_WIDGETS + 1} é recusado com mensagem clara`, async () => {
    const { app } = await montar([[{ id: PROJETO }], [LINHA]]);
    const muitos = Array.from({ length: LIMITE_DE_WIDGETS + 1 }, (_, i) =>
      widget({ id: `w${i}` }),
    );
    const r = await app.inject({
      method: "PUT",
      url: `/api/projects/${PROJETO}/bi/dashboards/${DASH}`,
      payload: { widgets: muitos },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(new RegExp(String(LIMITE_DE_WIDGETS)));
    await app.close();
  });

  it("exatamente o limite passa", async () => {
    const { app } = await montar([[{ id: PROJETO }], [LINHA]]);
    const muitos = Array.from({ length: LIMITE_DE_WIDGETS }, (_, i) => widget({ id: `w${i}` }));
    const r = await app.inject({
      method: "PUT",
      url: `/api/projects/${PROJETO}/bi/dashboards/${DASH}`,
      payload: { widgets: muitos },
    });
    expect(r.statusCode).toBe(200);
    await app.close();
  });
});

describe("o que é salvo", () => {
  it("o dashboard novo nasce vazio, nunca com resultado", async () => {
    const { app, capturado } = await montar([[{ id: PROJETO }]]);
    const r = await app.inject({
      method: "POST",
      url: `/api/projects/${PROJETO}/bi/dashboards`,
      payload: { nome: "Perpétuo" },
    });
    expect(r.statusCode).toBe(201);
    expect((capturado.inserido as { widgets: unknown[] }).widgets).toEqual([]);
    await app.close();
  });

  it("widget com forma inválida é contado, não some em silêncio", () => {
    const { widgets, ilegiveis } = widgetsGuardados([widget(), { id: "x" }, null]);
    expect(widgets).toHaveLength(1);
    expect(ilegiveis).toBe(2);
  });

  it("o spec do widget é validado contra o catálogo na escrita", async () => {
    const { app } = await montar([[{ id: PROJETO }], [LINHA]]);
    const r = await app.inject({
      method: "PUT",
      url: `/api/projects/${PROJETO}/bi/dashboards/${DASH}`,
      payload: { widgets: [widget({ spec: { entity: "nada", metrics: [] } as never })] },
    });
    expect(r.statusCode).toBe(400);
    await app.close();
  });
});

describe("período", () => {
  const agora = new Date("2026-08-26T14:00:00Z");

  it("hoje sai no fuso de São Paulo, não no do servidor", () => {
    // 26/08 às 14h UTC é 26/08 às 11h em São Paulo. Já 01/09 às 02h UTC ainda é
    // 31/08 aqui — e é esse o dia que o relatório precisa mostrar.
    expect(hojeEmSaoPaulo(agora)).toBe("2026-08-26");
    expect(hojeEmSaoPaulo(new Date("2026-09-01T02:00:00Z"))).toBe("2026-08-31");
  });

  it("os presets resolvem em datas inclusivas nas duas pontas", () => {
    expect(resolverPeriodo({ preset: "hoje" }, agora)).toEqual({
      start: "2026-08-26",
      end: "2026-08-26",
    });
    expect(resolverPeriodo({ preset: "last_7d" }, agora)).toEqual({
      start: "2026-08-20",
      end: "2026-08-26",
    });
    expect(resolverPeriodo({ preset: "last_30d" }, agora)).toEqual({
      start: "2026-07-28",
      end: "2026-08-26",
    });
    expect(resolverPeriodo({ preset: "this_month" }, agora)).toEqual({
      start: "2026-08-01",
      end: "2026-08-26",
    });
    expect(resolverPeriodo({ preset: "last_month" }, agora)).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
    expect(resolverPeriodo({ preset: "this_year" }, agora)).toEqual({
      start: "2026-01-01",
      end: "2026-08-26",
    });
  });

  it("o mês anterior atravessa a virada do ano", () => {
    const janeiro = new Date("2026-01-15T12:00:00Z");
    expect(resolverPeriodo({ preset: "last_month" }, janeiro)).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
  });

  it("período explícito passa intacto", () => {
    expect(resolverPeriodo({ start: "2026-03-01", end: "2026-03-31" }, agora)).toEqual({
      start: "2026-03-01",
      end: "2026-03-31",
    });
  });
});
