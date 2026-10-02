/**
 * Catálogo semântico — o que dá para consultar no construtor de BI.
 *
 * ## Por que é declarado à mão, e não gerado do banco
 *
 * Este arquivo é a **fronteira de segurança** da feature. O executor só aceita
 * métrica e dimensão que existam aqui, e traduz cada uma para coluna por um
 * mapa fechado. Um campo que não está neste arquivo não é consultável — nem
 * por query montada na tela, nem por widget salvo, nem por engano.
 *
 * Gerar o catálogo por introspecção do banco quebraria as duas pontas disso:
 * exporia coluna interna (e nomes que ninguém entende) e mudaria de forma a
 * cada migration, sem ninguém decidir.
 *
 * ## As entidades são as DESTE app
 *
 * Não são as sete do dossiê. São as fontes que o Loyola X já tem, com os
 * nomes que os dados realmente têm.
 */

export type PapelDoCampo = "metric" | "dimension";
export type TipoSemantico = "currency" | "number" | "percent" | "date" | "text";
export type Agregacao = "sum" | "avg" | "count" | "count_distinct" | "none";

export interface CampoDoCatalogo {
  /** `entidade.campo` — é a chave que o `querySpec` usa. */
  key: string;
  label: string;
  entity: EntidadeDoCatalogo;
  role: PapelDoCampo;
  semanticType: TipoSemantico;
  aggregation: Agregacao;
  dataType: "number" | "string" | "date";
  /** O que o número responde. Vira tooltip no editor. */
  description: string;
  /**
   * Métrica derivada de outras — o executor calcula depois de agregar, nunca
   * dentro do SUM. Média de razão não é razão de médias: somar CPLs diários e
   * dividir por N dá um número que não existe.
   */
  formula?: string;
  /**
   * A métrica é `null` sem denominador?
   *
   * Toda taxa é. Zero contamina média, ordenação e export — o dossiê marca
   * isso como regra não-negociável, e é a mesma que já vale no resto do app.
   */
  nullWhenEmpty?: boolean;
  /**
   * Família da métrica, quando existe mais de uma leitura do mesmo conceito.
   *
   * `geral` = sem atribuição por anúncio. `atribuido` = casado com o criativo.
   * O produto mantém as duas SEPARADAS de propósito; o rótulo precisa dizer
   * qual é, senão viram o mesmo número com dois valores.
   */
  familia?: "geral" | "atribuido";
}

export type EntidadeDoCatalogo =
  | "trafego"
  | "vendas"
  | "faturamento"
  | "produtos"
  | "leads"
  | "aplicacoes"
  | "grupos";

export interface DescricaoDeEntidade {
  key: EntidadeDoCatalogo;
  label: string;
  /** De onde os dados saem — muda o caminho do executor. */
  fonte: "banco" | "planilha";
  descricao: string;
}

export const ENTIDADES: DescricaoDeEntidade[] = [
  {
    key: "trafego",
    label: "Tráfego pago",
    fonte: "banco",
    descricao: "Gasto e desempenho de anúncio, por dia · campanha · conjunto · criativo",
  },
  {
    key: "vendas",
    label: "Vendas (lançadas)",
    fonte: "banco",
    // A procedência vai no rótulo, não só na descrição. Medido em 2026-09-01,
    // 90 dias, todos os projetos: 17 transações e R$ 311.875 — que é o total
    // CERTO desta fonte e uma fração da operação. O faturamento da Kiwify e da
    // Hotmart não existe linha a linha no banco (só agregado por produto em
    // `kiwify_cache`), então não há como somá-lo aqui. Um número chamado
    // "Vendas" sem essa ressalva mente por omissão.
    descricao:
      "APENAS o que foi lançado à mão no Kanban comercial — 25 registros em toda a história, e quase nada do que a operação vende passa por aqui. Para faturamento, receita, ticket ou volume de venda use `faturamento`; para QUAL produto vendeu use `produtos`. Praticamente nenhuma pergunta é respondida por esta entidade",
  },
  {
    key: "faturamento",
    label: "Faturamento",
    fonte: "banco",
    // Esta é a fonte que bate com o dashboard de funil. Medido em 2026-09-01,
    // 90 dias, todos os projetos: R$ 977.626,80 e 2.656 compradores — contra
    // as 17 transações que a entidade `vendas` mostrava para o mesmo recorte.
    descricao:
      "O que as planilhas de venda registraram, por dia · funil · etapa. É a mesma fonte do dashboard de funil — use esta para faturamento e volume de compradores",
  },
  {
    key: "produtos",
    label: "Produtos vendidos",
    fonte: "banco",
    // A quebra que faltava: `faturamento` sabe quanto entrou por funil e por
    // dia, e não sabe DE QUE produto. Quem pergunta "as vendas dos workshops"
    // está pedindo isto — e antes a IA tentava achar "workshop" num nome de
    // funil, que nunca casava.
    descricao:
      "O que cada PRODUTO vendeu, por dia · funil · etapa. Conta LINHA de venda (dois order bumps do mesmo cliente são duas linhas), então o total daqui pode passar do número de compradores de `faturamento` — para volume de compradores use `faturamento`, para saber QUAL produto vendeu use esta",
  },
  {
    key: "leads",
    label: "Leads captados",
    fonte: "banco",
    // A entidade que faltava: `aplicacoes` lê as planilhas do tipo APLICAÇÕES
    // (o formulário comercial), e a captação mora em planilha do tipo LEADS,
    // que o BI não enxergava. "A origem dos leads de 01/10" voltava vazio com a
    // planilha conectada e cheia.
    descricao:
      "Quantos leads se cadastraram, por dia · CANAL · origem · funil · etapa. É AQUI que mora a origem do lead (Meta Ads, Instagram, ManyChat, WhatsApp, YouTube, Closer, Sem Track) — use esta para qualquer pergunta sobre de onde veio quem se cadastrou. Conta CADASTRO, não pessoa única",
  },
  {
    key: "aplicacoes",
    label: "Aplicações",
    fonte: "planilha",
    descricao:
      "Respostas do formulário de APLICAÇÃO comercial — lidas ao vivo da planilha. Não é a captação de lead: para quantos leads entraram e de que canal, use `leads`",
  },
  {
    key: "grupos",
    label: "Grupos de WhatsApp",
    fonte: "banco",
    descricao: "Participantes, entradas e saídas dos grupos da campanha",
  },
];

/**
 * O catálogo.
 *
 * Só entra aqui o que o executor sabe traduzir hoje. Métrica sem tradução é
 * promessa quebrada na tela — pior que ausência, porque a pessoa monta o
 * widget e ele volta vazio sem dizer por quê.
 */
export const CAMPOS: CampoDoCatalogo[] = [
  // ---------- trafego: dimensões ----------
  {
    key: "trafego.date",
    label: "Data",
    entity: "trafego",
    role: "dimension",
    semanticType: "date",
    aggregation: "none",
    dataType: "date",
    description: "Dia em que o investimento foi feito, no fuso de São Paulo",
  },
  {
    key: "trafego.campaign",
    label: "Campanha",
    entity: "trafego",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "Nome da campanha na Meta",
  },
  {
    key: "trafego.adset",
    label: "Conjunto",
    entity: "trafego",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "Nome do conjunto de anúncios (público)",
  },
  {
    key: "trafego.ad",
    label: "Criativo",
    entity: "trafego",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "Nome do anúncio, como está na Meta",
  },
  {
    key: "trafego.projeto",
    label: "Projeto",
    entity: "trafego",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description:
      "De qual projeto o dado veio. Só faz sentido quando o dashboard está no escopo de todos os projetos",
  },

  // ---------- trafego: métricas base ----------
  {
    key: "trafego.spend",
    label: "Investimento",
    entity: "trafego",
    role: "metric",
    semanticType: "currency",
    aggregation: "sum",
    dataType: "number",
    description: "Quanto foi gasto em mídia no período",
  },
  {
    key: "trafego.impressions",
    label: "Impressões",
    entity: "trafego",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description: "Quantas vezes o anúncio foi exibido",
  },
  {
    key: "trafego.clicks",
    label: "Cliques",
    entity: "trafego",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description: "Cliques totais, incluindo os que não vão para o link",
  },
  {
    key: "trafego.link_clicks",
    label: "Cliques no link",
    entity: "trafego",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description: "Só os cliques que levam ao link — é o denominador certo do Connect Rate",
  },
  {
    key: "trafego.lp_views",
    label: "Visualizações da página",
    entity: "trafego",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description: "Quantas vezes a landing page carregou depois do clique",
  },
  {
    key: "trafego.reach",
    label: "Alcance",
    entity: "trafego",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description: "Pessoas distintas alcançadas (não somável entre períodos)",
  },

  // ---------- trafego: derivadas ----------
  {
    key: "trafego.cpm",
    label: "CPM",
    entity: "trafego",
    role: "metric",
    semanticType: "currency",
    aggregation: "none",
    dataType: "number",
    formula: "spend / impressions * 1000",
    nullWhenEmpty: true,
    description: "Custo por mil impressões",
  },
  {
    key: "trafego.cpc",
    label: "CPC (link)",
    entity: "trafego",
    role: "metric",
    semanticType: "currency",
    aggregation: "none",
    dataType: "number",
    formula: "spend / link_clicks",
    nullWhenEmpty: true,
    description: "Custo por clique no link",
  },
  {
    key: "trafego.ctr",
    label: "CTR (link)",
    entity: "trafego",
    role: "metric",
    semanticType: "percent",
    aggregation: "none",
    dataType: "number",
    formula: "link_clicks / impressions",
    nullWhenEmpty: true,
    description: "Cliques no link sobre impressões",
  },
  {
    key: "trafego.connect_rate",
    label: "Connect Rate",
    entity: "trafego",
    role: "metric",
    semanticType: "percent",
    aggregation: "none",
    dataType: "number",
    formula: "lp_views / link_clicks",
    nullWhenEmpty: true,
    description:
      "Quantos dos que clicaram chegaram a ver a página. O denominador é o clique no LINK, não o clique total",
  },

  // ---------- vendas ----------
  {
    key: "vendas.date",
    label: "Data da venda",
    entity: "vendas",
    role: "dimension",
    semanticType: "date",
    aggregation: "none",
    dataType: "date",
    description: "Dia em que a venda foi registrada",
  },
  {
    key: "vendas.produto",
    label: "Produto",
    entity: "vendas",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "Qual produto foi vendido na transação",
  },
  {
    key: "vendas.projeto",
    label: "Projeto",
    entity: "vendas",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description:
      "De qual projeto o dado veio. Só faz sentido quando o dashboard está no escopo de todos os projetos",
  },
  {
    key: "vendas.count",
    label: "Vendas lançadas",
    entity: "vendas",
    role: "metric",
    semanticType: "number",
    aggregation: "count",
    dataType: "number",
    description:
      "Quantidade de transações lançadas. Não conta venda que só existe na Kiwify/Hotmart",
  },
  {
    key: "vendas.revenue",
    label: "Receita lançada",
    entity: "vendas",
    role: "metric",
    semanticType: "currency",
    aggregation: "sum",
    dataType: "number",
    description:
      "Soma do valor das vendas lançadas. Não é o faturamento total: o que foi vendido direto na plataforma e não foi lançado fica de fora",
  },
  {
    key: "vendas.ticket_por_venda",
    label: "Ticket médio (por venda)",
    entity: "vendas",
    role: "metric",
    semanticType: "currency",
    aggregation: "none",
    dataType: "number",
    formula: "revenue / count",
    nullWhenEmpty: true,
    // O denominador está NO NOME de propósito: ticket por venda e ticket por
    // cliente são números diferentes, e a confusão entre eles é silenciosa.
    description: "Receita dividida pelo número de transações — não por cliente",
  },

  // ---------- aplicações ----------
  {
    key: "aplicacoes.date",
    label: "Data da aplicação",
    entity: "aplicacoes",
    role: "dimension",
    semanticType: "date",
    aggregation: "none",
    dataType: "date",
    description: "Dia em que a pessoa preencheu o formulário",
  },
  {
    key: "aplicacoes.origem",
    label: "Origem",
    entity: "aplicacoes",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "De qual canal a pessoa veio (utm_source, já com as regras de origem aplicadas)",
  },
  {
    key: "aplicacoes.projeto",
    label: "Projeto",
    entity: "aplicacoes",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description:
      "De qual projeto o dado veio. Só faz sentido quando o dashboard está no escopo de todos os projetos",
  },
  {
    key: "aplicacoes.count",
    label: "Aplicações",
    entity: "aplicacoes",
    role: "metric",
    semanticType: "number",
    aggregation: "count",
    dataType: "number",
    description: "Quantidade de respostas de formulário",
  },

  // ---------- faturamento ----------
  {
    key: "faturamento.date",
    label: "Data",
    entity: "faturamento",
    role: "dimension",
    semanticType: "date",
    aggregation: "none",
    dataType: "date",
    description: "Dia da venda, já no fuso de São Paulo",
  },
  {
    key: "faturamento.funil",
    label: "Funil",
    entity: "faturamento",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "Nome do funil — o recorte que o time usa para falar de campanha",
  },
  {
    key: "faturamento.etapa",
    label: "Etapa",
    entity: "faturamento",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "Etapa do funil de onde a venda veio",
  },
  {
    key: "faturamento.projeto",
    label: "Projeto",
    entity: "faturamento",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description:
      "De qual projeto o dado veio. Só faz sentido quando o dashboard está no escopo de todos os projetos",
  },
  {
    key: "leads.date",
    label: "Data",
    entity: "leads",
    role: "dimension",
    semanticType: "date",
    aggregation: "none",
    dataType: "string",
    description: "Dia em que o lead se cadastrou, pela data da própria planilha",
  },
  {
    key: "leads.canal",
    label: "Canal",
    entity: "leads",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description:
      "Canal NOMEADO de onde o lead veio: Meta Ads, Google Ads, Instagram, ManyChat, WhatsApp, E-mail, YouTube, Closer, Outros ou Sem Track",
  },
  {
    key: "leads.origem",
    label: "Origem",
    entity: "leads",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "O balde grosso do canal: Pago, Orgânico ou Sem Track",
  },
  {
    key: "leads.funil",
    label: "Funil",
    entity: "leads",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "Funil em que o lead se cadastrou",
  },
  {
    key: "leads.etapa",
    label: "Etapa",
    entity: "leads",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "Etapa do funil em que o lead se cadastrou",
  },
  {
    key: "leads.projeto",
    label: "Projeto",
    entity: "leads",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "De qual projeto o dado veio. Só faz sentido no escopo de todos os projetos",
  },
  {
    key: "leads.count",
    label: "Leads",
    entity: "leads",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description:
      "Quantos CADASTROS entraram. Não é pessoa única: quem se cadastra em dois dias conta duas vezes",
  },
  {
    key: "produtos.date",
    label: "Data",
    entity: "produtos",
    role: "dimension",
    semanticType: "date",
    aggregation: "none",
    dataType: "string",
    description: "Dia em que a venda do produto foi registrada pela plataforma",
  },
  {
    key: "produtos.produto",
    label: "Produto",
    entity: "produtos",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "Nome do produto como a plataforma de pagamento registrou",
  },
  {
    key: "produtos.funil",
    label: "Funil",
    entity: "produtos",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "Funil em que a venda do produto aconteceu",
  },
  {
    key: "produtos.etapa",
    label: "Etapa",
    entity: "produtos",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "Etapa do funil em que a venda do produto aconteceu",
  },
  {
    key: "produtos.projeto",
    label: "Projeto",
    entity: "produtos",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description: "De qual projeto o dado veio. Só faz sentido no escopo de todos os projetos",
  },
  {
    key: "produtos.bruto",
    label: "Faturamento do produto",
    entity: "produtos",
    role: "metric",
    semanticType: "currency",
    aggregation: "sum",
    dataType: "number",
    description: "Faturamento bruto das linhas desse produto",
  },
  {
    key: "produtos.liquido",
    label: "Líquido do produto",
    entity: "produtos",
    role: "metric",
    semanticType: "currency",
    aggregation: "sum",
    dataType: "number",
    description: "O que sobrou depois das deduções da plataforma",
  },
  {
    key: "produtos.vendas",
    label: "Linhas de venda",
    entity: "produtos",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description:
      "Quantas LINHAS de venda o produto teve. Não é o mesmo que comprador: um cliente que levou dois produtos conta duas vezes",
  },
  {
    key: "faturamento.bruto",
    label: "Faturamento bruto",
    entity: "faturamento",
    role: "metric",
    semanticType: "currency",
    aggregation: "sum",
    dataType: "number",
    description: "Faturamento antes de taxa e reembolso — é o número que o dashboard de funil mostra",
  },
  {
    key: "faturamento.liquido",
    label: "Faturamento líquido",
    entity: "faturamento",
    role: "metric",
    semanticType: "currency",
    aggregation: "sum",
    dataType: "number",
    description: "O que sobrou depois das deduções da plataforma",
  },
  {
    key: "faturamento.compradores",
    label: "Compradores",
    entity: "faturamento",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description: "Quantidade de compras no dia. Use esta, não `vendas.count`, para volume de venda",
  },
  {
    key: "faturamento.pagos",
    label: "Compradores de tráfego pago",
    entity: "faturamento",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description: "Compras atribuídas a anúncio",
  },
  {
    key: "faturamento.organicos",
    label: "Compradores orgânicos",
    entity: "faturamento",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description: "Compras sem origem paga",
  },
  {
    key: "faturamento.ticket",
    label: "Ticket médio",
    entity: "faturamento",
    role: "metric",
    semanticType: "currency",
    aggregation: "none",
    dataType: "number",
    formula: "faturamento.bruto / faturamento.compradores",
    nullWhenEmpty: true,
    description: "Faturamento bruto dividido pelo número de compras",
  },

  // ---------- grupos ----------
  {
    key: "grupos.date",
    label: "Data",
    entity: "grupos",
    role: "dimension",
    semanticType: "date",
    aggregation: "none",
    dataType: "date",
    description: "Dia do retrato dos grupos",
  },
  {
    key: "grupos.projeto",
    label: "Projeto",
    entity: "grupos",
    role: "dimension",
    semanticType: "text",
    aggregation: "none",
    dataType: "string",
    description:
      "De qual projeto o dado veio. Só faz sentido quando o dashboard está no escopo de todos os projetos",
  },
  {
    key: "grupos.participantes",
    label: "Participantes",
    entity: "grupos",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description: "Pessoas nos grupos no fim do dia",
  },
  {
    key: "grupos.entradas",
    label: "Entradas",
    entity: "grupos",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description: "Quantas entraram nos grupos no dia",
  },
  {
    key: "grupos.saidas",
    label: "Saídas",
    entity: "grupos",
    role: "metric",
    semanticType: "number",
    aggregation: "sum",
    dataType: "number",
    description: "Quantas saíram dos grupos no dia",
  },

  // ---------- cruzadas: as duas famílias ----------
  //
  // CPL e CPA existem em duas leituras que o produto mantém separadas: a
  // GERAL divide o gasto total pelo total do período (sem saber de qual
  // anúncio veio o lead); a ATRIBUÍDA só conta o que casou com o criativo.
  // Elas dão números diferentes de propósito, e unificá-las esconde a
  // diferença entre "o funil todo" e "o que a mídia trouxe".
  {
    key: "trafego.cpl_geral",
    label: "CPL (Geral)",
    entity: "trafego",
    role: "metric",
    semanticType: "currency",
    aggregation: "none",
    dataType: "number",
    formula: "trafego.spend / aplicacoes.count",
    nullWhenEmpty: true,
    familia: "geral",
    description: "Investimento total dividido por TODAS as aplicações, atribuídas ou não",
  },
  {
    key: "trafego.cpl_atribuido",
    label: "CPL (Atribuído)",
    entity: "trafego",
    role: "metric",
    semanticType: "currency",
    aggregation: "none",
    dataType: "number",
    formula: "trafego.spend / aplicacoes_atribuidas",
    nullWhenEmpty: true,
    familia: "atribuido",
    description: "Investimento dividido só pelas aplicações que casaram com um anúncio",
  },
   {
    key: "faturamento.investimento",
    label: "Investimento",
    entity: "faturamento",
    role: "metric",
    semanticType: "currency",
    aggregation: "sum",
    dataType: "number",
    description: "Quanto foi gasto em mídia no mesmo recorte — vem do tráfego",
  },
  {
    key: "faturamento.roas",
    label: "ROAS",
    entity: "faturamento",
    role: "metric",
    semanticType: "number",
    aggregation: "none",
    dataType: "number",
    formula: "faturamento.bruto / faturamento.investimento",
    nullWhenEmpty: true,
    description:
      "Faturamento bruto sobre investimento em mídia. Só por dia, por projeto ou no total: o tráfego não sabe de funil nem de etapa",
  },
  {
    key: "faturamento.cac",
    label: "CAC",
    entity: "faturamento",
    role: "metric",
    semanticType: "currency",
    aggregation: "none",
    dataType: "number",
    formula: "faturamento.investimento / faturamento.compradores",
    nullWhenEmpty: true,
    description: "Custo por comprador: investimento dividido pelo número de compras",
  },
];

/** Índice por chave — o executor consulta por aqui, nunca varrendo o array. */
export const CAMPO_POR_CHAVE = new Map(CAMPOS.map((c) => [c.key, c]));

export function campo(key: string): CampoDoCatalogo | null {
  return CAMPO_POR_CHAVE.get(key) ?? null;
}

export function metricasDa(entidade: EntidadeDoCatalogo): CampoDoCatalogo[] {
  return CAMPOS.filter((c) => c.entity === entidade && c.role === "metric");
}

export function dimensoesDa(entidade: EntidadeDoCatalogo): CampoDoCatalogo[] {
  return CAMPOS.filter((c) => c.entity === entidade && c.role === "dimension");
}

/** A resposta do endpoint — separada por papel, que é como o editor consome. */
export function catalogoParaApi() {
  return {
    entities: ENTIDADES,
    metrics: CAMPOS.filter((c) => c.role === "metric"),
    dimensions: CAMPOS.filter((c) => c.role === "dimension"),
  };
}
