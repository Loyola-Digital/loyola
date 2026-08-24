"use client";

/**
 * Story 29.61 — order bump, upsell e AOV por público no Perpétuo.
 *
 * Espelha a seção da Captação Paga (18.66/18.67) e acrescenta o que só o
 * Perpétuo tem:
 *
 *   • coluna de **upsell** — terceiro tipo da 29.49, alavanca diferente do bump
 *   • marcação de **amostra baixa** — taxa de 0% sobre 2 pessoas não é fato
 *   • **recusa de afirmar** quando a origem não é confiável (AC7-bis)
 *
 * Nenhum cálculo aqui. A regra é de `utils/order-bump.ts`, no backend, a mesma
 * da Captação Paga — duas implementações divergiriam no dia em que a definição
 * de "taxa de bump" mudasse, e o gestor veria dois números em duas abas.
 */

import { Percent, Users, AlertTriangle } from "lucide-react";
import type { PerpetualSalesData } from "@loyola-x/shared";
import { diagnosticarPublico } from "@/lib/utils/publico-confiavel";

const fmtCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNumber = (v: number) => v.toLocaleString("pt-BR");
const fmtPct = (v: number | null) =>
  v == null
    ? "—"
    : `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/**
 * O card de representatividade. `null` quando não há produto classificado como
 * bump ou upsell — o caso de dois dos quatro funis perpétuos em produção.
 */
export function PerpetualOrderBumpCard({
  ob,
}: {
  ob: PerpetualSalesData["orderBump"];
}) {
  if (!ob || !ob.temConfiguracao || ob.faturamentoTotal <= 0) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Order Bump
        </span>
        <Percent className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p
        className="text-xl font-bold tracking-tight underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 cursor-help"
        title={
          "Representatividade = order bump acessório ÷ faturamento total.\n\n" +
          `Acessório: ${fmtCurrency(ob.bumpAcessorio)} — de compradores que TÊM produto principal.\n` +
          `Avulso: ${fmtCurrency(ob.bumpAvulso)} — de ${fmtNumber(ob.compradoresSoBump)} comprador(es) que só levaram produtos de bump, sem principal. Não é acréscimo a venda nenhuma, então fica fora da conta.\n\n` +
          `Faturamento total: ${fmtCurrency(ob.faturamentoTotal)}.`
        }
      >
        {fmtPct(ob.representatividade)}
      </p>
      <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight space-y-0.5">
        <p className="tabular-nums">{fmtCurrency(ob.bumpAcessorio)}</p>
        <p>
          {fmtNumber(ob.compradoresComBump)} de {fmtNumber(ob.compradoresComPrincipal)}{" "}
          compradores ({fmtPct(ob.taxaDeAdesao)})
        </p>
        {ob.bumpAvulso > 0 && (
          <p className="text-amber-600 dark:text-amber-400">
            + {fmtCurrency(ob.bumpAvulso)} em venda avulsa
          </p>
        )}
      </div>
    </div>
  );
}

export function PerpetualPublicosTable({
  publicos,
  temBump,
  temUpsell,
  investimento,
}: {
  publicos: PerpetualSalesData["publicos"];
  temBump: boolean;
  temUpsell: boolean;
  /** Investimento do período, para o detector do AC7-bis. */
  investimento: number | null;
}) {
  if (!publicos || publicos.length === 0) return null;

  // AC7-bis — antes de mostrar qualquer coisa, a dimensão precisa poder ser
  // afirmada. Num funil com investimento e nenhum comprador classificado como
  // pago, a coluna mapeada como `utm_source` não é uma UTM (medido: `dg-a1`,
  // 2.147 linhas) e a tabela diria "100% Orgânico" para tráfego pago frio.
  const diagnostico = diagnosticarPublico(publicos, investimento);

  const total = publicos.reduce((s, p) => s + p.compradores, 0);
  const totalBump = publicos.reduce((s, p) => s + p.compradoresComBump, 0);
  const totalUpsell = publicos.reduce((s, p) => s + p.compradoresComUpsell, 0);
  const totalPrincipal = publicos.reduce((s, p) => s + p.receitaPrincipal, 0);
  const totalAdicional = publicos.reduce((s, p) => s + p.receitaBump + p.receitaUpsell, 0);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Público: conversão e valor do pedido
        </h3>
        <span className="text-[10px] text-muted-foreground">
          conta COMPRADORES — a quebra do card de Vendas conta linhas, e os dois números diferem
        </span>
      </div>

      {!diagnostico.confiavel ? (
        // Recusar afirmar é a decisão. Uma tabela dizendo "100% Orgânico" para
        // um funil de tráfego pago é pior que tabela nenhuma: ninguém desconfia
        // de um número apresentado com essa cara.
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-medium text-amber-600 dark:text-amber-400">
              Dimensão de público indisponível
            </p>
            <p className="text-muted-foreground">{diagnostico.motivo}</p>
            <p className="text-muted-foreground">
              AOV geral do período:{" "}
              <span className="tabular-nums font-medium text-foreground">
                {total > 0 ? fmtCurrency((totalPrincipal + totalAdicional) / total) : "—"}
              </span>{" "}
              ({fmtNumber(total)} compradores)
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/20">
                <th className="text-left py-2 pr-3">Público</th>
                <th className="text-right px-2">Compradores</th>
                {temBump && <th className="text-right px-2">Conv. Order Bump</th>}
                {temUpsell && <th className="text-right px-2">Conv. Upsell</th>}
                <th className="text-right px-2">AOV s/ adicionais</th>
                {(temBump || temUpsell) && <th className="text-right px-2">AOV c/ adicionais</th>}
                {(temBump || temUpsell) && <th className="text-right px-2">Δ</th>}
              </tr>
            </thead>
            <tbody>
              {publicos.map((p) => {
                const delta =
                  p.aovSemBump && p.aovComBump && p.aovSemBump > 0
                    ? p.aovComBump / p.aovSemBump - 1
                    : null;
                /**
                 * AC3-bis — a taxa de um balde de 2 pessoas não pode ter a
                 * mesma autoridade visual que a de 94. "0,0%" ali se lê como
                 * "esse público não adere", quando significa "duas pessoas não
                 * aderiram".
                 */
                const taxa = (valor: number | null, n: number) =>
                  p.amostraBaixa ? (
                    <span
                      className="text-muted-foreground/70 cursor-help"
                      title={`Amostra pequena: ${p.compradores} comprador(es). A taxa varia muito com uma conversão a mais ou a menos — leia com cautela.`}
                    >
                      {fmtPct(valor)}
                      <span className="ml-0.5">*</span>
                    </span>
                  ) : (
                    <>
                      {fmtPct(valor)}
                      <span className="text-[10px] text-muted-foreground"> ({fmtNumber(n)})</span>
                    </>
                  );
                return (
                  <tr key={p.publico} className="border-b border-border/10 hover:bg-muted/30">
                    <td className="py-2 pr-3">{p.publico}</td>
                    <td className="text-right px-2 tabular-nums">{fmtNumber(p.compradores)}</td>
                    {temBump && (
                      <td className="text-right px-2 tabular-nums">
                        {taxa(p.taxaBump, p.compradoresComBump)}
                      </td>
                    )}
                    {temUpsell && (
                      <td className="text-right px-2 tabular-nums">
                        {taxa(p.taxaUpsell, p.compradoresComUpsell)}
                      </td>
                    )}
                    <td className="text-right px-2 tabular-nums">
                      {p.aovSemBump == null ? "—" : fmtCurrency(p.aovSemBump)}
                    </td>
                    {(temBump || temUpsell) && (
                      <td className="text-right px-2 tabular-nums font-medium">
                        {p.aovComBump == null ? "—" : fmtCurrency(p.aovComBump)}
                      </td>
                    )}
                    {(temBump || temUpsell) && (
                      <td className="text-right px-2 tabular-nums text-emerald-400">
                        {delta == null || delta === 0 ? "—" : `+${(delta * 100).toFixed(0)}%`}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr className="border-t border-border/30 font-semibold">
                <td className="py-2 pr-3">Total</td>
                <td className="text-right px-2 tabular-nums">{fmtNumber(total)}</td>
                {temBump && (
                  <td className="text-right px-2 tabular-nums">
                    {fmtPct(total > 0 ? totalBump / total : null)}
                  </td>
                )}
                {temUpsell && (
                  <td className="text-right px-2 tabular-nums">
                    {fmtPct(total > 0 ? totalUpsell / total : null)}
                  </td>
                )}
                <td className="text-right px-2 tabular-nums">
                  {total > 0 ? fmtCurrency(totalPrincipal / total) : "—"}
                </td>
                {(temBump || temUpsell) && (
                  <td className="text-right px-2 tabular-nums">
                    {total > 0 ? fmtCurrency((totalPrincipal + totalAdicional) / total) : "—"}
                  </td>
                )}
                {(temBump || temUpsell) && (
                  <td className="text-right px-2 tabular-nums text-emerald-400">
                    {totalPrincipal > 0
                      ? `+${(((totalPrincipal + totalAdicional) / totalPrincipal - 1) * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
          {publicos.some((p) => p.amostraBaixa) && (
            <p className="text-[10px] text-muted-foreground mt-2">
              * amostra menor que 10 compradores — a taxa varia muito com uma conversão a mais
            </p>
          )}
        </div>
      )}
    </div>
  );
}
