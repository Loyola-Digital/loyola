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
 * As vendas de uma etapa juntadas POR COMPRADOR.
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
 *
 * ## Quando o produto É confiável (Story 41.13)
 *
 * Juntar tudo por e-mail cobra um preço: quem compra DOIS produtos diferentes
 * virava uma venda só, com o faturamento das duas. No `ppl1-bf26` isso apareceu
 * como 1 venda onde havia 2 — e ali são duas vendas mesmo, não um bump.
 *
 * `opcoes` é a saída: onde o gestor classificou os produtos da etapa, cada
 * produto que ANCORA (principal/combo) conta uma venda por comprador, e só
 * order bump e upsell seguem colando na compra que ancora. Sem `opcoes` — toda
 * etapa sem classificação, a FZ inteira — o comportamento é o de cima, linha
 * por linha idêntico: é o caso particular em que nada ancora.
 */
export interface OpcoesDeComprador<V> {
  /** `true` = esta linha é um produto que ancora uma venda própria. */
  ancora: (venda: V) => boolean;
  /** O produto da linha, normalizado — a chave que separa duas vendas. */
  produto: (venda: V) => string;
}

export function juntarPorComprador<
  V extends { email: string; bruto: number; liquido: number; lastDate: Date | null },
>(vendas: V[], opcoes?: OpcoesDeComprador<V>): V[] {
  interface Grupo {
    principal: V;
    bruto: number;
    liquido: number;
    data: Date | null;
  }
  const grupos = new Map<string, Grupo>();
  /** As chaves de grupo que ancoram, por e-mail — onde o extra vai somar. */
  const ancorasPorEmail = new Map<string, string[]>();
  const semEmail: V[] = [];
  /** Linhas que não ancoram (bump, upsell) — resolvidas depois das âncoras. */
  const extras: Array<{ email: string; venda: V }> = [];

  const novo = (v: V): Grupo => ({ principal: v, bruto: v.bruto, liquido: v.liquido, data: v.lastDate });
  const somar = (g: Grupo, v: V) => {
    g.bruto += v.bruto;
    g.liquido += v.liquido;
    if (v.lastDate && (!g.data || v.lastDate < g.data)) g.data = v.lastDate;
  };

  for (const v of vendas) {
    const e = v.email.trim().toLowerCase();
    if (!e) {
      semEmail.push(v);
      continue;
    }
    if (!opcoes?.ancora(v)) {
      extras.push({ email: e, venda: v });
      continue;
    }
    const chave = `${e}|${opcoes.produto(v)}`;
    const g = grupos.get(chave);
    if (!g) {
      grupos.set(chave, novo(v));
      ancorasPorEmail.set(e, [...(ancorasPorEmail.get(e) ?? []), chave]);
      continue;
    }
    // Mesma pessoa, MESMO produto que ancora: o dinheiro entra, a venda não.
    // (Retry que a camada 1 não pegou, ou a mesma compra em duas planilhas.)
    somar(g, v);
    if (v.bruto > g.principal.bruto) g.principal = v;
  }

  for (const { email, venda } of extras) {
    const chaves = ancorasPorEmail.get(email);
    if (chaves && chaves.length > 0) {
      // O extra soma na compra que ancora de MAIOR valor — não vira venda.
      let alvo = grupos.get(chaves[0])!;
      for (const k of chaves) {
        const g = grupos.get(k)!;
        if (g.principal.bruto > alvo.principal.bruto) alvo = g;
      }
      somar(alvo, venda);
      continue;
    }
    /**
     * Comprador sem nenhuma âncora: as linhas dele se juntam por e-mail.
     *
     * É o caminho de SEMPRE quando `opcoes` não vem (nada ancora), e é o que
     * preserva a contagem de hoje em toda etapa não classificada. Também é a
     * resposta certa para o comprador "só-bump": ele comprou, é uma venda.
     */
    const g = grupos.get(email);
    if (!g) {
      grupos.set(email, novo(venda));
      continue;
    }
    somar(g, venda);
    if (venda.bruto > g.principal.bruto) g.principal = venda;
  }

  return [
    ...[...grupos.values()].map((c) => ({ ...c.principal, bruto: c.bruto, liquido: c.liquido, lastDate: c.data })),
    ...semEmail,
  ];
}
