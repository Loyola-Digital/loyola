"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { InsightEntry, InstagramMedia } from "@/lib/hooks/use-instagram";
import { Dica } from "@/components/instagram/dica";
import {
  NOME_DO_FORMATO,
  diasDePico,
  formatoDoPost,
  postsDoPico,
} from "@/lib/utils/instagram-posts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FormulaChartTooltip } from "@/components/metrics/formula-chart-tooltip";
import type { MetricFormula } from "@/lib/types/metric-formula";
import { buildDailyPointFormula } from "@/lib/formulas/instagram";

interface ReachChartProps {
  data?: InsightEntry[];
  isLoading: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Posts da conta — o clique num ponto mostra os que podem ter puxado o dia. */
  posts?: InstagramMedia[];
}

interface ChartPoint {
  date: string;
  /** `end_time` cru da Meta: o FIM da janela do dia. */
  fim: string;
  reach: number;
  impressions: number;
  engaged: number;
  formulasByKey: Record<string, MetricFormula>;
}

// Only match entries that have a time series values array (skip total_value metrics)
function hasTimeSeries(e: InsightEntry): boolean {
  return Array.isArray(e.values) && e.values.length > 0;
}

function buildChartData(entries: InsightEntry[]): ChartPoint[] {
  const reachEntry = entries.find((e) => e.name === "reach" && hasTimeSeries(e));
  const impressionsEntry = entries.find(
    (e) => ["impressions", "views", "profile_views"].includes(e.name) && hasTimeSeries(e),
  );
  // accounts_engaged may be total_value only (no time series) — skip if so
  const engagedEntry = entries.find((e) => e.name === "accounts_engaged" && hasTimeSeries(e));

  if (!reachEntry) return [];

  return reachEntry.values.map((v, i) => {
    const dateLabel = v.end_time ? format(parseISO(v.end_time), "dd/MM", { locale: ptBR }) : String(i);
    const reach = typeof v.value === "number" ? v.value : 0;
    const impressionsRaw = impressionsEntry?.values[i]?.value;
    const impressions = typeof impressionsRaw === "number" ? impressionsRaw : 0;
    const impressionsField = impressionsEntry?.name ?? "impressions";
    const engagedRaw = engagedEntry?.values[i]?.value;
    const engaged = typeof engagedRaw === "number" ? engagedRaw : 0;

    const formulasByKey: Record<string, MetricFormula> = {
      reach: buildDailyPointFormula("Alcance", "reach", reach, dateLabel),
    };
    if (impressions > 0) {
      formulasByKey.impressions = buildDailyPointFormula(
        "Impressões",
        impressionsField,
        impressions,
        dateLabel,
      );
    }
    if (engaged > 0) {
      formulasByKey.engaged = buildDailyPointFormula(
        "Engajamento",
        "accounts_engaged",
        engaged,
        dateLabel,
      );
    }

    return { date: dateLabel, fim: v.end_time ?? "", reach, impressions, engaged, formulasByKey };
  });
}

function formatNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function ReachChart({ data, isLoading, error, onRefresh, isRefreshing, posts }: ReachChartProps) {
  const chartData = useMemo(() => (data ? buildChartData(data) : []), [data]);
  const hasImpressions = chartData.some((p) => p.impressions > 0);
  const hasEngaged = chartData.some((p) => p.engaged > 0);
  const picos = useMemo(() => diasDePico(chartData), [chartData]);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const ponto = selecionado != null ? chartData[selecionado] ?? null : null;
  const doPico = useMemo(
    () => (ponto && posts ? postsDoPico(posts, ponto.fim) : []),
    [ponto, posts],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Alcance Diario</CardTitle>
          <Dica>
            {`Alcance do perfil dia a dia.

Clique em qualquer ponto para ver quais posts podem ter gerado aquele resultado. Os 3 dias de maior alcance ficam marcados com uma bolinha.

A Meta não diz de qual post veio o alcance do dia. O palpite são os posts publicados nas 72 horas até aquele dia (um Reels continua sendo entregue nos dias seguintes), do maior alcance para o menor.`}
          </Dica>
        </div>
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : error ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-destructive text-center px-4">
            {error.message}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[400px]">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart
                  data={chartData}
                  margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                  onClick={(e) => {
                    const bruto = e?.activeTooltipIndex;
                    const i = typeof bruto === "number" ? bruto : bruto ? Number(bruto) : NaN;
                    if (!Number.isNaN(i)) setSelecionado(i === selecionado ? null : i);
                  }}
                  className="cursor-pointer"
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#fff" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#fff" }} width={45} tickFormatter={formatNumber} />
                  <Tooltip content={<FormulaChartTooltip />} />
                  <Legend wrapperStyle={{ color: "#fff" }} />
                  <Line
                    type="monotone"
                    dataKey="reach"
                    name="Alcance"
                    stroke="#d4a843"
                    strokeWidth={2}
                    // Picos e o dia clicado ganham bolinha; o resto fica limpo.
                    dot={(props: { cx?: number; cy?: number; index?: number }) => {
                      const { cx, cy, index } = props;
                      const marcar = index != null && (picos.has(index) || index === selecionado);
                      if (!marcar || cx == null || cy == null) return <g key={`d-${index}`} />;
                      return (
                        <circle
                          key={`d-${index}`}
                          cx={cx}
                          cy={cy}
                          r={index === selecionado ? 5 : 3.5}
                          fill={index === selecionado ? "#fff" : "#d4a843"}
                          stroke="#d4a843"
                          strokeWidth={2}
                        />
                      );
                    }}
                  />
                  {hasImpressions && (
                    <Line type="monotone" dataKey="impressions" name="Impressões" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  )}
                  {hasEngaged && (
                    <Line type="monotone" dataKey="engaged" name="Engajamento" stroke="#34d399" strokeWidth={2} dot={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {ponto ? (
              <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[13px]">
                    <span className="font-semibold">{ponto.date}</span> · alcance{" "}
                    <span className="tabular-nums">{ponto.reach.toLocaleString("pt-BR")}</span>
                    <span className="text-muted-foreground"> — posts publicados nas 72h até este dia</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelecionado(null)}
                    aria-label="Fechar"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {doPico.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">
                    Nenhum post publicado nesses dias — o alcance veio de posts mais antigos, stories ou do perfil.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {doPico.map((p) => {
                      const thumb = p.thumbnail_url ?? p.media_url;
                      return (
                        <li key={p.id} className="flex items-center gap-2 text-[12px]">
                          {thumb ? (
                            <img src={thumb} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                          ) : (
                            <div className="h-8 w-8 shrink-0 rounded bg-muted" />
                          )}
                          <span className="w-16 shrink-0 text-muted-foreground">{NOME_DO_FORMATO[formatoDoPost(p)]}</span>
                          <span className="min-w-0 flex-1 truncate">{p.caption ?? "—"}</span>
                          <span className="shrink-0 tabular-nums">
                            {(p.reach ?? 0).toLocaleString("pt-BR")} alcance
                          </span>
                          {p.permalink && (
                            <a
                              href={p.permalink}
                              target="_blank"
                              rel="noreferrer noopener"
                              aria-label="Abrir no Instagram"
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Clique num ponto do gráfico para ver os posts que puxaram aquele dia.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
