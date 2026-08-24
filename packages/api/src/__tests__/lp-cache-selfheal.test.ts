/**
 * Story 29.56 — verificação por reversão.
 *
 * A tabela do "🧪 Verificação por reversão" da story, uma linha por `describe`.
 * Cada teste tem que FALHAR com o defeito de volta.
 *
 * ⚠️ O db é falso, mas os testes NÃO se contentam com o valor de retorno: eles
 * inspecionam o que foi passado a `.values()` e a `.set()`. Um teste que só
 * conferisse `resultado.carimbados === 2` passaria com a gravação removida,
 * desde que a contagem continuasse certa — que é exatamente o tipo de teste
 * decorativo que o projeto já pagou para aprender a não escrever.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  curarCacheDeLp,
  selecionarParaCura,
  limparCooldownDeCura,
  TETO_POR_CURA,
  COOLDOWN_MS,
  type ParamsDaCura,
} from "../services/lp-cache-selfheal.js";
import type { MetaAdCreative } from "../services/meta-ads.js";

/** O que o db falso registrou, para inspeção. */
interface Registro {
  inserts: { values: Record<string, unknown>[]; conflito: "nothing" | "update" | null }[];
  updates: { set: Record<string, unknown>; alvo: unknown }[];
}

function dbFalso() {
  const reg: Registro = { inserts: [], updates: [] };
  const db = {
    insert() {
      const entrada: Registro["inserts"][number] = { values: [], conflito: null };
      const cadeia = {
        values(v: Record<string, unknown>[]) {
          entrada.values = v;
          reg.inserts.push(entrada);
          return {
            onConflictDoNothing() {
              entrada.conflito = "nothing";
              return Promise.resolve();
            },
            onConflictDoUpdate() {
              entrada.conflito = "update";
              return Promise.resolve();
            },
          };
        },
      };
      return cadeia;
    },
    update() {
      return {
        set(s: Record<string, unknown>) {
          return {
            where(alvo: unknown) {
              reg.updates.push({ set: s, alvo });
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
  // O tipo real é `Database` (drizzle); o falso implementa só o que a cura usa.
  return { db: db as never, reg };
}

/** Concatena os pedaços textuais de um template `sql` do drizzle. */
function textoDoSql(valor: unknown): string {
  const chunks = (valor as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return "";
  return chunks
    .map((c) => {
      if (typeof c === "string") return c;
      const v = (c as { value?: unknown })?.value;
      if (typeof v === "string") return v;
      if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join("");
      return "";
    })
    .join(" ");
}

/** Conta o que seria gravado sem tocar no CDN de miniaturas da Meta. */
const gravarFalso: ParamsDaCura["gravarCriativos"] = async (_db, _p, cs) => cs.length;

function criativo(adId: string, linkUrl: string | null): MetaAdCreative {
  return { adId, linkUrl } as MetaAdCreative;
}

const CONTA = { projectId: "proj-1", metaAccountId: "act_1", accessToken: "tok" };

beforeEach(() => limparCooldownDeCura());

describe("o endpoint agenda o refresh do que identificou como velho (AC1)", () => {
  it("chama a Meta com os ad_ids velhos", async () => {
    const { db } = dbFalso();
    const pedidos: string[][] = [];
    const r = await curarCacheDeLp({
      db,
      ...CONTA,
      staleInCache: ["ad_a", "ad_b"],
      missingFromCache: [],
      buscarCriativos: async (_c, _t, ids) => {
        pedidos.push(ids);
        return ids.map((id) => criativo(id, "https://exemplo.com/lp"));
      },
      gravarCriativos: async (_db, _p, cs) => cs.length,
    });
    // Com o agendamento removido, `pedidos` fica vazio — e é isso que o teste
    // olha, não o status de uma resposta HTTP.
    expect(pedidos).toEqual([["ad_a", "ad_b"]]);
    expect(r.agendados).toBe(2);
    expect(r.resolvidos).toBe(2);
  });

  it("fila vazia não vira chamada à Meta", async () => {
    const { db } = dbFalso();
    let chamou = false;
    const r = await curarCacheDeLp({
      db,
      ...CONTA,
      staleInCache: [],
      missingFromCache: [],
      buscarCriativos: async () => {
        chamou = true;
        return [];
      },
    });
    expect(chamou).toBe(false);
    expect(r.agendados).toBe(0);
  });
});

describe("teto por chamada (AC2)", () => {
  it("300 velhos viram 100 enviados, não 300", async () => {
    const { db } = dbFalso();
    const muitos = Array.from({ length: 300 }, (_, i) => `ad_${i}`);
    let enviados = 0;
    await curarCacheDeLp({
      db,
      ...CONTA,
      staleInCache: muitos,
      missingFromCache: [],
      buscarCriativos: async (_c, _t, ids) => {
        enviados = ids.length;
        return ids.map((id) => criativo(id, "https://exemplo.com/lp"));
      },
      gravarCriativos: async (_db, _p, cs) => cs.length,
    });
    expect(enviados).toBe(TETO_POR_CURA);
    expect(enviados).toBe(100);
  });
});

describe("prioridade: stale antes de missing (AC3)", () => {
  it("com 120 stale e 30 missing, nenhum missing entra nos 100", () => {
    const stale = Array.from({ length: 120 }, (_, i) => `stale_${i}`);
    const missing = Array.from({ length: 30 }, (_, i) => `missing_${i}`);
    const fila = selecionarParaCura(stale, missing);
    expect(fila).toHaveLength(100);
    expect(fila.some((id) => id.startsWith("missing_"))).toBe(false);
  });

  it("sobrando espaço, os missing entram DEPOIS dos stale", () => {
    const fila = selecionarParaCura(["s1", "s2"], ["m1", "m2"]);
    expect(fila).toEqual(["s1", "s2", "m1", "m2"]);
  });

  it("um id nas duas listas não ocupa duas vagas", () => {
    expect(selecionarParaCura(["x", "y"], ["x", "z"])).toEqual(["x", "y", "z"]);
  });
});

describe("cooldown por projeto (AC4)", () => {
  it("duas chamadas seguidas agendam uma vez só", async () => {
    const { db } = dbFalso();
    let chamadas = 0;
    const params = {
      db,
      ...CONTA,
      staleInCache: ["ad_a"],
      missingFromCache: [],
      buscarCriativos: async (_c: string, _t: string, ids: string[]) => {
        chamadas++;
        return ids.map((id) => criativo(id, "https://exemplo.com/lp"));
      },
      gravarCriativos: gravarFalso,
    };
    await curarCacheDeLp({ ...params, agoraMs: 1_000_000 });
    await curarCacheDeLp({ ...params, agoraMs: 1_000_000 + 60_000 });
    expect(chamadas).toBe(1);
  });

  it("passados os 10 minutos, tenta de novo", async () => {
    const { db } = dbFalso();
    let chamadas = 0;
    const params = {
      db,
      ...CONTA,
      staleInCache: ["ad_a"],
      missingFromCache: [],
      buscarCriativos: async (_c: string, _t: string, ids: string[]) => {
        chamadas++;
        return ids.map((id) => criativo(id, "https://exemplo.com/lp"));
      },
      gravarCriativos: gravarFalso,
    };
    await curarCacheDeLp({ ...params, agoraMs: 1_000_000 });
    await curarCacheDeLp({ ...params, agoraMs: 1_000_000 + COOLDOWN_MS });
    expect(chamadas).toBe(2);
  });

  it("projetos diferentes não compartilham o cooldown", async () => {
    const { db } = dbFalso();
    let chamadas = 0;
    const base = {
      db,
      metaAccountId: "act_1",
      accessToken: "tok",
      staleInCache: ["ad_a"],
      missingFromCache: [],
      agoraMs: 1_000_000,
      buscarCriativos: async (_c: string, _t: string, ids: string[]) => {
        chamadas++;
        return ids.map((id) => criativo(id, "https://exemplo.com/lp"));
      },
      gravarCriativos: gravarFalso,
    };
    await curarCacheDeLp({ ...base, projectId: "proj-1" });
    await curarCacheDeLp({ ...base, projectId: "proj-2" });
    expect(chamadas).toBe(2);
  });
});

describe("o que a Meta não devolve é carimbado, não re-enfileirado (AC5)", () => {
  it("ad_id fora do cache que a Meta ignorou vira linha com o carimbo atual", async () => {
    const { db, reg } = dbFalso();
    const r = await curarCacheDeLp({
      db,
      ...CONTA,
      staleInCache: [],
      missingFromCache: ["ad_fantasma"],
      buscarCriativos: async () => [], // a Meta não conhece este anúncio
      gravarCriativos: async () => 0,
    });
    expect(r.carimbados).toBe(1);

    // O que interessa é o PAYLOAD: sem `linkUrlResolver` a linha voltaria a
    // `staleInCache` na próxima abertura, e a fila nunca esvaziaria.
    const insercao = reg.inserts.at(-1)!;
    expect(insercao.values).toHaveLength(1);
    const linha = insercao.values[0] as {
      adId: string;
      creative: { linkUrl: unknown; linkUrlResolver: unknown };
    };
    expect(linha.adId).toBe("ad_fantasma");
    expect(linha.creative.linkUrl).toBeNull();
    expect(linha.creative.linkUrlResolver).toBeGreaterThanOrEqual(2);

    // E não pode sobrescrever uma linha boa que já exista.
    expect(insercao.conflito).toBe("nothing");
  });

  it("ad_id JÁ no cache velho que a Meta ignorou é carimbado por update", async () => {
    const { db, reg } = dbFalso();
    // `onConflictDoNothing` não alcança este caso: a linha existe, então o
    // insert seria descartado e o `linkUrlResolver` antigo sobreviveria — o
    // anúncio ficaria em `staleInCache` para sempre.
    const r = await curarCacheDeLp({
      db,
      ...CONTA,
      staleInCache: ["ad_velho"],
      missingFromCache: [],
      buscarCriativos: async () => [],
      gravarCriativos: async () => 0,
    });
    expect(r.carimbados).toBe(1);
    expect(reg.updates).toHaveLength(1);
    // O `set.creative` é um template do drizzle (`sql`), não uma string —
    // `JSON.stringify` nele estoura em referência circular. `textoDoSql` lê os
    // `queryChunks`, que é onde dá para ver QUAL caminho do jsonb foi escrito:
    // a diferença entre carimbar o resolver e sobrescrever o criativo inteiro.
    const sqlDoUpdate = textoDoSql(reg.updates[0]!.set.creative);
    expect(sqlDoUpdate).toContain("linkUrlResolver");
    expect(sqlDoUpdate).toContain("jsonb_set");
  });

  it("o que a Meta DEVOLVEU não é carimbado como ausência", async () => {
    const { db, reg } = dbFalso();
    const r = await curarCacheDeLp({
      db,
      ...CONTA,
      staleInCache: ["ad_a"],
      missingFromCache: ["ad_b"],
      buscarCriativos: async () => [criativo("ad_a", "https://exemplo.com/lp")],
      gravarCriativos: async (_db, _p, cs) => cs.length,
    });
    expect(r.resolvidos).toBe(1);
    // Só `ad_b` ficou de fora.
    expect(r.carimbados).toBe(1);
    const inseridos = reg.inserts.flatMap((i) =>
      i.values.map((v) => (v as { adId: string }).adId),
    );
    expect(inseridos).toEqual(["ad_b"]);
  });

  it("falha da Meta NÃO carimba nada — timeout não é medição", async () => {
    const { db, reg } = dbFalso();
    const r = await curarCacheDeLp({
      db,
      ...CONTA,
      staleInCache: ["ad_a"],
      missingFromCache: ["ad_b"],
      buscarCriativos: async () => {
        throw new Error("rate limit");
      },
    });
    // Gravar "a Meta não tem" a partir de um 429 encerraria a investigação do
    // gestor com base numa informação que não temos.
    expect(r).toEqual({ agendados: 0, resolvidos: 0, carimbados: 0 });
    expect(reg.inserts).toHaveLength(0);
    expect(reg.updates).toHaveLength(0);
  });
});
