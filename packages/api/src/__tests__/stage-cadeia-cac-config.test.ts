import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";
import funnelStagesRoutes from "../routes/funnel-stages.js";

/**
 * Story 44.9 AC4 · QA-449-02 — `PATCH .../cadeia-cac-config`.
 *
 * A rota ESCREVE em duas colunas criadas por migration no banco de produção e
 * não tinha nenhum teste. O que fica sem defesa sem isto é justamente o que o
 * código se dá ao trabalho de documentar:
 *
 *   - `{ lpTemVsl: null }` (limpa a resposta) ≠ campo ausente (não mexe).
 *     Sem essa distinção não há como DESFAZER uma resposta errada.
 *   - a prova de cadeia etapa→funil→projeto antes de escrever.
 *   - o `String(...)` no `numeric`, que existe para não perder centavos.
 *
 * ⚠️ Verificados por REVERSÃO.
 */

const PROJ = "30000000-0000-4000-8000-000000000003";
const FUNNEL = "40000000-0000-4000-8000-000000000004";
const STAGE = "50000000-0000-4000-8000-000000000005";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
/** O objeto passado ao `.set(...)` — é onde a distinção null/ausente aparece. */
let patchAplicado: Record<string, unknown> | null = null;

/**
 * ⚠️ Guarda o predicado do `where`. Sem isso o teste de IDOR seria DECORATIVO:
 * com o banco mockado, `filaVinculo([])` devolve vazio e o handler responde 404
 * mesmo que o filtro `funnels.projectId` seja apagado — provado por reversão.
 * É a mesma lição do QA-448 na rota de leitura, aplicada aqui na de ESCRITA.
 */
const vinculoSpy: { innerJoins: number; where: unknown } = { innerJoins: 0, where: null };

function filaVinculo(linhas: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: () => ({
      innerJoin: () => {
        vinculoSpy.innerJoins += 1;
        return {
          where: (cond: unknown) => {
            vinculoSpy.where = cond;
            return { limit: () => Promise.resolve(linhas) };
          },
        };
      },
    }),
  });
}

/** Os valores literais que o drizzle colocou no predicado. */
function paramsDoWhere(): string[] {
  const out: string[] = [];
  const visitar = (n: unknown, prof = 0) => {
    if (prof > 8 || n === null || typeof n !== "object") return;
    for (const v of Object.values(n as Record<string, unknown>)) {
      if (typeof v === "string") out.push(v);
      else if (typeof v === "object") visitar(v, prof + 1);
    }
  };
  visitar(vinculoSpy.where);
  return out;
}

function filaUpdate(retorno: unknown[]) {
  mockUpdate.mockReturnValueOnce({
    set: (patch: Record<string, unknown>) => {
      patchAplicado = patch;
      return { where: () => ({ returning: () => Promise.resolve(retorno) }) };
    },
  });
}

const mockDbPlugin = fp(async (fastify) => {
  fastify.decorate("db", { select: mockSelect, update: mockUpdate } as unknown as Database);
});

/** As rotas de `funnel-stages` leem `userRole` em outros handlers. */
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
  await app.register(funnelStagesRoutes);
  await app.ready();
  return app;
}

const url = (p = PROJ, f = FUNNEL, s = STAGE) =>
  `/api/projects/${p}/funnels/${f}/stages/${s}/cadeia-cac-config`;

const etapaOk = [{ id: STAGE }];
const retornoOk = [{ id: STAGE, lpTemVsl: true, ticketMedioManual: "197.00" }];

beforeEach(() => {
  mockSelect.mockReset();
  mockUpdate.mockReset();
  patchAplicado = null;
  vinculoSpy.innerJoins = 0;
  vinculoSpy.where = null;
});

describe("PATCH cadeia-cac-config — grava os dois campos", () => {
  it("grava lpTemVsl e ticketMedioManual", async () => {
    filaVinculo(etapaOk);
    filaUpdate(retornoOk);
    const app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: url(),
      payload: { lpTemVsl: true, ticketMedioManual: 197 },
    });
    expect(res.statusCode).toBe(200);
    expect(patchAplicado).toMatchObject({ lpTemVsl: true, ticketMedioManual: "197" });
    await app.close();
  });

  it("o ticket vai como STRING para o numeric — número perderia centavos", async () => {
    filaVinculo(etapaOk);
    filaUpdate(retornoOk);
    const app = await buildApp();
    await app.inject({
      method: "PATCH",
      url: url(),
      payload: { ticketMedioManual: "1499.90" },
    });
    expect(patchAplicado?.ticketMedioManual).toBe("1499.90");
    expect(typeof patchAplicado?.ticketMedioManual).toBe("string");
    await app.close();
  });
});

describe("PATCH cadeia-cac-config — `null` desfaz, ausente não mexe", () => {
  it("`null` explícito LIMPA o campo", async () => {
    filaVinculo(etapaOk);
    filaUpdate([{ id: STAGE, lpTemVsl: null, ticketMedioManual: null }]);
    const app = await buildApp();
    await app.inject({ method: "PATCH", url: url(), payload: { lpTemVsl: null } });
    // A chave PRECISA estar no patch com valor null — sem isso não há como
    // desfazer uma resposta errada.
    expect(patchAplicado).toHaveProperty("lpTemVsl", null);
    await app.close();
  });

  it("campo AUSENTE não entra no patch — não sobrescreve o que já estava lá", async () => {
    filaVinculo(etapaOk);
    filaUpdate(retornoOk);
    const app = await buildApp();
    await app.inject({ method: "PATCH", url: url(), payload: { lpTemVsl: true } });
    expect(patchAplicado).toHaveProperty("lpTemVsl", true);
    // `ticketMedioManual` não foi mandado: não pode aparecer no patch, nem como
    // null. Aparecer como null apagaria o ticket de quem só respondeu o VSL.
    expect(patchAplicado).not.toHaveProperty("ticketMedioManual");
    await app.close();
  });

  it("corpo vazio não apaga nada", async () => {
    filaVinculo(etapaOk);
    filaUpdate(retornoOk);
    const app = await buildApp();
    const res = await app.inject({ method: "PATCH", url: url(), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(patchAplicado).not.toHaveProperty("lpTemVsl");
    expect(patchAplicado).not.toHaveProperty("ticketMedioManual");
    await app.close();
  });
});

describe("PATCH cadeia-cac-config — vínculo e validação", () => {
  it("404 quando a etapa não pertence ao projeto/funil da URL", async () => {
    filaVinculo([]); // o innerJoin não encontra
    const app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: url("30000000-0000-4000-8000-000000000099"),
      payload: { lpTemVsl: true },
    });
    expect(res.statusCode).toBe(404);
    // E nada foi escrito.
    expect(mockUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it("o predicado da escrita é montado com projectId, funnelId E stageId", async () => {
    // Esta é a asserção que protege de verdade. O 404 acima cai do mock; o
    // filtro só é provado inspecionando o predicado que o drizzle montou.
    const OUTRO = "30000000-0000-4000-8000-000000000099";
    filaVinculo([]);
    const app = await buildApp();
    await app.inject({ method: "PATCH", url: url(OUTRO), payload: { lpTemVsl: true } });
    expect(vinculoSpy.innerJoins).toBe(1);
    const params = paramsDoWhere();
    expect(params).toContain(OUTRO); // projeto da URL entrou no filtro
    expect(params).toContain(FUNNEL);
    expect(params).toContain(STAGE);
    await app.close();
  });

  it("400 em uuid inválido, sem tocar no banco", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: url("nao-e-uuid"),
      payload: { lpTemVsl: true },
    });
    expect(res.statusCode).toBe(400);
    expect(mockSelect).not.toHaveBeenCalled();
    await app.close();
  });

  it("400 em tipo errado — string em lpTemVsl não vira `true`", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: url(),
      payload: { lpTemVsl: "sim" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("400 em ticket negativo e em ticket com 3 casas", async () => {
    const app = await buildApp();
    for (const payload of [{ ticketMedioManual: -1 }, { ticketMedioManual: "10.999" }]) {
      const res = await app.inject({ method: "PATCH", url: url(), payload });
      expect(res.statusCode).toBe(400);
    }
    await app.close();
  });
});
