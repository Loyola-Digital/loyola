/**
 * Story 18.99 — coluna Status (Ativo / Pausado) no "Desempenho por LP" do perpétuo.
 *
 * Cada teste diz a mutação que derruba.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLpRows,
  sortLpRows,
  juntarStatusDosLotes,
  UNRESOLVED_LP_KEY,
  type LpAdInput,
  type LpRow,
  type StatusDosAnuncios,
} from "../perpetual-lp-rows";
import { buildLpAdInputs, type EntityDailyAdRow } from "../perpetual-lp-ads";
import { filtrarPorPublico, type ClassificacaoDeEntidade } from "../filtro-de-publico";

const LP_A = "https://lps.exemplo.com/captura-a";
const LP_B = "https://lps.exemplo.com/captura-b";
const LP_C = "https://lps.exemplo.com/captura-c";

/** `campaignId` carrega o ad_id (herança de `CampaignAnalytics`). */
const ad = (adId: string, spend = 100): LpAdInput => ({
  campaignId: adId, spend, impressions: 1000, clicks: 50, linkClicks: 40, revenue: 0, sales: 0,
});

function porChave(rows: LpRow[]): Map<string, LpRow> {
  return new Map(rows.map((r) => [r.key, r]));
}

const chave = (url: string) => url.replace(/^https:\/\//, "");

/** Campanha com id próprio: o id conta, o nome vai para o tooltip. */
const camp = (nome: string, campaignId = `id-${nome}`) => ({ campaignId, nome });

describe("Story 18.99 — a regra (AC2)", () => {
  const links = { a1: LP_A, a2: LP_A, b1: LP_B, b2: LP_B, c1: LP_C, d1: LP_A, d2: LP_A };
  const status: StatusDosAnuncios = {
    statusByAdId: { a1: "active", a2: "paused", b1: "paused", b2: "paused" },
    campanhaByAdId: { a1: camp("camp-A"), a2: camp("camp-B"), b1: camp("camp-A"), b2: camp("camp-A") },
  };
  const r = porChave(buildLpRows([ad("a1"), ad("a2"), ad("b1"), ad("b2"), ad("c1")], links, [], 0, [], status));

  it("um anúncio ativo e outro pausado pela campanha → Ativo, com a campanha do ativo", () => {
    // Mutação "Ativo só se TODOS ativos" → vira paused aqui.
    expect(r.get(chave(LP_A))?.status).toBe("active");
    expect(r.get(chave(LP_A))?.campanhasAtivas).toEqual(["camp-A"]);
  });

  it("todos pausados → Pausado, sem campanha ativa", () => {
    expect(r.get(chave(LP_B))?.status).toBe("paused");
    expect(r.get(chave(LP_B))?.campanhasAtivas).toEqual([]);
  });

  it("nenhum anúncio com status no cache → unknown (\"—\"), nunca Pausado", () => {
    // Mutação "anúncio sem status conta como pausado" → vira paused aqui.
    expect(r.get(chave(LP_C))?.status).toBe("unknown");
  });

  it("um ativo + um sem status continua Ativo", () => {
    const m = porChave(
      buildLpRows([ad("d1"), ad("d2")], links, [], 0, [], { statusByAdId: { d2: "active" }, campanhaByAdId: { d2: camp("camp-D") } }),
    );
    expect(m.get(chave(LP_A))?.status).toBe("active");
  });

  it("a linha \"Sem link resolvido\" segue a mesma regra (P4)", () => {
    const m = porChave(
      buildLpRows([ad("x1")], { x1: null }, [], 0, [], { statusByAdId: { x1: "active" }, campanhaByAdId: {} }),
    );
    expect(m.get(UNRESOLVED_LP_KEY)?.status).toBe("active");
  });
});

describe("Story 18.99 — as campanhas do tooltip (AC3, QA REQ-001)", () => {
  it("conta pelo id: duas campanhas com o mesmo nome são duas", () => {
    // Mutação "agrupar pelo nome" → vira 1 campanha.
    const m = porChave(
      buildLpRows([ad("a1"), ad("a2")], { a1: LP_A, a2: LP_A }, [], 0, [], {
        statusByAdId: { a1: "active", a2: "active" },
        campanhaByAdId: { a1: camp("Frio", "111"), a2: camp("Frio", "222") },
      }),
    );
    expect(m.get(chave(LP_A))?.campanhasAtivas).toEqual(["Frio", "Frio"]);
  });

  it("os nomes saem em ordem alfabética, como na 18.97", () => {
    // Mutação "sem o sort" → sai na ordem dos anúncios (Zeta, Alfa).
    const m = porChave(
      buildLpRows([ad("a1"), ad("a2")], { a1: LP_A, a2: LP_A }, [], 0, [], {
        statusByAdId: { a1: "active", a2: "active" },
        campanhaByAdId: { a1: camp("Zeta"), a2: camp("Alfa") },
      }),
    );
    expect(m.get(chave(LP_A))?.campanhasAtivas).toEqual(["Alfa", "Zeta"]);
  });

  it("campanhas distintas dos anúncios ativos, sem repetir", () => {
    const m = porChave(
      buildLpRows([ad("a1"), ad("a2"), ad("a3")], { a1: LP_A, a2: LP_A, a3: LP_A }, [], 0, [], {
        statusByAdId: { a1: "active", a2: "active", a3: "active" },
        campanhaByAdId: { a1: camp("camp-A"), a2: camp("camp-A"), a3: camp("camp-B") },
      }),
    );
    expect(m.get(chave(LP_A))?.campanhasAtivas).toEqual(["camp-A", "camp-B"]);
  });

  it("anúncio ativo sem campanha conhecida conta para o status, sem nome", () => {
    const m = porChave(
      buildLpRows([ad("a1")], { a1: LP_A }, [], 0, [], { statusByAdId: { a1: "active" } }),
    );
    expect(m.get(chave(LP_A))?.status).toBe("active");
    // "" conta 1 campanha no tooltip, e o `StatusDaLp` não imprime o nome vazio.
    expect(m.get(chave(LP_A))?.campanhasAtivas).toEqual([""]);
  });
});

describe("Story 18.99 — o status segue o filtro de público (AC2)", () => {
  // A cadeia do dashboard: filtrarPorPublico → buildLpAdInputs → buildLpRows.
  const dia = (entityId: string): EntityDailyAdRow => ({
    entityId, dateStart: "2026-10-27", spend: 100, impressions: 1000, clicks: 50, linkClicks: 40,
  });
  const temperatura: Record<string, ClassificacaoDeEntidade> = {
    quente1: { temperatura: "quente", nivel: "campanha" },
    frio1: { temperatura: "frio", nivel: "campanha" },
  };
  const status: StatusDosAnuncios = {
    statusByAdId: { quente1: "active", frio1: "paused" },
    campanhaByAdId: { quente1: camp("camp-quente"), frio1: camp("camp-frio") },
  };
  const linhas = (filtro: "todos" | "frio") => {
    const filtradas = filtrarPorPublico([dia("quente1"), dia("frio1")], filtro, (r) => r.entityId, temperatura);
    const ads = buildLpAdInputs(filtradas.linhas, new Map(), (s) => s);
    return porChave(buildLpRows(ads, { quente1: LP_A, frio1: LP_A }, [], 0, [], status));
  };

  it("com Todos, o anúncio quente ativo deixa a LP Ativa", () => {
    expect(linhas("todos").get(chave(LP_A))?.status).toBe("active");
  });

  it("o filtro Frio tira o único anúncio ativo e a LP fica Pausada", () => {
    // Mutação "status lido de todos os anúncios, antes do filtro" → continua active.
    expect(linhas("frio").get(chave(LP_A))?.status).toBe("paused");
  });
});

describe("Story 18.99 — ordenação (AC4)", () => {
  const rows = buildLpRows(
    [ad("a1"), ad("b1"), ad("c1"), ad("x1")],
    { a1: LP_A, b1: LP_B, c1: LP_C, x1: null },
    [],
    0,
    [],
    { statusByAdId: { a1: "paused", b1: "active", x1: "active" }, campanhaByAdId: {} },
  );

  it("desc: Ativo → Pausado → \"—\", com \"Sem link resolvido\" no fim", () => {
    expect(sortLpRows(rows, "status", "desc").map((r) => r.key)).toEqual([
      chave(LP_B), chave(LP_A), chave(LP_C), UNRESOLVED_LP_KEY,
    ]);
  });

  it("asc inverte, e \"Sem link resolvido\" continua no fim", () => {
    expect(sortLpRows(rows, "status", "asc").map((r) => r.key)).toEqual([
      chave(LP_C), chave(LP_A), chave(LP_B), UNRESOLVED_LP_KEY,
    ]);
  });
});

describe("Story 18.99 — API anterior ao contrato 60 (AC6)", () => {
  it("sem `statusDosAnuncios`, nenhuma linha tem status (\"—\")", () => {
    const rows = buildLpRows([ad("a1"), ad("x1")], { a1: LP_A, x1: null }, [], 0, []);
    expect(rows.every((r) => r.status === undefined && r.campanhasAtivas === undefined)).toBe(true);
  });
});

describe("Story 18.99 — o fio na tela e no hook (AC1, AC6)", () => {
  const painel = readFileSync(new URL("../../../components/funnels/perpetual-dashboard.tsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../../hooks/use-traffic-analytics.ts", import.meta.url), "utf8");

  it("a célula Status vem logo depois da célula da LP, com o badge da 18.97", () => {
    expect(painel).toContain('import { StatusDaLp } from "@/lib/components/funnels/lp-performance-table";');
    expect(painel).toMatch(
      /row\.key\s*\)\}\s*<\/td>\s*<td className="py-2 px-2">\s*<StatusDaLp status=\{row\.status\} campanhasAtivas=\{row\.campanhasAtivas\} \/>/,
    );
    expect(painel).toContain('onClick={() => toggleLpSort("status")}');
  });

  it("o painel só passa status quando a API informou `statusByAdId`", () => {
    expect(painel).toMatch(/linkUrlsData\?\.statusByAdId\s*\?\s*\{ statusByAdId: linkUrlsData\.statusByAdId/);
  });

  it("o hook junta TODOS os lotes, não só os que responderam (QA REL-001)", () => {
    expect(hook).toContain("const status = juntarStatusDosLotes(results.map((r) => r.data));");
    expect(hook).toContain("statusByAdId: status?.statusByAdId,");
  });
});

describe("Story 18.99 — junção dos lotes (AC6, QA REL-001)", () => {
  const lote1 = { statusByAdId: { a1: "paused" as const }, campanhaByAdId: { a1: camp("A") } };
  const lote2 = { statusByAdId: { b1: "active" as const }, campanhaByAdId: { b1: camp("B") } };

  it("dois lotes completos viram um mapa só", () => {
    // Mutação "só o primeiro lote" → o b1 some.
    expect(juntarStatusDosLotes([lote1, lote2])).toEqual({
      statusByAdId: { a1: "paused", b1: "active" },
      campanhaByAdId: { a1: camp("A"), b1: camp("B") },
    });
  });

  it("um lote carregando ou com erro deixa tudo desconhecido", () => {
    // Mutação "juntar só os que chegaram" → a1 sai paused sem o lote do ativo.
    expect(juntarStatusDosLotes([lote1, undefined])).toBeUndefined();
  });

  it("um lote de API anterior (sem o campo) deixa tudo desconhecido", () => {
    expect(juntarStatusDosLotes([lote1, {}])).toBeUndefined();
  });

  it("nenhum lote → desconhecido", () => {
    expect(juntarStatusDosLotes([])).toBeUndefined();
  });

  it("com o lote do ativo faltando, a linha Sem link não vira Pausado", () => {
    const status = juntarStatusDosLotes([lote1, undefined]);
    const m = porChave(buildLpRows([ad("a1"), ad("b1")], { a1: null, b1: null }, [], 0, [], status));
    expect(m.get(UNRESOLVED_LP_KEY)?.status).toBeUndefined();
  });
});
