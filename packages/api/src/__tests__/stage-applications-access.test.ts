import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";
import stageApplicationsRoutes from "../routes/stage-applications.js";

/**
 * Story 43.7 / QA-43.7-01 — controle de acesso do `applications-list`.
 *
 * Este endpoint devolve **nome e e-mail de pessoas reais**, e nasceu sem as duas
 * verificações que o `applications-daily` (mesmo arquivo) sempre teve: bloqueio
 * de guest e prova de que etapa, funil e projeto formam a mesma cadeia.
 *
 * Sem a segunda, um usuário do projeto A passava o `funnelId` do projeto B na
 * própria URL de A e recebia os dados de B — o `guest-guard` global não pega
 * isso: ele confere a membership em A (que o usuário tem) e retorna cedo para
 * qualquer papel que não seja guest.
 *
 * O teste é de AUTORIZAÇÃO, não de conteúdo: o corpo da resposta depende do
 * Google Sheets, e o que precisa ficar travado aqui é quem chega até ele.
 */

const PROJECT_ID = "30000000-0000-4000-8000-000000000003";
const FUNNEL_ID = "40000000-0000-4000-8000-000000000004";
const STAGE_ID = "50000000-0000-4000-8000-000000000005";

const mockSelect = vi.fn();

/** select().from().innerJoin().where().limit() — a query de vínculo. */
function vinculo(rows: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  });
}

const mockDbPlugin = fp(async (fastify) => {
  fastify.decorate("db", { select: mockSelect } as unknown as Database);
});

function authComPapel(role: string) {
  return fp(async (fastify) => {
    fastify.addHook("onRequest", async (request) => {
      request.userId = "10000000-0000-4000-8000-000000000001";
      request.userRole = role;
    });
  });
}

async function appCom(role: string) {
  const app = Fastify();
  await app.register(mockDbPlugin);
  await app.register(authComPapel(role));
  await app.register(stageApplicationsRoutes);
  await app.ready();
  return app;
}

const url = (p = PROJECT_ID, f = FUNNEL_ID, s = STAGE_ID) =>
  `/api/projects/${p}/funnels/${f}/stages/${s}/applications-list`;

describe("applications-list — controle de acesso (QA-43.7-01)", () => {
  let app: Awaited<ReturnType<typeof appCom>>;

  beforeAll(async () => {
    app = await appCom("copywriter");
  });
  afterAll(async () => {
    await app.close();
  });

  it("404 quando o funil não pertence ao projeto da URL — o IDOR", async () => {
    // A query de vínculo não encontra a cadeia: é assim que o funil de OUTRO
    // projeto é recusado.
    vinculo([]);
    const res = await app.inject({ method: "GET", url: url() });
    expect(res.statusCode).toBe(404);
    // Nada de PII no corpo.
    expect(res.body).not.toContain("@");
  });

  it("403 para guest, mesmo com a cadeia válida", async () => {
    const guestApp = await appCom("guest");
    vinculo([{ funnelName: "dg-pg04" }]);
    const res = await guestApp.inject({ method: "GET", url: url() });
    expect(res.statusCode).toBe(403);
    await guestApp.close();
  });

  it("guest é barrado ANTES de qualquer consulta ao banco", async () => {
    const guestApp = await appCom("guest");
    mockSelect.mockClear();
    const res = await guestApp.inject({ method: "GET", url: url() });
    expect(res.statusCode).toBe(403);
    expect(mockSelect).not.toHaveBeenCalled();
    await guestApp.close();
  });

  it("400 para uuid inválido", async () => {
    const res = await app.inject({ method: "GET", url: url("nao-e-uuid") });
    expect(res.statusCode).toBe(400);
  });
});
