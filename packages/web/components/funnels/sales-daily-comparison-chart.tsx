"use client";

/**
 * Vendas do produto principal por dia — lançamento atual vs. anterior, em D-day.
 *
 * Mesma gramática do gráfico de aplicações da Captação Paga, de propósito: é a
 * mesma pergunta ("estamos à frente ou atrás na mesma altura?") e o time não
 * deveria ter que reaprender a ler o gráfico só porque mudou de etapa.
 *
 * Duas séries, um eixo. Elas têm a MESMA unidade (vendas) e o mesmo índice (dia
 * relativo), então dividem escala honestamente — eixo duplo aqui inventaria
 * correlação.
 */

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, FileSpreadsheet, Info } from "lucide-react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useSalesDailyComparison, type SalesDay } from "@/lib/hooks/use-sales-journey";

const SERIE_ATUAL = "var(--viz-series-1)";
const SERIE_ANTERIOR = "var(--viz-series-2)";

const nf = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));

function fmtDate(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

interface Ponto {
  dia: string;
  atual: number | null;
  anterior: number | null;
  dataAtual: string | null;
  dataAnterior: string | null;
}

/** Junta as duas séries pelo D-day. Falta de dado vira null (a linha corta). */
function merge(atual: SalesDay[], anterior: SalesDay[] | undefined, modo: "diario" | "acumulado"): Ponto[] {
  const campo = modo === "diario" ? "vendas" : "acumulado";
  const maxDia = Math.max(atual.length, anterior?.length ?? 0);
  const out: Ponto[] = [];
  for (let i = 1; i <= maxDia; i++) {
    const a = atual.find((p) => p.dia === i);
    const b = anterior?.find((p) => p.dia === i);
    out.push({
      dia: `D${i}`,
      // null e não 0: o lançamento atual ainda não chegou no D30, e desenhar
      // zero ali diria "vendemos zero", que é falso.
      atual: a ? a[campo] : null,
      anterior: b ? b[campo] : null,
      dataAtual: a?.date ?? null,
      dataAnterior: b?.date ?? null,
    });
  }
  return out;
}

export function SalesDailyComparisonChart({
  projectId, funnelId, stageId,
}: { projectId: string; funnelId: string; stageId: string }) {
  const { data, isLoading } = useSalesDailyComparison(projectId, funnelId, stageId);
  const [modo, setModo] = useState<"diario" | "acumulado">("acumulado");
  const [showTable, setShowTable] = useState(false);

  if (isLoading) return <Skeleton className="h-[340px] rounded-xl" />;
  if (!data) return null;

  if (data.semPlanilha) {
    return (
      <div className="spy-viz rounded-xl border border-dashed border-border/40 bg-card p-6 text-center">
        <FileSpreadsheet className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Vendas por dia</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Vincule a planilha do <strong>Produto Principal</strong> na aba Planilha, com a coluna de
          data da venda mapeada. O gráfico compara o volume dia a dia com o lançamento anterior.
        </p>
      </div>
    );
  }

  const pontos = merge(data.points, data.comparacao?.points, modo);
  const temComparacao = !!data.comparacao && data.comparacao.points.length > 0;
  const delta = data.deltaPercent;
  const DeltaIcon = delta == null ? Minus : delta >= 0 ? TrendingUp : TrendingDown;
  const deltaCor =
    delta == null
      ? "text-muted-foreground"
      : delta >= 0
        ? "text-emerald-600 dark:text-emerald-500"
        : "text-red-500";

  return (
    <div className="spy-viz rounded-xl border border-border/40 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Vendas por dia — produto principal</h3>
          <p className="text-[11px] text-muted-foreground">
            Alinhado por dia de lançamento — D1 é o primeiro dia com venda de cada um
          </p>
        </div>

        <div className="inline-flex rounded-md border border-border/50 p-0.5 text-xs">
          {([
            ["acumulado", "Acumulado"],
            ["diario", "Por dia"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setModo(k)}
              className={`rounded px-2.5 py-1 transition-colors ${
                modo === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-5">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Vendas</p>
          <p className="text-2xl font-semibold leading-none">{nf(data.total)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {data.points.length} dia{data.points.length !== 1 ? "s" : ""} de venda
          </p>
        </div>

        {temComparacao && (
          <>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                No mesmo D{data.points.length}
              </p>
              <p className={`flex items-center gap-1 text-2xl font-semibold leading-none ${deltaCor}`}>
                <DeltaIcon className="h-4 w-4" />
                {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">vs. {data.comparacao?.funnelName}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Anterior (total)
              </p>
              <p className="text-2xl font-semibold leading-none text-muted-foreground">
                {nf(data.comparacao?.total)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                em {data.comparacao?.points.length} dias
              </p>
            </div>
          </>
        )}
      </div>

      {data.semData > 0 && (
        <p className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-500">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          {data.semData} venda{data.semData !== 1 ? "s" : ""} sem data válida na planilha ficaram fora
          da série. Elas contam no faturamento, mas não dá pra posicionar no D-day.
        </p>
      )}

      {data.comparacao?.semPlanilha && (
        <p className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-500">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          O lançamento de comparação ({data.comparacao.funnelName}) não tem planilha de produto
          principal vinculada — só a série atual aparece.
        </p>
      )}

      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-axis)" }}
              interval={pontos.length > 20 ? Math.floor(pontos.length / 12) : 0}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-axis)" }}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload as Ponto | undefined;
                if (!p) return null;
                return (
                  <div className="min-w-[190px] rounded-lg border border-border/60 bg-popover px-2.5 py-2 shadow-lg">
                    <p className="mb-1.5 border-b border-border/40 pb-1 text-[11px] font-medium text-muted-foreground">
                      Dia {String(label).replace("D", "")} do lançamento
                    </p>
                    <div className="space-y-1.5">
                      <div>
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: SERIE_ATUAL }} />
                            {data.funnelName}
                          </span>
                          <span className="text-sm font-semibold tabular-nums">{nf(p.atual)}</span>
                        </div>
                        {p.dataAtual && (
                          <p className="pl-[18px] text-[10px] text-muted-foreground">{fmtDate(p.dataAtual)}</p>
                        )}
                      </div>
                      {temComparacao && (
                        <div>
                          <div className="flex items-baseline justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: SERIE_ANTERIOR }} />
                              {data.comparacao?.funnelName}
                            </span>
                            <span className="text-sm font-semibold tabular-nums">{nf(p.anterior)}</span>
                          </div>
                          {p.dataAnterior && (
                            <p className="pl-[18px] text-[10px] text-muted-foreground">{fmtDate(p.dataAnterior)}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            />
            {temComparacao && (
              <Legend
                verticalAlign="top"
                height={26}
                iconType="plainline"
                wrapperStyle={{ fontSize: 11, color: "var(--color-muted-foreground)" }}
              />
            )}
            <Line
              name={data.funnelName}
              type="monotone"
              dataKey="atual"
              stroke={SERIE_ATUAL}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2 }}
              connectNulls={false}
            />
            {temComparacao && (
              <Line
                name={data.comparacao?.funnelName}
                type="monotone"
                dataKey="anterior"
                stroke={SERIE_ANTERIOR}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2 }}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        className="mt-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {showTable ? "Ocultar" : "Ver"} dados em tabela
      </button>
      {showTable && (
        <div className="mt-2 max-h-[300px] overflow-auto rounded-lg border border-border/40">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 backdrop-blur">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Dia</th>
                <th className="px-2 py-1.5 text-left font-medium">Data</th>
                <th className="px-2 py-1.5 text-right font-medium">{data.funnelName}</th>
                {temComparacao && (
                  <th className="px-2 py-1.5 text-right font-medium">{data.comparacao?.funnelName}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {pontos.map((p) => (
                <tr key={p.dia} className="border-t border-border/30">
                  <td className="px-2 py-1.5">{p.dia}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {p.dataAtual ? fmtDate(p.dataAtual) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{nf(p.atual)}</td>
                  {temComparacao && (
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {nf(p.anterior)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
