"use client";

/**
 * Quais ingressos venderam, lote a lote.
 *
 * ## Por que isto não sai da planilha de vendas
 *
 * A venda da Kiwify não diz de qual lote é o ingresso, e uma compra de três
 * chega como UMA linha. Derivar pelo preço também não funciona: o evento do BBE
 * tem dezesseis lotes (Empreendedor 947, VIP 1.247, Black 1.347, versões com
 * 15% e 20%, ofertas fechadas), e vários compartilham faixa de valor.
 *
 * O número só existe no PRODUTO, em `issued_tickets` — a contagem oficial da
 * Kiwify por lote. É o que esta tabela mostra.
 *
 * ## É o evento inteiro, não o período
 *
 * Os lotes contam desde a abertura das vendas. O filtro de dias do dashboard
 * não se aplica, e a tabela diz isso — senão o número parece não bater com o
 * resto da tela.
 */

import { Ticket } from "lucide-react";

export interface LoteDeIngresso {
  produto: string;
  lote: string;
  preco: number;
  vendidos: number;
  disponiveis: number;
  total: number;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function LotesDeIngresso({ lotes }: { lotes: LoteDeIngresso[] }) {
  if (!lotes || lotes.length === 0) return null;

  const vendidos = lotes.reduce((s, l) => s + l.vendidos, 0);
  const receita = lotes.reduce((s, l) => s + l.vendidos * l.preco, 0);
  // Lote sem venda vai para o fim e some atrás de um botão: num evento com
  // dezesseis lotes, a maioria nunca abriu, e listá-los todos esconde os cinco
  // que importam.
  const comVenda = lotes.filter((l) => l.vendidos > 0);
  const semVenda = lotes.filter((l) => l.vendidos === 0);

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Ticket className="h-4 w-4 text-primary" />
          Ingressos por lote
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {vendidos} {vendidos === 1 ? "ingresso" : "ingressos"} · {brl(receita)} ·{" "}
          <span className="text-muted-foreground/70">evento todo, não o período</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border/40">
              {["Lote", "Preço", "Vendidos", "Restam", "% do total"].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comVenda.map((l) => {
              const fatia = vendidos > 0 ? (l.vendidos / vendidos) * 100 : 0;
              return (
                <tr key={`${l.produto}|${l.lote}`} className="border-b border-border/30 last:border-b-0">
                  <td className="px-3 py-2 font-medium">{l.lote}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                    {brl(l.preco)}
                  </td>
                  <td className="px-3 py-2 font-medium tabular-nums">{l.vendidos}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {/* Estoque esgotado é informação de decisão: é o momento de
                        abrir o próximo lote, e um "0" solto não anuncia isso. */}
                    {l.disponiveis === 0 ? (
                      <span className="text-amber-600">esgotado</span>
                    ) : (
                      l.disponiveis
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${fatia}%` }} />
                      </div>
                      <span className="tabular-nums text-[11px] text-muted-foreground">
                        {fatia.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {semVenda.length > 0 && (
        <details className="border-t border-border/40 px-4 py-2">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
            {semVenda.length} {semVenda.length === 1 ? "lote sem venda" : "lotes sem venda"}
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {semVenda.map((l) => (
              <span
                key={`${l.produto}|${l.lote}`}
                className="rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {l.lote} · {brl(l.preco)}
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
