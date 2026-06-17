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
import { fmtInt } from "@/components/subscriptions/format";

/** Tipo neutro de domínio — Hotmart e Kiwify passam ambos { status, count }. */
interface StatusCount {
  status: string;
  count: number;
}

interface Props {
  distribution: StatusCount[];
  /** Rótulo da série (Hotmart = "Assinaturas"; Kiwify = "Cobranças"). */
  seriesLabel?: string;
  /** Mensagem do estado vazio. */
  emptyMessage?: string;
}

// Rótulos amigáveis — status de assinatura (Hotmart, MAIÚSCULOS) e de venda (Kiwify, minúsculos).
const STATUS_LABEL: Record<string, string> = {
  // Hotmart (assinatura)
  ACTIVE: "Ativas",
  INACTIVE: "Inativas",
  DELAYED: "Atrasadas",
  OVERDUE: "Inadimplentes",
  STARTED: "Iniciadas",
  CANCELLED_BY_CUSTOMER: "Canc. cliente",
  CANCELLED_BY_SELLER: "Canc. vendedor",
  CANCELLED_BY_ADMIN: "Canc. admin",
  // Kiwify (venda)
  paid: "Pagas",
  approved: "Aprovadas",
  refunded: "Reembolsadas",
  refund_requested: "Reemb. pedido",
  pending_refund: "Reemb. pendente",
  chargedback: "Chargeback",
  waiting_payment: "Aguard. pgto",
  pending: "Pendentes",
  processing: "Processando",
  authorized: "Autorizadas",
  refused: "Recusadas",
};

// Cor por status. Verde=receita ok, vermelho=perda, âmbar=reembolso, azul=pendente, cinza=outros.
function colorFor(status: string): string {
  // Hotmart (assinatura)
  if (status === "ACTIVE") return "#10b981";
  if (status.startsWith("CANCELLED")) return "#ef4444";
  if (status === "OVERDUE" || status === "DELAYED") return "#f59e0b";
  if (status === "STARTED") return "#3b82f6";
  // Kiwify (venda)
  if (status === "paid" || status === "approved") return "#10b981";
  if (status === "chargedback" || status === "refused") return "#ef4444";
  if (status === "refunded" || status === "refund_requested" || status === "pending_refund") return "#f59e0b";
  if (
    status === "waiting_payment" ||
    status === "pending" ||
    status === "processing" ||
    status === "authorized"
  )
    return "#3b82f6";
  return "#94a3b8";
}

function labelFor(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function StatusDistributionChart({
  distribution,
  seriesLabel = "Assinaturas",
  emptyMessage = "Sem assinaturas para exibir no período.",
}: Props) {
  const data = distribution
    .filter((d) => d.count > 0)
    .map((d) => ({ ...d, label: labelFor(d.status) }));

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-5">
        <h3 className="text-sm font-semibold mb-2">Distribuição de status</h3>
        <p className="text-xs text-muted-foreground py-6 text-center">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-5">
      <h3 className="text-sm font-semibold mb-4">Distribuição de status</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.15} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)", fillOpacity: 0.15 }}
            contentStyle={{
              backgroundColor: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#fff",
            }}
            formatter={(value) => [fmtInt(Number(value)), seriesLabel]}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} name={seriesLabel}>
            {data.map((d) => (
              <Cell key={d.status} fill={colorFor(d.status)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
