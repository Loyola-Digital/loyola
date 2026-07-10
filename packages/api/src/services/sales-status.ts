// ============================================================
// Classificação de status de venda para planilhas de funil
// (perpétuo / lançamento).
//
// As planilhas de checkout (Kiwify, Hotmart, Guru, Eduzz...) trazem
// o status em formatos variados e em PT ou EN. Aqui normalizamos e
// classificamos em 4 buckets:
//   - "paid"       → venda válida, entra no faturamento
//   - "refunded"   → reembolso, sai do faturamento
//   - "chargeback" → estorno/disputa, sai do faturamento
//   - "other"      → pendente/recusado/desconhecido → NÃO entra no faturamento
//
// Reaproveita os buckets canônicos da integração Kiwify
// (services/kiwify.ts) e amplia com sinônimos PT que aparecem nas
// planilhas manuais dos infoprodutos.
// ============================================================

import {
  PAID_STATUSES,
  REFUNDED_STATUSES,
  CHARGEBACK_STATUSES,
} from "./kiwify.js";

export type SalesStatusBucket = "paid" | "refunded" | "chargeback" | "other";

/** Reembolso e chargeback saem do faturamento. */
export function isRefundBucket(bucket: SalesStatusBucket): boolean {
  return bucket === "refunded" || bucket === "chargeback";
}

// Normaliza: minúsculo, sem acento, separadores → espaço único.
function normalizeStatus(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Sinônimos PT/EN adicionais (já normalizados — sem acento, minúsculo).
const PAID_SYNONYMS = [
  "paid", "approved", "aprovado", "aprovada", "pago", "paga",
  "completo", "completa", "complete", "completed", "concluido",
  "concluida", "confirmado", "confirmada", "purchase approved", "ativo", "ativa",
];
const REFUNDED_SYNONYMS = [
  "refunded", "refund", "refund requested", "pending refund",
  "reembolsado", "reembolsada", "reembolso", "estornado", "estornada",
  "devolvido", "devolvida", "devolucao",
];
const CHARGEBACK_SYNONYMS = [
  "chargeback", "chargedback", "charged back", "estorno",
  "disputa", "dispute", "contestacao", "contestado",
];

const STATUS_TO_BUCKET = new Map<string, SalesStatusBucket>();
function register(values: readonly string[], bucket: SalesStatusBucket) {
  for (const v of values) STATUS_TO_BUCKET.set(normalizeStatus(v), bucket);
}
// Kiwify canônicos primeiro, depois sinônimos ampliados.
register(PAID_STATUSES, "paid");
register(REFUNDED_STATUSES, "refunded");
register(CHARGEBACK_STATUSES, "chargeback");
register(PAID_SYNONYMS, "paid");
register(REFUNDED_SYNONYMS, "refunded");
register(CHARGEBACK_SYNONYMS, "chargeback");

/**
 * Classifica o status cru de uma linha de planilha.
 *
 * @param raw          valor da célula de status (pode ser vazio/undefined)
 * @param hasStatusCol se a planilha NÃO tem coluna de status mapeada,
 *                     passe false → tudo vira "paid" (retrocompatível: sem
 *                     coluna de status, nenhum reembolso é descontado).
 */
export function classifyRefundStatus(
  raw: string | undefined | null,
  hasStatusCol: boolean,
): SalesStatusBucket {
  // Sem coluna de status na planilha → comportamento legado (tudo é venda).
  if (!hasStatusCol) return "paid";

  const norm = raw == null ? "" : normalizeStatus(String(raw));
  // Célula de status vazia numa planilha que TEM a coluna: trata como paga
  // (linha sem marcação de reembolso = venda válida).
  if (!norm) return "paid";

  const exact = STATUS_TO_BUCKET.get(norm);
  if (exact) return exact;

  // Fallback por substring (ex.: "reembolso parcial", "estorno total").
  if (/reembols|estorn|devolv|refund/.test(norm)) return "refunded";
  if (/chargeback|charged back|disputa|dispute|contesta/.test(norm)) return "chargeback";
  if (/paid|approv|aprovad|pago|conclu|complet|confirmad/.test(norm)) return "paid";

  // Pendente, recusado, aguardando pagamento, etc → não é venda paga,
  // mas também não é reembolso.
  return "other";
}
