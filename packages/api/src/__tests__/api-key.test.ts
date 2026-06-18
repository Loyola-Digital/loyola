import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, safeCompareHash } from "../services/api-key";

describe("API Key Service", () => {
  it("should generate a key with the lyx_live_ prefix", () => {
    const { raw, keyPrefix } = generateApiKey();
    expect(raw.startsWith("lyx_live_")).toBe(true);
    expect(keyPrefix.startsWith("lyx_live_")).toBe(true);
  });

  it("should expose only a short prefix (not the full key)", () => {
    const { raw, keyPrefix } = generateApiKey();
    // prefixo = "lyx_live_" + 8 chars do segmento aleatório
    expect(keyPrefix.length).toBe("lyx_live_".length + 8);
    expect(raw.length).toBeGreaterThan(keyPrefix.length);
    expect(raw.startsWith(keyPrefix)).toBe(true);
  });

  it("should produce a 64-char hex SHA-256 hash", () => {
    const { keyHash } = generateApiKey();
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should generate unique keys each call", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.keyHash).not.toBe(b.keyHash);
  });

  it("hashApiKey should be deterministic and match generation", () => {
    const { raw, keyHash } = generateApiKey();
    expect(hashApiKey(raw)).toBe(keyHash);
    expect(hashApiKey(raw)).toBe(hashApiKey(raw));
  });

  it("safeCompareHash should return true for equal hashes", () => {
    const { raw, keyHash } = generateApiKey();
    expect(safeCompareHash(hashApiKey(raw), keyHash)).toBe(true);
  });

  it("safeCompareHash should return false for different hashes", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(safeCompareHash(a.keyHash, b.keyHash)).toBe(false);
  });

  it("safeCompareHash should return false for malformed/empty input", () => {
    const { keyHash } = generateApiKey();
    expect(safeCompareHash(keyHash, "")).toBe(false);
    expect(safeCompareHash("", keyHash)).toBe(false);
  });
});
