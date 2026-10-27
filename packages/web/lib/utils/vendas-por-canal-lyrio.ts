/**
 * Story 42.12 — o que as telas da etapa Lyrio decidem sobre as vendas por
 * canal (Meta · Google · Orgânico ou cupom · Sem atribuição), na forma pura (o
 * vitest do web só coleta `lib/utils/**`; os `.tsx` só desenham):
 *
 *  - o estado do bloco: carregando · OCULTO (API anterior à rota — 404 "Not
 *    Found", o banner de versão explica) · ERRO (qualquer outra falha — nunca
 *    zeros, AC7) · pronto;
 *  - as linhas do Resumo mobile por canal, com ROAS e Margem só para Meta e
 *    Google, cada um contra o PRÓPRIO investimento (AC2);
 *  - as linhas da quebra "Por canal" do bloco RevenueCat (AC3);
 *  - as declarações: cobertura dos atributos (AC6), o que fica fora da quebra
 *    (PO-03), a fonte da receita do Resumo e o aviso de conflito (D7);
 *  - o cruzamento das vendas da Meta com as linhas do Detalhamento (AC5).
 */

import { ehApiAtras } from "./mensagem-de-api-atras";
import { calcularMargemContribuicao } from "./lyrio-margin";

export type CanalDaVenda = "meta" | "google" | "organico" | "sem_atribuicao";

export interface ContagemDeVendas {
  vendas: number;
  compradores: number;
  receitaUsd: number;
}

/** Linha da quebra da Meta: `chave` = id da campanha, ou NOME do conjunto/anúncio; `null` = não identificado. */
export interface EntidadeMeta extends ContagemDeVendas {
  chave: string | null;
  nome: string | null;
}

/** Espelha `GET …/revenuecat/vendas-por-canal` (`routes/revenuecat.ts`). Só contagens — nenhum id de usuário. */
export interface VendasPorCanalDoLyrio {
  days: number;
  /** Início da janela (`AAAA-MM-DD`): o primeiro dia, no fuso de SP (Story 42.13 — antes, `agora − days × 24 h` em UTC). */
  desde: string;
  /** Primeiro evento da etapa com `ad_network` ou id de campanha da Meta; `null` se nunca chegou. */
  atributosDesde: string | null;
  canais: (ContagemDeVendas & { canal: CanalDaVenda; rotulo: string })[];
  conflito: ContagemDeVendas;
  totalPago: ContagemDeVendas;
  metaPorEntidade: { campaign: EntidadeMeta[]; adset: EntidadeMeta[]; ad: EntidadeMeta[] };
  /** O que o card "Vendas" de `/sales` conta e a quebra não conta. */
  foraDaQuebra: { semValor: number; semUsuario: number };
}

export type EstadoDasVendas =
  | { tipo: "carregando" }
  | { tipo: "oculto" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; dados: VendasPorCanalDoLyrio };

/**
 * AC7: 404 DA ROTA (API anterior à 42.12) → o bloco some e o banner de versão
 * declara a defasagem; 404 de DOMÍNIO ("Etapa não encontrada") e qualquer outra
 * falha → erro no bloco. Nunca "sem vendas".
 */
export function estadoDasVendasPorCanal(q: { isLoading: boolean; error: unknown; data: VendasPorCanalDoLyrio | undefined }): EstadoDasVendas {
  if (q.error) {
    const e = q.error as { status?: number; message?: string } | null;
    const lido = { status: e?.status ?? 0, mensagem: e?.message ?? "" };
    if (lido.status === 404 && ehApiAtras(lido)) return { tipo: "oculto" };
    return { tipo: "erro", mensagem: lido.mensagem || "Erro desconhecido" };
  }
  if (q.isLoading || !q.data) return { tipo: "carregando" };
  return { tipo: "pronto", dados: q.data };
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`. */
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// ─────────────────────────── declarações ───────────────────────────

/**
 * AC6 — a cobertura dos atributos de canal, com a data vinda da API. Janela que
 * começa antes dela subconta Meta e Google — e zero ali não é "não vende".
 */
export function declaracaoDeCobertura(d: Pick<VendasPorCanalDoLyrio, "atributosDesde" | "desde">): string {
  if (!d.atributosDesde) {
    return "O app ainda não enviou o canal de nenhuma venda (ad_network ou ids da Meta): Meta e Google ficam zerados e tudo cai em Sem atribuição — não quer dizer que não vendam.";
  }
  const desde = dataBr(d.atributosDesde);
  return d.desde < d.atributosDesde
    ? `O canal da venda (ad_network e ids da Meta) só chega desde ${desde}. Esta janela começa antes, então Meta e Google estão subcontados — o que falta cai em Sem atribuição.`
    : `O canal da venda (ad_network e ids da Meta) chega desde ${desde}.`;
}

/**
 * PO-03 — o card "Vendas" do bloco conta todo evento de receita, inclusive os
 * de US$ 0; a quebra conta só venda paga. A diferença sai com número.
 */
export function declaracaoForaDaQuebra(d: Pick<VendasPorCanalDoLyrio, "foraDaQuebra">): string | null {
  const { semValor, semUsuario } = d.foraDaQuebra;
  if (semValor <= 0 && semUsuario <= 0) return null;
  const partes: string[] = [];
  if (semValor > 0) partes.push(`${semValor.toLocaleString("pt-BR")} ${semValor === 1 ? "evento" : "eventos"} de US$ 0 (teste grátis, promocional)`);
  if (semUsuario > 0) partes.push(`${semUsuario.toLocaleString("pt-BR")} ${semUsuario === 1 ? "venda" : "vendas"} sem usuário do app`);
  return `“Por canal” conta só venda paga: ${partes.join(" e ")} ${semValor + semUsuario === 1 ? "entra" : "entram"} no card “Vendas” e ${semValor + semUsuario === 1 ? "fica" : "ficam"} fora daqui.`;
}

/**
 * AC2 — a receita por canal e o card "Receita" têm fontes diferentes. Story
 * 42.14: o card passou do overview para o relatório de receita por período da
 * API do RevenueCat (`/metrics/revenue`), na mesma janela desta tabela.
 */
export const DECLARACAO_FONTE_DO_RESUMO =
  "Receita por canal vem dos eventos do webhook (venda paga); o card “Receita (RevenueCat)” vem do relatório de receita da API do RevenueCat — as duas somas não batem exatamente.";

/** D7 — "impossível; se acontecer, sinalize". `null` sem conflito. */
export function avisoDeConflito(compradores: number): string | null {
  if (compradores <= 0) return null;
  return `${compradores.toLocaleString("pt-BR")} ${compradores === 1 ? "usuário tem" : "usuários têm"} sinal da Meta e do Google ao mesmo tempo — possível falha na integração. ${compradores === 1 ? "Ficou" : "Ficaram"} fora das duas linhas.`;
}

// ─────────────────────────── Resumo mobile (AC2) ───────────────────────────

export interface LinhaDoResumoPorCanal {
  chave: CanalDaVenda | "conflito" | "total";
  rotulo: string;
  vendas: number;
  receitaBrl: number | null;
  /** `null` = canal sem investimento (orgânico, sem atribuição) ou investimento desconhecido (sem campanha vinculada). */
  investimentoBrl: number | null;
  roas: number | null;
  margemBrl: number | null;
}

export interface EntradaDoResumoPorCanal {
  dados: VendasPorCanalDoLyrio;
  brlRate: number | null;
  /** Investimento da Meta (28 dias) decomposto; `conhecido` = há campanha Meta vinculada à etapa. */
  meta: { liquidoBrl: number; impostoBrl: number; conhecido: boolean };
  google: { investimentoBrl: number; conhecido: boolean };
  percentuais: { platformFeePct: number; taxPct: number; otherCostsPct: number };
}

/**
 * Uma linha por canal + conflito (só se houver) + Total pago. ROAS e Margem só
 * para Meta e Google, cada um contra o PRÓPRIO investimento — Meta com o
 * imposto de 12,15%, Google sem (o imposto é da Meta, decisão de 12/08). A
 * Margem é a mesma `calcularMargemContribuicao` do card, com a receita e o
 * investimento do canal.
 */
export function linhasDoResumoPorCanal(e: EntradaDoResumoPorCanal): LinhaDoResumoPorCanal[] {
  const brl = (usd: number) => (e.brlRate == null ? null : usd * e.brlRate);
  const pago = (receitaBrl: number | null, invest: { liquido: number; imposto: number; google: number } | null) => {
    if (invest == null) return { investimentoBrl: null, roas: null, margemBrl: null };
    const investimentoBrl = invest.liquido + invest.imposto + invest.google;
    const roas = receitaBrl != null && investimentoBrl > 0 ? receitaBrl / investimentoBrl : null;
    const margemBrl =
      receitaBrl == null
        ? null
        : calcularMargemContribuicao({
            faturamentoBrutoBrl: receitaBrl,
            ...e.percentuais,
            investimentoMetaLiquidoBrl: invest.liquido,
            impostoMetaBrl: invest.imposto,
            investimentoGoogleBrl: invest.google,
          }).margem;
    return { investimentoBrl, roas, margemBrl };
  };

  const linhas: LinhaDoResumoPorCanal[] = e.dados.canais.map((c) => {
    const receitaBrl = brl(c.receitaUsd);
    const invest =
      c.canal === "meta"
        ? e.meta.conhecido
          ? { liquido: e.meta.liquidoBrl, imposto: e.meta.impostoBrl, google: 0 }
          : null
        : c.canal === "google"
          ? e.google.conhecido
            ? { liquido: 0, imposto: 0, google: e.google.investimentoBrl }
            : null
          : null;
    return { chave: c.canal, rotulo: c.rotulo, vendas: c.vendas, receitaBrl, ...pago(receitaBrl, invest) };
  });
  if (e.dados.conflito.compradores > 0) {
    linhas.push({ chave: "conflito", rotulo: "Meta e Google (conflito)", vendas: e.dados.conflito.vendas, receitaBrl: brl(e.dados.conflito.receitaUsd), investimentoBrl: null, roas: null, margemBrl: null });
  }
  linhas.push({ chave: "total", rotulo: "Total pago", vendas: e.dados.totalPago.vendas, receitaBrl: brl(e.dados.totalPago.receitaUsd), investimentoBrl: null, roas: null, margemBrl: null });
  return linhas;
}

// ─────────────────────────── Bloco RevenueCat (AC3) ───────────────────────────

/** As linhas de "Por canal" no formato da `BreakdownTable` (label, vendas, receita em US$). */
export function linhasPorCanalDoBloco(d: VendasPorCanalDoLyrio): { label: string; sales: number; revenueUsd: number }[] {
  const linhas = d.canais.map((c) => ({ label: c.rotulo, sales: c.vendas, revenueUsd: c.receitaUsd }));
  if (d.conflito.compradores > 0) linhas.push({ label: "Meta e Google (conflito)", sales: d.conflito.vendas, revenueUsd: d.conflito.receitaUsd });
  linhas.push({ label: "Total pago", sales: d.totalPago.vendas, revenueUsd: d.totalPago.receitaUsd });
  return linhas;
}

// ─────────────────────────── Detalhamento (AC5) ───────────────────────────

export type DimensaoDoDetalhamento = "campaign" | "adset" | "ad";

/**
 * A chave com que uma linha do Detalhamento casa com a quebra da Meta: o id da
 * campanha; o NOME aparado do conjunto e do anúncio, porque `/all-adsets` e
 * `/all-ads` agregam por nome (`services/traffic-analytics.ts`) e a linha só
 * guarda UM id representante. Linha do Google → `null` (o Google não manda
 * campanha).
 */
export function chaveDaLinhaDoDetalhamento(dimensao: DimensaoDoDetalhamento, linha: { id: string; name: string; platform: string }): string | null {
  if (linha.platform !== "meta") return null;
  return dimensao === "campaign" ? linha.id : linha.name.trim();
}

export interface VendasDoDetalhamento {
  /** Por `${platform}-${id}` da linha: as vendas dela (0 se nenhuma); linha do Google fica de fora (→ "—"). */
  porLinha: Map<string, ContagemDeVendas>;
  /** Usuários Meta sem o atributo deste nível (D2b). `null` se não houver. */
  naoIdentificado: ContagemDeVendas | null;
  /** Vendas da Meta cuja chave não casou com nenhuma linha da tabela (campanha não vinculada, sem investimento no período, nome trocado). */
  semLinha: ContagemDeVendas | null;
  /** A linha Meta da quebra — o que `porLinha` + `naoIdentificado` + `semLinha` somam. */
  totalMeta: ContagemDeVendas;
}

const somarContagem = (a: ContagemDeVendas | null, b: ContagemDeVendas): ContagemDeVendas => ({
  vendas: (a?.vendas ?? 0) + b.vendas,
  compradores: (a?.compradores ?? 0) + b.compradores,
  receitaUsd: Math.round(((a?.receitaUsd ?? 0) + b.receitaUsd) * 100) / 100,
});

/**
 * Cruza as vendas da Meta com as linhas visíveis. Cada entidade vai para UMA
 * linha só (a primeira que casar), e o que não casa vira "sem linha" — para o
 * total de vendas da Meta fechar na tabela (AC5), em vez de sumir.
 */
export function vendasDoDetalhamento(
  dimensao: DimensaoDoDetalhamento,
  linhas: readonly { id: string; name: string; platform: string }[],
  dados: Pick<VendasPorCanalDoLyrio, "metaPorEntidade" | "canais">,
): VendasDoDetalhamento {
  const entidades = dados.metaPorEntidade[dimensao];
  const porChave = new Map(entidades.filter((x) => x.chave != null).map((x) => [x.chave as string, x]));
  const usadas = new Set<string>();
  const porLinha = new Map<string, ContagemDeVendas>();
  for (const l of linhas) {
    const chave = chaveDaLinhaDoDetalhamento(dimensao, l);
    if (chave === null) continue;
    const ent = !usadas.has(chave) ? porChave.get(chave) : undefined;
    if (ent) usadas.add(chave);
    porLinha.set(`${l.platform}-${l.id}`, ent ? { vendas: ent.vendas, compradores: ent.compradores, receitaUsd: ent.receitaUsd } : { vendas: 0, compradores: 0, receitaUsd: 0 });
  }
  let naoIdentificado: ContagemDeVendas | null = null;
  let semLinha: ContagemDeVendas | null = null;
  for (const x of entidades) {
    if (x.chave === null) naoIdentificado = somarContagem(naoIdentificado, x);
    else if (!usadas.has(x.chave)) semLinha = somarContagem(semLinha, x);
  }
  const meta = dados.canais.find((c) => c.canal === "meta");
  return {
    porLinha,
    naoIdentificado,
    semLinha,
    totalMeta: { vendas: meta?.vendas ?? 0, compradores: meta?.compradores ?? 0, receitaUsd: meta?.receitaUsd ?? 0 },
  };
}

/**
 * Story 42.13 (AC3) — a linha do rodapé para quem é da Meta mas não tem o
 * atributo DESTE nível. O rótulo acompanha a dimensão: "Anúncio não
 * identificado" na visão Por Campanha descrevia o nível errado.
 */
export function rotuloDoNaoIdentificado(dimensao: DimensaoDoDetalhamento): { rotulo: string; dica: string } {
  const nivel = { campaign: ["Campanha não identificada", "da campanha"], adset: ["Conjunto não identificado", "do conjunto"], ad: ["Anúncio não identificado", "do anúncio"] }[dimensao];
  return {
    rotulo: nivel[0],
    dica: `Vendas da Meta de usuários sem o id ${nivel[1]} (ex.: ad_network = meta sem os ids)`,
  };
}

// ─────────────────────────── Bloco "Meta Ads" (Story 42.13, AC2) ───────────────────────────

export interface EntradaDoBlocoMeta {
  /**
   * O tráfego da Meta no período; `null` = desconhecido (a consulta falhou —
   * QA REL-001: antes virava R$ 0 de investimento e de custo por venda).
   * `investimentoBrl` já tem o imposto (`sumMetaInsights`).
   */
  trafego: { investimentoBrl: number; impressoes: number; cliques: number } | null;
  estado: EstadoDasVendas;
  brlRate: number | null;
}

export interface BlocoMetaDoLyrio {
  investimentoBrl: number | null;
  impressoes: number | null;
  cliques: number | null;
  /** `null` = a venda não é conhecida (carregando, erro, API anterior à rota). */
  vendas: number | null;
  receitaBrl: number | null;
  roas: number | null;
  custoPorVenda: number | null;
  ctr: number | null;
  cpm: number | null;
  /** Cliques → vendas, em %. */
  conversao: number | null;
}

/**
 * Story 42.13 (AC2) — os números do bloco "Meta Ads" do Lyrio. A venda é a do
 * canal Meta da rota `vendas-por-canal` (a mesma do bloco RevenueCat e do
 * Detalhamento); o resto é o tráfego da Meta. Nenhuma divisão por zero vira
 * número, e sem câmbio a receita (e o ROAS) ficam "—" em vez de virar US$.
 */
export function blocoMetaDoLyrio(e: EntradaDoBlocoMeta): BlocoMetaDoLyrio {
  const meta = e.estado.tipo === "pronto" ? e.estado.dados.canais.find((c) => c.canal === "meta") ?? null : null;
  const vendas = meta ? meta.vendas : null;
  const receitaBrl = meta && e.brlRate != null ? meta.receitaUsd * e.brlRate : null;
  const div = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? a / b : null);
  const t = e.trafego;
  const investimentoBrl = t ? t.investimentoBrl : null;
  return {
    investimentoBrl,
    impressoes: t ? t.impressoes : null,
    cliques: t ? t.cliques : null,
    vendas,
    receitaBrl,
    roas: div(receitaBrl, investimentoBrl),
    custoPorVenda: div(vendas != null && vendas > 0 ? investimentoBrl : null, vendas),
    ctr: t ? div(t.cliques * 100, t.impressoes) : null,
    cpm: t ? div(t.investimentoBrl * 1000, t.impressoes) : null,
    conversao: t ? div(vendas != null ? vendas * 100 : null, t.cliques) : null,
  };
}
