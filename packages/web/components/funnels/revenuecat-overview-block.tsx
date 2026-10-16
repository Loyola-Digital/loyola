"use client";

// ============================================================
// Story 42.9 — o bloco de Overview do RevenueCat.
//
// Foram pedidas 14 métricas. `/v2/.../metrics/overview` devolve 6; o resto é
// Chart do dashboard. Este bloco mostra:
//
//   as 6 da API .......... trials, assinaturas, MRR, receita, clientes, usuários
//   1 derivada exata ..... ARR = MRR × 12
//   6 dos eventos ........ novas pagas, conversão de trial, churn, abandono,
//                          cancelamentos, movimento
//
// Ficam de FORA, e de propósito: MRR Movement e Cohort. Exigem série histórica
// que não existe — a API só devolve o estado de agora. Card zerado no lugar
// delas afirmaria medição (AC4).
//
// Story 42.14 — cada card ganhou o memorial (`<MetricTooltip>`, no lugar do
// `title=` nativo) e a etiqueta de janela da fonte única; o que não segue o
// filtro de dias tem fundo âmbar. O título não leva intervalo (D18): a janela
// fica em cada card. O que cada card diz vem de `cardsDoOverview`, com teste.
// ============================================================

import { TooltipProvider } from "@/components/ui/tooltip";
import { useRevenuecatOverview, useRevenuecatMetricasDerivadas } from "@/lib/hooks/use-revenuecat";
import { avisoDaSerie, cardsDoOverview } from "@/lib/utils/overview-revenuecat";
import { hojeNoNegocio } from "@/lib/utils/janela-dos-cards-lyrio";
import { avisoDoErroDaFonte, estadoDaFonte } from "@/lib/utils/estado-da-fonte-revenuecat";
import { CardComJanela } from "./lyrio-card-com-janela";

export function RevenuecatOverviewBlock({
  projectId, funnelId, stageId, days,
}: { projectId: string; funnelId: string; stageId: string; /** O N do seletor de dias da etapa. */ days: number }) {
  const overviewQ = useRevenuecatOverview(projectId, funnelId, stageId);
  const derivadasQ = useRevenuecatMetricasDerivadas(projectId, funnelId, stageId);

  if (overviewQ.isLoading) {
    return <div className="h-24 animate-pulse rounded-xl border border-border/30 bg-muted/20" />;
  }

  const overview = estadoDaFonte({
    isLoading: overviewQ.isLoading,
    error: overviewQ.error,
    data: overviewQ.data?.metrics,
  });
  const derivadas = estadoDaFonte({ isLoading: derivadasQ.isLoading, error: derivadasQ.error, data: derivadasQ.data });

  // PO-D4 (5) — a falha é testada ANTES da ausência: uma requisição que falhou
  // também chega sem métricas, e o `return null` da ausência a esconderia.
  // AC4 da 42.9 — sem dado (app não escolhido, nenhuma métrica), nada é
  // exibido: uma grade de zeros afirmaria medição.
  if (overview.tipo !== "erro" && !overviewQ.data?.metrics?.length) return null;

  const serieDesde = derivadas.tipo === "pronto" ? derivadas.dados.serieDesde : null;
  const { principais, eventos } = cardsDoOverview({
    ctx: { diasDoFiltro: days, hoje: hojeNoNegocio(), serieDesde },
    overview,
    derivadas,
  });
  const avisoDoOverview = avisoDoErroDaFonte(overview, "as métricas do RevenueCat");
  const avisoDasDerivadas = avisoDoErroDaFonte(derivadas, "as métricas dos eventos");
  const aviso = avisoDaSerie(serieDesde);

  return (
    // AC1d — provider LOCAL: o `Tooltip` do shadcn neste repo não embute o
    // provider, e sem ele o memorial não abre — sem erro nenhum. Dentro da etapa
    // o provider de fora já cobre; este garante o bloco em qualquer lugar.
    <TooltipProvider>
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Overview do RevenueCat</h3>
          <p className="text-xs text-muted-foreground">
            Assinaturas, receita e movimento do app. Valores em dólar, como a API
            os reporta. A janela de cada número está no card; fundo âmbar = não segue o
            filtro de {days.toLocaleString("pt-BR")} dias.
          </p>
        </div>

        {avisoDoOverview && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {avisoDoOverview}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {principais.map((c) => (
            <CardComJanela key={c.id} rotulo={c.rotulo} valor={c.valor} declaracao={c.declaracao} formula={c.formula} />
          ))}
        </div>

        {avisoDasDerivadas && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {avisoDasDerivadas}
          </p>
        )}

        {eventos.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {eventos.map((c) => (
                <CardComJanela key={c.id} rotulo={c.rotulo} valor={c.valor} declaracao={c.declaracao} formula={c.formula} />
              ))}
            </div>
            {/* AC5 da 42.9 — sem isto, um churn de 15 dias é lido como histórico. */}
            {aviso && <p className="text-[11px] text-muted-foreground/70">{aviso}</p>}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
