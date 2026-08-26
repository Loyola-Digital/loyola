import { describe, it, expect } from "vitest";
import { aggregateCreativesByName } from "@/lib/utils/top-creatives";
import type { TopPerformerAd } from "@/lib/hooks/use-traffic-analytics";

/** Meta de cor do Hook — a mesma da coluna do Detalhamento e da Captação. */
const META_HOOK_VERDE = 25;

/**
 * Story 29.65 (AC2) — o hook do grupo vem dos SOMATÓRIOS, não do líder.
 *
 * O defeito que estes testes prendem: `aggregateCreativesByName` soma
 * `impressions` de todos os anúncios do grupo, mas copiava `videoMetrics` do
 * anúncio de maior investimento. Derivar a taxa daí divide numerador de 1 por
 * denominador de N.
 *
 * Medido ao vivo no BBE (2026-08-26, 30 dias, o caminho que a tela usa):
 *
 * | criativo             | ads | correto | pelo líder | erro |
 * |----------------------|-----|---------|------------|------|
 * | ADS 5 V3 REEDITADO   |  4  | 25,59%  |   7,75%    | −70% |
 * | ADS 3 V4             |  8  | 21,96%  |   8,24%    | −62% |
 * | ADS 5 V1 REEDITADO   |  4  | 25,47%  |  11,55%    | −55% |
 *
 * 96,8% dos grupos do BBE têm mais de um anúncio — o caso comum, não a borda.
 *
 * ⚠️ Grupo de UM anúncio não distingue as duas implementações e por isso não
 * serve de cobertura. Todo caso diferencial aqui tem 2+ anúncios de tamanhos
 * diferentes, e o valor somado diverge do valor do líder.
 */

function ad(over: Partial<TopPerformerAd> & { campaignName: string }): TopPerformerAd {
  return {
    campaignId: over.campaignId ?? `ad_${Math.abs(hash(over.campaignName + (over.spend ?? 0)))}`,
    campaignName: over.campaignName,
    spend: over.spend ?? 0,
    impressions: over.impressions ?? 0,
    clicks: over.clicks ?? 0,
    reach: 0,
    frequency: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    leads: null,
    cpl: null,
    linkClicks: null,
    landingPageViews: null,
    connectRate: null,
    qualifiedLeads: null,
    cplQualified: null,
    qualificationRate: null,
    sales: null,
    revenue: null,
    costPerSale: null,
    roas: null,
    conversionRate: null,
    adsetName: "conjunto",
    parentCampaignName: "campanha",
    creative: null,
    videoMetrics: over.videoMetrics ?? null,
  } as TopPerformerAd;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

const vm = (views3s: number) => ({ p25: 0, p50: 0, p75: 0, p100: 0, thruplay: 0, views3s });

describe("aggregateCreativesByName — hookRate (Story 29.65)", () => {
  it("soma views3s e impressões do grupo, e o resultado DIVERGE do líder", () => {
    // Reproduz a forma do `ADS 5 V3 REEDITADO`: um anúncio grande com gancho
    // fraco e três pequenos com gancho forte.
    const grupo = [
      ad({ campaignName: "ADS 5 V3", spend: 1000, impressions: 100_000, videoMetrics: vm(7_750) }),
      ad({ campaignName: "ADS 5 V3", spend: 100, impressions: 10_000, videoMetrics: vm(6_000) }),
      ad({ campaignName: "ADS 5 V3", spend: 90, impressions: 10_000, videoMetrics: vm(6_000) }),
      ad({ campaignName: "ADS 5 V3", spend: 80, impressions: 10_000, videoMetrics: vm(6_000) }),
    ];
    const [g] = aggregateCreativesByName(grupo);

    // Σ views3s = 25.750 ; Σ impressões (com vídeo) = 130.000 → 19,81%
    expect(g.views3s).toBe(25_750);
    expect(g.hookRate).toBeCloseTo(19.807, 2);

    // O DIFERENCIAL: pelo líder daria 7.750 ÷ 130.000 = 5,96%.
    // Se a implementação voltar a `leader.videoMetrics`, isto falha.
    const peloLider = (7_750 / 130_000) * 100;
    expect(g.hookRate).not.toBeCloseTo(peloLider, 2);
    expect(g.hookRate!).toBeGreaterThan(peloLider * 3);
  });

  it("um grupo com hook acima da meta NÃO pode aparecer abaixo dela", () => {
    // O caso real do `ADS 5 V1 REEDITADO` — o criativo que o gestor usou de
    // exemplo. Real 25,47% (bate a meta de 25%), pelo líder 11,55%.
    // Fixture calibrada para reproduzir os dois números medidos:
    //   Σ views3s = 11.550 + 6.960 + 6.960 = 25.470 ; Σ impressões = 100.000
    //   → somado 25,47% (bate a meta) · pelo líder 11.550/100.000 = 11,55%
    const grupo = [
      ad({ campaignName: "ADS 5 V1", spend: 900, impressions: 60_000, videoMetrics: vm(11_550) }),
      ad({ campaignName: "ADS 5 V1", spend: 200, impressions: 20_000, videoMetrics: vm(6_960) }),
      ad({ campaignName: "ADS 5 V1", spend: 150, impressions: 20_000, videoMetrics: vm(6_960) }),
    ];
    const [g] = aggregateCreativesByName(grupo);
    expect(g.hookRate).toBeCloseTo(25.47, 2);
    expect(g.hookRate!).toBeGreaterThanOrEqual(META_HOOK_VERDE);
    // Pelo líder: 11.550 ÷ 100.000 = 11,55% — abaixo da meta. O mesmo criativo,
    // com a implementação antiga, apareceria entre os piores ganchos do funil.
    expect((11_550 / 100_000) * 100).toBeLessThan(META_HOOK_VERDE);
  });

  it("nenhum anúncio com views3s ⇒ hookRate null, NUNCA zero", () => {
    // Ausência não é zero. Num filtro chamado "Melhores Hooks", tratar o
    // ausente como 0 acusa de gancho ruim um criativo sobre o qual não se sabe.
    // Medido ao vivo: 25% dos grupos no BBE, 50% no DG & CPDF.
    const grupo = [
      ad({ campaignName: "Estático", spend: 500, impressions: 50_000 }),
      ad({ campaignName: "Estático", spend: 300, impressions: 30_000 }),
    ];
    const [g] = aggregateCreativesByName(grupo);
    expect(g.hookRate).toBeNull();
    expect(g.hookRate).not.toBe(0);
    expect(g.views3s).toBeNull();
  });

  it("anúncio sem a métrica não infla o denominador do grupo", () => {
    // Se as impressões de quem não tem `views3s` entrassem no denominador, o
    // gancho sairia diluído — o erro estrutural que a 43.8 documentou.
    const grupo = [
      ad({ campaignName: "Misto", spend: 500, impressions: 10_000, videoMetrics: vm(3_000) }),
      ad({ campaignName: "Misto", spend: 400, impressions: 90_000 }), // sem métrica
    ];
    const [g] = aggregateCreativesByName(grupo);
    // 3.000 ÷ 10.000 = 30% (só o que tem vídeo), não 3.000 ÷ 100.000 = 3%.
    expect(g.hookRate).toBeCloseTo(30, 5);
    expect(g.hookRate).not.toBeCloseTo(3, 1);
    // E `impressions` do grupo segue sendo a soma de TODOS — o AC6 exige que
    // as outras métricas não mudem.
    expect(g.impressions).toBe(100_000);
  });

  it("marca amostraBaixa abaixo do piso e não marca acima", () => {
    const poucas = aggregateCreativesByName([
      ad({ campaignName: "Novo", spend: 10, impressions: 200, videoMetrics: vm(3) }),
    ]);
    expect(poucas[0].amostraBaixa).toBe(true);
    // 3 reproduções em 200 impressões dá 1,5% — mas com 3 reproduções o número
    // não significa nada, e por isso o piso existe antes da taxa.
    expect(poucas[0].hookRate).toBeCloseTo(1.5, 5);

    const muitas = aggregateCreativesByName([
      ad({ campaignName: "Rodado", spend: 900, impressions: 40_000, videoMetrics: vm(9_000) }),
    ]);
    expect(muitas[0].amostraBaixa).toBe(false);
  });

  it("AC6: as demais métricas do grupo não mudam", () => {
    const grupo = [
      ad({ campaignName: "X", spend: 600, impressions: 60_000, clicks: 600, videoMetrics: vm(9_000) }),
      ad({ campaignName: "X", spend: 400, impressions: 40_000, clicks: 200 }),
    ];
    const [g] = aggregateCreativesByName(grupo);
    expect(g.spend).toBe(1_000);
    expect(g.impressions).toBe(100_000);
    expect(g.clicks).toBe(800);
    // CTR segue derivado dos somatórios totais: 800 ÷ 100.000 = 0,8%
    expect(g.ctr).toBeCloseTo(0.8, 5);
  });
});
