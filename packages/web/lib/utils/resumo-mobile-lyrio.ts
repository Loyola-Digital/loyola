/**
 * Story 42.14 — os cards do Resumo mobile da etapa Lyrio: valor, janela
 * declarada e memorial de cada um. Saiu do `useMemo` de `lyrio-stage-view.tsx`
 * (Story 42.2/42.4) para cá, onde o vitest alcança (AC9d, último item).
 *
 * ## Story 42.15 — a visão CONSOLIDADA, com Meta e Google em segundo plano
 *
 * Cada card mostra o TOTAL como valor principal e, abaixo, duas linhas menores
 * (`secundarias`): `Meta …` e `Google …`. A tabela "Resumo por canal" (42.12) e
 * o Overview do RevenueCat (42.9) saíram da tela: os números deles estão aqui.
 *
 *   Investimento (Total) .. Meta (com 12,15%) + Google, na régua de SP (AC1)
 *   Receita (RevenueCat) .. `totalPago.receitaUsd` do WEBHOOK × câmbio (D1, AC2)
 *   Vendas (Total) ........ `totalPago.vendas` do webhook (AC2)
 *   ROAS, Margem .......... sobre o total; o canal contra o PRÓPRIO investimento (AC3)
 *   MRR, Assinaturas/Trials  continuam `agora` (retrato, AC4)
 *   Novos clientes ........ `charts/customers_new` do filtro (AC4)
 *
 * As linhas Meta/Google de Receita e Vendas são as do bloco da 42.16
 * (`blocoDoCanalDoLyrio`, a mesma função e o mesmo estado); as de ROAS e Margem
 * são as de `linhasDoResumoPorCanal` (AC3b). Sem campanha Google vinculada, a
 * linha do Google não existe (AC1c).
 *
 * ## Nenhuma razão mistura janelas (AC3d)
 *
 * ROAS e Margem dividem a receita do filtro pelo investimento do filtro. Um
 * insumo desconhecido (Meta em erro, Google em erro ou sem conta, vendas em
 * erro, câmbio ausente) deixa "—" com a causa: nunca um número parcial, nunca
 * R$ 0 no lugar de "não sabemos".
 *
 * ## A receita deixou a API v2 (AC2f)
 *
 * Até a 42.14 a Receita vinha de `/metrics/revenue` (série completa, não fecha
 * com os canais). Agora vem do webhook, que FECHA com os canais mas só existe
 * desde o início da série de assinaturas (`serieDesde`): antes dele o card
 * leva `desde dd/mm` (AC2e, risco R1).
 */

import type { MetricFormula, MetricFormulaValue } from "@/lib/types/metric-formula";
import { calcularMargemContribuicao, fecharEmCentavos } from "./lyrio-margin";
import { memorialDoGoogleSemNumero } from "./lyrio-google-ads";
import { declararJanela, diaMes, intervaloDaJanela, type ContextoDaJanela, type DeclaracaoDaJanela } from "./janela-dos-cards-lyrio";
import { inicioDaJanela } from "@loyola-x/shared/src/janela-de-dias";
import { memorialDoErroDaFonte, type EstadoDaFonte } from "./estado-da-fonte-revenuecat";
import { comoEstadoDoGoogle, NOTA_DO_FUSO_DO_GOOGLE, valorDoGoogleNaRegua, type InvestimentoDoGoogleNaRegua } from "./google-ads-na-regua";
import { cardDeNovosClientes, fmtUsd, type CardComJanela, type NovosClientesDoPeriodo } from "./overview-revenuecat";
import { avisoDeConflito, blocoDoCanalDoLyrio, declaracaoDeCobertura, linhasDoResumoPorCanal, type EstadoDasVendas, type VendasPorCanalDoLyrio } from "./vendas-por-canal-lyrio";

/** Os ícones moram no componente; aqui só a chave (o vitest coleta `.ts` sem JSX). */
export type IconeDoCard =
  | "investimento"
  | "receita"
  | "vendas"
  | "roas"
  | "margem"
  | "mrr"
  | "assinaturas"
  | "trials"
  | "clientes"
  | "cac"
  | "ltv"
  | "renovacao"
  | "relacao";

/**
 * Story 42.15 (AC7) — uma linha "em segundo plano" do card: menor, abaixo do
 * valor principal. Corta com reticências no celular; o texto inteiro está no
 * memorial (`comAsLinhasNoMemorial`).
 */
export interface LinhaEmSegundoPlano {
  /** `meta` / `google` nos cards por canal; outra chave nas linhas do LTV/CAC. */
  id: string;
  rotulo: string;
  valor: string;
  /** Margem negativa: vermelho também na linha (AC3e). */
  negativo?: boolean;
  /** Etiqueta curta depois do valor (ex.: `atribuição desde 06/10`). */
  nota?: string;
}

export interface CardDoResumo extends CardComJanela {
  icone: IconeDoCard;
  /** Destaque de resultado (ROAS, Margem). */
  realce?: boolean;
  /** Valor negativo que não pode passar despercebido (margem). */
  negativo?: boolean;
  /** Story 42.15 (AC7): Meta e Google (ou CAC máximo e faixa) abaixo do valor. */
  secundarias?: LinhaEmSegundoPlano[];
  /** Story 42.15 (AC2g): a fonte ainda não respondeu — o card desenha um skeleton no valor. */
  carregando?: boolean;
  /** Story 42.15 (AC10h): há alerta de distorção no memorial (ícone no card). */
  alerta?: boolean;
}

/** O gasto da Meta numa janela (`sumMetaSpendWithTax`). */
export interface GastoDaMeta {
  spendLiquido: number;
  imposto: number;
  spendComImposto: number;
}

export interface EntradaDoResumo {
  /** `serieDesde`: o início da série de assinaturas (`assinaturaDesde` de `pagantes-por-canal`), da API. */
  ctx: ContextoDaJanela;
  cambio: { taxa: number | null; fonte: string };
  /**
   * Investimento da Meta: `undefined` = carregando. Sem campanha vinculada = 0
   * (não há investimento). `erroFiltro` (QA REL-001): a mensagem da consulta em
   * erro — o "—" passa a dizer a causa. `vinteOito`/`erro28` servem aos CACs de
   * 28 dias fixos (`cardsDeAquisicao`): o Resumo segue só o filtro.
   */
  meta: { temCampanhas: boolean; filtro: GastoDaMeta | undefined; vinteOito?: GastoDaMeta | undefined; erroFiltro?: string | null; erro28?: string | null };
  google: { mostrar: boolean; filtro: InvestimentoDoGoogleNaRegua; vinteOito?: InvestimentoDoGoogleNaRegua };
  /**
   * D1 — as vendas por canal do WEBHOOK, com o `days` do filtro: o MESMO estado
   * dos blocos Meta/Google e do Detalhamento (uma consulta, uma chave de cache).
   * Sem RevenueCat conectado: `oculto`.
   */
  vendas: EstadoDasVendas;
  /** Os novos clientes da janela do filtro (rota nova; `oculto` = API anterior). */
  novosClientes: EstadoDaFonte<NovosClientesDoPeriodo>;
  /** O overview: os retratos (MRR, assinaturas, trials). */
  overview: EstadoDaFonte<{ id: string; value: number }[]>;
  percentuais: { platformFeePct: number; taxPct: number; otherCostsPct: number };
}

export function fmtBRL(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
export function fmtRoas(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)}x`;
}
const fmtNum = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR"));
const centavos = (v: number) => Math.round(v * 100);

const FONTE_DO_OVERVIEW = "RevenueCat · GET /metrics/overview";
const ROTA_DAS_VENDAS = "eventos do webhook do RevenueCat · GET …/revenuecat/vendas-por-canal";

function metrica(m: { id: string; value: number }[] | null, ...ids: string[]): number | null {
  if (!m) return null;
  for (const id of ids) {
    const x = m.find((y) => y.id === id);
    if (x) return x.value;
  }
  return null;
}

/**
 * Story 42.14 (QA REL-001) — o memorial do "—" quando a consulta da Meta
 * (`/api/traffic/analytics/:projectId/campaign-daily`) falhou. Antes do REL-001,
 * a falha ficava "—" sem causa, como se ainda carregasse.
 */
export function memorialDoErroDaMeta(mensagem: string, periodo: string, dependentes: string): MetricFormula {
  return {
    expression: "Meta Ads API indisponível",
    values: [{ label: "Erro", value: mensagem, source: "GET /api/traffic/analytics/:projectId/campaign-daily" }],
    result: "—",
    period: periodo,
    note: `A consulta do gasto diário da Meta falhou; tente atualizar. Enquanto isso, ${dependentes} "—": sem a Meta, o investimento é desconhecido.`,
  };
}

/** Memorial de um card dependente que ficou "—": a causa de cada insumo que faltou (PO-D4 (4)). */
function memorialDeDependente(decl: DeclaracaoDaJanela, expressao: string, causas: MetricFormulaValue[]): MetricFormula {
  return {
    expression: expressao,
    values: causas,
    result: "—",
    period: decl.periodo,
    note: "Sem um dos insumos, a conta não fecha — o card fica \"—\", nunca um número parcial nem o de outra janela.",
  };
}

/** O texto inteiro de uma linha em segundo plano, como o card a desenha. */
export function textoDaLinha(l: LinhaEmSegundoPlano): string {
  return `${l.rotulo} ${l.valor}${l.nota ? ` · ${l.nota}` : ""}`;
}

/**
 * AC7c — no celular a linha corta com reticências; o texto inteiro tem de
 * estar no memorial. Acrescenta ao memorial a linha que ele ainda não mostra
 * (valor e nota), sem duplicar a que já está lá.
 */
export function comAsLinhasNoMemorial<C extends CardDoResumo>(card: C): C {
  if (!card.formula || !card.secundarias?.length) return card;
  const texto = JSON.stringify(card.formula);
  const faltam = card.secundarias.filter((l) => !texto.includes(l.valor) || (l.nota != null && !texto.includes(l.nota)));
  if (!faltam.length) return card;
  return {
    ...card,
    formula: {
      ...card.formula,
      values: [
        ...card.formula.values,
        ...faltam.map((l) => ({ label: `${l.rotulo} (em segundo plano)`, value: l.nota ? `${l.valor} · ${l.nota}` : l.valor, source: "linha em segundo plano deste card" })),
      ],
    },
  };
}

/** Um insumo do investimento: conhecido, carregando ou em erro (com o memorial e a causa). */
type Parte =
  | { tipo: "pronto"; valor: number }
  | { tipo: "carregando" }
  | { tipo: "erro"; memorial: MetricFormula; causa: MetricFormulaValue };

/**
 * Os cards 1–8 do Resumo (sem CAC, LTV e renovações — `cardsDeAquisicao` — nem
 * o LTV por churn — `cardsDoLtvPorChurn`). Ordem do pedido do Alberto:
 * Investimento, Receita, Vendas, ROAS, Margem, MRR, Assinaturas/Trials e Novos
 * clientes.
 */
export function cardsDoResumo(e: EntradaDoResumo): CardDoResumo[] {
  const { ctx, cambio } = e;
  const taxa = cambio.taxa;
  // O investimento não depende da série de assinaturas; a receita do webhook, sim (AC2e).
  const declInvest = declararJanela({ tipo: "filtro" }, { diasDoFiltro: ctx.diasDoFiltro, hoje: ctx.hoje });
  const declVenda = declararJanela({ tipo: "filtro" }, ctx);
  const agora = declararJanela({ tipo: "agora" }, ctx);
  const intervalo = intervaloDaJanela(ctx.diasDoFiltro, ctx.hoje);
  const inicio = inicioDaJanela(ctx.diasDoFiltro, ctx.hoje);
  const overview = e.overview.tipo === "pronto" ? e.overview.dados : null;
  const erroDoOverview = (periodo: string) => memorialDoErroDaFonte(e.overview, { fonte: FONTE_DO_OVERVIEW, periodo });
  const cambioValue: MetricFormulaValue | null = taxa != null ? { label: "Câmbio US$ 1 →", value: fmtBRL(taxa), source: cambio.fonte } : null;
  const causaDoCambio: MetricFormulaValue = { label: "Câmbio US$ → R$", value: "indisponível", source: cambio.fonte };

  // ───────────────────────── investimento (AC1) ─────────────────────────
  const dependentesDoInvest = "o Investimento (Total), o ROAS, a Margem e os CACs ficam";
  const meta: Parte = !e.meta.temCampanhas
    ? { tipo: "pronto", valor: 0 }
    : e.meta.erroFiltro
      ? {
          tipo: "erro",
          memorial: memorialDoErroDaMeta(e.meta.erroFiltro, declInvest.periodo, dependentesDoInvest),
          causa: { label: "Investimento (Meta)", value: e.meta.erroFiltro, source: "Meta Ads API" },
        }
      : e.meta.filtro
        ? { tipo: "pronto", valor: e.meta.filtro.spendComImposto }
        : { tipo: "carregando" };
  const google: Parte = (() => {
    if (!e.google.mostrar) return { tipo: "pronto", valor: 0 };
    const estado = e.google.filtro;
    const semNumero = memorialDoGoogleSemNumero(comoEstadoDoGoogle(estado), declInvest.periodo, dependentesDoInvest);
    if (semNumero) {
      const valor = estado.tipo === "erro" ? estado.mensagem : "nenhuma conta Google Ads conectada ao projeto";
      return { tipo: "erro", memorial: semNumero, causa: { label: "Investimento (Google)", value: valor, source: "Google Ads API" } };
    }
    const v = valorDoGoogleNaRegua(estado);
    return v == null ? { tipo: "carregando" } : { tipo: "pronto", valor: v };
  })();
  const metaValor = meta.tipo === "pronto" ? meta.valor : null;
  const googleValor = google.tipo === "pronto" ? google.valor : null;
  // As duas parcelas da Meta fecham no valor exibido (QA-04 da 42.2).
  const [metaLiquido, metaImposto] =
    metaValor != null && e.meta.filtro && e.meta.temCampanhas ? fecharEmCentavos(metaValor, [e.meta.filtro.spendLiquido, e.meta.filtro.imposto]) : [0, 0];
  const investimentoTotal = metaValor != null && googleValor != null ? (centavos(metaValor) + centavos(googleValor)) / 100 : null;
  const causasDoInvest: MetricFormulaValue[] = [meta, google].flatMap((p) => (p.tipo === "erro" ? [p.causa] : []));

  const linhaDeInvest = (id: "meta" | "google", rotulo: string, p: Parte): LinhaEmSegundoPlano => ({ id, rotulo, valor: p.tipo === "pronto" ? fmtBRL(p.valor) : "—" });
  const linhasDoInvest = [linhaDeInvest("meta", "Meta", meta), ...(e.google.mostrar ? [linhaDeInvest("google", "Google", google)] : [])];

  const cardInvestimento: CardDoResumo = (() => {
    const base = { id: "investimento", rotulo: "Investimento (Total)", declaracao: declInvest, icone: "investimento" as const, secundarias: linhasDoInvest };
    if (causasDoInvest.length === 1) return { ...base, valor: "—", formula: [meta, google].find((p) => p.tipo === "erro")!.memorial as MetricFormula };
    if (causasDoInvest.length > 1) return { ...base, valor: "—", formula: memorialDeDependente(declInvest, "Investimento (Meta) + Investimento (Google)", causasDoInvest) };
    // AC1d — Meta ou Google ainda carregando: o total mostra "—" (sem memorial), nunca um total parcial.
    if (investimentoTotal == null) return { ...base, valor: "—" };
    return {
      ...base,
      valor: fmtBRL(investimentoTotal),
      formula: {
        expression: e.google.mostrar ? "Meta (Σ spend diário ÷ (1 − 12,15%)) + Google (Σ spend diário)" : "Σ spend diário da Meta ÷ (1 − 12,15%)",
        values: [
          { label: "Meta · investimento líquido", value: fmtBRL(metaLiquido), source: "Meta Ads API · soma do spend diário das campanhas vinculadas" },
          { label: "Meta · imposto (12,15%)", value: fmtBRL(metaImposto), source: "alíquota vigente desde 01/01/2026, aplicada por dia" },
          { label: "Meta (com imposto)", value: fmtBRL(metaValor), source: "o mesmo valor do card Investimento (Meta) do bloco Meta Ads" },
          ...(e.google.mostrar ? [{ label: "Google", value: fmtBRL(googleValor), source: "Google Ads API · GET /daily por campanha vinculada, na régua de SP" }] : []),
        ],
        result: e.google.mostrar ? `${fmtBRL(metaValor)} + ${fmtBRL(googleValor)} = ${fmtBRL(investimentoTotal)}` : `${fmtBRL(metaLiquido)} + ${fmtBRL(metaImposto)} = ${fmtBRL(investimentoTotal)}`,
        period: declInvest.periodo,
        note: `O total JÁ inclui o imposto da Meta. O gross-up é por dentro: o imposto incide sobre o bruto, então não é spend × 1,1215.${e.google.mostrar ? ` Google sem imposto de 12,15% (aquele tributo é da plataforma Meta). ${NOTA_DO_FUSO_DO_GOOGLE}` : " Sem campanha Google vinculada: o total é só a Meta."}`,
      },
    };
  })();

  // ───────────────────────── receita e vendas do webhook (AC2) ─────────────────────────
  // AC3d — a resposta só vale para a janela que ECOA (o padrão do `naJanelaPedida` da 42.14).
  const vendas: EstadoDasVendas =
    e.vendas.tipo === "pronto" && e.vendas.dados.days !== ctx.diasDoFiltro
      ? { tipo: "erro", mensagem: `a resposta veio para ${e.vendas.dados.days} dias, não para os ${ctx.diasDoFiltro} do filtro` }
      : e.vendas;
  const dados: VendasPorCanalDoLyrio | null = vendas.tipo === "pronto" ? vendas.dados : null;
  const vendasCarregando = vendas.tipo === "carregando";
  const causaDasVendas: MetricFormulaValue | null =
    vendas.tipo === "erro" ? { label: "Vendas por canal", value: vendas.mensagem, source: ROTA_DAS_VENDAS } : null;
  const memorialDasVendasEmErro = (decl: DeclaracaoDaJanela, oQue: string): MetricFormula | undefined =>
    causaDasVendas
      ? {
          expression: `${oQue} indisponível`,
          values: [{ label: "Erro", value: causaDasVendas.value, source: ROTA_DAS_VENDAS }],
          result: "—",
          period: decl.periodo,
          note: "A consulta das vendas por canal falhou; tente atualizar. Enquanto isso, a Receita, as Vendas, o ROAS e a Margem ficam “—”, nunca 0.",
        }
      : undefined;
  const receitaTotalUsd = dados ? dados.totalPago.receitaUsd : null;
  const receitaTotalBrl = receitaTotalUsd != null && taxa != null ? receitaTotalUsd * taxa : null;

  // Os baldes que somam o total: os 4 canais e o conflito (só se houver, AC2c).
  const baldes = dados
    ? [
        ...dados.canais.map((c) => ({ rotulo: c.rotulo, vendas: c.vendas, receitaUsd: c.receitaUsd })),
        ...(dados.conflito.compradores > 0 ? [{ rotulo: "Meta e Google (conflito)", vendas: dados.conflito.vendas, receitaUsd: dados.conflito.receitaUsd }] : []),
      ]
    : [];
  const atribuicaoTardia = dados?.atributosDesde != null && inicio < dados.atributosDesde;
  const notaDaLinha = atribuicaoTardia ? `atribuição desde ${diaMes(dados!.atributosDesde!)}` : undefined;
  const coberturaDaSerie =
    ctx.serieDesde && inicio < ctx.serieDesde
      ? ` A série de assinaturas do webhook só existe desde ${diaMes(ctx.serieDesde)}: antes disso não há venda a contar, então a receita e as vendas começam ali (o investimento, não).`
      : "";
  const notaDaCobertura = dados ? ` ${declaracaoDeCobertura(dados)}${avisoDeConflito(dados.conflito.compradores) ? ` ${avisoDeConflito(dados.conflito.compradores)}` : ""}` : "";

  // As linhas Meta/Google de Receita e Vendas: as do bloco da 42.16, pela mesma função e o mesmo estado.
  const numerosDoCanal = (canal: "meta" | "google", investimento: number | null) =>
    blocoDoCanalDoLyrio({ canal, trafego: investimento != null ? { investimentoBrl: investimento, impressoes: 0, cliques: 0 } : null, estado: vendas, brlRate: taxa });
  const numerosMeta = numerosDoCanal("meta", metaValor);
  const numerosGoogle = numerosDoCanal("google", googleValor);
  const linhas = (fmt: (n: ReturnType<typeof numerosDoCanal>) => string): LinhaEmSegundoPlano[] => [
    { id: "meta", rotulo: "Meta", valor: fmt(numerosMeta), nota: notaDaLinha },
    ...(e.google.mostrar ? [{ id: "google", rotulo: "Google", valor: fmt(numerosGoogle), nota: notaDaLinha }] : []),
  ];
  // AC2e/AC7c — a etiqueta das linhas, por extenso no memorial.
  const notaDoGoogleNaLinha = atribuicaoTardia
    ? ` As linhas em segundo plano levam “${notaDaLinha}”.${e.google.mostrar ? " Na linha do Google, a data é a do canal da venda em geral: a rota não informa uma data própria do Google." : ""}`
    : "";

  const cardReceita: CardDoResumo = (() => {
    const base = { id: "receita", rotulo: "Receita (RevenueCat)", declaracao: declVenda, icone: "receita" as const, secundarias: linhas((n) => fmtBRL(n.receitaBrl)) };
    const erro = memorialDasVendasEmErro(declVenda, "Receita");
    if (erro) return { ...base, valor: "—", formula: erro };
    if (vendasCarregando) return { ...base, valor: "—", carregando: true };
    if (!dados) return { ...base, valor: "—" }; // API anterior à rota ou RevenueCat desconectado: o aviso de versão explica
    if (receitaTotalBrl == null || !cambioValue) {
      return { ...base, valor: "—", formula: { expression: "Receita (US$) × câmbio", values: [causaDoCambio], result: "—", period: declVenda.periodo, note: "Sem câmbio a receita fica “—”, nunca dólar com cara de real." } };
    }
    const brl = fecharEmCentavos(receitaTotalBrl, baldes.map((b) => b.receitaUsd * taxa!));
    return {
      ...base,
      valor: fmtBRL(receitaTotalBrl),
      formula: {
        expression: "Σ receita das vendas pagas de todos os canais (US$) × câmbio",
        values: [
          ...baldes.map((b, i) => ({ label: b.rotulo, value: `${fmtBRL(brl[i])} (${fmtUsd(b.receitaUsd)})`, source: ROTA_DAS_VENDAS })),
          cambioValue,
        ],
        result: `${baldes.map((_, i) => fmtBRL(brl[i])).join(" + ")} = ${fmtBRL(receitaTotalBrl)} (${fmtUsd(receitaTotalUsd)} × ${fmtBRL(taxa)})`,
        period: declVenda.periodo,
        note: `Receita bruta das vendas pagas (compra, renovação, conversão de teste), dos eventos do webhook: antes da comissão de loja, de impostos e de custos. Os baldes somam o total exibido; “Meta” e “Google” em segundo plano são dois deles.${coberturaDaSerie}${notaDaCobertura}${notaDoGoogleNaLinha}`,
      },
    };
  })();

  const cardVendas: CardDoResumo = (() => {
    const base = { id: "vendas", rotulo: "Vendas (Total)", declaracao: declVenda, icone: "vendas" as const, secundarias: linhas((n) => fmtNum(n.vendas)) };
    const erro = memorialDasVendasEmErro(declVenda, "Vendas");
    if (erro) return { ...base, valor: "—", formula: erro };
    if (vendasCarregando) return { ...base, valor: "—", carregando: true };
    if (!dados) return { ...base, valor: "—" };
    return {
      ...base,
      valor: fmtNum(dados.totalPago.vendas),
      formula: {
        expression: "Σ vendas pagas de todos os canais",
        values: baldes.map((b) => ({ label: b.rotulo, value: fmtNum(b.vendas), source: ROTA_DAS_VENDAS })),
        result: `${baldes.map((b) => fmtNum(b.vendas)).join(" + ")} = ${fmtNum(dados.totalPago.vendas)}`,
        period: declVenda.periodo,
        note: `Vendas são EVENTOS pagos (compra, renovação, conversão de teste), não pessoas: quem renovou duas vezes conta 2. Para os novos pagantes (pessoas), veja o CAC.${coberturaDaSerie}${notaDaCobertura}${notaDoGoogleNaLinha}`,
      },
    };
  })();

  // ───────────────────────── ROAS e Margem (AC3) ─────────────────────────
  // As linhas: cada canal contra o PRÓPRIO investimento (`linhasDoResumoPorCanal`, AC3b).
  const porCanal = dados
    ? linhasDoResumoPorCanal({
        dados,
        brlRate: taxa,
        meta: { liquidoBrl: metaLiquido, impostoBrl: metaImposto, conhecido: e.meta.temCampanhas && metaValor != null },
        google: { investimentoBrl: googleValor ?? 0, conhecido: e.google.mostrar && googleValor != null },
        percentuais: e.percentuais,
      })
    : [];
  const doCanal = (canal: "meta" | "google") => porCanal.find((l) => l.chave === canal) ?? null;
  const linhasDeRoas: LinhaEmSegundoPlano[] = [
    { id: "meta", rotulo: "ROAS Meta", valor: fmtRoas(doCanal("meta")?.roas ?? null), nota: notaDaLinha },
    ...(e.google.mostrar ? [{ id: "google", rotulo: "ROAS Google", valor: fmtRoas(doCanal("google")?.roas ?? null), nota: notaDaLinha }] : []),
  ];
  const linhaDeMargem = (canal: "meta" | "google", rotulo: string): LinhaEmSegundoPlano => {
    const m = doCanal(canal)?.margemBrl ?? null;
    return { id: canal, rotulo, valor: fmtBRL(m), negativo: m != null && m < 0, nota: notaDaLinha };
  };
  const linhasDeMargem = [linhaDeMargem("meta", "Margem Meta"), ...(e.google.mostrar ? [linhaDeMargem("google", "Margem Google")] : [])];

  /** Por que o ROAS / a Margem não têm número. `[]` quando têm (ou quando só falta carregar). */
  const causasDoFluxo: MetricFormulaValue[] = [
    ...(causaDasVendas ? [causaDasVendas] : []),
    ...(dados && taxa == null ? [causaDoCambio] : []),
    ...causasDoInvest,
  ];
  // AC2g — o skeleton é da venda carregando; investimento carregando deixa "—" (AC1d).
  const fluxoCarregando = !causasDoFluxo.length && vendasCarregando;
  const notaDoTotal =
    "O total inclui a receita orgânica (ou de cupom) e a sem atribuição, que não têm investimento: por isso o ROAS total não é a média do ROAS da Meta e do Google, e a soma das margens da Meta e do Google não é a margem total.";
  const notaDaJanela = `Receita (webhook) e investimento na mesma janela (${intervalo}), em dias de SP.${coberturaDaSerie}${notaDoGoogleNaLinha}`;

  const roas = receitaTotalBrl != null && investimentoTotal != null && investimentoTotal > 0 ? receitaTotalBrl / investimentoTotal : null;
  const cardRoas: CardDoResumo = (() => {
    const base = { id: "roas", rotulo: "ROAS", declaracao: declVenda, icone: "roas" as const, realce: true, secundarias: linhasDeRoas };
    if (causasDoFluxo.length) return { ...base, valor: "—", formula: memorialDeDependente(declVenda, "Receita total (R$) ÷ Investimento total (R$)", causasDoFluxo) };
    if (fluxoCarregando) return { ...base, valor: "—", carregando: true };
    if (roas == null) return { ...base, valor: "—" };
    return {
      ...base,
      valor: fmtRoas(roas),
      formula: {
        expression: "Receita total (R$) ÷ Investimento total (R$)",
        values: [
          { label: "Receita total", value: fmtBRL(receitaTotalBrl), source: "o card Receita (RevenueCat): todos os canais, convertida pelo câmbio" },
          { label: "Investimento total", value: fmtBRL(investimentoTotal), source: e.google.mostrar ? "o card Investimento (Total): Meta (com imposto) + Google" : "o card Investimento (Total): Meta, com imposto de 12,15%" },
        ],
        result: `${fmtBRL(receitaTotalBrl)} ÷ ${fmtBRL(investimentoTotal)} = ${fmtRoas(roas)}`,
        period: declVenda.periodo,
        note: `Receita bruta contra investimento; não desconta comissão de loja, imposto nem custos (veja a Margem de Contribuição). ${notaDoTotal} Em segundo plano, cada canal contra o próprio investimento. ${notaDaJanela}`,
      },
    };
  })();

  const { platformFeePct, taxPct, otherCostsPct } = e.percentuais;
  const margem =
    receitaTotalBrl != null && metaValor != null && googleValor != null
      ? calcularMargemContribuicao({
          faturamentoBrutoBrl: receitaTotalBrl,
          platformFeePct,
          taxPct,
          otherCostsPct,
          investimentoMetaLiquidoBrl: metaLiquido,
          impostoMetaBrl: metaImposto,
          investimentoGoogleBrl: googleValor,
        })
      : null;
  const cardMargem: CardDoResumo = (() => {
    const base = { id: "margem", rotulo: "Margem de Contribuição", declaracao: declVenda, icone: "margem" as const, realce: true, secundarias: linhasDeMargem };
    if (causasDoFluxo.length) return { ...base, valor: "—", formula: memorialDeDependente(declVenda, "Faturamento líquido − investimento", causasDoFluxo) };
    if (fluxoCarregando) return { ...base, valor: "—", carregando: true };
    if (!margem) return { ...base, valor: "—" };
    return {
      ...base,
      valor: fmtBRL(margem.margem),
      negativo: margem.margem < 0,
      formula: {
        expression: "(Bruto − plataforma − imposto − outros custos) − investimento − imposto Meta",
        values: [
          { label: "Faturamento bruto", value: fmtBRL(margem.faturamentoBruto), source: "o card Receita (RevenueCat): todos os canais, convertido pelo câmbio" },
          { label: `− Descontos da plataforma (${platformFeePct}%)`, value: fmtBRL(margem.descontosPlataforma), source: "comissão Apple/Google — configurável na etapa" },
          { label: `− Imposto (${taxPct}%)`, value: fmtBRL(margem.imposto), source: "imposto sobre a receita — configurável na etapa" },
          { label: `− Outros custos (${otherCostsPct}%)`, value: fmtBRL(margem.outrosCustos), source: "custos operacionais — configurável na etapa" },
          { label: "= Faturamento líquido", value: fmtBRL(margem.faturamentoLiquido), source: "bruto menos os três descontos acima" },
          { label: "− Investimento (Meta líquido)", value: fmtBRL(metaLiquido), source: "Meta Ads API, sem imposto" },
          { label: "− Imposto Meta (12,15%)", value: fmtBRL(metaImposto), source: "gross-up por dentro, desde 01/01/2026" },
          ...(e.google.mostrar ? [{ label: "− Investimento (Google)", value: fmtBRL(googleValor), source: "Google Ads API — sem imposto da Meta" }] : []),
        ],
        result: `${fmtBRL(margem.faturamentoLiquido)} − ${fmtBRL(margem.investimentoTotal)} = ${fmtBRL(margem.margem)}`,
        period: declVenda.periodo,
        note: `Os três percentuais incidem sobre o faturamento bruto (não em cascata) e são editáveis em Configurar. ${notaDoTotal} Em segundo plano, a mesma conta com a receita e o investimento de cada canal. ${notaDaJanela}`,
      },
    };
  })();

  // ───────────────────────── retratos e novos clientes (AC4) ─────────────────────────
  const mrr = metrica(overview, "mrr");
  const mrrBrl = mrr != null && taxa != null ? mrr * taxa : null;
  const assinaturas = metrica(overview, "active_subscriptions");
  const trials = metrica(overview, "active_trials");

  const cardMrr: CardDoResumo = (() => {
    const base = { id: "mrr", rotulo: "MRR", declaracao: agora, icone: "mrr" as const };
    const erro = erroDoOverview(agora.periodo);
    if (erro) return { ...base, valor: "—", formula: erro };
    if (mrrBrl == null) return { ...base, valor: "—", carregando: e.overview.tipo === "carregando" };
    return {
      ...base,
      valor: fmtBRL(mrrBrl),
      formula: {
        expression: "MRR (US$) × câmbio",
        values: [{ label: "MRR", value: fmtUsd(mrr), source: `${FONTE_DO_OVERVIEW} · mrr` }, ...(cambioValue ? [cambioValue] : [])],
        result: `${fmtUsd(mrr)} × ${fmtBRL(taxa)} = ${fmtBRL(mrrBrl)}`,
        period: agora.periodo,
        // PO-D6: a API marca o MRR com P28D; o painel segue a definição documentada (retrato).
        note: "Receita recorrente mensal no momento da consulta — não é média de período. Retrato, não acumulado: pela documentação do RevenueCat, o MRR é o valor atual das assinaturas pagas ativas, normalizado para um mês. A API marca este número com período de 28 dias (P28D), o que a documentação não explica; o painel segue a definição documentada.",
      },
    };
  })();

  // AC4b — um card com os dois retratos lado a lado; o memorial mantém os dois textos.
  const cardAssinaturasTrials: CardDoResumo = (() => {
    const base = { id: "assinaturas-trials", rotulo: "Assinaturas ativas / Trials ativos", declaracao: agora, icone: "assinaturas" as const };
    const erro = erroDoOverview(agora.periodo);
    if (erro) return { ...base, valor: "— / —", formula: erro };
    if (assinaturas == null && trials == null) return { ...base, valor: "— / —", carregando: e.overview.tipo === "carregando" };
    return {
      ...base,
      valor: `${fmtNum(assinaturas)} / ${fmtNum(trials)}`,
      formula: {
        expression: "Contagem · Contagem",
        values: [
          { label: "Assinaturas ativas", value: fmtNum(assinaturas), source: `${FONTE_DO_OVERVIEW} · active_subscriptions` },
          { label: "Trials ativos", value: fmtNum(trials), source: `${FONTE_DO_OVERVIEW} · active_trials` },
        ],
        result: `${fmtNum(assinaturas)} / ${fmtNum(trials)}`,
        period: agora.periodo,
        note: "Assinaturas ativas agora — não é acumulado do período (o RevenueCat inclui as canceladas que ainda têm acesso). Trials em andamento agora. Ainda não viraram receita.",
      },
    };
  })();

  const cards: CardDoResumo[] = [
    cardInvestimento,
    cardReceita,
    cardVendas,
    cardRoas,
    cardMargem,
    cardMrr,
    cardAssinaturasTrials,
    { ...cardDeNovosClientes(e.novosClientes, e.overview, ctx), icone: "clientes" },
  ];
  return cards.map(comAsLinhasNoMemorial);
}
