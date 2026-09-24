"use client";

// ============================================================
// Story 42.11 — Jornada por canal da etapa Lyrio.
//
// Uma linha por canal (+ Total) com Novos → Viu paywall → Interagiu → Iniciou
// (teste) → Pagou, a receita e as taxas contra Novos. Coorte = primeiro evento
// do usuário na janela do seletor de dias do cabeçalho; as etapas contam o que
// ele fez até hoje. Lê o webhook do RevenueCat — não depende de campanha
// vinculada, por isso fica FORA da condição do Detalhamento (PO-03).
//
// As decisões (estado do bloco, taxas, declarações) estão em
// `lib/utils/jornada-lyrio.ts`, com teste; aqui só se desenha.
// ============================================================

import { Skeleton } from "@/components/ui/skeleton";
import { useRevenuecatJornada } from "@/lib/hooks/use-revenuecat";
import {
  declaracoesDaJornada,
  estadoDoBlocoDaJornada,
  formatarTaxa,
  taxaDaJornada,
  type ContagemDaJornada,
} from "@/lib/utils/jornada-lyrio";

function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR");
}
function fmtUsd(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

const th = "text-right py-2 pl-3 font-medium whitespace-nowrap";
const td = "text-right py-2 pl-3 tabular-nums";

function Celulas({ c }: { c: ContagemDaJornada }) {
  return (
    <>
      <td className={td}>{fmtNum(c.novos)}</td>
      <td className={td}>{fmtNum(c.viuPaywall)}</td>
      <td className={td}>{fmtNum(c.interagiu)}</td>
      <td className={td}>
        {fmtNum(c.iniciou)} <span className="text-muted-foreground">({fmtNum(c.iniciouTeste)})</span>
      </td>
      <td className={td}>{fmtNum(c.pagou)}</td>
      <td className={td}>{fmtUsd(c.receitaUsd)}</td>
      <td className={td}>{formatarTaxa(taxaDaJornada(c.iniciou, c.novos))}</td>
      <td className={td}>{formatarTaxa(taxaDaJornada(c.pagou, c.novos))}</td>
    </>
  );
}

export function LyrioJornadaPorCanal({ projectId, funnelId, stageId, days }: { projectId: string; funnelId: string; stageId: string; days: number }) {
  const q = useRevenuecatJornada(projectId, funnelId, stageId, days);
  const estado = estadoDoBlocoDaJornada({ isLoading: q.isLoading, error: q.error, data: q.data });

  // AC6: API anterior à 42.11 (rota inexistente) — o bloco some; o banner de versão explica.
  if (estado.tipo === "oculto") return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Jornada por canal</h2>
      {estado.tipo === "carregando" ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : estado.tipo === "erro" ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Não foi possível carregar a jornada por canal: {estado.mensagem}
        </p>
      ) : (
        <>
          {/* AC4: o que a tabela declara — nada como medido sem fonte. */}
          <p className="text-[11px] text-muted-foreground">{declaracoesDaJornada(estado.dados).join(" ")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/20">
                  <th className="text-left py-2 pr-3 font-medium">Canal</th>
                  <th className={th} title="Usuários cujo PRIMEIRO evento caiu na janela">Novos</th>
                  <th className={th} title="Qualquer evento de paywall">Viu paywall</th>
                  <th className={th} title="PAYWALL_COMPONENT_INTERACTED">Interagiu</th>
                  <th className={th} title="INITIAL_PURCHASE ou NON_RENEWING_PURCHASE; entre parênteses, os que iniciaram por teste (period_type TRIAL)">Iniciou (teste)</th>
                  <th className={th} title="Algum evento de receita com valor maior que US$ 0 — o teste grátis e o promocional de US$ 0 ficam fora">Pagou</th>
                  <th className={th} title="Soma de revenue_usd dos eventos que contam em Pagou">Receita (US$)</th>
                  <th className={th} title="Iniciou ÷ Novos">Novos → Iniciou</th>
                  <th className={th} title="Pagou ÷ Novos">Novos → Pagou</th>
                </tr>
              </thead>
              <tbody>
                {estado.dados.linhas.map((l) => (
                  <tr key={l.canal} className="border-b border-border/10 hover:bg-muted/30">
                    <td className="py-2 pr-3 whitespace-nowrap">{l.rotulo}</td>
                    <Celulas c={l} />
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <Celulas c={estado.dados.total} />
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
