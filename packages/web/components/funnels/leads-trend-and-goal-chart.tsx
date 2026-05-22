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
import { expandChartDataV2, type ChartDataPoint, calculateProjectionPercentage } from "@/lib/utils/lead-trend-calculations";

interface LeadsTrendAndGoalChartProps {
  rows: DailyRow[];
  title?: string;
}

const COLORS = {
  lineReal: "#2563EB", // Azul escuro para real
  lineProjection: "#60A5FA", // Azul claro para projeção
  band: "#BFDBFE", // Azul muito claro para banda
  meta: "#EF4444", // Vermelho para meta
  bandFill: "#BFDBFE",
  bars: "#A0A0A0", // Cinza para barras (segundo plano)
  projectionText: "#F59E0B", // Laranja para números projetados
};

const OPACITIES = {
  dailyReal: 0.85,
  dailyProjected: 0.35,
  bandFill: 0.11, // 25% mais transparente que 0.15
  metaLine: 0.6,
  markerLine: 0.8,
};

function formatDateShort(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: ChartDataPoint;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  const isProjection = data.isProjection;

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg space-y-1 text-xs">
      <div className="font-semibold">{formatDateShort(data.date)}</div>
      <div className="border-t border-border/30 pt-1 mt-1 space-y-1">
        {isProjection ? (
          <>
            <div className="font-medium" style={{ color: "#F59E0B" }}>🔮 Projetado</div>
            <div className="text-muted-foreground">
              Acumulado: {Math.round(data.cumulative)}
            </div>
            <div className="text-muted-foreground">
              Barra: {Math.round(data.dailyProjected || 0)}/dia
            </div>
            {data.bandUpper && (
              <div className="text-muted-foreground text-xs">
                Banda: ±{Math.round((data.bandUpper - data.cumulative) * 100) / 100}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="font-medium" style={{ color: "#10B981" }}>✓ Real</div>
            <div className="text-muted-foreground">
              Acumulado: {Math.round(data.cumulative)}
            </div>
            <div className="text-muted-foreground">
              Barra: {Math.round(data.dailyReal || 0)}/dia
            </div>
          </>
        )}
        <div className="text-muted-foreground border-t border-border/20 pt-1 mt-1">
          Meta: {Math.round(data.meta)}
        </div>
      </div>
    </div>
  );
}

export function LeadsTrendAndGoalChart({ rows, title = "Leads: Reais vs Projeção vs Meta" }: LeadsTrendAndGoalChartProps) {
  const [dataFinal, setDataFinal] = useState<string>("");
  const [metaTotal, setMetaTotal] = useState<number>(0);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [projectionPercentage, setProjectionPercentage] = useState<number>(0);
  const [mounted, setMounted] = useState(false);
  const windowSize = 5; // Fixado em 5 dias

  // Carregar localStorage ao montar
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const savedDataFinal = localStorage.getItem("leadsTrendDataFinal");
      const savedMetaTotal = localStorage.getItem("leadsTrendMetaTotal");

      if (savedDataFinal) {
        setDataFinal(savedDataFinal);
      } else {
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 20);
        const defaultDateStr = defaultDate.toISOString().split("T")[0];
        setDataFinal(defaultDateStr);
      }

      if (savedMetaTotal) {
        setMetaTotal(parseFloat(savedMetaTotal));
      }
    }
  }, []);

  // Calcular dados do gráfico quando inputs mudam
  useEffect(() => {
    if (!dataFinal || rows.length === 0 || !mounted) return;

    try {
      const start = performance.now();
      const expanded = expandChartDataV2(rows, dataFinal, metaTotal, windowSize);
      const end = performance.now();
      console.log(`[18.19] Cálculo completado em ${Math.round(end - start)}ms`);

      const formatted = expanded.map((item) => ({
        ...item,
        date: formatDateShort(item.date),
      }));
      setChartData(formatted);

      const percentage = calculateProjectionPercentage(expanded);
      setProjectionPercentage(percentage);
    } catch (error) {
      console.error("Erro ao calcular dados do gráfico:", error);
    }
  }, [rows, dataFinal, metaTotal, mounted]);

  // Persistir inputs no localStorage
  const handleDataFinalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDataFinal(value);
    localStorage.setItem("leadsTrendDataFinal", value);
  };

  const handleMetaTotalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10) || 0;
    setMetaTotal(value);
    localStorage.setItem("leadsTrendMetaTotal", value.toString());
  };

  if (!mounted) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
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
      <div className="grid grid-cols-2 gap-4">
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
            Meta Total
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
      </div>

      {/* Gráfico */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={chartData} margin={{ top: 20, right: 80, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              domain={[0, "auto"]}
              allowDecimals={false}
              allowDataOverflow={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />

            {/* Barras diárias: Real */}
            <Bar
              dataKey="dailyReal"
              fill={COLORS.bars}
              opacity={OPACITIES.dailyReal}
              name="Leads Reais (Dia)"
              radius={[2, 2, 0, 0]}
              label={{ position: "top", fontSize: 9, formatter: (value: unknown) => (typeof value === 'number' ? Math.round(value) : "") }}
            />

            {/* Barras diárias: Projeção */}
            <Bar
              dataKey="dailyProjected"
              fill={COLORS.bars}
              opacity={OPACITIES.dailyProjected}
              name="Leads Projetados (Dia)"
              radius={[2, 2, 0, 0]}
              label={{ position: "top", fontSize: 9, formatter: (value: unknown) => (typeof value === 'number' ? Math.round(value) : "") }}
            />

            {/* Banda de Confiança (translúcida) */}
            <Area
              type="monotone"
              dataKey="bandUpper"
              fill={COLORS.band}
              stroke="none"
              fillOpacity={OPACITIES.bandFill}
              isAnimationActive={false}
              legendType="none"
              name="Banda de Confiança"
            />

            {/* Linha Real: Sólida Azul Escuro */}
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke={COLORS.lineReal}
              strokeWidth={2.5}
              dot={(props: DotProps) => {
                const { cx, cy, payload } = props;
                if (!payload || payload.isProjection || cx === undefined || cy === undefined) return null;
                return (
                  <g key={`dot-${payload.date}`}>
                    <circle cx={cx} cy={cy} r={3} fill={COLORS.lineReal} stroke="white" strokeWidth={1} />
                    <text x={cx} y={cy - 12} textAnchor="middle" fontSize={11} fill={COLORS.lineReal} fontWeight="600">
                      {Math.round(payload.cumulative)}
                    </text>
                  </g>
                );
              }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
              name="Real"
            />

            {/* Linha Projeção: Tracejada Azul Claro */}
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke={COLORS.lineProjection}
              strokeWidth={2.5}
              strokeDasharray="5 5"
              dot={(props: DotProps) => {
                const { cx, cy, payload } = props;
                if (!payload || !payload.isProjection || cx === undefined || cy === undefined) return null;
                return (
                  <g key={`dot-${payload.date}`}>
                    <circle cx={cx} cy={cy} r={3} fill={COLORS.lineProjection} stroke="white" strokeWidth={1} />
                    <text x={cx} y={cy - 12} textAnchor="middle" fontSize={11} fill={COLORS.projectionText} fontWeight="600">
                      {Math.round(payload.cumulative)}
                    </text>
                  </g>
                );
              }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
              name="Projeção"
            />

            {/* Meta: Linha Acumulada */}
            <Line
              type="monotone"
              dataKey="meta"
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
                      {Math.round(payload.meta)}
                    </text>
                  </g>
                );
              }}
              isAnimationActive={false}
              name="Meta Acumulada"
            />

            {/* Marcador "Hoje" (primeiro ponto projetado) */}
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
        <div className="flex items-center justify-center h-[360px] text-muted-foreground">
          Nenhum dado disponível
        </div>
      )}
    </div>
  );
}
