"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import type { DailyRow } from "@/lib/utils/funnel-metrics";
import { useLeadsProjection, type ProjectedDayData } from "@/lib/hooks/use-leads-projection";
import { useUpdateFunnel } from "@/lib/hooks/use-funnels";
import { useStageLeadInputs } from "@/lib/hooks/use-stage-lead-inputs";
import type { Funnel } from "@loyola-x/shared";

interface LeadsProjectionCostBasedChartProps {
  rows: DailyRow[];
  title?: string;
  funnelId: string;
  funnel?: Funnel;
  projectId?: string;
  stageId?: string;
}

const COLORS = {
  lineReal: "#2563EB",         // Azul escuro
  lineProjection: "#60A5FA",   // Azul claro
  bandCPL: "#FEE2E2",
  meta: "#EF4444",             // Vermelho
  barsPaidReal: "#6B7280",     // Cinza mais escuro (pago real)
  barsOrgReal: "#9CA3AF",      // Cinza mais claro (orgânico real)
  barsPaidProjected: "#F9A8D4", // Rosa mais escuro (pago projetado)
  barsOrgProjected: "#FBCFE8",  // Rosa mais claro (orgânico projetado)
  cplLine: "#F97316",
  projectionText: "#F59E0B",   // Laranja para números projetados
};

const OPACITIES = {
  dailyReal: 0.85,
  dailyProjected: 0.35,
  bandCPL: 0.11,
  metaLine: 0.6,
  markerLine: 0.8,
};

// Custom label component for bar chart
const BarLabel = (props: any) => {
  const { x, y, entry } = props;
  if (!entry?.payload) return null;

  const orgReal = entry.payload.dailyRealOrg ?? 0;
  const paidReal = entry.payload.dailyRealPaid ?? 0;
  const orgProj = entry.payload.dailyProjectedOrg ?? 0;
  const paidProj = entry.payload.dailyProjectedPaid ?? 0;

  return (
    <text x={x} y={y - 8} textAnchor="middle" fontSize={8} fill="#4B5563">
      [{Math.round(orgReal)}|{Math.round(orgProj)}] [{Math.round(paidReal)}|{Math.round(paidProj)}]
    </text>
  );
};

function formatDateShort(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

interface TooltipData extends ProjectedDayData {
  date: string; // already formatted
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TooltipData }>;
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: TooltipData;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload;
  if (!data) return null;
  const isProjection = data.isProjection;

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg space-y-1 text-xs">
      <div className="font-semibold">{formatDateShort(data.date)}</div>
      <div className="border-t border-border/30 pt-1 mt-1 space-y-1">
        {isProjection ? (
          <>
            <div className="font-medium" style={{ color: "#F59E0B" }}>
              🔮 Projetado
            </div>
            <div className="text-muted-foreground">
              Pagos: {Math.round(data.dailyProjectedPaid || 0)}/dia
            </div>
            <div className="text-muted-foreground">
              Orgânicos: {Math.round(data.dailyProjectedOrg || 0)}/dia
            </div>
            <div className="text-muted-foreground">
              Acumulado: {Math.round(data.cumulative)}
            </div>
            {data.cplProjected && (
              <div className="text-muted-foreground text-xs">
                CPL: R${data.cplProjected.toFixed(2)}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="font-medium" style={{ color: "#10B981" }}>
              ✓ Real
            </div>
            <div className="text-muted-foreground">
              Pagos: {Math.round(data.dailyRealPaid || 0)}/dia
            </div>
            <div className="text-muted-foreground">
              Orgânicos: {Math.round(data.dailyRealOrg || 0)}/dia
            </div>
            <div className="text-muted-foreground">
              Acumulado: {Math.round(data.cumulative)}
            </div>
          </>
        )}
        <div className="text-muted-foreground border-t border-border/20 pt-1 mt-1">
          Meta: {Math.round(data.metaCumulative)}
        </div>
      </div>
    </div>
  );
}

export function LeadsProjectionCostBasedChart({
  rows,
  title = "Leads: Reais vs Projeção (Baseado em Custo)",
  funnelId,
  funnel,
  projectId,
  stageId,
}: LeadsProjectionCostBasedChartProps) {
  const [mounted, setMounted] = useState(false);

  // Story 18.27: Se stageId fornecido, usar inputs de etapa
  const usingStageInputs = !!stageId;
  const { getInputs: getStageInputs, saveInputs: saveStageInputs, updateLocal: updateStageLocal } =
    useStageLeadInputs(funnelId);

  // Story 18.19 fix: persistir no DB quando funnel+projectId disponíveis
  const usingDb = !!funnel && !!projectId && !usingStageInputs;
  const updateFunnel = useUpdateFunnel(projectId ?? "", funnelId);
  const storageKeyDataFinal = `leadsCostProjectionDataFinal_${funnelId}`;
  const storageKeyMetaTotal = `leadsCostProjectionMetaTotal_${funnelId}`;
  const storageKeyGastoTotal = `leadsCostProjectionGastoTotal_${funnelId}`;

  // Get initial values from storage/DB/stage inputs
  const [initialDataFinal, setInitialDataFinal] = useState<string>("");
  const [initialMetaTotal, setInitialMetaTotal] = useState<number>(0);
  const [initialGastoTotal, setInitialGastoTotal] = useState<number>(0);

  useEffect(() => {
    setMounted(true);

    if (usingStageInputs && stageId) {
      // Priority 1: Stage inputs (isolated per etapa)
      const stageInputs = getStageInputs(stageId);
      setInitialDataFinal(stageInputs.projectionEndDate || getDefaultDataFinal());
      setInitialMetaTotal(stageInputs.leadGoal ?? 0);
      setInitialGastoTotal(stageInputs.gastoTotal ?? 0);
      return;
    }
    if (usingDb && funnel) {
      // Priority 2: DB storage (funnel-level)
      setInitialDataFinal(funnel.leadsGoalDataFinal || getDefaultDataFinal());
      setInitialMetaTotal(funnel.leadsGoalMeta ?? 0);
      // Note: leadsGoalGastoTotal support depends on schema; fallback to localStorage if not available
      if ('leadsGoalGastoTotal' in funnel) {
        setInitialGastoTotal((funnel as any).leadsGoalGastoTotal ?? 0);
      } else if (typeof window !== "undefined") {
        const savedGastoTotal = localStorage.getItem(storageKeyGastoTotal);
        setInitialGastoTotal(savedGastoTotal ? parseFloat(savedGastoTotal) : 0);
      }
      return;
    }
    // Priority 3: localStorage fallback
    if (typeof window !== "undefined") {
      const savedDataFinal = localStorage.getItem(storageKeyDataFinal);
      const savedMetaTotal = localStorage.getItem(storageKeyMetaTotal);
      const savedGastoTotal = localStorage.getItem(storageKeyGastoTotal);
      setInitialDataFinal(savedDataFinal || getDefaultDataFinal());
      setInitialMetaTotal(savedMetaTotal ? parseFloat(savedMetaTotal) : 0);
      setInitialGastoTotal(savedGastoTotal ? parseFloat(savedGastoTotal) : 0);
    }
  }, [usingStageInputs, stageId, usingDb, funnel, getStageInputs]);

  // Use cost-based projection hook
  const {
    dataFinal,
    setDataFinal,
    metaTotal,
    setMetaTotal,
    gastoTotalProjetado,
    setGastoTotalProjetado,
    chartData: projectionData,
    projectionPercentage,
    error,
  } = useLeadsProjection(rows, initialDataFinal, initialMetaTotal, initialGastoTotal);

  // Format chart data for recharts
  const chartData = projectionData.map((item) => ({
    ...item,
    date: formatDateShort(item.date),
  }));

  const handleDataFinalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDataFinal(value);
    if (usingStageInputs && stageId) {
      updateStageLocal(stageId, { projectionEndDate: value });
      saveStageInputs(stageId, { projectionEndDate: value, leadGoal: metaTotal });
    } else if (usingDb) {
      updateFunnel.mutate({ leadsGoalDataFinal: value || null });
    } else {
      localStorage.setItem(storageKeyDataFinal, value);
    }
  };

  const handleMetaTotalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10) || 0;
    setMetaTotal(value);
    if (usingStageInputs && stageId) {
      updateStageLocal(stageId, { leadGoal: value });
      saveStageInputs(stageId, { projectionEndDate: dataFinal, leadGoal: value });
    } else if (usingDb) {
      updateFunnel.mutate({ leadsGoalMeta: value });
    } else {
      localStorage.setItem(storageKeyMetaTotal, value.toString());
    }
  };

  const handleGastoTotalProjetadoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    setGastoTotalProjetado(value);
    // Persist to stage inputs > DB > localStorage (same hierarchy as other fields)
    if (usingStageInputs && stageId) {
      // Stage inputs storage — isolated per etapa
      updateStageLocal(stageId, { gastoTotal: value });
      saveStageInputs(stageId, { projectionEndDate: dataFinal, leadGoal: metaTotal, gastoTotal: value });
    } else if (usingDb) {
      // DB storage — funnel-level
      updateFunnel.mutate({ leadsGoalGastoTotal: value });
    } else {
      // localStorage fallback
      localStorage.setItem(storageKeyGastoTotal, value.toString());
    }
  };

  if (!mounted) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {projectionPercentage > 0 && (
          <div className="text-xs">
            <span className={projectionPercentage >= 100 ? "text-green-600" : "text-amber-600"}>
              Projeção: {Math.round(projectionPercentage)}% da meta
            </span>
          </div>
        )}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <label htmlFor="data-final" className="block text-xs font-medium text-muted-foreground">
            Data Final
          </label>
          <input
            id="data-final"
            type="date"
            value={dataFinal}
            onChange={handleDataFinalChange}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="meta-total" className="block text-xs font-medium text-muted-foreground">
            Meta Total de Leads
          </label>
          <input
            id="meta-total"
            type="number"
            value={metaTotal}
            onChange={handleMetaTotalChange}
            placeholder="0"
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="gasto-total" className="block text-xs font-medium text-muted-foreground">
            Gasto Total Projetado (R$)
          </label>
          <div className="space-y-1">
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">R$</span>
              <input
                id="gasto-total"
                type="number"
                value={gastoTotalProjetado}
                onChange={handleGastoTotalProjetadoChange}
                placeholder="0"
                className="w-full pl-7 pr-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
            {/* Valor Restante = Gasto Total Projetado - gasto acumulado */}
            {(() => {
              // Get accumulated spend from rows
              let gastoAccum = 0;
              rows.forEach((row) => {
                gastoAccum += row.spend ?? 0;
              });
              const valorRestante = gastoTotalProjetado - gastoAccum;

              // Calculate pacing projetado = remaining budget / remaining days
              const dataFinalDate = new Date(dataFinal);
              const hoje = new Date();
              const diasRestantes = Math.max(1, Math.ceil((dataFinalDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)));
              const pacingProjetado = diasRestantes > 0 ? valorRestante / diasRestantes : 0;

              return (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>
                    Restante: R$ {valorRestante.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div>
                    Pacing projetado: R$ {pacingProjetado.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/dia
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && <div className="text-xs text-red-600 p-2 bg-red-50 rounded">{error}</div>}

      {/* Chart */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData} margin={{ top: 20, right: 120, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />

            {/* Primary Y-axis: Leads */}
            <YAxis
              tick={{ fontSize: 11 }}
              domain={[0, "auto"]}
              allowDecimals={false}
              allowDataOverflow={false}
            />

            {/* Secondary Y-axis: CPL */}
            <YAxis
              yAxisId="right"
              tick={{ fontSize: 11 }}
              domain={[0, "auto"]}
              label={{ value: "CPL (R$)", angle: 90, position: "insideRight", offset: -10 }}
              orientation="right"
            />

            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />

            {/* Stacked bars: Real Paid + Real Organic */}
            <Bar
              dataKey="dailyRealPaid"
              fill={COLORS.barsPaidReal}
              opacity={OPACITIES.dailyReal}
              name="Leads Pagos Reais (Dia)"
              radius={[2, 2, 0, 0]}
              stackId="realDaily"
            />
            <Bar
              dataKey="dailyRealOrg"
              fill={COLORS.barsOrgReal}
              opacity={OPACITIES.dailyReal}
              name="Leads Orgânicos Reais (Dia)"
              radius={[2, 2, 0, 0]}
              stackId="realDaily"
              label={<BarLabel />}
            />

            {/* Stacked bars: Projected Paid + Projected Organic */}
            <Bar
              dataKey="dailyProjectedPaid"
              fill={COLORS.barsPaidProjected}
              opacity={0.7}
              name="Leads Pagos Projetados (Dia)"
              radius={[2, 2, 0, 0]}
              stackId="projectedDaily"
            />
            <Bar
              dataKey="dailyProjectedOrg"
              fill={COLORS.barsOrgProjected}
              opacity={0.7}
              name="Leads Orgânicos Projetados (Dia)"
              radius={[2, 2, 0, 0]}
              stackId="projectedDaily"
            />

            {/* Banda de Confiança do CPL (área) */}
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="cplProjectedUpper"
              fill={COLORS.bandCPL}
              stroke="none"
              fillOpacity={OPACITIES.bandCPL}
              isAnimationActive={false}
              legendType="none"
              name="Banda CPL"
            />

            {/* Linha Real: Acumulado */}
            <Line
              type="monotone"
              dataKey="cumulativeReal"
              stroke={COLORS.lineReal}
              strokeWidth={2.5}
              dot={(props: DotProps) => {
                const { cx, cy, payload } = props;
                if (!payload || payload.isProjection || cx === undefined || cy === undefined)
                  return null;
                return (
                  <g key={`dot-real-${payload.date}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill={COLORS.lineReal}
                      stroke="white"
                      strokeWidth={1}
                    />
                    <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill={COLORS.lineReal} fontWeight="600">
                      {Math.round(payload.cumulative)}
                    </text>
                    {payload.realPercentage > 0 && (
                      <text x={cx} y={cy + 26} textAnchor="middle" fontSize={9} fill={COLORS.lineReal} fontWeight="500">
                        ({Math.round(payload.realPercentage)}%)
                      </text>
                    )}
                  </g>
                );
              }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
              name="Real (Acumulado)"
            />

            {/* Linha Projeção: Acumulado */}
            <Line
              type="monotone"
              dataKey="cumulativeProjected"
              stroke={COLORS.lineProjection}
              strokeWidth={2.5}
              strokeDasharray="5 5"
              dot={(props: DotProps) => {
                const { cx, cy, payload } = props;
                if (!payload || !payload.isProjection || cx === undefined || cy === undefined)
                  return null;
                return (
                  <g key={`dot-proj-${payload.date}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill={COLORS.lineProjection}
                      stroke="white"
                      strokeWidth={1}
                    />
                    <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill={COLORS.projectionText} fontWeight="600">
                      {Math.round(payload.cumulative)}
                    </text>
                    {payload.realPercentage > 0 && (
                      <text x={cx} y={cy + 26} textAnchor="middle" fontSize={9} fill={COLORS.projectionText} fontWeight="500">
                        ({Math.round(payload.realPercentage)}%)
                      </text>
                    )}
                  </g>
                );
              }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
              name="Projeção (Acumulado)"
            />

            {/* Linha CPL Projetado (eixo secundário) — Tooltip only, no visible labels */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cplProjected"
              stroke={COLORS.cplLine}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              name="CPL Projetado"
            />

            {/* Linha Meta: Acumulada */}
            <Line
              type="monotone"
              dataKey="metaCumulative"
              stroke={COLORS.meta}
              strokeWidth={2.5}
              strokeDasharray="5 5"
              dot={(props: DotProps) => {
                const { cx, cy, payload } = props;
                if (!payload || cx === undefined || cy === undefined) return null;
                return (
                  <g key={`meta-dot-${payload.date}`}>
                    <circle cx={cx} cy={cy} r={2.5} fill={COLORS.meta} stroke="white" strokeWidth={1} />
                    <text x={cx} y={cy - 12} textAnchor="middle" fontSize={8} fill={COLORS.meta} fontWeight="600">
                      {Math.round(payload.metaCumulative)}
                    </text>
                  </g>
                );
              }}
              isAnimationActive={false}
              name="Meta Acumulada"
            />

            {/* Marcador "Hoje" */}
            {chartData.length > 0 && chartData[0].isProjection === false && (
              <ReferenceLine
                x={chartData.find((p) => p.isProjection)?.date}
                stroke="#999999"
                opacity={0.5}
                label={{ value: "Hoje", position: "top", fontSize: 10, fill: "#999999" }}
                strokeDasharray="3 3"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[400px] text-muted-foreground">
          Nenhum dado disponível
        </div>
      )}
    </div>
  );
}

function getDefaultDataFinal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 20);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
