/**
 * Story 42.14 (AC6, AC4/AC5, AC7, AC8) — novos pagantes POR PESSOA, renovações
 * e LTV por plano do Lyrio, a partir dos eventos do webhook do RevenueCat.
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
import { REVENUE_EVENT_TYPES } from "../services/revenuecat.js";
import {
  CANAIS_DA_VENDA,
  CONDICAO_ORGANICO,
  canalDaVenda,
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

/**
 * D23/D28 — os dois planos, com o `product_id` EXATAMENTE como o Danilo
 * escreveu ("premium_yearly anual premium_quartely quarter"). Não há produto
 * mensal nem terceiro LTV.
 *
 * TODO(42.14, sonda rc-formato / AC7c): conferir a grafia real em
 * `revenuecat_sales.product_id` (`premium_quartely` × `premium_quarterly`). Se o
 * dado diferir, a constante segue o dado e o fato volta ao Danilo. Até lá, um
 * id que não exista no dado dá "—" no card (pessoas = 0), nunca um número de
 * outro produto.
 */
export const PLANOS_DO_LTV = [
  { plano: "anual", rotulo: "LTV Anual", productId: "premium_yearly" },
  { plano: "trimestral", rotulo: "LTV Trimestral", productId: "premium_quartely" },
] as const;

export type PlanoDoLtv = (typeof PLANOS_DO_LTV)[number]["plano"];

export interface LtvDoPlano {
  plano: PlanoDoLtv;
  rotulo: string;
  productId: string;
  /** Receita BRUTA (`revenue_usd`) dos eventos pagos do plano na janela, em centavos de US$. */
  receitaCentavos: number;
  /** Pessoas distintas que pagaram o plano na janela (D24). */
  pessoas: number;
}

/**
 * AC7b (D13, D24) — por plano: a receita bruta e as pessoas distintas que
 * pagaram, na janela, só eventos pagos (PO-08). Pessoa com mais de um pagamento
 * conta UMA vez no denominador. O total sai em centavos já no banco, sobre a
 * soma exata do `numeric` — o memorial divide os mesmos centavos que exibe.
 */
export function consultaDoLtvPorPlano(stageId: string, desde: Date): SQL {
  const ids = PLANOS_DO_LTV.map((p) => p.productId);
  return sql`SELECT ${c.productId} AS product_id,
    round(coalesce(sum(${c.revenueUsd}), 0) * 100)::int AS receita_centavos,
    count(DISTINCT ${c.appUserId})::int AS pessoas
  FROM ${c}
  WHERE ${and(
    escopoDasVendas(stageId),
    inArray(c.eventType, REVENUE),
    sql`${c.revenueUsd} > 0`,
    sql`${c.purchasedAt} >= ${desde.toISOString()}::timestamptz`,
    inArray(c.productId, ids),
  )}
  GROUP BY ${c.productId}`;
}

/** Os dois planos sempre, na ordem de `PLANOS_DO_LTV`; plano sem linha = 0 e 0. */
export function montarLtv(linhas: readonly Record<string, unknown>[]): LtvDoPlano[] {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return PLANOS_DO_LTV.map(({ plano, rotulo, productId }) => {
    const l = linhas.find((x) => x.product_id === productId);
    return { plano, rotulo, productId, receitaCentavos: l ? num(l.receita_centavos) : 0, pessoas: l ? num(l.pessoas) : 0 };
  });
}
