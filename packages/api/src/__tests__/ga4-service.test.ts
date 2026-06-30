import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  aggregateGa4StageReport,
  ymdDaysAgo,
  encryptGa4Secret,
  decryptGa4Secret,
  type Ga4RawRow,
} from "../services/ga4";

const TEST_KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";

function row(p: Partial<Ga4RawRow>): Ga4RawRow {
  return {
    channel: "Organic Search",
    sourceMedium: "google / organic",
    campaign: "(not set)",
    sessions: 0,
    users: 0,
    engagedSessions: 0,
    conversions: 0,
    pageViews: 0,
    revenue: 0,
    ...p,
  };
}

describe("GA4 cripto", () => {
  const original = process.env.ENCRYPTION_KEY;
  beforeAll(() => { process.env.ENCRYPTION_KEY = TEST_KEY; });
  afterAll(() => { if (original) process.env.ENCRYPTION_KEY = original; else delete process.env.ENCRYPTION_KEY; });

  it("round-trip do refresh_token via AES-256-GCM", () => {
    const { encrypted, iv } = encryptGa4Secret("1//refresh-token-secreto");
    expect(decryptGa4Secret(encrypted, iv)).toBe("1//refresh-token-secreto");
  });
});

describe("ymdDaysAgo", () => {
  it("formata YYYY-MM-DD em UTC", () => {
    const ref = new Date(Date.UTC(2026, 5, 16, 12, 0, 0));
    expect(ymdDaysAgo(0, ref)).toBe("2026-06-16");
    expect(ymdDaysAgo(30, ref)).toBe("2026-05-17");
  });
});

describe("aggregateGa4StageReport", () => {
  it("soma totais e calcula engagementRate", () => {
    const out = aggregateGa4StageReport([
      row({ channel: "Paid Search", sessions: 100, engagedSessions: 60, conversions: 5, pageViews: 250, users: 80, revenue: 1000 }),
      row({ channel: "Paid Search", sessions: 50, engagedSessions: 20, conversions: 2, pageViews: 120, users: 40, revenue: 500 }),
    ]);
    expect(out.totals.sessions).toBe(150);
    expect(out.totals.engagedSessions).toBe(80);
    expect(out.totals.conversions).toBe(7);
    expect(out.totals.revenue).toBe(1500);
    expect(out.totals.engagementRate).toBeCloseTo(80 / 150, 6);
  });

  it("engagementRate = 0 sem sessões (evita divisão por zero)", () => {
    expect(aggregateGa4StageReport([]).totals.engagementRate).toBe(0);
    expect(aggregateGa4StageReport([]).totals.sessions).toBe(0);
  });

  it("agrupa por canal, origem e campanha", () => {
    const out = aggregateGa4StageReport([
      row({ channel: "Paid Social", sourceMedium: "fb / cpc", campaign: "BF25", sessions: 30, conversions: 3, revenue: 300 }),
      row({ channel: "Paid Social", sourceMedium: "fb / cpc", campaign: "BF25", sessions: 20, conversions: 1, revenue: 200 }),
      row({ channel: "Organic Search", sourceMedium: "google / organic", campaign: "(not set)", sessions: 40, conversions: 2 }),
    ]);
    const social = out.byChannel.find((c) => c.channel === "Paid Social");
    expect(social?.sessions).toBe(50);
    expect(social?.conversions).toBe(4);
    const bf = out.topCampaigns.find((c) => c.campaign === "BF25");
    expect(bf?.sessions).toBe(50);
    expect(bf?.revenue).toBe(500);
    // ordenado por sessões desc — Organic (40) > ... topSources inclui ambos
    expect(out.topSources[0].sessions).toBeGreaterThanOrEqual(out.topSources[out.topSources.length - 1].sessions);
  });
});
