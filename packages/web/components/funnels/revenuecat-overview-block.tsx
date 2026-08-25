"use client";

// ============================================================
// Story 42.9 — o bloco de Overview do RevenueCat.
//
// Foram pedidas 14 métricas. `/v2/.../metrics/overview` devolve 6; o resto é
// Chart do dashboard, fora da API v2. Este bloco mostra:
//
//   as 6 da API .......... trials, assinaturas, MRR, receita, clientes, usuários
//   1 derivada exata ..... ARR = MRR × 12
//   6 dos eventos ........ novas pagas, conversão de trial, churn, abandono,
//                          cancelamentos, movimento
//
// Ficam de FORA, e de propósito: MRR Movement e Cohort. Exigem série histórica
// que não existe — a API só devolve o estado de agora. É o que a Story 42.10
// começa a acumular. Card zerado no lugar delas afirmaria medição (AC4).
// ============================================================

import { useRevenuecatOverview, useRevenuecatMetricasDerivadas } from "@/lib/hooks/use-revenuecat";
import {
  arrDoMrr, fmtUsd, fmtNum, fmtPct, fmtMovimento, avisoDaSerie,
  ROTULO_DA_JANELA, type JanelaDaMetrica,
} from "@/lib/utils/overview-revenuecat";

function Card({
  rotulo, valor, janela, detalhe,
}: { rotulo: string; valor: string; janela: JanelaDaMetrica; detalhe: string }) {
  return (
    <div
      title={detalhe}
      className="cursor-help rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3 transition-colors hover:border-border/50"
    >
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{valor}</p>
      {/* AC2 — a janela de cada número, sempre. O filtro de dias da etapa NÃO
          governa este endpoint, e um snapshot ao lado do filtro sem aviso seria
          lido como resposta a ele. */}
      <p className="text-[10px] text-muted-foreground/70">{ROTULO_DA_JANELA[janela]}</p>
    </div>
  );
}

export function RevenuecatOverviewBlock({
  projectId, funnelId, stageId,
}: { projectId: string; funnelId: string; stageId: string }) {
  const overview = useRevenuecatOverview(projectId, funnelId, stageId);
  const derivadas = useRevenuecatMetricasDerivadas(projectId, funnelId, stageId);

  const m = overview.data?.metrics;
  const valor = (id: string) => m?.find((x) => x.id === id)?.value ?? null;
  const d = derivadas.data;

  if (overview.isLoading) {
    return <div className="h-24 animate-pulse rounded-xl border border-border/30 bg-muted/20" />;
  }
  // AC4 — sem dado, nada é exibido. Uma grade de zeros afirmaria medição.
  if (!m?.length) return null;

  const mrr = valor("mrr");
  const activeUsers = valor("active_users");
  const aviso = avisoDaSerie(d?.serieDesde);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Overview do RevenueCat</h3>
        <p className="text-xs text-muted-foreground">
          Assinaturas, receita e movimento do app. Valores em dólar, como a API
          os reporta.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Card rotulo="Assinaturas ativas" valor={fmtNum(valor("active_subscriptions"))} janela="agora"
          detalhe="Assinaturas pagas ativas neste instante. Não responde ao filtro de datas da etapa." />
        <Card rotulo="Trials ativos" valor={fmtNum(valor("active_trials"))} janela="agora"
          detalhe="Períodos de teste em andamento neste instante." />
        <Card rotulo="MRR" valor={fmtUsd(mrr)} janela="agora"
          detalhe="Receita recorrente mensal, como a API a calcula. Em dólar." />
        {/* AC3 — derivação declarada, não medição. */}
        <Card rotulo="ARR" valor={fmtUsd(arrDoMrr(mrr))} janela="derivado"
          detalhe={`Derivado: MRR × 12. Não é medido pela API — com MRR de ${fmtUsd(mrr)}, o ARR é ${fmtUsd(arrDoMrr(mrr))}.`} />
        <Card rotulo="Receita" valor={fmtUsd(valor("revenue"))} janela="28d"
          detalhe="Receita acumulada dos últimos 28 dias — janela fixa da API, não o filtro da etapa." />
        <Card rotulo="Novos clientes" valor={fmtNum(valor("new_customers"))} janela="28d"
          detalhe="Clientes novos nos últimos 28 dias." />
        <Card rotulo="Usuários ativos" valor={fmtNum(activeUsers)} janela="28d"
          detalhe="Base ativa do app. É o denominador da Conversão para Trial." />
        {d && (
          /* AC7 — o gestor decidiu o numerador: quem inicia TRIAL.
             O rótulo diz TRIAL de propósito: sob "Conversão para pagante" este
             número (1,64%) faria o app parecer 5x melhor do que converte em
             receita, onde quem paga era 0,32%. */
          <Card rotulo="Conversão para Trial"
            valor={fmtPct(activeUsers ? d.novosTrials / activeUsers : null)} janela="serie"
            detalhe={`${fmtNum(d.novosTrials)} usuários iniciaram trial ÷ ${fmtNum(activeUsers)} usuários ativos. Mede entrada no funil de assinatura, NÃO receita — para receita, veja Novas assinaturas pagas.`} />
        )}
      </div>

      {d && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <Card rotulo="Novas assinaturas pagas" valor={fmtNum(d.novasAssinaturasPagas)} janela="serie"
              detalhe="Compras que já entraram pagando (period_type NORMAL/INTRO/PROMOTIONAL)." />
            <Card rotulo="Conversões de trial" valor={fmtNum(d.conversoesDeTrial)} janela="serie"
              detalhe={`${fmtNum(d.conversoesDeTrial)} de ${fmtNum(d.novosTrials)} trials passaram a pagar (${fmtPct(d.taxaDeConversaoDeTrial)}).`} />
            {/* O churn conta só EXPIRATION de quem PAGAVA. Somar o abandono de
                trial daria um número muito maior e sobre outra pergunta. */}
            <Card rotulo="Churn (pagantes)" valor={fmtNum(d.churnPagante)} janela="serie"
              detalhe="Assinaturas PAGAS que expiraram. Não inclui trial abandonado nem cancelamento — quem cancelou ainda tem acesso até o fim do ciclo." />
            <Card rotulo="Movimento de assinaturas" valor={fmtMovimento(d.movimentoDeAssinaturas)} janela="serie"
              detalhe="Entradas pagas + conversões de trial − expirações pagas. Cancelamento não entra: o acesso continua até o fim do ciclo, e existe reativação." />
            <Card rotulo="Trials abandonados" valor={fmtNum(d.abandonoDeTrial)} janela="serie"
              detalhe="Testes que expiraram sem virar assinatura. É abandono, não churn de cliente." />
            <Card rotulo="Cancelamentos" valor={fmtNum(d.cancelamentosPagantes)} janela="serie"
              detalhe="Pagantes que desligaram a renovação. Ainda têm acesso — viram churn quando expirar, se não reativarem." />
          </div>

          {/* AC5 — sem isto, um churn de 15 dias é lido como histórico. */}
          {aviso && <p className="text-[11px] text-muted-foreground/70">{aviso}</p>}
        </>
      )}
    </div>
  );
}
