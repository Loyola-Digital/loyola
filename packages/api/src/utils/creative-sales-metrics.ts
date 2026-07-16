/**
 * Story 18.55: Ingressos/Faturamento Único vs Total POR CRIATIVO.
 *
 * Espelha as regras da Story 18.51a (stage-sales-data.ts), trocando a
 * agregação por dia pela agregação por ad_id (o `co=`/utm_content da VENDA
 * resolve o criativo — mesma atribuição da Story 18.49):
 *
 * - TOTAL: cada linha de venda válida conta 1 ingresso e soma o bruto
 *   (fallback líquido). Retry-guard por transactionId+produto — order bump no
 *   mesmo pedido conta como venda separada; retry real (mesmo tx + mesmo
 *   produto) é descartado.
 * - ÚNICO: exclui produtos order bump; deduplica por email mantendo a compra
 *   mais recente (o co= dela define o criativo dono do único); venda de
 *   captação sem email conta avulsa.
 *
 * Vendas sem co= válido ficam fora (orgânico/recuperação/manual não têm
 * criativo pago para atribuir) — divergência esperada vs os cards do topo.
 */

export interface SaleColumnIdx {
  utmContent: number;
  email: number;
  bruto: number;
  liquido: number;
  tx: number;
  product: number;
  date: number;
}

export interface CreativeSalesMetrics {
  ingressosTotaisByAdId: Map<string, number>;
  ingressosUnicosByAdId: Map<string, number>;
  revenueTotalByAdId: Map<string, number>;
  revenueUnicoByAdId: Map<string, number>;
}

/** Espelho do parseNumber do endpoint de criativos (planilhas pt-BR). */
function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

/** Espelho do parseDate da 18.51a (dd/mm/yyyy preferido, ISO como fallback). */
function parseDate(val: string | undefined): Date | null {
  if (!val) return null;
  const trimmed = val.trim();
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(trimmed);
  return isNaN(dt.getTime()) ? null : dt;
}

/** Espelho do normalizeNumericId do endpoint (`_123` exportado do Sheets → `123`). */
function normalizeNumericId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("_")) {
    const rest = trimmed.slice(1);
    if (/^\d+$/.test(rest)) return rest;
  }
  return trimmed;
}

function inc(map: Map<string, number>, key: string, delta: number): void {
  map.set(key, (map.get(key) ?? 0) + delta);
}

export function computeCreativeSalesMetrics(
  rows: string[][],
  idx: SaleColumnIdx,
  orderBumpProducts: string[],
): CreativeSalesMetrics {
  const orderBumpSet = new Set(
    orderBumpProducts.map((p) => p.trim().toLowerCase()).filter(Boolean),
  );

  const ingressosTotaisByAdId = new Map<string, number>();
  const ingressosUnicosByAdId = new Map<string, number>();
  const revenueTotalByAdId = new Map<string, number>();
  const revenueUnicoByAdId = new Map<string, number>();

  // Retry-guard 18.51a: mesmo transactionId + mesmo produto = retry do gateway
  // (descarta); produto diferente no mesmo tx = order bump (conta).
  const retrySeen = new Set<string>();

  // Único: uma captura por email (a mais recente); sem email → avulsa.
  type Captura = { adId: string; value: number; date: Date | null };
  const capturaByEmail = new Map<string, Captura>();
  const capturaAvulsas: Captura[] = [];

  let rowIndex = -1;
  for (const row of rows) {
    rowIndex += 1;
    const adId = normalizeNumericId(row[idx.utmContent] ?? "");
    if (!adId) continue;

    const bruto = idx.bruto !== -1 ? parseNumber(row[idx.bruto]) : 0;
    const liquido = idx.liquido !== -1 ? parseNumber(row[idx.liquido]) : 0;
    const value = bruto > 0 ? bruto : liquido;
    // Espelha o filtro do endpoint (18.49): linha sem valor não é venda.
    if (value <= 0) continue;

    const txId = idx.tx !== -1 ? (row[idx.tx] ?? "").trim() : "";
    const product =
      idx.product !== -1 ? (row[idx.product] ?? "").trim().toLowerCase() : "";

    const retryKey = txId ? `tx|${txId}|${product}` : `row|${rowIndex}`;
    if (retrySeen.has(retryKey)) continue;
    retrySeen.add(retryKey);

    // TOTAL — linha a linha (ingresso + order bump)
    inc(ingressosTotaisByAdId, adId, 1);
    inc(revenueTotalByAdId, adId, value);

    // ÚNICO — só produto de captação
    if (orderBumpSet.has(product)) continue;
    const email =
      idx.email !== -1 ? (row[idx.email] ?? "").trim().toLowerCase() : "";
    const date = idx.date !== -1 ? parseDate(row[idx.date]) : null;
    if (!email) {
      capturaAvulsas.push({ adId, value, date });
      continue;
    }
    const cur = capturaByEmail.get(email);
    const newer =
      !cur || (date != null && (cur.date == null || date > cur.date));
    if (newer) capturaByEmail.set(email, { adId, value, date });
  }

  for (const c of [...capturaByEmail.values(), ...capturaAvulsas]) {
    inc(ingressosUnicosByAdId, c.adId, 1);
    inc(revenueUnicoByAdId, c.adId, c.value);
  }

  return {
    ingressosTotaisByAdId,
    ingressosUnicosByAdId,
    revenueTotalByAdId,
    revenueUnicoByAdId,
  };
}
