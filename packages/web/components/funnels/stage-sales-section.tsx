"use client";

import { useStageSalesData } from "@/lib/hooks/use-stage-sales-data";
import { Skeleton } from "@/components/ui/skeleton";
import type { StageSalesSubtype } from "@loyola-x/shared";
import { resolveSalesByMediumByAdsets } from "@/lib/hooks/use-funnel-adsets-map";

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
  rows: { key: string; label: string; vendas: number; bruto: number; unresolved?: boolean }[];
  emptyMessage: string;
  keyLabel: string;
}

function SalesTable({ rows, emptyMessage, keyLabel }: SalesTableProps) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  const totalVendas = rows.reduce((s, r) => s + r.vendas, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border/30">
      <table className="w-full text-xs">
        <thead className="bg-muted/30">
          <tr>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">{keyLabel}</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Vendas</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Bruto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border/10">
              <td className="py-2 px-3 font-medium">
                <span className={row.unresolved ? "font-mono text-muted-foreground" : undefined}>
                  {row.label}
                </span>
                {row.unresolved && (
                  <span
                    className="ml-2 text-[10px] text-amber-500"
                    title="Nome não resolvido — id não encontrado no cache nem na Meta API"
                  >
                    ⚠️ não resolvido
                  </span>
                )}
              </td>
              <td className="py-2 px-3 text-right text-muted-foreground">
                {row.vendas}
                <span className="text-[10px] ml-1">
                  ({totalVendas > 0 ? ((row.vendas / totalVendas) * 100).toFixed(0) : 0}%)
                </span>
              </td>
              <td className="py-2 px-3 text-right">{formatCurrency(row.bruto)}</td>
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
  /**
   * Map de adset_id → adset_name vindo da Meta API. Quando informado, a tabela
   * "Por Medium (Adset)" resolve `utm_medium` (que armazena o adset_id) pro
   * nome humano e re-agrupa pelos mesmos nomes de adset.
   */
  adsetsMap?: Map<string, string>;
}

export function StageSalesSection({
  projectId,
  funnelId,
  stageId,
  subtype,
  title,
  days,
  adsetsMap,
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
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
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
  }));

  // Resolve adset_id → adset_name e re-agrupa pelos mesmos nomes (vários IDs
  // podem ter o mesmo nome em campanhas duplicadas).
  const resolvedMedium = adsetsMap
    ? resolveSalesByMediumByAdsets(data.porUtmMedium ?? [], adsetsMap)
    : (data.porUtmMedium ?? []);
  const mediumRows = resolvedMedium.map((m) => ({
    key: m.medium,
    label: m.medium,
    vendas: m.vendas,
    bruto: m.bruto,
  }));

  const formaRows = data.porFormaPagamento.map((f) => ({
    key: f.forma,
    label: f.forma,
    vendas: f.vendas,
    bruto: f.bruto,
  }));

  // Story 28.7: tabelas "Por Term (Adset)" e "Por Content (Ad)" restauradas.
  // Backend resolve via cache persistente; quando `name === id`, mostra badge
  // de "não resolvido" pra o gestor saber que aquele item específico falhou.
  const termRows = (data.porUtmTerm ?? [])
    .filter((t) => t.term !== "Não informado")
    .map((t) => ({
      key: t.term,
      label: t.name,
      unresolved: t.name === t.term,
      vendas: t.vendas,
      bruto: t.bruto,
    }));
  const contentRows = (data.porUtmContent ?? [])
    .filter((c) => c.content !== "Não informado")
    .map((c) => ({
      key: c.content,
      label: c.name,
      unresolved: c.name === c.content,
      vendas: c.vendas,
      bruto: c.bruto,
    }));

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">{title}</p>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-3">
        <SalesCard label="Total de Vendas" value={data.totalVendas} highlight />
        <SalesCard label="Faturamento Bruto" value={formatCurrency(data.faturamentoBruto)} />
      </div>

      {/* Canal de Origem */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Por Canal de Origem</p>
        <SalesTable rows={canalRows} emptyMessage="Sem dados por canal." keyLabel="Canal" />
      </div>

      {/* Por Medium (utm_medium → adset_name via Meta API) */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Por Medium (Adset)</p>
        <SalesTable rows={mediumRows} emptyMessage="Sem dados de medium (mapeie a coluna utm_medium na planilha)." keyLabel="Adset" />
      </div>

      {/* Story 28.7: Por Term (utm_term → adset_name via cache Meta) */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Por Adset (utm_term)</p>
        <SalesTable
          rows={termRows}
          emptyMessage="Sem dados de term (mapeie a coluna utm_term na planilha)."
          keyLabel="Adset"
        />
      </div>

      {/* Story 28.7: Por Content (utm_content → ad_name via cache Meta) */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Por Content (Ad)</p>
        <SalesTable
          rows={contentRows}
          emptyMessage="Sem dados de content (mapeie a coluna utm_content na planilha)."
          keyLabel="Anúncio"
        />
      </div>

      {/* Forma de Pagamento */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Por Forma de Pagamento</p>
        <SalesTable rows={formaRows} emptyMessage="Sem dados por forma de pagamento." keyLabel="Forma" />
      </div>
    </div>
  );
}
