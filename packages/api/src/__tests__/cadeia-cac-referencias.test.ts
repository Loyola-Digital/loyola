import { describe, it, expect } from "vitest";
import { referenciasDoGrupo, type DiaBruto, type SerieDeCampanha } from "@loyola-x/shared";

/**
 * Story 44.8 AC11 — `referenciasDoGrupo`: a mediana das campanhas ELEGÍVEIS do
 * grupo (spec §5), que é o benchmark de CPM/CPC quando não existe alvo de
 * mercado.
 *
 * O que estes testes travam é a régua: quem entra na mediana. Se ela admitisse
 * campanha que o teto rejeita, a coluna "alvo" trocaria de população conforme
 * houvesse teto ou não — e a comparação entre etapas deixaria de significar a
 * mesma coisa.
 *
 * ⚠️ Cada asserção foi verificada por REVERSÃO: quebrada de propósito para
 * confirmar que o teste falha. Teste que não falha com o defeito de volta não
 * protege nada (o teste decorativo da 44.2, o lead-vira-zero da 44.6).
 */

/** Um dia com volume parametrizável — os pisos contam base, não dias. */
function dia(date: string, over: Partial<DiaBruto> = {}): DiaBruto {
  return {
    date,
    spend: 100,
    impressions: 10_000,
    linkClicks: 200,
    landingPageViews: 160,
    checkouts: 20,
    ...over,
  };
}

function serie(campaignId: string, dias: DiaBruto[]): SerieDeCampanha {
  return { campaignId, fonte: "ad-level", dias };
}

/** N dias a partir de 2026-08-01, com o mesmo perfil. */
function dias(n: number, over: Partial<DiaBruto> = {}): DiaBruto[] {
  return Array.from({ length: n }, (_, i) =>
    dia(`2026-08-${String(i + 1).padStart(2, "0")}`, over),
  );
}

describe("referenciasDoGrupo — a mediana e quem entra nela", () => {
  it("mediana de CPC sobre as campanhas elegíveis, não média", () => {
    // CPC = spend ÷ linkClicks, agregado do período de cada campanha.
    // c1: 1000 ÷ 2000 = 0,50 · c2: 2000 ÷ 2000 = 1,00 · c3: 30000 ÷ 2000 = 15,00
    //
    // Mediana = 1,00. Média seria 5,50 — a campanha de teste com CPC absurdo
    // move a média e não move a mediana. É por isso que a spec pede mediana.
    const r = referenciasDoGrupo(
      [
        serie("c1", dias(10, { spend: 100, linkClicks: 200 })),
        serie("c2", dias(10, { spend: 200, linkClicks: 200 })),
        serie("c3", dias(10, { spend: 3000, linkClicks: 200 })),
      ],
      "paga",
    );
    expect(r.medianas.cpc).toBeCloseTo(1.0, 10);
    expect(r.campanhasElegiveis.cpc).toBe(3);
    expect(r.campanhasComSerie).toBe(3);
  });

  it("número PAR de campanhas devolve a média dos dois centrais", () => {
    const r = referenciasDoGrupo(
      [
        serie("c1", dias(10, { spend: 100, linkClicks: 200 })), // 0,50
        serie("c2", dias(10, { spend: 200, linkClicks: 200 })), // 1,00
        serie("c3", dias(10, { spend: 400, linkClicks: 200 })), // 2,00
        serie("c4", dias(10, { spend: 800, linkClicks: 200 })), // 4,00
      ],
      "paga",
    );
    expect(r.medianas.cpc).toBeCloseTo(1.5, 10);
  });

  it("campanha ABAIXO do piso baixo NÃO entra na mediana", () => {
    // Piso baixo de cpm/cpc/ctr = 10.000 impressões no agregado.
    // A frágil tem 5.000 e um CPC de 10,00 que distorceria a mediana.
    const r = referenciasDoGrupo(
      [
        serie("forte1", dias(10, { spend: 100, linkClicks: 200, impressions: 10_000 })), // 0,50
        serie("forte2", dias(10, { spend: 200, linkClicks: 200, impressions: 10_000 })), // 1,00
        serie("fragil", [dia("2026-08-01", { spend: 2000, linkClicks: 200, impressions: 5_000 })]), // 10,00
      ],
      "paga",
    );
    expect(r.campanhasElegiveis.cpc).toBe(2);
    expect(r.medianas.cpc).toBeCloseTo(0.75, 10); // média dos dois centrais: (0,50+1,00)/2
    // A frágil conta como campanha COM série — o denominador é honesto.
    expect(r.campanhasComSerie).toBe(3);
  });

  it("nenhuma campanha elegível devolve null, nunca 0", () => {
    const r = referenciasDoGrupo([serie("c1", [dia("2026-08-01", { impressions: 100 })])], "paga");
    expect(r.medianas.cpm).toBeNull();
    expect(r.medianas.cpc).toBeNull();
    expect(r.campanhasElegiveis.cpc).toBe(0);
  });

  it("grupo vazio devolve tudo null e zero campanhas", () => {
    const r = referenciasDoGrupo([], "paga");
    expect(r.medianas.cpc).toBeNull();
    expect(r.medianaCustoDaCadeia).toBeNull();
    expect(r.campanhasComSerie).toBe(0);
  });

  it("campanha sem NENHUM dia não conta como campanha com série", () => {
    const r = referenciasDoGrupo([serie("vazia", []), serie("c1", dias(10))], "paga");
    expect(r.campanhasComSerie).toBe(1);
  });

  it("as taxas saem em DECIMAL, não em pontos percentuais", () => {
    // ctr = linkClicks ÷ impressions = 200 ÷ 10.000 = 0,02 (nunca 2)
    // connectRate = lpViews ÷ linkClicks = 160 ÷ 200 = 0,80 (nunca 80)
    const r = referenciasDoGrupo([serie("c1", dias(10)), serie("c2", dias(10))], "paga");
    expect(r.medianas.ctr).toBeCloseTo(0.02, 10);
    expect(r.medianas.connectRate).toBeCloseTo(0.8, 10);
    expect(r.medianas.convLP).toBeCloseTo(0.125, 10); // 20 ÷ 160
  });

  it("custo da cadeia só admite campanha elegível nos TRÊS elos", () => {
    // A segunda campanha passa em cpc (impressões de sobra) mas não em convLP:
    // piso baixo de convLP = 150 LP views, e ela tem 100.
    const r = referenciasDoGrupo(
      [
        serie("completa", dias(10)),
        serie("elo-fraco", [
          dia("2026-08-01", { landingPageViews: 100, linkClicks: 200, impressions: 10_000 }),
        ]),
      ],
      "paga",
    );
    expect(r.campanhasElegiveisCustoDaCadeia).toBe(1);
    // custoDaCadeia = cpc ÷ (connect × convLP) = 0,50 ÷ (0,80 × 0,125) = 5,00
    // e telescopa para spend ÷ checkouts = 1000 ÷ 200 = 5,00.
    expect(r.medianaCustoDaCadeia).toBeCloseTo(5.0, 10);
  });

  it("família GRATUITA sem leadsAtribuidos deixa convLP fora da mediana, sem virar zero", () => {
    // QA-446-01: numerador AUSENTE é `null`, não `0`. Se virasse zero, a
    // mediana de convLP sairia 0 e a etapa sem planilha de leads pareceria a
    // pior do grupo em vez de "não medida".
    const r = referenciasDoGrupo([serie("c1", dias(10)), serie("c2", dias(10))], "gratuita");
    expect(r.medianas.convLP).toBeNull();
    expect(r.campanhasElegiveis.convLP).toBe(0);
    // As métricas de mídia seguem medíveis — só o elo de lead falta.
    expect(r.medianas.cpc).toBeCloseTo(0.5, 10);
    expect(r.medianaCustoDaCadeia).toBeNull();
  });

  it("família GRATUITA com leadsAtribuidos usa o lead como numerador do convLP", () => {
    const comLead = dias(10).map((d) => ({ ...d, leadsAtribuidos: 32 }));
    const r = referenciasDoGrupo([serie("c1", comLead), serie("c2", comLead)], "gratuita");
    expect(r.medianas.convLP).toBeCloseTo(0.2, 10); // 320 ÷ 1600
  });
});
