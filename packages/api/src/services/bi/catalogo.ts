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

export type EntidadeDoCatalogo = "trafego" | "vendas" | "aplicacoes" | "grupos";

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
    label: "Vendas",
    fonte: "banco",
    descricao: "Transações registradas manualmente e pelas planilhas de venda",
  },
  {
    key: "aplicacoes",
    label: "Aplicações",
    fonte: "planilha",
    descricao: "Respostas de formulário de captação — lidas ao vivo da planilha",
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
    label: "Vendas",
    entity: "vendas",
    role: "metric",
    semanticType: "number",
    aggregation: "count",
    dataType: "number",
    description: "Quantidade de transações",
  },
  {
    key: "vendas.revenue",
    label: "Receita",
    entity: "vendas",
    role: "metric",
    semanticType: "currency",
    aggregation: "sum",
    dataType: "number",
    description: "Soma do valor das vendas",
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
    key: "vendas.roas_geral",
    label: "ROAS (Geral)",
    entity: "vendas",
    role: "metric",
    semanticType: "number",
    aggregation: "none",
    dataType: "number",
    formula: "vendas.revenue / trafego.spend",
    nullWhenEmpty: true,
    familia: "geral",
    description: "Receita total sobre investimento total — sem atribuição por anúncio",
  },
  {
    key: "vendas.roas_atribuido",
    label: "ROAS (Atribuído)",
    entity: "vendas",
    role: "metric",
    semanticType: "number",
    aggregation: "none",
    dataType: "number",
    formula: "receita_atribuida / trafego.spend",
    nullWhenEmpty: true,
    familia: "atribuido",
    description: "Só a receita que casou com um anúncio, sobre o investimento",
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
