import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
    );
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): { encrypted: string; iv: string } {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  // Store as: encrypted + "." + authTag (both base64)
  const combined = encrypted + "." + authTag.toString("base64");

  return {
    encrypted: combined,
    iv: iv.toString("base64"),
  };
}

export function decrypt(encrypted: string, iv: string): string {
  const key = getKey();
  const ivBuffer = Buffer.from(iv, "base64");

  const parts = encrypted.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted data format");
  }

  const [ciphertext, authTagB64] = parts;
  const authTag = Buffer.from(authTagB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
