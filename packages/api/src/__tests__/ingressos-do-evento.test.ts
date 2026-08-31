/**
 * Ingressos da etapa de evento.
 *
 * O que estes testes protegem é a **ausência com causa**: quando não dá para
 * apurar, o motivo precisa subir junto. "Sem ingressos" e "não consegui
 * perguntar" levam a ações diferentes, e um `null` mudo faria as duas parecerem
 * a mesma coisa.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ehEtapaDeEvento,
  ingressosDaEtapa,
  limparCacheDeIngressos,
} from "../services/ingressos-do-evento.js";

const STAGE = "81ea6018-58d7-4765-8879-8d9249902f2e";
const PROJ = "e25369be-1d04-4153-8178-14a3b617e70e";

/** Um `db` de mentira: a 1ª consulta é a config, a 2ª é a conexão. */
function dbFalso(config: unknown[], conexao: unknown[]) {
  const fila = [config, conexao];
  const select = vi.fn(() => ({
    from: () => ({ where: () => ({ limit: async () => fila.shift() ?? [] }) }),
  }));
  return { db: { select } as never, select };
}

beforeEach(() => limparCacheDeIngressos());

describe("só a etapa de evento conta ingressos", () => {
  it("event_capture sim; as outras não", () => {
    expect(ehEtapaDeEvento("event_capture")).toBe(true);
    expect(ehEtapaDeEvento("paid")).toBe(false);
    expect(ehEtapaDeEvento("sales")).toBe(false);
    expect(ehEtapaDeEvento(null)).toBe(false);
  });
});

describe("a ausência tem causa", () => {
  it("etapa sem produto configurado diz `sem-produto`", async () => {
    const { db } = dbFalso([{ productIds: [] }], []);
    const r = await ingressosDaEtapa(db, STAGE, PROJ);
    expect(r.total).toBeNull();
    expect(r.motivo).toBe("sem-produto");
  });

  it("projeto sem conexão Kiwify diz `sem-conexao`", async () => {
    // Diferente de "vendeu zero": aqui nem dá para perguntar.
    const { db } = dbFalso([{ productIds: ["p1"] }], []);
    const r = await ingressosDaEtapa(db, STAGE, PROJ);
    expect(r.total).toBeNull();
    expect(r.motivo).toBe("sem-conexao");
  });

  it("config ausente também é `sem-produto`, não erro", async () => {
    const { db } = dbFalso([], []);
    const r = await ingressosDaEtapa(db, STAGE, PROJ);
    expect(r.motivo).toBe("sem-produto");
  });
});

describe("nunca derruba a rota", () => {
  it("erro ao decifrar credencial vira motivo, não exceção", async () => {
    // A rota já tinha resposta útil sem este campo. Derrubá-la porque a Kiwify
    // piscou seria trocar um campo a mais por um endpoint a menos.
    const { db } = dbFalso(
      [{ productIds: ["p1"] }],
      [
        {
          clientId: "lixo",
          clientIdIv: "lixo",
          clientSecret: "lixo",
          clientSecretIv: "lixo",
          accountId: "lixo",
          accountIdIv: "lixo",
        },
      ],
    );
    const avisos: string[] = [];
    const r = await ingressosDaEtapa(db, STAGE, PROJ, { warn: (_o, m) => avisos.push(m) });
    expect(r.total).toBeNull();
    expect(r.motivo).toBe("falha-na-kiwify");
    // E o log registra: falha silenciosa de integração não se descobre depois.
    expect(avisos).toHaveLength(1);
  });
});

describe("cache", () => {
  it("a segunda chamada no mesmo intervalo não vai ao banco", async () => {
    const { db, select } = dbFalso([{ productIds: [] }], []);
    await ingressosDaEtapa(db, STAGE, PROJ);
    await ingressosDaEtapa(db, STAGE, PROJ);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("etapas diferentes não compartilham cache", async () => {
    const a = dbFalso([{ productIds: [] }], []);
    await ingressosDaEtapa(a.db, STAGE, PROJ);
    const b = dbFalso([{ productIds: [] }], []);
    await ingressosDaEtapa(b.db, "outra-etapa", PROJ);
    expect(b.select).toHaveBeenCalledTimes(1);
  });

  it("limpar o cache força a releitura", async () => {
    const { db, select } = dbFalso([{ productIds: [] }], []);
    await ingressosDaEtapa(db, STAGE, PROJ);
    limparCacheDeIngressos(STAGE);
    const outro = dbFalso([{ productIds: [] }], []);
    await ingressosDaEtapa(outro.db, STAGE, PROJ);
    expect(select).toHaveBeenCalledTimes(1);
    expect(outro.select).toHaveBeenCalledTimes(1);
  });
});
