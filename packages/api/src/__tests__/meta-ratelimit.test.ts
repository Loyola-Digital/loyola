import { describe, it, expect } from "vitest";
import { isMetaRateLimited, parseMetaUsageCooldownMs } from "../services/meta-ads.js";

describe("isMetaRateLimited", () => {
  it("treats HTTP 429 as rate limited regardless of code", () => {
    expect(isMetaRateLimited(429, undefined)).toBe(true);
  });

  it("treats Meta throttle codes as rate limited", () => {
    for (const code of [4, 17, 32, 613, 80000, 80004]) {
      expect(isMetaRateLimited(400, code)).toBe(true);
    }
  });

  it("does not flag ordinary errors", () => {
    expect(isMetaRateLimited(400, 100)).toBe(false); // 100 = invalid param
    expect(isMetaRateLimited(500, undefined)).toBe(false);
  });
});

describe("parseMetaUsageCooldownMs", () => {
  it("returns 0 when there are no usage headers", () => {
    expect(parseMetaUsageCooldownMs(new Headers())).toBe(0);
  });

  it("respects estimated_time_to_regain_access (minutes -> ms)", () => {
    const h = new Headers({
      "x-business-use-case-usage": JSON.stringify({
        "123": [{ call_count: 10, total_time: 10, estimated_time_to_regain_access: 5 }],
      }),
    });
    expect(parseMetaUsageCooldownMs(h)).toBe(5 * 60_000);
  });

  it("backs off 60s when any usage metric is >= 90%", () => {
    const h = new Headers({
      "x-app-usage": JSON.stringify({ call_count: 95, total_cputime: 10, total_time: 20 }),
    });
    expect(parseMetaUsageCooldownMs(h)).toBe(60_000);
  });

  it("ignores malformed headers (best-effort)", () => {
    const h = new Headers({ "x-app-usage": "not-json" });
    expect(parseMetaUsageCooldownMs(h)).toBe(0);
  });

  it("stays at 0 when usage is comfortably below the threshold", () => {
    const h = new Headers({
      "x-app-usage": JSON.stringify({ call_count: 10, total_cputime: 5, total_time: 8 }),
    });
    expect(parseMetaUsageCooldownMs(h)).toBe(0);
  });
});
