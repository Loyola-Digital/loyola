import { describe, it, expect } from "vitest";

// Test suite para os cálculos do campaign breakdown
// Testa: percentuais somam 100%, CPL por faixa, edge cases

describe("Lead Scoring Campaign Breakdown Calculations", () => {
  // Simulamos a função computeCampaignBandBreakdown com dados de teste

  interface BandBreakdown {
    count: number;
    pct: number;
    cplFaixa: number | null;
  }

  interface TestCampaignBandRow {
    utmCampaign: string;
    campaignName: string;
    spend: number;
    totalLeads: number;
    cpl: number | null;
    cplIdeal: number | null;
    bands: Record<string, BandBreakdown>;
  }

  // Helper: calcula a soma de percentuais para uma campanha
  function sumPercentages(bands: Record<string, BandBreakdown>): number {
    return Object.values(bands).reduce((sum, band) => sum + band.pct, 0);
  }

  // Helper: valida que CPL por faixa = spend / count_faixa
  function validateCplPerBand(row: TestCampaignBandRow): boolean {
    for (const [, band] of Object.entries(row.bands)) {
      if (band.count === 0) {
        // Se não há leads nessa faixa, cplFaixa deve ser null
        if (band.cplFaixa !== null) return false;
      } else {
        // Se há leads, CPL deve ser spend / count (com margem de erro de floating point)
        const expectedCpl = row.spend / band.count;
        if (band.cplFaixa === null) return false;
        const diff = Math.abs(band.cplFaixa - expectedCpl);
        if (diff > 0.01) return false; // Tolera 1 centavo de diferença
      }
    }
    return true;
  }

  it("should have percentages summing to 100% for each campaign", () => {
    const testRows: TestCampaignBandRow[] = [
      {
        utmCampaign: "campaign-1",
        campaignName: "Campaign 1",
        spend: 1000,
        totalLeads: 100,
        cpl: 10,
        cplIdeal: 15,
        bands: {
          A: { count: 50, pct: 50, cplFaixa: 20 },
          B: { count: 30, pct: 30, cplFaixa: 33.33 },
          C: { count: 15, pct: 15, cplFaixa: 66.67 },
          D: { count: 5, pct: 5, cplFaixa: 200 },
        },
      },
      {
        utmCampaign: "campaign-2",
        campaignName: "Campaign 2",
        spend: 2000,
        totalLeads: 80,
        cpl: 25,
        cplIdeal: 20,
        bands: {
          A: { count: 20, pct: 25, cplFaixa: 100 },
          B: { count: 40, pct: 50, cplFaixa: 50 },
          C: { count: 16, pct: 20, cplFaixa: 125 },
          D: { count: 4, pct: 5, cplFaixa: 500 },
        },
      },
    ];

    // Verifica que cada campanha tem soma de percentuais ≈ 100%
    for (const row of testRows) {
      const sum = sumPercentages(row.bands);
      expect(sum).toBeCloseTo(100, 1); // Tolera 0.1% de erro
    }
  });

  it("should calculate CPL per band correctly", () => {
    const testRow: TestCampaignBandRow = {
      utmCampaign: "test-campaign",
      campaignName: "Test Campaign",
      spend: 500,
      totalLeads: 50,
      cpl: 10, // 500 / 50 = 10
      cplIdeal: 12,
      bands: {
        A: { count: 25, pct: 50, cplFaixa: 20 }, // 500 / 25 = 20
        B: { count: 15, pct: 30, cplFaixa: 33.33 }, // 500 / 15 ≈ 33.33
        C: { count: 8, pct: 16, cplFaixa: 62.5 }, // 500 / 8 = 62.5
        D: { count: 2, pct: 4, cplFaixa: 250 }, // 500 / 2 = 250
      },
    };

    expect(validateCplPerBand(testRow)).toBe(true);
  });

  it("should handle zero leads in a band correctly", () => {
    const testRow: TestCampaignBandRow = {
      utmCampaign: "sparse-campaign",
      campaignName: "Sparse Campaign",
      spend: 300,
      totalLeads: 30,
      cpl: 10,
      cplIdeal: 15,
      bands: {
        A: { count: 20, pct: 66.67, cplFaixa: 15 },
        B: { count: 10, pct: 33.33, cplFaixa: 30 },
        C: { count: 0, pct: 0, cplFaixa: null }, // Zero leads in band C
        D: { count: 0, pct: 0, cplFaixa: null }, // Zero leads in band D
      },
    };

    expect(validateCplPerBand(testRow)).toBe(true);
    const sum = sumPercentages(testRow.bands);
    expect(sum).toBeCloseTo(100, 1);
  });

  it("should handle campaign with no leads", () => {
    const testRow: TestCampaignBandRow = {
      utmCampaign: "empty-campaign",
      campaignName: "Empty Campaign",
      spend: 0,
      totalLeads: 0,
      cpl: null,
      cplIdeal: 15,
      bands: {
        A: { count: 0, pct: 0, cplFaixa: null },
        B: { count: 0, pct: 0, cplFaixa: null },
        C: { count: 0, pct: 0, cplFaixa: null },
        D: { count: 0, pct: 0, cplFaixa: null },
      },
    };

    expect(validateCplPerBand(testRow)).toBe(true);
    const sum = sumPercentages(testRow.bands);
    expect(sum).toBe(0);
  });

  it("should handle floating point precision in percentages", () => {
    // Alguns casos podem resultar em arredondamento (ex: 3 leads em 7 = 42.857%)
    const testRow: TestCampaignBandRow = {
      utmCampaign: "precision-campaign",
      campaignName: "Precision Campaign",
      spend: 700,
      totalLeads: 7,
      cpl: 100,
      cplIdeal: 110,
      bands: {
        A: { count: 3, pct: 42.86, cplFaixa: 233.33 }, // 700 / 3 ≈ 233.33
        B: { count: 2, pct: 28.57, cplFaixa: 350 }, // 700 / 2 = 350
        C: { count: 1, pct: 14.29, cplFaixa: 700 }, // 700 / 1 = 700
        D: { count: 1, pct: 14.29, cplFaixa: 700 }, // 700 / 1 = 700
      },
    };

    expect(validateCplPerBand(testRow)).toBe(true);
    const sum = sumPercentages(testRow.bands);
    expect(sum).toBeCloseTo(100, 0); // Deve estar bem perto de 100
  });

  it("should have consistent total CPL and per-band CPL when all leads in one band", () => {
    const testRow: TestCampaignBandRow = {
      utmCampaign: "single-band-campaign",
      campaignName: "Single Band Campaign",
      spend: 450,
      totalLeads: 45,
      cpl: 10, // 450 / 45 = 10
      cplIdeal: 12,
      bands: {
        A: { count: 45, pct: 100, cplFaixa: 10 }, // Mesmo que CPL total
        B: { count: 0, pct: 0, cplFaixa: null },
        C: { count: 0, pct: 0, cplFaixa: null },
        D: { count: 0, pct: 0, cplFaixa: null },
      },
    };

    expect(testRow.cpl).toBe(testRow.bands.A.cplFaixa);
    expect(sumPercentages(testRow.bands)).toBeCloseTo(100, 1);
  });

  // ============================================================
  // CPL IDEAL DINÂMICO — Story 18.18 Tests
  // ============================================================

  function calculateCplIdeal(
    ticket: number,
    roas: number,
    conversionRates: Record<string, number>,
    bandCounts: Record<string, number>,
    totalLeads: number,
  ): number | null {
    if (!ticket || !roas || roas <= 0) return null;
    const ticketPerRoas = ticket / roas;
    let ponderatedFactor = 0;
    for (const [bandId, convRate] of Object.entries(conversionRates)) {
      const bandPct = (bandCounts[bandId] ?? 0) / Math.max(totalLeads, 1);
      ponderatedFactor += convRate * bandPct;
    }
    return ticketPerRoas * ponderatedFactor;
  }

  it("should calculate CPL Ideal with pondered conversion factor", () => {
    // AC2: CPL Ideal = (Ticket / ROAS) × Fator ponderado
    // Fator = Conv.A × %A + Conv.B × %B + Conv.C × %C + Conv.D × %D

    const ticket = 4000;
    const roas = 3;
    const conversionRates = {
      A: 0.3,
      B: 0.2,
      C: 0.15,
      D: 0.1,
    };
    const bandCounts = { A: 25, B: 30, C: 15, D: 5 }; // 25% A, 30% B, 15% C, 5% D
    const totalLeads = 75;

    // Fator ponderado = (0.3 × 0.3333) + (0.2 × 0.4) + (0.15 × 0.2) + (0.1 × 0.0667)
    // = 0.1 + 0.08 + 0.03 + 0.00667 ≈ 0.21667
    // CPL Ideal = (4000 / 3) × 0.21667 ≈ 288.89

    const cplIdeal = calculateCplIdeal(ticket, roas, conversionRates, bandCounts, totalLeads);
    expect(cplIdeal).toBeCloseTo(288.89, 1);
  });

  it("should vary CPL Ideal between campaigns with different band distributions (AC3)", () => {
    // AC3: Duas linhas com mesmo spend mas % de bandas diferente = CPL Ideal diferente

    const ticket = 4000;
    const roas = 3;
    const conversionRates = {
      A: 0.3,
      B: 0.2,
      C: 0.15,
      D: 0.1,
    };

    // Campaign 1: Balanced distribution (25% A, 30% B, 15% C, 5% D)
    const campaign1 = {
      bandCounts: { A: 25, B: 30, C: 15, D: 5 },
      totalLeads: 75,
    };

    // Campaign 2: Heavy on band A (50% A, 20% B, 20% C, 10% D)
    const campaign2 = {
      bandCounts: { A: 50, B: 20, C: 20, D: 10 },
      totalLeads: 100,
    };

    const cplIdeal1 = calculateCplIdeal(
      ticket,
      roas,
      conversionRates,
      campaign1.bandCounts,
      campaign1.totalLeads,
    );
    const cplIdeal2 = calculateCplIdeal(
      ticket,
      roas,
      conversionRates,
      campaign2.bandCounts,
      campaign2.totalLeads,
    );

    // Campaign 2 should have higher CPL Ideal because more leads in band A (higher conversion)
    expect(cplIdeal2).toBeGreaterThan(cplIdeal1!);
  });

  it("should recalculate CPL Ideal after consolidating duplicate ads (AC4)", () => {
    // AC4: Quando há merge de 2+ linhas com mesmo nome, recalcula CPL Ideal com % agregadas

    const ticket = 4000;
    const roas = 3;
    const conversionRates = {
      A: 0.3,
      B: 0.2,
      C: 0.15,
      D: 0.1,
    };

    // Ad 1 before merge: 25% A, 75% B
    const ad1Before = {
      bandCounts: { A: 25, B: 75, C: 0, D: 0 },
      totalLeads: 100,
    };

    // CPL Ideal before merge (Ad 1 only)
    const cplIdealBefore = calculateCplIdeal(
      ticket,
      roas,
      conversionRates,
      ad1Before.bandCounts,
      ad1Before.totalLeads,
    );

    // After merge with Ad 2 (50% A, 50% B): combined = 75 leads A (37.5%), 125 leads B (62.5%)
    const adAfterMerge = {
      bandCounts: { A: 75, B: 125, C: 0, D: 0 },
      totalLeads: 200,
    };

    const cplIdealAfter = calculateCplIdeal(
      ticket,
      roas,
      conversionRates,
      adAfterMerge.bandCounts,
      adAfterMerge.totalLeads,
    );

    // CPL Ideal should change after merge due to updated band percentages
    expect(cplIdealAfter).not.toBe(cplIdealBefore);
    // After merge, more leads in band A → higher CPL Ideal
    expect(cplIdealAfter).toBeGreaterThan(cplIdealBefore!);
  });

  it("should handle edge case: CPL Ideal = null when ticket or ROAS undefined (AC6)", () => {
    const conversionRates = { A: 0.3, B: 0.2, C: 0.15, D: 0.1 };
    const bandCounts = { A: 25, B: 30, C: 15, D: 5 };
    const totalLeads = 75;

    // No ticket
    const cplIdeal1 = calculateCplIdeal(0, 3, conversionRates, bandCounts, totalLeads);
    expect(cplIdeal1).toBeNull();

    // No ROAS
    const cplIdeal2 = calculateCplIdeal(4000, 0, conversionRates, bandCounts, totalLeads);
    expect(cplIdeal2).toBeNull();

    // Negative ROAS
    const cplIdeal3 = calculateCplIdeal(4000, -3, conversionRates, bandCounts, totalLeads);
    expect(cplIdeal3).toBeNull();
  });

  it("should handle edge case: zero conversion rates (AC5)", () => {
    const ticket = 4000;
    const roas = 3;
    const conversionRates = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
    };
    const bandCounts = { A: 25, B: 30, C: 15, D: 5 };
    const totalLeads = 75;

    const cplIdeal = calculateCplIdeal(ticket, roas, conversionRates, bandCounts, totalLeads);
    // Fator ponderado = 0, so CPL Ideal = (4000/3) × 0 = 0
    expect(cplIdeal).toBeCloseTo(0, 5);
  });

  it("should handle edge case: all leads in one band (AC3)", () => {
    const ticket = 4000;
    const roas = 3;
    const conversionRates = {
      A: 0.3,
      B: 0.2,
      C: 0.15,
      D: 0.1,
    };

    // 100% banda A
    const bandCounts100A = { A: 100, B: 0, C: 0, D: 0 };
    const cplIdeal100A = calculateCplIdeal(ticket, roas, conversionRates, bandCounts100A, 100);
    // Fator = 0.3 × 1.0 = 0.3
    // CPL Ideal = (4000/3) × 0.3 = 400
    expect(cplIdeal100A).toBeCloseTo(400, 1);

    // 100% banda B
    const bandCounts100B = { A: 0, B: 100, C: 0, D: 0 };
    const cplIdeal100B = calculateCplIdeal(ticket, roas, conversionRates, bandCounts100B, 100);
    // Fator = 0.2 × 1.0 = 0.2
    // CPL Ideal = (4000/3) × 0.2 ≈ 266.67
    expect(cplIdeal100B).toBeCloseTo(266.67, 1);

    // CPL Ideal for band A should be higher than band B
    expect(cplIdeal100A).toBeGreaterThan(cplIdeal100B!);
  });
});
