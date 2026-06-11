"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import type { HotmartStatusCount } from "@/lib/hooks/use-hotmart";
import { fmtInt } from "@/components/subscriptions/format";

interface Props {
  distribution: HotmartStatusCount[];
}

// Rótulos amigáveis pros status de assinatura da Hotmart.
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativas",
  INACTIVE: "Inativas",
  DELAYED: "Atrasadas",
  OVERDUE: "Inadimplentes",
  STARTED: "Iniciadas",
  CANCELLED_BY_CUSTOMER: "Canc. cliente",
  CANCELLED_BY_SELLER: "Canc. vendedor",
  CANCELLED_BY_ADMIN: "Canc. admin",
};

// Cor por status (verde=ativa, vermelho=cancelada, âmbar=inadimplente, etc.).
function colorFor(status: string): string {
  if (status === "ACTIVE") return "#10b981";
  if (status.startsWith("CANCELLED")) return "#ef4444";
  if (status === "OVERDUE" || status === "DELAYED") return "#f59e0b";
  if (status === "STARTED") return "#3b82f6";
  return "#94a3b8";
}

function labelFor(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function StatusDistributionChart({ distribution }: Props) {
  const data = distribution
    .filter((d) => d.count > 0)
    .map((d) => ({ ...d, label: labelFor(d.status) }));

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-5">
        <h3 className="text-sm font-semibold mb-2">Distribuição de status</h3>
        <p className="text-xs text-muted-foreground py-6 text-center">
          Sem assinaturas para exibir no período.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-5">
      <h3 className="text-sm font-semibold mb-4">Distribuição de status</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.15} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.15 }}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#fff",
            }}
            formatter={(value) => [fmtInt(Number(value)), "Assinaturas"]}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Assinaturas">
            {data.map((d) => (
              <Cell key={d.status} fill={colorFor(d.status)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
