"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { DailyRow } from "@/lib/utils/funnel-metrics";
import { expandChartData } from "@/lib/utils/lead-trend-calculations";

interface LeadsTrendAndGoalChartProps {
  rows: DailyRow[];
  title?: string;
}

const COLORS = {
  reais: "hsl(220 80% 55%)",
  tendencia: "#CCCCCC",
  tendenciaStroke: "#999999",
  meta: "#FF8A8A",
  metaStroke: "#FF6B6B",
};

function formatDateShort(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Record<string, number> }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg space-y-1 text-xs">
      <div className="font-semibold">{data.date}</div>
      <div className="border-t border-border/30 pt-1 mt-1">
        {data.leadsReais > 0 && (
          <div className="text-muted-foreground">Leads Reais: {Math.round(data.leadsReais)}</div>
        )}
        {data.tendencia > 0 && (
          <div className="text-muted-foreground">Tendência: {Math.round(data.tendencia)}</div>
        )}
        {data.meta > 0 && (
          <div className="text-muted-foreground">Meta: {Math.round(data.meta)}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Wrapper que estende LeadsCumulativeChart com gráfico de tendência e meta.
 * - Inputs: Data Final do Lançamento, Meta Total de Leads
 * - Calcula: Tendência (cinza pontilhada), Meta (vermelho cumulativo)
 * - Renderiza: 3 áreas sobrepostas (Reais, Tendência, Meta)
 */
export function LeadsTrendAndGoalChart({ rows, title = "Leads: Reais vs Tendência vs Meta" }: LeadsTrendAndGoalChartProps) {
  const [dataFinal, setDataFinal] = useState<string>("");
  const [metaTotal, setMetaTotal] = useState<number>(0);
  const [chartData, setChartData] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  // Carregar localStorage ao montar
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const savedDataFinal = localStorage.getItem("leadsTrendDataFinal");
      const savedMetaTotal = localStorage.getItem("leadsTrendMetaTotal");

      if (savedDataFinal) {
        setDataFinal(savedDataFinal);
      } else {
        // Padrão: +20 dias a partir de hoje
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
      const expanded = expandChartData(rows, dataFinal, metaTotal);
      const formatted = expanded.map((item) => ({
        ...item,
        date: formatDateShort(item.date),
      }));
      setChartData(formatted);
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
      <h3 className="text-sm font-semibold">{title}</h3>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="data-final" className="block text-xs font-medium text-muted-foreground">
            Data Final do Lançamento
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
      </div>

      {/* Gráfico */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={chartData} margin={{ top: 20, right: 30, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              domain={[0, "auto"]}
              allowDecimals={false}
              allowDataOverflow={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />

            {/* Área de Leads Reais (azul) */}
            <Area
              type="monotone"
              dataKey="leadsReais"
              fill={COLORS.reais}
              fillOpacity={0.2}
              stroke={COLORS.reais}
              strokeWidth={2}
              name="Leads Reais"
              dot={false}
            />

            {/* Área de Tendência (cinza pontilhada) */}
            <Area
              type="monotone"
              dataKey="tendencia"
              fill={COLORS.tendencia}
              fillOpacity={0.15}
              stroke={COLORS.tendenciaStroke}
              strokeWidth={2}
              strokeDasharray="5 5"
              name="Tendência de Leads"
              dot={false}
            />

            {/* Área de Meta (vermelho) */}
            <Area
              type="monotone"
              dataKey="meta"
              fill={COLORS.meta}
              fillOpacity={0.2}
              stroke={COLORS.metaStroke}
              strokeWidth={2}
              name="Meta de Leads"
              dot={false}
            />
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
