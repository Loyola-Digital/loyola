"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricWithTooltip } from "@/components/metrics/metric-with-tooltip";
import { FormulaChartTooltip } from "@/components/metrics/formula-chart-tooltip";
import { useUserRole } from "@/lib/hooks/use-user-role";
import type { MetricFormula } from "@/lib/types/metric-formula";

const conversionFormula: MetricFormula = {
  expression: "Vendas ÷ Inscrições × 100",
  values: [
    { label: "Vendas", value: 900, source: "Google Sheets — CRM" },
    { label: "Inscrições", value: 1000, source: "Google Sheets — CRM" },
  ],
  result: "900 ÷ 1.000 = 0,90 = 90%",
  period: "20/03 — 17/06",
};

const roasFormula: MetricFormula = {
  expression: "Receita ÷ Investimento",
  values: [
    { label: "Receita", value: "R$ 180.000,00", source: "Google Sheets — CRM" },
    { label: "Investimento", value: "R$ 45.000,00", source: "Meta Ads · spend" },
  ],
  result: "R$ 180.000 ÷ R$ 45.000 = 4,00x",
  period: "20/03 — 17/06",
  note: "Considerando 3 campanhas ativas",
};

const ctrFormula: MetricFormula = {
  expression: "Clicks ÷ Impressions × 100",
  values: [
    { label: "Clicks", value: 8838, source: "Meta Ads · clicks" },
    { label: "Impressions", value: 312450, source: "Meta Ads · impressions" },
  ],
  result: "8.838 ÷ 312.450 = 2,83%",
  period: "20/03 — 17/06",
};

const monthlyRoas = [
  { month: "Mar", roas: 2.1, spend: 12000, revenue: 25200 },
  { month: "Abr", roas: 3.4, spend: 15000, revenue: 51000 },
  { month: "Mai", roas: 4.0, spend: 18000, revenue: 72000 },
  { month: "Jun", roas: 4.2, spend: 20000, revenue: 84000 },
].map((d) => ({
  ...d,
  formula: {
    expression: "Receita ÷ Investimento",
    values: [
      {
        label: "Receita",
        value: `R$ ${d.revenue.toLocaleString("pt-BR")}`,
        source: "Google Sheets — CRM",
      },
      {
        label: "Investimento",
        value: `R$ ${d.spend.toLocaleString("pt-BR")}`,
        source: "Meta Ads · spend",
      },
    ],
    result: `${d.roas.toFixed(2)}x`,
    period: `Mês de ${d.month}/2026`,
  } satisfies MetricFormula,
}));

const leadsByChannel = [
  { channel: "Meta", leads: 820, spend: 15000 },
  { channel: "Google", leads: 540, spend: 12000 },
  { channel: "YouTube", leads: 260, spend: 8000 },
  { channel: "Orgânico", leads: 180, spend: 0 },
].map((d) => ({
  ...d,
  formula: {
    expression: "Σ leads do canal no período",
    values: [
      { label: "Canal", value: d.channel, source: "Cruzamento fontes" },
      {
        label: "Investimento",
        value: `R$ ${d.spend.toLocaleString("pt-BR")}`,
        source: "Ads APIs",
      },
    ],
    result: `${d.leads} leads`,
    period: "20/03 — 17/06",
  } satisfies MetricFormula,
}));

export default function MetricsDemoPage() {
  const role = useUserRole();
  const isAdmin = role === "admin" || role === "manager";

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Página de desenvolvimento — acesso restrito a administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">Metrics Demo — Story 16.1</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Validação visual do componente <code>MetricWithTooltip</code> e do
          adapter <code>FormulaChartTooltip</code> (Recharts).
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">KPI Cards com fórmula</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricWithTooltip
            label="Taxa de Conversão"
            value="90%"
            formula={conversionFormula}
          />
          <MetricWithTooltip
            label="ROAS"
            value="4,00x"
            formula={roasFormula}
          />
          <MetricWithTooltip
            label="CTR"
            value="2,83%"
            formula={ctrFormula}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          KPI Card sem fórmula (fallback)
        </h2>
        <div className="max-w-xs">
          <MetricWithTooltip label="Seguidores" value="713.393" />
        </div>
        <p className="text-xs text-muted-foreground">
          Sem ícone de info, sem tooltip — graceful fallback.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          LineChart com memorial por ponto
        </h2>
        <div className="rounded-lg border border-border/40 bg-card/40 p-4">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthlyRoas}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip content={<FormulaChartTooltip />} />
              <Line
                type="monotone"
                dataKey="roas"
                stroke="var(--color-brand)"
                strokeWidth={2}
                name="ROAS"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground">
          Hover em um ponto mostra fórmula + spend/receita daquele mês.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">BarChart com memorial</h2>
        <div className="rounded-lg border border-border/40 bg-card/40 p-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={leadsByChannel}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="channel" />
              <YAxis />
              <Tooltip content={<FormulaChartTooltip />} />
              <Bar dataKey="leads" fill="var(--color-brand)" name="Leads" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
