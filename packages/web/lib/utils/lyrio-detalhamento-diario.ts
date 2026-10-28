/**
 * Story 42.19 — os dias de cada linha do Detalhamento da etapa Lyrio (a linha
 * expansível, D21), na forma pura: o vitest do web roda em `lib/utils`, e o
 * `.tsx` só desenha.
 *
 * ## De onde vem cada coisa
 *
 *   Meta, mídia ... `GET …/entity-daily` (29.42): UMA requisição por dimensão e
 *                   janela, do cache do Postgres, spend BRUTO.
 *   Meta, venda ... `metaPorEntidadeDiario` da `vendas-por-canal` (API v62): a
 *                   mesma consulta (e a mesma chave de cache) das vendas da linha.
 *   Google ........ as linhas do `/daily` por campanha que a 42.16 já consulta
 *                   (`TrafegoDoGoogleNaRegua.diasPorCampanha`). Só mídia (D22).
 *
 * ## As três regras que este módulo protege
 *
 *  1. **O casamento é pela chave com que a linha foi agregada (PO-01).**
 *     Campanha pelo id; Público e Criativo pelo NOME aparado, somando TODOS os
 *     ids daquele nome — `/all-adsets` e `/all-ads` agregam por
 *     `adset_name.trim()`/`ad_name.trim()`. Casar pelo id deixaria a expansão
 *     menor que a linha sempre que dois conjuntos (ou anúncios) tivessem o
 *     mesmo nome, que é a duplicação de rotina no Lyrio.
 *  2. **O imposto dos dias entra AQUI, uma vez (PO-02).** A linha da Meta já
 *     chega tributada pelo backend, e `lyrio-detail-rows.ts` proíbe imposto no
 *     módulo. O spend do `entity-daily` é bruto: o gross-up (`comImpostoMeta`,
 *     por dia) acontece antes de chamar `metaRow`. O Google não leva imposto.
 *  3. **Nenhum dia é ajustado para fechar com a linha (PO-D1, AC4c).** A linha
 *     é a consulta ao vivo; os dias, o cache. A "Σ dos dias" mostra a
 *     diferença quando ela existe. O único acerto é o de exibição, em centavos
 *     (`fecharEmCentavos`), para a coluna dos dias somar a Σ exibida (AC4e).
 */

import { inicioDaJanela, shiftDayKey } from "@loyola-x/shared/src/janela-de-dias";
import { comImpostoMeta } from "./meta-tax";
import { centavos, fecharEmCentavos } from "./lyrio-margin";
import { googleRow, metaRow, type LyrioDetailRow } from "./lyrio-detail-rows";
import type { DiaDoGoogle } from "./google-ads-na-regua";
import {
  chaveDaLinhaDoDetalhamento,
  declaracaoDeCobertura,
  type ContagemDeVendas,
  type DimensaoDoDetalhamento,
  type EstadoDasVendas,
} from "./vendas-por-canal-lyrio";

// ─────────────────────────── textos (literais da story) ───────────────────────────

/** AC1b — a marca de hoje (a mesma da 42.17 AC1d). */
export const DICA_DIA_EM_ANDAMENTO = "dia em andamento";
/** AC2d. */
export const DICA_HOOK_HOLD_DO_DIA = "não há métrica de vídeo por dia nesta fonte";
/** AC4d. */
export const DICA_SEM_COBERTURA_DO_DIA = "sem cobertura do cache neste dia";
/** AC3f / D22. */
export const DICA_GOOGLE_SEM_VENDA = "o Google não informa a campanha da venda";
/** R2 / PO-03 — literal. */
export const DICA_ATRIBUICAO_DO_DIA = "a venda do dia vai para o último anúncio em que o comprador clicou, que pode ser de outro dia";
/** AC4c — literal. A segunda parte só vale em Público e Criativo (`unattributedByDate` é vazio por campanha). */
export const DICA_DIFERENCA_DA_MIDIA =
  "cache do banco × consulta ao vivo; o investimento sem anúncio atribuído (unattributedByDate) não entra em linha de anúncio";
const DICA_DIFERENCA_DA_CAMPANHA = "cache do banco × consulta ao vivo";
/** AC5d — a API anterior à v62 não traz `metaPorEntidadeDiario`. */
export const DICA_API_SEM_VENDA_POR_DIA = "a API ainda não traz a venda por dia (contrato 62) — ver o aviso de versão";

// ─────────────────────────── a janela ───────────────────────────

/**
 * AC1b — todos os dias da janela, do mais recente ao mais antigo: de `hoje`
 * (no fuso do negócio, `hojeNoNegocio`) até `inicioDaJanela(dias)`. Os dias
 * sem dado aparecem zerados; nenhum some.
 */
export function diasDaJanela(dias: number, hoje: string): string[] {
  const n = Math.max(1, dias);
  return Array.from({ length: n }, (_, i) => shiftDayKey(hoje, -i));
}

/**
 * AC2a — o período da série do `entity-daily`, explícito. O `days` da rota
 * conta a partir do dia de HOJE EM UTC (`toISOString`), que das 21h às 24h de
 * SP já é amanhã: a série começaria um dia depois da régua. Com as datas, ela
 * é a régua de SP da linha e dos cards.
 */
export function periodoDaSerie(dias: number, hoje: string): { startDate: string; endDate: string } {
  return { startDate: inicioDaJanela(dias, hoje), endDate: hoje };
}

// ─────────────────────────── a abertura (AC1c, AC2a) ───────────────────────────

/** A chave da linha na tabela — a mesma do componente (`${platform}-${id}`). */
export function chaveDaLinha(r: Pick<LyrioDetailRow, "platform" | "id">): string {
  return `${r.platform}-${r.id}`;
}

/** AC1c — trocar de dimensão, de plataforma ou de janela fecha todas. */
export function contextoDaAbertura(plataforma: string, dimensao: DimensaoDoDetalhamento, dias: number): string {
  return `${plataforma}|${dimensao}|${dias}`;
}

/** AC1c — várias linhas abertas ao mesmo tempo; clicar de novo fecha só aquela. */
export function alternarAbertura(abertas: ReadonlySet<string>, chave: string): Set<string> {
  const novo = new Set(abertas);
  if (novo.has(chave)) novo.delete(chave);
  else novo.add(chave);
  return novo;
}

/**
 * AC2a — a série do `entity-daily` só é pedida quando há uma linha da META
 * aberta. Linha do Google aberta não pede nada (os dias dela já estão na
 * consulta do `/daily`).
 */
export function precisaDaSerieDaMeta(abertas: ReadonlySet<string>, linhas: readonly Pick<LyrioDetailRow, "platform" | "id">[]): boolean {
  return linhas.some((r) => r.platform === "meta" && abertas.has(chaveDaLinha(r)));
}

// ─────────────────────────── mídia da Meta (AC2) ───────────────────────────

/** Uma linha de `EntityDailyRow`, só o que a expansão usa. */
export interface LinhaDaSerie {
  entityId: string;
  entityName: string;
  dateStart: string;
  /** BRUTO. */
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
}

export interface MidiaDoDia {
  /** Bruto, somado em centavos. */
  spendBruto: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
}

/** AC2f — a chave da mídia: id na campanha, nome aparado no público e no criativo. */
export function chaveDaMidia(dimensao: DimensaoDoDetalhamento, r: Pick<LinhaDaSerie, "entityId" | "entityName">): string {
  return dimensao === "campaign" ? r.entityId : r.entityName.trim();
}

/** A série indexada por chave → dia, somando TODOS os ids da mesma chave (AC2f). */
export function indiceDaMidiaDaMeta(dimensao: DimensaoDoDetalhamento, rows: readonly LinhaDaSerie[]): Map<string, Map<string, MidiaDoDia>> {
  const porChave = new Map<string, Map<string, MidiaDoDia & { centavos: number }>>();
  for (const r of rows) {
    const k = chaveDaMidia(dimensao, r);
    let dias = porChave.get(k);
    if (!dias) {
      dias = new Map();
      porChave.set(k, dias);
    }
    const a = dias.get(r.dateStart) ?? { spendBruto: 0, impressions: 0, clicks: 0, linkClicks: 0, centavos: 0 };
    a.centavos += Math.round((Number(r.spend) || 0) * 100);
    a.spendBruto = a.centavos / 100;
    a.impressions += Number(r.impressions) || 0;
    a.clicks += Number(r.clicks) || 0;
    a.linkClicks += Number(r.linkClicks) || 0;
    dias.set(r.dateStart, a);
  }
  return porChave as Map<string, Map<string, MidiaDoDia>>;
}

/**
 * AC2f — a mídia da série que não casa com nenhuma linha da tabela (o nome do
 * cache veio vazio e o serviço devolveu o id; ou a entidade não tem linha no
 * período). Não some: a tela declara quanto é. Com o imposto, como os dias.
 */
export function midiaSemLinha(
  dimensao: DimensaoDoDetalhamento,
  indice: ReadonlyMap<string, ReadonlyMap<string, MidiaDoDia>>,
  linhas: readonly { id: string; name: string; platform: string }[],
): { spend: number; entidades: number } | null {
  const chaves = new Set(linhas.map((l) => chaveDaLinhaDoDetalhamento(dimensao, l)).filter((k): k is string => k !== null));
  let total = 0;
  let entidades = 0;
  for (const [k, dias] of indice) {
    if (chaves.has(k)) continue;
    entidades += 1;
    for (const [dia, m] of dias) total += comImpostoMeta(m.spendBruto, dia);
  }
  return entidades > 0 ? { spend: total, entidades } : null;
}

// ─────────────────────────── venda da Meta (AC3) ───────────────────────────

export type VendasDosDias =
  | { tipo: "indisponivel"; dica: string | null }
  | {
      tipo: "pronto";
      /** chave → dia → contagem. */
      porChave: Map<string | null, Map<string, ContagemDeVendas>>;
      /** A declaração de cobertura e o início dela (AC3e). */
      atributosDesde: string | null;
      dicaDeCobertura: string;
    };

/**
 * AC3d/AC5c/AC5d — a venda dos dias lê o MESMO resultado da `vendas-por-canal`
 * do Detalhamento. Carregando, em erro ou com a API anterior à v62 → "—" nos
 * dias (a linha e o aviso de venda do Detalhamento seguem como estão).
 */
export function vendasDosDias(estado: EstadoDasVendas, dimensao: DimensaoDoDetalhamento): VendasDosDias {
  if (estado.tipo !== "pronto") return { tipo: "indisponivel", dica: null };
  const diario = estado.dados.metaPorEntidadeDiario;
  if (!diario) return { tipo: "indisponivel", dica: DICA_API_SEM_VENDA_POR_DIA };
  const porChave = new Map<string | null, Map<string, ContagemDeVendas>>();
  for (const d of diario[dimensao] ?? []) {
    let dias = porChave.get(d.chave);
    if (!dias) {
      dias = new Map();
      porChave.set(d.chave, dias);
    }
    dias.set(d.dia, { vendas: d.vendas, compradores: d.compradores, receitaUsd: d.receitaUsd });
  }
  return { tipo: "pronto", porChave, atributosDesde: estado.dados.atributosDesde, dicaDeCobertura: declaracaoDeCobertura(estado.dados) };
}

/**
 * A chave de venda de cada linha da Meta, com a MESMA regra de
 * `vendasDoDetalhamento`: cada chave vai para UMA linha só, a primeira que
 * casar (na ordem das linhas, não da ordenação). As outras linhas da mesma
 * chave mostram 0 — como a própria linha.
 */
export function donosDasChaves(dimensao: DimensaoDoDetalhamento, linhas: readonly { id: string; name: string; platform: string }[]): Map<string, string> {
  const usadas = new Set<string>();
  const dono = new Map<string, string>();
  for (const l of linhas) {
    const k = chaveDaLinhaDoDetalhamento(dimensao, l);
    if (k === null || usadas.has(k)) continue;
    usadas.add(k);
    dono.set(`${l.platform}-${l.id}`, k);
  }
  return dono;
}

// ─────────────────────────── a expansão ───────────────────────────

export interface SubLinhaDoDia {
  dia: string;
  /** AC1b — hoje leva a marca "dia em andamento". */
  emAndamento: boolean;
  /**
   * As colunas de mídia, pela regra da linha (`metaRow`/`googleRow`). `null` →
   * "—" (AC4d). Hook e Hold são sempre `null` nos dias (AC2d, `DICA_HOOK_HOLD_DO_DIA`).
   */
  midia: LyrioDetailRow | null;
  dicaDaMidia: string | null;
  /** AC4e — o investimento EXIBIDO (`fecharEmCentavos`); `null` com a mídia em "—". */
  investimentoExibido: number | null;
  /** `null` → "—" nas colunas de venda. */
  venda: ContagemDeVendas | null;
  /** AC4e — a receita EXIBIDA, em R$ (`fecharEmCentavos`). */
  receitaBrlExibida: number | null;
  dicaDaVenda: string | null;
}

export interface SomaDosDias {
  midia: LyrioDetailRow;
  investimentoExibido: number;
  /** AC4c — a diferença Σ − linha, quando passa de R$ 0,01 ou de 0 impressão/clique. */
  diferenca: { spend: number; impressions: number; clicks: number } | null;
  dicaDaDiferenca: string | null;
  venda: ContagemDeVendas | null;
  receitaBrlExibida: number | null;
  dicaDaVenda: string | null;
}

export interface ExpansaoDaLinha {
  dias: SubLinhaDoDia[];
  soma: SomaDosDias;
}

export interface EntradaComum {
  linha: LyrioDetailRow;
  /** `diasDaJanela(days, hoje)`. */
  dias: readonly string[];
  hoje: string;
}

const dataBr = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/** AC4c — a diferença da mídia entre a Σ dos dias e a linha. `null` dentro da tolerância. */
export function diferencaDaMidia(soma: Pick<LyrioDetailRow, "spend" | "impressions" | "clicks">, linha: Pick<LyrioDetailRow, "spend" | "impressions" | "clicks">): SomaDosDias["diferenca"] {
  const spendCentavos = Math.round(soma.spend * 100) - Math.round(linha.spend * 100);
  const impressions = soma.impressions - linha.impressions;
  const clicks = (soma.clicks ?? 0) - (linha.clicks ?? 0);
  // "passa de R$ 0,01": 1 centavo é a tolerância; 2 ou mais aparece.
  if (Math.abs(spendCentavos) <= 1 && impressions === 0 && clicks === 0) return null;
  return { spend: spendCentavos / 100, impressions, clicks };
}

/** As colunas da Σ e a exibição em centavos (AC4e), para as duas plataformas. */
function fecharMidia(subs: { midia: LyrioDetailRow | null }[]): { exibidos: (number | null)[]; total: number } {
  const visiveis = subs.map((s, i) => [i, s.midia] as const).filter((x): x is readonly [number, LyrioDetailRow] => x[1] !== null);
  const total = visiveis.reduce((a, [, m]) => a + m.spend, 0);
  const partes = fecharEmCentavos(total, visiveis.map(([, m]) => m.spend));
  const exibidos: (number | null)[] = subs.map(() => null);
  visiveis.forEach(([i], j) => (exibidos[i] = partes[j]!));
  return { exibidos, total };
}

/**
 * AC1/AC2/AC3/AC4 — os dias de uma linha da META.
 *
 * `serie` é o índice de `indiceDaMidiaDaMeta` (da dimensão ativa); `semCobertura`
 * são os `daysWithoutCoverage` da resposta. `chaveDaVenda` é a de
 * `donosDasChaves` (ausente = a linha não é dona da chave → 0 de venda, como a
 * linha). `brlRate` converte a receita (US$).
 */
export function expansaoDaMeta(
  e: EntradaComum & {
    dimensao: DimensaoDoDetalhamento;
    serie: ReadonlyMap<string, ReadonlyMap<string, MidiaDoDia>>;
    semCobertura: ReadonlySet<string>;
    vendas: VendasDosDias;
    chaveDaVenda: string | undefined;
    brlRate: number | null;
  },
): ExpansaoDaLinha {
  const chave = chaveDaLinhaDoDetalhamento(e.dimensao, e.linha) ?? e.linha.id;
  const doDia = e.serie.get(chave);
  const vendaDaChave = e.vendas.tipo === "pronto" && e.chaveDaVenda !== undefined ? e.vendas.porChave.get(e.chaveDaVenda) : undefined;
  const brl = (usd: number) => (e.brlRate == null ? null : usd * e.brlRate);

  const parcial = e.dias.map((dia) => {
    let midia: LyrioDetailRow | null = null;
    let dicaDaMidia: string | null = null;
    if (e.semCobertura.has(dia)) {
      dicaDaMidia = DICA_SEM_COBERTURA_DO_DIA;
    } else {
      const m = doDia?.get(dia) ?? { spendBruto: 0, impressions: 0, clicks: 0, linkClicks: 0 };
      // PO-02: o imposto do dia entra AQUI, antes do `metaRow` — nunca dentro de lyrio-detail-rows.ts.
      const r = metaRow({
        campaignId: e.linha.id,
        campaignName: e.linha.name,
        spend: comImpostoMeta(m.spendBruto, dia),
        impressions: m.impressions,
        clicks: m.clicks,
        linkClicks: m.linkClicks,
      });
      // AC2d — não há métrica de vídeo por dia nesta fonte.
      midia = { ...r, hookRate: null, holdRate: null };
    }

    let venda: ContagemDeVendas | null = null;
    let dicaDaVenda: string | null = null;
    if (e.vendas.tipo !== "pronto") {
      dicaDaVenda = e.vendas.dica;
    } else if (!e.vendas.atributosDesde || dia < e.vendas.atributosDesde) {
      // AC3e — antes da cobertura dos atributos, "—", não 0.
      dicaDaVenda = e.vendas.dicaDeCobertura;
    } else {
      venda = vendaDaChave?.get(dia) ?? { vendas: 0, compradores: 0, receitaUsd: 0 };
      dicaDaVenda = DICA_ATRIBUICAO_DO_DIA;
    }
    return { dia, emAndamento: dia === e.hoje, midia, dicaDaMidia, venda, dicaDaVenda };
  });

  // ── Σ da mídia: os dias com cobertura, pela regra da linha (metaRow sobre a soma) ──
  const comMidia = parcial.filter((p) => p.midia !== null).map((p) => p.midia!);
  const somaSpend = comMidia.reduce((a, m) => a + m.spend, 0);
  const somaImpr = comMidia.reduce((a, m) => a + m.impressions, 0);
  const somaLink = comMidia.reduce((a, m) => a + (m.clicks ?? 0), 0);
  const somaCliques = e.dias.reduce((a, d) => a + (e.semCobertura.has(d) ? 0 : (doDia?.get(d)?.clicks ?? 0)), 0);
  const somaRow = metaRow({ campaignId: e.linha.id, campaignName: e.linha.name, spend: somaSpend, impressions: somaImpr, clicks: somaCliques, linkClicks: somaLink });
  const midiaDaSoma: LyrioDetailRow = { ...somaRow, hookRate: null, holdRate: null };
  const { exibidos, total } = fecharMidia(parcial);
  const diferenca = diferencaDaMidia(midiaDaSoma, e.linha);

  // ── Σ da venda: TODOS os dias da chave (= a linha, AC3b), mesmo os exibidos como "—" ──
  let vendaDaSoma: ContagemDeVendas | null = null;
  let dicaDaVendaDaSoma: string | null = e.vendas.tipo === "pronto" ? DICA_ATRIBUICAO_DO_DIA : e.vendas.dica;
  let receitaDaSoma: number | null = null;
  const receitasExibidas: (number | null)[] = parcial.map(() => null);
  if (e.vendas.tipo === "pronto") {
    let vendas = 0;
    let compradores = 0;
    let centavosUsd = 0;
    for (const c of vendaDaChave?.values() ?? []) {
      vendas += c.vendas;
      compradores += c.compradores;
      centavosUsd += Math.round(c.receitaUsd * 100);
    }
    vendaDaSoma = { vendas, compradores, receitaUsd: centavosUsd / 100 };
    const exibidas = parcial.filter((p) => p.venda !== null);
    const vendasExibidas = exibidas.reduce((a, p) => a + p.venda!.vendas, 0);
    if (vendas > vendasExibidas) {
      const n = vendas - vendasExibidas;
      dicaDaVendaDaSoma = `${DICA_ATRIBUICAO_DO_DIA}. Inclui ${n} ${n === 1 ? "venda" : "vendas"} de dias que aparecem como “—”${e.vendas.atributosDesde ? ` (antes de ${dataBr(e.vendas.atributosDesde)})` : ""}.`;
    }
    receitaDaSoma = brl(vendaDaSoma.receitaUsd);
    if (e.brlRate != null) {
      const idx = parcial.map((p, i) => [i, p.venda] as const).filter((x): x is readonly [number, ContagemDeVendas] => x[1] !== null);
      const partes = idx.map(([, v]) => v.receitaUsd * e.brlRate!);
      const fechadas = fecharEmCentavos(partes.reduce((a, b) => a + b, 0), partes);
      idx.forEach(([i], j) => (receitasExibidas[i] = fechadas[j]!));
    }
  }

  return {
    dias: parcial.map((p, i) => ({ ...p, investimentoExibido: exibidos[i] ?? null, receitaBrlExibida: receitasExibidas[i] ?? null })),
    soma: {
      midia: midiaDaSoma,
      investimentoExibido: centavos(total),
      diferenca,
      dicaDaDiferenca: diferenca ? (e.dimensao === "campaign" ? DICA_DIFERENCA_DA_CAMPANHA : DICA_DIFERENCA_DA_MIDIA) : null,
      venda: vendaDaSoma,
      receitaBrlExibida: receitaDaSoma == null ? null : centavos(receitaDaSoma),
      dicaDaVenda: dicaDaVendaDaSoma,
    },
  };
}

/**
 * AC2e/AC3f (D22) — os dias de uma campanha do GOOGLE: as linhas do `/daily`
 * que a 42.16 já consultou, na régua de SP, sem imposto; CTR/CPC/CPM por dia
 * pela regra da linha (`googleRow`). Venda "—": o Google não informa a
 * campanha da venda.
 */
export function expansaoDoGoogle(e: EntradaComum & { linhasDoDaily: readonly DiaDoGoogle[] }): ExpansaoDaLinha {
  const porDia = new Map<string, { centavos: number; impressions: number; clicks: number }>();
  for (const l of e.linhasDoDaily) {
    const a = porDia.get(l.date) ?? { centavos: 0, impressions: 0, clicks: 0 };
    a.centavos += Math.round((Number(l.spend) || 0) * 100);
    a.impressions += Number(l.impressions) || 0;
    a.clicks += Number(l.clicks) || 0;
    porDia.set(l.date, a);
  }
  const linhaDoDia = (spend: number, impressions: number, clicks: number) =>
    googleRow({ id: e.linha.id, name: e.linha.name, status: null, spend, impressions, clicks });
  const parcial = e.dias.map((dia) => {
    const a = porDia.get(dia) ?? { centavos: 0, impressions: 0, clicks: 0 };
    return {
      dia,
      emAndamento: dia === e.hoje,
      midia: linhaDoDia(a.centavos / 100, a.impressions, a.clicks) as LyrioDetailRow | null,
      dicaDaMidia: null,
      venda: null,
      dicaDaVenda: DICA_GOOGLE_SEM_VENDA,
    };
  });
  const somaSpend = parcial.reduce((s, p) => s + Math.round(p.midia!.spend * 100), 0) / 100;
  const somaImpr = parcial.reduce((s, p) => s + p.midia!.impressions, 0);
  const somaCliques = parcial.reduce((s, p) => s + (p.midia!.clicks ?? 0), 0);
  const midiaDaSoma = linhaDoDia(somaSpend, somaImpr, somaCliques);
  const { exibidos, total } = fecharMidia(parcial);
  const diferenca = diferencaDaMidia(midiaDaSoma, e.linha);
  return {
    dias: parcial.map((p, i) => ({ ...p, investimentoExibido: exibidos[i] ?? null, receitaBrlExibida: null })),
    soma: {
      midia: midiaDaSoma,
      investimentoExibido: centavos(total),
      diferenca,
      // A linha e os dias do Google saem da MESMA consulta: diferença aqui não tem a causa da Meta.
      dicaDaDiferenca: diferenca ? "a linha e os dias saem da mesma consulta do Google (/daily); a diferença não era esperada" : null,
      venda: null,
      receitaBrlExibida: null,
      dicaDaVenda: DICA_GOOGLE_SEM_VENDA,
    },
  };
}
