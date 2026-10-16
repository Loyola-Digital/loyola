"use client";

// ============================================================
// Story 42.12 (AC2) — Resumo mobile por canal.
//
// Abaixo dos cards do Resumo (Story 42.14: na janela do filtro): a receita paga de cada canal — Meta,
// Google, Orgânico ou cupom, Sem atribuição — e, para Meta e Google, o
// investimento do próprio canal, o ROAS e a Margem de Contribuição. O card
// "Receita (RevenueCat)" continua com o overview; esta tabela lê o webhook,
// então as duas somas não batem exatamente, e a tela diz isso.
//
// Posição e formato (tabela abaixo dos cards) são proposta do @dev — a story
// deixou para a validação visual.
//
// As decisões estão em `lib/utils/vendas-por-canal-lyrio.ts`, com teste; aqui
// só se desenha.
// ============================================================

import { Skeleton } from "@/components/ui/skeleton";
import { useRevenuecatVendasPorCanal } from "@/lib/hooks/use-revenuecat";
import {
  DECLARACAO_FONTE_DO_RESUMO,
  avisoDeConflito,
  declaracaoDeCobertura,
  estadoDasVendasPorCanal,
  linhasDoResumoPorCanal,
  type EntradaDoResumoPorCanal,
} from "@/lib/utils/vendas-por-canal-lyrio";
import { ultimosNDias } from "@/lib/utils/janela-dos-cards-lyrio";


function fmtBRL(v: number | null): string {
  return v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtRoas(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)}x`;
}

const th = "text-right py-1.5 pl-3 font-medium whitespace-nowrap";
const td = "text-right py-1.5 pl-3 tabular-nums";

export function LyrioResumoPorCanal({
  projectId,
  funnelId,
  stageId,
  days,
  brlRate,
  meta,
  google,
  percentuais,
}: {
  projectId: string;
  funnelId: string;
  stageId: string;
  /**
   * Story 42.14 (D22) — a tabela segue o FILTRO de dias (antes, 28 fixos). O
   * investimento de `meta`/`google` tem de ser da mesma janela.
   */
  days: number;
} & Omit<EntradaDoResumoPorCanal, "dados">) {
  const q = useRevenuecatVendasPorCanal(projectId, funnelId, stageId, days);
  const estado = estadoDasVendasPorCanal({ isLoading: q.isLoading, error: q.error, data: q.data });

  // AC7: API anterior à rota — some; o banner de versão explica.
  if (estado.tipo === "oculto") return null;

  return (
    <div className="space-y-2 border-t border-border/30 pt-3">
      <h3 className="text-xs font-semibold text-muted-foreground">Por canal · venda paga · {ultimosNDias(days)}</h3>
      {estado.tipo === "carregando" ? (
        <Skeleton className="h-24 w-full" />
      ) : estado.tipo === "erro" ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Não foi possível carregar as vendas por canal: {estado.mensagem}
        </p>
      ) : (
        <>
          {avisoDeConflito(estado.dados.conflito.compradores) && (
            <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {avisoDeConflito(estado.dados.conflito.compradores)}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/20">
                  <th className="text-left py-1.5 pr-3 font-medium">Canal</th>
                  <th className={th} title="Eventos de receita com valor maior que US$ 0 (compra inicial, renovação, conversão de teste)">Vendas</th>
                  <th className={th} title="Soma das vendas pagas do canal, convertida pelo câmbio">Receita</th>
                  <th className={th} title="Meta com o imposto de 12,15%; Google sem imposto. — = canal sem investimento, ou sem campanha vinculada à etapa">Investimento</th>
                  <th className={th} title="Receita do canal ÷ investimento do canal">ROAS</th>
                  <th className={th} title="Mesma conta do card Margem de Contribuição, com a receita e o investimento do canal">Margem</th>
                </tr>
              </thead>
              <tbody>
                {linhasDoResumoPorCanal({ dados: estado.dados, brlRate, meta, google, percentuais }).map((l) => (
                  <tr
                    key={l.chave}
                    className={
                      l.chave === "total"
                        ? "font-semibold"
                        : l.chave === "conflito"
                          ? "border-b border-border/10 text-amber-700 dark:text-amber-400"
                          : "border-b border-border/10"
                    }
                  >
                    <td className="py-1.5 pr-3 whitespace-nowrap">{l.rotulo}</td>
                    <td className={td}>{l.vendas.toLocaleString("pt-BR")}</td>
                    <td className={td}>{fmtBRL(l.receitaBrl)}</td>
                    <td className={td}>{fmtBRL(l.investimentoBrl)}</td>
                    <td className={td}>{fmtRoas(l.roas)}</td>
                    <td className={td + (l.margemBrl != null && l.margemBrl < 0 ? " text-red-600 dark:text-red-400" : "")}>{fmtBRL(l.margemBrl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* AC2 + AC6: a fonte da receita e a cobertura dos atributos — declaradas, nada como medido sem fonte. */}
          <p className="text-[11px] text-muted-foreground">
            {DECLARACAO_FONTE_DO_RESUMO} {declaracaoDeCobertura(estado.dados)}
          </p>
        </>
      )}
    </div>
  );
}
