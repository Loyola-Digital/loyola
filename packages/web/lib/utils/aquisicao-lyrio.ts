/**
 * Story 42.14 (AC4, AC5, AC8; AC7 em espera) — os cards de aquisição do
 * Resumo mobile: CAC da Meta, do Google e consolidado (nas DUAS janelas: o
 * filtro e os 28 dias fixos, D5/D9) e as renovações por canal (D11, D30). O
 * LTV por plano (AC7) aguarda a decisão dos `product_id` (sonda de 2026-10-16). A contagem por pessoa vem de `GET …/revenuecat/pagantes-por-canal`.
 *
 * ## As contas
 *
 *   CAC do canal ...... investimento do canal ÷ novos pagantes do canal (PESSOAS, D4)
 *   CAC consolidado ... (Meta + Google) ÷ TODOS os novos pagantes, inclusive
 *                       orgânico/cupom, sem atribuição e conflito (D5)
 *
 * O investimento é o mesmo dos cards (Meta com o imposto de 12,15%, Google sem
 * imposto, na régua de SP — D17). Tudo em centavos: o memorial divide os mesmos
 * centavos que exibe, e as parcelas do consolidado somam o total exibido.
 *
 * ## Nunca zero no lugar de "não sabemos"
 *
 * Divisão por zero (nenhum novo pagante) e investimento desconhecido (Google em
 * erro) dão "—", com o memorial dizendo por quê (AC4c, AC1c). Rota nova com a
 * API anterior (404 da rota) → os cards não aparecem e o banner de versão
 * explica (AC10b).
 */

import type { MetricFormula, MetricFormulaValue } from "@/lib/types/metric-formula";
import { inicioDaJanela } from "@loyola-x/shared/src/janela-de-dias";
import { fecharEmCentavos } from "./lyrio-margin";
import { memorialDoGoogleSemNumero } from "./lyrio-google-ads";
import { declararJanela, diaMes, type ContextoDaJanela, type DeclaracaoDaJanela } from "./janela-dos-cards-lyrio";
import { memorialDoErroDaFonte, type EstadoDaFonte } from "./estado-da-fonte-revenuecat";
import { comoEstadoDoGoogle, valorDoGoogleNaRegua, type InvestimentoDoGoogleNaRegua } from "./google-ads-na-regua";
import { fmtBRL, type CardDoResumo, type GastoDaMeta } from "./resumo-mobile-lyrio";

export type CanalDoPagante = "meta" | "google" | "organico" | "sem_atribuicao";

/** Uma contagem por canal da rota (`ContagemPorCanal` em `utils/pagantes-lyrio.ts`). */
export interface ContagemPorCanal {
  canais: { canal: CanalDoPagante; rotulo: string; quantidade: number }[];
  /** Empate exato Meta × Google (PO-D3). */
  conflito: number;
  total: number;
}

/** Espelha `GET …/revenuecat/pagantes-por-canal` (`routes/revenuecat.ts`). Só contagens. */
export interface PagantesPorCanal {
  days: number;
  /** Primeiro dia da janela (`AAAA-MM-DD`, SP). */
  desde: string;
  /** Primeiro evento de assinatura da etapa (dia de SP): a cobertura da série (achado G). */
  assinaturaDesde: string | null;
  atributosDesde: string | null;
  novosPagantes: ContagemPorCanal;
  renovacoes: ContagemPorCanal;
}

export interface EntradaDeAquisicao {
  ctx: ContextoDaJanela;
  /** A rota com `days` = o filtro, e com `days = 28` (os CACs fixos). */
  pagantesFiltro: EstadoDaFonte<PagantesPorCanal>;
  pagantes28: EstadoDaFonte<PagantesPorCanal>;
  meta: { temCampanhas: boolean; filtro: GastoDaMeta | undefined; vinteOito: GastoDaMeta | undefined };
  google: { mostrar: boolean; filtro: InvestimentoDoGoogleNaRegua; vinteOito: InvestimentoDoGoogleNaRegua };
}

export interface CardsDeAquisicao {
  cac: CardDoResumo[];
  /** AC7 em espera: vazio até a decisão dos `product_id` de cada plano. */
  ltv: CardDoResumo[];
  renovacoes: CardDoResumo[];
}

const FONTE_DOS_PAGANTES = "eventos do webhook do RevenueCat · GET …/revenuecat/pagantes-por-canal";
const NOTA_DE_COBERTURA_DO_NOVO =
  "Novo pagante = pessoa cujo PRIMEIRO pagamento (evento pago de toda a série, pela data do pagamento) caiu na janela; quem veio do trial conta na primeira cobrança. Quem já pagava antes de a série começar e renovou na janela pode aparecer como novo — a série não enxerga o pagamento anterior.";

/** CAC em centavos: `round(investimento ÷ pessoas)`; `null` sem pessoas ou sem investimento conhecido. */
export function cacEmCentavos(investimentoCentavos: number | null, pessoas: number): number | null {
  if (investimentoCentavos == null || pessoas <= 0) return null;
  return Math.round(investimentoCentavos / pessoas);
}

const centavos = (v: number) => Math.round(v * 100);
const pessoas = (n: number) => `${n.toLocaleString("pt-BR")} ${n === 1 ? "pessoa" : "pessoas"}`;

/** A resposta só vale para a janela que ela ECOA (AC10b): eco diferente do pedido = API que não aplicou. */
function daJanela(estado: EstadoDaFonte<PagantesPorCanal>, dias: number): EstadoDaFonte<PagantesPorCanal> {
  if (estado.tipo === "pronto" && estado.dados.days !== dias) return { tipo: "oculto" };
  return estado;
}

/**
 * Os cards de CAC, LTV e renovação. Rota da API anterior (404 da rota) → nenhum
 * card; erro → cada card "—" com a causa (PO-D4).
 */
export function cardsDeAquisicao(e: EntradaDeAquisicao): CardsDeAquisicao {
  const { ctx } = e;
  const filtro = daJanela(e.pagantesFiltro, ctx.diasDoFiltro);
  const vinteOito = daJanela(e.pagantes28, 28);
  if (filtro.tipo === "oculto" && vinteOito.tipo === "oculto") return { cac: [], ltv: [], renovacoes: [] };

  const serieDesde =
    (filtro.tipo === "pronto" ? filtro.dados.assinaturaDesde : null) ?? (vinteOito.tipo === "pronto" ? vinteOito.dados.assinaturaDesde : null);
  const declFiltro = declararJanela({ tipo: "filtro" }, { ...ctx, serieDesde });
  const decl28 = declararJanela({ tipo: "fixa", dias: 28, origem: "regua" }, ctx);
  const coberturaDe = (dias: number) =>
    serieDesde && inicioDaJanela(dias, ctx.hoje) < serieDesde
      ? ` A série de assinaturas só existe desde ${diaMes(serieDesde)}: antes disso não há pagante a contar, então a janela efetiva começa ali.`
      : "";

  // ── CAC (AC4, AC5) — nas duas janelas ──
  const cacs = (
    estado: EstadoDaFonte<PagantesPorCanal>,
    dias: number,
    decl: DeclaracaoDaJanela,
    sufixo: string,
    meta: GastoDaMeta | undefined,
    googleEstado: InvestimentoDoGoogleNaRegua,
  ): CardDoResumo[] => {
    if (estado.tipo === "oculto") return [];
    const card = (id: string, rotulo: string): CardDoResumo => ({ id: `${id}-${sufixo}`, rotulo, valor: "—", declaracao: decl, icone: "cac" });
    const ids: [string, string][] = [];
    if (e.meta.temCampanhas) ids.push(["cac-meta", "CAC Meta"]);
    if (e.google.mostrar) ids.push(["cac-google", "CAC Google"]);
    ids.push(["cac-consolidado", "CAC consolidado"]);
    const rot = (r: string) => (sufixo === "28d" ? `${r} · 28d fixo` : r);

    const erro = memorialDoErroDaFonte(estado, { fonte: FONTE_DOS_PAGANTES, periodo: decl.periodo });
    if (erro) return ids.map(([id, r]) => ({ ...card(id, rot(r)), formula: erro }));
    if (estado.tipo !== "pronto") return ids.map(([id, r]) => card(id, rot(r)));
    const d = estado.dados;
    const deCanal = (c: CanalDoPagante) => d.novosPagantes.canais.find((x) => x.canal === c)?.quantidade ?? 0;
    const conflito = d.novosPagantes.conflito;
    const notaDeConflito = `${pessoas(conflito)} com sinal da Meta e do Google no mesmo instante ${conflito === 1 ? "ficou" : "ficaram"} em "conflito": fora do CAC da Meta e do Google, dentro do consolidado. Quem tem os dois sinais em instantes diferentes vai para o canal que apareceu primeiro.`;
    const nota = `${NOTA_DE_COBERTURA_DO_NOVO}${coberturaDe(dias)}`;

    // Sem campanha da Meta vinculada, não há investimento da Meta (0), como no card Investimento.
    const metaCentavos = !e.meta.temCampanhas ? 0 : meta ? centavos(meta.spendComImposto) : null;
    const googleValor = valorDoGoogleNaRegua(googleEstado);
    const googleCentavos = googleValor == null ? null : centavos(googleValor);
    const semGoogle = memorialDoGoogleSemNumero(comoEstadoDoGoogle(googleEstado), decl.periodo);

    const cacDe = (
      id: string,
      rotulo: string,
      investimentoCentavos: number | null,
      investimentoValores: MetricFormulaValue[],
      n: number,
      oQue: string,
      notaExtra: string,
    ): CardDoResumo => {
      const base = card(id, rot(rotulo));
      if (investimentoCentavos == null) return base; // carregando
      const cac = cacEmCentavos(investimentoCentavos, n);
      const formula: MetricFormula = {
        expression: `Investimento ÷ novos pagantes (${oQue})`,
        values: [...investimentoValores, { label: `Novos pagantes (${oQue})`, value: pessoas(n), source: FONTE_DOS_PAGANTES }],
        result: cac == null ? `${fmtBRL(investimentoCentavos / 100)} ÷ 0 = — (sem novo pagante na janela)` : `${fmtBRL(investimentoCentavos / 100)} ÷ ${n.toLocaleString("pt-BR")} = ${fmtBRL(cac / 100)}`,
        period: decl.periodo,
        note: `${notaExtra} ${nota}`.trim(),
      };
      return { ...base, valor: cac == null ? "—" : fmtBRL(cac / 100), formula };
    };

    const out: CardDoResumo[] = [];
    if (e.meta.temCampanhas) {
      out.push(
        cacDe("cac-meta", "CAC Meta", metaCentavos,
          metaCentavos == null ? [] : [{ label: "Investimento (Meta, com 12,15%)", value: fmtBRL(metaCentavos / 100), source: "Meta Ads API — o mesmo valor do card Investimento (Meta)" }],
          deCanal("meta"), "Meta", notaDeConflito),
      );
    }
    if (e.google.mostrar) {
      out.push(
        semGoogle
          ? { ...card("cac-google", rot("CAC Google")), formula: semGoogle }
          : cacDe("cac-google", "CAC Google", googleCentavos,
              googleCentavos == null ? [] : [{ label: "Investimento (Google)", value: fmtBRL(googleCentavos / 100), source: "Google Ads API, na régua de SP — o mesmo valor do card Investimento (Google)" }],
              deCanal("google"), "Google", notaDeConflito),
      );
    }
    // Consolidado: a soma dos dois; sem um deles conhecido, o total não é conhecido.
    const consolidadoCentavos = metaCentavos != null && googleCentavos != null ? metaCentavos + googleCentavos : null;
    if (semGoogle) {
      out.push({ ...card("cac-consolidado", rot("CAC consolidado")), formula: semGoogle });
    } else {
      const [m, g] = consolidadoCentavos == null ? [0, 0] : fecharEmCentavos(consolidadoCentavos / 100, [(metaCentavos ?? 0) / 100, (googleCentavos ?? 0) / 100]);
      out.push(
        cacDe("cac-consolidado", "CAC consolidado", consolidadoCentavos,
          [
            { label: "Investimento (Meta, com 12,15%)", value: fmtBRL(m), source: "Meta Ads API" },
            { label: "Investimento (Google)", value: fmtBRL(g), source: "Google Ads API, na régua de SP" },
          ],
          d.novosPagantes.total, "todos os canais",
          "Inclui orgânico/cupom, sem atribuição e conflito no denominador — por isso o consolidado não é a média dos CACs por canal."),
      );
    }
    return out;
  };

  const cac = [
    ...cacs(filtro, ctx.diasDoFiltro, declFiltro, "filtro", e.meta.filtro, e.google.filtro),
    ...cacs(vinteOito, 28, decl28, "28d", e.meta.vinteOito, e.google.vinteOito),
  ];

  // ── renovações (AC8): só a janela do filtro ──
  // AC7 (LTV por plano) ON HOLD: a sonda de produção (2026-10-16) mostrou que os
  // `product_id` reais são famílias com sufixo (`premium_yearly_150:base`, …) e
  // que existe produto mensal; quais ids entram em cada LTV está com o Danilo.
  // Mostrar "—" com os ids literais da D28 afirmaria que ninguém pagou o plano.
  // TODO(42.14, AC7): com a lista dos planos, ligar o LTV (a rota tem a consulta pronta em `utils/pagantes-lyrio.ts`).
  const ltv: CardDoResumo[] = [];
  if (filtro.tipo === "oculto") return { cac, ltv, renovacoes: [] };
  const erro = memorialDoErroDaFonte(filtro, { fonte: FONTE_DOS_PAGANTES, periodo: declFiltro.periodo });
  const d = filtro.tipo === "pronto" ? filtro.dados : null;

  const renovacoes: CardDoResumo[] = [];
  const linhas: { id: string; rotulo: string; n: number | null }[] = d
    ? [
        ...d.renovacoes.canais.map((c) => ({ id: c.canal, rotulo: c.rotulo, n: c.quantidade })),
        ...(d.renovacoes.conflito > 0 ? [{ id: "conflito", rotulo: "Conflito Meta × Google", n: d.renovacoes.conflito }] : []),
      ]
    : [
        { id: "meta", rotulo: "Meta", n: null },
        { id: "google", rotulo: "Google", n: null },
        { id: "organico", rotulo: "Orgânico ou cupom", n: null },
        { id: "sem_atribuicao", rotulo: "Sem atribuição", n: null },
      ];
  for (const l of linhas) {
    const base: CardDoResumo = { id: `renovacoes-${l.id}`, rotulo: `Renovações · ${l.rotulo}`, valor: "—", declaracao: declFiltro, icone: "renovacao" };
    if (erro) {
      renovacoes.push({ ...base, formula: erro });
      continue;
    }
    if (l.n == null || !d) {
      renovacoes.push(base);
      continue;
    }
    renovacoes.push({
      ...base,
      valor: l.n.toLocaleString("pt-BR"),
      formula: {
        expression: "Contagem de RENEWAL pagos que não são o primeiro pagamento da pessoa",
        values: [
          { label: `Renovações (${l.rotulo})`, value: l.n.toLocaleString("pt-BR"), source: FONTE_DOS_PAGANTES },
          { label: "Total de renovações na janela", value: d.renovacoes.total.toLocaleString("pt-BR"), source: FONTE_DOS_PAGANTES },
        ],
        result: l.n.toLocaleString("pt-BR"),
        period: declFiltro.periodo,
        note: `Conta EVENTOS: quem renovou duas vezes conta 2. A primeira cobrança depois do trial não entra (já é novo pagante); a reassinatura de quem já tinha pagado entra. Canal da regra da 42.12 pela pessoa; quem tem Meta e Google vai para o que apareceu primeiro, e o empate no mesmo instante fica em "Conflito". Quem já pagava antes de a série começar tem o primeiro RENEWAL da série contado como novo pagante, não como renovação.${coberturaDe(ctx.diasDoFiltro)}`,
      },
    });
  }

  return { cac, ltv, renovacoes };
}
