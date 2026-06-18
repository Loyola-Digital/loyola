/**
 * Buraco 2 (Story 36.7): classificação de origem, temperatura (quente/frio) e
 * dedup de leads/vendas para os splits Pago/Orgânico/Sem Track × 🔥/❄️.
 *
 * Funções puras (sem DB/rede) — fonte da verdade compartilhada entre o job de
 * sync e qualquer rota. Espelha `classifyFonte`/`PAID_UTM_SOURCES` de
 * `routes/stage-sales-data.ts` para não divergir dos números de vendas.
 */

/** utm_source que identificam tráfego PAGO (Meta/Google). Case-insensitive. */
export const PAID_UTM_SOURCES = new Set([
  "meta",
  "meta-ads",
  "facebook",
  "fb",
  "google",
  "google-ads",
]);

export type Origem = "Pago" | "Orgânico" | "Sem Track";

/**
 * - utm_source em PAID_UTM_SOURCES → Pago
 * - utm_source preenchida com outro valor → Orgânico
 * - vazia/ausente → Sem Track
 */
export function classifyOrigem(utmSource: string | null | undefined): Origem {
  const n = (utmSource ?? "").trim().toLowerCase();
  if (!n) return "Sem Track";
  return PAID_UTM_SOURCES.has(n) ? "Pago" : "Orgânico";
}

export type Temperatura = "quente" | "frio" | "indefinido";

/** Quente/frio a partir do utm_term (hot/quente vs cold/frio). */
export function classifyTemperatura(utmTerm: string | null | undefined): Temperatura {
  const n = (utmTerm ?? "").toLowerCase();
  if (!n) return "indefinido";
  if (n.includes("hot") || n.includes("quente")) return "quente";
  if (n.includes("cold") || n.includes("frio")) return "frio";
  return "indefinido";
}

/** Últimos 8 dígitos do telefone (só dígitos). "" se < 8 dígitos. */
export function phoneTail(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : "";
}

/** E-mail normalizado (trim + lowercase). "" se vazio. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Chaves de dedup de um lead: e-mail normalizado e/ou últimos 8 dígitos do
 * telefone. Um lead é duplicado de outro se compartilhar QUALQUER uma das chaves.
 * O agregador deve unir por ambas (ex.: union-find / dois Sets) — por isso
 * devolvemos as duas. Retorna `[]` quando o lead não tem identificador algum.
 */
export function dedupKeys(
  email: string | null | undefined,
  phone: string | null | undefined,
): string[] {
  const keys: string[] = [];
  const e = normalizeEmail(email);
  if (e) keys.push(`e:${e}`);
  const p = phoneTail(phone);
  if (p) keys.push(`p:${p}`);
  return keys;
}
