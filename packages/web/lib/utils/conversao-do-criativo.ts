/**
 * Story 18.75 — o que é "conversão" no card do Top Criativos.
 *
 * O mesmo componente (`top-creatives-gallery.tsx`) é renderizado por três telas,
 * e em cada uma a pergunta "quantas conversões este criativo trouxe?" tem uma
 * resposta diferente:
 *
 * | Tela                          | Conversão | Custo | Fonte                        |
 * |-------------------------------|-----------|-------|------------------------------|
 * | Perpétuo                      | Vendas    | CAC   | planilha de vendas realizadas |
 * | Captação Paga / event_capture | Ingressos | CPI   | planilha de captação paga     |
 * | Captação gratuita e demais    | Leads     | CPL   | planilha de leads (popup)     |
 *
 * Um rótulo genérico ("Conversões") sobre três coisas diferentes é o que faz
 * duas telas do mesmo produto parecerem discordar — por isso o rótulo muda
 * junto com a fonte, e não só o número.
 *
 * A decisão vive aqui, e não espalhada em `stageType === "paid"` pelo
 * componente: foi exatamente essa comparação literal repetida em 28 pontos que
 * deixou a única etapa `event_capture` de produção sem faturamento na 19.14.
 */

import { ehCaptacaoPaga } from "@loyola-x/shared/src/stage-types";

export type UnidadeDeConversao = "vendas" | "ingressos" | "leads";

export interface ConversaoDoCriativo {
  unidade: UnidadeDeConversao;
  /** Rótulo da célula de contagem. */
  rotulo: string;
  /** Rótulo da célula de custo. */
  rotuloCusto: string;
  /** Nome completo do custo, para o tooltip. */
  nomeCusto: string;
  /** De onde o número sai — entra no tooltip e na mensagem de ausência. */
  fonte: string;
}

/**
 * `funnelType` vem de `funnelContext` (o Perpétuo se identifica por ele) e
 * `stageType` vem da etapa (as duas telas de lançamento já o têm em mãos).
 * Sem `stageType`, o default é `leads` — o comportamento que a galeria tinha
 * antes desta story.
 */
export function conversaoDoCriativo(
  funnelType: string | null | undefined,
  stageType: string | null | undefined,
): ConversaoDoCriativo {
  if (funnelType === "perpetual") {
    return {
      unidade: "vendas",
      rotulo: "Vendas",
      rotuloCusto: "CAC",
      nomeCusto: "Custo por Aquisição",
      fonte: "planilha de vendas realizadas",
    };
  }
  if (ehCaptacaoPaga(stageType)) {
    return {
      unidade: "ingressos",
      rotulo: "Ingressos",
      rotuloCusto: "CPI",
      nomeCusto: "Custo por Ingresso",
      fonte: "planilha de captação paga",
    };
  }
  return {
    unidade: "leads",
    rotulo: "Leads",
    rotuloCusto: "CPL",
    nomeCusto: "Custo por Lead",
    fonte: "planilha de leads",
  };
}

/**
 * Custo por conversão. `null` quando não há denominador — nunca `0` nem
 * `Infinity`, que na tela viram "de graça" e "quebrado".
 */
export function custoPorConversao(
  spend: number,
  conversoes: number | null | undefined,
): number | null {
  if (conversoes == null || conversoes <= 0) return null;
  if (!Number.isFinite(spend) || spend <= 0) return null;
  return spend / conversoes;
}

/**
 * Por que a célula está vazia — AC5.
 *
 * "Sem planilha ligada" e "nenhuma conversão no período" pedem ações
 * diferentes: uma é configuração, a outra é resultado. Uma tela que mostra `—`
 * para as duas transforma erro em ausência, e ninguém vai atrás do que faltou.
 *
 * Devolve `null` quando há número para mostrar.
 */
export function motivoSemConversao(
  conv: ConversaoDoCriativo,
  temFonte: boolean,
  conversoes: number | null | undefined,
): string | null {
  if (!temFonte) {
    return `Sem ${conv.fonte} ligada a esta etapa — não há como atribuir ${conv.rotulo.toLowerCase()} ao criativo.`;
  }
  if (conversoes == null) {
    return `A ${conv.fonte} está ligada, mas não devolveu ${conv.rotulo.toLowerCase()} para este criativo no período.`;
  }
  if (conversoes <= 0) {
    return `Nenhum registro de ${conv.rotulo.toLowerCase()} atribuído a este criativo no período.`;
  }
  return null;
}

/**
 * Vendas e faturamento de um criativo agregado, deduplicando o comprador entre
 * os `ad_id` do grupo.
 *
 * Um nome de criativo cobre N anúncios (`ids`), e a mesma pessoa pode ter
 * clicado em dois deles. Somar as entradas direto contaria a venda duas vezes —
 * é a mesma dedup que o bloco "💵 Faturado" do card já fazia inline desde a
 * 21.7, agora extraída para ser testável.
 */
export function vendasDeduzidas(
  ids: string[],
  byAdId: Record<string, { faturamentoBruto: number; emails: string[] }> | undefined,
): { vendas: number; bruto: number } {
  if (!byAdId) return { vendas: 0, bruto: 0 };
  const vistos = new Set<string>();
  let bruto = 0;
  let vendas = 0;
  for (const id of ids) {
    const entry = byAdId[id];
    if (!entry || entry.emails.length === 0) continue;
    for (const email of entry.emails) {
      if (vistos.has(email)) continue;
      vistos.add(email);
      // Share proporcional: o bruto do anúncio foi somado por e-mail, então
      // divide pela contagem para pegar a fatia daquele comprador.
      bruto += entry.faturamentoBruto / entry.emails.length;
      vendas += 1;
    }
  }
  return { vendas, bruto };
}

/**
 * Ingressos únicos de um criativo agregado: soma dos `ad_id` do grupo.
 *
 * Aqui **não** há dedup entre anúncios — a rota de desempenho de criativos já
 * devolve o único por anúncio, e é o mesmo número que a tabela de Desempenho de
 * Criativos mostra. Deduplicar de novo aqui faria o card discordar da tabela na
 * mesma tela.
 *
 * `null` quando nenhum `ad_id` do grupo aparece no mapa — ausência não é zero.
 */
export function ingressosDoGrupo(
  ids: string[],
  porAdId: Map<string, number>,
): number | null {
  let total = 0;
  let achou = false;
  for (const id of ids) {
    const v = porAdId.get(id);
    if (v == null) continue;
    achou = true;
    total += v;
  }
  return achou ? total : null;
}
