/**
 * Story 18.97 — coluna Status (Ativo / Pausado) na "Desempenho de Testes de LPs".
 *
 * Cada teste diz a mutação que derruba.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAVE_SEM_LINK,
  montarLinhasDeLpPorUrl,
  type AnuncioDaLp,
  type CampanhaSemDadoPorAnuncio,
  type LpPorAnuncio,
  type LpRow,
} from "@/lib/utils/lps-do-lancamento";

const HOJE = "2026-10-27";
const LP_A = "lps.exemplo.com/captura-a";
const LP_B = "lps.exemplo.com/captura-b";
const LP_C = "lps.exemplo.com/captura-c";

function anuncio(adId: string, lpKey: string | null, extra: Partial<AnuncioDaLp> = {}): AnuncioDaLp {
  return {
    adId,
    campaignId: "c1",
    campaignName: "camp-A",
    temperature: "cold",
    url: lpKey ? `https://${lpKey}` : null,
    lpKey,
    causa: lpKey ? null : "sem_link_na_meta",
    spend: 10,
    impressions: 100,
    clicks: 10,
    landingPageViews: 5,
    pixelLeads: 0,
    vendas: 0,
    faturamento: 0,
    ...extra,
  };
}

function linhas(lp: LpPorAnuncio, extra: Partial<Parameters<typeof montarLinhasDeLpPorUrl>[0]> = {}): Map<string, LpRow> {
  const rows = montarLinhasDeLpPorUrl({
    lpPorAnuncio: lp,
    correcoes: {},
    leadsPorAnuncio: {},
    publico: "todos",
    dataDoImposto: HOJE,
    ...extra,
  });
  return new Map(rows.map((r) => [r.lpKey ?? r.lpName, r]));
}

describe("Story 18.97 — a regra (AC2)", () => {
  const r = linhas({
    anuncios: [
      // LP A: ativa na campanha A, pausada pela campanha na B → Ativo (1 campanha)
      anuncio("1", LP_A, { status: "active" }),
      anuncio("2", LP_A, { status: "paused", campaignId: "c2", campaignName: "camp-B" }),
      // LP B: todos os anúncios pausados, mesmo numa campanha ativa → Pausado
      anuncio("3", LP_B, { status: "paused" }),
      anuncio("4", LP_B, { status: "paused" }),
      // LP C: nenhum anúncio no cache de status → "—"
      anuncio("5", LP_C, { status: "unknown" }),
    ],
    campanhasSemDadoPorAnuncio: [],
  });

  it("ativo em ao menos uma campanha → Ativo, com a campanha no tooltip", () => {
    // Mutação "Ativo só se TODOS ativos" → vira paused aqui.
    expect(r.get(LP_A)?.status).toBe("active");
    expect(r.get(LP_A)?.campanhasAtivas).toEqual(["camp-A"]);
  });

  it("pausado em todas → Pausado", () => {
    expect(r.get(LP_B)?.status).toBe("paused");
    expect(r.get(LP_B)?.campanhasAtivas).toEqual([]);
  });

  it("sem status conhecido → unknown (\"—\"), nunca Pausado", () => {
    // Mutação "unknown conta como conhecido" → vira paused aqui.
    expect(r.get(LP_C)?.status).toBe("unknown");
  });

  it("um ativo + um desconhecido continua Ativo", () => {
    const m = linhas({
      anuncios: [anuncio("1", LP_A, { status: "unknown" }), anuncio("2", LP_A, { status: "active" })],
      campanhasSemDadoPorAnuncio: [],
    });
    expect(m.get(LP_A)?.status).toBe("active");
  });
});

describe("Story 18.97 — o status segue o gasto da linha (AC2, AC8)", () => {
  it("a correção manual por campanha leva o status junto", () => {
    // O anúncio ativo está sem link; a correção da campanha c7 manda para LP_B.
    const r = linhas(
      {
        anuncios: [
          anuncio("1", LP_B, { status: "paused" }),
          anuncio("2", null, { status: "active", campaignId: "c7", campaignName: "camp-corrigida" }),
        ],
        campanhasSemDadoPorAnuncio: [],
      },
      { correcoes: { c7: `https://${LP_B}` } },
    );
    expect(r.get(LP_B)?.status).toBe("active");
    expect(r.get(LP_B)?.campanhasAtivas).toEqual(["camp-corrigida"]);
    expect(r.has(CHAVE_SEM_LINK)).toBe(false);
  });

  it("o filtro de público que tira o único anúncio ativo deixa a linha Pausada", () => {
    const lp: LpPorAnuncio = {
      anuncios: [
        anuncio("1", LP_A, { status: "active", temperature: "hot" }),
        anuncio("2", LP_A, { status: "paused", temperature: "cold" }),
      ],
      campanhasSemDadoPorAnuncio: [],
    };
    expect(linhas(lp).get(LP_A)?.status).toBe("active");
    // Mutação "status antes do filtro de público" → continua active aqui.
    expect(linhas(lp, { publico: "cold" }).get(LP_A)?.status).toBe("paused");
  });

  it("o filtro de mídia vale também (Vídeo tira o estático ativo)", () => {
    const lp: LpPorAnuncio = {
      anuncios: [
        anuncio("1", LP_A, { status: "active" }),
        anuncio("2", LP_A, { status: "paused" }),
      ],
      campanhasSemDadoPorAnuncio: [],
    };
    const nomes = new Map([
      ["1", "ad01--estatico"],
      ["2", "adv02--video"],
    ]);
    expect(linhas(lp, { midia: "video", nomeDoAnuncio: nomes }).get(LP_A)?.status).toBe("paused");
  });
});

describe("Story 18.97 — Sem link resolvido e gasto sem anúncio (P4)", () => {
  const semAnuncio: CampanhaSemDadoPorAnuncio = {
    campaignId: "c9",
    campaignName: "camp-sem-anuncio",
    temperature: "cold",
    inteira: true,
    spend: 500,
    impressions: 5000,
    clicks: 50,
    landingPageViews: 25,
    pixelLeads: 0,
  };

  it("a linha Sem link segue a mesma regra pelos anúncios dela", () => {
    const r = linhas({ anuncios: [anuncio("1", null, { status: "active" })], campanhasSemDadoPorAnuncio: [semAnuncio] });
    expect(r.get(CHAVE_SEM_LINK)?.status).toBe("active");
  });

  it("linha só com gasto de campanha sem anúncio fica sem status (\"—\")", () => {
    const r = linhas({ anuncios: [anuncio("1", LP_A, { status: "active" })], campanhasSemDadoPorAnuncio: [semAnuncio] });
    expect(r.get(CHAVE_SEM_LINK)?.status).toBeUndefined();
  });

  it("a correção que leva a campanha sem anúncio para uma LP não muda o status dela", () => {
    const r = linhas(
      { anuncios: [anuncio("1", LP_A, { status: "paused" })], campanhasSemDadoPorAnuncio: [semAnuncio] },
      { correcoes: { c9: `https://${LP_A}` } },
    );
    expect(r.get(LP_A)?.status).toBe("paused");
  });
});

describe("Story 18.97 — API anterior ao contrato 58 (AC7)", () => {
  it("sem `status` nos anúncios, nenhuma linha tem status (\"—\")", () => {
    const r = linhas({ anuncios: [anuncio("1", LP_A), anuncio("2", LP_B)], campanhasSemDadoPorAnuncio: [] });
    expect([...r.values()].every((l) => l.status === undefined)).toBe(true);
  });
});

describe("Story 18.97 — o fio da tabela (AC1, AC3, AC4)", () => {
  const tabela = readFileSync(
    new URL("../../components/funnels/lp-performance-table.tsx", import.meta.url),
    "utf8",
  );

  it("a célula Status vem logo depois da célula da LP, com o badge dos Criativos", () => {
    expect(tabela).toContain('import { CREATIVE_STATUS_BADGE } from "@/components/funnels/stage-creative-performance-table";');
    expect(tabela).toMatch(/<\/TableCell>\s*<TableCell>\s*<StatusDaLp status=\{row\.status\} campanhasAtivas=\{row\.campanhasAtivas\} \/>/);
  });

  it("ordenável por rank Ativo → Pausado → —, e o Total fica vazio", () => {
    expect(tabela).toContain('onClick={() => handleSort("status")}');
    expect(tabela).toContain("const RANK_DO_STATUS = { active: 2, paused: 1 } as const;");
    expect(tabela).toMatch(/Total<\/TableCell>\s*<TableCell \/>/);
  });

  it("o tooltip diz em quantas campanhas e que o dado é diário", () => {
    expect(tabela).toContain("Ativo em ${n} campanha");
    expect(tabela).toContain("Pausado em todas as campanhas");
    expect(tabela).toContain("atualizado uma vez por dia (de madrugada)");
  });

  it("a linha expandida cobre a coluna nova", () => {
    expect(tabela).toContain("colSpan={columns.length + (expansivel ? 3 : 2)}");
  });
});
