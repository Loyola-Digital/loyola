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
import { funnelGroupSnapshots, manualSales, metaAdInsightsDaily, projects } from "../../db/schema.js";
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
  entity: z.enum(["trafego", "vendas", "faturamento", "aplicacoes", "grupos"]),
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
  /**
   * Prende a consulta aos projetos da SESSÃO. Sem isto, um projeto lê o outro.
   *
   * Recebe lista, não id: a visão consolidada soma vários projetos, e é a mesma
   * condição que garante que só entram os que quem está olhando enxerga.
   */
  escopo: (projectIds: string[]) => SQL;
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
    escopo: (ids) => inArray(metaAdInsightsDaily.projectId, ids),
    campos: {
      // `date_start` já vem como a data fechada da conta de anúncio (texto ISO),
      // sem hora — então aqui não há fuso a converter.
      "trafego.date": col(metaAdInsightsDaily.dateStart),
      "trafego.campaign": col(metaAdInsightsDaily.campaignName),
      "trafego.adset": col(metaAdInsightsDaily.adsetName),
      "trafego.ad": col(metaAdInsightsDaily.adName),
      // Subconsulta escalar em vez de `JOIN`: o executor monta uma consulta de
      // uma tabela só, e trocar isso por join mudaria a forma de tudo para
      // atender uma dimensão que só aparece no escopo consolidado.
      "trafego.projeto": sql`(SELECT ${projects.name} FROM ${projects} WHERE ${projects.id} = ${metaAdInsightsDaily.projectId})`,
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
    escopo: (ids) => sql`${manualSales.stageId} IN (
      SELECT fs.id FROM funnel_stages fs
        JOIN funnels f ON f.id = fs.funnel_id
       WHERE f.project_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    )`,
    campos: {
      "vendas.date": diaLocal(manualSales.saleDate),
      "vendas.produto": col(manualSales.product),
      "vendas.projeto": sql`(
        SELECT p.name FROM funnel_stages fs
          JOIN funnels f ON f.id = fs.funnel_id
          JOIN projects p ON p.id = f.project_id
         WHERE fs.id = ${manualSales.stageId}
      )`,
    },
    metricas: {
      "vendas.count": sql`COUNT(*)`,
      "vendas.revenue": soma(manualSales.value),
    },
    derivadas: {
      "vendas.ticket_por_venda": { de: "vendas.revenue", por: "vendas.count" },
    },
  },

  /**
   * O faturamento de verdade — o que as planilhas de venda registram.
   *
   * ## Por que não é a tabela `manual_sales`
   *
   * `vendas` conta o Kanban comercial: 25 linhas em toda a história, R$ 341 mil.
   * A operação vende muito mais que isso, e o resto nunca passou por lá. Medido
   * em 2026-09-01, 90 dias: o BI mostrava 17 transações enquanto `dg-pg02`
   * sozinho tinha 1.983 compradores e R$ 495 mil, e `dg-pg04` outros 1.122 e
   * R$ 298 mil. Um número certo para a fonte errada.
   *
   * ## De onde sai
   *
   * Do agregado diário que o sync das planilhas já grava em
   * `public_metrics_cache` (escopo `sales-daily`), uma linha por etapa com um
   * `byDay` dentro. Ler daí, e não da planilha ao vivo, dá três coisas de
   * graça: é a MESMA fonte que alimenta o dashboard de funil (então o BI passa
   * a bater com o resto do app), é SQL (então filtro, ordenação e limite
   * funcionam como nas outras entidades), e não custa chamada de rede ao Google
   * a cada widget.
   *
   * O preço é a frescura: vale o que o último sync gravou.
   */
  faturamento: {
    // `LATERAL` abre o `byDay` em uma linha por dia. A guarda de `jsonb_typeof`
    // não é paranoia: payload antigo ou meio gravado quebraria a consulta
    // inteira em vez de sumir de um relatório.
    tabela: sql`(
      SELECT
        pmc.project_id AS project_id,
        pmc.key        AS stage_id,
        (d->>'date')   AS dia,
        COALESCE((d->>'faturamentoBruto')::numeric, 0)     AS bruto,
        COALESCE((d->>'faturamentoLiquido')::numeric, 0)   AS liquido,
        COALESCE((d->'ingressos'->>'total')::numeric, 0)   AS compradores,
        COALESCE((d->'ingressos'->>'pago')::numeric, 0)    AS pagos,
        COALESCE((d->'ingressos'->>'org')::numeric, 0)     AS organicos
      FROM public_metrics_cache pmc,
           LATERAL jsonb_array_elements(pmc.payload->'byDay') d
      WHERE pmc.scope = 'sales-daily'
        AND jsonb_typeof(pmc.payload->'byDay') = 'array'
    ) AS faturamento`,
    escopo: (ids) =>
      sql`faturamento.project_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`,
    campos: {
      // A data já vem fechada no fuso pelo sync — não há timestamp a converter.
      "faturamento.date": sql`faturamento.dia`,
      "faturamento.projeto": sql`(SELECT p.name FROM projects p WHERE p.id = faturamento.project_id)`,
      // O funil é o recorte que o time usa para falar ("os funis do BBE"), e a
      // chave do cache é a etapa — então o caminho passa por `funnel_stages`.
      "faturamento.funil": sql`(
        SELECT f.name FROM funnel_stages fs
          JOIN funnels f ON f.id = fs.funnel_id
         WHERE fs.id = faturamento.stage_id::uuid
      )`,
      "faturamento.etapa": sql`(
        SELECT fs.name FROM funnel_stages fs WHERE fs.id = faturamento.stage_id::uuid
      )`,
    },
    metricas: {
      "faturamento.bruto": sql`COALESCE(SUM(faturamento.bruto), 0)`,
      "faturamento.liquido": sql`COALESCE(SUM(faturamento.liquido), 0)`,
      "faturamento.compradores": sql`COALESCE(SUM(faturamento.compradores), 0)`,
      "faturamento.pagos": sql`COALESCE(SUM(faturamento.pagos), 0)`,
      "faturamento.organicos": sql`COALESCE(SUM(faturamento.organicos), 0)`,
    },
    derivadas: {
      "faturamento.ticket": { de: "faturamento.bruto", por: "faturamento.compradores" },
    },
  },

  grupos: {
    tabela: funnelGroupSnapshots,
    escopo: (ids) => sql`${funnelGroupSnapshots.funnelId} IN (
      SELECT id FROM funnels WHERE project_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    )`,
    campos: {
      "grupos.date": diaLocal(funnelGroupSnapshots.snapshotAt),
      "grupos.projeto": sql`(
        SELECT p.name FROM funnels f
          JOIN projects p ON p.id = f.project_id
         WHERE f.id = ${funnelGroupSnapshots.funnelId}
      )`,
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
  vendas: "Vendas lançadas",
  faturamento: "Faturamento",
  aplicacoes: "Aplicações",
  grupos: "Grupos de WhatsApp",
};

/** A dimensão de data da entidade — é nela que o filtro obrigatório incide. */
export const CAMPO_DE_DATA: Record<EntidadeDoCatalogo, string> = {
  trafego: "trafego.date",
  vendas: "vendas.date",
  faturamento: "faturamento.date",
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
  /**
   * Os projetos que a consulta pode ler.
   *
   * Um id no escopo normal, vários no consolidado. Vem sempre da sessão — o
   * documento do dashboard diz *se* é consolidado, nunca *quais* projetos.
   */
  projectIds: string[];
  /** Só a entidade de planilha usa — ela avisa sobre aba ilegível. */
  log?: { warn: (o: unknown, m: string) => void };
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

/**
 * Métricas que precisam de OUTRA entidade.
 *
 * ## Por que existe
 *
 * ROAS é receita sobre investimento, e as duas moram em tabelas diferentes: a
 * receita no cache das planilhas de venda, o investimento nas tabelas da Meta.
 * O executor monta uma consulta de uma entidade só — então, sem isto, o ROAS
 * ficava no catálogo como promessa e respondia "ainda não sei calcular". Era o
 * pior dos mundos: a IA oferecia a métrica e o widget nascia morto.
 *
 * ## Como funciona
 *
 * Roda a segunda consulta com as MESMAS dimensões, traduzidas para a outra
 * entidade, e junta em memória pela chave da dimensão. Não é join no banco
 * porque as fontes não têm chave comum — o que elas compartilham é o
 * significado de "mesmo dia" e "mesmo projeto".
 */
const EMPRESTIMOS: Record<string, { de: EntidadeDoCatalogo; metrica: string }> = {
  "faturamento.investimento": { de: "trafego", metrica: "trafego.spend" },
};

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
    // Métrica emprestada não sai do SQL desta fonte: vem da segunda consulta,
    // na outra entidade. Pedi-la aqui daria "ainda não sei calcular" para algo
    // que o executor sabe, sim, buscar — só não neste SELECT.
    if (EMPRESTIMOS[key]) continue;

    const d = fonte.derivadas[key];
    if (d) {
      bases.add(d.de);
      bases.add(d.por);
      continue;
    }

    // Derivada cuja fórmula usa uma métrica emprestada (o ROAS e o CAC) é
    // calculada depois do join, não em SQL. O que o SELECT precisa trazer é só
    // a parte que MORA aqui.
    const formula = campo(key)?.formula;
    if (formula && Object.keys(EMPRESTIMOS).some((e) => formula.includes(e))) {
      for (const parte of formula.split("/").map((x) => x.trim())) {
        if (parte && !EMPRESTIMOS[parte] && fonte.metricas[parte]) bases.add(parte);
      }
      continue;
    }

    bases.add(key);
  }

  const selecao: Record<string, unknown> = {};
  for (const key of spec.dimensions) {
    selecao[key] = expressaoDaDimensao(fonte, key, spec.date_granularity);
  }
  for (const base of bases) selecao[base] = expressaoDaMetrica(fonte, base);

  return { fonte, selecao, bases: [...bases] };
}


/**
 * A dimensão equivalente na outra entidade.
 *
 * Só existe para o que as duas sabem responder. `faturamento.funil` não está
 * aqui porque o tráfego não sabe de funil: a campanha da Meta não carrega essa
 * informação, e inventar um rateio daria um número plausível e falso.
 */
const DIMENSAO_EQUIVALENTE: Record<string, Record<string, string>> = {
  faturamento: {
    "faturamento.date": "trafego.date",
    "faturamento.projeto": "trafego.projeto",
  },
};

/** O que a segunda consulta precisa, ou o motivo de não dar. */
export function planejarEmprestimo(spec: QuerySpec):
  | { tipo: "nao-precisa" }
  | { tipo: "impossivel"; dimensao: string; metrica: string }
  | { tipo: "precisa"; entidade: EntidadeDoCatalogo; metricas: string[]; dimensoes: string[] } {
  const pedidas = spec.metrics.filter((m) => EMPRESTIMOS[m]);
  // Derivada que usa uma métrica emprestada também exige o empréstimo — é o
  // caso do ROAS, que ninguém pede junto com "investimento".
  for (const m of spec.metrics) {
    const f = campo(m)?.formula ?? "";
    for (const chave of Object.keys(EMPRESTIMOS)) {
      if (f.includes(chave) && !pedidas.includes(chave)) pedidas.push(chave);
    }
  }
  if (pedidas.length === 0) return { tipo: "nao-precisa" };

  const equivalencias = DIMENSAO_EQUIVALENTE[spec.entity] ?? {};
  for (const d of spec.dimensions) {
    if (!equivalencias[d]) {
      return { tipo: "impossivel", dimensao: d, metrica: pedidas[0]! };
    }
  }

  return {
    tipo: "precisa",
    entidade: EMPRESTIMOS[pedidas[0]!]!.de,
    metricas: pedidas.map((p) => EMPRESTIMOS[p]!.metrica),
    dimensoes: spec.dimensions.map((d) => equivalencias[d]!),
  };
}

/** Executa o spec contra o banco — ou contra a planilha, no caso de aplicações. */
/**
 * Os valores que uma dimensão realmente tem no banco, dentro do escopo.
 *
 * ## Por que existe
 *
 * O agente escolhe CHAVES de um catálogo, mas sempre escolheu VALORES de
 * cabeça. Pergunta real do Alberto em 01/10/2026 — "as vendas dos workshops do
 * netão" — virou `faturamento.funil $like "netão"`, e nenhum funil do BBE se
 * chama assim (são `bbe-pr2-out-26` e parentes). O card nasceu com R$ 0, a IA
 * disse que tinha feito, e nada na tela explicava o zero.
 *
 * Com a lista na mão o modelo escolhe em vez de inventar — a mesma troca que o
 * catálogo de chaves já fazia, aplicada ao outro lado do filtro.
 *
 * Devolve `null` quando a dimensão tem mais valores que o teto: listar 4 mil
 * campanhas não cabe no prompt e não ajuda ninguém. `null` significa "não sei
 * enumerar", e quem valida trata isso como "não valide" — nunca como "vazio".
 */
export async function valoresDaDimensao(
  chave: string,
  ctx: ContextoDaQuery,
  teto = 60,
): Promise<string[] | null> {
  const def = campo(chave);
  if (!def || def.role !== "dimension" || def.semanticType === "date") return null;

  const fonte = FONTES[def.entity];
  if (!fonte) return null; // `aplicacoes` é planilha: não tem SQL para perguntar.
  const expressao = fonte.campos[chave];
  if (!expressao) return null;

  // `GROUP BY` em vez de `SELECT DISTINCT` porque é o que o executor sabe
  // montar (ver o tipo `Db`) — o resultado é o mesmo.
  // Teto + 1 para distinguir "a lista inteira" de "tem mais do que cabe".
  const linhas = (await ctx.db
    .select({ v: expressao })
    .from(fonte.tabela as never)
    .where(fonte.escopo(ctx.projectIds))
    .groupBy(expressao)
    .orderBy(expressao)
    .limit(teto + 1)) as { v: unknown }[];

  if (linhas.length > teto) return null;
  const valores = linhas
    .map((l) => (l.v == null ? "" : String(l.v).trim()))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return valores;
}

export async function executarQuery(
  spec: QuerySpec,
  ctx: ContextoDaQuery,
): Promise<ResultadoDaQuery> {
  if (spec.entity === "aplicacoes") {
    // Caminho próprio: esta entidade é lida ao vivo do Google Sheets, filtrada e
    // agregada em memória. Ver `aplicacoes.ts` para o porquê de cada limite.
    validarSpec(spec);
    const { carregarAplicacoes, executarSobreLinhas } = await import("./aplicacoes.js");
    const carregado = await carregarAplicacoes(
      { db: ctx.db, log: ctx.log ?? { warn: () => {} } },
      ctx.projectIds,
    );
    const r = executarSobreLinhas(spec, carregado.linhas);
    return { ...r, avisos: [...carregado.avisos, ...r.avisos] };
  }

  const emprestimo = planejarEmprestimo(spec);
  if (emprestimo.tipo === "impossivel") {
    const d = campo(emprestimo.dimensao);
    const m = campo(emprestimo.metrica);
    throw new ErroDeQuery(
      `Não dá para calcular "${m?.label ?? emprestimo.metrica}" por "${d?.label ?? emprestimo.dimensao}": ` +
        `o investimento em mídia não é registrado nessa granularidade. Use por dia, por projeto, ou sem quebra.`,
      emprestimo.dimensao,
    );
  }

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

  const condicoes: SQL[] = [fonte.escopo(ctx.projectIds)];
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
  /** Ordens que só podem ser aplicadas depois do join — ver dentro do `else`. */
  let ordemEmMemoria: { field: string; direction: "asc" | "desc" }[] = [];
  if (spec.dimensions.length === 0) {
    // Sem dimensão o resultado é uma linha só — o total do período. Não há GROUP
    // BY, e ordenar ou limitar não significaria nada.
    linhas = await construtor.limit(1);
  } else {
    /**
     * Métrica emprestada não pode ordenar em SQL: ela nem está no SELECT.
     * O ROAS e o CAC caem aqui, e é justamente por eles que se ordena — então
     * a ordem passa a ser aplicada em memória, depois do join. O SQL ordena
     * por algo local só para o corte de `limit` cair nas linhas que importam.
     */
    const dependeDoEmprestimo = (chave: string): boolean => {
      if (EMPRESTIMOS[chave]) return true;
      const f = campo(chave)?.formula ?? "";
      return Object.keys(EMPRESTIMOS).some((e) => f.includes(e));
    };

    const pedidas = spec.order_by.length
      ? spec.order_by
      : [{ field: spec.metrics[0]!, direction: "desc" as const }];
    ordemEmMemoria = pedidas.filter((o) => dependeDoEmprestimo(o.field));

    const noSql = pedidas.filter((o) => !dependeDoEmprestimo(o.field));
    const ordens = noSql.length
      ? noSql
      : // Nada local para ordenar: usa a primeira métrica que MORA aqui, ou a
        // primeira dimensão. O resultado final é reordenado em memória.
        [
          {
            field:
              spec.metrics.find((m) => !dependeDoEmprestimo(m)) ?? spec.dimensions[0]!,
            direction: "desc" as const,
          },
        ];
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

  if (emprestimo.tipo === "precisa") {
    // A segunda consulta é do MESMO recorte, na outra entidade: mesmas
    // dimensões traduzidas, mesmo período, mesmo escopo de projeto.
    const equivalencias = DIMENSAO_EQUIVALENTE[spec.entity] ?? {};
    const filtrosTraduzidos: QuerySpec["filters"] = {};
    for (const [chave, filtro] of Object.entries(spec.filters)) {
      const eq = equivalencias[chave];
      // Filtro sem equivalente é DESCARTADO, e isso alarga o denominador: sem o
      // recorte, o investimento vem maior e o ROAS sai menor. Melhor um número
      // conservador e explicado que um número otimista e falso.
      if (eq) filtrosTraduzidos[eq] = filtro;
    }

    const outro = await executarQuery(
      querySpecSchema.parse({
        entity: emprestimo.entidade,
        metrics: emprestimo.metricas,
        dimensions: emprestimo.dimensoes,
        filters: filtrosTraduzidos,
        limit: TETO_DE_LINHAS,
        date_granularity: spec.date_granularity,
      }),
      ctx,
    );

    // Índice pela chave das dimensões, na ordem em que foram pedidas.
    const chaveDa = (linha: Record<string, unknown>, dims: string[]) =>
      dims.map((d) => String(linha[d] ?? "")).join("|");
    const porChave = new Map(
      outro.rows.map((l) => [chaveDa(l, emprestimo.dimensoes), l] as const),
    );

    for (const linha of rows) {
      const casada = porChave.get(chaveDa(linha, spec.dimensions));
      emprestimo.metricas.forEach((metricaLa, i) => {
        const nossa = Object.keys(EMPRESTIMOS)[
          Object.values(EMPRESTIMOS).findIndex((e) => e.metrica === metricaLa)
        ];
        if (nossa) linha[nossa] = casada ? num(casada[metricaLa]) : 0;
        void i;
      });
    }

    // As derivadas que dependem do empréstimo só podem ser calculadas AGORA:
    // na primeira passada o denominador ainda não existia.
    for (const linha of rows) {
      for (const key of spec.metrics) {
        const f = campo(key)?.formula;
        if (!f) continue;
        const [de, por] = f.split("/").map((x) => x.trim());
        if (!de || !por) continue;
        if (!(de in linha) || !(por in linha)) continue;
        linha[key] = razao(num(linha[de]), num(linha[por]));
      }
    }

    /**
     * O que sobrou do outro lado.
     *
     * Um recorte pode ter investimento e nenhum faturamento — o `Lyrio`
     * gastou R$ 3.387 em agosto e vende pelo RevenueCat, que não entra nesta
     * fonte. Essas linhas não casam, e o investimento delas fica de fora.
     *
     * Sem avisar, quem soma a coluna encontra menos que o tráfego real e
     * conclui que a tela está errada. Com aviso, sabe que a diferença tem nome.
     */
    const casadas = new Set(rows.map((l) => chaveDa(l, spec.dimensions)));
    let orfao = 0;
    for (const l of outro.rows) {
      if (casadas.has(chaveDa(l, emprestimo.dimensoes))) continue;
      for (const m of emprestimo.metricas) orfao += num(l[m]) ?? 0;
    }
    if (orfao > 0) {
      avisos.push(
        `R$ ${orfao.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} de investimento ficaram de fora: ` +
          `houve tráfego em recortes sem faturamento registrado nesta fonte.`,
      );
    }

    if (ordemEmMemoria.length > 0) {
      rows.sort((a, b) => {
        for (const o of ordemEmMemoria) {
          const va = a[o.field];
          const vb = b[o.field];
          // `null` (taxa sem denominador) vai para o fim nos dois sentidos:
          // "não deu para calcular" não é o menor valor, é ausência.
          if (va === null && vb === null) continue;
          if (va === null) return 1;
          if (vb === null) return -1;
          const d = Number(vb) - Number(va);
          if (d !== 0) return o.direction === "asc" ? -d : d;
        }
        return 0;
      });
    }

    avisos.push(...outro.avisos);
  }

  const columns = [...spec.dimensions, ...spec.metrics].map((k) => {
    const c = campo(k)!;
    return { key: k, label: c.label, semanticType: c.semanticType };
  });

  return { columns, rows, avisos };
}
