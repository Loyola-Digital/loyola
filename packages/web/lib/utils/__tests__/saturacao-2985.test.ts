import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { estadoDeSaturacao, linkCtr } from "../../../components/funnels/saturacao";
import type { CampaignDailyInsight } from "../../hooks/use-traffic-analytics";

// Story 29.85 — o selo de saturação lê o CTR do LINK, a mesma série do gráfico.

function dia(data: string, o: { imp: number; cliques: number; link: number; cpm: number }): CampaignDailyInsight {
  return {
    date_start: data,
    date_stop: data,
    impressions: String(o.imp),
    reach: String(o.imp),
    clicks: String(o.cliques),
    spend: String((o.imp / 1000) * o.cpm),
    ctr: String((o.cliques / o.imp) * 100),
    cpc: "0",
    cpm: String(o.cpm),
    actions: [{ action_type: "link_click", value: String(o.link) }],
  };
}

describe("Story 29.85 — selo de saturação pelo clique no link (AC3, AC5)", () => {
  it("CTR total cai >10%, CTR de link estável, CPM sobe >10%: NÃO é 'Saturando'", () => {
    // Cliques totais caem de 300 para 200 (CTR total −33%); link fica em 100.
    const dados = [
      dia("2026-10-01", { imp: 10000, cliques: 300, link: 100, cpm: 20 }),
      dia("2026-10-02", { imp: 10000, cliques: 300, link: 100, cpm: 20 }),
      dia("2026-10-03", { imp: 10000, cliques: 200, link: 100, cpm: 25 }),
      dia("2026-10-04", { imp: 10000, cliques: 200, link: 100, cpm: 25 }),
    ];
    expect(estadoDeSaturacao(dados)?.status).toBe("cpm-rise");
    // O tooltip mostra a variação do CTR de link (0%), não a do CTR total (−33%).
    expect(estadoDeSaturacao(dados)?.ctrChange).toBeCloseTo(0);
  });

  it("CTR de link cai >10% com CPM subindo: 'Saturando'", () => {
    const dados = [
      dia("2026-10-01", { imp: 10000, cliques: 300, link: 100, cpm: 20 }),
      dia("2026-10-02", { imp: 10000, cliques: 300, link: 100, cpm: 20 }),
      dia("2026-10-03", { imp: 10000, cliques: 300, link: 70, cpm: 25 }),
      dia("2026-10-04", { imp: 10000, cliques: 300, link: 70, cpm: 25 }),
    ];
    expect(estadoDeSaturacao(dados)?.status).toBe("saturating");
  });

  it("CTR de link cai, CPM estável: 'CTR em queda'; nada muda: 'Saudável'", () => {
    const cai = [
      dia("2026-10-01", { imp: 10000, cliques: 300, link: 100, cpm: 20 }),
      dia("2026-10-02", { imp: 10000, cliques: 300, link: 100, cpm: 20 }),
      dia("2026-10-03", { imp: 10000, cliques: 300, link: 80, cpm: 20 }),
      dia("2026-10-04", { imp: 10000, cliques: 300, link: 80, cpm: 20 }),
    ];
    expect(estadoDeSaturacao(cai)?.status).toBe("ctr-drop");
    const estavel = cai.map((d) => ({ ...d, actions: [{ action_type: "link_click", value: "100" }] }));
    expect(estadoDeSaturacao(estavel)?.status).toBe("healthy");
  });

  it("menos de 4 dias ou sem dados: sem selo (AC4)", () => {
    expect(estadoDeSaturacao(null)).toBeNull();
    expect(estadoDeSaturacao([dia("2026-10-01", { imp: 1, cliques: 0, link: 0, cpm: 1 })])).toBeNull();
  });

  it("a linha do gráfico e o selo usam a mesma função de CTR", () => {
    expect(linkCtr(dia("2026-10-01", { imp: 2000, cliques: 90, link: 30, cpm: 1 }))).toBeCloseTo(1.5);
    const lancamento = readFileSync(
      new URL("../../../components/funnels/launch-dashboard.tsx", import.meta.url),
      "utf8",
    );
    expect(lancamento).toContain("const leitura = estadoDeSaturacao(dailyData);");
    expect(lancamento).toContain("const ctr = linkCtr(d);");
  });
});

describe("Story 29.85 — gráfico no Perpétuo (AC1, AC2)", () => {
  const perpetuo = readFileSync(
    new URL("../../../components/funnels/perpetual-dashboard.tsx", import.meta.url),
    "utf8",
  );

  it("é o componente do lançamento, não uma cópia", () => {
    expect(perpetuo).toContain('import { SecaoDeSaturacao } from "./launch-dashboard";');
    expect(perpetuo).not.toMatch(/function SecaoDeSaturacao|function CtrCpmChart/);
  });

  it("fica logo depois da Tendência e antes dos três gráficos de 7 dias", () => {
    const tendencia = perpetuo.indexOf("{tendencia && <TendenciaBlock t={tendencia} />}");
    const secao = perpetuo.indexOf("<SecaoDeSaturacao ");
    const seteDias = perpetuo.indexOf("Story 29.32 — TRÊS GRÁFICOS DE LINHA×ÁREA");
    expect(tendencia).toBeGreaterThan(-1);
    expect(secao).toBeGreaterThan(tendencia);
    expect(seteDias).toBeGreaterThan(secao);
  });

  it("usa a mesma leitura diária da tela, com o erro dela (AC2, AC4)", () => {
    expect(perpetuo).toContain(
      "<SecaoDeSaturacao dailyData={dailyData} carregando={dailyLoading} falhou={dailyError} />",
    );
    expect(perpetuo).toContain("const { data: dailyData, isLoading: dailyLoading, isError: dailyError } =");
  });
});
