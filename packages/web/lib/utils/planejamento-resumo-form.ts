// Story 48.5 — a parte de tela do Resumo Final que não é conta de negócio:
// o formulário dos rótulos (DV-017 = A) ↔ payload da API, e o diagnóstico
// dos estados "sem base" das três origens (AC13). As regras comuns
// (`estadoDaTela`, `estadoDoAtingimento`, `larguraDaBarra`) vêm da 48.3.

import {
  INDICES_DAS_COMBINACOES,
  ROTULOS_DO_CENARIO,
  ehRotuloDoCenario,
  type RotuloDoCenario,
  type RotulosDoSimulador,
} from "@loyola-x/shared/src/planejamento-combinacoes";

export { estadoDaTela, estadoDoAtingimento, larguraDaBarra } from "@/lib/utils/planejamento-organicos-form";

/** `[k]` com k = 0…4 (índice 1…5). */
export type FormularioDosRotulos = (RotuloDoCenario | null)[];

export function paraFormularioRotulos(dados: RotulosDoSimulador): FormularioDosRotulos {
  return INDICES_DAS_COMBINACOES.map((indice) => {
    const r = dados.cenarios.find((c) => c.indice === indice)?.rotulo ?? null;
    return ehRotuloDoCenario(r) ? r : null;
  });
}

export function paraPayloadRotulos(f: FormularioDosRotulos): RotulosDoSimulador {
  return { cenarios: INDICES_DAS_COMBINACOES.map((indice, i) => ({ indice, rotulo: f[i] ?? null })) };
}

/** Valor do `<select>` → rótulo; "" = vazio; fora da lista → `null` (seletor fechado; cinto). */
export function lerRotulo(valor: string): RotuloDoCenario | null {
  return ehRotuloDoCenario(valor) ? valor : null;
}

export function rotulosAlterados(atual: RotulosDoSimulador, salvo: RotulosDoSimulador): boolean {
  for (const indice of INDICES_DAS_COMBINACOES) {
    const a = atual.cenarios.find((c) => c.indice === indice)?.rotulo ?? null;
    const s = salvo.cenarios.find((c) => c.indice === indice)?.rotulo ?? null;
    if (a !== s) return true;
  }
  return false;
}

export const OPCOES_DE_ROTULO: readonly RotuloDoCenario[] = ROTULOS_DO_CENARIO;

// ------------------------------------------------------------------
// AC13 — estados sem base das três origens
// ------------------------------------------------------------------

export type Origem = "inputs" | "organicos" | "pagos";

export interface OrigemPendente {
  origem: Origem;
  /** Aba de destino do link (contrato de URL da página). */
  aba: "inputs" | "organicos" | "pagos";
  titulo: string;
  texto: string;
}

/**
 * Quais origens nunca foram salvas (`updatedAt === null` no GET — PO-03 das
 * anteriores). Inputs vazios tornam as outras duas irrelevantes: só o aviso
 * dos inputs aparece. Orgânicos e pagos vazios aparecem cada um com o seu.
 */
export function origensPendentes(estado: { inputsSalvos: boolean; organicosSalvos: boolean; pagosSalvos: boolean }): OrigemPendente[] {
  if (!estado.inputsSalvos) {
    return [
      {
        origem: "inputs",
        aba: "inputs",
        titulo: "Preencha os Inputs Financeiros",
        texto: "A meta total, os percentuais, as receitas necessárias e as verbas vêm de lá. Sem eles o Resumo Final fica zerado e os rótulos não podem ser salvos.",
      },
    ];
  }
  const out: OrigemPendente[] = [];
  if (!estado.organicosSalvos) {
    out.push({
      origem: "organicos",
      aba: "organicos",
      titulo: "Preencha a aba Leads Orgânicos",
      texto: "As linhas de orgânicos (receita, margem, vendas, leads) ficam “—” até a aba 2 ser salva com os níveis e os cenários escolhidos.",
    });
  }
  if (!estado.pagosSalvos) {
    out.push({
      origem: "pagos",
      aba: "pagos",
      titulo: "Preencha a aba Leads Pagos",
      texto: "As linhas de pagos (receita, tráfego, margem, CPL, leads) ficam “—” até a aba 3 ser salva com os níveis e os cenários escolhidos.",
    });
  }
  return out;
}

/** Um valor de origem nunca salva vira `null` ("—") na tela, mesmo que a conta dê zero. */
export function valorDaOrigem(valor: number | null, origemSalva: boolean): number | null {
  return origemSalva ? valor : null;
}
