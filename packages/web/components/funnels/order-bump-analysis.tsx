"use client";

/**
 * Stories 18.66 e 18.67 — order bump: representatividade, conversão e AOV.
 *
 * Duas peças que compartilham a mesma fonte (`salesData.orderBump` e
 * `salesData.publicos`, calculados no backend por `utils/order-bump.ts`):
 *
 *   • `OrderBumpCard`  — quanto do faturamento veio da caixinha do checkout
 *   • `PublicosTable`  — onde ela funciona, e quanto vale um comprador de cada
 *                        origem
 *
 * ## O que estas peças NÃO fazem
 *
 * Nenhum cálculo. A regra é do backend, e há uma razão: a separação entre bump
 * ACESSÓRIO e bump AVULSO é o que impede o número de mentir por 19 pontos
 * percentuais, e ela precisa de todas as linhas do comprador — que o frontend
 * não tem.
 */

import { Users } from "lucide-react";
import type { StageSalesData } from "@loyola-x/shared";

const fmtCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNumber = (v: number) => v.toLocaleString("pt-BR");
const fmtPct = (v: number | null) =>
  v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/**
 * Story 18.66 — as props do card, ou `null` quando ele não deve existir.
 *
 * Devolve props em vez de JSX porque o `KpiCard` é local ao `launch-dashboard`
 * e não é exportado. A vantagem é acidental e boa: a regra de apresentação
 * (quando o card aparece, o que ele diz) fica testável sem montar árvore.
 *
 * `null` quando a etapa não tem produto marcado (AC5). Não é detalhe: **17 das
 * 20 planilhas de venda em produção estão nessa situação**, incluindo todas do
 * Netão. Um card zerado em dezessete lugares ensina o time a ignorá-lo, e no
 * décimo oitavo — onde o número importa — ele já virou paisagem.
 */
/** Card de AOV do topo. `null` quando não há comprador. */
export function aovCardProps(
  ob: StageSalesData["orderBump"],
): { value: string; title: string; sub: string } | null {
  if (!ob || ob.aovGeral == null) return null;
  return {
    value: fmtCurrency(ob.aovGeral),
    title:
      "AOV (valor médio do pedido) = (produto principal + order bump) ÷ compradores.\n\n" +
      `Base: ${fmtNumber(ob.compradoresComPrincipal)} compradores com produto principal.\n` +
      (ob.compradoresSoBump > 0
        ? `Não inclui ${fmtNumber(ob.compradoresSoBump)} comprador(es) que só levaram produtos de bump — eles não têm pedido principal, e incluí-los puxaria o número para baixo sem bater com a tabela por público.\n`
        : "") +
      "\nFecha com a linha Total da tabela de públicos abaixo.",
    sub: `${fmtNumber(ob.compradoresComPrincipal)} compradores`,
  };
}

/**
 * Story 18.69 — as props do card de Combo, ou `null` quando não há combo.
 *
 * ⚠️ Nunca somado ao order bump. Decisão do gestor (2026-08-25): duas ofertas,
 * dois números lado a lado. No `dg-pg02` o combo é 65,97% da receita da
 * captação contra 6,39% do bump — somá-los esconderia que são caminhos
 * diferentes para o mesmo extra.
 */
export function comboCardProps(
  ob: StageSalesData["orderBump"],
): { value: string; title: string; valor: string; adesao: string } | null {
  if (!ob || !ob.comboReceita || ob.comboReceita <= 0) return null;
  return {
    value: fmtPct(ob.comboRepresentatividade ?? null),
    title:
      "Representatividade do combo = receita de combo ÷ receita da captação.\n\n" +
      "O combo SUBSTITUI o ingresso, já com o extra embutido — quem compra combo não tem linha de ingresso.\n\n" +
      "Não se soma ao order bump: são duas ofertas para o mesmo extra.",
    valor: fmtCurrency(ob.comboReceita),
    adesao: `${fmtNumber(ob.compradoresComCombo ?? 0)} de ${fmtNumber(ob.compradoresComPrincipal)} compradores (${fmtPct(ob.taxaDeCombo ?? null)})`,
  };
}

export interface OrderBumpCardProps {
  value: string;
  title: string;
  valorAcessorio: string;
  adesao: string;
  /** `null` quando não há venda avulsa — a linha some em vez de dizer "R$ 0,00". */
  avulso: string | null;
}

export function orderBumpCardProps(
  ob: StageSalesData["orderBump"],
): OrderBumpCardProps | null {
  if (!ob || !ob.temConfiguracao) return null;
  return {
    value: fmtPct(ob.representatividade),
    title:
      "Representatividade do order bump = bump acessório ÷ faturamento total.\n\n" +
      `Bump acessório: ${fmtCurrency(ob.bumpAcessorio)} — de compradores que TÊM produto principal.\n` +
      `Venda avulsa: ${fmtCurrency(ob.bumpAvulso)} — de ${fmtNumber(ob.compradoresSoBump)} compradores que só levaram esses produtos, sem produto principal. Não é acréscimo a venda nenhuma, então não entra na representatividade.\n\n` +
      `Faturamento total da etapa: ${fmtCurrency(ob.faturamentoTotal)}.`,
    valorAcessorio: fmtCurrency(ob.bumpAcessorio),
    // AC4 — o valor sozinho não distingue "muita gente levando bump barato" de
    // "pouca gente levando bump caro", e as duas situações pedem ações opostas.
    adesao: `${fmtNumber(ob.compradoresComBump)} de ${fmtNumber(ob.compradoresComPrincipal)} compradores (${fmtPct(ob.taxaDeAdesao)})`,
    // AC3 — sem esta linha, o card não fecha com o faturamento da etapa e
    // ninguém saberá por quê. A diferença é de ~19 pontos, não de arredondamento.
    avulso:
      ob.bumpAvulso > 0
        ? `+ ${fmtCurrency(ob.bumpAvulso)} em venda avulsa desses produtos`
        : null,
  };
}

/**
 * Story 18.66 (AC6) — o lugar do card quando não há nada configurado.
 *
 * A configuração existe desde a 18.51 e está vazia em quase todo lugar.
 * Provavelmente porque ninguém sabe que ela existe.
 */
export function OrderBumpVazio({ ob }: { ob: StageSalesData["orderBump"] }) {
  if (!ob || ob.temConfiguracao) return null;
  return (
    <p className="text-[11px] text-muted-foreground">
      Nenhum produto marcado como order bump — marque no wizard de planilhas para ver a
      representatividade no faturamento e a conversão por público.
    </p>
  );
}

/**
 * Story 18.67 — a tabela por público.
 *
 * As colunas de bump somem quando a etapa não tem bump configurado (AC8): o AOV
 * não depende de order bump nenhum — é receita ÷ compradores — e esconder a
 * tabela inteira privaria 17 etapas de um número que elas podem calcular.
 */
export function PublicosTable({
  publicos,
  temBump,
  temCombo = false,
}: {
  publicos: StageSalesData["publicos"];
  temBump: boolean;
  /** Story 18.69 — a coluna some quando ninguém classificou um combo. */
  temCombo?: boolean;
}) {
  if (!publicos || publicos.length === 0) return null;

  const totalCompradores = publicos.reduce((s, p) => s + p.compradores, 0);
  const totalComBump = publicos.reduce((s, p) => s + p.compradoresComBump, 0);
  const totalComCombo = publicos.reduce((s, p) => s + (p.compradoresComCombo ?? 0), 0);
  const totalPrincipal = publicos.reduce((s, p) => s + p.receitaPrincipal, 0);
  const totalBump = publicos.reduce((s, p) => s + p.receitaBump, 0);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Público: conversão e valor do pedido
        </h3>
        <span className="text-[10px] text-muted-foreground">
          público do produto principal · order bump ligado ao comprador por e-mail
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border/20">
              <th className="text-left py-2 pr-3">Público</th>
              <th className="text-right px-2">Compradores</th>
              {temBump && <th className="text-right px-2">Conv. Order Bump</th>}
              <th className="text-right px-2">AOV s/ bump</th>
              {temBump && <th className="text-right px-2">AOV c/ bump</th>}
              {temBump && <th className="text-right px-2">Δ</th>}
            </tr>
          </thead>
          <tbody>
            {publicos.map((p) => {
              const delta =
                p.aovSemBump && p.aovComBump && p.aovSemBump > 0
                  ? p.aovComBump / p.aovSemBump - 1
                  : null;
              return (
                <tr key={p.publico} className="border-b border-border/10 hover:bg-muted/30">
                  <td className="py-2 pr-3">{p.publico}</td>
                  <td className="text-right px-2 tabular-nums">{fmtNumber(p.compradores)}</td>
                  {temBump && (
                    <td className="text-right px-2 tabular-nums">
                      {fmtPct(p.taxaBump)}
                      <span className="text-[10px] text-muted-foreground">
                        {" "}({fmtNumber(p.compradoresComBump)})
                      </span>
                    </td>
                  )}
                  {temCombo && (
                    <td className="text-right px-2 tabular-nums">
                      {fmtPct(p.taxaCombo ?? null)}
                      <span className="text-[10px] text-muted-foreground">
                        {" "}({fmtNumber(p.compradoresComCombo ?? 0)})
                      </span>
                    </td>
                  )}
                  <td className="text-right px-2 tabular-nums">
                    {p.aovSemBump == null ? "—" : fmtCurrency(p.aovSemBump)}
                  </td>
                  {temBump && (
                    <td className="text-right px-2 tabular-nums font-medium">
                      {p.aovComBump == null ? "—" : fmtCurrency(p.aovComBump)}
                    </td>
                  )}
                  {/* AC4 — o delta é o que o order bump acrescenta, e é a
                      leitura que justifica investir nele. Uma coluna só de AOV
                      perde exatamente isso. */}
                  {temBump && (
                    <td className="text-right px-2 tabular-nums text-emerald-400">
                      {delta == null || delta === 0 ? "—" : `+${(delta * 100).toFixed(0)}%`}
                    </td>
                  )}
                </tr>
              );
            })}
            {/* AC5 — a tabela fecha com a etapa. Uma tabela de públicos que não
                soma o total é indistinguível de erro de cálculo. */}
            <tr className="border-t border-border/30 font-semibold">
              <td className="py-2 pr-3">Total</td>
              <td className="text-right px-2 tabular-nums">{fmtNumber(totalCompradores)}</td>
              {temCombo && (
                <td className="text-right px-2 tabular-nums">
                  {fmtPct(totalCompradores > 0 ? totalComCombo / totalCompradores : null)}
                </td>
              )}
              {temBump && (
                <td className="text-right px-2 tabular-nums">
                  {fmtPct(totalCompradores > 0 ? totalComBump / totalCompradores : null)}
                  <span className="text-[10px] text-muted-foreground font-normal">
                    {" "}({fmtNumber(totalComBump)})
                  </span>
                </td>
              )}
              <td className="text-right px-2 tabular-nums">
                {totalCompradores > 0 ? fmtCurrency(totalPrincipal / totalCompradores) : "—"}
              </td>
              {temBump && (
                <td className="text-right px-2 tabular-nums">
                  {totalCompradores > 0
                    ? fmtCurrency((totalPrincipal + totalBump) / totalCompradores)
                    : "—"}
                </td>
              )}
              {temBump && (
                <td className="text-right px-2 tabular-nums text-emerald-400">
                  {totalPrincipal > 0
                    ? `+${(((totalPrincipal + totalBump) / totalPrincipal - 1) * 100).toFixed(0)}%`
                    : "—"}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
