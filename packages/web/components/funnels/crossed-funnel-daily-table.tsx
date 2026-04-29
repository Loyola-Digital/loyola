"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DailyRow } from "@/lib/utils/funnel-metrics";

interface CrossedFunnelDailyTableProps {
  rows: DailyRow[];
  totals: DailyRow;
  title?: string;
  surveyTotal?: number | null;
  surveyMatched?: number | null;
  surveyUnmatched?: number | null;
  salesByDay?: Record<string, number>;
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function fmtPercent(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  return `${v.toFixed(2)}%`;
}

function fmtInt(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatDateLabel(d: string) {
  if (d === "Total") return d;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function renderConnectRate(v: number | null) {
  if (v == null) return "\u2014";
  const warn = v < 70;
  return (
    <span className={warn ? "text-amber-600 font-medium" : ""}>
      {warn ? "\u26A0\uFE0F " : ""}
      {fmtPercent(v)}
    </span>
  );
}

/**
 * Tabela diária cruzada (Meta Ads + planilha de leads).
 *
 * Ordem das colunas: Dia, Investimento, Faturamento, Cliques, Impressões,
 * Total Leads, CPL Pg, CPL G, CPM, CPC, CTR, LP View, Connect Rate, Tx Conv.,
 * Leads pagos, Leads org, Leads s/ track. Última linha é o total via footer.
 *
 * Total Leads + CPL Pg/G ficam logo após Impressões para destacar a métrica
 * de custo de aquisição cedo na leitura.
 *
 * Usado no LaunchDashboard (Story 18.3). Dados vêm do hook
 * `useCrossedFunnelMetrics` (Story 18.2/18.3).
 */
export function CrossedFunnelDailyTable({
  rows,
  totals,
  title = "Dados diários",
  surveyTotal,
  surveyMatched,
  surveyUnmatched,
  salesByDay,
}: CrossedFunnelDailyTableProps) {
  const salesTotal = salesByDay
    ? Object.values(salesByDay).reduce((a, b) => a + b, 0)
    : null;
  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>

      <div className="space-y-3">
        <div className="rounded-md border overflow-x-auto">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10 min-w-[90px]">Dia</TableHead>
              <TableHead className="text-right min-w-[110px]">Investimento</TableHead>
              <TableHead className="text-right min-w-[110px]">Faturamento</TableHead>
              <TableHead className="text-right min-w-[80px]">Cliques</TableHead>
              <TableHead className="text-right min-w-[100px]">Impressões</TableHead>
              <TableHead className="text-right min-w-[100px] font-semibold">Total Leads</TableHead>
              <TableHead className="text-right min-w-[90px]">CPL Pg</TableHead>
              <TableHead className="text-right min-w-[80px]">CPL G</TableHead>
              <TableHead className="text-right min-w-[80px]">CPM</TableHead>
              <TableHead className="text-right min-w-[80px]">CPC</TableHead>
              <TableHead className="text-right min-w-[70px]">CTR</TableHead>
              <TableHead className="text-right min-w-[80px]">LP View</TableHead>
              <TableHead className="text-right min-w-[110px]">Connect Rate</TableHead>
              <TableHead className="text-right min-w-[90px]" title="Leads Pagos ÷ Link Clicks × 100">Tx Conv.</TableHead>
              <TableHead className="text-right min-w-[100px]">Leads pagos</TableHead>
              <TableHead className="text-right min-w-[90px]">Leads org</TableHead>
              <TableHead className="text-right min-w-[110px]">Leads s/ track</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const totalLeads = r.leadsPagos + r.leadsOrg + r.leadsSemTrack;
              return (
                <TableRow key={r.date}>
                  <TableCell className="sticky left-0 bg-background z-10 font-medium">
                    {formatDateLabel(r.date)}
                  </TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.spend)}</TableCell>
                  <TableCell className="text-right">
                    {fmtCurrency(salesByDay ? (salesByDay[r.date] ?? 0) : r.faturamento)}
                  </TableCell>
                  <TableCell className="text-right">{fmtInt(r.linkClicks)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.impressions)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtInt(totalLeads)}</TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.cplPg)}</TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.cplG)}</TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.cpm)}</TableCell>
                  <TableCell className="text-right">{fmtCurrency(r.cpc)}</TableCell>
                  <TableCell className="text-right">{fmtPercent(r.ctr)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.lpView)}</TableCell>
                  <TableCell className="text-right">{renderConnectRate(r.connectRate)}</TableCell>
                  <TableCell className="text-right">{fmtPercent(r.txConv)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.leadsPagos)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.leadsOrg)}</TableCell>
                  <TableCell className="text-right">{fmtInt(r.leadsSemTrack)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow className="font-semibold">
              <TableCell className="sticky left-0 bg-muted/50 z-10">Total</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.spend)}</TableCell>
              <TableCell className="text-right">
                {fmtCurrency(salesTotal !== null ? salesTotal : totals.faturamento)}
              </TableCell>
              <TableCell className="text-right">{fmtInt(totals.linkClicks)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.impressions)}</TableCell>
              <TableCell className="text-right font-semibold">
                {fmtInt(totals.leadsPagos + totals.leadsOrg + totals.leadsSemTrack)}
              </TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cplPg)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cplG)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cpm)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cpc)}</TableCell>
              <TableCell className="text-right">{fmtPercent(totals.ctr)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.lpView)}</TableCell>
              <TableCell className="text-right">{renderConnectRate(totals.connectRate)}</TableCell>
              <TableCell className="text-right">{fmtPercent(totals.txConv)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.leadsPagos)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.leadsOrg)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.leadsSemTrack)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        </div>

        <div className="rounded-md border border-border/30 bg-muted/20 px-4 py-3 space-y-2 text-sm">
          <div className="flex flex-wrap gap-4">
            <div>
              <span className="text-muted-foreground">Leads:</span>
              <span className="font-medium ml-2">
                {fmtInt(totals.leadsPagos)} Pagos | {fmtInt(totals.leadsOrg)} Org | {fmtInt(totals.leadsSemTrack)} Sem origem
              </span>
            </div>
            {surveyTotal != null && (
              <div>
                <span className="text-muted-foreground">Pesquisa:</span>
                <span className="font-medium ml-2">
                  {fmtInt(surveyTotal)} respostas | {fmtInt(surveyMatched)} com match | {fmtInt(surveyUnmatched)} sem match
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
