/**
 * O executor de `querySpec` — traduz consulta declarativa em SQL.
 *
 * ## As quatro garantias
 *
 * 1. **Nada de string concatenada.** Chave do catálogo vira expressão por um
 *    mapa fechado; valores entram como parâmetro do Drizzle. Chave desconhecida
 *    é erro de validação, nunca SQL.
 * 2. **Toda query precisa de filtro de data.** É o que impede varredura de
 *    tabela — só a de tráfego já tem quase 15 mil linhas e cresce todo dia.
 * 3. **Derivada calcula DEPOIS de agregar.** CPM é `soma(gasto) / soma(impressões)`,
 *    nunca a média dos CPMs diários. As duas contas dão números diferentes, e a
 *    segunda não significa nada.
 * 4. **O dia é o dia de São Paulo.** Toda entidade guardada como `timestamptz`
 *    passa por `AT TIME ZONE 'America/Sao_Paulo'` antes de virar data — com o
 *    nome IANA, nunca `-03:00`, senão o horário de verão desloca o dia.
 */

import { z } from "zod";
import {
  and,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notIlike,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { funnelGroupSnapshots, manualSales, metaAdInsightsDaily } from "../../db/schema.js";
import { campo, type CampoDoCatalogo, type EntidadeDoCatalogo } from "./catalogo.js";

// ============================================================
// O contrato
// ============================================================

export const OPERADORES = [
  "$eq",
  "$neq",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$in",
  "$nin",
  "$like",
  "$ncontains",
  "$between",
  "$isnull",
  "$isnotnull",
] as const;

export const filtroSchema = z.object({
  operator: z.enum(OPERADORES),
  /** `$between` recebe par; `$in`/`$nin` recebem lista; `$isnull` não usa. */
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]).optional(),
});

/** Teto de linhas. Acima disto o pedido é CAPADO com aviso, não recusado. */
export const TETO_DE_LINHAS = 10_000;

export const querySpecSchema = z.object({
  entity: z.enum(["trafego", "vendas", "aplicacoes", "grupos"]),
  metrics: z.array(z.string()).min(1).max(20),
  dimensions: z.array(z.string()).max(5).default([]),
  filters: z.record(z.string(), filtroSchema).default({}),
  order_by: z
    .array(z.object({ field: z.string(), direction: z.enum(["asc", "desc"]).default("desc") }))
    .max(3)
    .default([]),
  limit: z.number().int().min(1).default(500),
  date_granularity: z.enum(["day", "week", "month"]).default("day"),
});

export type QuerySpec = z.infer<typeof querySpecSchema>;
export type Filtro = z.infer<typeof filtroSchema>;

export interface ResultadoDaQuery {
  columns: { key: string; label: string; semanticType: string }[];
  rows: Record<string, string | number | null>[];
  /** Aviso que não impede o resultado — limite capado, corte no topo. */
  avisos: string[];
}

export class ErroDeQuery extends Error {
  constructor(
    message: string,
    /** O campo que causou — a tela aponta para ele em vez de erro genérico. */
    public readonly campo?: string,
  ) {
    super(message);
    this.name = "ErroDeQuery";
  }
}

// ============================================================
// O fuso
// ============================================================

/**
 * O fuso do relatório, por nome IANA.
 *
 * Nome, nunca offset: `-03:00` está certo em agosto e errado em novembro se o
 * horário de verão voltar, e o erro aparece como venda no dia anterior — o tipo
 * de bug que ninguém encontra olhando o total do mês.
 */
export const FUSO = "America/Sao_Paulo";

/** Um `timestamptz` virando a data ISO do dia local. */
function diaLocal(coluna: PgColumn): SQL {
  return sql`to_char((${coluna} AT TIME ZONE ${FUSO})::date, 'YYYY-MM-DD')`;
}

/** Uma coluna qualquer, como expressão. */
function col(coluna: PgColumn): SQL {
  return sql`${coluna}`;
}

const soma = (c: PgColumn): SQL => sql`COALESCE(SUM(${c}), 0)`;

/**
 * Soma uma conversão que mora no JSONB `actions` da Meta.
 *
 * A Meta entrega conversão como lista de `{action_type, value}`, não como
 * coluna. A subconsulta escalar evita `jsonb_array_elements` no FROM, que
 * multiplicaria as linhas antes do GROUP BY e inflaria gasto e impressões.
 */
function somaDaAcao(tipo: string): SQL {
  return sql`COALESCE(SUM((
    SELECT (a->>'value')::numeric
      FROM jsonb_array_elements(${metaAdInsightsDaily.actions}) a
     WHERE a->>'action_type' = ${tipo}
     LIMIT 1
  )), 0)`;
}

// ============================================================
// As fontes
// ============================================================

/**
 * O que uma entidade precisa declarar para ser consultável.
 *
 * É a metade de execução da fronteira que o catálogo abre: o catálogo diz o que
 * existe (para o editor listar), a fonte diz o que sabemos buscar. Campo no
 * catálogo e fora daqui vira erro explicativo, nunca resultado vazio.
 */
interface Fonte {
  tabela: unknown;
  /** Prende a consulta ao projeto da sessão. Sem isto, um projeto lê o outro. */
  escopo: (projectId: string) => SQL;
  /** Dimensões e campos filtráveis → expressão. */
  campos: Record<string, SQL>;
  /** Métricas base → expressão JÁ agregada. */
  metricas: Record<string, SQL>;
  /** Métricas de razão, calculadas sobre os totais. */
  derivadas: Record<string, { de: string; por: string; fator?: number }>;
}

const FONTES: Partial<Record<EntidadeDoCatalogo, Fonte>> = {
  trafego: {
    tabela: metaAdInsightsDaily,
    escopo: (projectId) => eq(metaAdInsightsDaily.projectId, projectId),
    campos: {
      // `date_start` já vem como a data fechada da conta de anúncio (texto ISO),
      // sem hora — então aqui não há fuso a converter.
      "trafego.date": col(metaAdInsightsDaily.dateStart),
      "trafego.campaign": col(metaAdInsightsDaily.campaignName),
      "trafego.adset": col(metaAdInsightsDaily.adsetName),
      "trafego.ad": col(metaAdInsightsDaily.adName),
    },
    metricas: {
      "trafego.spend": soma(metaAdInsightsDaily.spend),
      "trafego.impressions": soma(metaAdInsightsDaily.impressions),
      "trafego.clicks": soma(metaAdInsightsDaily.clicks),
      "trafego.reach": soma(metaAdInsightsDaily.reach),
      "trafego.link_clicks": somaDaAcao("link_click"),
      "trafego.lp_views": somaDaAcao("landing_page_view"),
    },
    derivadas: {
      "trafego.cpm": { de: "trafego.spend", por: "trafego.impressions", fator: 1000 },
      "trafego.cpc": { de: "trafego.spend", por: "trafego.link_clicks" },
      "trafego.ctr": { de: "trafego.link_clicks", por: "trafego.impressions" },
      "trafego.connect_rate": { de: "trafego.lp_views", por: "trafego.link_clicks" },
    },
  },

  vendas: {
    tabela: manualSales,
    // A venda pertence à etapa, a etapa ao funil e o funil ao projeto. A
    // subconsulta percorre o caminho inteiro, parametrizada.
    escopo: (projectId) => sql`${manualSales.stageId} IN (
      SELECT fs.id FROM funnel_stages fs
        JOIN funnels f ON f.id = fs.funnel_id
       WHERE f.project_id = ${projectId}
    )`,
    campos: {
      "vendas.date": diaLocal(manualSales.saleDate),
      "vendas.produto": col(manualSales.product),
    },
    metricas: {
      "vendas.count": sql`COUNT(*)`,
      "vendas.revenue": soma(manualSales.value),
    },
    derivadas: {
      "vendas.ticket_por_venda": { de: "vendas.revenue", por: "vendas.count" },
    },
  },

  grupos: {
    tabela: funnelGroupSnapshots,
    escopo: (projectId) => sql`${funnelGroupSnapshots.funnelId} IN (
      SELECT id FROM funnels WHERE project_id = ${projectId}
    )`,
    campos: {
      "grupos.date": diaLocal(funnelGroupSnapshots.snapshotAt),
    },
    metricas: {
      "grupos.participantes": soma(funnelGroupSnapshots.participantsAmount),
      "grupos.entradas": soma(funnelGroupSnapshots.inputAmount),
      "grupos.saidas": soma(funnelGroupSnapshots.outputAmount),
    },
    derivadas: {},
  },
};

/** Como a entidade aparece na mensagem de erro — nome de tela, não chave. */
const ROTULO_DA_ENTIDADE: Record<EntidadeDoCatalogo, string> = {
  trafego: "Tráfego pago",
  vendas: "Vendas",
  aplicacoes: "Aplicações",
  grupos: "Grupos de WhatsApp",
};

/** A dimensão de data da entidade — é nela que o filtro obrigatório incide. */
const CAMPO_DE_DATA: Record<EntidadeDoCatalogo, string> = {
  trafego: "trafego.date",
  vendas: "vendas.date",
  aplicacoes: "aplicacoes.date",
  grupos: "grupos.date",
};

// ============================================================
// Filtros
// ============================================================

function listaDe(v: Filtro["value"], op: string): (string | number)[] {
  if (!Array.isArray(v)) throw new ErroDeQuery(`O operador ${op} espera uma lista de valores.`);
  if (v.length === 0) throw new ErroDeQuery(`O operador ${op} recebeu uma lista vazia.`);
  return v;
}

function escalarDe(v: Filtro["value"], op: string): string | number {
  if (v === undefined || Array.isArray(v)) {
    throw new ErroDeQuery(`O operador ${op} espera um valor único.`);
  }
  return v;
}

/**
 * Traduz um filtro para condição SQL.
 *
 * Todo valor entra como PARÂMETRO — inclusive o do `$ncontains`, cujo padrão é
 * montado em JS e passado pronto ao driver. Concatenar aqui seria o ponto exato
 * onde uma consulta montada na tela viraria SQL arbitrário.
 */
export function condicao(expressao: SQL, filtro: Filtro, chave: string): SQL {
  const e = expressao as never;
  switch (filtro.operator) {
    case "$eq":
      return eq(e, escalarDe(filtro.value, "$eq"));
    case "$neq":
      return ne(e, escalarDe(filtro.value, "$neq"));
    case "$gt":
      return gt(e, escalarDe(filtro.value, "$gt"));
    case "$gte":
      return gte(e, escalarDe(filtro.value, "$gte"));
    case "$lt":
      return lt(e, escalarDe(filtro.value, "$lt"));
    case "$lte":
      return lte(e, escalarDe(filtro.value, "$lte"));
    case "$in":
      return inArray(e, listaDe(filtro.value, "$in"));
    case "$nin":
      return notInArray(e, listaDe(filtro.value, "$nin"));
    case "$like":
      return ilike(e, String(escalarDe(filtro.value, "$like")));
    case "$ncontains":
      return notIlike(e, `%${String(escalarDe(filtro.value, "$ncontains"))}%`);
    case "$between": {
      const par = listaDe(filtro.value, "$between");
      if (par.length !== 2) {
        throw new ErroDeQuery("$between espera exatamente dois valores.", chave);
      }
      return and(gte(e, par[0]!), lte(e, par[1]!))!;
    }
    case "$isnull":
      return isNull(e);
    case "$isnotnull":
      return isNotNull(e);
    default:
      throw new ErroDeQuery(`Operador desconhecido: ${filtro.operator}`, chave);
  }
}

// ============================================================
// Validação
// ============================================================

export function validarSpec(spec: QuerySpec): CampoDoCatalogo[] {
  const campos: CampoDoCatalogo[] = [];

  for (const key of [...spec.metrics, ...spec.dimensions]) {
    const c = campo(key);
    if (!c) throw new ErroDeQuery(`Campo desconhecido: ${key}`, key);
    if (c.entity !== spec.entity) {
      throw new ErroDeQuery(
        `"${c.label}" é de ${ROTULO_DA_ENTIDADE[c.entity]}, e a consulta é de ${ROTULO_DA_ENTIDADE[spec.entity]}. Cruzar entidades usa mais de um querySpec.`,
        key,
      );
    }
    campos.push(c);
  }

  for (const key of spec.metrics) {
    const c = campo(key)!;
    if (c.role !== "metric") throw new ErroDeQuery(`"${c.label}" é dimensão, não métrica.`, key);
  }
  for (const key of spec.dimensions) {
    const c = campo(key)!;
    if (c.role !== "dimension") throw new ErroDeQuery(`"${c.label}" é métrica, não dimensão.`, key);
  }

  // A guarda que impede varredura de tabela. Vale para toda entidade, sem
  // exceção — inclusive para a query que "só quer o total".
  const chaveDeData = CAMPO_DE_DATA[spec.entity];
  if (!spec.filters[chaveDeData]) {
    throw new ErroDeQuery(
      `Toda consulta precisa de filtro de data. Faltou "${campo(chaveDeData)?.label ?? chaveDeData}".`,
      chaveDeData,
    );
  }

  for (const key of Object.keys(spec.filters)) {
    const c = campo(key);
    if (!c) throw new ErroDeQuery(`Filtro sobre campo desconhecido: ${key}`, key);
    if (c.entity !== spec.entity) {
      throw new ErroDeQuery(
        `Não dá para filtrar por "${c.label}" numa consulta de ${ROTULO_DA_ENTIDADE[spec.entity]}.`,
        key,
      );
    }
    if (c.role !== "dimension") {
      // Filtrar por métrica é `HAVING`, que muda o significado do recorte — fica
      // para quando houver caso de uso, com nome próprio na tela.
      throw new ErroDeQuery(
        `Ainda não dá para filtrar por métrica ("${c.label}"). Filtre por uma dimensão.`,
        key,
      );
    }
  }

  // Ordenar por campo fora do resultado é pedido impossível: a coluna não existe
  // na linha devolvida.
  const noResultado = new Set([...spec.metrics, ...spec.dimensions]);
  for (const o of spec.order_by) {
    if (!noResultado.has(o.field)) {
      throw new ErroDeQuery(
        `Não dá para ordenar por "${campo(o.field)?.label ?? o.field}" sem ele estar no resultado.`,
        o.field,
      );
    }
  }

  return campos;
}

// ============================================================
// Execução
// ============================================================

type Db = {
  select: (fields: Record<string, unknown>) => {
    from: (t: never) => {
      where: (c: unknown) => {
        groupBy: (...g: unknown[]) => {
          orderBy: (...o: unknown[]) => { limit: (n: number) => Promise<Record<string, unknown>[]> };
        };
        limit: (n: number) => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

export interface ContextoDaQuery {
  db: Db;
  projectId: string;
}

/** A fonte da entidade, ou o erro que explica por que ela não é consultável. */
function fonteDe(entity: EntidadeDoCatalogo): Fonte {
  const f = FONTES[entity];
  if (!f) {
    throw new ErroDeQuery(
      `${ROTULO_DA_ENTIDADE[entity]} ainda não é consultável pelo construtor: os dados vêm de planilha lida ao vivo, e o executor só fala com o banco.`,
    );
  }
  return f;
}

/** A expressão de uma métrica base. */
function expressaoDaMetrica(fonte: Fonte, key: string): SQL {
  const m = fonte.metricas[key];
  if (!m) throw new ErroDeQuery(`Ainda não sei calcular "${campo(key)?.label ?? key}".`, key);
  return m;
}

/**
 * A expressão de uma dimensão, já com a granularidade aplicada.
 *
 * O truncamento incide sobre a data LOCAL (a expressão do campo já converteu o
 * fuso), então a semana começa na segunda de São Paulo, não na segunda UTC.
 */
function expressaoDaDimensao(
  fonte: Fonte,
  key: string,
  granularidade: QuerySpec["date_granularity"],
): SQL {
  const e = fonte.campos[key];
  if (!e) throw new ErroDeQuery(`Ainda não sei agrupar por "${campo(key)?.label ?? key}".`, key);
  if (campo(key)?.semanticType !== "date" || granularidade === "day") return e;
  // A unidade entra como PARÂMETRO mesmo vindo de enum validado: no dia em que
  // alguém acrescentar granularidade nova, ela não vira texto colado no SQL.
  return sql`to_char(date_trunc(${granularidade}, (${e})::date), 'YYYY-MM-DD')`;
}

/**
 * A expressão de ordenação de um campo.
 *
 * Derivada ordena pela RAZÃO calculada no banco, não pelo numerador: um top-N
 * por CPM precisa do CPM de cada linha ANTES do corte do LIMIT. O `NULLIF`
 * repete no SQL a mesma regra do JS — sem denominador o valor é NULL — e
 * `NULLS LAST` mantém o vazio fora do topo do ranking.
 */
function expressaoDeOrdem(
  fonte: Fonte,
  field: string,
  granularidade: QuerySpec["date_granularity"],
): SQL {
  const d = fonte.derivadas[field];
  if (d) {
    const fator = d.fator ?? 1;
    return sql`(${expressaoDaMetrica(fonte, d.de)} * ${fator}) / NULLIF(${expressaoDaMetrica(fonte, d.por)}, 0)`;
  }
  if (campo(field)?.role === "dimension") return expressaoDaDimensao(fonte, field, granularidade);
  return expressaoDaMetrica(fonte, field);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Divide devolvendo `null` sem denominador.
 *
 * A regra vale para TODA taxa: zero contamina média, ordenação e export, e some
 * no gráfico como se fosse um valor medido.
 */
export function razao(de: number, por: number, fator = 1): number | null {
  if (!por) return null;
  return (de / por) * fator;
}

/**
 * Monta o SELECT do spec — a parte determinística, sem banco.
 *
 * Separada da execução porque é ela que os testes exercitam: dá para provar que
 * uma chave desconhecida vira erro ANTES de qualquer SQL existir.
 */
export function planejar(spec: QuerySpec) {
  validarSpec(spec);
  const fonte = fonteDe(spec.entity);

  // As métricas base necessárias — inclusive as que só existem para alimentar
  // uma derivada pedida.
  const bases = new Set<string>();
  for (const key of spec.metrics) {
    const d = fonte.derivadas[key];
    if (d) {
      bases.add(d.de);
      bases.add(d.por);
    } else {
      bases.add(key);
    }
  }

  const selecao: Record<string, unknown> = {};
  for (const key of spec.dimensions) {
    selecao[key] = expressaoDaDimensao(fonte, key, spec.date_granularity);
  }
  for (const base of bases) selecao[base] = expressaoDaMetrica(fonte, base);

  return { fonte, selecao, bases: [...bases] };
}

/** Executa o spec contra o banco. */
export async function executarQuery(
  spec: QuerySpec,
  ctx: ContextoDaQuery,
): Promise<ResultadoDaQuery> {
  const { fonte, selecao } = planejar(spec);
  const avisos: string[] = [];

  const limite = Math.min(spec.limit, TETO_DE_LINHAS);
  if (spec.limit > TETO_DE_LINHAS) {
    // Capar em silêncio faria a tela mostrar 10 mil linhas como se fossem as 50
    // mil pedidas.
    avisos.push(
      `O limite pedido (${spec.limit}) passa do teto e foi ajustado para ${TETO_DE_LINHAS}.`,
    );
  }

  const condicoes: SQL[] = [fonte.escopo(ctx.projectId)];
  for (const [chave, filtro] of Object.entries(spec.filters)) {
    const e = fonte.campos[chave];
    if (!e) {
      // Filtro que não sabemos aplicar é ERRO, nunca ignorado em silêncio: um
      // recorte que não acontece devolve mais linhas do que a pessoa pediu, e o
      // número parece certo.
      throw new ErroDeQuery(`Ainda não sei filtrar por "${campo(chave)?.label ?? chave}".`, chave);
    }
    condicoes.push(condicao(e, filtro, chave));
  }

  const construtor = ctx.db
    .select(selecao)
    .from(fonte.tabela as never)
    .where(and(...condicoes));

  let linhas: Record<string, unknown>[];
  if (spec.dimensions.length === 0) {
    // Sem dimensão o resultado é uma linha só — o total do período. Não há GROUP
    // BY, e ordenar ou limitar não significaria nada.
    linhas = await construtor.limit(1);
  } else {
    const ordens = spec.order_by.length
      ? spec.order_by
      : [{ field: spec.metrics[0]!, direction: "desc" as const }];
    const orderBy = ordens.map((o) => {
      const e = expressaoDeOrdem(fonte, o.field, spec.date_granularity);
      return o.direction === "asc" ? sql`${e} ASC NULLS LAST` : sql`${e} DESC NULLS LAST`;
    });
    linhas = await construtor
      .groupBy(...spec.dimensions.map((k) => expressaoDaDimensao(fonte, k, spec.date_granularity)))
      .orderBy(...orderBy)
      .limit(limite);
    if (linhas.length === limite) {
      // O corte precisa ser dito: uma tabela cortada em 500 parece completa.
      avisos.push(`Resultado cortado em ${limite} linhas. Refine o filtro ou aumente o limite.`);
    }
  }

  // As derivadas entram AQUI, sobre os totais já agregados.
  const rows = linhas.map((linha) => {
    const saida: Record<string, string | number | null> = {};
    for (const k of spec.dimensions) {
      const v = linha[k];
      saida[k] = v === null || v === undefined ? null : String(v);
    }
    for (const key of spec.metrics) {
      const d = fonte.derivadas[key];
      saida[key] = d ? razao(num(linha[d.de]), num(linha[d.por]), d.fator ?? 1) : num(linha[key]);
    }
    return saida;
  });

  const columns = [...spec.dimensions, ...spec.metrics].map((k) => {
    const c = campo(k)!;
    return { key: k, label: c.label, semanticType: c.semanticType };
  });

  return { columns, rows, avisos };
}
