// "mobile" = funil de app mobile (RevenueCat + Meta), dashboard da etapa Lyrio.
export type FunnelType = "launch" | "perpetual" | "mobile";

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
// "comercial" = etapa CRM (Epic 40): kanban de compradores das etapas-fonte.
// "lyrio" = etapa do app mobile Lyrio: campanhas Meta (conversões/spend) + vendas
// do RevenueCat (API key + webhook). Cabe no varchar(10).
// "event_capture" = Captação de Evento: idêntica à Captação Paga (tráfego, leads,
// dashboard), mas a venda manual é VENDA DE INGRESSO — com upload de comprovante
// que a IA lê pra preencher a venda. Passou de 10 chars: a coluna foi ampliada
// pra varchar(20) na migration 0102.
// "application" = Captação por Aplicação: a página tem formulário de aplicação,
// então o lead se APLICA antes de comprar. Junta o tráfego (como a Captação
// Paga), as aplicações lidas da planilha de pesquisa, e a venda — que acontece
// depois e é registrada numa planilha JÁ conectada em outra etapa do funil. A
// pergunta que a etapa responde é a taxa aplicação→venda, e de qual origem
// (utm_source/utm_medium) vem cada uma.
export type StageType =
  | "paid"
  | "application"
  | "free"
  | "sales"
  | "cpl"
  | "event"
  | "event_capture"
  | "debriefing"
  | "comercial"
  | "lyrio"
  // "mapa" = o desenho do funil: blocos e setas das peças do lançamento
  // (anúncio, LP, VSL, checkout, upsell, e-mail). Não tem métrica própria — é
  // onde o time enxerga o plano inteiro ao lado das etapas que têm dado.
  | "mapa";
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
  /**
   * Story 18.51a: productNames marcados como ORDER BUMP. Produto não listado =
   * produto da captação (ingresso). Base das métricas únicas vs totais.
   */
  orderBumpProducts: string[];
  createdAt: string;
}

/** Story 18.51a: item retornado pelo endpoint de produtos distintos da planilha. */
export interface StageSalesProduct {
  name: string;
  count: number;
  isOrderBump: boolean;
}

/** Story 18.51a: resposta do endpoint de produtos distintos. */
export interface StageSalesProductsResponse {
  productMapped: boolean;
  products: StageSalesProduct[];
  orderBumpProducts: string[];
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
/**
 * Story 29.49 — tipo de um produto vendido no funil perpétuo.
 *
 * `principal` é o default de quem não foi classificado: é o que mantém uma
 * planilha já conectada com o comportamento anterior à story, e espelha a
 * regra da Captação Paga, onde o produto não marcado é o de entrada.
 */
/**
 * Story 18.69 — quatro papéis. `combo` SUBSTITUI o principal com o extra
 * embutido; sem ele, o combo caía em `principal` e sumia da análise —
 * 65,97% da receita da captação do dg-pg02.
 */
export type PerpetualProductType =
  | "ingresso"
  | "principal"
  | "order_bump"
  | "combo"
  | "upsell";

/** Item da lista de produtos distintos da planilha do perpétuo. */
export interface PerpetualProduct {
  name: string;
  /** Linhas da planilha com este produto — ordena a lista e dá contexto ao gestor. */
  count: number;
  type: PerpetualProductType;
}

export interface PerpetualSpreadsheet {
  id: string;
  funnelId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: SaleColumnMapping;
  /** Story 29.7: plataforma de pagamento (null = sem desconto de fees) */
  platform: SalesPlatform | null;
  /**
   * Story 29.49: `productName` (lowercase, trim) → tipo. Ausente = `principal`.
   * Vazio em toda planilha anterior à story — e vazio significa exatamente o
   * comportamento de antes, não "sem informação".
   */
  productTypes: Record<string, PerpetualProductType>;
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
  /**
   * Story 29.53 (AC3): quantas LINHAS pagas de cada tipo de produto.
   *
   * ⚠️ Linhas, não compradores — as fatias NÃO somam `totalVendas`, e é assim
   * que tem que ser: o order bump vem numa linha própria com o mesmo e-mail da
   * compra principal. No funil do Netão, 109 principais + 20 bumps = 129 linhas
   * pagas contra 110 compradores. Quem espera 109 + 20 = 110 está fazendo a
   * pergunta errada, e a legenda do card existe para dizer isso.
   *
   * `null` quando não há classificação — coluna de produto não mapeada (29.31)
   * ou nenhum produto marcado no diálogo (29.49). Nesse caso a quebra não
   * aparece na tela, em vez de exibir "Principal 129" como se fosse informação.
   */
  porTipoProduto?: { ingresso: number; principal: number; order_bump: number; combo: number; upsell: number } | null;

  /**
   * Story 29.74 (AC1) — a mesma quebra, em VALOR bruto.
   *
   * ⚠️ Irmã de `porTipoProduto`, e diferente dela: aquela conta LINHAS e por
   * isso **não** fecha com `totalVendas` (o bump vem numa linha própria com o
   * mesmo e-mail); esta soma REAIS e **fecha** com `faturamentoBruto`, porque
   * valor é aditivo. Quem ler as duas na mesma tela vai tentar somar as duas —
   * a de valor fecha, a de contagem não, e cada uma diz isso no seu tooltip.
   *
   * `null` pelo mesmo critério de `porTipoProduto`: sem coluna de produto
   * mapeada ou sem produto classificado, tudo cairia em `principal` e a quebra
   * seria a ausência de informação disfarçada de informação.
   */
  faturamentoPorTipo?: { ingresso: number; principal: number; order_bump: number; combo: number; upsell: number } | null;

  /**
   * Story 29.61 — order bump e AOV por público no Perpétuo.
   *
   * ⚠️ Estes campos contam **COMPRADORES**, enquanto `porTipoProduto` acima
   * conta **LINHAS**. Os dois são certos e diferentes: no funil medido, 26
   * linhas de order bump são 24 compradores. A tela declara qual é qual — sem
   * isso, os dois números aparecem em alturas diferentes sem explicação.
   *
   * Mesma estrutura da Captação Paga (18.66/18.67), com dois acréscimos que só
   * o Perpétuo tem: a coluna de **upsell** (terceiro tipo da 29.49) e a
   * marcação de **amostra baixa**.
   */
  orderBump?: {
    temConfiguracao: boolean;
    /**
     * Story 29.74 (AC7): faturamento da ETAPA — todas as linhas de receita, o
     * mesmo número do card. Não é denominador de taxa; para isso é
     * `receitaCaptacao`.
     */
    faturamentoTotal: number;
    /** Story 29.74 (AC8): `receitaBase + bumpAcessorio` — denominador da 18.68. */
    receitaCaptacao: number;
    faturamentoPrincipal: number;
    bumpAcessorio: number;
    bumpAvulso: number;
    representatividade: number | null;
    compradoresComPrincipal: number;
    compradoresComBump: number;
    taxaDeAdesao: number | null;
    compradoresSoBump: number;
    /** AOV geral: `receita da captação ÷ checkouts de captação`. */
    aovGeral: number | null;
    /** Story 18.68 (AC3): qual sinal agrupou os checkouts. */
    sinalDeCheckout?: "transacao" | "janela" | "indisponivel";
    /** Story 18.69: o combo, com números próprios — nunca somado ao bump. */
    comboReceita?: number;
    comboRepresentatividade?: number | null;
    compradoresComCombo?: number;
    taxaDeCombo?: number | null;
  };
  publicos?: {
    publico: "Orgânico" | "Pago quente" | "Pago frio" | "Pago indefinido" | "Sem Track";
    compradores: number;
    compradoresComBump: number;
    taxaBump: number | null;
    compradoresComCombo?: number;
    taxaCombo?: number | null;
    receitaCombo?: number;
    compradoresComUpsell: number;
    taxaUpsell: number | null;
    receitaUpsell: number;
    /** Abaixo do piso: a taxa não se apresenta com a mesma autoridade. */
    amostraBaixa: boolean;
    receitaPrincipal: number;
    receitaBump: number;
    aovSemBump: number | null;
    /** Inclui bump E upsell — ver `LinhaDePublico.aovComBump` na API. */
    aovComBump: number | null;
  }[];
  /** Story 29.61 (AC3): a coluna de upsell some quando ninguém classificou. */
  temUpsellClassificado?: boolean;
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
/**
 * Story 29.69 (AC5/AC6) — as duas agregações que os seis painéis da seção
 * "Análise detalhada no período" consomem.
 *
 * As posições vêm SEMPRE todas: 24 horas e 7 dias, mesmo zeradas. Hora sem
 * venda é uma barra de altura zero; hora ausente faria o eixo pular de 13h para
 * 15h e a leitura de "melhor hora" sair errada.
 */
export interface PerpetualHourlyPosition {
  faturamentoBruto: number;
  faturamentoLiquido: number;
  /** Compradores distintos NA POSIÇÃO — não linhas, e não o pixel da Meta. */
  vendas: number;
  /** Com o imposto Meta aplicado uma única vez, no backend. */
  investimento: number;
  /** `null` quando não houve investimento: ROAS infinito achata o gráfico. */
  roas: number | null;
  /** Receita líquida − investimento (a fórmula do Epic 29). */
  margem: number;
}

export interface PerpetualHourlyData {
  porHora: (PerpetualHourlyPosition & { hora: number })[];
  porDiaDaSemana: (PerpetualHourlyPosition & { dia: number; nome: string })[];
  /**
   * Story 29.69 (AC6) — o que permite a tela dizer "faltam 12 de 148" em vez de
   * desenhar um gráfico incompleto com cara de completo.
   *
   * A cobertura é PARCIAL e não binária: medido em produção, `fz-a1` tem 5% das
   * vendas com hora e `pps1` tem 30% — a mesma coluna, formatos diferentes
   * linha a linha. Por isso vem o faturamento dentro e fora do corte, não só a
   * contagem.
   */
  cobertura: {
    totalVendas: number;
    vendasComHora: number;
    vendasSemHora: number;
    faturamentoComHora: number;
    faturamentoSemHora: number;
    /** `null` = o sync horário nunca rodou para este funil. */
    primeiroDiaComCacheHorario: string | null;
    ultimoSyncHorario: string | null;
    /** Fuso em que a Meta reportou as faixas. `null` = não verificado. */
    accountTimezone: string | null;
    temContaMeta: boolean;
    janela: { since: string; until: string };
  };
  semDados: boolean;
}

export interface PerpetualSalesDataDaily {
  byDay: Record<string, number>;
  /**
   * Story 29.23: contagem de vendas por dia (mesmas linhas que alimentam `byDay`,
   * mas contando transações em vez de somar faturamento). Base para Vendas/CPV/
   * Ticket Médio por dia no Quadro de Dados Diários. Opcional — ausente em
   * respostas `semDados`.
   */
  salesByDay?: Record<string, number>;
  semDados: boolean;
}

/**
 * Story 29.22 — planilha de Upsell High Ticket conectada ao funil perpétuo.
 */
export interface PerpetualUpsellSpreadsheet {
  id: string;
  funnelId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: SaleColumnMapping;
  createdAt: string;
  updatedAt: string;
}

/**
 * Story 29.22 — cruzamento de cross-sell: quem comprou o perpétuo e DEPOIS
 * comprou o high ticket (nunca antes). Match por email; reembolsos excluídos.
 */
export interface PerpetualUpsellData {
  /** Compradores únicos do perpétuo (excl. reembolso) — denominador da taxa. */
  basePerpetuo: number;
  /** Compradores que fizeram ao menos 1 upsell HT válido (após o perpétuo). */
  upsells: number;
  /** Total de compras HT válidas (uma pessoa pode ter mais de uma). */
  upsellTransacoes: number;
  /** upsells / basePerpetuo × 100. */
  taxaUpsell: number;
  faturamentoHighTicket: number;
  ticketMedioHighTicket: number;
  compradores: {
    email: string;
    nome: string | null;
    /** 1ª compra do perpétuo (ISO). */
    dataPerpetuo: string | null;
    /** 1ª compra HT válida (ISO). */
    dataHighTicket: string | null;
    valorHighTicket: number;
    comprasHighTicket: number;
  }[];
  /** true quando não há planilha de vendas do perpétuo conectada. */
  semPerpetuo: boolean;
  /** true quando não há planilha de upsell HT conectada. */
  semUpsell: boolean;
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
  /** Story 18.56: URL manual por LP da tabela de Testes de LPs.
   * Chave = lpName normalizado (trim+lowercase, ex. "lpa"); valor = URL http(s). */
  lpLinks: Record<string, string>;
  /** Controle Diário (Meta Ads TESTE): observação de texto livre por dia.
   * Chave = data YYYY-MM-DD; valor = texto da observação. */
  dayNotes: Record<string, string>;
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
  ingressosByDay?: Record<string, { pago: number; org: number; semTrack: number; manual?: number }>;
  /**
   * Story 18.51a: métricas ÚNICAS vs TOTAIS da etapa Captação Paga.
   * - Único = e-mails distintos que compraram o(s) produto(s) da captação (não
   *   marcados como order bump); por e-mail, a compra mais recente. Recompra não
   *   soma no faturamento.
   * - Total = todas as vendas (todos produtos, sem dedup por e-mail).
   * `ingressosTotaisByDay` espelha `ingressosByDay`. Presentes só quando há
   * planilha de vendas conectada (stageType "paid"/"sales").
   */
  ingressosUnicos?: number;
  ingressosTotais?: number;
  faturamentoUnico?: number;
  faturamentoTotal?: number;
  ingressosUnicosByDay?: Record<string, { pago: number; org: number; semTrack: number; manual?: number }>;
  ingressosTotaisByDay?: Record<string, { pago: number; org: number; semTrack: number; manual?: number }>;
  faturamentoUnicoByDay?: Record<string, number>;
  faturamentoTotalByDay?: Record<string, number>;
  /** Ingressos (vendas) por produto — todos os produtos, sem dedup. Tooltip de "Ingressos totais". */
  ingressosPorProduto?: { produto: string; count: number; bruto: number; isOrderBump: boolean }[];

  /**
   * Story 18.66 — representatividade do order bump no faturamento.
   *
   * ⚠️ `bumpAcessorio` e `bumpAvulso` NÃO são a mesma coisa. A configuração
   * marca **produtos**, e o mesmo produto é bump quando acompanha outro e é
   * venda própria quando vai sozinho. Medido no DG & CPDF: 10% dos compradores
   * só têm linha de produto marcado, R$ 23.122 que não são acréscimo a venda
   * nenhuma. Somá-los levaria a representatividade de 26,3% para 45,58%.
   */
  orderBump?: {
    /** A etapa tem produto marcado. `false` → a UI SOME com o card. */
    temConfiguracao: boolean;
    /**
     * Story 29.74 (AC7): faturamento da ETAPA — todas as linhas de receita, o
     * mesmo número do card. Não é denominador de taxa.
     */
    faturamentoTotal: number;
    /** Story 29.74 (AC8): `receitaBase + bumpAcessorio` — denominador da 18.68. */
    receitaCaptacao: number;
    faturamentoPrincipal: number;
    /** Bump de quem tem produto principal — o bump de verdade. */
    bumpAcessorio: number;
    /** Bump de quem NÃO tem principal: venda própria desses produtos. */
    bumpAvulso: number;
    /** `bumpAcessorio ÷ receitaCaptacao`. */
    representatividade: number | null;
    compradoresComPrincipal: number;
    compradoresComBump: number;
    taxaDeAdesao: number | null;
    compradoresSoBump: number;
    /** AOV geral: `receita da captação ÷ checkouts de captação`. */
    aovGeral: number | null;
    /** Story 18.68 (AC3): qual sinal agrupou os checkouts. */
    sinalDeCheckout?: "transacao" | "janela" | "indisponivel";
    /** Story 18.69: o combo, com números próprios — nunca somado ao bump. */
    comboReceita?: number;
    comboRepresentatividade?: number | null;
    compradoresComCombo?: number;
    taxaDeCombo?: number | null;
  };

  /**
   * Story 18.67 — conversão de order bump e AOV por público.
   *
   * Cinco baldes, não três: os pedidos (Orgânico, Pago quente, Pago frio) mais
   * "Sem Track" — que tem o MAIOR AOV medido — e "Pago indefinido". Balde sem
   * comprador não vem na lista.
   *
   * O público vem do produto PRINCIPAL do comprador: 54% das linhas de bump não
   * têm `utm_term` e classificá-las isoladamente destruiria a tabela.
   */
  publicos?: {
    publico: "Orgânico" | "Pago quente" | "Pago frio" | "Pago indefinido" | "Sem Track";
    compradores: number;
    compradoresComBump: number;
    taxaBump: number | null;
    compradoresComCombo?: number;
    taxaCombo?: number | null;
    receitaCombo?: number;
    receitaPrincipal: number;
    receitaBump: number;
    aovSemBump: number | null;
    aovComBump: number | null;
  }[];
  porCanal: { canal: string; vendas: number; bruto: number; liquido: number }[];
  porFormaPagamento: { forma: string; vendas: number; bruto: number; liquido: number }[];
  /**
   * Fontes das vendas.
   *
   * Além de "Pago"/"Orgânico"/"Sem Track", vem uma linha por VENDEDOR de venda
   * manual, marcada com `manual: true`. A origem de um PIX na mão é quem
   * vendeu — jogá-la em "sem track" misturava "perdemos o rastreio" com "nunca
   * houve rastreio a perder".
   */
  /**
   * Ingressos emitidos do evento, pelos lotes da Kiwify (`issued_tickets`).
   *
   * Difere de `totalVendas` porque uma compra pode levar vários ingressos — e a
   * Kiwify manda UMA venda nesse caso. `null` quando a etapa não tem conferência
   * Kiwify configurada ou o produto não é evento.
   */
  ingressosReais?: number | null;
  porUtmSource: { fonte: string; vendas: number; bruto: number; liquido: number; manual?: boolean }[];
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
  /**
   * aaaa-mm-dd — Dia 1 do funil comparado, quando não é o primeiro dia de
   * veiculação. Null = alinhamento pelo primeiro anúncio.
   */
  compareStartDate?: string | null;
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
  /** aaaa-mm-dd do dia no calendário — permite reancorar o Dia 1. */
  date?: string;
  impressions: number;
  clicks: number;
  /** Cliques no LINK (link_click) — usado pra CTR de tráfego real. */
  linkClicks?: number;
  spend: number;
  reach: number;
  /** CTR do LINK (linkClicks ÷ impressões). Para o clique total use `ctrTotal`. */
  ctr: number;
  ctrTotal?: number;
  cpc: number;
  /** Métricas de negócio na Comparação de Lançamentos (leads do pixel Meta;
   * faturamento/vendas do cache sales-daily somado por dia nas etapas do funil). */
  leads?: number;
  cpl?: number | null;
  faturamento?: number;
  vendas?: number;
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
  /** Faturamento/vendas por DATA (YYYY-MM-DD) do funil ATUAL — o front casa
   * com o `date_start` de cada dia do dailyData pra alinhar por Dia N. */
  atualSalesByDay?: Record<string, { faturamento: number; vendas: number }>;
  semDados: boolean;
  reason?: string;
}
