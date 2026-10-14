import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * O que importa no envio de push não é "mandou": é o que acontece quando o
 * serviço de push recusa.
 *
 * Inscrição morre calada — app desinstalado, permissão revogada, aparelho
 * trocado. Nada disso chega ao servidor. O ÚNICO sinal é o 404/410 no envio
 * seguinte, e se a linha não sair da tabela ali ela nunca sai: todo envio
 * futuro carrega o aparelho morto junto.
 */

const mockSend = vi.fn();
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...a: unknown[]) => mockSend(...a),
  },
}));

const { enviarPush, pushConfigurado } = await import("../services/push.js");

interface Inscricao {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function fastifyFalso(inscricoes: Inscricao[]) {
  const apagados: string[][] = [];
  const atualizados: string[][] = [];
  const captura = (destino: string[][]) => ({
    where: (cond: { ids?: string[] }) => {
      destino.push(cond?.ids ?? []);
      return Promise.resolve();
    },
  });
  return {
    apagados,
    atualizados,
    fastify: {
      config: { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" },
      log: { warn: vi.fn(), info: vi.fn() },
      db: {
        select: () => ({ from: () => ({ where: () => Promise.resolve(inscricoes) }) }),
        delete: () => captura(apagados),
        update: () => ({ set: () => captura(atualizados) }),
      },
    } as unknown as FastifyInstance,
  };
}

// `inArray` devolve um SQL opaco no código real; aqui basta carregar os ids
// para o espião conferir QUAIS linhas foram apagadas, não só quantas.
vi.mock("drizzle-orm", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, inArray: (_col: unknown, ids: string[]) => ({ ids }) };
});

const UMA: Inscricao = { id: "i1", endpoint: "https://push/1", p256dh: "k1", auth: "a1" };
const OUTRA: Inscricao = { id: "i2", endpoint: "https://push/2", p256dh: "k2", auth: "a2" };

beforeEach(() => mockSend.mockReset());

describe("enviarPush", () => {
  it("apaga a inscrição que o serviço recusou com 410 e mantém a que funcionou", async () => {
    mockSend
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    const { fastify, apagados } = fastifyFalso([UMA, OUTRA]);

    const r = await enviarPush(fastify, ["u1"], { titulo: "t", corpo: "c" });

    expect(r).toEqual({ enviados: 1, removidos: 1, falhas: 0 });
    expect(apagados).toEqual([["i2"]]);
  });

  it("404 também é inscrição morta", async () => {
    mockSend.mockRejectedValueOnce(Object.assign(new Error("not found"), { statusCode: 404 }));
    const { fastify, apagados } = fastifyFalso([UMA]);

    expect(await enviarPush(fastify, ["u1"], { titulo: "t", corpo: "c" })).toEqual({
      enviados: 0,
      removidos: 1,
      falhas: 0,
    });
    expect(apagados).toEqual([["i1"]]);
  });

  it("erro passageiro (503) NÃO apaga o aparelho", async () => {
    // Serviço de push fora do ar por um minuto apagaria a base inteira se
    // qualquer falha contasse como morte.
    mockSend.mockRejectedValueOnce(Object.assign(new Error("indisponível"), { statusCode: 503 }));
    const { fastify, apagados } = fastifyFalso([UMA]);

    expect(await enviarPush(fastify, ["u1"], { titulo: "t", corpo: "c" })).toEqual({
      enviados: 0,
      removidos: 0,
      falhas: 1,
    });
    expect(apagados).toEqual([]);
  });

  it("sem chaves VAPID não tenta enviar nada", async () => {
    const { fastify } = fastifyFalso([UMA]);
    (fastify as { config: Record<string, unknown> }).config = {};

    expect(await enviarPush(fastify, ["u1"], { titulo: "t", corpo: "c" })).toEqual({
      enviados: 0,
      removidos: 0,
      falhas: 0,
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sem destinatário não consulta o banco", async () => {
    const { fastify } = fastifyFalso([UMA]);
    expect(await enviarPush(fastify, [], { titulo: "t", corpo: "c" })).toEqual({
      enviados: 0,
      removidos: 0,
      falhas: 0,
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("o corpo vai como JSON — é o que o service worker lê", async () => {
    mockSend.mockResolvedValueOnce(undefined);
    const { fastify } = fastifyFalso([UMA]);

    await enviarPush(fastify, ["u1"], { titulo: "Oi", corpo: "Texto", url: "/entrar", tag: "x" });

    const [inscricao, corpo] = mockSend.mock.calls[0];
    expect(inscricao).toEqual({ endpoint: "https://push/1", keys: { p256dh: "k1", auth: "a1" } });
    expect(JSON.parse(corpo as string)).toEqual({
      titulo: "Oi",
      corpo: "Texto",
      url: "/entrar",
      tag: "x",
    });
  });
});

describe("pushConfigurado", () => {
  it("exige o par de chaves", () => {
    const c = (o: Record<string, string>) => o as unknown as FastifyInstance["config"];
    expect(pushConfigurado(c({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b" }))).toBe(true);
    expect(pushConfigurado(c({ VAPID_PUBLIC_KEY: "a" }))).toBe(false);
    expect(pushConfigurado(c({}))).toBe(false);
  });
});
