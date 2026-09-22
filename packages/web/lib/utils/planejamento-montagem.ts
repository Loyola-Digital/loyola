// Story 48.5 (AC12) — a MONTAGEM "entradas da aba 1 + blocos → grades →
// combinações" das abas 2 e 3, extraída dos componentes da 48.3 e da 48.4
// para funções puras: os três consumidores (Leads Orgânicos, Leads Pagos e
// Resumo Final) chamam a mesma função e a aba 4 nunca diverge das abas 2/3.
//
// Zero regra aqui: é só a sequência de chamadas do shared (E4) —
//   derivarInputsFinanceiros → origem por canal/fonte → gradeOrganica/gradePaga
//   → combinacaoOrganica/combinacaoPaga por índice 1…5.
// Um campo inválido no payload (`NaN`, digitado como texto) entra como vazio
// (`blocoComoEntradas`), exatamente como os componentes já faziam.

import {
  CANAIS_ORGANICOS,
  FONTES_PAGAS,
  gradeOrganica,
  gradePaga,
  type CanalOrganico,
  type FontePaga,
  type GradeOrganica,
  type GradePaga,
} from "@loyola-x/shared/src/planejamento-cenarios";
import { derivarInputsFinanceiros, type DerivadosFinanceiros, type InputsFinanceiros } from "@loyola-x/shared/src/planejamento-inputs-financeiros";
import {
  INDICES_DAS_COMBINACOES,
  combinacaoOrganica,
  combinacaoPaga,
  origemDaFonteNaAba1,
  origemDoCanalNaAba1,
  parametrosDoBloco,
  parametrosDoBlocoPago,
  type CombinacaoOrganica,
  type CombinacaoPaga,
  type OrganicosDoSimulador,
  type OrigemDaFonteNaAba1,
  type OrigemDoCanalNaAba1,
  type PagosDoSimulador,
} from "@loyola-x/shared/src/planejamento-combinacoes";
import { blocoComoEntradas } from "@/lib/utils/planejamento-organicos-form";
import { blocoPagoComoEntradas } from "@/lib/utils/planejamento-pagos-form";

export interface MontagemOrganica {
  derivados: DerivadosFinanceiros;
  origens: Record<CanalOrganico, OrigemDoCanalNaAba1>;
  grades: Record<CanalOrganico, GradeOrganica>;
  niveis: Record<CanalOrganico, number | null>;
  /** Índices 1…5, na ordem. */
  combinacoes: CombinacaoOrganica[];
}

export interface MontagemPaga {
  derivados: DerivadosFinanceiros;
  origens: Record<FontePaga, OrigemDaFonteNaAba1>;
  grades: Record<FontePaga, GradePaga>;
  niveis: Record<FontePaga, number | null>;
  verbas: Record<FontePaga, number>;
  combinacoes: CombinacaoPaga[];
}

/** Aba 2: grades por canal e as cinco combinações. */
export function montarOrganicos(entradas: InputsFinanceiros, payload: OrganicosDoSimulador): MontagemOrganica {
  const derivados = derivarInputsFinanceiros(entradas);
  const origens = {} as Record<CanalOrganico, OrigemDoCanalNaAba1>;
  const grades = {} as Record<CanalOrganico, GradeOrganica>;
  const niveis = {} as Record<CanalOrganico, number | null>;
  for (const c of CANAIS_ORGANICOS) {
    const bloco = blocoComoEntradas(payload.blocos[c]);
    origens[c] = origemDoCanalNaAba1(entradas, derivados, c);
    grades[c] = gradeOrganica(parametrosDoBloco(bloco, origens[c]));
    niveis[c] = bloco.nivelAssumido;
  }
  const combinacoes = INDICES_DAS_COMBINACOES.map((indice) =>
    combinacaoOrganica({
      indice,
      grades,
      selecoes: payload.combinacoes.find((x) => x.indice === indice)?.selecoes ?? selecoesVazias(),
      niveis,
      percentuais: entradas,
      metaMargemOrganicos: derivados.metaMargemOrganicos,
    }),
  );
  return { derivados, origens, grades, niveis, combinacoes };
}

/** Aba 3: grades por fonte e as cinco combinações (tráfego = verbas da aba 1). */
export function montarPagos(entradas: InputsFinanceiros, payload: PagosDoSimulador): MontagemPaga {
  const derivados = derivarInputsFinanceiros(entradas);
  const origens = {} as Record<FontePaga, OrigemDaFonteNaAba1>;
  const grades = {} as Record<FontePaga, GradePaga>;
  const niveis = {} as Record<FontePaga, number | null>;
  const verbas = {} as Record<FontePaga, number>;
  for (const f of FONTES_PAGAS) {
    const bloco = blocoPagoComoEntradas(payload.blocos[f]);
    origens[f] = origemDaFonteNaAba1(entradas, derivados, f);
    grades[f] = gradePaga(parametrosDoBlocoPago(bloco, origens[f]));
    niveis[f] = bloco.nivelAssumido;
    verbas[f] = origens[f].verba;
  }
  const combinacoes = INDICES_DAS_COMBINACOES.map((indice) =>
    combinacaoPaga({
      indice,
      grades,
      selecoes: payload.combinacoes.find((x) => x.indice === indice)?.selecoes ?? selecoesPagasVazias(),
      niveis,
      percentuais: entradas,
      verbas,
      metaMargemPagos: derivados.metaMargemPagos,
    }),
  );
  return { derivados, origens, grades, niveis, verbas, combinacoes };
}

function selecoesVazias(): Record<CanalOrganico, null> {
  const s = {} as Record<CanalOrganico, null>;
  for (const c of CANAIS_ORGANICOS) s[c] = null;
  return s;
}

function selecoesPagasVazias(): Record<FontePaga, null> {
  const s = {} as Record<FontePaga, null>;
  for (const f of FONTES_PAGAS) s[f] = null;
  return s;
}
