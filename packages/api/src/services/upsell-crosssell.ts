// ============================================================
// Epic 29 Story 29.22 — Núcleo do cruzamento de cross-sell.
// Puro (sem I/O) para ser testável: recebe os compradores do perpétuo
// (email → 1ª data de compra) e as compras de high ticket já limpas de
// reembolso, e decide quais HT contam como UPSELL (data HT > 1ª compra
// perpétua do mesmo email — nunca antes).
// ============================================================

export interface HtPurchase {
  email: string;
  date: Date | null;
  value: number;
  name: string | null;
}

export interface UpsellBuyer {
  email: string;
  nome: string | null;
  dataPerpetuo: string | null;
  dataHighTicket: string | null;
  valorHighTicket: number;
  comprasHighTicket: number;
}

export interface UpsellResult {
  basePerpetuo: number;
  upsells: number;
  upsellTransacoes: number;
  taxaUpsell: number;
  faturamentoHighTicket: number;
  ticketMedioHighTicket: number;
  compradores: UpsellBuyer[];
}

/**
 * @param perpetualEmails      compradores únicos do perpétuo (excl. reembolso).
 * @param earliestPerpByEmail  email → data da 1ª compra perpétua (só emails com data).
 * @param htPurchases          compras HT já deduplicadas e sem reembolso.
 */
export function computeUpsellCrossSell(
  perpetualEmails: Set<string>,
  earliestPerpByEmail: Map<string, Date>,
  htPurchases: HtPurchase[],
): UpsellResult {
  const byBuyer = new Map<
    string,
    { nome: string | null; dataPerpetuo: Date; htFirst: Date; htTotal: number; htCount: number }
  >();
  let upsellTransacoes = 0;
  let faturamentoHighTicket = 0;

  for (const ht of htPurchases) {
    const perpDate = earliestPerpByEmail.get(ht.email);
    // Só é upsell se comprou o perpétuo E o HT foi DEPOIS da 1ª compra perpétua.
    // Sem data confiável nos dois lados, não conta (garante o "nunca antes").
    if (!perpetualEmails.has(ht.email) || !perpDate) continue;
    if (!ht.date || ht.date <= perpDate) continue;

    upsellTransacoes += 1;
    faturamentoHighTicket += ht.value;

    const b = byBuyer.get(ht.email);
    if (b) {
      b.htTotal += ht.value;
      b.htCount += 1;
      if (ht.date < b.htFirst) b.htFirst = ht.date;
      if (!b.nome && ht.name) b.nome = ht.name;
    } else {
      byBuyer.set(ht.email, {
        nome: ht.name,
        dataPerpetuo: perpDate,
        htFirst: ht.date,
        htTotal: ht.value,
        htCount: 1,
      });
    }
  }

  const basePerpetuo = perpetualEmails.size;
  const upsells = byBuyer.size;
  const compradores = Array.from(byBuyer.entries())
    .map(([email, b]) => ({
      email,
      nome: b.nome,
      dataPerpetuo: b.dataPerpetuo.toISOString(),
      dataHighTicket: b.htFirst.toISOString(),
      valorHighTicket: b.htTotal,
      comprasHighTicket: b.htCount,
    }))
    .sort((a, b) => b.valorHighTicket - a.valorHighTicket);

  return {
    basePerpetuo,
    upsells,
    upsellTransacoes,
    taxaUpsell: basePerpetuo > 0 ? (upsells / basePerpetuo) * 100 : 0,
    faturamentoHighTicket,
    ticketMedioHighTicket: upsellTransacoes > 0 ? faturamentoHighTicket / upsellTransacoes : 0,
    compradores,
  };
}
