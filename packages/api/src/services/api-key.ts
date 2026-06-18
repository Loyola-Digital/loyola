import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * API Key helper (Story 36.1).
 *
 * Ao contrário das integrações que guardam tokens criptografados (AES, reversível)
 * porque precisam *recuperar* o token para chamar a API externa, uma API Key só
 * precisa ser *validada*. Por isso guardamos apenas o hash SHA-256 (irreversível):
 * o texto puro é mostrado uma única vez na criação e nunca persiste.
 *
 * Reutilizado pela Story 36.2 (middleware de auth) via {@link hashApiKey} +
 * {@link safeCompareHash} (comparação constant-time).
 */

const KEY_PREFIX = "lyx_live_";
const RANDOM_BYTES = 32;
// Quantidade de chars do segmento aleatório expostos no prefixo legível.
const PREFIX_VISIBLE_CHARS = 8;

export interface GeneratedApiKey {
  /** Chave completa em texto puro — exibir UMA vez, nunca persistir. */
  raw: string;
  /** Trecho legível para exibição na listagem (ex.: `lyx_live_a1b2c3d4`). */
  keyPrefix: string;
  /** SHA-256 hex da chave completa — é isto que vai para o banco. */
  keyHash: string;
}

/** Calcula o SHA-256 (hex) de uma chave. Determinístico. */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Gera uma nova API Key segura com prefixo legível + hash para storage. */
export function generateApiKey(): GeneratedApiKey {
  const randomSegment = randomBytes(RANDOM_BYTES).toString("base64url");
  const raw = `${KEY_PREFIX}${randomSegment}`;
  return {
    raw,
    keyPrefix: `${KEY_PREFIX}${randomSegment.slice(0, PREFIX_VISIBLE_CHARS)}`,
    keyHash: hashApiKey(raw),
  };
}

/**
 * Compara dois hashes hex em tempo constante (evita timing attack).
 * Usado pela Story 36.2 ao validar a chave recebida vs. a armazenada.
 */
export function safeCompareHash(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
