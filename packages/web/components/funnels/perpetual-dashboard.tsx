"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import {
  DollarSign,
  LinkIcon,
  ShoppingCart,
  Target,
  BarChart3,
  Filter,
  Settings2,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  LabelList,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  useTrafficOverview,
  useTrafficCampaigns,
  useCampaignDailyInsightsBulk,
  useAllAdSets,
  useAllAds,
  type CampaignAnalytics,
} from "@/lib/hooks/use-traffic-analytics";
import { CampaignSelector } from "./campaign-selector";
import { TopCreativesGallery } from "./top-creatives-gallery";
import { RefreshDataButton } from "./refresh-data-button";
import { MetaFreshnessBadge } from "./meta-freshness-badge";
import { PerpetualSpreadsheetWizardDialog } from "./perpetual-spreadsheet-wizard-dialog";
import { usePerpetualSpreadsheet } from "@/lib/hooks/use-perpetual-spreadsheet";
import {
  usePerpetualSalesData,
  usePerpetualSalesDataDaily,
} from "@/lib/hooks/use-perpetual-sales-data";
import type { Funnel, FunnelCampaign, StageType } from "@loyola-x/shared";
import { StageSalesSection } from "./stage-sales-section";
import { useCampaignPicker, useUpdateFunnel } from "@/lib/hooks/use-funnels";
import { useMetaAdsComparison } from "@/lib/hooks/use-meta-ads-comparison";
import { useResolveMetaNames } from "@/lib/hooks/use-funnel-adsets-map";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import { FormulaChartTooltip } from "@/components/metrics/formula-chart-tooltip";
import {
  buildFunnelRoasFormula,
  buildFunnelSpendFormula,
  buildFunnelSalesCountFormula,
  buildFunnelRevenueFormula,
  buildFunnelCacFormula,
  buildFunnelMarginFormula,
  buildFunnelMarginPercentFormula,
  buildFunnelRateFormula,
  buildFunnelDailyFormula,
  buildFunnelCtrFormula,
  buildFunnelCpcFormula,
  buildFunnelCpmFormula,
  enrichFormulaForEntity,
  type EntityPath,
} from "@/lib/formulas/funnels";

interface PerpetualDashboardProps {
  funnel: Funnel;
  projectId: string;
  stageId?: string;
  stageType?: StageType;
  onCampaignsChange?: (campaigns: FunnelCampaign[]) => void;
}

// ============================================================
// FORMATTERS
// ============================================================

function fmtCurrency(val: number | null | undefined): string {
  if (val == null || val === 0) return "—";
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(1)}K`;
  return `R$ ${val.toFixed(2)}`;
}

// Story 29.8: formato compacto pra labels dos pontos no gráfico (evita poluir)
function fmtCurrencyCompact(val: number | null | undefined): string {
  if (val == null) return "—";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}R$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}R$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}R$${abs.toFixed(0)}`;
}

// Story 29.9: imposto sobre Meta Ads vigente a partir de 01/01/2026 (12.15%).
// Spend bruto da API Meta NÃO inclui esse imposto — precisa adicionar pra ter
// custo real. Aplicado per dia (data >= effective). Pra dias anteriores, sem tax.
const META_TAX_EFFECTIVE_DATE = "2026-01-01";
const META_TAX_RATE = 0.1215;

// Imposto "por dentro" (gross-up): valor da API é líquido; total = valor / (1 − alíquota).
function applyMetaTax(spend: number, dateIsoYmd: string): number {
  return dateIsoYmd >= META_TAX_EFFECTIVE_DATE ? spend / (1 - META_TAX_RATE) : spend;
}

function metaTaxAmount(spend: number, dateIsoYmd: string): number {
  return dateIsoYmd >= META_TAX_EFFECTIVE_DATE ? (spend / (1 - META_TAX_RATE)) * META_TAX_RATE : 0;
}

function fmtNumber(val: number | null | undefined): string {
  if (val == null) return "—";
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function fmtPercent(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${val.toFixed(2)}%`;
}

function fmtRoas(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${val.toFixed(2)}x`;
}

function safeNum(val: string | undefined): number {
  return val ? parseFloat(val) : 0;
}

// Story 29.16/29.17: sobrepõe métricas da planilha (vendas/receita/ROAS/CAC)
// numa lista de entidades Meta (campanha/adset/ad), casando o id da linha
// (campaignId = campaign/adset/ad id) com a chave UTM da planilha. Spend
// continua Meta; nome continua vindo da linha. Sem match → vendas/receita = 0.
function overlaySpreadsheetMetrics(
  rows: CampaignAnalytics[],
  byKey: Map<string, { vendas: number; bruto: number }>,
  keyOf: (r: CampaignAnalytics) => string = (r) => r.campaignId,
): CampaignAnalytics[] {
  return rows.map((r) => {
    const match = byKey.get(keyOf(r));
    const revenue = match ? match.bruto : 0;
    const sales = match ? match.vendas : 0;
    return {
      ...r,
      revenue,
      sales,
      roas: r.spend > 0 && match ? match.bruto / r.spend : null,
      costPerSale: sales > 0 ? r.spend / sales : null,
    };
  });
}

// Story 29.19: linha do Detalhamento (CampaignAnalytics + margens derivadas).
type DetailRow = CampaignAnalytics & { marginPct: number | null; marginPerSale: number | null };

// Linha sintética do Detalhamento quando só há planilha (sem campanha Meta):
// métricas de mídia zeradas; vendas/receita vêm da planilha.
function sheetOnlyRow(id: string, name: string, vendas: number, bruto: number): CampaignAnalytics {
  return {
    campaignId: id,
    campaignName: name,
    spend: 0, impressions: 0, clicks: 0, reach: 0, frequency: 0, ctr: 0, cpc: 0, cpm: 0,
    leads: null, cpl: null, linkClicks: null, landingPageViews: null, connectRate: null,
    qualifiedLeads: null, cplQualified: null, qualificationRate: null,
    sales: vendas, revenue: bruto, costPerSale: null, roas: null, conversionRate: null,
  };
}

// Story 29.19: remove o sufixo " — Cópia" (Meta duplica campanhas assim) do fim
// do nome, pra normalizar e agrupar a cópia no nome base. Cobre —/–/- e número.
const COPIA_SUFFIX_RE = /(\s*[—–-]\s*c[oó]pia(\s*\d+)?)+\s*$/i;
function normalizeCampaignName(name: string): string {
  const cleaned = name.replace(COPIA_SUFFIX_RE, "").trim();
  return cleaned.length > 0 ? cleaned : name;
}

// Story 29.19: cores condicionais das colunas do Detalhamento.
function roasColorClass(v: number | null | undefined): string {
  if (v == null) return "";
  if (v >= 2) return "text-emerald-400";
  if (v >= 1) return "text-amber-400";
  return "text-red-400";
}
function marginColorClass(v: number | null | undefined): string {
  if (v == null) return "";
  return v > 0 ? "text-emerald-400" : "text-red-400";
}

// Story 29.15: rótulo de valor a cada 7 dias no gráfico de linha de Investimento
// (evita poluir mostrando o valor em todos os pontos).
function Spend7DayLabel(props: {
  x?: number;
  y?: number;
  value?: number | string;
  index?: number;
}) {
  const { x, y, value, index } = props;
  if (x == null || y == null || index == null || index % 7 !== 0) return null;
  const num = typeof value === "number" ? value : Number(value ?? 0);
  return (
    <text x={x} y={y - 8} textAnchor="middle" fontSize={9} fontWeight={600} fill="hsl(47 98% 68%)">
      {fmtCurrencyCompact(num)}
    </text>
  );
}

// Story 29.14: tooltip do gráfico de resultado/dia — mostra Investimento,
// Receita e o Resultado do dia (verde/vermelho). `variant` escolhe se o
// número herói é o resultado bruto (Receita − Investimento) ou a Margem líquida.
function DailyResultTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: { date?: string; spend?: number; revenue?: number; margin?: number };
  }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const result = d.margin ?? 0;
  const resultLabel = "Margem (líquida)";
  const positive = result >= 0;
  return (
    <div className="min-w-[172px] rounded-md border bg-popover p-2.5 text-xs text-popover-foreground shadow-md">
      {d.date && <div className="mb-1.5 font-semibold">{d.date}</div>}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Investimento</span>
          <span className="font-mono tabular-nums">{fmtCurrency(d.spend)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Receita</span>
          <span className="font-mono tabular-nums">{fmtCurrency(d.revenue)}</span>
        </div>
        <div
          className={`mt-1 flex items-center justify-between gap-3 border-t border-border/40 pt-1 font-semibold ${
            positive ? "text-emerald-400" : "text-red-400"
          }`}
        >
          <span>{resultLabel}</span>
          <span className="font-mono tabular-nums">{fmtCurrency(result)}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function PerpetualDashboard({ funnel, projectId, stageId, stageType, onCampaignsChange }: PerpetualDashboardProps) {
  const [days, setDays] = useState(90);
  // Fix 1 (29.8): quando usuario seleciona range custom no calendario, guarda
  // startDate/endDate explicitos e propaga pros hooks. Sem isso, days sozinho
  // sempre busca "X dias retroativos de hoje" — ignorando datas no passado.
  const [customRange, setCustomRange] = useState<{ startDate: string; endDate: string } | null>(null);
  const [showCampaignManager, setShowCampaignManager] = useState(false);
  const [showSpreadsheetWizard, setShowSpreadsheetWizard] = useState(false);
  const [tableFilter, setTableFilter] = useState<"campaign" | "adset" | "ad">("campaign");
  // Story 29.19: ordenação de colunas + largura da coluna Dimensão no Detalhamento
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dimWidth, setDimWidth] = useState(200);
  const { data: perpetualSpreadsheet } = usePerpetualSpreadsheet(projectId, funnel.id);
  const { data: salesData } = usePerpetualSalesData(
    projectId,
    funnel.id,
    days,
    customRange?.startDate,
    customRange?.endDate,
  );
  const { data: salesDataDaily } = usePerpetualSalesDataDaily(
    projectId,
    funnel.id,
    days,
    customRange?.startDate,
    customRange?.endDate,
  );
  const usingSpreadsheet = !!perpetualSpreadsheet && !!salesData && !salesData.semDados;
  const { data: pickerData } = useCampaignPicker(showCampaignManager ? projectId : null);
  const updateFunnel = useUpdateFunnel(projectId, funnel.id);
  const campaignIds = funnel.campaigns.map((c) => c.id);
  const campaignIdSet = new Set(campaignIds);
  // Sem campanha Meta vinculada o dashboard opera 100% da planilha. Os hooks
  // Meta são desabilitados (projectId null) — sem o filtro de campanha os
  // endpoints retornariam dados do PROJETO inteiro (spend de outros funis).
  const hasCampaigns = campaignIds.length > 0;
  const metaProjectId = hasCampaigns ? projectId : null;

  // Data hooks — Fix 1 (29.8): propaga startDate/endDate quando custom range
  const { data: overview, isLoading: overviewLoading } = useTrafficOverview(
    metaProjectId, days, hasCampaigns ? campaignIds : null,
    customRange?.startDate, customRange?.endDate,
  );
  const { data: campaignData } = useTrafficCampaigns(metaProjectId, days);
  const { data: dailyData, isLoading: dailyLoading } =
    useCampaignDailyInsightsBulk(
      projectId,
      hasCampaigns ? campaignIds : null,
      days,
      customRange?.startDate,
      customRange?.endDate,
    );
  const { data: adSetsData } = useAllAdSets(metaProjectId, days, hasCampaigns ? campaignIds : null);
  const { data: adsData } = useAllAds(metaProjectId, days, hasCampaigns ? campaignIds : null);

  // Story 29.13: resolve utm_medium (adset id) → adset name e utm_content
  // (ad id) → ad name via cache de nomes Meta (/meta-names/resolve, DB 24h).
  // Resolve qualquer id (não só os com insights na janela). Fallback pro id cru.
  const mediumIds = useMemo(
    () => salesData?.porUtmMedium?.map((u) => u.medium) ?? [],
    [salesData],
  );
  const contentIds = useMemo(
    () => salesData?.porUtmContent?.map((u) => u.content) ?? [],
    [salesData],
  );
  const { namesMap: adsetNamesMap } = useResolveMetaNames(projectId, mediumIds, "adset");
  const { namesMap: adNamesMap } = useResolveMetaNames(projectId, contentIds, "ad");
  // Sem campanhas Meta, o Detalhamento "Por Canal" vem da planilha
  // (utm_campaign = campaign id) — resolve id → nome pelo cache Meta.
  const campaignUtmIds = useMemo(
    () => (!hasCampaigns ? salesData?.porUtmCampaign?.map((u) => u.campaign) ?? [] : []),
    [salesData, hasCampaigns],
  );
  const { namesMap: campaignNamesMap } = useResolveMetaNames(projectId, campaignUtmIds, "campaign");

  const { data: compData } = useMetaAdsComparison(
    projectId, funnel.id, stageId ?? null, funnel.compareFunnelId, days,
  );
  const hasComparison = !!(compData && !compData.semDados);
  const compSpend = hasComparison ? compData!.totals.spend : null;

  function calcDelta(current: number | null | undefined, comparison: number | null): number {
    if (current == null || comparison == null || comparison === 0) return 0;
    return ((current - comparison) / Math.abs(comparison)) * 100;
  }

  // Filtered campaigns for this funnel
  const funnelCampaigns = useMemo(() => {
    if (!campaignData) return [];
    const base = campaignData.campaigns.filter((c) => campaignIdSet.has(c.campaignId));
    // Story 29.16: com planilha conectada, Vendas/Receita/ROAS/CAC da tabela de
    // campanha vêm da PLANILHA (match utm_campaign = campaignId). Spend continua Meta.
    // O nome já está na linha (c.campaignName) — não precisa resolver via Meta.
    if (!usingSpreadsheet || !salesData) return base;
    return overlaySpreadsheetMetrics(base, new Map((salesData.porUtmCampaign ?? []).map((u) => [u.campaign, u])));
  }, [campaignData, campaignIdSet, usingSpreadsheet, salesData]);

  // Daily chart data: investment + margin
  // Story 29.4 + 29.7: quando planilha conectada, Receita vem da planilha e
  // Margem usa receita líquida (descontou fees Kiwify/Hotmart). Spend continua Meta.
  // Story 29.9: spend ganha imposto 12.15% para dias >= 2026-01-01.
  //             Receita falla pra Meta se planilha não tem dataVenda mapeada.
  const dailyChartData = useMemo(() => {
    // Fallback: planilha sem dataVenda OU sem rows válidas no range → Meta revenue
    const sheetHasDaily = usingSpreadsheet && salesDataDaily && !salesDataDaily.semDados
      && Object.keys(salesDataDaily.byDay ?? {}).length > 0;
    const sheetByDay = sheetHasDaily ? salesDataDaily!.byDay : {};
    const feeRate = usingSpreadsheet && salesData ? salesData.feeRate : 0;
    // Eixo de dias = união Meta ∪ planilha: dias com venda na planilha mas sem
    // delivery Meta (ou sem campanha vinculada) também entram no gráfico.
    const metaByDate = new Map((dailyData ?? []).map((d) => [d.date_start, d]));
    const allDates = Array.from(
      new Set([...metaByDate.keys(), ...(sheetHasDaily ? Object.keys(sheetByDay) : [])]),
    ).sort();
    if (allDates.length === 0) return [];
    return allDates.map((date) => {
      const d = metaByDate.get(date);
      const spendBruto = d ? safeNum(d.spend) : 0;
      const spendComTax = applyMetaTax(spendBruto, date);
      const taxAmount = metaTaxAmount(spendBruto, date);
      const purchases = d?.actions?.find((a) =>
        a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
      );
      const metaRevenueEntry = d?.action_values?.find((a) =>
        a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
      );
      const metaRevenue = metaRevenueEntry ? parseFloat(metaRevenueEntry.value) : 0;
      const sheetRevenue = sheetByDay[date] ?? 0;
      // Story 29.10: sem planilha de vendas conectada não há fonte de vendas —
      // não herdar receita/margem/vendas do pixel Meta (evita número enganoso).
      // Quando usingSpreadsheet mas sem daily da planilha (não mapeou dataVenda),
      // usa Meta como fallback no gráfico — KPI Receita já mostra total da planilha.
      const revenueBruto = sheetHasDaily ? sheetRevenue : (usingSpreadsheet ? metaRevenue : 0);
      // Story 29.20 (Danilo): margem LÍQUIDA — (Receita × (1−fees)) − Investimento c/ tax.
      const margin = usingSpreadsheet ? (revenueBruto * (1 - feeRate)) - spendComTax : 0;
      const dateLabel = date.slice(5, 10);
      const revenueSource = sheetHasDaily
        ? "Planilha · faturamento bruto por dia"
        : usingSpreadsheet
          ? "Meta Ads · action_values.purchase (fallback: planilha sem dataVenda)"
          : "Sem fonte de vendas conectada · Receita = 0";
      const spendSource = taxAmount > 0
        ? `Meta Ads spend + 12.15% imposto (a partir de ${META_TAX_EFFECTIVE_DATE})`
        : "Meta Ads API · spend (time series)";
      return {
        date: dateLabel,
        spend: spendComTax,
        spendBruto,
        spendTax: taxAmount,
        revenue: revenueBruto,
        margin,
        sales: usingSpreadsheet && purchases ? parseInt(purchases.value) : 0,
        formulasByKey: {
          spend: buildFunnelDailyFormula("Investimento", spendSource, spendComTax, true, dateLabel),
          revenue: buildFunnelDailyFormula("Receita", revenueSource, revenueBruto, true, dateLabel),
          margin: buildFunnelDailyFormula("Margem (Líquida − Spend c/ tax)", "Derivado · (revenue × (1−feeRate)) − (spend × 1.1215)", margin, true, dateLabel),
        },
      };
    });
  }, [dailyData, usingSpreadsheet, salesDataDaily, salesData]);

  // Story 29.9: agregados com tax aplicado — sobrescreve totalSpend do overview
  // (que vem sem tax do Meta). Total tax exposto pra tooltip do KPI Investimento.
  const spendAggregates = useMemo(() => {
    let totalSpendBruto = 0;
    let totalTax = 0;
    for (const d of dailyChartData) {
      totalSpendBruto += d.spendBruto ?? 0;
      totalTax += d.spendTax ?? 0;
    }
    return {
      totalSpendBruto,
      totalTax,
      totalSpendComTax: totalSpendBruto + totalTax,
      hasTax: totalTax > 0,
    };
  }, [dailyChartData]);

  // Epic 29 Story 29.4 — quando planilha conectada, sobrescreve vendas/receita/CAC/margem/ROAS
  // com dados da planilha. Spend continua Meta.
  // Story 29.7: Margem usa faturamentoLiquidoCalculado (descontou fees plataforma).
  // Story 29.9: spend Meta ganha imposto 12.15% para dias >= 2026-01-01 (via spendAggregates).
  const effectiveMetrics = useMemo(() => {
    // Sem campanha Meta vinculada: KPIs 100% da planilha (investimento zero,
    // ROAS/CAC sem sentido → "—"; Margem = receita líquida).
    if (!hasCampaigns) {
      if (!usingSpreadsheet || !salesData) return null;
      const sales = salesData.totalVendas;
      const revenue = salesData.faturamentoBruto;
      const margin = salesData.faturamentoLiquidoCalculado;
      return {
        totalSpend: 0,
        totalSales: sales,
        totalRevenue: revenue,
        cac: null,
        margin,
        marginPercent: revenue > 0 ? (margin / revenue) * 100 : null,
        roas: null,
      };
    }
    if (!overview) return null;
    const effectiveSpend = spendAggregates.totalSpendComTax > 0
      ? spendAggregates.totalSpendComTax
      : overview.totalSpend;

    if (!usingSpreadsheet || !salesData) {
      // Story 29.10: sem planilha de vendas conectada = sem fonte de vendas.
      // NÃO herda vendas/receita do pixel Meta (era o bug — fallback silencioso).
      // Vendas/Receita = 0; derivados (CAC/Margem/ROAS) = null → renderizam "—".
      return {
        ...overview,
        totalSpend: effectiveSpend,
        totalSales: 0,
        totalRevenue: 0,
        cac: null,
        margin: null,
        marginPercent: null,
        roas: null,
      };
    }
    const sales = salesData.totalVendas;
    const revenue = salesData.faturamentoBruto;
    // Story 29.20 (Danilo): Margem = Receita LÍQUIDA (após fees da plataforma) − Investimento.
    const netRevenue = salesData.faturamentoLiquidoCalculado;
    const margin = netRevenue - effectiveSpend;
    return {
      ...overview,
      totalSpend: effectiveSpend,
      totalSales: sales,
      totalRevenue: revenue,
      cac: sales > 0 ? effectiveSpend / sales : null,
      margin,
      marginPercent: revenue > 0 ? (margin / revenue) * 100 : null,
      roas: effectiveSpend > 0 ? revenue / effectiveSpend : null,
    };
  }, [overview, salesData, usingSpreadsheet, spendAggregates, hasCampaigns]);

  // Revenue by audience (ad sets)
  const revenueByAudience = useMemo(() => {
    if (!adSetsData?.adsets) return [];
    return adSetsData.adsets
      .filter((a) => a.revenue && a.revenue > 0)
      .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
      .slice(0, 8)
      .map((a) => ({ name: a.campaignName, revenue: a.revenue ?? 0 }));
  }, [adSetsData]);

  // Revenue by creative (ads)
  const revenueByCreative = useMemo(() => {
    if (!adsData?.ads) return [];
    return adsData.ads
      .filter((a) => a.revenue && a.revenue > 0)
      .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
      .slice(0, 8)
      .map((a) => ({ name: a.campaignName.length > 25 ? a.campaignName.slice(0, 25) + "..." : a.campaignName, revenue: a.revenue ?? 0 }));
  }, [adsData]);

  // Story 29.8: 3 gráficos por UTM da planilha — Canal (utm_source) /
  // Público (utm_medium) / Criativo (utm_content). Substituem os 3 antigos
  // que vinham do Meta (campaign/adset/ad).
  const revenueByCanal = useMemo(() => {
    if (!usingSpreadsheet || !salesData) return [];
    return salesData.porUtmSource.slice(0, 8).map((u) => ({
      name: u.source.length > 25 ? u.source.slice(0, 25) + "..." : u.source,
      revenue: u.bruto,
    }));
  }, [salesData, usingSpreadsheet]);

  const revenueByPublico = useMemo(() => {
    if (!usingSpreadsheet || !salesData) return [];
    // Story 29.13: resolve adset id → nome e re-agrupa (adsets com mesmo nome somam)
    const byName = new Map<string, number>();
    for (const u of salesData.porUtmMedium ?? []) {
      const label = adsetNamesMap.get(u.medium) ?? u.medium;
      byName.set(label, (byName.get(label) ?? 0) + u.bruto);
    }
    return Array.from(byName, ([name, revenue]) => ({
      name: name.length > 25 ? name.slice(0, 25) + "..." : name,
      revenue,
    }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [salesData, usingSpreadsheet, adsetNamesMap]);

  const revenueByCriativo = useMemo(() => {
    if (!usingSpreadsheet || !salesData) return [];
    // Story 29.13: resolve ad id → nome e re-agrupa (ads com mesmo nome somam)
    const byName = new Map<string, number>();
    for (const u of salesData.porUtmContent ?? []) {
      const label = adNamesMap.get(u.content) ?? u.content;
      byName.set(label, (byName.get(label) ?? 0) + u.bruto);
    }
    return Array.from(byName, ([name, revenue]) => ({
      name: name.length > 25 ? name.slice(0, 25) + "..." : name,
      revenue,
    }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [salesData, usingSpreadsheet, adNamesMap]);

  // Legacy (Meta-based) — mantido pra quando NÃO há planilha conectada
  const revenueByCampaign = useMemo(() => {
    return funnelCampaigns
      .filter((c) => c.revenue && c.revenue > 0)
      .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
      .slice(0, 8)
      .map((c) => ({ name: c.campaignName.length > 25 ? c.campaignName.slice(0, 25) + "..." : c.campaignName, revenue: c.revenue ?? 0 }));
  }, [funnelCampaigns]);

  // Table data based on filter
  // Story 29.17: mesma lógica da campanha (29.16) aplicada a adset e ad —
  // Vendas/Receita/ROAS/CAC vêm da PLANILHA por match de UTM, não do Meta.
  // Público (adset) → utm_medium = adset_id · Criativo (ad) → utm_content = ad_id.
  // Spend continua Meta; nome continua vindo da linha (Meta all-adsets/all-ads).
  // Story 29.20 (M1): soma vendas/receita da planilha por NOME resolvido do adset/ad
  // (ids de mesmo nome somam). O backend agrega adset/ad por nome fixando 1 id, então
  // casar por id perdia as vendas dos outros ids. Agora bate com revenueByPublico/Criativo.
  const salesByAdsetName = useMemo(() => {
    const m = new Map<string, { vendas: number; bruto: number }>();
    if (!usingSpreadsheet || !salesData) return m;
    for (const u of salesData.porUtmMedium ?? []) {
      const name = adsetNamesMap.get(u.medium) ?? u.medium;
      const e = m.get(name) ?? { vendas: 0, bruto: 0 };
      e.vendas += u.vendas;
      e.bruto += u.bruto;
      m.set(name, e);
    }
    return m;
  }, [salesData, usingSpreadsheet, adsetNamesMap]);

  const salesByAdName = useMemo(() => {
    const m = new Map<string, { vendas: number; bruto: number }>();
    if (!usingSpreadsheet || !salesData) return m;
    for (const u of salesData.porUtmContent ?? []) {
      const name = adNamesMap.get(u.content) ?? u.content;
      const e = m.get(name) ?? { vendas: 0, bruto: 0 };
      e.vendas += u.vendas;
      e.bruto += u.bruto;
      m.set(name, e);
    }
    return m;
  }, [salesData, usingSpreadsheet, adNamesMap]);

  const funnelAdSets = useMemo(() => {
    const base = adSetsData?.adsets ?? [];
    if (!usingSpreadsheet || !salesData) return base;
    return overlaySpreadsheetMetrics(base, salesByAdsetName, (r) => r.campaignName);
  }, [adSetsData, usingSpreadsheet, salesData, salesByAdsetName]);

  const funnelAds = useMemo(() => {
    const base = adsData?.ads ?? [];
    if (!usingSpreadsheet || !salesData) return base;
    return overlaySpreadsheetMetrics(base, salesByAdName, (r) => r.campaignName);
  }, [adsData, usingSpreadsheet, salesData, salesByAdName]);

  const tableData = useMemo((): CampaignAnalytics[] => {
    // Sem campanha Meta: linhas 100% da planilha, agrupadas por UTM.
    if (!hasCampaigns) {
      if (!usingSpreadsheet || !salesData) return [];
      switch (tableFilter) {
        case "campaign":
          return (salesData.porUtmCampaign ?? []).map((u) =>
            sheetOnlyRow(u.campaign, campaignNamesMap.get(u.campaign) ?? u.campaign, u.vendas, u.bruto));
        case "adset":
          return Array.from(salesByAdsetName, ([name, v]) => sheetOnlyRow(name, name, v.vendas, v.bruto));
        case "ad":
          return Array.from(salesByAdName, ([name, v]) => sheetOnlyRow(name, name, v.vendas, v.bruto));
        default: return [];
      }
    }
    switch (tableFilter) {
      case "campaign": return funnelCampaigns;
      case "adset": return funnelAdSets;
      case "ad": return funnelAds;
      default: return [];
    }
  }, [tableFilter, funnelCampaigns, funnelAdSets, funnelAds, hasCampaigns, usingSpreadsheet, salesData, campaignNamesMap, salesByAdsetName, salesByAdName]);

  // Story 29.20 (Danilo): fee rate da plataforma pra Margem LÍQUIDA por linha.
  const detailFeeRate = usingSpreadsheet && salesData ? salesData.feeRate : 0;
  // Story 29.19: normaliza nomes (tira " — Cópia") e agrupa a cópia no nome base.
  // Merge (>1 membro) soma métricas e re-deriva taxas; membro único fica intacto.
  const detailRows = useMemo<DetailRow[]>(() => {
    const groups = new Map<string, CampaignAnalytics[]>();
    for (const row of tableData) {
      const name = normalizeCampaignName(row.campaignName);
      const arr = groups.get(name) ?? [];
      arr.push(row);
      groups.set(name, arr);
    }
    return Array.from(groups.entries()).map(([name, members]) => {
      let base: CampaignAnalytics;
      if (members.length === 1) {
        base = { ...members[0], campaignName: name };
      } else {
        const spend = members.reduce((s, m) => s + m.spend, 0);
        const impressions = members.reduce((s, m) => s + m.impressions, 0);
        const clicks = members.reduce((s, m) => s + m.clicks, 0);
        const linkClicks = members.reduce((s, m) => s + (m.linkClicks ?? 0), 0);
        const revenue = members.reduce((s, m) => s + (m.revenue ?? 0), 0);
        const sales = members.reduce((s, m) => s + (m.sales ?? 0), 0);
        base = {
          ...members[0],
          campaignName: name,
          spend, impressions, clicks, revenue, sales,
          linkClicks: linkClicks > 0 ? linkClicks : null,
          // Story 29.20 (M2): CTR/CPC de LINK clicks (fallback total) — igual buildAnalyticsRow.
          ctr: linkClicks > 0 && impressions > 0 ? (linkClicks / impressions) * 100 : (impressions > 0 ? (clicks / impressions) * 100 : 0),
          cpc: linkClicks > 0 ? spend / linkClicks : (clicks > 0 ? spend / clicks : 0),
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
          roas: spend > 0 ? revenue / spend : null,
          costPerSale: sales > 0 ? spend / sales : null,
        };
      }
      const grossRevenue = base.revenue ?? 0;
      const sales = base.sales ?? 0;
      // Story 29.20 (Danilo): Margem = Receita LÍQUIDA (após fees) − Investimento.
      const netRevenue = grossRevenue * (1 - detailFeeRate);
      const margin = netRevenue - base.spend;
      return {
        ...base,
        marginPct: grossRevenue > 0 ? (margin / grossRevenue) * 100 : null,
        marginPerSale: sales > 0 ? margin / sales : null,
      };
    });
  }, [tableData, detailFeeRate]);

  const sortedRows = useMemo<DetailRow[]>(() => {
    if (!sortCol) return detailRows;
    const num = (v: number | null | undefined) => (v == null ? Number.NEGATIVE_INFINITY : v);
    const key = (r: DetailRow): number | string => {
      switch (sortCol) {
        case "dimension": return r.campaignName.toLowerCase();
        case "spend": return num(r.spend);
        case "revenue": return num(r.revenue);
        case "cac": return num(r.costPerSale);
        case "roas": return num(r.roas);
        case "marginPct": return num(r.marginPct);
        case "marginPerSale": return num(r.marginPerSale);
        case "ctr": return num(r.ctr);
        case "cpc": return num(r.cpc);
        case "cpm": return num(r.cpm);
        default: return 0;
      }
    };
    return [...detailRows].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (typeof ka === "string" && typeof kb === "string") {
        return sortDir === "asc" ? ka.localeCompare(kb) : kb.localeCompare(ka);
      }
      return sortDir === "asc" ? (ka as number) - (kb as number) : (kb as number) - (ka as number);
    });
  }, [detailRows, sortCol, sortDir]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("desc");
    }
  };
  const sortArrow = (col: string) => (sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  // Sem campanha E sem planilha conectada: nenhuma fonte de dados — empty state.
  // Com planilha conectada, o dashboard renderiza normalmente só com dados dela.
  if (!hasCampaigns && !perpetualSpreadsheet) {
    return (
      <>
        <div className="rounded-xl border border-dashed border-border/30 p-12 text-center space-y-3">
          <LinkIcon className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Nenhuma campanha vinculada a este funil.</p>
          <p className="text-sm text-muted-foreground">
            Edite o funil para vincular campanhas do Meta Ads — ou conecte a planilha de
            vendas para ver os dados dela mesmo sem tráfego rodando.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setShowSpreadsheetWizard(true)}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Conectar planilha
          </Button>
        </div>
        <PerpetualSpreadsheetWizardDialog
          projectId={projectId}
          funnelId={funnel.id}
          current={perpetualSpreadsheet ?? null}
          open={showSpreadsheetWizard}
          onOpenChange={setShowSpreadsheetWizard}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <DayRangePicker
            days={days}
            onDaysChange={setDays}
            onRangeChange={setCustomRange}
          />
          <RefreshDataButton />
          <MetaFreshnessBadge projectId={projectId} />
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 text-xs ${perpetualSpreadsheet ? "border-emerald-500/40 text-emerald-400 hover:text-emerald-300" : ""}`}
            onClick={() => setShowSpreadsheetWizard(true)}
          >
            {perpetualSpreadsheet ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="max-w-[180px] truncate">{perpetualSpreadsheet.spreadsheetName}</span>
                <span className="text-muted-foreground/70">(editar)</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Conectar planilha
              </>
            )}
          </Button>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowCampaignManager(!showCampaignManager)}>
          <Settings2 className="h-3.5 w-3.5" />
          {funnel.campaigns.length} campanha{funnel.campaigns.length !== 1 ? "s" : ""}
        </Button>
      </div>

      <PerpetualSpreadsheetWizardDialog
        projectId={projectId}
        funnelId={funnel.id}
        current={perpetualSpreadsheet ?? null}
        open={showSpreadsheetWizard}
        onOpenChange={setShowSpreadsheetWizard}
      />

      {showCampaignManager && pickerData && (
        <div className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Gerenciar campanhas do funil</p>
          <CampaignSelector
            campaigns={pickerData.campaigns ?? []}
            accountLinked={pickerData.accountLinked}
            value={funnel.campaigns}
            onChange={(campaigns: FunnelCampaign[]) => {
              if (onCampaignsChange) {
                onCampaignsChange(campaigns);
              } else {
                updateFunnel.mutate({ campaigns }, { onSuccess: () => toast.success("Campanhas atualizadas!") });
              }
            }}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* KPIs PRINCIPAIS                                                  */}
      {/* ================================================================ */}
      {overviewLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : effectiveMetrics ? (
        (() => {
          const f = { days, funnelType: "perpetual" as const, funnelName: funnel?.name };
          const m = effectiveMetrics;
          // Marca KPIs cuja fonte mudou pra planilha
          const fromSheet = usingSpreadsheet;
          // Story 29.10: sem planilha = sem fonte de vendas → aviso nos cards de venda
          const noSalesSource = !usingSpreadsheet;
          return (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
              <MetricTooltip label="ROAS" value={fmtRoas(m.roas)} formula={buildFunnelRoasFormula(m.roas, f)}>
                <KpiCard icon={Target} label="ROAS" value={fmtRoas(m.roas)} target={2} actual={m.roas} hintTooltip fromSheet={fromSheet} />
              </MetricTooltip>
              <InvestmentBreakdownTooltip
                spendBruto={spendAggregates.totalSpendBruto}
                spendTax={spendAggregates.totalTax}
                spendComTax={m.totalSpend}
                hasTax={spendAggregates.hasTax}
              >
                <KpiCard icon={DollarSign} label="Investimento" value={fmtCurrency(m.totalSpend)} hintTooltip
                  comparison={compSpend !== null && m.totalSpend != null ? {
                    display: fmtCurrency(compSpend),
                    delta: calcDelta(m.totalSpend, compSpend),
                    higherIsBetter: false,
                  } : undefined}
                />
              </InvestmentBreakdownTooltip>
              <MetricTooltip label="Vendas" value={fmtNumber(m.totalSales)} formula={buildFunnelSalesCountFormula(m.totalSales, f)}>
                <KpiCard icon={ShoppingCart} label="Vendas" value={fmtNumber(m.totalSales)} hintTooltip fromSheet={fromSheet} warning={noSalesSource ? "Conectar fonte de vendas" : undefined} />
              </MetricTooltip>
              <MetricTooltip label="Receita" value={fmtCurrency(m.totalRevenue)} formula={buildFunnelRevenueFormula(m.totalRevenue, f)}>
                <KpiCard icon={DollarSign} label="Receita" value={fmtCurrency(m.totalRevenue)} hintTooltip fromSheet={fromSheet} warning={noSalesSource ? "Conectar fonte de vendas" : undefined} />
              </MetricTooltip>
              <MetricTooltip label="CAC" value={fmtCurrency(m.cac)} formula={buildFunnelCacFormula(m.cac, f)}>
                <KpiCard icon={DollarSign} label="CAC" value={fmtCurrency(m.cac)} hintTooltip fromSheet={fromSheet} />
              </MetricTooltip>
              <MarginBreakdownTooltip
                receitaBruta={m.totalRevenue}
                spend={m.totalSpend}
                margin={m.margin}
                platform={usingSpreadsheet ? salesData?.platform : null}
              >
                <KpiCard icon={DollarSign} label="Margem" value={fmtCurrency(m.margin)} hintTooltip fromSheet={fromSheet} signValue={m.margin} />
              </MarginBreakdownTooltip>
              <MetricTooltip label="Margem %" value={fmtPercent(m.marginPercent)} formula={buildFunnelMarginPercentFormula(m.marginPercent, f)}>
                <KpiCard icon={BarChart3} label="Margem %" value={fmtPercent(m.marginPercent)} hintTooltip fromSheet={fromSheet} />
              </MetricTooltip>
            </div>
          );
        })()
      ) : <EmptyState />}

      {/* ================================================================ */}
      {/* TAXAS DE CONVERSÃO                                               */}
      {/* ================================================================ */}
      {overview && (overview.connectRate || overview.checkoutRate || overview.checkoutConversionRate) && (() => {
        const f = { days, funnelType: "perpetual" as const, funnelName: funnel?.name };
        return (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <MetricTooltip label="Connect Rate" value={overview.connectRate != null ? `${overview.connectRate.toFixed(2)}%` : "—"} formula={buildFunnelRateFormula("Connect Rate", "Landing Page Views ÷ Link Clicks × 100", overview.connectRate, f)}>
              <RateCard label="Connect Rate" sublabel="Landing Page / Link Clicks" value={overview.connectRate} hintTooltip />
            </MetricTooltip>
            <MetricTooltip label="Taxa Visita Checkout" value={overview.checkoutRate != null ? `${overview.checkoutRate.toFixed(2)}%` : "—"} formula={buildFunnelRateFormula("Taxa Visita Checkout", "Checkout ÷ Link Clicks × 100", overview.checkoutRate, f)}>
              <RateCard label="Taxa Visita Checkout" sublabel="Checkout / Link Clicks" value={overview.checkoutRate} hintTooltip />
            </MetricTooltip>
            <MetricTooltip label="Taxa Conversão Checkout" value={overview.checkoutConversionRate != null ? `${overview.checkoutConversionRate.toFixed(2)}%` : "—"} formula={buildFunnelRateFormula("Taxa Conversão Checkout", "Compra ÷ Checkout × 100", overview.checkoutConversionRate, f)}>
              <RateCard label="Taxa Conversao Checkout" sublabel="Compra / Checkout" value={overview.checkoutConversionRate} hintTooltip />
            </MetricTooltip>
          </div>
        );
      })()}

      {/* ================================================================ */}
      {/* GRÁFICOS EM LINHA: Investimento + Margem no tempo                */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 gap-6">
        {/* Story 29.15: Margem no Tempo (barras verde/vermelho) fica em cima */}
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-1">Margem no Tempo</h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            Margem líquida por dia (com fees) · <span className="text-emerald-400">verde = positiva</span> · <span className="text-red-400">vermelho = negativa</span>
          </p>
          {dailyLoading ? <Skeleton className="h-48" /> : dailyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyChartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#fff" }} stroke="var(--color-muted-foreground)" />
                <YAxis tick={{ fontSize: 11, fill: "#fff" }} stroke="var(--color-muted-foreground)" tickFormatter={(v) => fmtCurrencyCompact(v)} />
                <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.12 }} content={<DailyResultTooltip />} />
                <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
                <Bar dataKey="margin" name="Margem" radius={[2, 2, 0, 0]}>
                  {dailyChartData.map((d, i) => (
                    <Cell key={i} fill={d.margin >= 0 ? "hsl(150 60% 45%)" : "hsl(0 72% 55%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>

        {/* Story 29.15: Investimento no Tempo — linha, valor a cada 7 dias.
            Sem campanha vinculada não há investimento — oculta o gráfico. */}
        {hasCampaigns && (
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-1">Investimento no Tempo</h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            Investimento (Meta, com imposto) por dia · valor exibido a cada 7 dias
          </p>
          {dailyLoading ? <Skeleton className="h-48" /> : dailyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dailyChartData} margin={{ top: 24, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#fff" }} stroke="var(--color-muted-foreground)" />
                <YAxis tick={{ fontSize: 11, fill: "#fff" }} stroke="var(--color-muted-foreground)" tickFormatter={(v) => fmtCurrencyCompact(v)} />
                <Tooltip content={<FormulaChartTooltip />} />
                <Line type="monotone" dataKey="spend" stroke="hsl(47 98% 54%)" strokeWidth={2} dot={{ r: 2, fill: "hsl(47 98% 54%)" }} name="Investimento">
                  <LabelList dataKey="spend" content={<Spend7DayLabel />} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* TABELA DETALHADA COM FILTRO — Story 29.18: movida pra baixo do gráfico */}
      {/* ================================================================ */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Detalhamento
          </h3>
          <div className="flex items-center gap-2">
            {/* Story 29.19: largura da coluna Dimensão */}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="hidden sm:inline">Dimensão</span>
              <button
                type="button"
                onClick={() => setDimWidth((w) => Math.max(120, w - 40))}
                className="h-6 w-6 rounded border border-border/40 hover:bg-muted/40 leading-none"
                title="Diminuir coluna Dimensão"
              >−</button>
              <button
                type="button"
                onClick={() => setDimWidth((w) => Math.min(480, w + 40))}
                className="h-6 w-6 rounded border border-border/40 hover:bg-muted/40 leading-none"
                title="Aumentar coluna Dimensão"
              >+</button>
            </div>
            <Select value={tableFilter} onValueChange={(v) => setTableFilter(v as typeof tableFilter)}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="campaign">Por Canal</SelectItem>
                <SelectItem value="adset">Por Publico</SelectItem>
                <SelectItem value="ad">Por Criativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/20">
                <th style={{ width: dimWidth, minWidth: dimWidth }} className="text-left py-2 pr-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("dimension")}>Dimensao{sortArrow("dimension")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("spend")}>Invest.{sortArrow("spend")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("revenue")}>Receita{sortArrow("revenue")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("cac")}>CAC{sortArrow("cac")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("roas")}>ROAS{sortArrow("roas")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("marginPct")}>Margem %{sortArrow("marginPct")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("marginPerSale")}>Margem/Venda{sortArrow("marginPerSale")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("ctr")}>CTR (link){sortArrow("ctr")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("cpc")}>CPC (link){sortArrow("cpc")}</th>
                <th className="text-right pl-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("cpm")}>CPM{sortArrow("cpm")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={10} className="py-6 text-center text-muted-foreground">Sem dados</td></tr>
              ) : sortedRows.map((row) => {
                const f = { days, funnelType: "perpetual" as const, funnelName: funnel?.name };
                const marginPct = row.marginPct;
                const marginPerSale = row.marginPerSale;
                const path: EntityPath =
                  tableFilter === "campaign" ? { campaign: row.campaignName }
                  : tableFilter === "adset" ? { adset: row.campaignName }
                  : { ad: row.campaignName };
                const renderCell = (
                  col: string,
                  label: string,
                  value: string,
                  formula: ReturnType<typeof enrichFormulaForEntity>,
                  className: string,
                ) => {
                  if (!formula) return <td key={col} className={className}>{value}</td>;
                  return (
                    <td key={col} className={className}>
                      <MetricTooltip label={label} value={value} formula={formula}>
                        <span className="cursor-help underline decoration-dotted decoration-border/60 underline-offset-2">
                          {value}
                        </span>
                      </MetricTooltip>
                    </td>
                  );
                };
                const cells: Array<[string, string, string, ReturnType<typeof enrichFormulaForEntity>, string]> = [
                  ["spend", "Investimento", fmtCurrency(row.spend), enrichFormulaForEntity(buildFunnelSpendFormula(row.spend, f), path), "text-right px-2 tabular-nums"],
                  ["revenue", "Receita", fmtCurrency(row.revenue), enrichFormulaForEntity(buildFunnelRevenueFormula(row.revenue, f), path), "text-right px-2 tabular-nums"],
                  ["cac", "CAC", fmtCurrency(row.costPerSale), enrichFormulaForEntity(buildFunnelCacFormula(row.costPerSale ?? null, f), path), "text-right px-2 tabular-nums"],
                  ["roas", "ROAS", fmtRoas(row.roas), enrichFormulaForEntity(buildFunnelRoasFormula(row.roas ?? null, f), path), `text-right px-2 tabular-nums font-medium ${roasColorClass(row.roas)}`],
                  ["marginPct", "Margem %", fmtPercent(marginPct), enrichFormulaForEntity(buildFunnelMarginPercentFormula(marginPct, f), path), `text-right px-2 tabular-nums font-medium ${marginColorClass(marginPct)}`],
                  ["marginPerSale", "Margem/Venda", fmtCurrency(marginPerSale), enrichFormulaForEntity(buildFunnelMarginFormula(marginPerSale, f), path), `text-right px-2 tabular-nums font-medium ${marginColorClass(marginPerSale)}`],
                  ["ctr", "CTR", fmtPercent(row.ctr), enrichFormulaForEntity(buildFunnelCtrFormula(row.ctr, f), path), "text-right px-2 tabular-nums"],
                  ["cpc", "CPC", fmtCurrency(row.cpc), enrichFormulaForEntity(buildFunnelCpcFormula(row.cpc, f), path), "text-right px-2 tabular-nums"],
                  ["cpm", "CPM", fmtCurrency(row.cpm), enrichFormulaForEntity(buildFunnelCpmFormula(row.cpm, f), path), "text-right pl-2 tabular-nums"],
                ];
                return (
                  <tr key={row.campaignName} className="border-b border-border/10 hover:bg-muted/5">
                    <td className="py-2 pr-3 font-medium truncate" style={{ maxWidth: dimWidth, width: dimWidth }}>{row.campaignName}</td>
                    {cells.map(([col, label, value, formula, cls]) => renderCell(col, label, value, formula, cls))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================================================================ */}
      {/* GRÁFICOS EM BARRAS HORIZONTAIS — Story 29.8: 3 gráficos via UTM da planilha
            Canal (utm_source) / Público (utm_medium) / Criativo (utm_content).
            Sem planilha: fallback pros gráficos Meta legacy (campaign/adset/ad). */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {usingSpreadsheet ? (
          <>
            <HBarChart
              title="Receita por Canal (utm_source)"
              data={revenueByCanal}
              funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
              entityType="campaign"
            />
            <HBarChart
              title="Receita por Público (utm_medium)"
              data={revenueByPublico}
              funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
              entityType="adset"
            />
            <HBarChart
              title="Receita por Criativo (utm_content)"
              data={revenueByCriativo}
              funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
              entityType="ad"
            />
          </>
        ) : (
          <>
            <HBarChart
              title="Receita por Canal"
              data={revenueByCampaign}
              funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
              entityType="campaign"
            />
            <HBarChart
              title="Receita por Publico"
              data={revenueByAudience}
              funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
              entityType="adset"
            />
            <HBarChart
              title="Receita por Criativo"
              data={revenueByCreative}
              funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
              entityType="ad"
            />
          </>
        )}
      </div>

      {/* ================================================================ */}
      {/* TOP CRIATIVOS — precisa de campanhas Meta (sem filtro viria o projeto inteiro) */}
      {/* ================================================================ */}
      {hasCampaigns && (
      <TopCreativesGallery
        projectId={projectId}
        days={days}
        campaignIds={campaignIds}
        funnelId={funnel.id}
        stageId={stageId}
        funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
        defaultShowAll
        startDate={customRange?.startDate}
        endDate={customRange?.endDate}
      />
      )}

      {/* Dashboard Financeiro — apenas etapas pagas (Story 19.6) */}
      {stageType === "paid" && stageId && (
        <div className="space-y-6 pt-2 border-t border-border/30">
          <h3 className="text-base font-semibold">Vendas</h3>
          <StageSalesSection
            projectId={projectId}
            funnelId={funnel.id}
            stageId={stageId}
            subtype="capture"
            title="Vendas de Captação"
            days={days}
            stageType={stageType}
          />
          <div className="border-t border-border/20" />
          <StageSalesSection
            projectId={projectId}
            funnelId={funnel.id}
            stageId={stageId}
            subtype="main_product"
            title="Produto Principal"
            days={days}
            stageType={stageType}
          />
        </div>
      )}

    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

// Story 29.8: Tooltip detalhado da Margem mostrando breakdown completo dos
// fees por plataforma (reembolso, marketplace, imposto, outros) em R$ + spend.
const PLATFORM_FEE_BREAKDOWN: Record<string, { label: string; rate: number }[]> = {
  kiwify: [
    { label: "Reembolso", rate: 0.04 },
    { label: "Marketplace (Kiwify)", rate: 0.0499 },
    { label: "Imposto", rate: 0.11 },
    { label: "Outros custos", rate: 0.01 },
  ],
  hotmart: [
    { label: "Reembolso", rate: 0.04 },
    { label: "Marketplace (Hotmart)", rate: 0.10 },
    { label: "Imposto", rate: 0.11 },
    { label: "Outros custos", rate: 0.01 },
  ],
};

function MarginBreakdownTooltip({
  receitaBruta,
  spend,
  margin,
  platform,
  children,
}: {
  receitaBruta: number | null | undefined;
  spend: number | null | undefined;
  margin: number | null | undefined;
  platform: string | null | undefined;
  children: React.ReactNode;
}) {
  const bruto = receitaBruta ?? 0;
  const sp = spend ?? 0;
  const breakdown = platform ? PLATFORM_FEE_BREAKDOWN[platform] : null;
  const totalFeeRate = breakdown ? breakdown.reduce((s, b) => s + b.rate, 0) : 0;
  const receitaLiquida = bruto * (1 - totalFeeRate);

  return (
    <UITooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="p-0 max-w-[360px]">
        <div className="bg-popover text-popover-foreground text-xs p-3 space-y-2 rounded-md border border-border">
          <div className="font-semibold text-sm border-b border-border/30 pb-1.5">
            Memorial: Margem
          </div>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Receita Bruta</span>
              <span className="tabular-nums font-medium">{fmtCurrency(bruto)}</span>
            </div>

            {breakdown && (
              <>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider pt-1.5 border-t border-border/20">
                  Descontos da plataforma ({platform})
                </div>
                {breakdown.map((b) => {
                  const valor = bruto * b.rate;
                  return (
                    <div key={b.label} className="flex justify-between gap-4 text-[11px]">
                      <span className="text-muted-foreground">
                        − {b.label} ({(b.rate * 100).toFixed(2)}%)
                      </span>
                      <span className="tabular-nums text-red-400">
                        −{fmtCurrency(valor)}
                      </span>
                    </div>
                  );
                })}
                <div className="flex justify-between gap-4 pt-1.5 border-t border-border/20">
                  <span className="font-medium">Receita Líquida</span>
                  <span className="tabular-nums font-medium">{fmtCurrency(receitaLiquida)}</span>
                </div>
              </>
            )}

            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">− Investimento (Meta)</span>
              <span className="tabular-nums text-red-400">−{fmtCurrency(sp)}</span>
            </div>
            <div className="flex justify-between gap-4 pt-1.5 border-t border-border/30">
              <span className="font-semibold">= Margem</span>
              <span className={`tabular-nums font-semibold ${(margin ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmtCurrency(margin)}
              </span>
            </div>
          </div>
        </div>
      </TooltipContent>
    </UITooltip>
  );
}

// Story 29.9: Tooltip do Investimento mostra breakdown Meta spend + imposto 12.15%
function InvestmentBreakdownTooltip({
  spendBruto,
  spendTax,
  spendComTax,
  hasTax,
  children,
}: {
  spendBruto: number;
  spendTax: number;
  spendComTax: number;
  hasTax: boolean;
  children: React.ReactNode;
}) {
  return (
    <UITooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="p-0 max-w-[360px]">
        <div className="bg-popover text-popover-foreground text-xs p-3 space-y-2 rounded-md border border-border">
          <div className="font-semibold text-sm border-b border-border/30 pb-1.5">
            Memorial: Investimento
          </div>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Meta Ads (spend bruto)</span>
              <span className="tabular-nums font-medium">{fmtCurrency(spendBruto)}</span>
            </div>
            {hasTax && (
              <>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider pt-1.5 border-t border-border/20">
                  Imposto sobre Meta Ads (a partir de {META_TAX_EFFECTIVE_DATE})
                </div>
                <div className="flex justify-between gap-4 text-[11px]">
                  <span className="text-muted-foreground">
                    + Imposto ({(META_TAX_RATE * 100).toFixed(2)}%)
                  </span>
                  <span className="tabular-nums text-amber-400">
                    +{fmtCurrency(spendTax)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 pt-1.5 border-t border-border/30">
                  <span className="font-semibold">= Investimento total</span>
                  <span className="tabular-nums font-semibold">{fmtCurrency(spendComTax)}</span>
                </div>
              </>
            )}
            {!hasTax && (
              <div className="text-[10px] text-muted-foreground pt-1 italic">
                Período sem incidência de imposto (anterior a {META_TAX_EFFECTIVE_DATE}).
              </div>
            )}
          </div>
        </div>
      </TooltipContent>
    </UITooltip>
  );
}

const KpiCard = React.forwardRef<HTMLDivElement, {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string;
  target?: number; actual?: number | null; hintTooltip?: boolean;
  comparison?: { display: string; delta: number; higherIsBetter: boolean };
  fromSheet?: boolean;
  /** Story 29.10: aviso âmbar (ex: "Conectar fonte de vendas") quando falta fonte de dados. */
  warning?: string;
  /** Story 29.15: colore o card por sinal do valor (verde > 0, vermelho ≤ 0). Ex: Margem. */
  signValue?: number | null;
} & React.HTMLAttributes<HTMLDivElement>>(function KpiCard(
  { icon: Icon, label, value, target, actual, hintTooltip, comparison, fromSheet, warning, signValue, className, ...rest },
  ref,
) {
  const isRoas = target !== undefined;
  const roasOk = isRoas && actual != null && actual >= target;
  const roasBad = isRoas && actual != null && actual < target;
  // Story 29.15: coloração por sinal (ex: Margem — vermelho ≤ 0, verde > 0)
  const signPos = signValue != null && signValue > 0;
  const signNeg = signValue != null && signValue <= 0;

  return (
    <div
      ref={ref}
      {...rest}
      className={`relative rounded-xl border p-3 hover:border-border/50 transition-colors ${hintTooltip ? "cursor-help" : ""} ${
        signPos ? "border-emerald-500/30 bg-emerald-500/5"
          : signNeg ? "border-red-500/30 bg-red-500/5"
          : roasOk ? "border-emerald-500/30 bg-emerald-500/5"
          : roasBad ? "border-red-500/30 bg-red-500/5"
          : "border-border/30 bg-gradient-to-br from-card/80 to-card/40"
      } ${className ?? ""}`}
    >
      {fromSheet && (
        <span className="absolute top-1 right-1 text-[9px] text-emerald-400/80" title="Dado vindo da planilha conectada">📄</span>
      )}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p className={`text-xl font-bold tracking-tight ${signPos ? "text-emerald-400" : signNeg ? "text-red-400" : ""} ${hintTooltip ? "underline decoration-dotted decoration-muted-foreground/40 underline-offset-4" : ""}`}>{value}</p>
      {warning && (
        <p className="mt-1 flex items-center gap-1 text-[10px] font-medium leading-tight text-amber-500/90">
          <span aria-hidden>⚠️</span> {warning}
        </p>
      )}
      {comparison && (
        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 leading-tight">
          <span>vs {comparison.display}</span>
          {comparison.delta !== 0 && (
            <span className={
              (comparison.delta > 0) === comparison.higherIsBetter
                ? "text-emerald-400"
                : "text-red-400"
            }>
              {comparison.delta > 0 ? "▲" : "▼"} {Math.abs(comparison.delta).toFixed(1)}%
            </span>
          )}
        </div>
      )}
      {isRoas && (
        <p className="text-[9px] text-muted-foreground mt-0.5">
          Meta: {target}x {roasOk ? <span className="text-emerald-500">OK</span> : <span className="text-red-400">Abaixo</span>}
        </p>
      )}
    </div>
  );
});

const RateCard = React.forwardRef<
  HTMLDivElement,
  { label: string; sublabel: string; value: number | null; hintTooltip?: boolean } & React.HTMLAttributes<HTMLDivElement>
>(function RateCard({ label, sublabel, value, hintTooltip, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      {...rest}
      className={`rounded-xl border border-border/30 bg-card/60 p-4 ${hintTooltip ? "cursor-help" : ""} ${className ?? ""}`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-[10px] text-muted-foreground mb-2">{sublabel}</p>
      <p className={`text-2xl font-bold ${hintTooltip ? "underline decoration-dotted decoration-muted-foreground/40 underline-offset-4" : ""}`}>{fmtPercent(value)}</p>
    </div>
  );
});

function HBarChart({ title, data, funnelContext, entityType }: {
  title: string;
  data: { name: string; revenue: number }[];
  funnelContext: { days: number; funnelType: "perpetual"; funnelName?: string };
  entityType: "campaign" | "adset" | "ad";
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-4">{title}</h3>
        <p className="text-xs text-muted-foreground py-4 text-center">Sem dados de receita</p>
      </div>
    );
  }
  const enrichedData = data.map((d) => {
    const path: EntityPath =
      entityType === "campaign" ? { campaign: d.name }
      : entityType === "adset" ? { adset: d.name }
      : { ad: d.name };
    return {
      ...d,
      formula: enrichFormulaForEntity(buildFunnelRevenueFormula(d.revenue, funnelContext), path),
    };
  });
  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5">
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
        <BarChart data={enrichedData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#fff" }} tickFormatter={(v) => fmtCurrency(v)} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: "#fff" }} />
          <Tooltip content={<FormulaChartTooltip />} />
          <Bar dataKey="revenue" fill="hsl(150 60% 50%)" radius={[0, 4, 4, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-muted-foreground">Sem dados no periodo selecionado.</p>
      <p className="text-xs text-muted-foreground mt-1">Tente selecionar um periodo diferente.</p>
    </div>
  );
}
