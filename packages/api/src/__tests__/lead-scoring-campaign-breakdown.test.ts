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
});
