// Story 48.4 — ponte entre o formulário da aba "Leads Pagos" e o payload da
// API (`…/planejamento/pagos`), mais as regras de tela que não são conta de
// negócio: cores das faixas de CPL (DV-012 = B: mesmo sentido dos leads),
// rótulos (DV-025: "Google Ads", não "Meta Ads") e o diagnóstico do que falta
// na aba 1. As regras compartilhadas com a 48.3 (`estadoDaTela`,
// `estadoDoAtingimento`, `larguraDaBarra`, `temReferenciaDeFaixa`,
// `valorDaGrade`, `lerSelecao`) vêm de `planejamento-organicos-form.ts`.
//
//   formulário: texto por campo — percentuais em PONTOS (4 = 4 %), CPL médio
//               em REAIS; vazio = ""; nível e seleções como `number | null`
//   API:        frações como `number | null` (0.04); CPL em reais; nível 1…10

import { FONTES_PAGAS, NIVEIS_PAGOS, type FontePaga, type Faixa } from "@loyola-x/shared/src/planejamento-cenarios";
import {
  CAMPOS_DO_BLOCO_PAGO,
  INDICES_DAS_COMBINACOES,
  type BlocoPago,
  type CampoDoBlocoPago,
  type PagosDoSimulador,
  type SelecoesPorFonte,
} from "@loyola-x/shared/src/planejamento-combinacoes";
import type { DerivadosFinanceiros, InputsFinanceiros } from "@loyola-x/shared/src/planejamento-inputs-financeiros";
import { lerNumero } from "@/lib/utils/planejamento-inputs-form";
import { classeDaFaixa, temReferenciaDeFaixa } from "@/lib/utils/planejamento-organicos-form";

export { estadoDaTela, estadoDoAtingimento, larguraDaBarra, lerSelecao, temReferenciaDeFaixa, valorDaGrade } from "@/lib/utils/planejamento-organicos-form";

/** Os sete campos de texto do bloco (o oitavo, `nivelAssumido`, é o radio). */
export const CAMPOS_DE_TEXTO_DO_BLOCO_PAGO = CAMPOS_DO_BLOCO_PAGO.filter((c): c is Exclude<CampoDoBlocoPago, "nivelAssumido"> => c !== "nivelAssumido");
export type CampoDeTextoDoBlocoPago = (typeof CAMPOS_DE_TEXTO_DO_BLOCO_PAGO)[number];

/** Percentual (pontos ↔ fração) ou moeda (reais ↔ reais). */
export const TIPO_DO_CAMPO_PAGO: Record<CampoDeTextoDoBlocoPago, "pct" | "moeda"> = {
  pctCaptacao: "pct",
  conversaoMedia: "pct",
  variacaoConversao: "pct",
  variacaoReceita: "pct",
  cplMedioHistorico: "moeda",
  faixaVariacao: "pct",
  fracaoCenario1: "pct",
};

/** DV-025: os rótulos do Google dizem "Google Ads" (a planilha dizia "Meta Ads" nas linhas do Google). */
export const ROTULO_DA_FONTE: Record<FontePaga, string> = {
  meta_quente: "Meta Ads · Público quente",
  meta_frio: "Meta Ads · Público frio",
  google_quente: "Google Ads · Público quente",
  google_frio: "Google Ads · Público frio",
};

export interface FormularioDoBlocoPago {
  campos: Record<CampoDeTextoDoBlocoPago, string>;
  nivelAssumido: number | null;
}

export interface FormularioDosPagos {
  blocos: Record<FontePaga, FormularioDoBlocoPago>;
  /** `[k][fonte]` com k = 0…4 (índice 1…5). */
  combinacoes: SelecoesPorFonte[];
}

/** Da API para o formulário (pontos percentuais / reais, texto com vírgula). */
export function paraFormularioPagos(dados: PagosDoSimulador): FormularioDosPagos {
  const blocos = {} as Record<FontePaga, FormularioDoBlocoPago>;
  for (const f of FONTES_PAGAS) {
    const b = dados.blocos[f];
    const campos = {} as Record<CampoDeTextoDoBlocoPago, string>;
    for (const k of CAMPOS_DE_TEXTO_DO_BLOCO_PAGO) {
      const v = b[k];
      if (v === null || v === undefined) campos[k] = "";
      else if (TIPO_DO_CAMPO_PAGO[k] === "pct") campos[k] = String(Number((v * 100).toFixed(6))).replace(".", ",");
      else campos[k] = String(v).replace(".", ",");
    }
    blocos[f] = { campos, nivelAssumido: b.nivelAssumido ?? null };
  }
  const combinacoes = INDICES_DAS_COMBINACOES.map((indice) => {
    const sel = dados.combinacoes.find((x) => x.indice === indice)?.selecoes;
    const s = {} as SelecoesPorFonte;
    for (const f of FONTES_PAGAS) s[f] = sel?.[f] ?? null;
    return s;
  });
  return { blocos, combinacoes };
}

/** Do formulário para o payload da API. `NaN` marca campo inválido (texto). */
export function paraPayloadPagos(f: FormularioDosPagos): PagosDoSimulador {
  const blocos = {} as Record<FontePaga, BlocoPago>;
  for (const fonte of FONTES_PAGAS) {
    const b = {} as BlocoPago;
    for (const k of CAMPOS_DE_TEXTO_DO_BLOCO_PAGO) {
      const n = lerNumero(f.blocos[fonte].campos[k]);
      if (n === null) b[k] = null;
      else if (Number.isNaN(n)) b[k] = Number.NaN;
      else b[k] = TIPO_DO_CAMPO_PAGO[k] === "pct" ? Number((n / 100).toFixed(8)) : n;
    }
    b.nivelAssumido = f.blocos[fonte].nivelAssumido;
    blocos[fonte] = b;
  }
  return {
    blocos,
    combinacoes: INDICES_DAS_COMBINACOES.map((indice, i) => ({ indice, selecoes: { ...f.combinacoes[i] } })),
  };
}

export type ErrosDosPagos = Partial<Record<FontePaga, Partial<Record<CampoDoBlocoPago, string>>>>;

/** As mesmas faixas que a API valida (zod), para o botão não mandar o que voltaria 400. */
export function validarPagos(p: PagosDoSimulador): ErrosDosPagos {
  const erros: ErrosDosPagos = {};
  const marcar = (f: FontePaga, k: CampoDoBlocoPago, msg: string) => {
    (erros[f] ??= {})[k] = msg;
  };
  for (const f of FONTES_PAGAS) {
    const b = p.blocos[f];
    for (const k of CAMPOS_DE_TEXTO_DO_BLOCO_PAGO) {
      const v = b[k];
      if (v === null) continue;
      if (Number.isNaN(v)) marcar(f, k, "Só número");
      else if (TIPO_DO_CAMPO_PAGO[k] === "pct" && (v < 0 || v > 1)) marcar(f, k, "Entre 0 % e 100 %");
      else if (TIPO_DO_CAMPO_PAGO[k] === "moeda" && v < 0) marcar(f, k, "Não pode ser negativo");
    }
    const n = b.nivelAssumido;
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > NIVEIS_PAGOS)) marcar(f, "nivelAssumido", `Nível 1…${NIVEIS_PAGOS}`);
  }
  return erros;
}

export function temErrosPagos(erros: ErrosDosPagos): boolean {
  return Object.values(erros).some((e) => e && Object.keys(e).length > 0);
}

/** `gradePaga` recebe `Entrada`; um campo inválido (`NaN`) entra como vazio — a tela mostra o erro ao lado. */
export function blocoPagoComoEntradas(b: BlocoPago): BlocoPago {
  const out = {} as BlocoPago;
  for (const k of CAMPOS_DO_BLOCO_PAGO) out[k] = Number.isNaN(b[k] as number) ? null : b[k];
  return out;
}

/** Há diferença entre o formulário e o que a API tem? (`NaN` conta como diferente.) */
export function pagosAlterados(atual: PagosDoSimulador, salvo: PagosDoSimulador): boolean {
  for (const f of FONTES_PAGAS) {
    for (const k of CAMPOS_DO_BLOCO_PAGO) if (!Object.is(atual.blocos[f][k], salvo.blocos[f][k])) return true;
  }
  for (const indice of INDICES_DAS_COMBINACOES) {
    const a = atual.combinacoes.find((x) => x.indice === indice)?.selecoes;
    const s = salvo.combinacoes.find((x) => x.indice === indice)?.selecoes;
    for (const f of FONTES_PAGAS) if (!Object.is(a?.[f] ?? null, s?.[f] ?? null)) return true;
  }
  return false;
}

// ------------------------------------------------------------------
// DV-012 = B — faixas de CPL no MESMO sentido dos leads (1 azul … 4 vermelho)
// ------------------------------------------------------------------

/**
 * Classe da célula de CPL: a cor da faixa só quando há referência (CPL médio
 * histórico > 0 — UX-001 da 48.3 vale aqui). O sentido é o dos leads: faixa 1
 * (CPL abaixo do limite inferior) azul … faixa 4 (acima do superior) vermelho.
 * A planilha invertia (CPL baixo vermelho, alto azul) — não reproduz.
 */
export function classeDaCelulaDeCpl(faixa: Faixa | null, cplMedioHistorico: number | null): string {
  return temReferenciaDeFaixa(cplMedioHistorico ?? 0) ? classeDaFaixa(faixa) : "";
}

// ------------------------------------------------------------------
// AC14 — o que falta na aba 1 para a aba 3 ter base
// ------------------------------------------------------------------

export function diagnosticoDaAba1Pagos(entradas: InputsFinanceiros, derivados: DerivadosFinanceiros): string[] {
  const faltas: string[] = [];
  const vazio = (v: number | null | undefined) => v === null || v === undefined || !Number.isFinite(v) || v === 0;
  if (vazio(entradas.metaMargemTotal)) faltas.push("Meta de Margem de Contribuição Total");
  if (vazio(entradas.pctMargemPagos)) faltas.push("Representatividade da margem — leads pagos (0 % deixa os pagos sem meta)");
  if (vazio(entradas.ticketMedio)) faltas.push("Ticket Médio (sem ele, vendas e leads não têm base)");
  if (vazio(entradas.mcAlvoPagos) || derivados.receitaMetaQuente === null) faltas.push("Meta de MC dos leads pagos (sem ela, a receita necessária não tem base)");
  if (vazio(entradas.investimentoAnuncios)) faltas.push("Investimento em Anúncios (sem ele, não há verba nem CPL máximo)");
  return faltas;
}
