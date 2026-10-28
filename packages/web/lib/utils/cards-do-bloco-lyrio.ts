/**
 * Story 42.16 (AC1–AC3) — os cards dos blocos "Meta Ads" e "Google Ads" da
 * etapa Lyrio: valor, período e memorial de cada um, pelo canal.
 *
 * ## Um bloco, dois canais (AC3a)
 *
 * Os dois blocos têm os MESMOS cards e o mesmo funil: Investimento, Vendas,
 * Receita, ROAS e Custo por venda; Impressões → Cliques → Vendas; CTR e CPM. Os
 * números saem de `blocoDoCanalDoLyrio` (uma função do canal: as regras de "—",
 * divisão por zero e câmbio ausente são as mesmas); o que muda por canal é só
 * a fonte declarada — a Meta com o imposto de 12,15%, o Google sem ele e com o
 * fuso da conta (`NOTA_DO_FUSO_DO_GOOGLE`).
 *
 * ## O período de cada card (AC1)
 *
 * Todo card leva `dd/mm a dd/mm` (`declararJanelaDoBloco`, o vocabulário da
 * 42.14). Os cards que dependem da VENDA da Meta levam `desde dd/mm` quando a
 * janela começa antes de `atributosDesde`, a data que a API devolve.
 *
 * O Google NÃO recebe `desde` (AC2d): `atributosDesde` é o primeiro evento com
 * `ad_network` OU id de campanha da Meta (`consultaDoInicioDosAtributos`, API),
 * e o sinal do Google é `ad_network = google` OU `gclid` (`sinalGoogle`). A rota
 * não informa uma data de cobertura do canal Google — e o card não inventa uma.
 *
 * ## O que este módulo nunca faz
 *
 * Mostrar R$ 0 por falta de dado: tráfego desconhecido (carregando, erro, sem
 * conta) e venda desconhecida ficam "—", com a causa no memorial quando ela é
 * conhecida.
 */

import type { MetricFormula, MetricFormulaValue } from "@/lib/types/metric-formula";
import { declararJanelaDoBloco, subtituloDoBloco, type DeclaracaoDaJanela } from "./janela-dos-cards-lyrio";
import { NOTA_DO_FUSO_DO_GOOGLE, type TrafegoDoGoogleNaRegua } from "./google-ads-na-regua";
import { avisoDoGoogle, memorialDoGoogleSemNumero } from "./lyrio-google-ads";
import { fmtUsd, type CardComJanela } from "./overview-revenuecat";
import { fmtBRL, fmtRoas, memorialDoErroDaMeta } from "./resumo-mobile-lyrio";
import { blocoDoCanalDoLyrio, declaracaoDeCobertura, type CanalDoBloco, type EstadoDasVendas } from "./vendas-por-canal-lyrio";

/** Os ícones moram no componente; aqui só a chave (o vitest coleta `.ts` sem JSX). */
export type IconeDoBloco = "investimento" | "vendas" | "receita" | "roas" | "custo" | "impressoes" | "cliques" | "taxa" | "cpm";

export interface CardDoBloco extends CardComJanela {
  icone: IconeDoBloco;
  /** Destaque de resultado (Receita, ROAS, a etapa final do funil). */
  realce?: boolean;
}

/** O tráfego do canal no filtro. `sem_conta` só existe para o Google (42.13, TEST-001). */
export type TrafegoDoBloco =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "sem_conta" }
  | { tipo: "pronto"; investimentoBrl: number; impressoes: number; cliques: number };

/**
 * O tráfego da Meta no filtro: a soma de `sumMetaInsights` (spend com imposto,
 * impressões, cliques no link). Com a consulta em erro o tráfego é
 * DESCONHECIDO (QA REL-001 da 42.13), não R$ 0 — o erro decide antes do dado.
 */
export function trafegoDoBlocoDaMeta(
  somado: { spend: number; impressions: number; linkClicks: number } | undefined,
  erro: string | null,
): TrafegoDoBloco {
  if (erro) return { tipo: "erro", mensagem: erro };
  if (!somado) return { tipo: "carregando" };
  return { tipo: "pronto", investimentoBrl: somado.spend, impressoes: somado.impressions, cliques: somado.linkClicks };
}

/**
 * O tráfego do Google no filtro, na régua de SP (AC2b). Sem campanha o bloco
 * nem aparece (42.13); o zero aqui é o de `valorDoGoogleNaRegua` — não há o
 * que medir.
 */
export function trafegoDoBlocoDoGoogle(t: TrafegoDoGoogleNaRegua): TrafegoDoBloco {
  if (t.tipo === "pronto") return { tipo: "pronto", investimentoBrl: t.spend, impressoes: t.impressions, cliques: t.clicks };
  if (t.tipo === "sem_campanha") return { tipo: "pronto", investimentoBrl: 0, impressoes: 0, cliques: 0 };
  return t;
}

export interface EntradaDosCardsDoBloco {
  canal: CanalDoBloco;
  ctx: { diasDoFiltro: number; hoje: string };
  trafego: TrafegoDoBloco;
  /** O estado da `vendas-por-canal` com o MESMO `days` do bloco RevenueCat e do Detalhamento. Sem RevenueCat: `oculto`. */
  vendas: EstadoDasVendas;
  cambio: { taxa: number | null; fonte: string };
}

export interface AvisoDoBloco {
  titulo: string;
  detalhe: string | null;
  orientacao: string | null;
}

export interface CardsDoBloco {
  /** AC3c — `Meta Ads · dd/mm a dd/mm`. */
  subtitulo: string;
  carregandoTrafego: boolean;
  carregandoVendas: boolean;
  /** Investimento, Vendas, Receita, ROAS, Custo por venda — nesta ordem. */
  principais: CardDoBloco[];
  /** Impressões → Cliques → Vendas. */
  funil: CardDoBloco[];
  /** As taxas nas setas do funil: CTR (impressões → cliques) e conversão (cliques → vendas). */
  setas: [string, string];
  /** CTR e CPM. */
  taxas: CardDoBloco[];
  /** O tráfego sem número, com a causa (erro da consulta, conta do Google ausente). */
  avisoDoTrafego: AvisoDoBloco | null;
  /** A venda do RevenueCat em erro (role="alert" no bloco). */
  avisoDasVendas: string | null;
  notaDoFunil: string;
}

const NOME: Record<CanalDoBloco, string> = { meta: "Meta", google: "Google" };
const PLATAFORMA: Record<CanalDoBloco, "Meta Ads" | "Google Ads"> = { meta: "Meta Ads", google: "Google Ads" };
const FONTE_DO_TRAFEGO: Record<CanalDoBloco, string> = {
  meta: "Meta Ads API · GET /api/traffic/analytics/:projectId/campaign-daily (campanhas vinculadas)",
  google: "Google Ads API · GET /api/google-ads/analytics/:accountId/daily por campanha vinculada",
};
const NOTA_DO_TRAFEGO: Record<CanalDoBloco, string> = {
  meta: "Investimento com o imposto de 12,15% (gross-up por dentro, aplicado por dia).",
  google: `${NOTA_DO_FUSO_DO_GOOGLE} Sem imposto de 12,15%: aquele tributo é da plataforma Meta.`,
};
const FONTE_DAS_VENDAS: Record<CanalDoBloco, string> = {
  meta: "Vendas pagas do canal Meta no RevenueCat (o anúncio que o app registra no usuário)",
  google: "Vendas pagas do canal Google no RevenueCat (ad_network = google ou gclid no evento)",
};
const ROTA_DAS_VENDAS = "RevenueCat · GET …/revenuecat/vendas-por-canal";
/** AC2d — por que o card de venda do Google não diz "desde". */
export const NOTA_DA_COBERTURA_DO_GOOGLE =
  "A rota não informa desde quando o canal Google chega (a data de cobertura é a do primeiro ad_network ou id da Meta, sem separar o Google): este card não declara “desde”.";

const fmtNum = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR"));
const fmtPct = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}%`);

/** O "—" com a causa: cada insumo que faltou, e o resultado "—" (PO-D4 da 42.14). */
function semNumero(decl: DeclaracaoDaJanela, expressao: string, causas: MetricFormulaValue[], nota: string): MetricFormula {
  return { expression: expressao, values: causas, result: "—", period: decl.periodo, note: nota };
}

export function cardsDoBlocoDoCanal(e: EntradaDosCardsDoBloco): CardsDoBloco {
  const { canal, ctx } = e;
  const nome = NOME[canal];
  const rotulo = (r: string) => `${r} (${nome})`;
  const t = e.trafego.tipo === "pronto" ? e.trafego : null;
  const b = blocoDoCanalDoLyrio({
    canal,
    trafego: t ? { investimentoBrl: t.investimentoBrl, impressoes: t.impressoes, cliques: t.cliques } : null,
    estado: e.vendas,
    brlRate: e.cambio.taxa,
  });

  // ── as duas declarações: a do tráfego e a da venda (AC1a/AC1b, AC2d) ──
  const declTrafego = declararJanelaDoBloco(ctx);
  const dadosDasVendas = e.vendas.tipo === "pronto" ? e.vendas.dados : null;
  const declVenda =
    canal === "meta"
      ? declararJanelaDoBloco(ctx, { desde: dadosDasVendas?.atributosDesde ?? null, oQue: "o canal da venda (ad_network e ids da Meta)" })
      : declararJanelaDoBloco(ctx);

  // ── as causas do "—" ──
  const dependentesDoTrafego = "o ROAS, o custo por venda, o CTR e o CPM ficam";
  const causaDoTrafego = (decl: DeclaracaoDaJanela): MetricFormula | undefined => {
    if (e.trafego.tipo === "erro") {
      if (canal === "meta") return memorialDoErroDaMeta(e.trafego.mensagem, decl.periodo, dependentesDoTrafego);
      return memorialDoGoogleSemNumero({ tipo: "erro", mensagem: e.trafego.mensagem }, decl.periodo, dependentesDoTrafego);
    }
    if (e.trafego.tipo === "sem_conta") return memorialDoGoogleSemNumero({ tipo: "sem_conta" }, decl.periodo, dependentesDoTrafego);
    return undefined;
  };
  const causaDaVenda = (decl: DeclaracaoDaJanela): MetricFormula | undefined =>
    e.vendas.tipo === "erro"
      ? semNumero(
          decl,
          `Vendas do canal ${nome} indisponíveis`,
          [{ label: "Erro", value: e.vendas.mensagem, source: ROTA_DAS_VENDAS }],
          "A consulta das vendas por canal falhou; tente atualizar. Enquanto isso, as vendas, a receita, o ROAS e o custo por venda ficam “—”, nunca 0.",
        )
      : undefined;
  const coberturaDaNota = dadosDasVendas
    ? canal === "meta"
      ? declaracaoDeCobertura(dadosDasVendas)
      : `${declaracaoDeCobertura(dadosDasVendas)} ${NOTA_DA_COBERTURA_DO_GOOGLE}`
    : "";
  const notaDaVenda = `${FONTE_DAS_VENDAS[canal]}. Toda receita paga conta: compra, renovação, conversão de teste. ${coberturaDaNota}`.trim();
  const cambioValue: MetricFormulaValue | null =
    e.cambio.taxa != null ? { label: "Câmbio US$ 1 →", value: fmtBRL(e.cambio.taxa), source: e.cambio.fonte } : null;
  const linhaDoCanal = dadosDasVendas?.canais.find((c) => c.canal === canal) ?? null;

  // ── tráfego ──
  const investimento: CardDoBloco = {
    id: `investimento-${canal}`,
    rotulo: rotulo("Investimento"),
    valor: fmtBRL(b.investimentoBrl),
    declaracao: declTrafego,
    icone: "investimento",
    formula:
      b.investimentoBrl == null
        ? causaDoTrafego(declTrafego)
        : {
            expression: canal === "meta" ? "Σ spend diário das campanhas vinculadas, com imposto" : "Σ spend diário das campanhas vinculadas",
            values: [{ label: "Investimento", value: fmtBRL(b.investimentoBrl), source: FONTE_DO_TRAFEGO[canal] }],
            result: fmtBRL(b.investimentoBrl),
            period: declTrafego.periodo,
            note: NOTA_DO_TRAFEGO[canal],
          },
  };
  const rotuloDosCliques = canal === "meta" ? "Cliques no link" : "Cliques";
  const contagemDeTrafego = (id: "impressoes" | "cliques", r: string, rotuloDoValor: string, v: number | null, expressao: string, fonte: string): CardDoBloco => ({
    id: `${id}-${canal}`,
    rotulo: r,
    valor: fmtNum(v),
    declaracao: declTrafego,
    icone: id,
    formula:
      v == null
        ? causaDoTrafego(declTrafego)
        : { expression: expressao, values: [{ label: rotuloDoValor, value: fmtNum(v), source: fonte }], result: fmtNum(v), period: declTrafego.periodo, note: NOTA_DO_TRAFEGO[canal] },
  });
  const impressoes = contagemDeTrafego("impressoes", "Impressões", "Impressões", b.impressoes, "Σ impressões diárias das campanhas vinculadas", FONTE_DO_TRAFEGO[canal]);
  const cliques = contagemDeTrafego(
    "cliques",
    "Cliques",
    rotuloDosCliques,
    b.cliques,
    `Σ ${rotuloDosCliques.toLowerCase()} diários das campanhas vinculadas`,
    canal === "meta" ? `${FONTE_DO_TRAFEGO.meta} · link_click` : FONTE_DO_TRAFEGO.google,
  );

  const taxa = (id: "ctr" | "cpm", r: string, valor: string, v: number | null, expressao: string, valores: MetricFormulaValue[]): CardDoBloco => ({
    id: `${id}-${canal}`,
    rotulo: r,
    valor,
    declaracao: declTrafego,
    icone: id === "ctr" ? "taxa" : "cpm",
    formula:
      v != null
        ? { expression: expressao, values: valores, result: valor, period: declTrafego.periodo, note: NOTA_DO_TRAFEGO[canal] }
        : b.investimentoBrl == null
          ? causaDoTrafego(declTrafego)
          : undefined, // sem impressão: divisão por zero, ausência legítima
  });
  const ctr = taxa("ctr", "CTR", fmtPct(b.ctr), b.ctr, `${rotuloDosCliques} ÷ Impressões × 100`, [
    { label: rotuloDosCliques, value: fmtNum(b.cliques), source: FONTE_DO_TRAFEGO[canal] },
    { label: "Impressões", value: fmtNum(b.impressoes), source: FONTE_DO_TRAFEGO[canal] },
  ]);
  const cpm = taxa("cpm", "CPM", fmtBRL(b.cpm), b.cpm, "Investimento ÷ Impressões × 1000", [
    { label: rotulo("Investimento"), value: fmtBRL(b.investimentoBrl), source: FONTE_DO_TRAFEGO[canal] },
    { label: "Impressões", value: fmtNum(b.impressoes), source: FONTE_DO_TRAFEGO[canal] },
  ]);

  // ── venda ──
  const vendasCard = (id: string, realce?: boolean): CardDoBloco => ({
    id,
    rotulo: rotulo("Vendas"),
    valor: fmtNum(b.vendas),
    declaracao: declVenda,
    icone: "vendas",
    realce,
    formula:
      b.vendas == null
        ? causaDaVenda(declVenda)
        : { expression: `Contagem das vendas pagas do canal ${nome}`, values: [{ label: rotulo("Vendas"), value: fmtNum(b.vendas), source: ROTA_DAS_VENDAS }], result: fmtNum(b.vendas), period: declVenda.periodo, note: notaDaVenda },
  });
  const receita: CardDoBloco = {
    id: `receita-${canal}`,
    rotulo: rotulo("Receita"),
    valor: fmtBRL(b.receitaBrl),
    declaracao: declVenda,
    icone: "receita",
    realce: true,
    formula:
      b.receitaBrl != null && linhaDoCanal && cambioValue
        ? {
            expression: "Receita das vendas pagas (US$) × câmbio",
            values: [{ label: rotulo("Receita"), value: fmtUsd(linhaDoCanal.receitaUsd), source: ROTA_DAS_VENDAS }, cambioValue],
            result: `${fmtUsd(linhaDoCanal.receitaUsd)} × ${fmtBRL(e.cambio.taxa)} = ${fmtBRL(b.receitaBrl)}`,
            period: declVenda.periodo,
            note: notaDaVenda,
          }
        : (causaDaVenda(declVenda) ??
          (linhaDoCanal && e.cambio.taxa == null
            ? semNumero(declVenda, "Receita (US$) × câmbio", [{ label: "Câmbio US$ → R$", value: "indisponível", source: e.cambio.fonte }], "Sem câmbio a receita fica “—”, nunca dólar com cara de real.")
            : undefined)),
  };
  const causasDoQuociente = (): MetricFormulaValue[] => {
    const c: MetricFormulaValue[] = [];
    const v = causaDaVenda(declVenda);
    if (v) c.push(v.values[0]);
    const tr = causaDoTrafego(declVenda);
    if (tr) c.push({ label: rotulo("Investimento"), value: String(tr.values[0]?.value ?? "indisponível"), source: FONTE_DO_TRAFEGO[canal] });
    return c;
  };
  const quociente = (
    id: "roas" | "custo",
    r: string,
    valor: string,
    v: number | null,
    expressao: string,
    valores: () => MetricFormulaValue[],
    realce?: boolean,
  ): CardDoBloco => {
    const causas = causasDoQuociente();
    return {
      id: `${id}-${canal}`,
      rotulo: r,
      valor,
      declaracao: declVenda,
      icone: id,
      realce,
      formula:
        v != null
          ? { expression: expressao, values: valores(), result: valor, period: declVenda.periodo, note: `${notaDaVenda} ${NOTA_DO_TRAFEGO[canal]}` }
          : causas.length
            ? semNumero(declVenda, expressao, causas, "Sem um dos insumos, a conta não fecha — o card fica “—”, nunca um número parcial.")
            : undefined, // divisão por zero ou sem câmbio: ausência legítima
    };
  };
  const roas = quociente("roas", rotulo("ROAS"), fmtRoas(b.roas), b.roas, `Receita (${nome}) ÷ Investimento (${nome})`, () => [
    { label: rotulo("Receita"), value: fmtBRL(b.receitaBrl), source: ROTA_DAS_VENDAS },
    { label: rotulo("Investimento"), value: fmtBRL(b.investimentoBrl), source: FONTE_DO_TRAFEGO[canal] },
  ], true);
  const custo = quociente("custo", "Custo por venda", fmtBRL(b.custoPorVenda), b.custoPorVenda, `Investimento (${nome}) ÷ Vendas (${nome})`, () => [
    { label: rotulo("Investimento"), value: fmtBRL(b.investimentoBrl), source: FONTE_DO_TRAFEGO[canal] },
    { label: rotulo("Vendas"), value: fmtNum(b.vendas), source: ROTA_DAS_VENDAS },
  ]);

  // ── avisos ──
  let avisoDoTrafego: AvisoDoBloco | null = null;
  if (e.trafego.tipo === "erro" && canal === "meta") {
    avisoDoTrafego = { titulo: `Não foi possível carregar o tráfego da Meta: ${e.trafego.mensagem}`, detalhe: null, orientacao: null };
  } else if (e.trafego.tipo === "erro" || e.trafego.tipo === "sem_conta") {
    avisoDoTrafego = avisoDoGoogle(e.trafego);
  }

  return {
    subtitulo: subtituloDoBloco(PLATAFORMA[canal], ctx.diasDoFiltro, ctx.hoje),
    carregandoTrafego: e.trafego.tipo === "carregando",
    carregandoVendas: e.vendas.tipo === "carregando",
    principais: [investimento, vendasCard(`vendas-${canal}`), receita, roas, custo],
    funil: [impressoes, cliques, vendasCard(`funil-vendas-${canal}`, true)],
    setas: [fmtPct(b.ctr), fmtPct(b.conversao)],
    taxas: [ctr, cpm],
    avisoDoTrafego,
    avisoDasVendas: e.vendas.tipo === "erro" ? `Não foi possível carregar as vendas ${canal === "meta" ? "da Meta" : "do Google"}: ${e.vendas.mensagem}` : null,
    notaDoFunil: `Funil de tráfego pago (${nome}) — “Vendas” são as vendas pagas do canal ${nome} no RevenueCat.${dadosDasVendas ? ` ${declaracaoDeCobertura(dadosDasVendas)}` : ""}`,
  };
}
