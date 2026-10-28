import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { Database } from "../db/client.js";

/**
 * Story 18.98 — o caminho em lote da Meta no fuso da conta.
 *
 * Das 21h às 24h de Brasília o "hoje" em UTC já é amanhã. A cópia UTC de
 * `dateRangeFromDays` no cache pedia ao banco um "amanhã" que nunca tem linha:
 * toda campanha ia para a busca ao vivo e, se a Meta falhasse, o dia mais
 * antigo sumia. O TTL tratava o hoje de Brasília como "passado".
 *
 * Cada teste diz a mutação que derruba.
 */

const mockFetchIds = vi.fn();
vi.mock("../services/meta-ads.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/meta-ads.js")>();
  return { ...real, fetchCampaignDailyInsightsForIds: (...a: unknown[]) => mockFetchIds(...a) };
});

// O banco simulado precisa honrar o filtro de datas do SQL — é ele que mostra
// QUAIS dias o cache pediu. `inArray` vira um marcador que o `where` lê.
vi.mock("drizzle-orm", async (importOriginal) => {
  const real = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...real,
    and: (...conds: unknown[]) => ({ __and: conds }),
    eq: () => ({ __eq: true }),
    inArray: (_col: unknown, values: unknown[]) => ({ __in: values }),
  };
});

const { fetchCampaignDailyInsightsForIdsWithCacheEmContas, ttlCutoffForDate } = await import(
  "../services/meta-insights-cache.js"
);
const { dateRangeFromDays } = await import("../services/meta-ads.js");

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

interface LinhaDoBanco {
  campaignId: string;
  dateStart: string;
  lastSyncedAt: Date;
  impressions: number;
  reach: number;
  clicks: number;
  spend: string;
  actions: null;
  actionValues: null;
}

let banco: LinhaDoBanco[] = [];
let diasPedidos: string[] = [];

const db = {
  select: () => ({
    from: () => ({
      where: (cond: { __and: Array<{ __in?: unknown[] }> }) => {
        const dias = cond.__and
          .map((c) => c.__in)
          .find((v): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string" && ISO_DIA.test(x)));
        diasPedidos = dias ?? [];
        return Promise.resolve(banco.filter((l) => diasPedidos.includes(l.dateStart)));
      },
    }),
  }),
  insert: () => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve() }) }),
} as unknown as Database;

const CONTA = { metaAccountId: "111", accessToken: "tok", accountName: "Conta" };
const CAMPANHAS = ["c1", "c2"];
const SEMANA = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"];

// 22h30 de 26/10 em Brasília = 01h30 de 27/10 em UTC.
const NOITE = new Date("2026-10-27T01:30:00Z");
// 12h de 27/10 em Brasília: UTC e Brasília no mesmo dia.
const TARDE = new Date("2026-10-27T15:00:00Z");

function linha(campaignId: string, dateStart: string, sincronizadaEm: Date): LinhaDoBanco {
  return {
    campaignId,
    dateStart,
    lastSyncedAt: sincronizadaEm,
    impressions: 100,
    reach: 90,
    clicks: 5,
    spend: "10",
    actions: null,
    actionValues: null,
  };
}

/** Lição da 18.96: `TZ = undefined` grava a string "undefined" (= UTC). */
function noFuso(tz: string): void {
  let anterior: string | undefined;
  beforeAll(() => {
    anterior = process.env.TZ;
    process.env.TZ = tz;
  });
  afterAll(() => {
    if (anterior === undefined) delete process.env.TZ;
    else process.env.TZ = anterior;
  });
}

beforeEach(() => {
  mockFetchIds.mockReset();
  banco = [];
  diasPedidos = [];
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each(["UTC", "America/Sao_Paulo"])("Story 18.98 — processo em TZ=%s", (tz) => {
  noFuso(tz);

  describe("às 22h30 de Brasília (AC1, AC4)", () => {
    beforeEach(() => vi.setSystemTime(NOITE));

    it("a janela de 7 dias é 20 a 26/10, o calendário de Brasília", () => {
      expect(dateRangeFromDays(7)).toEqual({ since: "2026-10-20", until: "2026-10-26" });
    });

    it("o cache pede ao banco 20 a 26/10 e acerta: nenhuma ida à Meta", async () => {
      // Mutação "volta a cópia UTC" → pede 21 a 27; o 27 falta e tudo vai à Meta.
      const recente = new Date(NOITE.getTime() - 10 * 60 * 1000);
      banco = CAMPANHAS.flatMap((c) => SEMANA.map((d) => linha(c, d, recente)));

      const rows = await fetchCampaignDailyInsightsForIdsWithCacheEmContas(db, "p", [CONTA], CAMPANHAS, 7);

      expect(diasPedidos).toEqual(SEMANA);
      expect(mockFetchIds).not.toHaveBeenCalled();
      expect(rows).toHaveLength(14);
    });

    it("sem a Meta, o dia mais antigo continua", async () => {
      // Mutação "volta a cópia UTC" → o 20 fica fora do banco e a Meta não responde.
      const recente = new Date(NOITE.getTime() - 10 * 60 * 1000);
      banco = CAMPANHAS.flatMap((c) => SEMANA.map((d) => linha(c, d, recente)));
      mockFetchIds.mockResolvedValue([]);

      const rows = await fetchCampaignDailyInsightsForIdsWithCacheEmContas(db, "p", [CONTA], CAMPANHAS, 7);

      expect(rows.filter((r) => r.date_start === "2026-10-20")).toHaveLength(2);
    });

    it("o hoje de Brasília relê depois de 1 h (AC2)", () => {
      // Mutação "hoje em UTC" → 26 vira passado e devolve 1970.
      expect(ttlCutoffForDate("2026-10-26", NOITE)).toEqual(new Date(NOITE.getTime() - 60 * 60 * 1000));
    });

    it("amanhã não é tratado como hoje", () => {
      // Mutação "hoje em UTC" → 27 vira hoje.
      expect(ttlCutoffForDate("2026-10-27", NOITE)).not.toEqual(new Date(NOITE.getTime() - 60 * 60 * 1000));
    });

    it("o hoje do cache, com a linha de hoje vencida, vai à Meta", async () => {
      // Mutação "hoje em UTC" → a linha de 26 sincronizada há 2 h vale para sempre.
      const recente = new Date(NOITE.getTime() - 10 * 60 * 1000);
      const vencida = new Date(NOITE.getTime() - 2 * 60 * 60 * 1000);
      banco = SEMANA.map((d) => linha("c1", d, d === "2026-10-26" ? vencida : recente));
      mockFetchIds.mockResolvedValue([]);

      await fetchCampaignDailyInsightsForIdsWithCacheEmContas(db, "p", [CONTA], ["c1"], 7);

      expect(mockFetchIds).toHaveBeenCalledTimes(1);
    });
  });

  it("o dia sai do `now` recebido, não do relógio do sistema (AC2)", () => {
    // Mutação "todayInTimezone() sem o now" → o sistema diz 27/10 à tarde e o 26 vira passado.
    vi.setSystemTime(TARDE);
    expect(ttlCutoffForDate("2026-10-26", NOITE)).toEqual(new Date(NOITE.getTime() - 60 * 60 * 1000));
  });

  describe("às 12h de Brasília nada muda (AC5)", () => {
    beforeEach(() => vi.setSystemTime(TARDE));

    it("janela e TTL iguais aos de antes da story", () => {
      // Os valores que a cópia UTC dava neste horário.
      expect(dateRangeFromDays(7)).toEqual({ since: "2026-10-21", until: "2026-10-27" });
      expect(ttlCutoffForDate("2026-10-27", TARDE)).toEqual(new Date(TARDE.getTime() - 60 * 60 * 1000));
      expect(ttlCutoffForDate("2026-10-26", TARDE)).toEqual(new Date(0));
    });
  });
});

describe("Story 18.98 — uma régua só (AC1)", () => {
  it("o cache não tem mais cópia própria de `dateRangeFromDays`", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync(new URL("../services/meta-insights-cache.ts", import.meta.url), "utf8");
    expect(fonte).not.toMatch(/function dateRangeFromDays/);
    expect(fonte).not.toMatch(/now\.toISOString\(\)\.slice\(0, 10\)/);
  });
});
