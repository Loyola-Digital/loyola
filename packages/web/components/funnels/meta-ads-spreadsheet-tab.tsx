"use client";

import { useMemo } from "react";
import { Loader2, FileSpreadsheet } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import {
  ComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import { useApiClient } from "@/lib/hooks/use-api-client";
import {
  useFunnelSpreadsheets,
  useFunnelSpreadsheetData,
} from "@/lib/hooks/use-funnel-spreadsheets";
import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import type { Funnel } from "@loyola-x/shared";
import type { FunnelSpreadsheetData } from "@/lib/types/funnel-spreadsheet";
import {
  PAID_SOURCES,
  getActionValue,
  safeDivide,
} from "@/lib/utils/funnel-metrics";
import { normaliseDate } from "@/lib/utils/spreadsheet-filters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetaAdsSpreadsheetTabProps {
  funnel: Funnel;
  projectId: string;
}

interface DailyRow {
  date: string;
  spend: number;
  linkClicks: number;
  impressions: number;
  cpm: number;
  cpc: number;
  ctr: number;
  lpView: number;
  connectRate: number | null;
  txConv: number | null;
  leadsPagos: number;
  leadsOrg: number;
  leadsSemTrack: number;
  cplPg: number | null;
  cplG: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
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

function formatDateShort(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

// ---------------------------------------------------------------------------
// Data processing
// ---------------------------------------------------------------------------

function aggregateMetaDailyByDate(
  allInsights: CampaignDailyInsight[][],
): Map<string, { spend: number; impressions: number; linkClicks: number; lpView: number }> {
  const map = new Map<string, { spend: number; impressions: number; linkClicks: number; lpView: number }>();
  for (const insights of allInsights) {
    for (const row of insights) {
      const date = row.date_start.slice(0, 10);
      const existing = map.get(date) ?? { spend: 0, impressions: 0, linkClicks: 0, lpView: 0 };
      existing.spend += parseFloat(row.spend || "0");
      existing.impressions += parseFloat(row.impressions || "0");
      existing.linkClicks += getActionValue(row.actions, "link_click");
      existing.lpView += getActionValue(row.actions, "landing_page_view");
      map.set(date, existing);
    }
  }
  return map;
}

function aggregateSpreadsheetByDate(
  sheetData: FunnelSpreadsheetData | undefined,
): Map<string, { leadsPagos: number; leadsOrg: number; leadsSemTrack: number }> {
  const map = new Map<string, { leadsPagos: number; leadsOrg: number; leadsSemTrack: number }>();
  if (!sheetData) return map;
  const { mapping } = sheetData;
  for (const row of sheetData.rows) {
    const rawDate = mapping.date ? row.named.date : undefined;
    const date = normaliseDate(rawDate);
    if (!date) continue;
    const existing = map.get(date) ?? { leadsPagos: 0, leadsOrg: 0, leadsSemTrack: 0 };
    const utmSource = (row.named.utm_source ?? "").trim().toLowerCase();
    if (!utmSource || !mapping.utm_source) {
      existing.leadsSemTrack += 1;
    } else if (PAID_SOURCES.has(utmSource)) {
      existing.leadsPagos += 1;
    } else {
      existing.leadsOrg += 1;
    }
    map.set(date, existing);
  }
  return map;
}

function buildDailyRows(
  metaMap: Map<string, { spend: number; impressions: number; linkClicks: number; lpView: number }>,
  sheetMap: Map<string, { leadsPagos: number; leadsOrg: number; leadsSemTrack: number }>,
): DailyRow[] {
  const allDates = new Set([...metaMap.keys(), ...sheetMap.keys()]);
  const rows: DailyRow[] = [];
  for (const date of allDates) {
    const meta = metaMap.get(date) ?? { spend: 0, impressions: 0, linkClicks: 0, lpView: 0 };
    const sheet = sheetMap.get(date) ?? { leadsPagos: 0, leadsOrg: 0, leadsSemTrack: 0 };
    const totalLeads = sheet.leadsPagos + sheet.leadsOrg + sheet.leadsSemTrack;
    rows.push({
      date,
      spend: meta.spend,
      linkClicks: meta.linkClicks,
      impressions: meta.impressions,
      cpm: meta.impressions > 0 ? (meta.spend / meta.impressions) * 1000 : 0,
      cpc: safeDivide(meta.spend, meta.linkClicks) ?? 0,
      ctr: meta.impressions > 0 ? (meta.linkClicks / meta.impressions) * 100 : 0,
      lpView: meta.lpView,
      connectRate: safeDivide(meta.lpView, meta.linkClicks)
        ? (meta.lpView / meta.linkClicks) * 100
        : null,
      txConv: safeDivide(totalLeads, meta.lpView)
        ? (totalLeads / meta.lpView) * 100
        : null,
      leadsPagos: sheet.leadsPagos,
      leadsOrg: sheet.leadsOrg,
      leadsSemTrack: sheet.leadsSemTrack,
      cplPg: safeDivide(meta.spend, sheet.leadsPagos),
      cplG: safeDivide(meta.spend, totalLeads),
    });
  }
  // Ascending date order
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return rows;
}

function computeTotals(rows: DailyRow[]): DailyRow {
  const t = rows.reduce(
    (acc, r) => {
      acc.spend += r.spend;
      acc.linkClicks += r.linkClicks;
      acc.impressions += r.impressions;
      acc.lpView += r.lpView;
      acc.leadsPagos += r.leadsPagos;
      acc.leadsOrg += r.leadsOrg;
      acc.leadsSemTrack += r.leadsSemTrack;
      return acc;
    },
    { spend: 0, linkClicks: 0, impressions: 0, lpView: 0, leadsPagos: 0, leadsOrg: 0, leadsSemTrack: 0 },
  );
  const totalLeads = t.leadsPagos + t.leadsOrg + t.leadsSemTrack;
  return {
    date: "Total",
    spend: t.spend,
    linkClicks: t.linkClicks,
    impressions: t.impressions,
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0,
    cpc: safeDivide(t.spend, t.linkClicks) ?? 0,
    ctr: t.impressions > 0 ? (t.linkClicks / t.impressions) * 100 : 0,
    lpView: t.lpView,
    connectRate: safeDivide(t.lpView, t.linkClicks)
      ? (t.lpView / t.linkClicks) * 100
      : null,
    txConv: safeDivide(totalLeads, t.lpView)
      ? (totalLeads / t.lpView) * 100
      : null,
    leadsPagos: t.leadsPagos,
    leadsOrg: t.leadsOrg,
    leadsSemTrack: t.leadsSemTrack,
    cplPg: safeDivide(t.spend, t.leadsPagos),
    cplG: safeDivide(t.spend, totalLeads),
  };
}

// ---------------------------------------------------------------------------
// Chart data builders
// ---------------------------------------------------------------------------

function buildCplChartData(rows: DailyRow[]) {
  return rows.map((r) => ({
    date: formatDateShort(r.date),
    "CPL Pago": r.cplPg != null ? parseFloat(r.cplPg.toFixed(2)) : null,
    "CPL Geral": r.cplG != null ? parseFloat(r.cplG.toFixed(2)) : null,
    Investimento: parseFloat(r.spend.toFixed(2)),
  }));
}

function buildLeadsCumulativeData(rows: DailyRow[]) {
  let cumPagos = 0;
  let cumOrg = 0;
  let cumSemTrack = 0;
  return rows.map((r) => {
    cumPagos += r.leadsPagos;
    cumOrg += r.leadsOrg;
    cumSemTrack += r.leadsSemTrack;
    return {
      date: formatDateShort(r.date),
      "Leads Pagos": cumPagos,
      "Leads Org": cumOrg,
      "Leads s/ Track": cumSemTrack,
      "Total Leads": cumPagos + cumOrg + cumSemTrack,
    };
  });
}

const CPL_COLORS = { pago: "hsl(220 80% 55%)", geral: "hsl(280 60% 55%)" };
const LEADS_COLORS = { pagos: "hsl(220 80% 55%)", org: "hsl(150 60% 50%)", semTrack: "hsl(40 90% 55%)" };

// ---------------------------------------------------------------------------
// Custom label renderer for chart points
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPointLabel(props: any) {
  const { x, y, value } = props as { x?: number; y?: number; value?: number | null };
  if (value == null || x == null || y == null) return null;
  return (
    <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fill="currentColor">
      {typeof value === "number" ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : value}
    </text>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderBarLabel(props: any) {
  const { x, y, width, height, value } = props as {
    x?: number; y?: number; width?: number; height?: number; value?: number | null;
  };
  if (value == null || x == null || y == null || width == null || height == null || height < 14) return null;
  return (
    <text
      x={x + width / 2}
      y={y + height - 4}
      textAnchor="middle"
      fontSize={9}
      fill="hsl(220 15% 45%)"
    >
      {Math.round(value).toLocaleString("pt-BR")}
    </text>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MetaAdsSpreadsheetTab({ funnel, projectId }: MetaAdsSpreadsheetTabProps) {
  const apiClient = useApiClient();
  const days = 30;

  // 1. Fetch daily insights for each campaign
  const campaignQueries = useQueries({
    queries: funnel.campaigns.map((c) => ({
      queryKey: ["traffic-campaign-daily", projectId, c.id, days] as const,
      queryFn: () =>
        apiClient<CampaignDailyInsight[]>(
          `/api/traffic/analytics/${projectId}/campaign-daily?campaignId=${c.id}&days=${days}`,
        ),
      staleTime: 5 * 60 * 1000,
      enabled: funnel.campaigns.length > 0,
    })),
  });

  const metaLoading = campaignQueries.some((q) => q.isLoading);
  const metaData = campaignQueries
    .map((q) => q.data)
    .filter((d): d is CampaignDailyInsight[] => !!d);

  // 2. Fetch spreadsheet linked to funnel
  const { data: spreadsheetsData, isLoading: sheetsListLoading } =
    useFunnelSpreadsheets(projectId, funnel.id);

  const linkedSheet = useMemo(() => {
    if (!spreadsheetsData?.spreadsheets) return null;
    return (
      spreadsheetsData.spreadsheets.find((s) => s.type === "leads") ??
      spreadsheetsData.spreadsheets[0] ??
      null
    );
  }, [spreadsheetsData]);

  const { data: sheetData, isLoading: sheetDataLoading } =
    useFunnelSpreadsheetData(projectId, funnel.id, linkedSheet?.id);

  // 3. Build merged table
  const isLoading = metaLoading || sheetsListLoading || sheetDataLoading;

  const { rows, totals } = useMemo(() => {
    const metaMap = aggregateMetaDailyByDate(metaData);
    const sheetMap = aggregateSpreadsheetByDate(sheetData);
    const r = buildDailyRows(metaMap, sheetMap);
    return { rows: r, totals: computeTotals(r) };
  }, [metaData, sheetData]);

  const cplChartData = useMemo(() => buildCplChartData(rows), [rows]);
  const leadsChartData = useMemo(() => buildLeadsCumulativeData(rows), [rows]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando dados...
      </div>
    );
  }

  if (funnel.campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileSpreadsheet className="h-8 w-8" />
        <p>Nenhuma campanha Meta Ads vinculada a este funil.</p>
        <p className="text-xs">Configure as campanhas na aba Meta Ads para ver os dados cruzados.</p>
      </div>
    );
  }

  if (!linkedSheet) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileSpreadsheet className="h-8 w-8" />
        <p>Nenhuma planilha vinculada a este funil.</p>
        <p className="text-xs">Vincule uma planilha na aba Planilhas para ver dados cruzados.</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileSpreadsheet className="h-8 w-8" />
        <p>Sem dados para o periodo selecionado.</p>
      </div>
    );
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Dados cruzados — Meta Ads + Planilha</h3>
        <span className="text-xs text-muted-foreground">
          Planilha: {linkedSheet.label} · Ultimos {days} dias
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10 min-w-[90px]">Dia</TableHead>
              <TableHead className="text-right min-w-[110px]">Investimento</TableHead>
              <TableHead className="text-right min-w-[80px]">Cliques</TableHead>
              <TableHead className="text-right min-w-[100px]">Impressoes</TableHead>
              <TableHead className="text-right min-w-[80px]">CPM</TableHead>
              <TableHead className="text-right min-w-[80px]">CPC</TableHead>
              <TableHead className="text-right min-w-[70px]">CTR</TableHead>
              <TableHead className="text-right min-w-[80px]">LP View</TableHead>
              <TableHead className="text-right min-w-[110px]">Connect Rate</TableHead>
              <TableHead className="text-right min-w-[90px]">Tx Conv.</TableHead>
              <TableHead className="text-right min-w-[100px]">Leads pagos</TableHead>
              <TableHead className="text-right min-w-[90px]">Leads org</TableHead>
              <TableHead className="text-right min-w-[110px]">Leads s/ track</TableHead>
              <TableHead className="text-right min-w-[90px]">CPL Pg</TableHead>
              <TableHead className="text-right min-w-[80px]">CPL G</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.date}>
                <TableCell className="sticky left-0 bg-background z-10 font-medium">
                  {formatDateLabel(r.date)}
                </TableCell>
                <TableCell className="text-right">{fmtCurrency(r.spend)}</TableCell>
                <TableCell className="text-right">{fmtInt(r.linkClicks)}</TableCell>
                <TableCell className="text-right">{fmtInt(r.impressions)}</TableCell>
                <TableCell className="text-right">{fmtCurrency(r.cpm)}</TableCell>
                <TableCell className="text-right">{fmtCurrency(r.cpc)}</TableCell>
                <TableCell className="text-right">{fmtPercent(r.ctr)}</TableCell>
                <TableCell className="text-right">{fmtInt(r.lpView)}</TableCell>
                <TableCell className="text-right">{renderConnectRate(r.connectRate)}</TableCell>
                <TableCell className="text-right">{fmtPercent(r.txConv)}</TableCell>
                <TableCell className="text-right">{fmtInt(r.leadsPagos)}</TableCell>
                <TableCell className="text-right">{fmtInt(r.leadsOrg)}</TableCell>
                <TableCell className="text-right">{fmtInt(r.leadsSemTrack)}</TableCell>
                <TableCell className="text-right">{fmtCurrency(r.cplPg)}</TableCell>
                <TableCell className="text-right">{fmtCurrency(r.cplG)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="font-semibold">
              <TableCell className="sticky left-0 bg-muted/50 z-10">Total</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.spend)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.linkClicks)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.impressions)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cpm)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cpc)}</TableCell>
              <TableCell className="text-right">{fmtPercent(totals.ctr)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.lpView)}</TableCell>
              <TableCell className="text-right">{renderConnectRate(totals.connectRate)}</TableCell>
              <TableCell className="text-right">{fmtPercent(totals.txConv)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.leadsPagos)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.leadsOrg)}</TableCell>
              <TableCell className="text-right">{fmtInt(totals.leadsSemTrack)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cplPg)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(totals.cplG)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Charts — stacked vertically */}
      <div className="space-y-6">
        {/* CPL + Investimento Chart */}
        <div className="rounded-md border p-4 space-y-2">
          <h4 className="text-sm font-semibold">CPL Pago vs CPL Geral</h4>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={cplChartData} margin={{ top: 20, right: 30, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="cpl"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `R$${v}`}
                domain={[0, "auto"]}
                allowDataOverflow={false}
              />
              <YAxis
                yAxisId="invest"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `R$${v}`}
                domain={[0, "auto"]}
                allowDataOverflow={false}
              />
              <Tooltip
                formatter={(value) => fmtCurrency(Number(value))}
                labelFormatter={(label) => `Dia ${label}`}
              />
              <Legend />
              <Bar
                yAxisId="invest"
                dataKey="Investimento"
                fill="hsl(220 15% 70%)"
                fillOpacity={0.2}
                radius={[3, 3, 0, 0]}
              >
                <LabelList content={renderBarLabel} />
              </Bar>
              <Line
                yAxisId="cpl"
                type="monotone"
                dataKey="CPL Pago"
                stroke={CPL_COLORS.pago}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              >
                <LabelList content={renderPointLabel} />
              </Line>
              <Line
                yAxisId="cpl"
                type="monotone"
                dataKey="CPL Geral"
                stroke={CPL_COLORS.geral}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              >
                <LabelList content={renderPointLabel} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Leads Cumulative Chart */}
        <div className="rounded-md border p-4 space-y-2">
          <h4 className="text-sm font-semibold">Leads Acumulados</h4>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={leadsChartData} margin={{ top: 20, right: 30, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                domain={[0, "auto"]}
                allowDecimals={false}
                allowDataOverflow={false}
              />
              <Tooltip labelFormatter={(label) => `Dia ${label}`} />
              <Legend />
              <Area
                type="monotone"
                dataKey="Total Leads"
                fill="hsl(220 15% 70%)"
                fillOpacity={0.12}
                stroke="hsl(220 15% 60%)"
                strokeWidth={1}
                strokeDasharray="4 3"
                dot={false}
              >
                <LabelList content={renderPointLabel} />
              </Area>
              <Line
                type="monotone"
                dataKey="Leads Pagos"
                stroke={LEADS_COLORS.pagos}
                strokeWidth={2}
                dot={{ r: 3 }}
              >
                <LabelList content={renderPointLabel} />
              </Line>
              <Line
                type="monotone"
                dataKey="Leads Org"
                stroke={LEADS_COLORS.org}
                strokeWidth={2}
                dot={{ r: 3 }}
              >
                <LabelList content={renderPointLabel} />
              </Line>
              <Line
                type="monotone"
                dataKey="Leads s/ Track"
                stroke={LEADS_COLORS.semTrack}
                strokeWidth={2}
                dot={{ r: 3 }}
              >
                <LabelList content={renderPointLabel} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
