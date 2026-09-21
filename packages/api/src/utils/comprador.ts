/**
 * Story 29.53 — quem conta como UM comprador.
 *
 * A regra vivia inline em dois lugares de `perpetual-sales-data.ts` (o card e a
 * serie diaria) com chaves diferentes, e o relatorio tinha uma terceira em
 * `perpetual-report-metrics.ts`. Tres respostas para "quantas vendas?" na mesma
 * tela — foi assim que o order bump passou a inflar o CAC sem ninguem notar.
 *
 * Aqui e uma funcao pura, num lugar so, com teste. Se a regra mudar, muda aqui.
 */

/**
 * A chave que identifica um comprador.
 *
 * **E-mail primeiro, e nao por acaso.** O escopo do `EPIC-29` pede "dedup 1
 * venda/email" desde 2026-05-22; a implementacao e que divergiu para
 * `transactionId`. E o e-mail e o unico que nao depende de mapeamento correto
 * de coluna: medido no funil do Netao, o `transactionId` apontava para a coluna
 * `ID`, unica em todas as 196 linhas — a dedup existia e nao deduplicava nada.
 *
 * O order bump chega numa linha propria com o mesmo e-mail da compra principal:
 * 17 dos 20 bumps do periodo. Por e-mail eles colapsam; por `ID` viravam venda.
 *
 * @param email    coluna de e-mail, ja lida da linha
 * @param txId     coluna de transacao — rede para linha sem e-mail
 * @param indice   indice da linha — ultimo recurso, ver abaixo
 * @param escopo   prefixo opcional. A serie diaria passa o dia, e ai a mesma
 *                 pessoa em dois dias conta nos dois — que e a resposta certa
 *                 para "quantos compradores NESTE dia".
 */
export function chaveDeComprador(
  email: string | null | undefined,
  txId: string | null | undefined,
  indice: number,
  escopo?: string,
): string {
  const pre = escopo ? `${escopo}|` : "";
  const e = (email ?? "").trim().toLowerCase();
  if (e) return `${pre}email|${e}`;
  const t = (txId ?? "").trim();
  if (t) return `${pre}tx|${t}`;
  /**
   * Sem e-mail e sem transacao, a linha vira sua propria chave.
   *
   * ⚠️ Nao descartar. Uma venda sem identificador continua sendo uma venda, e
   * some-la em silencio faria o faturamento fechar com uma contagem menor —
   * exatamente o tipo de divergencia que esta story existe para acabar.
   */
  return `${pre}row|${indice}`;
}

/**
 * As vendas de uma etapa juntadas POR COMPRADOR — 1 por e-mail.
 *
 * Order bump chega numa linha própria com o mesmo e-mail da compra principal.
 * Na etapa de Vendas cada linha contava como venda: a fz-m3-set-26 mostrava 54
 * vendas para 47 compradores (6 bumps + 1 pessoa nas planilhas Kiwify e TMB),
 * medido em 21/09/2026. E o produto da planilha nem sempre ajuda a separar o
 * bump — lá a coluna mapeada como produto trazia o PREÇO.
 *
 * O dinheiro não se perde: bruto e líquido somam todas as linhas da pessoa. A
 * atribuição (UTM, canal, forma de pagamento) vem da linha de MAIOR valor —
 * a compra principal, não o bump — e a data é a da primeira compra.
 */
export function juntarPorComprador<
  V extends { email: string; bruto: number; liquido: number; lastDate: Date | null },
>(vendas: V[]): V[] {
  const porEmail = new Map<string, { principal: V; bruto: number; liquido: number; data: Date | null }>();
  const semEmail: V[] = [];
  for (const v of vendas) {
    const e = v.email.trim().toLowerCase();
    if (!e) {
      semEmail.push(v);
      continue;
    }
    const atual = porEmail.get(e);
    if (!atual) {
      porEmail.set(e, { principal: v, bruto: v.bruto, liquido: v.liquido, data: v.lastDate });
      continue;
    }
    atual.bruto += v.bruto;
    atual.liquido += v.liquido;
    if (v.bruto > atual.principal.bruto) atual.principal = v;
    if (v.lastDate && (!atual.data || v.lastDate < atual.data)) atual.data = v.lastDate;
  }
  return [
    ...[...porEmail.values()].map((c) => ({ ...c.principal, bruto: c.bruto, liquido: c.liquido, lastDate: c.data })),
    ...semEmail,
  ];
}
