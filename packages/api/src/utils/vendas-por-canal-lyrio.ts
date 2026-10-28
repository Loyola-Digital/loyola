/**
 * Story 42.12 — as vendas do Lyrio separadas por canal (Meta, Google, orgânico
 * ou cupom, sem atribuição), a partir dos eventos do webhook do RevenueCat.
 *
 * Mesmo desenho da 42.11 (`jornada-lyrio.ts`), pelo mesmo motivo (a suíte não
 * tem banco de produção):
 *
 *  1. SQL (`consultaDeVendasPorCanal`): reduz os eventos da etapa a UMA linha
 *     por usuário que pagou na janela, SEM o id. Os sinais de canal olham a
 *     série INTEIRA do usuário (D6), a venda só a janela.
 *  2. Função pura (`canalDaVenda`, `montarVendasPorCanal`): a regra de canal, a
 *     contagem e a quebra da Meta por entidade.
 *
 * Regra de canal — decisões do Danilo em 2026-10-13 (story, D2…D7):
 *  - Meta   = `ad_network = 'meta'` ou `meta_campaign_id`/`meta_adset_id`/`meta_ad_id` com valor válido
 *  - Google = `ad_network = 'google'` ou `gclid`
 *  - Orgânico ou cupom = a regra da 42.11, sem mudança
 *  - Sem atribuição = o resto — inclusive quem só tem `ig4a`/`fb4a`/`fbclid` (D2)
 *  - Meta E Google = `conflito`: não entra em nenhum dos dois (D7, "impossível;
 *    se acontecer, sinalize — pode ser bug na integração")
 *
 * Nunca devolve nem loga `app_user_id` (nem e-mail, IP, IDFA): a consulta
 * AGRUPA pelo id mas não o seleciona.
 */

import { and, eq, inArray, isNotNull, ne, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { revenuecatSales } from "../db/schema.js";
import { REVENUE_EVENT_TYPES } from "../services/revenuecat.js";
import { toBusinessDayKey } from "./sale-date.js";

const c = revenuecatSales;
const REVENUE = [...REVENUE_EVENT_TYPES];
const atributos = sql`(${c.payload}->'event'->'subscriber_attributes')`;

// ─────────────────────── leitura de atributo no SQL ───────────────────────

/**
 * Um atributo de `subscriber_attributes`, com a MESMA semântica de
 * `readSubscriberAttribute` (`services/revenuecat.ts`) — que é TypeScript e
 * não roda dentro de um `GROUP BY` (PO-01):
 *
 *  - os dois formatos que chegam em produção: string plana e `{ value, updated_at_ms }`;
 *    número e booleano viram texto;
 *  - `subscriber_attributes` que não é objeto (escalar, array) → ausente;
 *  - espaços nas pontas fora; vazio → ausente;
 *  - lixo conhecido (`ehLixoDeAtribuicao`): macro `{{…}}` que não interpolou e `(not set)` → ausente.
 *
 * `jsonb_exists` (chave presente) NÃO serve: deixaria a macro `{{ad.id}}` contar
 * como Meta. A equivalência com a função TS é provada no PGlite
 * (`__tests__/vendas-por-canal-lyrio.test.ts`).
 *
 * Diferenças conhecidas, fora do que chega hoje: número com casas decimais
 * (`4.50` → `"4.50"` aqui, `"4.5"` no TS) e espaço Unicode nas pontas (o
 * `trim()` do JS remove, o `btrim` daqui não).
 */
export function atributo(chave: string, fonte: SQL = atributos): SQL {
  // Desempenho (medido em produção, 2026-10-13, 186 mil eventos na etapa):
  //  - a guarda `?` vem antes: quase nenhum evento tem estes atributos (paywall é
  //    a maioria), e testar a chave é muito mais barato que ler o valor. Sem a
  //    chave o resultado já seria NULL — `?` num escalar/array pode dar true,
  //    mas aí `fonte -> chave` devolve NULL e a semântica não muda;
  //  - SEM subconsulta escalar: ela reaproveitaria o `fonte -> chave`, mas é
  //    restrita a paralelismo e derrubava a agregação paralela da Jornada
  //    (534 ms na `main` → 1,49 s). Repetir a expressão só custa nos eventos
  //    que passam pela guarda.
  const a = sql`((${fonte}) -> ${chave}::text)`;
  const texto = sql`CASE jsonb_typeof(${a}) WHEN 'string' THEN ${a} #>> '{}' WHEN 'number' THEN ${a} #>> '{}' WHEN 'boolean' THEN ${a} #>> '{}' WHEN 'object' THEN CASE WHEN jsonb_typeof(${a} -> 'value') IN ('string', 'number', 'boolean') THEN ${a} ->> 'value' END END`;
  const limpo = sql`nullif(btrim(${texto}, E' \\t\\n\\r\\f\\v'), '')`;
  return sql`(CASE WHEN (${fonte}) ? ${chave}::text THEN (CASE WHEN ${limpo} ~ '^[{][{].*[}][}]$' OR ${limpo} = '(not set)' THEN NULL ELSE ${limpo} END) END)`;
}

/** Regra 1 — o evento tem sinal da Meta (D2, D2b). */
export function sinalMeta(fonte: SQL = atributos): SQL {
  return sql`(${atributo("ad_network", fonte)} = 'meta' OR ${atributo("meta_campaign_id", fonte)} IS NOT NULL OR ${atributo("meta_adset_id", fonte)} IS NOT NULL OR ${atributo("meta_ad_id", fonte)} IS NOT NULL)`;
}

/** Regra 2 — o evento tem sinal do Google (D2, D2a: o `gclid` também conta). */
export function sinalGoogle(fonte: SQL = atributos, gclid: SQL = sql`${c.gclid}`): SQL {
  return sql`(${atributo("ad_network", fonte)} = 'google' OR ${gclid} IS NOT NULL)`;
}

/**
 * Regra 3 — orgânico ou cupom: a regra 5 da 42.11, sem mudança (story,
 * "Regra de canal"). Mora aqui e a Jornada importa, para as duas telas não
 * divergirem sem ninguém ver. A lista de valores é a de 23/09.
 */
export const CONDICAO_ORGANICO: SQL = sql`(${c.utmMedium} = 'organic' OR ${c.utmSource} IN ('ig', 'website', 'google', 'chatgpt.com', 'latam_Med', 'google-play') OR ${c.utmContent} = 'link_in_bio' OR jsonb_exists(${c.payload}->'event'->'subscriber_attributes', 'coupom_code'))`;

// ─────────────────────────── canais ───────────────────────────

export type CanalDaVenda = "meta" | "google" | "organico" | "sem_atribuicao";

/** A ordem de exibição e o rótulo. O conflito NÃO é linha: é aviso (D7). */
export const CANAIS_DA_VENDA: readonly { canal: CanalDaVenda; rotulo: string }[] = [
  { canal: "meta", rotulo: "Meta" },
  { canal: "google", rotulo: "Google" },
  { canal: "organico", rotulo: "Orgânico ou cupom" },
  { canal: "sem_atribuicao", rotulo: "Sem atribuição" },
];

/** O que o banco devolve por usuário que pagou na janela — sem o id. */
export interface CompradorDoLyrio {
  /** Sinais em QUALQUER evento dele, em toda a série da etapa (D6). */
  meta: boolean;
  google: boolean;
  organico: boolean;
  /** Eventos pagos dele na janela (D4: `REVENUE_EVENT_TYPES` com `revenue_usd > 0`). */
  vendas: number;
  receitaUsd: number;
  /** Do evento mais recente que traz cada um (PO-06; hoje cada usuário tem um só). */
  metaCampaignId: string | null;
  metaCampaignName: string | null;
  metaAdsetName: string | null;
  metaAdName: string | null;
}

export function canalDaVenda(u: Pick<CompradorDoLyrio, "meta" | "google" | "organico">): CanalDaVenda | "conflito" {
  if (u.meta && u.google) return "conflito";
  if (u.meta) return "meta";
  if (u.google) return "google";
  if (u.organico) return "organico";
  return "sem_atribuicao";
}

export interface ContagemDeVendas {
  vendas: number;
  compradores: number;
  receitaUsd: number;
}

/**
 * Uma linha da quebra da Meta. `chave` é o que casa com a linha do
 * Detalhamento: o id da CAMPANHA, e o NOME (aparado) do conjunto e do anúncio,
 * porque `/all-adsets` e `/all-ads` agregam por nome (`services/traffic-analytics.ts`,
 * `adset_name.trim()` / `ad_name.trim()`). `null` = usuário Meta sem o
 * atributo daquele nível ("não identificado", D2b).
 */
export interface EntidadeMeta extends ContagemDeVendas {
  chave: string | null;
  /** Nome para exibir quando a chave não casar com nenhuma linha da tabela. */
  nome: string | null;
}

export interface VendasPorCanal {
  canais: (ContagemDeVendas & { canal: CanalDaVenda; rotulo: string })[];
  conflito: ContagemDeVendas;
  /** As 4 linhas mais o conflito. */
  totalPago: ContagemDeVendas;
  metaPorEntidade: { campaign: EntidadeMeta[]; adset: EntidadeMeta[]; ad: EntidadeMeta[] };
}

/** Em centavos, para as linhas somarem o total ao centavo (memorial fecha a conta). */
const emCentavos = (usd: number) => Math.round(usd * 100);
const zerada = () => ({ vendas: 0, compradores: 0, centavos: 0 });
type Acumulador = ReturnType<typeof zerada>;
const somar = (a: Acumulador, u: CompradorDoLyrio, centavos: number) => {
  a.vendas += u.vendas;
  a.compradores += 1;
  a.centavos += centavos;
};
const fechar = (a: Acumulador): ContagemDeVendas => ({ vendas: a.vendas, compradores: a.compradores, receitaUsd: a.centavos / 100 });

/**
 * As 4 linhas saem sempre, na ordem de exibição, mesmo zeradas. Usuário sem
 * venda paga na janela não entra (o HAVING do SQL já corta; aqui de novo, para
 * a função valer sozinha).
 */
export function montarVendasPorCanal(compradores: readonly CompradorDoLyrio[]): VendasPorCanal {
  const porCanal = new Map<CanalDaVenda, Acumulador>(CANAIS_DA_VENDA.map((x) => [x.canal, zerada()]));
  const conflito = zerada();
  const total = zerada();
  const niveis = {
    campaign: new Map<string | null, Acumulador & { nome: string | null }>(),
    adset: new Map<string | null, Acumulador & { nome: string | null }>(),
    ad: new Map<string | null, Acumulador & { nome: string | null }>(),
  };
  const somarNoNivel = (nivel: keyof typeof niveis, chave: string | null, nome: string | null, u: CompradorDoLyrio, centavos: number) => {
    const m = niveis[nivel];
    let a = m.get(chave);
    if (!a) {
      a = { ...zerada(), nome };
      m.set(chave, a);
    }
    somar(a, u, centavos);
  };

  for (const u of compradores) {
    if (u.vendas <= 0) continue;
    const centavos = emCentavos(u.receitaUsd);
    const canal = canalDaVenda(u);
    somar(canal === "conflito" ? conflito : porCanal.get(canal)!, u, centavos);
    somar(total, u, centavos);
    if (canal !== "meta") continue;
    somarNoNivel("campaign", u.metaCampaignId, u.metaCampaignName ?? u.metaCampaignId, u, centavos);
    somarNoNivel("adset", u.metaAdsetName, u.metaAdsetName, u, centavos);
    somarNoNivel("ad", u.metaAdName, u.metaAdName, u, centavos);
  }

  const entidades = (m: Map<string | null, Acumulador & { nome: string | null }>): EntidadeMeta[] =>
    [...m.entries()]
      .map(([chave, a]) => ({ chave, nome: a.nome, ...fechar(a) }))
      .sort((x, y) => y.receitaUsd - x.receitaUsd || y.vendas - x.vendas || String(x.chave).localeCompare(String(y.chave)));

  return {
    canais: CANAIS_DA_VENDA.map(({ canal, rotulo }) => ({ canal, rotulo, ...fechar(porCanal.get(canal)!) })),
    conflito: fechar(conflito),
    totalPago: fechar(total),
    metaPorEntidade: { campaign: entidades(niveis.campaign), adset: entidades(niveis.adset), ad: entidades(niveis.ad) },
  };
}

// ─────────────── Story 42.19 (AC3) — a venda por entidade e por dia ───────────────

/**
 * Um comprador num dia de SP em que ele pagou, sem o id. Sinais e atribuição
 * são os DO COMPRADOR (os da linha dele em `CompradorDoLyrio`), não os do dia.
 */
export interface DiaDoComprador extends Omit<CompradorDoLyrio, "receitaUsd"> {
  /** `AAAA-MM-DD`, o dia de SP de `purchased_at`. */
  dia: string;
  /** O centavo do dia: `round(acumulado até o dia) − round(acumulado até a véspera)`, em centavos de dólar. */
  centavos: number;
}

/**
 * Um dia de uma entidade da Meta. `chave` é a MESMA de `EntidadeMeta` (id da
 * campanha; nome aparado do conjunto e do anúncio; `null` = não identificado).
 * `vendas` e `receitaUsd` somam, por entidade, a linha de `metaPorEntidade`
 * (AC3b). `compradores` é quem pagou NAQUELE dia: quem paga em dois dias
 * conta nos dois, então a soma dos dias pode passar do `compradores` da linha.
 */
export interface DiaDaEntidadeMeta {
  chave: string | null;
  dia: string;
  vendas: number;
  compradores: number;
  receitaUsd: number;
}

export interface VendasPorDiaDaMeta {
  campaign: DiaDaEntidadeMeta[];
  adset: DiaDaEntidadeMeta[];
  ad: DiaDaEntidadeMeta[];
}

/**
 * AC3a/AC3b — `metaPorEntidadeDiario`: a mesma regra de canal (`canalDaVenda`)
 * e a mesma chave de `montarVendasPorCanal`, com o dia. Ordem: chave (a
 * `null` primeiro), depois o dia.
 */
export function montarVendasPorDiaDaMeta(dias: readonly DiaDoComprador[]): VendasPorDiaDaMeta {
  const niveis = {
    campaign: new Map<string, DiaDaEntidadeMeta & { centavosAcumulados: number }>(),
    adset: new Map<string, DiaDaEntidadeMeta & { centavosAcumulados: number }>(),
    ad: new Map<string, DiaDaEntidadeMeta & { centavosAcumulados: number }>(),
  };
  const somar = (nivel: keyof typeof niveis, chave: string | null, d: DiaDoComprador) => {
    const m = niveis[nivel];
    const k = `${chave === null ? "\u0000" : `\u0001${chave}`}\u0002${d.dia}`;
    let a = m.get(k);
    if (!a) {
      a = { chave, dia: d.dia, vendas: 0, compradores: 0, receitaUsd: 0, centavosAcumulados: 0 };
      m.set(k, a);
    }
    a.vendas += d.vendas;
    a.compradores += 1;
    a.centavosAcumulados += d.centavos;
  };
  for (const d of dias) {
    if (d.vendas <= 0) continue;
    if (canalDaVenda(d) !== "meta") continue;
    somar("campaign", d.metaCampaignId, d);
    somar("adset", d.metaAdsetName, d);
    somar("ad", d.metaAdName, d);
  }
  const lista = (m: (typeof niveis)["campaign"]): DiaDaEntidadeMeta[] =>
    [...m.entries()]
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
      .map(([, a]) => ({ chave: a.chave, dia: a.dia, vendas: a.vendas, compradores: a.compradores, receitaUsd: a.centavosAcumulados / 100 }));
  return { campaign: lista(niveis.campaign), adset: lista(niveis.adset), ad: lista(niveis.ad) };
}

// ─────────────── Story 42.17 (AC3) — o total pago por dia ───────────────

/** Um dia de SP do `totalPago`: as vendas pagas e a receita (US$) daquele dia, de todos os canais. */
export interface DiaDoTotalPago {
  /** `AAAA-MM-DD`, o dia de SP de `purchased_at`. */
  dia: string;
  vendas: number;
  receitaUsd: number;
}

/**
 * AC3a — `diario`: o `totalPago` de `montarVendasPorCanal` aberto por dia de
 * SP, com a MESMA regra (venda paga, com usuário e com valor) e sem filtro de
 * canal: os 4 canais e o conflito, como o total. Lê as linhas `grao = 'dia'`
 * de `consultaDeVendasPorCanalComDias` — a mesma consulta da quebra (AC3b),
 * sem leitura a mais. O centavo de cada dia é o do acumulado do comprador
 * (`lerDiaDeVendas`), então a soma dos dias é o `totalPago` ao centavo.
 * Ordem: o dia, crescente. Só dias com venda.
 */
export function montarDiarioDoTotalPago(dias: readonly DiaDoComprador[]): DiaDoTotalPago[] {
  const porDia = new Map<string, { vendas: number; centavos: number }>();
  for (const d of dias) {
    if (d.vendas <= 0) continue;
    const a = porDia.get(d.dia) ?? { vendas: 0, centavos: 0 };
    a.vendas += d.vendas;
    a.centavos += d.centavos;
    porDia.set(d.dia, a);
  }
  return [...porDia.entries()]
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([dia, a]) => ({ dia, vendas: a.vendas, receitaUsd: a.centavos / 100 }));
}

// ─────────────────────────── SQL ───────────────────────────

/** Escopo dos eventos: a etapa, com usuário, sem `TEST` (o mesmo da Jornada). */
export function escopoDasVendas(stageId: string): SQL {
  return and(eq(c.stageId, stageId), isNotNull(c.appUserId), ne(c.eventType, "TEST"))!;
}

/**
 * Venda paga NA JANELA: D4 e o corte por `purchased_at`, a mesma coluna de
 * `/revenuecat/sales` (PO-02) — é contra o card daquela rota que a quebra é lida.
 */
export function vendaPagaNaJanela(desde: Date): SQL {
  return sql`ev.event_type IN (${sql.join(REVENUE.map((t) => sql`${t}`), sql`, `)}) AND ev.revenue_usd > 0 AND ev.purchased_at >= ${desde.toISOString()}::timestamptz`;
}

/** O valor do evento mais recente que traz o atributo (PO-06). */
const maisRecente = (coluna: string) =>
  sql`(array_agg(${sql.identifier(coluna)} ORDER BY ev.event_at DESC NULLS LAST) FILTER (WHERE ${sql.identifier(coluna)} IS NOT NULL))[1]`;

/**
 * As CTEs comuns da quebra por comprador e da quebra por dia (Story 42.19):
 * `compradores` → `base` → `ev`. A mesma regra de venda e de atribuição nas
 * duas, por construção — é o texto SQL que se repete, não uma segunda cópia.
 */
function ctesDosCompradores(stageId: string, desde: Date): SQL {
  // `base` MATERIALIZED: o `payload` é descompactado UMA vez por evento e os
  // atributos são lidos do `sa`, já pequeno. Sem o MATERIALIZED o Postgres
  // embute a CTE e volta a ler o `payload` em cada atributo.
  //
  // `compradores` antes de tudo: só quem pagou na janela interessa, e são
  // centenas de 186 mil eventos. Os sinais continuam olhando a série INTEIRA
  // de cada um (D6) — o corte é de usuário, não de evento.
  const sa = sql`base.sa`;
  const pagoNoEvento = sql`${c.eventType} IN (${sql.join(REVENUE.map((t) => sql`${t}`), sql`, `)}) AND ${c.revenueUsd} > 0 AND ${c.purchasedAt} >= ${desde.toISOString()}::timestamptz`;
  return sql`compradores AS MATERIALIZED (
    SELECT DISTINCT ${c.appUserId} AS app_user_id FROM ${c} WHERE ${escopoDasVendas(stageId)} AND ${pagoNoEvento}
  ), base AS MATERIALIZED (
    SELECT ${c.appUserId} AS app_user_id, ${c.eventType} AS event_type, ${c.revenueUsd} AS revenue_usd,
      ${c.purchasedAt} AS purchased_at, ${c.eventAt} AS event_at, ${c.gclid} AS gclid,
      ${CONDICAO_ORGANICO} AS s_organico, ${atributos} AS sa
    FROM ${c} WHERE ${escopoDasVendas(stageId)} AND ${c.appUserId} IN (SELECT compradores.app_user_id FROM compradores)
  ), ev AS (
    SELECT base.app_user_id, base.event_type, base.revenue_usd, base.purchased_at, base.event_at, base.s_organico,
      ${sinalMeta(sa)} AS s_meta, ${sinalGoogle(sa, sql`base.gclid`)} AS s_google,
      ${atributo("meta_campaign_id", sa)} AS a_campaign_id, ${atributo("meta_campaign_name", sa)} AS a_campaign_name,
      ${atributo("meta_adset_name", sa)} AS a_adset_name, ${atributo("meta_ad_name", sa)} AS a_ad_name
    FROM base
  )`;
}

/** As colunas de UM comprador (agrupado por `ev.app_user_id`), sem o id. */
function colunasDoComprador(desde: Date): SQL {
  const pago = vendaPagaNaJanela(desde);
  return sql`coalesce(bool_or(ev.s_meta), false) AS s_meta,
    coalesce(bool_or(ev.s_google), false) AS s_google,
    coalesce(bool_or(ev.s_organico), false) AS s_organico,
    (count(*) FILTER (WHERE ${pago}))::int AS vendas,
    coalesce(sum(ev.revenue_usd) FILTER (WHERE ${pago}), 0)::float8 AS receita_usd,
    ${maisRecente("a_campaign_id")} AS meta_campaign_id,
    ${maisRecente("a_campaign_name")} AS meta_campaign_name,
    ${maisRecente("a_adset_name")} AS meta_adset_name,
    ${maisRecente("a_ad_name")} AS meta_ad_name`;
}

/**
 * Uma linha por usuário que pagou na janela, sem o id. Os atributos são lidos
 * UMA vez por evento (CTE), e os sinais olham a série inteira do usuário — a
 * janela só entra no FILTER das vendas e no HAVING (D6).
 */
export function consultaDeVendasPorCanal(stageId: string, desde: Date): SQL {
  const pago = vendaPagaNaJanela(desde);
  return sql`WITH ${ctesDosCompradores(stageId, desde)}
  SELECT ${colunasDoComprador(desde)}
  FROM ev GROUP BY ev.app_user_id HAVING count(*) FILTER (WHERE ${pago}) > 0`;
}

/**
 * Story 42.19 (AC3) — a MESMA consulta, com o grão comprador × dia junto, numa
 * leitura só (as CTEs rodam uma vez). `grao = 'comprador'`: as linhas de
 * `consultaDeVendasPorCanal`, coluna a coluna. `grao = 'dia'`: uma por
 * comprador e dia de SP da venda (`diaNoFusoDoNegocio(purchased_at)`), com a
 * atribuição e os sinais DO COMPRADOR (os mesmos da linha dele) — é o que faz os
 * dias somarem a linha (AC3b, R2/PO-03: a venda do dia vai para o anúncio mais
 * recente do comprador, que pode ser de outro dia).
 *
 * A receita do dia sai como ACUMULADO do comprador até o dia e até a véspera
 * (`numeric`, exato): o centavo do dia é `round(até o dia) − round(até a
 * véspera)`, e a soma dos dias telescopa no `round(total)` — o mesmo centavo da
 * linha do comprador. `revenue_usd` tem 4 casas (`numeric(14,4)`); arredondar
 * cada dia por conta própria deixaria a soma dos dias a 1 centavo da linha.
 *
 * Nenhum id de usuário sai: ele agrupa, particiona e junta, mas não é coluna.
 */
export function consultaDeVendasPorCanalComDias(stageId: string, desde: Date): SQL {
  const pago = vendaPagaNaJanela(desde);
  const dia = diaNoFusoDoNegocio(sql`ev.purchased_at`);
  return sql`WITH ${ctesDosCompradores(stageId, desde)}, u AS (
    SELECT ev.app_user_id, ${colunasDoComprador(desde)}
    FROM ev GROUP BY ev.app_user_id HAVING count(*) FILTER (WHERE ${pago}) > 0
  ), dias AS (
    SELECT ev.app_user_id, ${dia} AS dia, count(*)::int AS vendas, sum(ev.revenue_usd) AS receita
    FROM ev WHERE ${pago} GROUP BY ev.app_user_id, ${dia}
  ), d AS (
    SELECT dias.app_user_id, dias.dia, dias.vendas, dias.receita,
      sum(dias.receita) OVER (PARTITION BY dias.app_user_id ORDER BY dias.dia COLLATE "C") AS acumulado
    FROM dias
  )
  SELECT 'comprador'::text AS grao, NULL::text AS dia, u.s_meta, u.s_google, u.s_organico, u.vendas, u.receita_usd,
    NULL::float8 AS receita_ate_o_dia, NULL::float8 AS receita_ate_a_vespera,
    u.meta_campaign_id, u.meta_campaign_name, u.meta_adset_name, u.meta_ad_name
  FROM u
  UNION ALL
  SELECT 'dia'::text, d.dia, u.s_meta, u.s_google, u.s_organico, d.vendas, NULL::float8,
    d.acumulado::float8, (d.acumulado - d.receita)::float8,
    u.meta_campaign_id, u.meta_campaign_name, u.meta_adset_name, u.meta_ad_name
  FROM d JOIN u ON u.app_user_id = d.app_user_id`;
}

/**
 * O que o card "Vendas" de `/revenuecat/sales` conta e a quebra NÃO conta, no
 * mesmo escopo daquela rota (etapa, `REVENUE_EVENT_TYPES`, `purchased_at` na
 * janela): eventos de US$ 0 (teste grátis, promocional) e eventos pagos sem
 * `app_user_id`. Com eles, `totalPago.vendas + semValor + semUsuario` = o card
 * (PO-03) — a tela declara a diferença com número, não com adjetivo.
 */
export function consultaDoQueFicaForaDaQuebra(stageId: string, desde: Date): SQL {
  return sql`SELECT
    (count(*) FILTER (WHERE coalesce(${c.revenueUsd}, 0) <= 0))::int AS sem_valor,
    (count(*) FILTER (WHERE ${c.revenueUsd} > 0 AND ${c.appUserId} IS NULL))::int AS sem_usuario
  FROM ${c} WHERE ${and(eq(c.stageId, stageId), sql`${c.purchasedAt} >= ${desde.toISOString()}::timestamptz`, inArray(c.eventType, REVENUE))}`;
}

/**
 * Quanto um evento pode chegar depois de acontecer e ainda contar para a
 * cobertura dos atributos (`consultaDoInicioDosAtributos`).
 *
 * Medido em produção (Story 42.14, sonda de 2026-10-27): a etapa Lyrio recebeu,
 * de 14 a 25/10, 26 eventos de PAYWALL com `event_at` de agosto e setembro (54 a
 * 64 dias de atraso) já com os atributos de hoje. Com eles, o início da
 * cobertura recuava de 06/10 para 06/08, e a tela deixava de avisar que a Meta
 * só tem atribuição desde outubro (os novos pagantes da Meta eram 70 em 28 E em
 * 90 dias). O fluxo normal chega em até ~3 dias (o lote de 06/10 foi gravado em
 * 09/10); 7 dias dá folga sem readmitir o atraso de meses.
 */
export const ATRASO_MAXIMO_DA_COBERTURA = "7 days";

/**
 * AC6 — desde quando a etapa recebe os atributos de canal (`ad_network` ou id
 * de campanha da Meta). Janela que começa antes disso subconta Meta e Google.
 * Vem do dado, não fixa no código (06/10/2026).
 *
 * Só conta o evento ENTREGUE no prazo (`created_at` até `event_at` +
 * `ATRASO_MAXIMO_DA_COBERTURA`): um evento antigo que chega meses depois traz os
 * atributos do dia em que chegou, não os do dia em que aconteceu, e não prova
 * que havia atribuição naquela data.
 */
export function consultaDoInicioDosAtributos(stageId: string): SQL {
  return sql`SELECT min(${c.eventAt}) AS desde FROM ${c} WHERE ${c.stageId} = ${stageId} AND (${atributo("ad_network")} IS NOT NULL OR ${atributo("meta_campaign_id")} IS NOT NULL) AND ${c.createdAt} <= ${c.eventAt} + ${ATRASO_MAXIMO_DA_COBERTURA}::interval`;
}

/** Linha crua do `execute` → comprador tipado. `float8`/`numeric` chegam em formatos variados. */
export function lerLinhaDeVendas(r: Record<string, unknown>): CompradorDoLyrio {
  const numero = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  return {
    meta: r.s_meta === true,
    google: r.s_google === true,
    organico: r.s_organico === true,
    vendas: numero(r.vendas),
    receitaUsd: numero(r.receita_usd),
    metaCampaignId: texto(r.meta_campaign_id),
    metaCampaignName: texto(r.meta_campaign_name),
    metaAdsetName: texto(r.meta_adset_name),
    metaAdName: texto(r.meta_ad_name),
  };
}

/**
 * Story 42.19 — linha `grao = 'dia'` de `consultaDeVendasPorCanalComDias` →
 * `DiaDoComprador`. `null` se a linha não tiver o dia (não deveria acontecer:
 * `purchased_at` é a coluna do corte, nunca nula numa venda da janela).
 */
export function lerDiaDeVendas(r: Record<string, unknown>): DiaDoComprador | null {
  const dia = typeof r.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.dia) ? r.dia : null;
  if (!dia) return null;
  const u = lerLinhaDeVendas(r);
  const centavosAte = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? emCentavos(n) : 0;
  };
  return {
    meta: u.meta,
    google: u.google,
    organico: u.organico,
    vendas: u.vendas,
    metaCampaignId: u.metaCampaignId,
    metaCampaignName: u.metaCampaignName,
    metaAdsetName: u.metaAdsetName,
    metaAdName: u.metaAdName,
    dia,
    centavos: centavosAte(r.receita_ate_o_dia) - centavosAte(r.receita_ate_a_vespera),
  };
}

/** `Date` | string do driver → `AAAA-MM-DD` do dia em SP, ou `null`. */
export function dataIso(v: unknown): string | null {
  // Story 42.13 (QA MNT-001): o dia de SP, a mesma régua do `desde` da janela.
  // Em UTC, um evento das 21h às 24h de SP caía no dia seguinte, e a
  // declaração de cobertura comparava dias de dois fusos.
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : toBusinessDayKey(v);
  if (typeof v === "string" && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : toBusinessDayKey(d);
  }
  return null;
}

/**
 * Story 42.13 (AC4b) — o dia (`YYYY-MM-DD`) de uma coluna `timestamptz` no fuso
 * do negócio, para o diário de `/sales`. Em UTC, a venda das 21h às 24h de SP
 * caía no dia seguinte, e o diário não fechava com a janela, que é de SP.
 */
export function diaNoFusoDoNegocio(coluna: SQL | AnyColumn): SQL<string> {
  return sql<string>`to_char(date_trunc('day', ${coluna} at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')`;
}
