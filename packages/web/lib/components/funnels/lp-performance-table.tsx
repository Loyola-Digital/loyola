"use client";

/**
 * Story 18.44 / 18.46: Tabela única de performance de LPs.
 *
 * Story 18.46:
 * - Uma única tabela com UMA linha por LP (coluna "LP" em vez de "Dia").
 * - Sem título/identificação por LP no topo (a LP é a primeira coluna).
 * - Cliques/Impressões ocultadas (Story 18.45 AC4); Leads/CPL (free) ou Vendas/CPV (paid)
 *   logo após Investimento.
 * - O filtro de público (Hot/Cold/Todos) é controlado pela seção pai (botões temáticos).
 */

import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  calculatePaidMetrics,
  calculateFreeMetrics,
  formatCurrency,
  formatPercent,
  formatRatio,
} from "@/lib/utils/lp-metrics-calculator";
import type { LpRow } from "@/lib/hooks/useLpPerformanceData";

/** Story 18.60: inteiro pt-BR para colunas de contagem (Ing. Únicos/Totais, LP View). */
function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString("pt-BR");
}

interface LpPerformanceTableProps {
  rows: LpRow[];
  stageType: "paid" | "free"; // "Captação Paga" ou "Captação Gratuita"
  isLoading?: boolean;
  /** Story 18.56: URL por LP (chave = lpName trim+lowercase). */
  lpLinks?: Record<string, string>;
  /** Story 18.56: salva/remove (url vazia) o link de uma LP. */
  onSaveLpLink?: (lpName: string, url: string) => Promise<void>;
}

/**
 * Story 18.58: explicação de cálculo/fonte de cada coluna (tooltip do header).
 * Fonte de verdade das fórmulas: lp-metrics-calculator.ts (implementações) e
 * useLpPerformanceData.ts (agregação/imposto/atribuição). Se uma fórmula
 * mudar lá, atualizar o texto aqui.
 */
const COLUMN_TOOLTIPS = {
  lp: "LP identificada pelo Campaign Name da campanha Meta (nome contém \"lpX\"; sem lpX → LPA)",
  investimento: "Soma do gasto Meta das campanhas da LP + imposto de 12,15%",
  leads: "Leads da planilha atribuídos à LP (utm_term/utm_content contém lpX), respeitando o filtro Hot/Cold",
  cpl: "Investimento ÷ Leads",
  cpm: "(Investimento ÷ Impressões) × 1000",
  cpc: "Investimento ÷ Cliques",
  ctr: "(Cliques ÷ Impressões) × 100",
  lpView: "Landing Page Views reais da Meta API, somados por LP",
  connectRate: "(LP Views ÷ Cliques no link) × 100 — % dos cliques que carregaram a LP; pode passar de 100% por particularidades de rastreamento",
  txConvPaid: "(Ingressos Únicos ÷ Cliques no link) × 100",
  txConvFree: "(Leads ÷ Cliques no link) × 100",
  roas: "Fat. Total ÷ Investimento",
  // Story 18.60 (Captação Paga)
  ingressosUnicos: "Compradores únicos de ingresso da LP (dedup por email, sem order bump), atribuídos via co= da venda → campanha da LP",
  ingressosTotais: "Todas as vendas (ingresso + order bump) atribuídas à LP via co= da venda",
  cplPagoUnico: "Investimento ÷ Ingressos Únicos da LP",
  faturamentoUnico: "Faturamento das compras únicas de captação da LP (dedup por email, sem order bump)",
  faturamentoTotal: "Faturamento bruto de todas as vendas (ingresso + order bump) atribuídas à LP via co=",
} as const;

/**
 * Story 18.60: modelo de colunas dirigido por descritor — habilita reorder,
 * tooltip e sort clicável (padrão da tabela de Criativos). A coluna "LP"
 * (texto/link via LpNameCell) fica FORA deste array (não é ordenável).
 */
type LpSortKey =
  | "investimento"
  | "ingressosUnicos"
  | "ingressosTotais"
  | "revenueUnico"
  | "revenueTotal"
  | "roas"
  | "cplPagoUnico"
  | "txConv"
  | "cpm"
  | "cpc"
  | "ctr"
  | "lpViews"
  | "connectRate"
  | "leads"
  | "cpl";

type LpColKind = "currency" | "int" | "percent" | "ratio";

interface LpColumn {
  key: LpSortKey;
  label: string;
  tooltip: string;
  kind: LpColKind;
}

// Ordem da Captação Paga (elicitação 18.60): Investimento → Ing. Únicos/Totais →
// Fat. Único/Total → ROAS → CPL Pago Único → Tx Conv. → CPM/CPC/CTR → LP View → Connect Rate.
const PAID_COLUMNS: LpColumn[] = [
  { key: "investimento", label: "Investimento (R$)", tooltip: COLUMN_TOOLTIPS.investimento, kind: "currency" },
  { key: "ingressosUnicos", label: "Ing. Únicos", tooltip: COLUMN_TOOLTIPS.ingressosUnicos, kind: "int" },
  { key: "ingressosTotais", label: "Ing. Totais", tooltip: COLUMN_TOOLTIPS.ingressosTotais, kind: "int" },
  { key: "revenueUnico", label: "Fat. Único (R$)", tooltip: COLUMN_TOOLTIPS.faturamentoUnico, kind: "currency" },
  { key: "revenueTotal", label: "Fat. Total (R$)", tooltip: COLUMN_TOOLTIPS.faturamentoTotal, kind: "currency" },
  { key: "roas", label: "ROAS", tooltip: COLUMN_TOOLTIPS.roas, kind: "ratio" },
  { key: "cplPagoUnico", label: "CPL Pago Único", tooltip: COLUMN_TOOLTIPS.cplPagoUnico, kind: "currency" },
  { key: "txConv", label: "Tx Conv. (%)", tooltip: COLUMN_TOOLTIPS.txConvPaid, kind: "percent" },
  { key: "cpm", label: "CPM", tooltip: COLUMN_TOOLTIPS.cpm, kind: "currency" },
  { key: "cpc", label: "CPC", tooltip: COLUMN_TOOLTIPS.cpc, kind: "currency" },
  { key: "ctr", label: "CTR (%)", tooltip: COLUMN_TOOLTIPS.ctr, kind: "percent" },
  { key: "lpViews", label: "LP View", tooltip: COLUMN_TOOLTIPS.lpView, kind: "int" },
  { key: "connectRate", label: "Connect Rate (%)", tooltip: COLUMN_TOOLTIPS.connectRate, kind: "percent" },
];

// Captação Gratuita: ordem/colunas idênticas a hoje (só ganha sort + tooltips).
const FREE_COLUMNS: LpColumn[] = [
  { key: "investimento", label: "Investimento (R$)", tooltip: COLUMN_TOOLTIPS.investimento, kind: "currency" },
  { key: "leads", label: "Leads", tooltip: COLUMN_TOOLTIPS.leads, kind: "int" },
  { key: "cpl", label: "CPL", tooltip: COLUMN_TOOLTIPS.cpl, kind: "currency" },
  { key: "cpm", label: "CPM", tooltip: COLUMN_TOOLTIPS.cpm, kind: "currency" },
  { key: "cpc", label: "CPC", tooltip: COLUMN_TOOLTIPS.cpc, kind: "currency" },
  { key: "ctr", label: "CTR (%)", tooltip: COLUMN_TOOLTIPS.ctr, kind: "percent" },
  { key: "lpViews", label: "LP View", tooltip: COLUMN_TOOLTIPS.lpView, kind: "int" },
  { key: "connectRate", label: "Connect Rate (%)", tooltip: COLUMN_TOOLTIPS.connectRate, kind: "percent" },
  { key: "txConv", label: "Tx Conv. (%)", tooltip: COLUMN_TOOLTIPS.txConvFree, kind: "percent" },
];

/** Story 18.60: valor numérico por coluna (null = "—"; sort trata null como 0). */
type LpComputedRow = { lpName: string; values: Record<LpSortKey, number | null> };

function formatCell(value: number | null, kind: LpColKind): React.ReactNode {
  switch (kind) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    case "ratio":
      return formatRatio(value);
    case "int":
      return formatInt(value);
  }
}

/** Story 18.56 (AC4): só http(s):// — bloqueia typos e esquemas maliciosos. */
function isValidLpUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Story 18.56: nome da LP hiperlinkado (quando há URL) + lápis que abre um
 * popover de edição. Sem `onSaveLpLink` a célula fica idêntica à anterior.
 */
function LpNameCell({
  lpName,
  url,
  onSave,
}: {
  lpName: string;
  url?: string;
  onSave?: (lpName: string, url: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = draft.trim();
  const canSave = trimmed === "" || isValidLpUrl(trimmed);

  async function handleSave() {
    if (!onSave || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(lpName, trimmed);
      setOpen(false);
    } catch {
      setError("Falha ao salvar — tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-primary"
          title={url}
        >
          {lpName}
          <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      ) : (
        lpName
      )}
      {onSave && (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) {
              setDraft(url ?? "");
              setError(null);
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground/50 hover:text-foreground transition-colors"
              aria-label={`Editar link da ${lpName}`}
            >
              <Pencil className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-2">
            <p className="text-sm font-medium">URL da {lpName}</p>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="https://exemplo.com/lp"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
              autoFocus
            />
            {!canSave && (
              <p className="text-xs text-destructive">
                URL inválida — use http:// ou https://
              </p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                Vazio remove o link
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

export function LpPerformanceTable({
  rows,
  stageType,
  isLoading = false,
  lpLinks,
  onSaveLpLink,
}: LpPerformanceTableProps) {
  const isPaid = stageType === "paid";
  const columns = isPaid ? PAID_COLUMNS : FREE_COLUMNS;

  // Story 18.60 (AC8/AC9): sort clicável por coluna. O estado vive aqui (filho),
  // então persiste ao trocar o filtro de público (Hot/Cold/Todos) ou o range —
  // a seção pai só troca as `rows`, não desmonta a tabela.
  const [sortCol, setSortCol] = useState<LpSortKey>("investimento");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: LpSortKey) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  // Story 18.60: computa métricas por LP e ordena pela coluna/direção ativas.
  const sortedRows: LpComputedRow[] = useMemo(() => {
    const computed = rows.map((row): LpComputedRow => {
      const m = isPaid
        ? calculatePaidMetrics({
            investimento: row.investimento,
            cliques: row.cliques,
            impressoes: row.impressoes,
            conversoes: row.conversoes,
            lpViews: row.lpViews,
            ingressosUnicos: row.ingressosUnicos ?? 0,
            revenueTotal: row.revenueTotal ?? 0,
          })
        : calculateFreeMetrics({
            investimento: row.investimento,
            cliques: row.cliques,
            impressoes: row.impressoes,
            conversoes: row.conversoes,
            lpViews: row.lpViews,
            leads: row.leads ?? 0,
          });
      return {
        lpName: row.lpName,
        values: {
          investimento: row.investimento,
          ingressosUnicos: row.ingressosUnicos ?? 0,
          ingressosTotais: row.ingressosTotais ?? 0,
          revenueUnico: row.revenueUnico ?? 0,
          revenueTotal: row.revenueTotal ?? 0,
          roas: m.roas ?? null,
          cplPagoUnico: m.cplPagoUnico ?? null,
          txConv: m.txConv,
          cpm: m.cpm,
          cpc: m.cpc,
          ctr: m.ctr,
          lpViews: row.lpViews,
          connectRate: m.connectRate,
          leads: row.leads ?? 0,
          cpl: m.cpl ?? null,
        },
      };
    });
    return computed.sort((a, b) => {
      const av = a.values[sortCol] ?? 0;
      const bv = b.values[sortCol] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, isPaid, sortCol, sortDir]);

  if (isLoading) {
    return <div className="p-4 text-center text-gray-500">Carregando...</div>;
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        Nenhum dado disponível.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          {/* Story 18.58/18.60: todos os headers com tooltip de cálculo + sort clicável */}
          <TableRow>
            {/* Coluna LP: tooltip, sem sort (texto/link via LpNameCell) */}
            <TableHead>
              <span
                title={COLUMN_TOOLTIPS.lp}
                className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4"
              >
                LP
              </span>
            </TableHead>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                onClick={() => handleSort(col.key)}
                title={col.tooltip}
                className="text-right cursor-pointer select-none hover:text-foreground"
              >
                <span className="inline-flex items-center justify-end gap-1">
                  {col.label}
                  {sortCol !== col.key ? (
                    <ArrowUpDown className="h-3 w-3 opacity-40" />
                  ) : sortDir === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => (
            <TableRow key={row.lpName}>
              <TableCell className="font-medium">
                {/* Story 18.56: nome hiperlinkado + lápis (match pela chave
                    normalizada, mesma do lpTotals no useLpPerformanceData) */}
                <LpNameCell
                  lpName={row.lpName}
                  url={lpLinks?.[row.lpName.trim().toLowerCase()]}
                  onSave={onSaveLpLink}
                />
              </TableCell>
              {columns.map((col) => (
                <TableCell key={col.key} className="text-right tabular-nums">
                  {formatCell(row.values[col.key], col.kind)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
