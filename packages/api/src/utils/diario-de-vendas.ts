// Story 18.95 — o diário da etapa de Vendas ("Dados diários" acima de "Vendas
// por dia — produto principal").
//
// É alimentado DENTRO do laço que monta o card do topo (`stage-sales-data.ts`):
// cada venda que soma em `totalVendas`/`faturamentoBruto` soma aqui, no dia
// dela ou no balde `semData`. Por isso Σ dias + semData fecha com o card por
// construção — o `faturamentoTotalByDay` não serve de base porque sai de outro
// laço (linha a linha, sem juntar por comprador) e ignora a venda sem data.
//
// A chave do dia é a MESMA do `ingressosByDay` (componentes locais da `Date`):
// a Dados diários da Captação Paga e esta não podem discordar sobre o dia.

import type { DiaDeVendas, DiarioDeVendas } from "@loyola-x/shared";

export type FonteDaVenda = "Pago" | "Orgânico" | "Sem Track" | "Manual";

export function diaDeVendasVazio(): DiaDeVendas {
  return { pago: 0, org: 0, semTrack: 0, manual: 0, faturamento: 0, faturamentoPago: 0 };
}

export function diarioDeVendasVazio(): DiarioDeVendas {
  return { dias: {}, semData: diaDeVendasVazio() };
}

export function chaveDoDia(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function criarDiarioDeVendas() {
  const diario = diarioDeVendasVazio();
  return {
    /**
     * `conta = false` quando o dinheiro entra mas a pessoa não vira outra
     * venda (manual de quem já comprou pela planilha) — a mesma regra do card.
     */
    somar(date: Date | null, fonte: FonteDaVenda, bruto: number, conta = true): void {
      const dia = date ? (diario.dias[chaveDoDia(date)] ??= diaDeVendasVazio()) : diario.semData;
      if (conta) {
        if (fonte === "Pago") dia.pago += 1;
        else if (fonte === "Orgânico") dia.org += 1;
        else if (fonte === "Sem Track") dia.semTrack += 1;
        else dia.manual += 1;
      }
      dia.faturamento += bruto;
      if (fonte === "Pago") dia.faturamentoPago += bruto;
    },
    resultado(): DiarioDeVendas {
      return diario;
    },
  };
}
