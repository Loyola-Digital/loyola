/**
 * Story 42.17 — a tabela "Dados diários" da etapa Lyrio, logo abaixo do
 * Resumo: UMA linha por dia de calendário de SP da janela do filtro, só o
 * consolidado (D3), e o Total no rodapé. Função pura (o vitest do web coleta
 * `lib/utils`); o `.tsx` só desenha.
 *
 * ## De onde vem cada coisa — as MESMAS consultas do Resumo (42.15)
 *
 *   Meta ....... `useCampaignDailyInsightsBulk(campaignIds, days)`: as linhas do
 *                dia, com o imposto de 12,15% por linha (`sumMetaSpendWithTax`,
 *                o mesmo do card) — aplicado UMA vez, aqui.
 *   Google ..... `TrafegoDoGoogleNaRegua.diasPorCampanha` (42.19): as linhas do
 *                `/daily` por campanha vinculada, já recortadas na régua de SP.
 *   Vendas ..... `diario` da `vendas-por-canal` (API v64): o `totalPago` por dia
 *                de SP — o mesmo estado (e a mesma chave de cache) do Resumo.
 *                Nunca o `daily` do `/sales`, que conta o que a quebra não conta.
 *
 * ## O Total é o do card, e a coluna soma o Total (AC4)
 *
 * O rodapé sai da MESMA soma do card: o Investimento em centavos
 * (`centavos(Meta) + centavos(Google)`), a Meta como `spendComImposto`, o Google
 * como o `spend` da régua, as Vendas como `totalPago.vendas` e a Receita como
 * `totalPago.receitaUsd × câmbio` — o câmbio aplicado uma vez, sobre a soma. As
 * linhas em R$ são repartidas com `fecharEmCentavos`, para a coluna somar
 * exatamente o Total exibido (o Investimento do dia é a Meta do dia mais o
 * Google do dia, já fechados). As razões do rodapé saem das somas, nunca da
 * média das razões dos dias.
 *
 * ## Nenhuma janela misturada
 *
 * Uma fonte que devolve dia fora da janela (o cache de ontem depois da meia-noite,
 * a resposta de outro `days`) fica "—" com a causa, em vez de ser somada no
 * Total ou empurrada para um dia vizinho.
 */

import { inicioDaJanela } from "@loyola-x/shared/src/janela-de-dias";
import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import { sumMetaInsights, sumMetaSpendWithTax } from "./funnel-metrics";
import { fecharEmCentavos } from "./lyrio-margin";
import { avisoDoGoogleEmLinha } from "./lyrio-google-ads";
import { comoEstadoDoGoogle, NOTA_DO_FUSO_DO_GOOGLE, type TrafegoDoGoogleNaRegua } from "./google-ads-na-regua";
import { DICA_DIA_EM_ANDAMENTO, diasDaJanela } from "./lyrio-detalhamento-diario";
import { diaMes, intervaloDaJanela, ultimosNDias } from "./janela-dos-cards-lyrio";
import { ORDEM_DO_DIA_PADRAO, ordenarLinhasPorDia, type OrdemDoDia } from "./ordem-do-dia";
import { fmtCurrency, fmtInt, fmtPercent } from "./format-number";
import type { EstadoDasVendas } from "./vendas-por-canal-lyrio";

export { DICA_DIA_EM_ANDAMENTO };

/** AC1e — literal. */
export const DICA_ANTES_DA_SERIE = "antes do início da série do webhook";
/** AC5c — a API anterior à v64 não traz `diario`. */
export const CAUSA_API_SEM_DIARIO = "a API ainda não traz a venda por dia (contrato 64) — ver o aviso de versão";

export type ChaveDaColuna =
  | "investimento"
  | "investMeta"
  | "investGoogle"
  | "vendas"
  | "receita"
  | "roas"
  | "custoPorVenda"
  | "impressoes"
  | "cliques"
  | "ctr"
  | "cpm"
  | "cpc";

export type FormatoDaColuna = "moeda" | "inteiro" | "percentual" | "roas";

export interface ColunaDosDadosDiarios {
  chave: ChaveDaColuna;
  rotulo: string;
  /** A dica do cabeçalho (`title`); `null` = sem dica (AC2). */
  dica: string | null;
  formato: FormatoDaColuna;
}

export type ValoresDoDia = Record<ChaveDaColuna, number | null>;

export interface LinhaDosDadosDiarios {
  /** `AAAA-MM-DD`, dia de calendário de SP. */
  date: string;
  /** AC1d — hoje é parcial. */
  emAndamento: boolean;
  /** AC1e — o dia é anterior ao início da série do webhook e não tem venda. */
  antesDaSerie: boolean;
  valores: ValoresDoDia;
  /** Por que a célula é "—": a dica dela. Só para insumo desconhecido. */
  causas: Partial<Record<ChaveDaColuna, string>>;
}

export interface TotalDosDadosDiarios {
  valores: ValoresDoDia;
  causas: Partial<Record<ChaveDaColuna, string>>;
}

export interface DadosDiariosDoLyrio {
  /** AC1c — `Dados diários · últimos N dias (dd/mm a dd/mm)`. */
  titulo: string;
  /** AC5d — alguma fonte ainda não respondeu: a tabela desenha um skeleton. */
  carregando: boolean;
  colunas: ColunaDosDadosDiarios[];
  dias: LinhaDosDadosDiarios[];
  total: TotalDosDadosDiarios;
  /** AC5 — as causas visíveis (`role="alert"`), sem repetir. */
  avisos: string[];
}

export interface EntradaDosDadosDiarios {
  /** `serieDesde`: o início da série de assinaturas (`assinaturaDesde`), o mesmo do Resumo. */
  ctx: { diasDoFiltro: number; hoje: string; serieDesde?: string | null };
  cambio: { taxa: number | null; fonte: string };
  /**
   * A MESMA consulta do card (`useCampaignDailyInsightsBulk` com o `days` do
   * filtro). `linhas` `undefined` = carregando; sem campanha vinculada = 0.
   */
  meta: { temCampanhas: boolean; linhas: readonly CampaignDailyInsight[] | undefined; erro?: string | null };
  /** `mostrar` = há campanha Google vinculada (o mesmo do Resumo). `trafego`: `trafegoDoGoogleNaRegua` do filtro. */
  google: { mostrar: boolean; trafego: TrafegoDoGoogleNaRegua };
  /** O MESMO estado de vendas do Resumo (`vendasDosBlocos`). */
  vendas: EstadoDasVendas;
  /** Distingue "RevenueCat não conectado" de "API sem a rota" (os dois chegam como `oculto`). */
  revenuecatConectado: boolean;
  /** Os pagantes (de onde vem `serieDesde`) ainda não responderam: espera, como o Resumo. */
  serieCarregando?: boolean;
  ordem?: OrdemDoDia;
}

type Fonte<T> = { tipo: "pronto"; dados: T } | { tipo: "carregando" } | { tipo: "indisponivel"; causa: string; aviso: string };

interface MidiaDosDias {
  /** Por dia (ascendente, a ordem de `diasAsc`): o gasto já fechado em centavos, impressões e cliques. */
  gasto: number[];
  impressoes: number[];
  cliques: number[];
  /** O total do card, sem arredondar (é o que o card formata). */
  gastoTotal: number;
}

interface VendasDosDias {
  vendas: Map<string, number>;
  receitaUsd: Map<string, number>;
  vendasTotal: number;
  receitaUsdTotal: number;
}

const div = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? a / b : null);
const emCentavos = (v: number) => Math.round(v * 100);

/**
 * AC4c — `fecharEmCentavos` com o resto no MAIOR dia. A função põe o resto do
 * arredondamento na última parcela; com os dias em ordem, a última seria hoje,
 * que pode não ter gasto — e mostraria "R$ 0,02" (ou "−R$ 0,01") num dia sem
 * nada. No maior dia, o mesmo centavo é ruído. A soma das parcelas é o Total
 * exibido do mesmo jeito.
 */
export function fecharNoMaiorDia(total: number, partes: readonly number[]): number[] {
  if (partes.length === 0) return [];
  let maior = 0;
  for (let i = 1; i < partes.length; i++) if (Math.abs(partes[i]) > Math.abs(partes[maior])) maior = i;
  const ordem = [...partes.keys()].filter((i) => i !== maior).concat(maior);
  const fechadas = fecharEmCentavos(total, ordem.map((i) => partes[i]));
  const out = new Array<number>(partes.length);
  ordem.forEach((i, k) => (out[i] = fechadas[k]));
  return out;
}

function midiaDaMeta(e: EntradaDosDadosDiarios, diasAsc: readonly string[], periodo: string): Fonte<MidiaDosDias> {
  const zeros = diasAsc.map(() => 0);
  if (!e.meta.temCampanhas) return { tipo: "pronto", dados: { gasto: zeros, impressoes: zeros, cliques: zeros, gastoTotal: 0 } };
  if (e.meta.erro) {
    return {
      tipo: "indisponivel",
      causa: `Meta Ads indisponível: ${e.meta.erro}`,
      aviso: `Não foi possível carregar o investimento da Meta: ${e.meta.erro}. O Investimento, a Meta, o ROAS, o custo por venda, as impressões, os cliques, o CTR, o CPM e o CPC ficam “—”.`,
    };
  }
  if (!e.meta.linhas) return { tipo: "carregando" };
  const porDia = new Map<string, CampaignDailyInsight[]>(diasAsc.map((d) => [d, []]));
  const fora: string[] = [];
  for (const l of e.meta.linhas) {
    const dia = String(l.date_start ?? "").slice(0, 10);
    const lista = porDia.get(dia);
    if (lista) lista.push(l);
    else fora.push(dia);
  }
  if (fora.length) {
    return {
      tipo: "indisponivel",
      causa: `a consulta da Meta trouxe dia fora da janela (${fora.sort()[0] ? diaMes(fora[0]) : "sem data"}; a janela é ${periodo})`,
      aviso: `A consulta da Meta é de outra janela (traz dia fora de ${periodo}); atualize a página. Enquanto isso, o investimento da Meta fica “—”, nunca somado com outra janela.`,
    };
  }
  // O total é o do card: a mesma função sobre as mesmas linhas.
  const gastoTotal = sumMetaSpendWithTax([[...e.meta.linhas]]).spendComImposto;
  const partes = diasAsc.map((d) => sumMetaSpendWithTax([porDia.get(d)!]).spendComImposto);
  const trafego = diasAsc.map((d) => sumMetaInsights([porDia.get(d)!]));
  return {
    tipo: "pronto",
    dados: {
      gasto: fecharNoMaiorDia(gastoTotal, partes),
      impressoes: trafego.map((t) => t.impressions),
      cliques: trafego.map((t) => t.linkClicks),
      gastoTotal,
    },
  };
}

function midiaDoGoogle(e: EntradaDosDadosDiarios, diasAsc: readonly string[]): Fonte<MidiaDosDias> {
  const zeros = diasAsc.map(() => 0);
  const t = e.google.trafego;
  if (!e.google.mostrar || t.tipo === "sem_campanha") return { tipo: "pronto", dados: { gasto: zeros, impressoes: zeros, cliques: zeros, gastoTotal: 0 } };
  if (t.tipo === "carregando") return { tipo: "carregando" };
  if (t.tipo === "erro" || t.tipo === "sem_conta") {
    const aviso = avisoDoGoogleEmLinha(comoEstadoDoGoogle(t)) ?? "Google Ads indisponível.";
    return {
      tipo: "indisponivel",
      causa: t.tipo === "erro" ? `Google Ads indisponível: ${t.mensagem}` : "nenhuma conta Google Ads conectada ao projeto",
      aviso: `${aviso} O Investimento, o Google, o ROAS, o custo por venda, as impressões, os cliques, o CTR, o CPM e o CPC ficam “—”.`,
    };
  }
  const indice = new Map(diasAsc.map((d, i) => [d, i]));
  const centavos = diasAsc.map(() => 0);
  const impressoes = diasAsc.map(() => 0);
  const cliques = diasAsc.map(() => 0);
  for (const linhas of t.diasPorCampanha.values()) {
    for (const l of linhas) {
      const i = indice.get(l.date);
      if (i === undefined) continue; // `linhasNaRegua` já recortou; a guarda fica para a função valer sozinha
      centavos[i] += emCentavos(Number(l.spend) || 0);
      impressoes[i] += Number(l.impressions) || 0;
      cliques[i] += Number(l.clicks) || 0;
    }
  }
  // Os dias têm de somar o total do card (o `spend` da régua); senão, "—" com a causa.
  if (centavos.reduce((s, c) => s + c, 0) !== emCentavos(t.spend)) {
    return {
      tipo: "indisponivel",
      causa: "as linhas por dia do Google não somam o investimento do Google do Resumo",
      aviso: "As linhas por dia do Google Ads não fecham com o investimento do Google do Resumo; o Google fica “—” na tabela.",
    };
  }
  return {
    tipo: "pronto",
    dados: { gasto: fecharNoMaiorDia(t.spend, centavos.map((c) => c / 100)), impressoes, cliques, gastoTotal: t.spend },
  };
}

function vendasDosDias(e: EntradaDosDadosDiarios, inicio: string, periodo: string): Fonte<VendasDosDias> {
  const { diasDoFiltro, hoje } = e.ctx;
  const v = e.vendas;
  if (v.tipo === "carregando" || (v.tipo === "pronto" && e.serieCarregando === true)) return { tipo: "carregando" };
  const sufixo = "As vendas, a receita, o ROAS e o custo por venda ficam “—”.";
  if (v.tipo === "oculto") {
    return e.revenuecatConectado
      ? { tipo: "indisponivel", causa: "a API ainda não tem a rota das vendas por canal — ver o aviso de versão", aviso: `A API ainda não tem a rota das vendas por canal (ver o aviso de versão). ${sufixo}` }
      : { tipo: "indisponivel", causa: "RevenueCat não conectado", aviso: `RevenueCat não conectado: conecte em Configurar. ${sufixo}` };
  }
  if (v.tipo === "erro") return { tipo: "indisponivel", causa: `vendas por canal indisponíveis: ${v.mensagem}`, aviso: `Não foi possível carregar as vendas por canal: ${v.mensagem}. ${sufixo}` };
  const d = v.dados;
  const outraJanela = (oQue: string) => ({
    tipo: "indisponivel" as const,
    causa: `a resposta das vendas é de outra janela (${oQue})`,
    aviso: `A resposta das vendas é de outra janela (${oQue}; a tabela é ${periodo}); atualize a página. ${sufixo}`,
  });
  // A mesma guarda do Resumo (AC3d da 42.15): a resposta só vale para a janela que ECOA.
  if (d.days !== diasDoFiltro) return outraJanela(`${d.days} dias, não os ${diasDoFiltro} do filtro`);
  if (d.desde && d.desde !== inicio) return outraJanela(`começa em ${diaMes(d.desde)}, não em ${diaMes(inicio)}`);
  if (!d.diario) return { tipo: "indisponivel", causa: CAUSA_API_SEM_DIARIO, aviso: `A API ainda não traz a venda por dia (contrato 64) — ver o aviso de versão. ${sufixo}` };
  const vendas = new Map<string, number>();
  const receitaUsd = new Map<string, number>();
  let somaVendas = 0;
  let somaCentavos = 0;
  for (const x of d.diario) {
    if (x.dia < inicio || x.dia > hoje) return outraJanela(`traz venda em ${diaMes(x.dia)}`);
    vendas.set(x.dia, (vendas.get(x.dia) ?? 0) + x.vendas);
    receitaUsd.set(x.dia, (receitaUsd.get(x.dia) ?? 0) + x.receitaUsd);
    somaVendas += x.vendas;
    somaCentavos += emCentavos(x.receitaUsd);
  }
  if (somaVendas !== d.totalPago.vendas || somaCentavos !== emCentavos(d.totalPago.receitaUsd)) {
    return {
      tipo: "indisponivel",
      causa: "o diário das vendas não fecha com o total pago",
      aviso: `O diário das vendas não fecha com o total pago da mesma resposta (${somaVendas} × ${d.totalPago.vendas} vendas). ${sufixo}`,
    };
  }
  return { tipo: "pronto", dados: { vendas, receitaUsd, vendasTotal: d.totalPago.vendas, receitaUsdTotal: d.totalPago.receitaUsd } };
}

export function montarDadosDiariosDoLyrio(e: EntradaDosDadosDiarios): DadosDiariosDoLyrio {
  const n = Math.max(1, e.ctx.diasDoFiltro);
  const { hoje } = e.ctx;
  const inicio = inicioDaJanela(n, hoje);
  const periodo = intervaloDaJanela(n, hoje);
  // AC1b — cada dia de calendário de SP da janela, do mais antigo ao mais recente (a ordem da repartição).
  const diasAsc = [...diasDaJanela(n, hoje)].reverse();
  const taxa = e.cambio.taxa;
  const mostrarGoogle = e.google.mostrar;

  const meta = midiaDaMeta(e, diasAsc, periodo);
  const google = midiaDoGoogle(e, diasAsc);
  const vendas = vendasDosDias(e, inicio, periodo);

  const colunas: ColunaDosDadosDiarios[] = [
    { chave: "investimento", rotulo: "Investimento", dica: mostrarGoogle ? "Meta com imposto + Google, régua de SP" : "Meta com imposto, régua de SP (sem campanha Google vinculada)", formato: "moeda" },
    { chave: "investMeta", rotulo: "Invest. Meta", dica: null, formato: "moeda" },
    ...(mostrarGoogle ? [{ chave: "investGoogle" as const, rotulo: "Invest. Google", dica: NOTA_DO_FUSO_DO_GOOGLE, formato: "moeda" as const }] : []),
    { chave: "vendas", rotulo: "Vendas", dica: "eventos pagos: compra, renovação, conversão de trial", formato: "inteiro" },
    {
      chave: "receita",
      rotulo: "Receita",
      dica: taxa != null ? `receita das vendas pagas (US$) × câmbio US$ 1 = ${fmtCurrency(taxa)} (${e.cambio.fonte})` : `câmbio US$ → R$ indisponível (${e.cambio.fonte})`,
      formato: "moeda",
    },
    { chave: "roas", rotulo: "ROAS", dica: null, formato: "roas" },
    { chave: "custoPorVenda", rotulo: "Custo por venda", dica: null, formato: "moeda" },
    { chave: "impressoes", rotulo: "Impressões", dica: null, formato: "inteiro" },
    { chave: "cliques", rotulo: "Cliques", dica: "Meta: link click; Google: cliques da campanha", formato: "inteiro" },
    { chave: "ctr", rotulo: "CTR", dica: null, formato: "percentual" },
    { chave: "cpm", rotulo: "CPM", dica: null, formato: "moeda" },
    { chave: "cpc", rotulo: "CPC", dica: null, formato: "moeda" },
  ];

  const carregando = meta.tipo === "carregando" || google.tipo === "carregando" || vendas.tipo === "carregando";
  const avisos = [...new Set([meta, google, vendas].flatMap((f) => (f.tipo === "indisponivel" ? [f.aviso] : [])))];

  // As causas das células "—" por insumo desconhecido (AC5).
  const causaMeta = meta.tipo === "indisponivel" ? meta.causa : undefined;
  const causaGoogle = google.tipo === "indisponivel" ? google.causa : undefined;
  const causaDaMidia = [causaMeta, causaGoogle].filter(Boolean).join("; ") || undefined;
  const causaVendas = vendas.tipo === "indisponivel" ? vendas.causa : undefined;
  const causaCambio = taxa == null ? "câmbio US$ → R$ indisponível" : undefined;
  const causaReceita = causaVendas ?? causaCambio;
  const juntar = (...c: (string | undefined)[]) => c.filter(Boolean).join("; ") || undefined;
  const causasDasColunas: Partial<Record<ChaveDaColuna, string>> = {
    investimento: causaDaMidia,
    investMeta: causaMeta,
    investGoogle: causaGoogle,
    vendas: causaVendas,
    receita: causaReceita,
    roas: juntar(causaReceita, causaDaMidia),
    custoPorVenda: juntar(causaVendas, causaDaMidia),
    impressoes: causaDaMidia,
    cliques: causaDaMidia,
    ctr: causaDaMidia,
    cpm: causaDaMidia,
    cpc: causaDaMidia,
  };
  const soCausas = (valores: ValoresDoDia, extra: Partial<Record<ChaveDaColuna, string>> = {}) => {
    const out: Partial<Record<ChaveDaColuna, string>> = {};
    for (const c of colunas) {
      if (valores[c.chave] != null) continue;
      const causa = extra[c.chave] ?? causasDasColunas[c.chave];
      if (causa) out[c.chave] = causa;
    }
    return out;
  };

  // A Receita do dia: repartida com `fecharEmCentavos` sobre o total do card (câmbio uma vez, na soma).
  const receitaTotal = vendas.tipo === "pronto" && taxa != null ? vendas.dados.receitaUsdTotal * taxa : null;
  const receitaDosDias =
    vendas.tipo === "pronto" && receitaTotal != null ? fecharNoMaiorDia(receitaTotal, diasAsc.map((d) => (vendas.dados.receitaUsd.get(d) ?? 0) * taxa!)) : null;

  const metaPronta = meta.tipo === "pronto" ? meta.dados : null;
  const googlePronto = google.tipo === "pronto" ? google.dados : null;
  const serieDesde = e.ctx.serieDesde ?? null;

  const razoes = (v: Omit<ValoresDoDia, "roas" | "custoPorVenda" | "ctr" | "cpm" | "cpc">): ValoresDoDia => ({
    ...v,
    roas: div(v.receita, v.investimento),
    custoPorVenda: v.vendas != null && v.vendas > 0 ? div(v.investimento, v.vendas) : null,
    ctr: v.cliques != null ? div(v.cliques * 100, v.impressoes) : null,
    cpm: v.investimento != null ? div(v.investimento * 1000, v.impressoes) : null,
    cpc: div(v.investimento, v.cliques),
  });

  const linhasAsc: LinhaDosDadosDiarios[] = diasAsc.map((dia, i) => {
    const vendasDoDia = vendas.tipo === "pronto" ? vendas.dados.vendas.get(dia) ?? 0 : null;
    // AC1e — antes da série do webhook, "—" (e não 0) nas colunas de venda. Dia que TEM venda
    // mostra a venda: esconder um número que entra no Total deixaria a coluna sem fechar (AC4c).
    const antesDaSerie = serieDesde != null && dia < serieDesde && !(vendasDoDia != null && vendasDoDia > 0);
    const investMeta = metaPronta ? metaPronta.gasto[i] : null;
    const investGoogle = mostrarGoogle ? (googlePronto ? googlePronto.gasto[i] : null) : null;
    const googleConhecido = !mostrarGoogle || googlePronto != null;
    const investimento = investMeta != null && googleConhecido ? (emCentavos(investMeta) + emCentavos(investGoogle ?? 0)) / 100 : null;
    const midia = (k: "impressoes" | "cliques") => (metaPronta && googlePronto ? metaPronta[k][i] + googlePronto[k][i] : null);
    const valores = razoes({
      investimento,
      investMeta,
      investGoogle,
      vendas: antesDaSerie ? null : vendasDoDia,
      receita: antesDaSerie || !receitaDosDias ? null : receitaDosDias[i],
      impressoes: midia("impressoes"),
      cliques: midia("cliques"),
    });
    const extra: Partial<Record<ChaveDaColuna, string>> = antesDaSerie
      ? { vendas: DICA_ANTES_DA_SERIE, receita: DICA_ANTES_DA_SERIE, roas: DICA_ANTES_DA_SERIE, custoPorVenda: DICA_ANTES_DA_SERIE }
      : {};
    return { date: dia, emAndamento: dia === hoje, antesDaSerie, valores, causas: soCausas(valores, extra) };
  });

  // ─── o Total: a MESMA soma dos cards do Resumo (AC4a/AC4c) ───
  const totalMeta = metaPronta ? metaPronta.gastoTotal : null;
  const totalGoogle = mostrarGoogle ? (googlePronto ? googlePronto.gastoTotal : null) : null;
  const totalInvest = totalMeta != null && (!mostrarGoogle || totalGoogle != null) ? (emCentavos(totalMeta) + emCentavos(totalGoogle ?? 0)) / 100 : null;
  const somaMidia = (k: "impressoes" | "cliques") =>
    metaPronta && googlePronto ? metaPronta[k].reduce((s, x) => s + x, 0) + googlePronto[k].reduce((s, x) => s + x, 0) : null;
  const totalValores = razoes({
    investimento: totalInvest,
    investMeta: totalMeta,
    investGoogle: totalGoogle,
    vendas: vendas.tipo === "pronto" ? vendas.dados.vendasTotal : null,
    receita: receitaTotal,
    impressoes: somaMidia("impressoes"),
    cliques: somaMidia("cliques"),
  });

  return {
    titulo: `Dados diários · ${ultimosNDias(n)} (${periodo})`,
    carregando,
    colunas,
    dias: ordenarLinhasPorDia(linhasAsc, e.ordem ?? ORDEM_DO_DIA_PADRAO),
    total: { valores: totalValores, causas: soCausas(totalValores) },
    avisos,
  };
}

/** O texto da célula: "—" para `null` (insumo desconhecido ou denominador 0, AC2a). */
export function formatarCelula(formato: FormatoDaColuna, v: number | null): string {
  if (v == null) return "—";
  if (formato === "moeda") return fmtCurrency(v);
  if (formato === "inteiro") return fmtInt(v);
  if (formato === "percentual") return fmtPercent(v);
  return `${v.toFixed(2)}x`;
}
