/**
 * Normaliza número de telefone: remove formatação, símbolos, espaços.
 * Retorna apenas dígitos (0-9).
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Extrai os 8 últimos dígitos de um telefone normalizado.
 * Útil para match fuzzy quando email muda entre etapas.
 */
export function getPhoneLast8(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.length < 8) return normalized;
  return normalized.slice(-8);
}
