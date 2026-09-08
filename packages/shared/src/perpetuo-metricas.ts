/**
 * Story 44.28 — os KPIs do topo do dashboard perpétuo, em UM lugar só.
 *
 * ## Por que isto saiu do componente
 *
 * Este cálculo vivia como `useMemo` de 53 linhas dentro de
 * `perpetual-dashboard.tsx` (`:1766`), e por isso **só existia no navegador**.
 * O agente Inácio lê a API pública e não tinha como chegar nele: para publicar
 * "CAC R$ 215,86", ele teria que recompor a conta por fora — que é a segunda
 * régua que o Epic 44 inteiro existe para impedir.
 *
 * Nasceu aqui como **módulo folha**, sem nenhum import de dentro do `shared`:
 * o web consome por subpath (`@loyola-x/shared/src/perpetuo-metricas`), a API
 * por bare import. Ver a tabela em `./index.ts` — os dois caminhos NÃO são
 * intercambiáveis, e trocar derruba o boot sem que `tsc`, `vitest` ou
 * `next build` acusem (Story 19.14).
 *
 * ## A régua de vendas é a do CARD — compradores únicos
 *
 * Decisão do @po no checkpoint da Story 44.28 (08/09/2026), ancorada na
 * fixture do briefing, que fecha nas três janelas:
 *
 *     R$ 25.895,74 ÷ 157 = R$ 164,94   (90 dias)
 *     R$ 15.757,56 ÷  73 = R$ 215,86   (30 dias)
 *     R$  4.333,25 ÷  17 = R$ 254,90   ( 7 dias)
 *
 * `totalVendas` deduplica por e-mail no PERÍODO inteiro. A soma da tabela de
 * Dados Diários deduplica DENTRO DO DIA e é legitimamente maior (medido: 0 a 2
 * vendas, 0%–1,5%) — ela responde "quanto vendeu neste dia", não "quantos
 * clientes foram adquiridos". CAC é custo de aquisição de *cliente*: num
 * perpétuo com recompra, quem compra em dois dias é UMA aquisição.
 *
 * ## Os três ramos são regra de negócio, não detalhe de UI
 *
 * Eles viajaram junto de propósito. O segundo é a Story 29.10: sem planilha
 * conectada, vendas e receita são ZERO e os derivados são `null` — nunca o
 * pixel da Meta por baixo, que era o fallback silencioso que aquela story
 * removeu.
 */

/** O que a leitura de mídia entrega. `null` = não há dado de mídia na janela. */
export interface MidiaDoPerpetuo {
  /** Investimento JÁ COM o imposto Meta (gross-up ÷ (1 − 0,1215)). Nunca reaplicar. */
  totalSpend: number;
}

/** O que a planilha de vendas entrega, na régua do card. */
export interface VendasDoPerpetuo {
  /** Compradores únicos no período — dedup por e-mail. A régua canônica. */
  totalVendas: number;
  faturamentoBruto: number;
  /** Após as taxas da plataforma. Base da margem (Story 29.20). */
  faturamentoLiquidoCalculado: number;
}

export interface EntradaDasMetricas {
  /** `false` = nenhuma campanha Meta vinculada ao funil. */
  temCampanhas: boolean;
  /** `null` quando não há leitura de mídia. */
  midia: MidiaDoPerpetuo | null;
  /** `null` = sem planilha de vendas conectada. */
  vendas: VendasDoPerpetuo | null;
  /**
   * Spend já agregado com imposto, quando existe. Tem precedência sobre
   * `midia.totalSpend` — é o número por (campanha, dia) do painel, e é ele que
   * bate ao centavo com o resto da tela.
   */
  spendComTaxAgregado?: number;
}

export interface MetricasDoPerpetuo {
  totalSpend: number;
  totalSales: number;
  totalRevenue: number;
  /** `null` quando não há denominador — nunca `0`, que afirmaria outra coisa. */
  cac: number | null;
  margin: number | null;
  marginPercent: number | null;
  roas: number | null;
}

/**
 * Os KPIs do topo, a partir das duas fontes.
 *
 * `null` quando não há o que calcular — e a ausência é a resposta, não um
 * objeto de zeros (regra 7.4 da spec do Epic 44).
 */
export function calcularMetricasDoPerpetuo(e: EntradaDasMetricas): MetricasDoPerpetuo | null {
  // ── Ramo 1: sem campanha vinculada ──────────────────────────
  // KPIs 100% da planilha. Investimento zero, então CAC e ROAS não existem —
  // e a margem é a receita líquida inteira, sem mídia a descontar.
  if (!e.temCampanhas) {
    if (!e.vendas) return null;
    const { totalVendas, faturamentoBruto, faturamentoLiquidoCalculado } = e.vendas;
    return {
      totalSpend: 0,
      totalSales: totalVendas,
      totalRevenue: faturamentoBruto,
      cac: null,
      margin: faturamentoLiquidoCalculado,
      marginPercent: faturamentoBruto > 0 ? (faturamentoLiquidoCalculado / faturamentoBruto) * 100 : null,
      roas: null,
    };
  }

  if (!e.midia) return null;

  const spend =
    e.spendComTaxAgregado !== undefined && e.spendComTaxAgregado > 0
      ? e.spendComTaxAgregado
      : e.midia.totalSpend;

  // ── Ramo 2: com campanha, sem planilha de vendas (Story 29.10) ──
  // ⚠️ Vendas e receita são ZERO, e os derivados `null`. **Não** herdam o
  // pixel da Meta: era esse o fallback silencioso que a 29.10 removeu, e que
  // mostrava faturamento onde não havia fonte de venda nenhuma.
  if (!e.vendas) {
    return {
      totalSpend: spend,
      totalSales: 0,
      totalRevenue: 0,
      cac: null,
      margin: null,
      marginPercent: null,
      roas: null,
    };
  }

  // ── Ramo 3: o normal ────────────────────────────────────────
  const { totalVendas, faturamentoBruto, faturamentoLiquidoCalculado } = e.vendas;
  // Story 29.20 (decisão do gestor): Margem = receita LÍQUIDA − investimento.
  const margin = faturamentoLiquidoCalculado - spend;
  return {
    totalSpend: spend,
    totalSales: totalVendas,
    totalRevenue: faturamentoBruto,
    cac: totalVendas > 0 ? spend / totalVendas : null,
    margin,
    marginPercent: faturamentoBruto > 0 ? (margin / faturamentoBruto) * 100 : null,
    // ⚠️ ROAS sobre o faturamento BRUTO (regra da 29.20); só o denominador
    // carrega o imposto de mídia.
    roas: spend > 0 ? faturamentoBruto / spend : null,
  };
}
