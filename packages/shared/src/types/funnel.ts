export type FunnelType = "launch" | "perpetual";

export interface FunnelCampaign {
  id: string;
  name: string;
}

export interface SwitchyFolderRef {
  id: number;
  name: string;
}

export interface SwitchyLinkRef {
  uniq: number;
  id: string;
  domain: string;
}

// Story 19.10: "event" = Etapa de Evento Presencial (imersão). Código curto p/
// caber no varchar(10) do banco; label de UI = "Evento Presencial".
// "debriefing" = etapa que agrupa os docs de debriefing da campanha (Epic 37 —
// movido do menu global pra dentro do funil). Cabe exato no varchar(10).
export type StageType = "paid" | "free" | "sales" | "cpl" | "event" | "debriefing";
// Story 19.10: "event_sales" = planilha de vendas de evento presencial (formato
// Nome/Produto/Valor/Caixa/Closer/Telefone, SEM email).
export type StageSalesSubtype = "capture" | "main_product" | "sales" | "tmb" | "event_sales";

export interface SaleColumnMapping {
  /**
   * Email do comprador. Obrigatório para planilhas de checkout
   * (capture/main_product/sales/tmb), onde é a chave de dedup/cruzamento.
   * Story 19.10: OPCIONAL para a planilha de Evento Presencial ("event_sales"),
   * que identifica a venda por linha (nome+telefone), pois não traz email.
   */
  email?: string;
  /**
   * Story 28.4: identificador único da transação (Kiwify/Hotmart `ID` ou
   * `Transaction`). Quando mapeado, o backend deduplica vendas por este
   * campo em vez de email — resolve casos de recompras/retries onde o mesmo
   * email gera múltiplas transações reais que não devem ser somadas.
   */
  transactionId?: string;
  /** Story 19.9 ext: nome do cliente (opcional, quando planilha trouxer). */
  customerName?: string;
  /** Story 19.9 ext: nome do produto vendido (ex: "Mentoria 1:1"). */
  productName?: string;
  valorBruto?: string;
  valorLiquido?: string;
  formaPagamento?: string;
  canalOrigem?: string;
  dataVenda?: string;
  /**
   * Status do pagamento (ex.: "paid"/"approved" vs "refunded"/"chargeback").
   * Quando mapeado, o backend desconta reembolsos/chargebacks do faturamento.
   * Opcional — sem esta coluna, todas as linhas contam como venda (legado).
   */
  status?: string;
  /**
   * UTMs da venda (opcionais) — quando a planilha de vendas já registra as
   * UTMs da compra (Kiwify, Hotmart, etc.), mapear aqui permite atribuir
   * venda diretamente a ad/campanha sem depender do cruzamento por email
   * com a planilha de leads.
   */
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  /**
   * Story 19.10 — campos da planilha de Evento Presencial ("event_sales").
   * Mapeados para o pipeline existente quando possível:
   *  - `closer` é tratado como `utm_source` no breakdown de vendedores;
   *  - `telefone` → telefone do cliente;
   *  - `caixa` → valor efetivamente recebido (à vista/entrada);
   *  - `negociacao` → texto livre do acordo (só exibição/persistência).
   * `valor` (valor contratado) usa o slot `valorBruto`; `nome` usa `customerName`;
   * `produto` usa `productName`.
   */
  closer?: string;
  telefone?: string;
  caixa?: string;
  negociacao?: string;
}

export interface StageSalesSpreadsheet {
  id: string;
  stageId: string;
  subtype: StageSalesSubtype;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: SaleColumnMapping;
  createdAt: string;
}

/**
 * Story 29.7: plataforma de pagamento — determina o fee% descontado da
 * Receita Bruta pra calcular Margem real.
 *
 * Componentes de fee (somados):
 * - Reembolso: 4%
 * - Marketplace: 4.99% (Kiwify) | 10% (Hotmart)
 * - Imposto: 11%
 * - Outros custos: 1%
 *
 * Totais: Kiwify=20.99% / Hotmart=26% / Other=0%
 */
export type SalesPlatform = "kiwify" | "hotmart" | "other";

export const PLATFORM_FEE_RATES: Record<SalesPlatform, number> = {
  kiwify: 0.2099,
  hotmart: 0.26,
  other: 0,
};

/**
 * Epic 29 — Planilha de vendas conectada a um funil de tipo perpétuo.
 * 1 por funil (sem stage). Mesmo mapper de colunas do StageSalesSpreadsheet.
 */
export interface PerpetualSpreadsheet {
  id: string;
  funnelId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: SaleColumnMapping;
  /** Story 29.7: plataforma de pagamento (null = sem desconto de fees) */
  platform: SalesPlatform | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Epic 29 Story 29.3 — Métricas agregadas da planilha de vendas do perpétuo.
 * porUtmSource é BRUTO (sem normalização Pago/Orgânico) — granularidade total
 * pro time identificar qual canal específico converte.
 */
export interface PerpetualSalesData {
  totalVendas: number;
  faturamentoBruto: number;
  faturamentoLiquido: number;
  /** Story 29.7: bruto × (1 − feeRate) — sempre confiável (calculado server) */
  faturamentoLiquidoCalculado: number;
  /**
   * Reembolsos (status refunded/chargeback) — já descontados do
   * faturamento acima. Só > 0 quando a planilha tem coluna de status mapeada.
   */
  reembolsoBruto: number;
  reembolsoLiquido: number;
  vendasReembolsadas: number;
  /**
   * true quando a planilha tem coluna de status mapeada → reembolso é medido de
   * verdade. Nesse caso o `feeRate` já vem SEM o componente de reembolso
   * estimado (4%), pois o reembolso real já saiu do `faturamentoBruto`.
   */
  reembolsoReal: boolean;
  platform: SalesPlatform | null;
  feeRate: number;
  ticketMedioBruto: number;
  ticketMedioLiquido: number;
  porUtmSource: { source: string; vendas: number; bruto: number; liquido: number }[];
  /** Story 29.8: por utm_medium (público) + utm_content (criativo) */
  porUtmMedium: { medium: string; vendas: number; bruto: number; liquido: number }[];
  porUtmContent: { content: string; vendas: number; bruto: number; liquido: number }[];
  /** Story 29.16: por utm_campaign (= campaign id da Meta) pra cruzar receita/vendas na tabela de campanhas */
  porUtmCampaign: { campaign: string; vendas: number; bruto: number; liquido: number }[];
  porFormaPagamento: { forma: string; vendas: number; bruto: number; liquido: number }[];
  semDados: boolean;
}

/**
 * Série diária de receita bruta da planilha. Chave = data local (YYYY-MM-DD).
 * Sem dedup — cada linha da planilha é uma transação distinta.
 */
export interface PerpetualSalesDataDaily {
  byDay: Record<string, number>;
  semDados: boolean;
}

export interface FunnelStage {
  id: string;
  funnelId: string;
  name: string;
  stageType: StageType;
  metaAccountId: string | null;
  campaigns: FunnelCampaign[];
  googleAdsAccountId: string | null;
  googleAdsCampaigns: FunnelCampaign[];
  switchyFolderIds: SwitchyFolderRef[];
  switchyLinkedLinks: SwitchyLinkRef[];
  /** GA4 (Epic 37): página (substring de landingPagePlusQueryString) que esta
   * etapa analisa no GA4. Null = etapa sem análise GA4. */
  ga4PageFilter: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  projectionEndDate?: string | null; // Story 18.27: data final da projeção
  leadGoal?: number | null; // Story 18.27: meta de leads
}

export interface StageSalesData {
  totalVendas: number;
  faturamentoBruto: number;
  faturamentoLiquido: number;
  /**
   * Reembolsos (status refunded/chargeback) — já descontados do faturamento
   * acima. Só > 0 quando a planilha tem coluna de status mapeada.
   */
  reembolsoBruto: number;
  reembolsoLiquido: number;
  vendasReembolsadas: number;
  ticketMedioBruto: number;
  ticketMedioLiquido: number;
  ticketMedioPago: number;
  ticketMedioOrganico: number;
  ticketMedioSemTrack: number;
  /**
   * Faturamento bruto e nº de vendas atribuídos só ao tráfego PAGO
   * (utm_source = meta-ads ou google-ads). Base do ROAS/CPV — orgânico e
   * sem-track ficam de fora pra não inflar o retorno do spend.
   */
  faturamentoPago: number;
  vendasPago: number;
  /**
   * Story 18.48: contagem de vendas (ingressos) deduplicadas por dia × origem.
   * Mesma dedup do `totalVendas` → soma bate. Origem pela utm_source da venda.
   * Usado pela Dados Diários da etapa Paga (Total Ingressos = vendas, não leads).
   */
  ingressosByDay?: Record<string, { pago: number; org: number; semTrack: number }>;
  porCanal: { canal: string; vendas: number; bruto: number; liquido: number }[];
  porFormaPagamento: { forma: string; vendas: number; bruto: number; liquido: number }[];
  porUtmSource: { fonte: string; vendas: number; bruto: number; liquido: number }[];
  /**
   * Agregação por utm_medium. utm_medium carrega o adset_id (padrão Loyola).
   * Backend resolve pra adset_name via cache persistente (Story 28.7) — quando
   * não resolveu, `name === medium` (fallback).
   */
  porUtmMedium: { medium: string; name: string; vendas: number; bruto: number; liquido: number }[];
  /**
   * Agregação por utm_term. Quando utm_term carrega o adset_id (padrão Loyola),
   * o backend resolve pra adset_name via Meta API (cache persistente, Story
   * 28.7) e preenche `name`. Quando não resolveu, `name === term` (fallback).
   */
  porUtmTerm: { term: string; name: string; vendas: number; bruto: number; liquido: number }[];
  /**
   * Agregação por utm_content. utm_content carrega o ad_id (padrão Loyola); o
   * backend resolve pra ad_name via Meta API (cache persistente, Story 28.7).
   * Quando não resolveu, `name === content` (fallback).
   */
  porUtmContent: { content: string; name: string; vendas: number; bruto: number; liquido: number }[];
  /** Story 19.9 ext: detalhamento planilha vs manual pro tooltip de faturamento. */
  breakdown?: {
    spreadsheet: { vendas: number; bruto: number; liquido: number };
    manual: { vendas: number; bruto: number; liquido: number };
  };
  semDados: boolean;
  /**
   * Story 28.4: counters de instrumentação. Só é preenchido quando o request
   * inclui `?debug=1`. Permite investigar discrepâncias entre o que a planilha
   * tem e o que o dashboard exibe — onde linhas foram descartadas, quantas
   * keys de dedup ficaram após agregação.
   */
  debug?: {
    spreadsheetsLoaded: { id: string; name: string; totalRows: number; validRows: number }[];
    totalRowsRead: number;
    skippedEmailEmpty: number;
    skippedDateInvalid: number;
    skippedDateOutOfRange: number;
    uniqueDedupeKeys: number;
    dedupeStrategy: "email" | "transactionId" | "mixed";
  };
}

export interface Funnel {
  id: string;
  projectId: string;
  name: string;
  type: FunnelType;
  metaAccountId: string | null;
  campaigns: FunnelCampaign[];
  googleAdsAccountId: string | null;
  googleAdsCampaigns: FunnelCampaign[];
  switchyFolderIds: SwitchyFolderRef[];
  switchyLinkedLinks: SwitchyLinkRef[];
  compareFunnelId: string | null;
  /** Substring case-insensitive a buscar em campaign.name pra detectar
   * campanhas órfãs (Epic 25). Null = alerta desativado. */
  matchCode: string | null;
  /** Story 18.19 fix: Meta Total + Data Final do gráfico
   * "Leads: Reais vs Projeção vs Meta" — persistido no DB (era localStorage). */
  leadsGoalMeta: number | null;
  leadsGoalDataFinal: string | null;
  /** Story 18.40 fix: Gasto Total Projetado para gráfico
   * "Leads: Reais vs Projeção (Baseado em Custo)" — persistido no DB (era localStorage). */
  leadsGoalGastoTotal: number | null;
  /** Story 10.9: NULL = ativo; preenchido = arquivado. Exposto p/ permitir
   * escolher funis arquivados como comparação. */
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComparisonDayMetrics {
  dayIndex: number;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  ctr: number;
  cpc: number;
}

export interface OrphanCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
}

export interface OrphanStageGroup {
  stageName: string;
  orphans: OrphanCampaign[];
}

export interface OrphanCampaignsResponse {
  hasMatchCode: boolean;
  matchCode: string | null;
  totalMatching: number;
  orphans: OrphanCampaign[];
  byStage: Record<string, OrphanStageGroup>;
}

export interface MetaAdsComparisonData {
  compareFunnelName: string;
  compareStageName: string;
  days: ComparisonDayMetrics[];
  totals: {
    impressions: number;
    clicks: number;
    spend: number;
    reach: number;
  };
  semDados: boolean;
  reason?: string;
}
