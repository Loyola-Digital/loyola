/**
 * Story 42.11 — jornada do usuário do Lyrio por canal (Google, Meta, orgânico,
 * iOS), a partir dos eventos do webhook do RevenueCat (`revenuecat_sales`).
 *
 * Duas metades, de propósito (PO-08 — a suíte da API não tem banco):
 *
 *  1. SQL (`consultaDaJornada`): reduz os ~110 mil eventos da etapa a UMA
 *     linha por usuário, SEM o id — `min`/`bool_or`/`sum … FILTER` agrupados
 *     por `app_user_id`, com o recorte da coorte no HAVING. É o que só o banco
 *     faz; provado inspecionando o SQL gerado (`PgDialect`) e, no DoD, pelo
 *     SELECT de produção que reproduz a medição de 23/09.
 *  2. Função pura (`canalDoUsuario`, `montarJornada`): a prioridade de canal, a
 *     coorte e a contagem por canal — testadas de verdade.
 *
 * As regras são as do script que produziu a tabela da story (`uf.sql`,
 * transcrito nas Dev Notes, PO-02), conferidas em produção antes de codar
 * (2026-09-23: Total 10.149 novos × 10.110 medidos; Google 2.382 × 2.368; Pagou
 * 246 = 246 — a janela andou algumas horas).
 *
 * Nunca devolve nem loga `app_user_id` (nem e-mail, IP, IDFA): a consulta
 * AGRUPA pelo id mas não o seleciona — só contagens saem daqui.
 */

import { and, eq, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { revenuecatSales } from "../db/schema.js";
import { REVENUE_EVENT_TYPES } from "../services/revenuecat.js";

// ─────────────────────────── canais ───────────────────────────

export type CanalDaJornada =
  | "campanha"
  | "google_gclid"
  | "meta_fbclid"
  | "meta_install"
  | "organico"
  | "sem_ios"
  | "sem_android";

/**
 * A ORDEM DE EXIBIÇÃO (a da tabela medida da story, AC1) e o rótulo. A ordem
 * de PRIORIDADE é outra — ver `canalDoUsuario`.
 */
export const CANAIS_DA_JORNADA: readonly { canal: CanalDaJornada; rotulo: string }[] = [
  { canal: "google_gclid", rotulo: "Google (gclid)" },
  { canal: "meta_install", rotulo: "Meta (ig4a/fb4a)" },
  { canal: "meta_fbclid", rotulo: "Meta (fbclid)" },
  { canal: "organico", rotulo: "Orgânico ou cupom" },
  { canal: "sem_ios", rotulo: "Sem atribuição — iOS" },
  { canal: "sem_android", rotulo: "Sem atribuição — Android/outro" },
  { canal: "campanha", rotulo: "Campanha identificável (Meta + Google)" },
];

/** O que o banco devolve por usuário — sem o id. */
export interface SinaisDoUsuario {
  /** Primeiro evento dele em TODA a série da etapa (não só na janela). */
  primeiroEvento: Date | null;
  viuPaywall: boolean;
  interagiu: boolean;
  iniciou: boolean;
  iniciouTeste: boolean;
  pagou: boolean;
  receitaUsd: number;
  /** Casamentos de atribuição em QUALQUER evento dele (Dev Notes → Regra de canal medida). */
  campanha: boolean;
  gclid: boolean;
  fbclid: boolean;
  installReferrer: boolean;
  organico: boolean;
  ios: boolean;
}

/**
 * AC3 — o canal do usuário: a PRIMEIRA regra que casa, nesta prioridade —
 * campanha identificável > `gclid` > `fbclid` > `ig4a`/`fb4a` > orgânico ou
 * cupom > sem atribuição iOS > sem atribuição Android/outro. Um usuário com
 * `gclid` e `ig4a` é Google.
 */
export function canalDoUsuario(s: Pick<SinaisDoUsuario, "campanha" | "gclid" | "fbclid" | "installReferrer" | "organico" | "ios">): CanalDaJornada {
  if (s.campanha) return "campanha";
  if (s.gclid) return "google_gclid";
  if (s.fbclid) return "meta_fbclid";
  if (s.installReferrer) return "meta_install";
  if (s.organico) return "organico";
  if (s.ios) return "sem_ios";
  return "sem_android";
}

export interface ContagemDaJornada {
  novos: number;
  viuPaywall: number;
  interagiu: number;
  iniciou: number;
  iniciouTeste: number;
  pagou: number;
  receitaUsd: number;
}

export interface LinhaDaJornada extends ContagemDaJornada {
  canal: CanalDaJornada;
  rotulo: string;
}

const zerada = (): ContagemDaJornada => ({ novos: 0, viuPaywall: 0, interagiu: 0, iniciou: 0, iniciouTeste: 0, pagou: 0, receitaUsd: 0 });

function somar(c: ContagemDaJornada, u: SinaisDoUsuario): void {
  c.novos += 1;
  if (u.viuPaywall) c.viuPaywall += 1;
  if (u.interagiu) c.interagiu += 1;
  if (u.iniciou) c.iniciou += 1;
  if (u.iniciouTeste) c.iniciouTeste += 1;
  if (u.pagou) c.pagou += 1;
  c.receitaUsd += u.pagou ? u.receitaUsd : 0;
}

/**
 * AC2 — coorte e contagem. Entra quem teve o PRIMEIRO evento na janela
 * (`primeiroEvento >= desde`); cada usuário conta uma vez por etapa e cai em
 * um canal só. As 7 linhas saem sempre, na ordem de exibição, mesmo zeradas —
 * canal sem ninguém é "0", não "some". A receita fecha em centavos.
 */
export function montarJornada(usuarios: readonly SinaisDoUsuario[], desde: Date): { linhas: LinhaDaJornada[]; total: ContagemDaJornada } {
  const porCanal = new Map<CanalDaJornada, ContagemDaJornada>(CANAIS_DA_JORNADA.map((c) => [c.canal, zerada()]));
  const total = zerada();
  for (const u of usuarios) {
    if (!u.primeiroEvento || u.primeiroEvento.getTime() < desde.getTime()) continue;
    somar(porCanal.get(canalDoUsuario(u))!, u);
    somar(total, u);
  }
  const centavos = (v: number) => Math.round(v * 100) / 100;
  return {
    linhas: CANAIS_DA_JORNADA.map(({ canal, rotulo }) => {
      const c = porCanal.get(canal)!;
      return { canal, rotulo, ...c, receitaUsd: centavos(c.receitaUsd) };
    }),
    total: { ...total, receitaUsd: centavos(total.receitaUsd) },
  };
}

// ─────────────────────────── SQL ───────────────────────────

const REVENUE = sql.join([...REVENUE_EVENT_TYPES].map((t) => sql`${t}`), sql`, `);
const c = revenuecatSales;
const evento = sql`${c.payload}->'event'`;

/** Escopo dos eventos: a etapa, com usuário, sem `TEST` (como a medição). */
export function escopoDaJornada(stageId: string): SQL {
  return and(eq(c.stageId, stageId), isNotNull(c.appUserId), ne(c.eventType, "TEST"))!;
}

/** AC2 — a coorte: o primeiro evento do usuário (em toda a série) cai na janela. */
export function coorteDaJornada(desde: Date): SQL {
  return sql`min(${c.eventAt}) >= ${desde.toISOString()}::timestamptz`;
}

/** Uma condição por usuário: `true` se ALGUM evento dele casa (`bool_or`, nulo vira `false`). */
const algum = (cond: SQL) => sql`coalesce(bool_or(${cond}), false)`;

/**
 * Colunas por usuário. O `app_user_id` só aparece no GROUP BY — nunca aqui.
 * Nomes em snake_case: é o que o `execute` do node-postgres devolve.
 */
export const COLUNAS_DA_JORNADA = {
  primeiro_evento: sql`min(${c.eventAt})`,
  viu_paywall: algum(sql`${c.eventType} LIKE 'PAYWALL%'`),
  interagiu: algum(sql`${c.eventType} = 'PAYWALL_COMPONENT_INTERACTED'`),
  // PO-03: iniciou = INITIAL_PURCHASE ou NON_RENEWING_PURCHASE, qualquer period_type
  iniciou: algum(sql`${c.eventType} IN ('INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE')`),
  // period_type NÃO é coluna — vem do payload (PO-01)
  iniciou_teste: algum(sql`${c.eventType} = 'INITIAL_PURCHASE' AND ${evento}->>'period_type' = 'TRIAL'`),
  // PO-01: pagou = evento de REVENUE_EVENT_TYPES com revenue_usd > 0 (o teste de US$ 0 e o promocional de US$ 0 ficam fora)
  pagou: algum(sql`${c.eventType} IN (${REVENUE}) AND ${c.revenueUsd} > 0`),
  receita_usd: sql`coalesce(sum(${c.revenueUsd}) FILTER (WHERE ${c.eventType} IN (${REVENUE}) AND ${c.revenueUsd} > 0), 0)::float8`,
  // Regra de canal medida (Dev Notes, PO-02) — cada uma em QUALQUER evento do usuário
  c_campanha: algum(
    sql`${c.utmCampaign} LIKE '1202%' OR ${c.utmContent} LIKE '1202%' OR ${c.utmMedium} LIKE '1202%' OR ${c.utmSource} = 'google-ads' OR ${c.utmCampaign} ~ '^2[0-9]{10}$'`,
  ),
  c_gclid: algum(sql`${c.gclid} IS NOT NULL`),
  c_fbclid: algum(sql`${c.fbclid} IS NOT NULL`),
  c_install: algum(sql`${c.utmCampaign} IN ('ig4a', 'fb4a') OR ${c.utmSource} IN ('apps.instagram.com', 'apps.facebook.com')`),
  // A lista de valores orgânicos é a de 23/09: valor novo de utm_source cai em iOS/Android até alguém incluí-lo.
  c_organico: algum(
    sql`${c.utmMedium} = 'organic' OR ${c.utmSource} IN ('ig', 'website', 'google', 'chatgpt.com', 'latam_Med', 'google-play') OR ${c.utmContent} = 'link_in_bio' OR jsonb_exists(${evento}->'subscriber_attributes', 'coupom_code')`,
  ),
  // PO-04: `platform` vem em 100% dos eventos de paywall (probe de 23/09) — iOS e Android ficam separados
  c_ios: algum(sql`upper(${evento}->>'platform') = 'IOS' OR ${c.store} = 'APP_STORE'`),
} as const;

/** A consulta inteira: uma linha por usuário da coorte, sem o id. */
export function consultaDaJornada(stageId: string, desde: Date): SQL {
  const colunas = sql.join(
    Object.entries(COLUNAS_DA_JORNADA).map(([nome, expr]) => sql`${expr} AS ${sql.identifier(nome)}`),
    sql`, `,
  );
  return sql`SELECT ${colunas} FROM ${c} WHERE ${escopoDaJornada(stageId)} GROUP BY ${c.appUserId} HAVING ${coorteDaJornada(desde)}`;
}

/**
 * AC4(a) — a data do primeiro evento de ASSINATURA da etapa (mesmo cálculo do
 * `serieDesde` da 42.9): antes dela só há paywall, e a jornada da janela que
 * começa antes disso é incompleta. Vem do dado, não fixa no código.
 */
export function consultaDoInicioDaAssinatura(stageId: string): SQL {
  return sql`SELECT min(${c.eventAt}) AS desde FROM ${c} WHERE ${c.stageId} = ${stageId} AND ${c.eventType} NOT LIKE 'PAYWALL%' AND ${c.eventType} <> 'TEST'`;
}

/** Linha crua do `execute` → sinais tipados. `numeric`/`float8` e timestamp chegam em formatos variados. */
export function lerLinhaDaJornada(r: Record<string, unknown>): SinaisDoUsuario {
  const data = (v: unknown): Date | null => {
    if (v instanceof Date) return v;
    if (typeof v === "string" && v) {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  };
  const numero = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    primeiroEvento: data(r.primeiro_evento),
    viuPaywall: r.viu_paywall === true,
    interagiu: r.interagiu === true,
    iniciou: r.iniciou === true,
    iniciouTeste: r.iniciou_teste === true,
    pagou: r.pagou === true,
    receitaUsd: numero(r.receita_usd),
    campanha: r.c_campanha === true,
    gclid: r.c_gclid === true,
    fbclid: r.c_fbclid === true,
    installReferrer: r.c_install === true,
    organico: r.c_organico === true,
    ios: r.c_ios === true,
  };
}
