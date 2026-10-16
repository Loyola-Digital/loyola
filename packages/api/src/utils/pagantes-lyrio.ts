/**
 * Story 42.14 (AC6, AC4/AC5, AC7, AC8) — novos pagantes POR PESSOA,
 * renovações e LTV por plano do Lyrio, a partir dos eventos do webhook do RevenueCat.
 *
 * Mesmo desenho da 42.12 (`vendas-por-canal-lyrio.ts`), pelo mesmo motivo:
 *  1. SQL: reduz os eventos da etapa a UMA linha por pessoa que pagou na
 *     janela, SEM o id. Os sinais de canal e o "primeiro pagamento" olham a
 *     série INTEIRA da pessoa; a janela entra só no que é contado.
 *  2. Função pura: a regra de canal com a origem mais antiga e as contagens.
 *
 * ## Por que não reaproveitar `novasAssinaturasPagas` (achado B)
 *
 * Ele conta EVENTOS `INITIAL_PURCHASE` pagos: quem assina, cancela e assina de
 * novo conta duas vezes, e quem veio do trial não conta nenhuma (a primeira
 * cobrança depois do trial chega como `RENEWAL` — documentação do RevenueCat:
 * "trial conversions count as renewals"). O CAC divide por PESSOAS (D4).
 *
 * ## As definições (decisões do Danilo e do @po)
 *
 * - Evento pago (PO-08): tipo em `REVENUE_EVENT_TYPES` com `revenue_usd > 0` —
 *   o mesmo da venda paga da 42.12 e do LTV.
 * - Primeiro pagamento (D15, AC6a): o primeiro evento pago de TODA a série da
 *   pessoa, por `purchased_at` (a coluna da janela de `/sales`); empate no mesmo
 *   instante desempata por `event_at` e pelo id da linha, só para ser
 *   determinístico. Novo pagante na janela = primeiro pagamento na janela.
 * - Renovação (D30, P19 = (b)): `RENEWAL` pago que NÃO é o primeiro pagamento
 *   da pessoa. A conversão de trial (primeira cobrança, que chega como
 *   `RENEWAL`) fica fora — já é novo pagante; a reassinatura de quem já tinha
 *   pagado conta. Conta EVENTOS (D11): dois `RENEWAL` = 2.
 * - Canal (D16, D25, D26): a regra da 42.12 por pessoa; quem tem sinal da Meta
 *   E do Google vai para o canal cujo sinal aparece PRIMEIRO no tempo
 *   (`event_at`). Empate no mesmo instante (PO-D3) → `conflito`: não entra no
 *   CAC de nenhum dos dois canais, entra no consolidado. Sem instante para
 *   comparar (sinal só em evento sem `event_at`) também é `conflito`: escolher
 *   seria atribuir um canal que o dado não atribui. A `canalDaVenda` e a tabela
 *   "Por canal" da 42.12 NÃO mudam.
 *
 * Cobertura (achado G): a série de assinaturas começa em 10/08/2026. Quem já
 * pagava antes e renova na janela tem o primeiro `RENEWAL` da série lido como
 * primeiro pagamento — conta como novo pagante, não como renovação. A tela
 * declara isso.
 *
 * Nunca devolve nem loga `app_user_id`: a consulta AGRUPA pelo id mas não o seleciona.
 */

import { and, inArray, sql, type SQL } from "drizzle-orm";
import { revenuecatSales } from "../db/schema.js";
import { consultaDoInicioDaAssinatura } from "./jornada-lyrio.js";
import type { ExecutorDeSql } from "./metricas-revenuecat.js";
import { instanteDoInicioDaJanela } from "./sale-date.js";
import { REVENUE_EVENT_TYPES } from "../services/revenuecat.js";
import {
  CANAIS_DA_VENDA,
  CONDICAO_ORGANICO,
  canalDaVenda,
  consultaDoInicioDosAtributos,
  dataIso,
  escopoDasVendas,
  sinalGoogle,
  sinalMeta,
  type CanalDaVenda,
} from "./vendas-por-canal-lyrio.js";

const c = revenuecatSales;
const REVENUE = [...REVENUE_EVENT_TYPES];
const atributos = sql`(${c.payload}->'event'->'subscriber_attributes')`;
const listaDeTipos = sql.join(REVENUE.map((t) => sql`${t}`), sql`, `);

// ─────────────────────────── canal pela origem ───────────────────────────

/** O que o banco devolve por pessoa — sem o id. */
export interface PessoaPagante {
  meta: boolean;
  google: boolean;
  organico: boolean;
  /** Primeiro instante com sinal da Meta / do Google, em toda a série. */
  metaDesde: Date | null;
  googleDesde: Date | null;
  /** O primeiro pagamento da série caiu na janela. */
  novoNaJanela: boolean;
  /** `RENEWAL` pagos na janela que não são o primeiro pagamento. */
  renovacoes: number;
}

/**
 * D16/D25 + PO-D3 — o canal de uma pessoa para os CACs e as renovações. Igual
 * à `canalDaVenda` da 42.12, exceto Meta + Google: vence a origem mais antiga;
 * empate (ou sem instante para comparar) fica em `conflito`.
 */
export function canalDaOrigem(p: Pick<PessoaPagante, "meta" | "google" | "organico" | "metaDesde" | "googleDesde">): CanalDaVenda | "conflito" {
  if (!(p.meta && p.google)) return canalDaVenda(p);
  if (!p.metaDesde || !p.googleDesde) return "conflito";
  const m = p.metaDesde.getTime();
  const g = p.googleDesde.getTime();
  if (m < g) return "meta";
  if (g < m) return "google";
  return "conflito";
}

export interface ContagemPorCanal {
  canais: { canal: CanalDaVenda; rotulo: string; quantidade: number }[];
  /** Empate exato Meta × Google (PO-D3). */
  conflito: number;
  /** As 4 linhas mais o conflito. */
  total: number;
}

export interface PagantesDoLyrio {
  /** Pessoas cujo PRIMEIRO pagamento caiu na janela (AC6). */
  novosPagantes: ContagemPorCanal;
  /** `RENEWAL` pagos na janela que não são o primeiro pagamento (AC8). */
  renovacoes: ContagemPorCanal;
}

/** As 4 linhas saem sempre, na ordem de exibição da 42.12, mesmo zeradas. */
export function montarPagantes(pessoas: readonly PessoaPagante[]): PagantesDoLyrio {
  const novos = new Map<CanalDaVenda | "conflito", number>();
  const renov = new Map<CanalDaVenda | "conflito", number>();
  for (const p of pessoas) {
    const canal = canalDaOrigem(p);
    if (p.novoNaJanela) novos.set(canal, (novos.get(canal) ?? 0) + 1);
    if (p.renovacoes > 0) renov.set(canal, (renov.get(canal) ?? 0) + p.renovacoes);
  }
  const fechar = (m: Map<CanalDaVenda | "conflito", number>): ContagemPorCanal => {
    const canais = CANAIS_DA_VENDA.map(({ canal, rotulo }) => ({ canal, rotulo, quantidade: m.get(canal) ?? 0 }));
    const conflito = m.get("conflito") ?? 0;
    return { canais, conflito, total: canais.reduce((a, x) => a + x.quantidade, 0) + conflito };
  };
  return { novosPagantes: fechar(novos), renovacoes: fechar(renov) };
}

// ─────────────────────────── SQL ───────────────────────────

/**
 * Uma linha por pessoa que tem evento pago na janela (só ela pode ser novo
 * pagante ou ter renovação na janela), sem o id. O "primeiro pagamento" e os
 * sinais de canal olham a série INTEIRA da pessoa; `desde` só entra no que é
 * contado. Mesma forma da 42.12 (`compradores` antes de tudo: centenas de 186
 * mil eventos), mesmos sinais (`sinalMeta`, `sinalGoogle`, `CONDICAO_ORGANICO`).
 */
export function consultaDePagantesPorCanal(stageId: string, desde: Date): SQL {
  const corte = sql`${desde.toISOString()}::timestamptz`;
  const pagoNoEvento = sql`${c.eventType} IN (${listaDeTipos}) AND ${c.revenueUsd} > 0 AND ${c.purchasedAt} >= ${corte}`;
  const pagoNaBase = sql`(base.event_type IN (${listaDeTipos}) AND base.revenue_usd > 0 AND base.purchased_at IS NOT NULL)`;
  const sa = sql`base.sa`;
  return sql`WITH compradores AS MATERIALIZED (
    SELECT DISTINCT ${c.appUserId} AS app_user_id FROM ${c} WHERE ${escopoDasVendas(stageId)} AND ${pagoNoEvento}
  ), base AS MATERIALIZED (
    SELECT ${c.appUserId} AS app_user_id, ${c.id} AS id, ${c.eventType} AS event_type, ${c.revenueUsd} AS revenue_usd,
      ${c.purchasedAt} AS purchased_at, ${c.eventAt} AS event_at, ${c.gclid} AS gclid,
      ${CONDICAO_ORGANICO} AS s_organico, ${atributos} AS sa
    FROM ${c} WHERE ${escopoDasVendas(stageId)} AND ${c.appUserId} IN (SELECT compradores.app_user_id FROM compradores)
  ), ev AS (
    SELECT base.app_user_id, base.event_type, base.purchased_at, base.event_at, base.s_organico,
      ${sinalMeta(sa)} AS s_meta, ${sinalGoogle(sa, sql`base.gclid`)} AS s_google,
      CASE WHEN ${pagoNaBase} THEN row_number() OVER (
        PARTITION BY base.app_user_id, ${pagoNaBase}
        ORDER BY base.purchased_at, base.event_at NULLS LAST, base.id
      ) END AS ordem_pago
    FROM base
  )
  SELECT
    coalesce(bool_or(ev.s_meta), false) AS s_meta,
    coalesce(bool_or(ev.s_google), false) AS s_google,
    coalesce(bool_or(ev.s_organico), false) AS s_organico,
    min(ev.event_at) FILTER (WHERE ev.s_meta) AS meta_desde,
    min(ev.event_at) FILTER (WHERE ev.s_google) AS google_desde,
    coalesce(bool_or(ev.ordem_pago = 1 AND ev.purchased_at >= ${corte}), false) AS novo_na_janela,
    (count(*) FILTER (WHERE ev.ordem_pago > 1 AND ev.event_type = 'RENEWAL' AND ev.purchased_at >= ${corte}))::int AS renovacoes
  FROM ev GROUP BY ev.app_user_id`;
}

/** Linha crua do `execute` → pessoa tipada. Booleano, inteiro e timestamp chegam em formatos variados. */
export function lerLinhaDePagante(r: Record<string, unknown>): PessoaPagante {
  const data = (v: unknown): Date | null => {
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
    if (typeof v === "string" && v) {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  };
  const n = Number(r.renovacoes);
  return {
    meta: r.s_meta === true,
    google: r.s_google === true,
    organico: r.s_organico === true,
    metaDesde: data(r.meta_desde),
    googleDesde: data(r.google_desde),
    novoNaJanela: r.novo_na_janela === true,
    renovacoes: Number.isFinite(n) ? n : 0,
  };
}

// ─────────────────────────── LTV por plano (AC7) ───────────────────────────

export type PlanoDoLtv = "mensal" | "trimestral" | "anual";

/**
 * AC7c (D33, PO-D7) — a classificação de `product_id` em plano, regra (ii):
 * PREFIXO para os produtos `premium_*` e nome EXATO para as promoções. Texto
 * exato do dado, com diferença entre maiúsculas e minúsculas.
 *
 * Os ids observados na sonda de produção (2026-10-16) — impressos direto da
 * coluna, sem transformação — são famílias com sufixo de preço/base/partner:
 * `premium_monthly_15:base`, `premium_quartely_25:base` (a grafia "quartely" é
 * a do dado), `premium_yearly_partner_100`… e as promoções
 * `rc_promo_Lyrio Pro_{daily,weekly,monthly,three_month,yearly}` (com o espaço
 * em "Lyrio Pro"). O partner entra no seu tipo pelo próprio prefixo (D33).
 *
 * Trade-off (PO-D7): com o prefixo, um id NOVO da mesma família entra sozinho
 * no plano; o risco de um id de natureza diferente entrar sem ninguém ver fica
 * VISÍVEL, porque o memorial lista os ids de cada plano (AC7d).
 */
export const REGRA_DOS_PLANOS: readonly { plano: PlanoDoLtv; rotulo: string; prefixo: string; promocao: string }[] = [
  { plano: "mensal", rotulo: "LTV Mensal", prefixo: "premium_monthly", promocao: "rc_promo_Lyrio Pro_monthly" },
  { plano: "trimestral", rotulo: "LTV Trimestral", prefixo: "premium_quartely", promocao: "rc_promo_Lyrio Pro_three_month" },
  { plano: "anual", rotulo: "LTV Anual", prefixo: "premium_yearly", promocao: "rc_promo_Lyrio Pro_yearly" },
];

/**
 * Fora de todo LTV POR DECISÃO (D33): as promoções diária e semanal e o
 * produto de teste. Não disparam o aviso de não classificado; o memorial diz
 * que existem.
 */
export const FORA_POR_DECISAO: readonly string[] = ["rc_promo_Lyrio Pro_daily", "rc_promo_Lyrio Pro_weekly", "test_product"];

export type ClasseDoProduto = PlanoDoLtv | "fora" | "nao_classificado";

/** A regra em TypeScript — a fonte do SQL abaixo (equivalência provada no PGlite). */
export function classificarProduto(productId: string | null | undefined): ClasseDoProduto {
  if (productId == null) return "nao_classificado";
  for (const r of REGRA_DOS_PLANOS) {
    if (productId.startsWith(r.prefixo) || productId === r.promocao) return r.plano;
  }
  return FORA_POR_DECISAO.includes(productId) ? "fora" : "nao_classificado";
}

/**
 * A mesma regra no SQL. O prefixo é comparado com `left(…) = …`, sem `LIKE`:
 * nos ids, o `_` é caractere literal, e no `LIKE` ele seria curinga
 * (`premiumXmonthly_1` entraria no Mensal) — AC7e.
 */
export function classeDoProdutoNoSql(coluna: SQL = sql`${c.productId}`): SQL {
  const casos = sql.join(
    REGRA_DOS_PLANOS.map(
      (r) => sql`WHEN left(${coluna}, ${r.prefixo.length}) = ${r.prefixo} OR ${coluna} = ${r.promocao} THEN ${r.plano}`,
    ),
    sql` `,
  );
  const fora = sql.join(FORA_POR_DECISAO.map((id) => sql`${id}`), sql`, `);
  return sql`(CASE WHEN ${coluna} IS NULL THEN 'nao_classificado' ${casos} WHEN ${coluna} IN (${fora}) THEN 'fora' ELSE 'nao_classificado' END)`;
}

export interface ProdutoDoLtv {
  /** `null` = pagamento sem `product_id` (só possível em "não classificado"). */
  productId: string | null;
  pagamentos: number;
  pessoas: number;
  receitaCentavos: number;
}

export interface LtvDoPlano {
  plano: PlanoDoLtv;
  rotulo: string;
  /** Receita BRUTA (`revenue_usd`) dos pagamentos do plano na janela, em centavos de US$. */
  receitaCentavos: number;
  /** Pessoas distintas que pagaram o plano na janela (D24) — por PLANO, não por id. */
  pessoas: number;
  /** Os ids que entraram no plano na janela (AC7d: um id inesperado fica visível). */
  produtos: ProdutoDoLtv[];
}

export interface GrupoForaDoLtv {
  pagamentos: number;
  pessoas: number;
  receitaCentavos: number;
  produtos: ProdutoDoLtv[];
}

export interface LtvDoLyrio {
  planos: LtvDoPlano[];
  /** Pagamentos cujo id não casa com nenhuma regra (AC7d) — a tela avisa. */
  naoClassificado: GrupoForaDoLtv;
  /** Daily, weekly e `test_product` (D33) — o memorial diz que existem. */
  foraPorDecisao: GrupoForaDoLtv;
}

/**
 * AC7b — os pagamentos (PO-08: `REVENUE_EVENT_TYPES` com `revenue_usd > 0`;
 * promoção de US$ 0 não é pagamento) da janela, classificados pela regra.
 * `GROUPING SETS`: o total de cada classe (pessoas distintas POR CLASSE — a
 * mesma pessoa em dois ids do mesmo plano conta uma vez) e o detalhe por id.
 * Receita em centavos sobre a soma exata do `numeric`. Sem `app_user_id`.
 */
export function consultaDoLtvPorPlano(stageId: string, desde: Date): SQL {
  return sql`WITH pagos AS (
    SELECT ${c.appUserId} AS app_user_id, ${c.revenueUsd} AS revenue_usd, ${c.productId} AS product_id, ${classeDoProdutoNoSql()} AS classe
    FROM ${c}
    WHERE ${and(
      escopoDasVendas(stageId),
      inArray(c.eventType, REVENUE),
      sql`${c.revenueUsd} > 0`,
      sql`${c.purchasedAt} >= ${desde.toISOString()}::timestamptz`,
    )}
  )
  SELECT pagos.classe, pagos.product_id, GROUPING(pagos.product_id)::int AS total_da_classe,
    count(*)::int AS pagamentos,
    count(DISTINCT pagos.app_user_id)::int AS pessoas,
    round(coalesce(sum(pagos.revenue_usd), 0) * 100)::int AS receita_centavos
  FROM pagos
  GROUP BY GROUPING SETS ((pagos.classe, pagos.product_id), (pagos.classe))`;
}

/** Os três planos sempre, na ordem de `REGRA_DOS_PLANOS`; plano sem linha = 0 e 0. */
export function montarLtv(linhas: readonly Record<string, unknown>[]): LtvDoLyrio {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const totalDa = (classe: string) => linhas.find((l) => l.classe === classe && num(l.total_da_classe) === 1);
  const produtosDa = (classe: string): ProdutoDoLtv[] =>
    linhas
      .filter((l) => l.classe === classe && num(l.total_da_classe) === 0)
      .map((l) => ({
        productId: typeof l.product_id === "string" ? l.product_id : null,
        pagamentos: num(l.pagamentos),
        pessoas: num(l.pessoas),
        receitaCentavos: num(l.receita_centavos),
      }))
      .sort((a, b) => b.receitaCentavos - a.receitaCentavos || String(a.productId).localeCompare(String(b.productId)));
  const grupo = (classe: string): GrupoForaDoLtv => {
    const t = totalDa(classe);
    return { pagamentos: num(t?.pagamentos), pessoas: num(t?.pessoas), receitaCentavos: num(t?.receita_centavos), produtos: produtosDa(classe) };
  };
  return {
    planos: REGRA_DOS_PLANOS.map(({ plano, rotulo }) => {
      const g = grupo(plano);
      return { plano, rotulo, receitaCentavos: g.receitaCentavos, pessoas: g.pessoas, produtos: g.produtos };
    }),
    naoClassificado: grupo("nao_classificado"),
    foraPorDecisao: grupo("fora"),
  };
}

// ─────────────────── a rota `pagantes-por-canal` ───────────────────

/**
 * Story 42.14 — a resposta inteira de `pagantes-por-canal` (AC6, AC7, AC8).
 * Mora aqui (e não na rota) para a rota e a sonda de conferência em produção
 * rodarem o MESMO código. Janela = N dias de calendário de SP sobre
 * `purchased_at`; a resposta ecoa a janela (AC10b) e a cobertura (achado G).
 */
export async function pagantesPorCanalDaEtapa(executar: ExecutorDeSql, stageId: string, days: number, agora: Date = new Date()) {
  const desde = instanteDoInicioDaJanela(days, agora);
  const [pessoas, ltv, inicio, atributos] = await Promise.all([
    executar(consultaDePagantesPorCanal(stageId, desde)),
    executar(consultaDoLtvPorPlano(stageId, desde)),
    executar(consultaDoInicioDaAssinatura(stageId)),
    executar(consultaDoInicioDosAtributos(stageId)),
  ]);
  const pagantes = montarPagantes((pessoas.rows as Record<string, unknown>[]).map(lerLinhaDePagante));
  return {
    days,
    desde: dataIso(desde),
    assinaturaDesde: dataIso((inicio.rows[0] as { desde?: unknown } | undefined)?.desde),
    atributosDesde: dataIso((atributos.rows[0] as { desde?: unknown } | undefined)?.desde),
    ...pagantes,
    // AC7 — LTV por plano (D33, PO-D7): os ids de cada plano, os não
    // classificados (a tela avisa) e os fora por decisão.
    ltv: montarLtv(ltv.rows as Record<string, unknown>[]),
  };
}
