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
//
// Story 42.18 — abaixo, a tabela "Por produto × canal": as linhas são os
// planos, e cada canal tem Novos → Trial e Novos → Iniciou contra os novos DO
// CANAL. Com a API anterior (sem `porProduto`), ela não aparece.
// ============================================================

import { Fragment } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRevenuecatJornada } from "@/lib/hooks/use-revenuecat";
import {
  ARREDONDAMENTO_DO_POR_PRODUTO,
  DICA_DO_POR_PRODUTO,
  avisoDeConflitoDaJornada,
  colunasDoPorProduto,
  colunasSemParidade,
  declaracoesDaJornada,
  dicaDaLinhaDoPorProduto,
  estadoDoBlocoDaJornada,
  formatarTaxa,
  taxaDaJornada,
  taxasDoPorProduto,
  type ContagemDaJornada,
  type JornadaDoLyrio,
  type PorProdutoDaJornada,
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

// Story 42.18 (AC4g): a coluna Plano fica fixa quando a tabela rola na horizontal.
const plano = "sticky left-0 z-10 bg-background text-left py-2 pr-3 whitespace-nowrap";

/** Story 42.18 (AC4) — Por produto × canal: as duas taxas de cada canal, contra os novos do canal. */
function TabelaPorProduto({ jornada, p }: { jornada: JornadaDoLyrio; p: PorProdutoDaJornada }) {
  const colunas = colunasDoPorProduto(p);
  const semParidade = colunasSemParidade(jornada);
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground" title={DICA_DO_POR_PRODUTO}>
        Por produto × canal
      </h3>
      {semParidade.length > 0 && (
        <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          A soma por plano não fecha com a tabela por canal em: {semParidade.join(", ")}.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            {/* PO-02: duas linhas — o canal em cima; "→ Trial" e "→ Iniciou" embaixo */}
            <tr className="text-muted-foreground">
              <th rowSpan={2} className={`${plano} font-medium align-bottom border-b border-border/20`}>
                Plano
              </th>
              {colunas.map((c) => (
                <th key={c.chave} colSpan={2} className="text-center py-1 pl-3 font-medium whitespace-nowrap" title={DICA_DO_POR_PRODUTO}>
                  {c.rotulo}
                </th>
              ))}
            </tr>
            <tr className="text-muted-foreground border-b border-border/20">
              {colunas.map((c) => (
                <Fragment key={c.chave}>
                  <th className={th} title={DICA_DO_POR_PRODUTO}>→ Trial</th>
                  <th className={th} title={DICA_DO_POR_PRODUTO}>→ Iniciou</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.linhas.map((l) => (
              <tr key={l.linha} className="border-b border-border/10 hover:bg-muted/30">
                <td className={plano} title={dicaDaLinhaDoPorProduto(l)}>
                  {l.rotulo}
                </td>
                {colunas.map((c) => {
                  const t = taxasDoPorProduto(l, c);
                  return (
                    <Fragment key={c.chave}>
                      <td className={td}>{formatarTaxa(t.trial)}</td>
                      <td className={td}>{formatarTaxa(t.iniciou)}</td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">{ARREDONDAMENTO_DO_POR_PRODUTO}</p>
    </div>
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
          {/* Story 42.12 (D7): conflito Meta × Google é sinal de falha na integração — aparece, não some. */}
          {avisoDeConflitoDaJornada(estado.dados) && (
            <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {avisoDeConflitoDaJornada(estado.dados)}
            </p>
          )}
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
                {estado.dados.conflito && estado.dados.conflito.novos > 0 && (
                  <tr className="border-b border-border/10 text-amber-700 dark:text-amber-400">
                    <td className="py-2 pr-3 whitespace-nowrap">Meta e Google (conflito)</td>
                    <Celulas c={estado.dados.conflito} />
                  </tr>
                )}
                <tr className="font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <Celulas c={estado.dados.total} />
                </tr>
              </tbody>
            </table>
          </div>
          {/* Story 42.18 (AC4f): sem `porProduto` (API anterior), só a tabela por canal */}
          {estado.dados.porProduto && <TabelaPorProduto jornada={estado.dados} p={estado.dados.porProduto} />}
        </>
      )}
    </section>
  );
}
