"use client";

/**
 * Mini-funil de uma LP: a cadeia LP View → Lead → Aplicação → Pesquisa → Compra
 * de uma única página, com a barra de cada etapa proporcional ao topo.
 *
 * Por que ao lado da tabela e não dentro dela: a tabela responde "quanto custou
 * e quanto voltou" (Meta API); nenhuma das colunas responde ONDE a página perde
 * gente. Esse é o buraco que a barra proporcional preenche — a queda entre duas
 * etapas fica visível antes de qualquer número ser lido.
 *
 * As duas primeiras métricas vêm da tabela (Meta API é o único lugar que tem LP
 * View e investimento); o meio do funil vem de `useLpFunnel`, que lê as
 * planilhas. Fontes diferentes de propósito, marcadas no tooltip de cada etapa.
 */

import { AlertTriangle, TrendingDown } from "lucide-react";
import type { LpFunnelRow } from "@/lib/hooks/use-sales-journey";
import { formatCurrency, formatRatio } from "@/lib/utils/lp-metrics-calculator";

/**
 * Paleta de séries do design system (`.spy-viz`, em `globals.css`). Categoria
 * nominal — a LP é identidade, não grandeza, então nada de rampa ordinal.
 *
 * Mesma convenção do gráfico de aplicações: além de 3 LPs as cores repetem, e
 * quem distingue é o rótulo, que está sempre visível no topo do card. Cor aqui é
 * reforço para amarrar card e linha quando várias ficam abertas juntas — nunca o
 * único canal.
 *
 * O dourado da marca fica de fora de propósito: é cor de chrome, e o próprio DS
 * anota que ele não alcança contraste suficiente como cor de dado.
 */
const CORES = ["var(--viz-series-1)", "var(--viz-series-2)", "var(--viz-series-3)"];

export function corDaLp(index: number): string {
  return CORES[index % CORES.length];
}

function fmtInt(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}

/** 1 casa decimal, como na referência ("21.9%"), mas em vírgula pt-BR. */
function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1).replace(".", ",")}%`;
}

interface EtapaFunil {
  label: string;
  valor: number;
  /** Explica de onde o número saiu — sem isso o time compara fontes diferentes. */
  fonte: string;
  /** Etapa que não pôde ser medida (planilha ausente), diferente de medir zero. */
  indisponivel?: boolean;
}

interface LpFunnelCardProps {
  lpName: string;
  /** Índice da LP na lista, para a cor. */
  colorIndex: number;
  /** Da tabela (Meta API). */
  lpViews: number;
  investimento: number;
  /** Do endpoint `lp-funnel`. `null` = LP sem nenhuma linha de planilha. */
  funil: LpFunnelRow | null;
  /**
   * Conversão lead → compra do conjunto de LPs, como régua. Sem ela, "11,5%" não
   * diz se a página é boa ou ruim.
   */
  refConversao: number | null;
  /** % das atribuições que vieram de herança do lead — acima de 50% avisa. */
  pctHeranca: number | null;
  /** Etapas sem planilha conectada, para marcar "não medido" em vez de zero. */
  etapasIndisponiveis?: { aplicacoes?: boolean; pesquisas?: boolean };
  isLoading?: boolean;
}

export function LpFunnelCard({
  lpName,
  colorIndex,
  lpViews,
  investimento,
  funil,
  refConversao,
  pctHeranca,
  etapasIndisponiveis,
  isLoading = false,
}: LpFunnelCardProps) {
  const cor = corDaLp(colorIndex);

  if (isLoading) {
    return (
      <div className="spy-viz space-y-2 rounded-lg border border-border/40 bg-card p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-1.5 w-full rounded bg-muted/50" />
          </div>
        ))}
      </div>
    );
  }

  const etapas: EtapaFunil[] = [
    { label: "LP View", valor: lpViews, fonte: "Landing Page Views da API do Meta" },
    {
      label: "Leads",
      valor: funil?.leads ?? 0,
      fonte: "Planilha de captação, atribuída à LP pelo utm_term",
    },
    {
      label: "Aplicaram",
      valor: funil?.aplicacoes ?? 0,
      fonte: "Planilha de aplicações (formulário), dedup por contato",
      indisponivel: etapasIndisponiveis?.aplicacoes,
    },
    {
      label: "Responderam pesquisa",
      valor: funil?.pesquisas ?? 0,
      fonte: "Pesquisas vinculadas ao funil, dedup por contato",
      indisponivel: etapasIndisponiveis?.pesquisas,
    },
    {
      label: "Compraram",
      valor: funil?.compras ?? 0,
      fonte: "Compradores únicos (e-mail) das planilhas de venda da etapa",
    },
  ];

  // A base é a primeira etapa com volume: sem Meta conectada o LP View é 0, e
  // ancorar em zero apagaria todas as barras de um funil que existe.
  const base = etapas.find((e) => e.valor > 0)?.valor ?? 0;

  const receita = funil?.receita ?? 0;
  const roas = investimento > 0 ? receita / investimento : null;
  const leads = funil?.leads ?? 0;
  const compras = funil?.compras ?? 0;
  const convLeadCompra = leads > 0 ? (compras / leads) * 100 : null;

  // Comparação com a régua só quando as duas existem — "50,0% (ref. —)" seria
  // ruído com cara de informação.
  const delta =
    convLeadCompra !== null && refConversao !== null ? convLeadCompra - refConversao : null;

  const avisoHeranca = pctHeranca !== null && pctHeranca >= 50;

  return (
    // `spy-viz` é o escopo onde os tokens de série do DS existem.
    <div className="spy-viz rounded-lg border border-border/40 bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: cor }}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{lpName}</p>
          <p className="text-[11px] leading-tight text-muted-foreground">
            {funil?.variantes.length
              ? `Inclui ${funil.variantes.join(", ")}`
              : "Funil completo desta página"}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {etapas.map((e) => {
          const pct = base > 0 ? (e.valor / base) * 100 : 0;
          return (
            <div key={e.label} title={e.fonte}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] text-foreground/90">{e.label}</span>
                <span className="shrink-0 text-[13px] tabular-nums">
                  {e.indisponivel ? (
                    <span className="text-muted-foreground">não medido</span>
                  ) : (
                    <>
                      <span className="font-medium">{fmtInt(e.valor)}</span>{" "}
                      <span className="text-[11px] text-muted-foreground">
                        ({fmtPct(base > 0 ? pct : null)})
                      </span>
                    </>
                  )}
                </span>
              </div>
              {/* Trilho sempre visível: uma barra de largura zero ainda precisa
                  ocupar a linha, senão a etapa "some" e o funil parece menor. */}
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                {!e.indisponivel && (
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(pct > 0 ? 1.5 : 0, pct))}%`,
                      background: cor,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-border/40 pt-3 text-center">
        <div>
          <p className="text-sm font-semibold tabular-nums leading-tight">
            {formatCurrency(investimento, 0)}
          </p>
          <p className="text-[10px] leading-tight text-muted-foreground">Investido</p>
        </div>
        <div>
          <p className="text-sm font-semibold tabular-nums leading-tight">
            {formatCurrency(receita, 0)}
          </p>
          <p className="text-[10px] leading-tight text-muted-foreground">Faturamento</p>
        </div>
        <div>
          {/* Neutro de propósito: cor de série identifica QUAL LP; pintar um
              número com ela sugeriria julgamento. Além disso a série 3 não
              alcança contraste de texto (o DS anota o 2,82:1). */}
          <p className="text-sm font-semibold tabular-nums leading-tight">
            {roas === null ? "—" : `${formatRatio(roas)}x`}
          </p>
          <p className="text-[10px] leading-tight text-muted-foreground">ROAS</p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
        <span className="text-[11px] text-muted-foreground">Lead → compra</span>
        <span className="flex items-baseline gap-1.5 text-[11px]">
          <span className="text-[13px] font-semibold tabular-nums">
            {fmtPct(convLeadCompra)}
          </span>
          {refConversao !== null && (
            <span className="text-muted-foreground">
              (ref. {fmtPct(refConversao)}
              {/* Aqui a cor é SEMÂNTICA (acima/abaixo da régua), não de série —
                  canal diferente do que identifica a LP, então não conflita. */}
              {delta !== null && Math.abs(delta) >= 0.05 && (
                <span className={delta > 0 ? "text-success" : "text-destructive"}>
                  {" "}
                  {delta > 0 ? "+" : "−"}
                  {Math.abs(delta).toFixed(1).replace(".", ",")}
                </span>
              )}
              )
            </span>
          )}
        </span>
      </div>

      {avisoHeranca && (
        <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-warning">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          {Math.round(pctHeranca!)}% das pessoas foram ligadas a esta LP pelo lead de captação,
          porque a linha da própria etapa não tinha utm_term.
        </p>
      )}

      {funil === null && (
        <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
          <TrendingDown className="mt-px h-3 w-3 shrink-0" />
          Nenhuma linha de planilha foi atribuída a esta LP — só há dados de tráfego.
        </p>
      )}
    </div>
  );
}
