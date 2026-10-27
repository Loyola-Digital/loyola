/**
 * Story 18.94 — "Desempenho de Testes de LPs" com o filtro Vídeo / Estático /
 * Todos pelo nome do anúncio (regra da 18.87).
 *
 * Cada teste diz a mutação que derruba.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAVE_SEM_LINK,
  montarLinhasDeLpPorUrl,
  nomesPorAnuncio,
  type AnuncioDaLp,
  type CampanhaSemDadoPorAnuncio,
  type LpPorAnuncio,
  type LpRow,
} from "@/lib/utils/lps-do-lancamento";
import type { LeadsPorTemperatura } from "@/lib/utils/contagem-de-leads";

const HOJE = "2026-10-22";
const LP_A = "lps.exemplo.com/captura-a";
const LP_B = "lps.exemplo.com/captura-b";

function anuncio(adId: string, lpKey: string | null, spend: number, extra: Partial<AnuncioDaLp> = {}): AnuncioDaLp {
  return {
    adId,
    campaignId: "c1",
    campaignName: "cold-captacao",
    temperature: "cold",
    url: lpKey ? `https://${lpKey}` : null,
    lpKey,
    causa: lpKey ? null : "sem_link_na_meta",
    spend,
    impressions: spend * 10,
    clicks: spend,
    landingPageViews: spend / 2,
    pixelLeads: 1,
    vendas: 1,
    faturamento: 100,
    ...extra,
  };
}

const campanhaSemAnuncio: CampanhaSemDadoPorAnuncio = {
  campaignId: "c9",
  campaignName: "cold-sem-anuncio",
  temperature: "cold",
  inteira: true,
  spend: 500,
  impressions: 5000,
  clicks: 50,
  landingPageViews: 25,
  pixelLeads: 0,
};

// LP A recebe um vídeo e um estático; LP B só um anúncio sem "ad" no nome;
// um estático sem link; uma campanha inteira sem dado por anúncio.
const lp: LpPorAnuncio = {
  anuncios: [
    anuncio("111", LP_A, 100),
    anuncio("222", LP_A, 40),
    anuncio("333", LP_B, 70),
    anuncio("444", null, 30),
    anuncio("555", LP_A, 20, { temperature: "hot", campaignId: "c2", campaignName: "hot-captacao" }),
  ],
  campanhasSemDadoPorAnuncio: [campanhaSemAnuncio],
};

// Os ids dos criativos vêm crus da Meta (o Sheets às vezes deixa um "_"); os
// de `lpPorAnuncio` vêm normalizados.
const creatives = [
  { adId: "111", adIds: ["111"], adName: "adv01_ia_dg_pg05_10-2026" },
  { adId: "222", adIds: ["222", "_444"], adName: "ad01_dg_pg05_10-2026" },
  { adId: "333", adIds: ["333"], adName: "carrossel-dg-pg02-abr26" },
  { adId: "555", adIds: ["555"], adName: "ADV02_hot" },
];
const nomes = nomesPorAnuncio(creatives);

const leads: Record<string, LeadsPorTemperatura> = {
  "111": { hot: 0, cold: 7, total: 7 },
  "222": { hot: 0, cold: 3, total: 3 },
  "555": { hot: 2, cold: 0, total: 2 },
};

function linhas(extra: Partial<Parameters<typeof montarLinhasDeLpPorUrl>[0]> = {}): LpRow[] {
  return montarLinhasDeLpPorUrl({
    lpPorAnuncio: lp,
    correcoes: {},
    leadsPorAnuncio: leads,
    publico: "todos",
    dataDoImposto: HOJE,
    nomeDoAnuncio: nomes,
    ...extra,
  });
}
const linha = (rows: LpRow[], k: string) => rows.find((r) => r.lpKey === k);
const somaCrua = (ids: string[]) => lp.anuncios.filter((a) => ids.includes(a.adId)).reduce((s, a) => s + a.spend, 0);
const somaInv = (rows: LpRow[]) => rows.reduce((s, r) => s + r.investimento, 0);

describe("nomesPorAnuncio", () => {
  it("cobre todos os adIds do criativo, normalizados como em lpPorAnuncio", () => {
    // Mutação: usar só `adId` (o representante) → o "444" fica sem nome.
    // Mutação: não normalizar → a chave fica "_444" e não casa.
    expect(nomes.get("444")).toBe("ad01_dg_pg05_10-2026");
    expect(nomes.get("111")).toBe("adv01_ia_dg_pg05_10-2026");
  });

  it("sem adIds (API < contrato 53), só o representante ganha nome", () => {
    const so = nomesPorAnuncio([{ adId: "222", adName: "ad01_x" }]);
    expect([...so.keys()]).toEqual(["222"]);
  });

  it("aceita lista ausente", () => {
    expect(nomesPorAnuncio(undefined).size).toBe(0);
  });
});

describe("Todos = exatamente o resultado de antes (AC2)", () => {
  it("com midia 'todos' a saída é idêntica à chamada sem o filtro", () => {
    // Mutação: excluir a 5ª causa ou os anúncios sem nome também em Todos → muda.
    const antes = montarLinhasDeLpPorUrl({
      lpPorAnuncio: lp,
      correcoes: {},
      leadsPorAnuncio: leads,
      publico: "todos",
      dataDoImposto: HOJE,
    });
    expect(linhas({ midia: "todos" })).toEqual(antes);
    expect(linhas({ midia: "todos", publico: "cold" })).toEqual(
      montarLinhasDeLpPorUrl({ lpPorAnuncio: lp, correcoes: {}, leadsPorAnuncio: leads, publico: "cold", dataDoImposto: HOJE }),
    );
  });
});

describe("Vídeo e Estático dividem a LP (AC3)", () => {
  it("Vídeo soma só os anúncios com 'adv' no nome", () => {
    const rows = linhas({ midia: "video" });
    const ref = linhas({ midia: "todos" });
    expect(linha(rows, LP_A)!.cliques).toBe(100 + 20);
    expect(linha(rows, LP_A)!.vendas).toBe(2);
    expect(linha(rows, LP_A)!.investimento).toBeCloseTo(
      linha(ref, LP_A)!.investimento * (somaCrua(["111", "555"]) / somaCrua(["111", "222", "555"])),
      6,
    );
  });

  it("Estático soma só os com 'ad' e sem 'adv' — o 'adv' não entra", () => {
    // Mutação: Estático = "contém ad" sem excluir "adv" → cliques 160.
    const rows = linhas({ midia: "estatico" });
    expect(linha(rows, LP_A)!.cliques).toBe(40);
  });
});

describe("Sem nome, só em Todos (AC4)", () => {
  it("a campanha sem dado por anúncio sai de Vídeo e de Estático", () => {
    // Mutação: deixar a 5ª causa passar fora de Todos → "Sem link resolvido"
    // ganha os 500 da campanha.
    for (const midia of ["video", "estatico"] as const) {
      const semLink = linha(linhas({ midia }), CHAVE_SEM_LINK);
      expect(semLink?.semLink?.semDadoPorAnuncio ?? 0).toBe(0);
      expect(semLink?.cliques ?? 0).not.toBeGreaterThanOrEqual(50);
    }
    expect(linha(linhas(), CHAVE_SEM_LINK)!.semLink!.semDadoPorAnuncio).toBe(1);
  });

  it("anúncio sem 'ad' no nome só aparece em Todos; a LP que fica vazia some", () => {
    expect(linha(linhas({ midia: "video" }), LP_B)).toBeUndefined();
    expect(linha(linhas({ midia: "estatico" }), LP_B)).toBeUndefined();
    expect(linha(linhas(), LP_B)).toBeDefined();
  });

  it("anúncio que não está nos criativos não é vídeo nem estático", () => {
    const rows = linhas({ midia: "video", nomeDoAnuncio: new Map() });
    expect(rows).toEqual([]);
  });

  it("o estático sem link continua em 'Sem link resolvido' no Estático", () => {
    const semLink = linha(linhas({ midia: "estatico" }), CHAVE_SEM_LINK)!;
    expect(semLink.cliques).toBe(30);
  });

  it("Vídeo + Estático ≤ Todos no investimento", () => {
    const v = somaInv(linhas({ midia: "video" }));
    const e = somaInv(linhas({ midia: "estatico" }));
    expect(v + e).toBeLessThan(somaInv(linhas()));
  });
});

describe("Leads seguem o anúncio (AC5) e combinam com Hot/Cold (AC6)", () => {
  it("lead de anúncio 'adv' entra em Vídeo e não em Estático", () => {
    // Mutação: montar o `destinoDoAnuncio` com todos os anúncios (como antes)
    // → o lead do vídeo aparece na linha do Estático.
    expect(linha(linhas({ midia: "video" }), LP_A)!.leads).toBe(7 + 2);
    expect(linha(linhas({ midia: "estatico" }), LP_A)!.leads).toBe(3);
    expect(linha(linhas(), LP_A)!.leads).toBe(12);
  });

  it("Cold + Vídeo: só campanha cold e nome com 'adv'; o lead segue o texto dele", () => {
    const rows = linhas({ midia: "video", publico: "cold" });
    expect(linha(rows, LP_A)!.cliques).toBe(100);
    expect(linha(rows, LP_A)!.leads).toBe(7);
  });

  it("Hot + Estático: nenhum estático é hot → vazio", () => {
    expect(linhas({ midia: "estatico", publico: "hot" })).toEqual([]);
  });
});

describe("o fio — hook e as duas seções", () => {
  const fonte = (rel: string) =>
    readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf-8");

  it("o hook passa o filtro e o mapa de nomes, e os põe no memo", () => {
    // Mutação: cortar `midia: midiaFilter` no call site → o filtro não faz nada.
    const hook = fonte("lib/hooks/useLpPerformanceData.ts");
    const chamada = hook.slice(hook.indexOf("montarLinhasDeLpPorUrl({"), hook.indexOf("montarLinhasDeLpPorUrl({") + 400);
    expect(chamada).toMatch(/midia: midiaFilter/);
    expect(chamada).toMatch(/nomeDoAnuncio/);
    expect(hook).toMatch(/nomesPorAnuncio\(creatives\)/);
    const deps = hook.slice(hook.lastIndexOf("}, ["), hook.lastIndexOf("]);"));
    expect(deps).toMatch(/midiaFilter/);
    expect(deps).toMatch(/nomeDoAnuncio/);
  });

  it("as duas seções têm o grupo de botões e passam o filtro ao hook", () => {
    for (const rel of ["components/funnels/launch-dashboard.tsx", "components/funnels/meta-ads-teste-section.tsx"]) {
      const src = fonte(rel);
      expect(src).toMatch(/<FiltroDeMidiaBotoes valor=\{midiaFilter\} onChange=\{setMidiaFilter\} \/>/);
      expect(src).toMatch(/useLpPerformanceData\(\{[^}]*midiaFilter/);
    }
  });
});
