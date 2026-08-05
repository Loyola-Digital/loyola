"use client";

import * as React from "react";
import { useState, useMemo, useEffect } from "react";
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
  Undo2,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Receipt,
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
  // Story 29.32: os 3 gráficos de linha×área precisam de eixo duplo.
  ComposedChart,
  Area,
  Legend,
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { PerpetualUpsellSection } from "./perpetual-upsell-section";
import { PerpetualUpsellWizardDialog } from "./perpetual-upsell-wizard-dialog";
import { usePerpetualUpsellSpreadsheet } from "@/lib/hooks/use-perpetual-upsell";
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
import {
  aggregateSeriesByGranularity,
  type ChartGranularity,
} from "@/lib/utils/chart-granularity";
import { deriveDetailMetrics } from "@/lib/utils/perpetual-detail-metrics";

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

// Story 29.23: contagem de uma action por dia (link_click, landing_page_view…)
// a partir do array `actions` de um CampaignDailyInsight.
function dailyActionCount(
  actions: Array<{ action_type: string; value: string }> | undefined,
  type: string,
): number {
  const a = actions?.find((x) => x.action_type === type);
  return a ? safeNum(a.value) : 0;
}

// ============================================================
// Story 29.23: QUADRO DE DADOS DIÁRIOS (tabela por dia)
// ============================================================

interface PerpetualDailyRow {
  date: string;
  dateIso: string;
  spend: number; // Investimento com imposto 12,15%
  revenue: number; // Faturamento bruto
  margin: number; // Margem de Contribuição (líquida − spend c/ tax)
  salesCount: number;
  impressions: number;
  linkClicks: number;
  lpViews: number;
}

// Story 29.33: quadro enxuto — só o que decide investimento. As 8 colunas de
// mídia (Ticket Médio, Tx Conv., Cliques, Impressões, CPM, CPC, CTR, Connect
// Rate) saíram: quem opera abre este quadro para responder "o dia deu lucro ou
// prejuízo?", e varrer eficiência de mídia para chegar nisso custa uma rolagem
// horizontal. Elas seguem disponíveis por dimensão no Detalhamento.
//
// ATENÇÃO ao editar: o header itera este array, mas o CORPO e o RODAPÉ são
// células posicionais. Mudar a ordem aqui sem mudar lá desalinha os números
// dos títulos — sem erro de tipo, sem erro em runtime, só valor na coluna
// errada. As três listas andam juntas.
//
// `title` = memorial da fórmula (tooltip no header, padrão de 18.58/18.60).
const PERPETUAL_DAILY_COLUMNS: Array<{ label: string; title: string }> = [
  { label: "Investimento", title: "Gasto Meta do dia + imposto de 12,15% (a partir de 2026-01-01)" },
  { label: "Faturamento Bruto", title: "Faturamento bruto do dia (planilha; fallback pixel Meta)" },
  { label: "Margem", title: "Faturamento Líquido (após fees da plataforma) − Investimento c/ imposto" },
  { label: "Margem %", title: "Margem ÷ Faturamento Bruto × 100" },
  { label: "Vendas", title: "Contagem de vendas do dia (planilha; fallback pixel Meta)" },
  { label: "CAC", title: "Investimento ÷ Vendas" },
  { label: "ROAS", title: "Faturamento Bruto ÷ Investimento" },
];

// Story 29.25: paginação do Quadro de Dados Diários — 16 linhas por página.
const PERPETUAL_DAILY_PAGE_SIZE = 16;

function PerpetualDailyTable({ rows }: { rows: PerpetualDailyRow[] }) {
  // Guarda de divisão: denominador 0 → null → "—" (nunca NaN/Infinity).
  const div = (n: number, d: number): number | null => (d > 0 ? n / d : null);

  // Story 29.25: paginação (16/página). Estado antes de qualquer early-return
  // (Rules of Hooks). Reset p/ página 0 quando o range/filtro muda (rows nova ref).
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => {
    setPageIndex(0);
  }, [rows]);

  // Story 29.32: ordenação por dia. Padrão "desc" = dia mais recente primeiro —
  // quem opera abre o painel para ver ontem, não o primeiro dia do período.
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Story 29.32 (AC2b): a ordenação vale para o CONJUNTO INTEIRO; a paginação
  // só fatia a visualização depois. Ordenar após o slice deixaria cada página
  // ordenada isoladamente — erro silencioso, visível só ao virar de página.
  // `dateIso` é a chave confiável: `date` é só "MM-DD" e é ambíguo na virada de ano.
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) =>
      sortDir === "asc" ? a.dateIso.localeCompare(b.dateIso) : b.dateIso.localeCompare(a.dateIso),
    );
    return copy;
  }, [rows, sortDir]);

  // Story 29.25: totais do PERÍODO INTEIRO (não da página) — aditivas somam;
  // derivadas recalculadas pelos totais na renderização do rodapé (AC2).
  // Story 29.33: só as 4 aditivas que sobreviveram ao enxugamento. Impressões,
  // cliques e LP views saíram junto com as colunas de mídia que as consumiam.
  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        spend: a.spend + r.spend,
        revenue: a.revenue + r.revenue,
        margin: a.margin + r.margin,
        salesCount: a.salesCount + r.salesCount,
      }),
      { spend: 0, revenue: 0, margin: 0, salesCount: 0 },
    );
  }, [rows]);

  // Cor do rodapé: Margem e Margem % compartilham o sinal do total do período.
  const totalsMarginTone =
    totals.margin >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";

  if (rows.length === 0) return null;

  // Story 29.32: paginação e fatiamento leem a MESMA coleção (`sortedRows`).
  // Hoje `rows.length === sortedRows.length`, mas derivar as duas pontas da
  // mesma fonte evita que uma futura ordenação que também filtre calcule
  // páginas que não existem.
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PERPETUAL_DAILY_PAGE_SIZE));
  const safePage = Math.min(pageIndex, totalPages - 1);
  const pageStart = safePage * PERPETUAL_DAILY_PAGE_SIZE;
  // Story 29.32: fatia o conjunto JÁ ORDENADO — nunca `rows` cru.
  const pageRows = sortedRows.slice(pageStart, pageStart + PERPETUAL_DAILY_PAGE_SIZE);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Dados Diários</h3>
        <p className="text-[11px] text-muted-foreground">
          {rows.length} {rows.length === 1 ? "dia" : "dias"} · métricas monetárias com imposto de 12,15%
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/30">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {/* Story 29.32: ordenação por dia. Alterna asc/desc e volta pra
                  página 0 — mesmo reset que já acontece quando `rows` muda. */}
              <TableHead className="text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                    setPageIndex(0);
                  }}
                  className="inline-flex items-center gap-1 font-semibold hover:text-foreground transition-colors"
                  title={
                    sortDir === "desc"
                      ? "Mais recente primeiro — clique para inverter"
                      : "Mais antigo primeiro — clique para inverter"
                  }
                  aria-label={`Ordenar por dia: ${sortDir === "desc" ? "decrescente" : "crescente"}`}
                >
                  Dia
                  {sortDir === "desc" ? (
                    <ArrowDown className="h-3 w-3" />
                  ) : (
                    <ArrowUp className="h-3 w-3" />
                  )}
                </button>
              </TableHead>
              {PERPETUAL_DAILY_COLUMNS.map((c) => (
                <TableHead
                  key={c.label}
                  title={c.title}
                  className="text-right text-xs font-semibold cursor-help"
                >
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r) => {
              // Story 29.33: CAC é o antigo CPV — mesma conta, nome que o resto
              // do produto e o mercado usam.
              const cac = div(r.spend, r.salesCount);
              const roas = div(r.revenue, r.spend);
              // Story 29.33: Margem % sobre o faturamento BRUTO — mesmo
              // denominador de `buildFunnelMarginPercentFormula`, usado no
              // Detalhamento. Duas tabelas, uma conta. Faturamento 0 → null →
              // "—", nunca 0% (que leria como "margem nula", não "sem base").
              const marginPct = r.revenue > 0 ? (r.margin / r.revenue) * 100 : null;
              // Margem e Margem % compartilham o sinal, logo compartilham a cor.
              const marginTone =
                r.margin >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400";
              return (
                <TableRow key={r.dateIso} className="text-xs">
                  <TableCell className="font-medium whitespace-nowrap">{r.date}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCurrency(r.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCurrency(r.revenue)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${marginTone}`}>
                    {fmtCurrency(r.margin)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${marginTone}`}>
                    {fmtPercent(marginPct)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNumber(r.salesCount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCurrency(cac)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtRoas(roas)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {/* Story 29.25: linha Total do PERÍODO INTEIRO (imune à paginação). */}
          <TableFooter>
            <TableRow className="bg-muted/50 hover:bg-muted/50 text-xs font-semibold border-t-2">
              <TableCell className="font-semibold whitespace-nowrap">Total</TableCell>
              <TableCell className="text-right tabular-nums">{fmtCurrency(totals.spend)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtCurrency(totals.revenue)}</TableCell>
              <TableCell className={`text-right tabular-nums ${totalsMarginTone}`}>
                {fmtCurrency(totals.margin)}
              </TableCell>
              {/* Story 29.33: as derivadas do rodapé saem dos SOMATÓRIOS do
                  período, nunca da média das linhas — média de médias é o
                  paradoxo de Simpson entrando pela porta da frente. */}
              <TableCell className={`text-right tabular-nums ${totalsMarginTone}`}>
                {fmtPercent(totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : null)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{fmtNumber(totals.salesCount)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtCurrency(div(totals.spend, totals.salesCount))}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtRoas(div(totals.revenue, totals.spend))}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {/* Story 29.25: paginação de 16 linhas por página. */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Dias {pageStart + 1}–{Math.min(pageStart + PERPETUAL_DAILY_PAGE_SIZE, rows.length)} de {rows.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              disabled={safePage === 0}
              className="h-7 px-2 rounded-md border border-border/40 text-xs inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50 transition-colors"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </button>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPageIndex((i) => Math.min(totalPages - 1, i + 1))}
              disabled={safePage >= totalPages - 1}
              className="h-7 px-2 rounded-md border border-border/40 text-xs inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50 transition-colors"
              aria-label="Próxima página"
            >
              Próxima
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
type DetailRow = CampaignAnalytics & {
  marginPct: number | null;
  marginPerSale: number | null;
  // Story 29.29: funil do criativo em vídeo (só preenchido no modo Por Criativo).
  hookRate: number | null;
  holdRate: number | null;
  bodyConversion: number | null;
};

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
// Story 29.29: cobre também o inglês (" - Copy", " - Copy 2") — a conta pode
// estar em qualquer idioma, e o usuário pediu as duas formas.
// Só no FIM do nome: "Copy of Criativo X" (prefixo) NÃO é agrupado.
const COPIA_SUFFIX_RE = /(\s*[—–-]\s*(c[oó]pia|copy)(\s*\d+)?)+\s*$/i;
function normalizeCampaignName(name: string): string {
  const cleaned = name.replace(COPIA_SUFFIX_RE, "").trim();
  return cleaned.length > 0 ? cleaned : name;
}

// Story 29.29: taxa do funil de vídeo. `null` = denominador zero (anúncio de
// imagem, ou entidade sem dado de vídeo) → "—", nunca 0%, que seria enganoso.
function fmtRateOrDash(v: number | null | undefined): string {
  return v == null ? "—" : `${v.toFixed(2)}%`;
}

// Story 29.29: verde ao bater a meta — mesmo tratamento da tabela de Criativos
// da Captação (`stage-creative-performance-table.tsx`), para que a mesma métrica
// se leia igual nas duas telas. Só Hook e Hold têm meta; ver nota no Body Conv.
function rateGoalClass(v: number | null | undefined, goal: number): string {
  return v != null && v >= goal ? "text-green-600 dark:text-green-400 font-semibold" : "";
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

// Story 29.21: badge de status Meta da campanha (só modo Por Campanha). Reusa o
// mapa de cores do campaign-selector. Sem match (adset/ad, linha só-planilha,
// ou id não encontrado) → "—" neutro.
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Ativo", cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
  PAUSED: { label: "Pausado", cls: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  ARCHIVED: { label: "Arquivado", cls: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" },
};
function StatusBadge({ status }: { status: string | undefined }) {
  const meta = status ? STATUS_BADGE[status] : undefined;
  if (!meta) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

// Story 29.15: rótulo de valor nos pontos do gráfico de Investimento. No modo
// Diário mostra a cada 7 pontos (evita poluir); em Semanal/Mensal há poucos
// pontos, então mostra em todos.
function SpendPointLabel(props: {
  x?: number;
  y?: number;
  value?: number | string;
  index?: number;
  granularity?: ChartGranularity;
}) {
  const { x, y, value, index, granularity } = props;
  if (x == null || y == null || index == null) return null;
  if (granularity === "day" && index % 7 !== 0) return null;
  const num = typeof value === "number" ? value : Number(value ?? 0);
  return (
    <text x={x} y={y - 8} textAnchor="middle" fontSize={9} fontWeight={600} fill="hsl(47 98% 68%)">
      {fmtCurrencyCompact(num)}
    </text>
  );
}

// Story 29.21: rótulo de valor em cada barra do gráfico "Margem no Tempo".
// Valor arredondado pra cima (Math.ceil), fonte pequena, na mesma cor da barra
// (verde se ≥ 0, vermelho se < 0). Sempre FORA da ponta da barra: positivos acima
// do topo, negativos abaixo da base.
function MarginBarLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number | string;
}) {
  const { x, y, width, height, value } = props;
  if (x == null || y == null || width == null || height == null) return null;
  const num = typeof value === "number" ? value : Number(value ?? 0);
  const positive = num >= 0;
  const cx = x + width / 2;
  // Recharts passa height negativo em barras negativas — usar as duas extremidades
  // garante que o rótulo fica sempre FORA da ponta da barra (positivo acima do topo,
  // negativo abaixo da base), nunca colado no eixo zero.
  const top = Math.min(y, y + height);
  const bottom = Math.max(y, y + height);
  const ty = positive ? top - 4 : bottom + 11;
  return (
    <text
      x={cx}
      y={ty}
      textAnchor="middle"
      fontSize={8}
      fontWeight={600}
      fill={positive ? "hsl(150 60% 45%)" : "hsl(0 72% 55%)"}
    >
      {fmtCurrencyCompact(Math.ceil(num))}
    </text>
  );
}

// Tooltip do gráfico "Margem no Tempo" — memorial completo de como se chega na
// margem do período (dia/semana/mês): Receita Bruta → descontos da plataforma →
// Receita Líquida → Investimento (Meta + imposto) → Margem. Mesmo padrão do
// tooltip do KPI Margem, agora por barra. `platform` habilita o breakdown de fees.
function MarginTimeTooltip({
  active,
  payload,
  platform,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      rangeLabel?: string; revenue?: number; spend?: number;
      spendBruto?: number; spendTax?: number; margin?: number; sales?: number;
    };
  }>;
  platform?: string | null;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const bruto = d.revenue ?? 0;
  const spend = d.spend ?? 0;
  const margin = d.margin ?? 0;
  const breakdown = platform ? PLATFORM_FEE_BREAKDOWN[platform] : null;
  const totalFeeRate = breakdown ? breakdown.reduce((s, b) => s + b.rate, 0) : 0;
  const receitaLiquida = bruto * (1 - totalFeeRate);
  const positive = margin >= 0;
  return (
    <div className="min-w-[240px] max-w-[320px] rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md space-y-2">
      <div className="font-semibold text-sm border-b border-border/30 pb-1.5">
        {d.rangeLabel ?? ""}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Faturamento Bruto</span>
          <span className="tabular-nums font-medium">{fmtCurrency(bruto)}</span>
        </div>
        {breakdown && bruto > 0 && (
          <>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider pt-1 border-t border-border/20">
              Descontos da plataforma ({platform})
            </div>
            {breakdown.map((b) => (
              <div key={b.label} className="flex justify-between gap-4 text-[11px]">
                <span className="text-muted-foreground">− {b.label} ({(b.rate * 100).toFixed(2)}%)</span>
                <span className="tabular-nums text-red-400">−{fmtCurrency(bruto * b.rate)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4 pt-1 border-t border-border/20">
              <span className="font-medium">= Faturamento Líquido</span>
              <span className="tabular-nums font-medium">{fmtCurrency(receitaLiquida)}</span>
            </div>
          </>
        )}
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider pt-1 border-t border-border/20">
          Investimento (Meta)
        </div>
        <div className="flex justify-between gap-4 text-[11px]">
          <span className="text-muted-foreground">Spend bruto</span>
          <span className="tabular-nums">{fmtCurrency(d.spendBruto)}</span>
        </div>
        {(d.spendTax ?? 0) > 0 && (
          <div className="flex justify-between gap-4 text-[11px]">
            <span className="text-muted-foreground">+ Imposto ({(META_TAX_RATE * 100).toFixed(2)}%)</span>
            <span className="tabular-nums text-amber-400">+{fmtCurrency(d.spendTax)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">− Investimento total</span>
          <span className="tabular-nums text-red-400">−{fmtCurrency(spend)}</span>
        </div>
        <div className={`flex justify-between gap-4 pt-1.5 border-t border-border/30 font-semibold ${positive ? "text-emerald-400" : "text-red-400"}`}>
          <span>= Margem</span>
          <span className="tabular-nums">{fmtCurrency(margin)}</span>
        </div>
        {(d.sales ?? 0) > 0 && (
          <div className="flex justify-between gap-4 text-[11px] text-muted-foreground pt-0.5">
            <span>Vendas</span>
            <span className="tabular-nums">{fmtNumber(d.sales)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Tooltip do gráfico "Investimento no Tempo" — investimento do período (Meta +
// imposto). Substitui o fallback simples quando a série é agregada por período.
function SpendTimeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: { rangeLabel?: string; spend?: number; spendBruto?: number; spendTax?: number };
  }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const hasTax = (d.spendTax ?? 0) > 0;
  return (
    <div className="min-w-[200px] rounded-md border bg-popover p-2.5 text-xs text-popover-foreground shadow-md space-y-1">
      <div className="font-semibold border-b border-border/30 pb-1.5 mb-1">{d.rangeLabel ?? ""}</div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Spend bruto (Meta)</span>
        <span className="tabular-nums">{fmtCurrency(d.spendBruto)}</span>
      </div>
      {hasTax && (
        <div className="flex justify-between gap-4 text-[11px]">
          <span className="text-muted-foreground">+ Imposto ({(META_TAX_RATE * 100).toFixed(2)}%)</span>
          <span className="tabular-nums text-amber-400">+{fmtCurrency(d.spendTax)}</span>
        </div>
      )}
      <div className="flex justify-between gap-4 pt-1 border-t border-border/30 font-semibold">
        <span>= Investimento</span>
        <span className="tabular-nums">{fmtCurrency(d.spend)}</span>
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
  // Granularidade dos gráficos "no tempo" (Margem/Investimento): dia/semana/mês.
  const [granularity, setGranularity] = useState<ChartGranularity>("day");
  const [showCampaignManager, setShowCampaignManager] = useState(false);
  const [showSpreadsheetWizard, setShowSpreadsheetWizard] = useState(false);
  const [showUpsellWizard, setShowUpsellWizard] = useState(false);
  const [tableFilter, setTableFilter] = useState<"campaign" | "adset" | "ad">("campaign");
  // Story 29.19: ordenação de colunas + largura da coluna Dimensão no Detalhamento
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dimWidth, setDimWidth] = useState(200);
  // Story 29.21: resize da coluna Dimensão arrastando a borda (estilo Excel).
  // Substitui os botões −/+ da 29.19. Os listeners no document são removidos no
  // mouseup (sem leak). Clamp 120–640px. startW captura a largura no início do drag.
  const startDimResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = dimWidth;
    const onMove = (ev: MouseEvent) => {
      setDimWidth(Math.max(120, Math.min(640, startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  // Story 29.32: `useSurveyAggregation` saiu junto com o card "Resposta
  // Pesquisa" — era seu único consumidor neste dashboard, e mantê-lo faria
  // requisições de pesquisa a cada render sem nada para exibir.
  const { data: perpetualSpreadsheet } = usePerpetualSpreadsheet(projectId, funnel.id);
  const { data: upsellSpreadsheet } = usePerpetualUpsellSpreadsheet(projectId, funnel.id);
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
  // Story 29.21: status (Ativo/Pausado/Arquivado) por campanha p/ a coluna do
  // Detalhamento. Reusa o picker meta-campaigns (mesma queryKey → sem request
  // novo). Só o modo Por Campanha consulta o mapa (id da linha = id da campanha).
  const { data: campaignPicker } = useCampaignPicker(hasCampaigns ? projectId : null);
  const campaignStatusById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of campaignPicker?.campaigns ?? []) m.set(c.id, c.status);
    return m;
  }, [campaignPicker]);

  // Data hooks — Fix 1 (29.8): propaga startDate/endDate quando custom range
  const { data: overview, isLoading: overviewLoading } = useTrafficOverview(
    metaProjectId, days, hasCampaigns ? campaignIds : null,
    customRange?.startDate, customRange?.endDate,
  );
  const { data: campaignData } = useTrafficCampaigns(
    metaProjectId, days, customRange?.startDate, customRange?.endDate,
  );
  const { data: dailyData, isLoading: dailyLoading } =
    useCampaignDailyInsightsBulk(
      projectId,
      hasCampaigns ? campaignIds : null,
      days,
      customRange?.startDate,
      customRange?.endDate,
    );
  const { data: adSetsData } = useAllAdSets(
    metaProjectId, days, hasCampaigns ? campaignIds : null,
    customRange?.startDate, customRange?.endDate,
  );
  const { data: adsData } = useAllAds(
    metaProjectId, days, hasCampaigns ? campaignIds : null,
    customRange?.startDate, customRange?.endDate,
  );

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
    // Story 29.23: contagem de vendas por dia da planilha (novo campo do backend).
    const sheetSalesByDay = sheetHasDaily ? (salesDataDaily!.salesByDay ?? {}) : {};
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
      // Story 29.23: métricas cruas Meta por dia (base do Quadro de Dados Diários).
      const impressions = d ? safeNum(d.impressions) : 0;
      const linkClicks = dailyActionCount(d?.actions, "link_click");
      const lpViews = dailyActionCount(d?.actions, "landing_page_view");
      // Vendas/dia: planilha (fonte oficial) quando há daily; senão fallback pixel
      // Meta — mesma lógica de fonte da Receita (:596). Sem planilha → 0 (29.10).
      const salesFromSheet = sheetHasDaily ? (sheetSalesByDay[date] ?? 0) : 0;
      const salesFromPixel = purchases ? parseInt(purchases.value) : 0;
      const salesCount = sheetHasDaily ? salesFromSheet : (usingSpreadsheet ? salesFromPixel : 0);
      const dateLabel = date.slice(5, 10);
      const revenueSource = sheetHasDaily
        ? "Planilha · faturamento bruto por dia"
        : usingSpreadsheet
          ? "Meta Ads · action_values.purchase (fallback: planilha sem dataVenda)"
          : "Sem fonte de vendas conectada · Faturamento Bruto = 0";
      const spendSource = taxAmount > 0
        ? `Meta Ads spend + 12.15% imposto (a partir de ${META_TAX_EFFECTIVE_DATE})`
        : "Meta Ads API · spend (time series)";
      return {
        date: dateLabel,
        dateIso: date,
        spend: spendComTax,
        spendBruto,
        spendTax: taxAmount,
        revenue: revenueBruto,
        margin,
        sales: usingSpreadsheet && purchases ? parseInt(purchases.value) : 0,
        // Story 29.23: campos crus por dia para o Quadro de Dados Diários.
        impressions,
        linkClicks,
        lpViews,
        salesCount,
        formulasByKey: {
          spend: buildFunnelDailyFormula("Investimento", spendSource, spendComTax, true, dateLabel),
          revenue: buildFunnelDailyFormula("Faturamento Bruto", revenueSource, revenueBruto, true, dateLabel),
          // Story 29.33 (AC4b): o memorial descrevia a operação errada — um
          // MARKUP sobre o spend líquido — enquanto `applyMetaTax` faz
          // GROSS-UP: spend ÷ (1 − 0,1215), fator 1,1383039. O cálculo sempre
          // esteve certo; era o texto que mentia, com 1,5% de diferença — o
          // bastante para quem confere a conta na mão concluir que o dashboard
          // está quebrado, ou pior, "corrigir" o código para bater com o texto.
          margin: buildFunnelDailyFormula("Margem (Líquida − Spend c/ tax)", "Derivado · (revenue × (1−feeRate)) − (spend ÷ (1−0,1215))", margin, true, dateLabel),
        },
      };
    });
  }, [dailyData, usingSpreadsheet, salesDataDaily, salesData]);

  // Story 29.32 (AC7/AC8): série dos 3 gráficos de linha×área.
  //
  // Sai de `dailyChartData`, NÃO de `timeSeries` — este último já vem agregado
  // por granularidade (Diário/Semanal/Mensal), e a janela pedida é de 7 DIAS.
  // Com granularidade Semanal, usar o agregado faria "7 pontos" virar 7 semanas.
  //
  // A janela são os últimos 7 dias DENTRO do período filtrado (decisão do
  // usuário) — não uma janela fixa a partir de hoje. Período com menos de 7
  // dias mostra o que houver; nada é preenchido com zero.
  //
  // CAC e Margem % não existem por dia no payload: são derivados aqui, com a
  // mesma guarda de denominador zero da tabela (`null` → o recharts não desenha
  // o ponto, em vez de plotar NaN/Infinity no eixo).
  const last7Days = useMemo(() => {
    const janela = dailyChartData.slice(-7);
    return janela.map((d) => {
      const cac = d.salesCount > 0 ? d.spend / d.salesCount : null;
      const marginPct = d.revenue > 0 ? (d.margin / d.revenue) * 100 : null;
      return {
        date: d.date,
        dateIso: d.dateIso,
        spend: d.spend,
        revenue: d.revenue,
        margin: d.margin,
        sales: d.salesCount,
        cac,
        marginPct,
      };
    });
  }, [dailyChartData]);

  // Story 29.9: agregados com tax aplicado, derivados de `campaign-daily`.
  //
  // Story 29.27 — ATENÇÃO ao mexer aqui. O backend NÃO é uniforme quanto ao
  // imposto de 12,15%:
  //   • `campaign-daily` (fonte deste bloco) devolve spend BRUTO, sem imposto —
  //     é o único endpoint assim, e por isso o gross-up é aplicado aqui.
  //   • `campaigns`, `all-adsets`, `all-ads` e `overview` já vêm COM imposto
  //     aplicado por `applyMetaTax` (services/traffic-analytics.ts).
  //
  // Os KPI cards usam `totalSpendComTax` por SUBSTITUIÇÃO (descartam o valor do
  // overview e usam este). Correto — o imposto entra uma única vez.
  //
  // O que NÃO se pode fazer: multiplicar o spend de uma entidade (campanha/
  // adset/ad) por este total. Esse spend já é tributado, e o produto tributaria
  // de novo. Foi exatamente o bug corrigido na 29.27 no `detailRows`.
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

  // Séries dos gráficos "no tempo" agregadas por granularidade (dia/semana/mês).
  // Parte de dailyChartData, que já vem filtrado por data + campanhas — então os
  // gráficos respondem ao calendário e à seleção automaticamente.
  const timeSeries = useMemo(
    () => aggregateSeriesByGranularity(dailyChartData, granularity),
    [dailyChartData, granularity],
  );

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
  // Story 29.29: Hook/Hold/Body só existem a nível de ANÚNCIO — campanha e
  // adset agregam criativos diferentes, e a média não significaria nada.
  const showVideoCols = tableFilter === "ad";
  // Story 29.19: normaliza nomes (tira " — Cópia") e agrupa a cópia no nome base.
  // Merge (>1 membro) soma métricas e re-deriva taxas; membro único fica intacto.
  const detailRows = useMemo<DetailRow[]>(() => {
    // Story 29.27: o `taxMultiplier` da 29.24 foi REMOVIDO daqui.
    //
    // A intenção da 29.24 (fazer Σlinhas bater com o card) estava certa; a
    // premissa não: ela assumia que `base.spend` vinha sem imposto. Mas as
    // linhas desta tabela vêm de `campaigns`/`all-adsets`/`all-ads`, e esses
    // três endpoints já aplicam `applyMetaTax` no backend. Multiplicar de novo
    // produzia spend × 1,1215², inflando Invest./CAC/CPC/CPM e deprimindo
    // ROAS/Margem — a tabela contradizia os cards do mesmo período.
    //
    // Agora `base.spend` é usado como vem: tributado uma única vez.
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
        // Story 29.29: métricas de vídeo são ADITIVAS entre os membros (um Ad
        // Name pode ter N ad_ids, incluindo as cópias). Hook/Hold/Body são
        // re-derivadas destes somatórios em `deriveDetailMetrics` — nunca média
        // das taxas individuais, que daria número errado silenciosamente.
        const videoViews3s = members.reduce((s, m) => s + (m.videoViews3s ?? 0), 0);
        const videoViews75 = members.reduce((s, m) => s + (m.videoViews75 ?? 0), 0);
        base = {
          ...members[0],
          campaignName: name,
          spend, impressions, clicks, revenue, sales,
          videoViews3s, videoViews75,
          linkClicks: linkClicks > 0 ? linkClicks : null,
          // Story 29.20 (M2): CTR/CPC de LINK clicks (fallback total) — igual buildAnalyticsRow.
          ctr: linkClicks > 0 && impressions > 0 ? (linkClicks / impressions) * 100 : (impressions > 0 ? (clicks / impressions) * 100 : 0),
          cpc: linkClicks > 0 ? spend / linkClicks : (clicks > 0 ? spend / clicks : 0),
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
          roas: spend > 0 ? revenue / spend : null,
          costPerSale: sales > 0 ? spend / sales : null,
        };
      }
      // Story 29.27: `spend` já vem tributado do backend (applyMetaTax por
      // entidade). Todas as métricas de custo derivam DESTE mesmo valor —
      // a regra vive em `deriveDetailMetrics`, com teste de guarda.
      return { ...base, ...deriveDetailMetrics(base, detailFeeRate) };
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
        // Story 29.29: "—" (null) vai para o fim na ordem descendente, via `num`.
        case "hookRate": return num(r.hookRate);
        case "holdRate": return num(r.holdRate);
        case "bodyConversion": return num(r.bodyConversion);
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
          <p className="mx-auto max-w-xl text-xs text-muted-foreground/80">
            Este dashboard usa uma conexão própria de planilha de <strong>vendas</strong>{" "}
            (botão abaixo), com mapeamento de valor, data da venda, UTMs e plataforma.
            As planilhas da aba <strong>Planilhas</strong> (leads/pesquisas) não alimentam
            estes números — você pode conectar a mesma planilha aqui.
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
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 text-xs ${upsellSpreadsheet ? "border-purple-500/40 text-purple-400 hover:text-purple-300" : ""}`}
            onClick={() => setShowUpsellWizard(true)}
          >
            {upsellSpreadsheet ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="max-w-[160px] truncate">Ascensão: {upsellSpreadsheet.spreadsheetName}</span>
                <span className="text-muted-foreground/70">(editar)</span>
              </>
            ) : (
              <>
                <TrendingUp className="h-3.5 w-3.5" />
                Conectar Ascensão
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

      <PerpetualUpsellWizardDialog
        projectId={projectId}
        funnelId={funnel.id}
        current={upsellSpreadsheet ?? null}
        open={showUpsellWizard}
        onOpenChange={setShowUpsellWizard}
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
      {/* Story 29.32: 8 skeletons em duas linhas de 4, espelhando a grade real. */}
      {overviewLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : effectiveMetrics ? (
        (() => {
          const f = { days, funnelType: "perpetual" as const, funnelName: funnel?.name };
          const m = effectiveMetrics;
          // Marca KPIs cuja fonte mudou pra planilha
          const fromSheet = usingSpreadsheet;
          // Story 29.10: sem planilha = sem fonte de vendas → aviso nos cards de venda
          const noSalesSource = !usingSpreadsheet;
          // Story 29.28: CAC acima do Ticket Médio = prejuízo por venda — o card
          // fica vermelho. Ticket vem do backend (`ticketMedioBruto`), a mesma
          // base do card de Faturamento Bruto; não recalcular aqui.
          // Comparação estrita: empate não alarma. Sem planilha, sem venda ou
          // sem CAC → neutro (falta de dado não é alerta).
          const ticketMedio =
            usingSpreadsheet && salesData && m.totalSales > 0 ? salesData.ticketMedioBruto : null;
          const cacAcimaDoTicket =
            m.cac != null && ticketMedio != null && ticketMedio > 0 && m.cac > ticketMedio;
          return (
            // Story 29.32: 8 cards em DUAS linhas de quatro — resultado em cima
            // (Faturamento Bruto, Vendas, Ticket Médio, Investimento), eficiência
            // embaixo (CAC, ROAS, Margem, Margem %). Antes eram 7 colunas, o que
            // misturava as duas leituras em ordem arbitrária.
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              {/* ---------- Linha 1 — resultado ---------- */}
              {/* Story 29.25 → 29.28: "Receita" → "Faturamento" → "Faturamento Bruto". */}
              <MetricTooltip label="Faturamento Bruto" value={fmtCurrency(m.totalRevenue)} formula={buildFunnelRevenueFormula(m.totalRevenue, f)}>
                <KpiCard icon={DollarSign} label="Faturamento Bruto" value={fmtCurrency(m.totalRevenue)} hintTooltip fromSheet={fromSheet} warning={noSalesSource ? "Conectar fonte de vendas" : undefined} />
              </MetricTooltip>
              <MetricTooltip label="Vendas" value={fmtNumber(m.totalSales)} formula={buildFunnelSalesCountFormula(m.totalSales, f)}>
                <KpiCard icon={ShoppingCart} label="Vendas" value={fmtNumber(m.totalSales)} hintTooltip fromSheet={fromSheet} warning={noSalesSource ? "Conectar fonte de vendas" : undefined} />
              </MetricTooltip>
              {/* Story 29.32: Ticket Médio ganha card. O valor JÁ existia na tela
                  desde a 29.28 (`ticketMedio`, do backend) — só era usado para
                  decidir o vermelho do CAC. Não recalcular a partir de
                  Faturamento ÷ Vendas: a base é `salesData.ticketMedioBruto`. */}
              <KpiCard
                icon={Receipt}
                label="Ticket Médio"
                value={ticketMedio != null ? fmtCurrency(ticketMedio) : "—"}
                fromSheet={fromSheet}
                title={
                  ticketMedio != null
                    ? `Faturamento Bruto ÷ Vendas — ${fmtCurrency(m.totalRevenue)} ÷ ${fmtNumber(m.totalSales)}`
                    : undefined
                }
                warning={noSalesSource ? "Conectar fonte de vendas" : undefined}
              />
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

              {/* ---------- Linha 2 — eficiência ---------- */}
              <MetricTooltip label="CAC" value={fmtCurrency(m.cac)} formula={buildFunnelCacFormula(m.cac, f)}>
                <KpiCard
                  icon={DollarSign}
                  label="CAC"
                  value={fmtCurrency(m.cac)}
                  hintTooltip
                  fromSheet={fromSheet}
                  alert={cacAcimaDoTicket}
                  // Story 29.28 → 29.32: o Ticket Médio agora tem card próprio ao
                  // lado, mas o warning fica: diz o valor exato da comparação sem
                  // obrigar o olho a cruzar as duas linhas da grade.
                  warning={
                    cacAcimaDoTicket
                      ? `Acima do Ticket Médio (${fmtCurrency(ticketMedio)})`
                      : undefined
                  }
                />
              </MetricTooltip>
              <MetricTooltip label="ROAS" value={fmtRoas(m.roas)} formula={buildFunnelRoasFormula(m.roas, f)}>
                <KpiCard icon={Target} label="ROAS" value={fmtRoas(m.roas)} target={2} actual={m.roas} hintTooltip fromSheet={fromSheet} />
              </MetricTooltip>
              <MarginBreakdownTooltip
                receitaBruta={m.totalRevenue}
                spend={m.totalSpend}
                margin={m.margin}
                platform={usingSpreadsheet ? salesData?.platform : null}
                reembolsoReal={usingSpreadsheet ? (salesData?.reembolsoReal ?? false) : false}
                reembolsoBruto={usingSpreadsheet ? (salesData?.reembolsoBruto ?? 0) : 0}
              >
                {/* Story 29.23: "Margem" → "Margem de Contribuição" (só o rótulo muda). */}
                <KpiCard icon={DollarSign} label="Margem de Contribuição" value={fmtCurrency(m.margin)} hintTooltip fromSheet={fromSheet} signValue={m.margin} />
              </MarginBreakdownTooltip>
              <MetricTooltip label="Margem de Contribuição %" value={fmtPercent(m.marginPercent)} formula={buildFunnelMarginPercentFormula(m.marginPercent, f)}>
                <KpiCard icon={BarChart3} label="Margem de Contribuição %" value={fmtPercent(m.marginPercent)} hintTooltip fromSheet={fromSheet} />
              </MetricTooltip>
              {/* Story 29.32: card "Resposta Pesquisa" removido a pedido do gestor.
                  `surveyAgg` continua alimentando o resto da tela — não desmontar. */}
            </div>
          );
        })()
      ) : <EmptyState />}

      {/* ================================================================ */}
      {/* Story 29.32 — TRÊS GRÁFICOS DE LINHA×ÁREA (últimos 7 dias)       */}
      {/*                                                                  */}
      {/* Cada um cruza VOLUME (área, eixo esquerdo) com EFICIÊNCIA (linha, */}
      {/* eixo direito) — investimento subindo com CAC subindo junto é o   */}
      {/* tipo de coisa que só aparece quando as duas séries dividem o     */}
      {/* mesmo eixo X. Escalas independentes: `yAxisId` em TODO elemento. */}
      {/* Janela = últimos 7 dias DENTRO do período filtrado (`last7Days`).*/}
      {/* ================================================================ */}
      {dailyLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      ) : last7Days.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            {
              key: "invest-cac",
              titulo: "Investimento × CAC",
              sub: "Gasto em mídia (área) e custo por aquisição (linha)",
              areaKey: "spend",
              areaNome: "Investimento",
              areaCor: "hsl(217 91% 60%)",
              lineKey: "cac",
              lineNome: "CAC",
              lineCor: "hsl(38 92% 50%)",
              fmtArea: (v: number) => fmtCurrencyCompact(v),
              fmtLine: (v: number) => fmtCurrencyCompact(v),
            },
            {
              key: "fat-vendas",
              titulo: "Faturamento × Vendas",
              sub: "Receita (área) e quantidade de vendas (linha)",
              areaKey: "revenue",
              areaNome: "Faturamento",
              areaCor: "hsl(150 60% 45%)",
              lineKey: "sales",
              lineNome: "Vendas",
              lineCor: "hsl(280 65% 60%)",
              fmtArea: (v: number) => fmtCurrencyCompact(v),
              fmtLine: (v: number) => fmtNumber(v),
            },
            {
              key: "margem-pct",
              titulo: "Margem × Margem %",
              sub: "Margem absoluta (área) e percentual (linha)",
              areaKey: "margin",
              areaNome: "Margem",
              areaCor: "hsl(190 70% 50%)",
              lineKey: "marginPct",
              lineNome: "Margem %",
              lineCor: "hsl(38 92% 50%)",
              fmtArea: (v: number) => fmtCurrencyCompact(v),
              fmtLine: (v: number) => `${v.toFixed(0)}%`,
            },
          ].map((g) => (
            <div key={g.key} className="rounded-xl border border-border/30 bg-card/60 p-5">
              <h3 className="text-sm font-semibold mb-1">{g.titulo}</h3>
              <p className="text-[11px] text-muted-foreground mb-3">
                {g.sub} · últimos {last7Days.length} {last7Days.length === 1 ? "dia" : "dias"} do período
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={last7Days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#fff" }}
                    stroke="var(--color-muted-foreground)"
                  />
                  {/* Eixo esquerdo = área (volume). Eixo direito = linha (eficiência). */}
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: "#fff" }}
                    stroke="var(--color-muted-foreground)"
                    tickFormatter={(v) => g.fmtArea(v)}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "#fff" }}
                    stroke="var(--color-muted-foreground)"
                    tickFormatter={(v) => g.fmtLine(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value, name) => {
                      // `value` pode vir undefined/null nos dias em que a série
                      // derivada não tem valor (CAC sem venda, Margem % sem receita).
                      const n = typeof value === "number" ? value : null;
                      if (n === null) return ["—", String(name)];
                      return [name === g.lineNome ? g.fmtLine(n) : g.fmtArea(n), String(name)];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey={g.areaKey}
                    name={g.areaNome}
                    stroke={g.areaCor}
                    fill={g.areaCor}
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                  {/* `connectNulls={false}`: dia sem venda (CAC null) ou sem receita
                      (Margem % null) fica com lacuna — não inventa continuidade. */}
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey={g.lineKey}
                    name={g.lineNome}
                    stroke={g.lineCor}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      ) : (
        /* Story 29.32: mesmo padrão dos outros gráficos do arquivo — sem dado,
           mostra o EmptyState em vez de a seção sumir sem explicação. */
        <EmptyState />
      )}

      {/* ================================================================ */}
      {/* REEMBOLSOS — status refunded/chargeback já descontados do Faturamento Bruto */}
      {/* ================================================================ */}
      {usingSpreadsheet && salesData && salesData.reembolsoBruto > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Undo2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Reembolsos {fmtCurrency(salesData.reembolsoBruto)}
            </div>
            <div className="text-xs text-muted-foreground">
              {fmtNumber(salesData.vendasReembolsadas)} venda(s) com status reembolsado/chargeback — já descontado(s) do Faturamento Bruto e das Vendas.
            </div>
          </div>
        </div>
      )}

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
      {/* GRÁFICOS EM LINHA: Margem + Investimento no tempo                */}
      {/* Seletor Diário/Semanal/Mensal (no card Margem) controla os dois. */}
      {/* ================================================================ */}
      {(() => {
        const granLabel = granularity === "day" ? "dia" : granularity === "week" ? "semana" : "mês";
        const marginPlatform = usingSpreadsheet ? salesData?.platform ?? null : null;
        return (
      <div className="grid grid-cols-1 gap-6">
        {/* Story 29.15: Margem no Tempo (barras verde/vermelho) fica em cima */}
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold mb-1">Margem no Tempo</h3>
              <p className="text-[11px] text-muted-foreground">
                Margem líquida por {granLabel} (com fees) · <span className="text-emerald-400">verde = positiva</span> · <span className="text-red-400">vermelho = negativa</span>
              </p>
            </div>
            <Select value={granularity} onValueChange={(v) => setGranularity(v as ChartGranularity)}>
              <SelectTrigger className="w-[120px] h-8 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Diário</SelectItem>
                <SelectItem value="week">Semanal</SelectItem>
                <SelectItem value="month">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {dailyLoading ? <Skeleton className="h-48" /> : timeSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={timeSeries} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#fff" }} stroke="var(--color-muted-foreground)" />
                <YAxis tick={{ fontSize: 11, fill: "#fff" }} stroke="var(--color-muted-foreground)" tickFormatter={(v) => fmtCurrencyCompact(v)} />
                <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.12 }} content={<MarginTimeTooltip platform={marginPlatform} />} />
                <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
                <Bar dataKey="margin" name="Margem" radius={[2, 2, 0, 0]}>
                  {timeSeries.map((d, i) => (
                    <Cell key={i} fill={d.margin >= 0 ? "hsl(150 60% 45%)" : "hsl(0 72% 55%)"} />
                  ))}
                  {/* Story 29.21: valor numérico (Math.ceil) em cada barra, cor da barra */}
                  <LabelList dataKey="margin" content={<MarginBarLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>

        {/* Story 29.15: Investimento no Tempo — linha. Segue a mesma granularidade.
            Sem campanha vinculada não há investimento — oculta o gráfico. */}
        {hasCampaigns && (
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-1">Investimento no Tempo</h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            Investimento (Meta, com imposto) por {granLabel}
          </p>
          {dailyLoading ? <Skeleton className="h-48" /> : timeSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={timeSeries} margin={{ top: 24, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#fff" }} stroke="var(--color-muted-foreground)" />
                <YAxis tick={{ fontSize: 11, fill: "#fff" }} stroke="var(--color-muted-foreground)" tickFormatter={(v) => fmtCurrencyCompact(v)} />
                <Tooltip content={<SpendTimeTooltip />} />
                <Line type="monotone" dataKey="spend" stroke="hsl(47 98% 54%)" strokeWidth={2} dot={{ r: 2, fill: "hsl(47 98% 54%)" }} name="Investimento">
                  <LabelList dataKey="spend" content={<SpendPointLabel granularity={granularity} />} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>
        )}
      </div>
        );
      })()}

      {/* ================================================================ */}
      {/* QUADRO DE DADOS DIÁRIOS — Story 29.23: tabela por dia (15 colunas) */}
      {/* ================================================================ */}
      <PerpetualDailyTable rows={dailyChartData} />

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
            <Select value={tableFilter} onValueChange={(v) => setTableFilter(v as typeof tableFilter)}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="campaign">Por Campanha</SelectItem>
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
                {/* Story 29.21: status Meta da campanha (informativo — não ordena/filtra) */}
                <th className="text-left py-2 pr-3 select-none">Status</th>
                <th style={{ width: dimWidth, minWidth: dimWidth }} className="relative text-left py-2 pr-3 select-none">
                  <span className="cursor-pointer hover:text-foreground" onClick={() => toggleSort("dimension")}>Dimensao{sortArrow("dimension")}</span>
                  {/* Story 29.21: alça de resize — arraste a borda pra ajustar a largura */}
                  <span
                    onMouseDown={startDimResize}
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40"
                    title="Arraste para ajustar a largura da coluna"
                  />
                </th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("spend")}>Invest.{sortArrow("spend")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("revenue")}>Faturamento Bruto{sortArrow("revenue")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("cac")}>CAC{sortArrow("cac")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("roas")}>ROAS{sortArrow("roas")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("marginPct")}>Margem %{sortArrow("marginPct")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("marginPerSale")}>Margem/Venda{sortArrow("marginPerSale")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("ctr")}>CTR (link){sortArrow("ctr")}</th>
                <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("cpc")}>CPC (link){sortArrow("cpc")}</th>
                <th className="text-right pl-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("cpm")}>CPM{sortArrow("cpm")}</th>
                {/* Story 29.29: funil do criativo em vídeo — só faz sentido a
                    nível de anúncio, então as colunas SOMEM nos outros modos
                    (não viram "—"). Campanha e adset não têm criativo único. */}
                {showVideoCols && (
                  <>
                    <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("hookRate")} title="Visualizações 3s ÷ Impressões × 100 — dos que viram o anúncio, quantos assistiram os primeiros segundos (verde ≥ 25%)">Hook{sortArrow("hookRate")}</th>
                    <th className="text-right px-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("holdRate")} title="Visualizações 75% ÷ Visualizações 3s × 100 — dos que passaram pelo gancho, quantos seguiram até 75% do vídeo (verde ≥ 13%)">Hold{sortArrow("holdRate")}</th>
                    <th className="text-right pl-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("bodyConversion")} title="Vendas ÷ Visualizações 75% × 100 — dos que viram o corpo do vídeo, quantos compraram. Sem meta de cor: o benchmark de 3,7% da Captação é sobre LEADS, não vendas">Body Conv.{sortArrow("bodyConversion")}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={showVideoCols ? 14 : 11} className="py-6 text-center text-muted-foreground">Sem dados</td></tr>
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
                  ["revenue", "Faturamento Bruto", fmtCurrency(row.revenue), enrichFormulaForEntity(buildFunnelRevenueFormula(row.revenue, f), path), "text-right px-2 tabular-nums"],
                  ["cac", "CAC", fmtCurrency(row.costPerSale), enrichFormulaForEntity(buildFunnelCacFormula(row.costPerSale ?? null, f), path), "text-right px-2 tabular-nums"],
                  ["roas", "ROAS", fmtRoas(row.roas), enrichFormulaForEntity(buildFunnelRoasFormula(row.roas ?? null, f), path), `text-right px-2 tabular-nums font-medium ${roasColorClass(row.roas)}`],
                  ["marginPct", "Margem %", fmtPercent(marginPct), enrichFormulaForEntity(buildFunnelMarginPercentFormula(marginPct, f), path), `text-right px-2 tabular-nums font-medium ${marginColorClass(marginPct)}`],
                  ["marginPerSale", "Margem/Venda", fmtCurrency(marginPerSale), enrichFormulaForEntity(buildFunnelMarginFormula(marginPerSale, f), path), `text-right px-2 tabular-nums font-medium ${marginColorClass(marginPerSale)}`],
                  ["ctr", "CTR", fmtPercent(row.ctr), enrichFormulaForEntity(buildFunnelCtrFormula(row.ctr, f), path), "text-right px-2 tabular-nums"],
                  ["cpc", "CPC", fmtCurrency(row.cpc), enrichFormulaForEntity(buildFunnelCpcFormula(row.cpc, f), path), "text-right px-2 tabular-nums"],
                  ["cpm", "CPM", fmtCurrency(row.cpm), enrichFormulaForEntity(buildFunnelCpmFormula(row.cpm, f), path), "text-right pl-2 tabular-nums"],
                ];
                // Story 29.29: Hook/Hold reusam as metas já validadas na
                // Captação (18.65). Body Conv. sai SEM meta de propósito — o
                // 3,7% de lá é sobre LEADS ÷ p75; aqui o numerador é VENDAS, que
                // convertem em ordem de grandeza menor. Pintar com aquele
                // benchmark marcaria criativo bom como ruim.
                return (
                  <tr key={row.campaignName} className="border-b border-border/10 hover:bg-muted/5">
                    <td className="py-2 pr-3"><StatusBadge status={tableFilter === "campaign" ? campaignStatusById.get(row.campaignId) : undefined} /></td>
                    <td className="py-2 pr-3 font-medium truncate" style={{ maxWidth: dimWidth, width: dimWidth }}>{row.campaignName}</td>
                    {cells.map(([col, label, value, formula, cls]) => renderCell(col, label, value, formula, cls))}
                    {showVideoCols && (
                      <>
                        <td className={`text-right px-2 tabular-nums ${rateGoalClass(row.hookRate, 25)}`}>{fmtRateOrDash(row.hookRate)}</td>
                        <td className={`text-right px-2 tabular-nums ${rateGoalClass(row.holdRate, 13)}`}>{fmtRateOrDash(row.holdRate)}</td>
                        <td className="text-right pl-2 tabular-nums">{fmtRateOrDash(row.bodyConversion)}</td>
                      </>
                    )}
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
              title="Faturamento Bruto por Canal (utm_source)"
              data={revenueByCanal}
              funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
              entityType="campaign"
            />
            <HBarChart
              title="Faturamento Bruto por Público (utm_medium)"
              data={revenueByPublico}
              funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
              entityType="adset"
            />
            <HBarChart
              title="Faturamento Bruto por Criativo (utm_content)"
              data={revenueByCriativo}
              funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
              entityType="ad"
            />
          </>
        ) : (
          <>
            <HBarChart
              title="Faturamento Bruto por Canal"
              data={revenueByCampaign}
              funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
              entityType="campaign"
            />
            <HBarChart
              title="Faturamento Bruto por Publico"
              data={revenueByAudience}
              funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
              entityType="adset"
            />
            <HBarChart
              title="Faturamento Bruto por Criativo"
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

      {/* ================================================================ */}
      {/* UPSELL HIGH TICKET — Story 29.22: cross-sell perpétuo → high ticket */}
      {/* ================================================================ */}
      <div className="space-y-6 pt-2 border-t border-border/30">
        <PerpetualUpsellSection
          projectId={projectId}
          funnelId={funnel.id}
          days={days}
          startDate={customRange?.startDate}
          endDate={customRange?.endDate}
        />
      </div>

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
  reembolsoReal = false,
  reembolsoBruto = 0,
  children,
}: {
  receitaBruta: number | null | undefined;
  spend: number | null | undefined;
  margin: number | null | undefined;
  platform: string | null | undefined;
  /** Quando true, o reembolso real já saiu do bruto → não aplica o 4% estimado. */
  reembolsoReal?: boolean;
  reembolsoBruto?: number;
  children: React.ReactNode;
}) {
  const bruto = receitaBruta ?? 0;
  const sp = spend ?? 0;
  const rawBreakdown = platform ? PLATFORM_FEE_BREAKDOWN[platform] : null;
  // Com reembolso real, tira a linha estimada de "Reembolso" (já descontado do bruto).
  const breakdown = rawBreakdown
    ? reembolsoReal
      ? rawBreakdown.filter((b) => b.label !== "Reembolso")
      : rawBreakdown
    : null;
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
              <span className="text-muted-foreground">Faturamento Bruto</span>
              <span className="tabular-nums font-medium">{fmtCurrency(bruto)}</span>
            </div>

            {reembolsoReal && reembolsoBruto > 0 && (
              <div className="flex justify-between gap-4 text-[11px]">
                <span className="text-muted-foreground">Reembolsos reais (já descontados)</span>
                <span className="tabular-nums text-amber-400">−{fmtCurrency(reembolsoBruto)}</span>
              </div>
            )}

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
                  <span className="font-medium">Faturamento Líquido</span>
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
  /**
   * Story 29.28: alerta explícito — pinta o card de vermelho quando uma condição
   * de negócio é violada (ex: CAC acima do Ticket Médio = prejuízo por venda).
   *
   * Vence QUALQUER outro estado visual. É deliberado: se o alerta dispara, o
   * usuário precisa ver vermelho, mesmo que outra regra pintaria de verde.
   *
   * Não usar `signValue={-1}` para esse efeito — funcionaria por acidente e
   * mentiria sobre o significado do valor.
   */
  alert?: boolean;
} & React.HTMLAttributes<HTMLDivElement>>(function KpiCard(
  { icon: Icon, label, value, target, actual, hintTooltip, comparison, fromSheet, warning, signValue, alert, className, ...rest },
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
        alert ? "border-red-500/30 bg-red-500/5"
          : signPos ? "border-emerald-500/30 bg-emerald-500/5"
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
      <p className={`text-xl font-bold tracking-tight ${alert ? "text-red-400" : signPos ? "text-emerald-400" : signNeg ? "text-red-400" : ""} ${hintTooltip ? "underline decoration-dotted decoration-muted-foreground/40 underline-offset-4" : ""}`}>{value}</p>
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
