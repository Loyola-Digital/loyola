import type { StageSalesData } from "@loyola-x/shared";
import { fmtCurrency, fmtInt } from "@/lib/utils/format-number";

/**
 * Story 41.12 (AC8) — a linha de transparência da camada 2 nos painéis de
 * Captação Paga e Vendas: o que "a mesma pessoa não compra duas vezes o mesmo
 * produto" tirou do período, ou por que não agiu.
 *
 * `null` = nada a dizer: campo ausente (API anterior à 41.12 — o front não
 * exige a API nova, deploys em ciclos diferentes) ou camada 2 aplicada sem
 * remover nada.
 */
export function linhaDedupPessoaProduto(d: StageSalesData["dedupPessoaProduto"]): string | null {
  if (!d) return null;
  const partes: string[] = [];
  const n = d.removidas.linhas;
  if (n > 0) {
    partes.push(
      `${fmtInt(n)} ${n === 1 ? "venda repetida" : "vendas repetidas"} (mesmo e-mail e produto) ` +
        `não ${n === 1 ? "somada" : "somadas"} (${fmtCurrency(d.removidas.valor)})`,
    );
  }
  if (d.naoAplicadaMotivo) {
    partes.push(
      d.aplicada
        ? `Recompra do mesmo produto não deduplicada em parte das planilhas: ${d.naoAplicadaMotivo}`
        : `Recompra do mesmo produto não deduplicada: ${d.naoAplicadaMotivo}`,
    );
  }
  return partes.length > 0 ? partes.join("\n") : null;
}

/**
 * Story 41.12 (UX-001 do gate) — o que os tooltips de TOTAIS ("Ingressos
 * totais", "Faturamento Total") dizem sobre dedup. Com a camada 2 aplicada, a
 * recompra do mesmo produto pela mesma pessoa conta uma vez — "sem dedup"
 * passou a ser falso. Campo ausente (API antiga) ou regra não aplicada: o texto
 * de antes, que segue verdadeiro nesses casos.
 */
export function textoDedupDosTotais(d: StageSalesData["dedupPessoaProduto"]): string {
  return d?.aplicada
    ? "recompra do mesmo produto pela mesma pessoa conta uma vez"
    : "sem deduplicar e-mail";
}
