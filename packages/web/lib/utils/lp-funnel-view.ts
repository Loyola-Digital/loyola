/**
 * O que o card do mini-funil precisa, a partir da resposta crua do `lp-funnel`.
 *
 * Vivia no hook `useLpFunnelView` (`lib/hooks/use-sales-journey.ts`), que o
 * vitest do web não coleta (PO-11). Veio para cá para o teste provar a regra
 * que o hook usa — o hook só chama esta função.
 *
 * Story 18.83 (AC9):
 *  - a fonte nova de atribuição (`anuncio`, `utm_content → ad_id → URL`) entra
 *    em `atribuidos`. Sem ela, o `pctHeranca` do card seria calculado sobre uma
 *    base que ignora a principal fonte do mini-funil: com `term` e `campanha`
 *    zerados pela cadeia nova, daria 100 % sempre que houvesse herança (três
 *    camadas travam um valor novo);
 *  - o card casa com a linha pela URL (`chaveDoCardDaLp`), não mais por
 *    `lp.toUpperCase()` — que misturaria `/Inscricao` com `/inscricao`.
 */

import { chaveDoCardDaLp } from "@/lib/utils/lps-do-lancamento";

export interface LinhaDoLpFunnel {
  lp: string;
  variantes: string[];
  leads: number;
  aplicacoes: number;
  pesquisas: number;
  compras: number;
  receita: number;
}

export interface RespostaDoLpFunnel {
  semDados: boolean;
  lps: LinhaDoLpFunnel[];
  semLp: { leads: number; aplicacoes: number; pesquisas: number; compras: number };
  /** `anuncio` é opcional: a API anterior à 18.83 não manda. */
  cobertura: { term: number; campanha: number; anuncio?: number; heranca: number; semLp: number };
  fontes: {
    label: string;
    tipo: "pesquisa" | "aplicacao" | "captacao";
    linhas: number;
    comLp: number;
    erro: boolean;
    semColunaTerm: boolean;
    dataIlegivel: number;
  }[];
}

export interface VisaoDoLpFunnel<L extends LinhaDoLpFunnel = LinhaDoLpFunnel> {
  byLp: Record<string, L>;
  /** Conversão lead → compra somando TODAS as LPs — a régua de cada card. */
  refConversao: number | null;
  /** % das atribuições que vieram por herança do lead de captação. */
  pctHeranca: number | null;
  /** Que tipos de planilha a etapa tem. Etapa sem fonte sai da cadeia do card. */
  temFonte: { aplicacao: boolean; pesquisa: boolean };
  /** Rótulos das planilhas por etapa, para o tooltip dizer de ONDE veio o número. */
  fontesPorEtapa: { captacao: string[]; aplicacao: string[]; pesquisa: string[] };
  /** Linhas descartadas por data ilegível — some do card sem isso. */
  dataIlegivel: number;
}

export function montarVisaoDoLpFunnel<L extends LinhaDoLpFunnel>(
  data: (Omit<RespostaDoLpFunnel, "lps"> & { lps: L[] }) | undefined,
): VisaoDoLpFunnel<L> {
  const byLp: Record<string, L> = {};
  let leads = 0;
  let compras = 0;
  for (const l of data?.lps ?? []) {
    byLp[chaveDoCardDaLp(l.lp)] = l;
    leads += l.leads;
    compras += l.compras;
  }

  const c = data?.cobertura;
  // As QUATRO fontes que atribuem. `anuncio` ausente (API antiga) soma 0.
  const atribuidos = c ? c.term + c.campanha + (c.anuncio ?? 0) + c.heranca : 0;

  // Antes de carregar (`data` undefined) nada é afirmável: dizer "sem fonte"
  // aqui removeria etapas da cadeia e elas voltariam ao chegar a resposta.
  const labels = (tipo: "captacao" | "aplicacao" | "pesquisa"): string[] =>
    (data?.fontes ?? []).filter((f) => f.tipo === tipo && !f.erro).map((f) => f.label);

  return {
    byLp,
    refConversao: leads > 0 ? (compras / leads) * 100 : null,
    pctHeranca: atribuidos > 0 ? (c!.heranca / atribuidos) * 100 : null,
    temFonte: {
      aplicacao: !data || labels("aplicacao").length > 0,
      pesquisa: !data || labels("pesquisa").length > 0,
    },
    fontesPorEtapa: {
      captacao: labels("captacao"),
      aplicacao: labels("aplicacao"),
      pesquisa: labels("pesquisa"),
    },
    dataIlegivel: (data?.fontes ?? []).reduce((s, f) => s + (f.dataIlegivel ?? 0), 0),
  };
}
