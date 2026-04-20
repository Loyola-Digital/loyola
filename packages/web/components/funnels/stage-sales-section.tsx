"use client";

import { useStageSalesData } from "@/lib/hooks/use-stage-sales-data";
import { Skeleton } from "@/components/ui/skeleton";
import type { StageSalesSubtype } from "@loyola-x/shared";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

interface SalesCardProps {
  label: string;
  value: string | number;
  highlight?: boolean;
}

function SalesCard({ label, value, highlight }: SalesCardProps) {
  return (
    <div className={`rounded-lg border p-4 space-y-1 ${highlight ? "border-primary/30 bg-primary/5" : "border-border/50"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

interface SalesTableProps {
  rows: { key: string; label: string; vendas: number; bruto: number; liquido: number }[];
  emptyMessage: string;
}

function SalesTable({ rows, emptyMessage }: SalesTableProps) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  const totalVendas = rows.reduce((s, r) => s + r.vendas, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border/30">
      <table className="w-full text-xs">
        <thead className="bg-muted/30">
          <tr>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">Origem</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Vendas</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Bruto</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Líquido</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border/10">
              <td className="py-2 px-3 font-medium">{row.label}</td>
              <td className="py-2 px-3 text-right text-muted-foreground">
                {row.vendas}
                <span className="text-[10px] ml-1">
                  ({totalVendas > 0 ? ((row.vendas / totalVendas) * 100).toFixed(0) : 0}%)
                </span>
              </td>
              <td className="py-2 px-3 text-right">{formatCurrency(row.bruto)}</td>
              <td className="py-2 px-3 text-right">{formatCurrency(row.liquido)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface StageSalesSectionProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  subtype: StageSalesSubtype;
  title: string;
  days?: number;
}

export function StageSalesSection({
  projectId,
  funnelId,
  stageId,
  subtype,
  title,
  days,
}: StageSalesSectionProps) {
  const { data, isLoading, isError } = useStageSalesData(
    projectId,
    funnelId,
    stageId,
    subtype,
    days
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold">{title}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (isError || !data || data.semDados) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">
          {data?.semDados
            ? "Nenhuma planilha de vendas conectada para esta seção."
            : "Erro ao carregar dados de vendas."}
        </p>
      </div>
    );
  }

  const canalRows = data.porCanal.map((c) => ({
    key: c.canal,
    label: c.canal,
    vendas: c.vendas,
    bruto: c.bruto,
    liquido: c.liquido,
  }));

  const formaRows = data.porFormaPagamento.map((f) => ({
    key: f.forma,
    label: f.forma,
    vendas: f.vendas,
    bruto: f.bruto,
    liquido: f.liquido,
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">{title}</p>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SalesCard label="Total de Vendas" value={data.totalVendas} highlight />
        <SalesCard label="Faturamento Bruto" value={formatCurrency(data.faturamentoBruto)} />
        <SalesCard label="Faturamento Líquido" value={formatCurrency(data.faturamentoLiquido)} />
        <SalesCard label="Ticket Médio Líquido" value={formatCurrency(data.ticketMedioLiquido)} />
      </div>

      {/* Canal de Origem */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Por Canal de Origem</p>
        <SalesTable rows={canalRows} emptyMessage="Sem dados por canal." />
      </div>

      {/* Forma de Pagamento */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Por Forma de Pagamento</p>
        <SalesTable rows={formaRows} emptyMessage="Sem dados por forma de pagamento." />
      </div>
    </div>
  );
}
