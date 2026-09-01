/**
 * Os widgets prontos.
 *
 * A regra do dossiê que mais importa neste épico: *"comece pelos presets, não
 * pelo editor — tela em branco + DSL é inutilizável; catálogo nomeado é usável
 * no dia um."*
 *
 * Não são os 46 do VK. São os que respondem as perguntas **deste** app, e cada
 * um é um `querySpec` já montado. O período fica de fora de propósito: quem
 * injeta é o dashboard, na inserção e a cada troca de filtro.
 */

import { CAMPO_DE_DATA, querySpecSchema, type QuerySpec } from "./query.js";
import { campo } from "./catalogo.js";
import { PADRAO_POR_TIPO, type TipoDeWidget } from "./dashboard.js";

export interface Preset {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  tipo: TipoDeWidget;
  /** O spec SEM filtro de data — o período entra na inserção. */
  spec: Omit<QuerySpec, "filters"> & { filters?: QuerySpec["filters"] };
  opcoes?: Record<string, unknown>;
  /**
   * Por que o preset ainda não pode ser inserido, quando for o caso.
   *
   * Existe para o preset APARECER desabilitado com o motivo, em vez de sumir da
   * galeria ou — pior — inserir um widget que erra toda vez que carrega.
   */
  bloqueado?: string;
}

const AGUARDANDO_ATRIBUICAO =
  "Depende do cruzamento entre lead e criativo, que ainda não tem tradução no executor.";

function spec(
  entity: QuerySpec["entity"],
  metrics: string[],
  dimensions: string[] = [],
  extra: Partial<QuerySpec> = {},
): Preset["spec"] {
  return {
    entity,
    metrics,
    dimensions,
    order_by: extra.order_by ?? [],
    limit: extra.limit ?? 500,
    date_granularity: extra.date_granularity ?? "day",
  };
}

export const PRESETS: Preset[] = [
  // ---------- Tráfego pago ----------
  {
    id: "investimento_periodo",
    nome: "Investimento no período",
    descricao: "Quanto foi gasto em mídia paga no recorte selecionado",
    categoria: "Tráfego pago",
    tipo: "kpi",
    spec: spec("trafego", ["trafego.spend"]),
  },
  {
    id: "alcance_e_impressoes",
    nome: "Impressões e alcance",
    descricao: "Quantas vezes o anúncio apareceu e para quantas pessoas",
    categoria: "Tráfego pago",
    tipo: "kpi",
    spec: spec("trafego", ["trafego.impressions", "trafego.reach"]),
  },
  {
    id: "cliques_no_link",
    nome: "Cliques no link",
    descricao: "Cliques que levaram à página, sem contar curtida e comentário",
    categoria: "Tráfego pago",
    tipo: "kpi",
    spec: spec("trafego", ["trafego.link_clicks", "trafego.cpc"]),
  },
  {
    id: "cpm_e_ctr",
    nome: "CPM e CTR",
    descricao: "Custo por mil impressões e taxa de clique no período",
    categoria: "Tráfego pago",
    tipo: "kpi",
    spec: spec("trafego", ["trafego.cpm", "trafego.ctr"]),
  },
  {
    id: "connect_rate",
    nome: "Connect rate",
    descricao: "Quantos dos que clicaram chegaram a ver a página",
    categoria: "Tráfego pago",
    tipo: "kpi",
    spec: spec("trafego", ["trafego.connect_rate"]),
  },
  {
    id: "investimento_por_dia",
    nome: "Investimento por dia",
    descricao: "A curva de gasto ao longo do período",
    categoria: "Tráfego pago",
    tipo: "linha",
    spec: spec("trafego", ["trafego.spend"], ["trafego.date"], {
      order_by: [{ field: "trafego.date", direction: "asc" }],
    }),
  },
  {
    id: "cpm_por_dia",
    nome: "CPM por dia",
    descricao: "Como o custo de mídia se move ao longo do período",
    categoria: "Tráfego pago",
    tipo: "linha",
    spec: spec("trafego", ["trafego.cpm"], ["trafego.date"], {
      order_by: [{ field: "trafego.date", direction: "asc" }],
    }),
  },
  {
    id: "investimento_por_campanha",
    nome: "Investimento por campanha",
    descricao: "Para onde o dinheiro foi, campanha a campanha",
    categoria: "Tráfego pago",
    tipo: "barra",
    spec: spec("trafego", ["trafego.spend"], ["trafego.campaign"], {
      order_by: [{ field: "trafego.spend", direction: "desc" }],
      limit: 20,
    }),
  },
  {
    id: "top_criativos_por_gasto",
    nome: "Top criativos por gasto",
    descricao: "Os anúncios que mais consumiram verba, com entrega e custo",
    categoria: "Tráfego pago",
    tipo: "tabela",
    spec: spec(
      "trafego",
      ["trafego.spend", "trafego.impressions", "trafego.link_clicks", "trafego.cpc"],
      ["trafego.ad"],
      { order_by: [{ field: "trafego.spend", direction: "desc" }], limit: 50 },
    ),
  },
  {
    id: "investimento_por_conjunto",
    nome: "Investimento por conjunto",
    descricao: "O gasto por conjunto de anúncios, para ver a segmentação",
    categoria: "Tráfego pago",
    tipo: "barra",
    spec: spec("trafego", ["trafego.spend"], ["trafego.adset"], {
      order_by: [{ field: "trafego.spend", direction: "desc" }],
      limit: 20,
    }),
  },

  // ---------- Vendas ----------
  {
    id: "vendas_e_receita",
    nome: "Vendas e receita",
    descricao: "Quantas compras e quanto entrou no período",
    categoria: "Vendas",
    tipo: "kpi",
    // `faturamento` e não `vendas`: aquela conta só o lançamento manual, que
    // tem 25 linhas em toda a história. Este preset é o mais usado do painel e
    // vinha mostrando uma fração do que a operação vendeu.
    spec: spec("faturamento", ["faturamento.compradores", "faturamento.bruto"]),
  },
  {
    id: "ticket_medio",
    nome: "Ticket médio (por venda)",
    descricao: "Receita dividida pelo número de transações — não por cliente",
    categoria: "Vendas",
    tipo: "kpi",
    spec: spec("faturamento", ["faturamento.ticket"]),
  },
  {
    id: "receita_por_dia",
    nome: "Receita por dia",
    descricao: "A curva de faturamento ao longo do período",
    categoria: "Vendas",
    tipo: "linha",
    spec: spec("faturamento", ["faturamento.bruto"], ["faturamento.date"], {
      order_by: [{ field: "faturamento.date", direction: "asc" }],
    }),
  },
  {
    id: "receita_por_produto",
    nome: "Receita por produto (lançadas)",
    // Fica em `vendas` porque o agregado diário das planilhas não guarda
    // produto — só data, faturamento e contagem. O rótulo diz de onde vem para
    // ninguém somar este gráfico com o faturamento total e estranhar.
    descricao: "Quanto cada produto representou, entre as vendas lançadas à mão",
    categoria: "Vendas",
    tipo: "pizza",
    spec: spec("vendas", ["vendas.revenue"], ["vendas.produto"], {
      order_by: [{ field: "vendas.revenue", direction: "desc" }],
      limit: 12,
    }),
  },
  {
    id: "vendas_por_produto",
    nome: "Vendas por produto (lançadas)",
    descricao: "Quantas transações de cada produto, entre as lançadas à mão",
    categoria: "Vendas",
    tipo: "barra",
    spec: spec("vendas", ["vendas.count"], ["vendas.produto"], {
      order_by: [{ field: "vendas.count", direction: "desc" }],
      limit: 12,
    }),
  },

  // ---------- Grupos ----------
  {
    id: "participantes_nos_grupos",
    nome: "Participantes nos grupos",
    descricao: "Quantas pessoas estão nos grupos no fim do dia",
    categoria: "Grupos de WhatsApp",
    tipo: "kpi",
    spec: spec("grupos", ["grupos.participantes"]),
  },
  {
    id: "participantes_por_dia",
    nome: "Participantes por dia",
    descricao: "Como o tamanho dos grupos evoluiu no período",
    categoria: "Grupos de WhatsApp",
    tipo: "linha",
    spec: spec("grupos", ["grupos.participantes"], ["grupos.date"], {
      order_by: [{ field: "grupos.date", direction: "asc" }],
    }),
  },
  {
    id: "entradas_e_saidas",
    nome: "Entradas e saídas",
    descricao: "Quem entrou e quem saiu, dia a dia",
    categoria: "Grupos de WhatsApp",
    tipo: "barra",
    spec: spec("grupos", ["grupos.entradas", "grupos.saidas"], ["grupos.date"], {
      order_by: [{ field: "grupos.date", direction: "asc" }],
    }),
  },

  // ---------- Consolidado: só fazem sentido no escopo de todos os projetos ----------
  {
    id: "investimento_por_projeto",
    nome: "Investimento por projeto",
    descricao: "Quanto cada projeto consumiu de mídia no período",
    categoria: "Consolidado",
    tipo: "barra",
    spec: spec("trafego", ["trafego.spend"], ["trafego.projeto"], {
      order_by: [{ field: "trafego.spend", direction: "desc" }],
      limit: 30,
    }),
  },
  {
    id: "receita_por_projeto",
    nome: "Receita por projeto",
    descricao: "Quanto cada projeto faturou no período",
    categoria: "Consolidado",
    tipo: "barra",
    spec: spec("faturamento", ["faturamento.bruto", "faturamento.compradores"], ["faturamento.projeto"], {
      order_by: [{ field: "faturamento.bruto", direction: "desc" }],
      limit: 30,
    }),
  },
  {
    id: "aplicacoes_por_projeto",
    nome: "Aplicações por projeto",
    descricao: "Quantas pessoas se aplicaram em cada projeto",
    categoria: "Consolidado",
    tipo: "barra",
    spec: spec("aplicacoes", ["aplicacoes.count"], ["aplicacoes.projeto"], {
      order_by: [{ field: "aplicacoes.count", direction: "desc" }],
      limit: 30,
    }),
  },
  {
    id: "participantes_por_projeto",
    nome: "Participantes por projeto",
    descricao: "O tamanho dos grupos de cada projeto",
    categoria: "Consolidado",
    tipo: "barra",
    spec: spec("grupos", ["grupos.participantes"], ["grupos.projeto"], {
      order_by: [{ field: "grupos.participantes", direction: "desc" }],
      limit: 30,
    }),
  },

  // ---------- Ainda bloqueados, e o motivo aparece na galeria ----------
  {
    id: "aplicacoes_periodo",
    nome: "Aplicações no período",
    descricao: "Quantas pessoas preencheram o formulário",
    categoria: "Aplicações",
    tipo: "kpi",
    spec: spec("aplicacoes", ["aplicacoes.count"]),
  },
  {
    id: "origem_das_aplicacoes",
    nome: "Origem das aplicações",
    descricao: "De qual canal vieram as pessoas que se aplicaram",
    categoria: "Aplicações",
    tipo: "pizza",
    spec: spec("aplicacoes", ["aplicacoes.count"], ["aplicacoes.origem"], {
      order_by: [{ field: "aplicacoes.count", direction: "desc" }],
      limit: 12,
    }),
  },
  {
    id: "cpl_geral",
    nome: "CPL (Geral)",
    descricao: "Gasto total dividido por todos os leads do período",
    categoria: "Aplicações",
    tipo: "kpi",
    spec: spec("trafego", ["trafego.cpl_geral"]),
    bloqueado: AGUARDANDO_ATRIBUICAO,
  },
  {
    id: "roas_geral",
    nome: "ROAS do período",
    descricao: "Faturamento bruto dividido pelo investimento em mídia",
    categoria: "Vendas",
    tipo: "kpi",
    // Deixou de ser bloqueado: o executor passou a cruzar faturamento com
    // tráfego. Antes apontava para `vendas.roas_geral`, que somava só o
    // lançamento manual (25 linhas em toda a história) e nunca calculava.
    spec: spec("faturamento", ["faturamento.roas"]),
  },
  {
    id: "roas_por_projeto",
    nome: "ROAS por projeto",
    descricao: "Onde o dinheiro rende mais, no escopo consolidado",
    categoria: "Vendas",
    tipo: "barra",
    spec: spec("faturamento", ["faturamento.roas"], ["faturamento.projeto"]),
  },
  {
    id: "cac_por_projeto",
    nome: "CAC por projeto",
    descricao: "Quanto custa cada comprador",
    categoria: "Vendas",
    tipo: "barra",
    spec: spec("faturamento", ["faturamento.cac"], ["faturamento.projeto"]),
  },
];

/** O preset pelo id, ou `null`. */
export function preset(id: string): Preset | null {
  return PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * Injeta o período no spec.
 *
 * O preset guarda o spec **sem** data porque "últimos 30 dias" precisa
 * significar coisas diferentes em agosto e em setembro. O período entra aqui, na
 * inserção e a cada troca de filtro do dashboard.
 */
export function comPeriodo(
  base: Preset["spec"],
  periodo: { start: string; end: string },
): QuerySpec {
  const chave = CAMPO_DE_DATA[base.entity];
  return querySpecSchema.parse({
    ...base,
    filters: {
      ...(base.filters ?? {}),
      [chave]: { operator: "$between", value: [periodo.start, periodo.end] },
    },
  });
}

/** O preset como a galeria precisa: com rótulos do catálogo já resolvidos. */
export function presetsParaApi() {
  return PRESETS.map((p) => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    categoria: p.categoria,
    tipo: p.tipo,
    entity: p.spec.entity,
    metricas: p.spec.metrics.map((k) => campo(k)?.label ?? k),
    dimensoes: p.spec.dimensions.map((k) => campo(k)?.label ?? k),
    tamanho: PADRAO_POR_TIPO[p.tipo],
    bloqueado: p.bloqueado ?? null,
  }));
}
