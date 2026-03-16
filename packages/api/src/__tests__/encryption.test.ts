import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encrypt, decrypt } from "../services/encryption";

// Set a valid test encryption key (32 bytes = 64 hex chars)
const TEST_KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";

describe("Encryption Service", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    if (originalKey) {
      process.env.ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  it("should round-trip encrypt and decrypt", () => {
    const plaintext = "EAABx1234567890_long_access_token_here";
    const { encrypted, iv } = encrypt(plaintext);
    const decrypted = decrypt(encrypted, iv);
    expect(decrypted).toBe(plaintext);
  });

  it("should generate unique IVs per encryption", () => {
    const plaintext = "same_text";
    const result1 = encrypt(plaintext);
    const result2 = encrypt(plaintext);
    expect(result1.iv).not.toBe(result2.iv);
    expect(result1.encrypted).not.toBe(result2.encrypted);
  });

  it("should fail decrypt with wrong IV", () => {
    const { encrypted } = encrypt("secret");
    const wrongIv = Buffer.from("0".repeat(32), "hex").toString("base64");
    expect(() => decrypt(encrypted, wrongIv)).toThrow();
  });

  it("should fail decrypt with tampered ciphertext", () => {
    const { encrypted, iv } = encrypt("secret");
    const tampered = "TAMPERED" + encrypted.slice(8);
    expect(() => decrypt(tampered, iv)).toThrow();
  });

  it("should handle empty string", () => {
    const { encrypted, iv } = encrypt("");
    const decrypted = decrypt(encrypted, iv);
    expect(decrypted).toBe("");
  });

  it("should handle unicode content", () => {
    const plaintext = "Token com acentuação: éàü 中文 🎉";
    const { encrypted, iv } = encrypt(plaintext);
    const decrypted = decrypt(encrypted, iv);
    expect(decrypted).toBe(plaintext);
  });

  it("should throw on invalid key length", () => {
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "tooshort";
    expect(() => encrypt("test")).toThrow("64-character hex string");
    process.env.ENCRYPTION_KEY = original;
  });

  it("should throw on missing key", () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("test")).toThrow("64-character hex string");
    process.env.ENCRYPTION_KEY = original;
  });

  it("should fail decrypt with invalid format (no auth tag separator)", () => {
    const { iv } = encrypt("test");
    expect(() => decrypt("invalidformat", iv)).toThrow("Invalid encrypted data format");
  });
});
