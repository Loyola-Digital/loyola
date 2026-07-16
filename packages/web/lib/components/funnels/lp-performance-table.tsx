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

import React, { useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";
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

interface LpPerformanceTableProps {
  rows: LpRow[];
  stageType: "paid" | "free"; // "Captação Paga" ou "Captação Gratuita"
  isLoading?: boolean;
  /** Story 18.56: URL por LP (chave = lpName trim+lowercase). */
  lpLinks?: Record<string, string>;
  /** Story 18.56: salva/remove (url vazia) o link de uma LP. */
  onSaveLpLink?: (lpName: string, url: string) => Promise<void>;
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
          <TableRow>
            <TableHead>LP</TableHead>
            <TableHead className="text-right">Investimento (R$)</TableHead>
            {/* Story 18.45/18.46: métricas-chave logo após Investimento */}
            {!isPaid && (
              <>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">CPL</TableHead>
              </>
            )}
            {isPaid && (
              <>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">CPV</TableHead>
              </>
            )}
            <TableHead className="text-right">CPM</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">CTR (%)</TableHead>
            <TableHead className="text-right">LP View</TableHead>
            <TableHead className="text-right">Connect Rate (%)</TableHead>
            <TableHead className="text-right">Tx Conv. (%)</TableHead>

            {/* Colunas de resultado por stage (paid) — Faturamento/ROAS no final */}
            {isPaid && (
              <>
                <TableHead className="text-right">Faturamento (R$)</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const metrics = isPaid
              ? calculatePaidMetrics({
                  investimento: row.investimento,
                  cliques: row.cliques,
                  impressoes: row.impressoes,
                  conversoes: row.conversoes,
                  lpViews: row.lpViews,
                  vendas: row.vendas ?? 0,
                  faturamento: row.faturamento ?? 0,
                })
              : calculateFreeMetrics({
                  investimento: row.investimento,
                  cliques: row.cliques,
                  impressoes: row.impressoes,
                  conversoes: row.conversoes,
                  lpViews: row.lpViews,
                  leads: row.leads ?? 0,
                });

            return (
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
                <TableCell className="text-right">
                  {formatCurrency(row.investimento)}
                </TableCell>
                {/* Story 18.45/18.46: métricas-chave logo após Investimento */}
                {!isPaid && (
                  <>
                    <TableCell className="text-right">{row.leads ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(metrics.cpl)}
                    </TableCell>
                  </>
                )}
                {isPaid && (
                  <>
                    <TableCell className="text-right">{row.vendas ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(metrics.cpv)}
                    </TableCell>
                  </>
                )}
                <TableCell className="text-right">
                  {formatCurrency(metrics.cpm)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(metrics.cpc)}
                </TableCell>
                <TableCell className="text-right">
                  {formatPercent(metrics.ctr)}
                </TableCell>
                <TableCell className="text-right">{row.lpViews}</TableCell>
                <TableCell className="text-right">
                  {formatPercent(metrics.connectRate)}
                </TableCell>
                <TableCell className="text-right">
                  {formatPercent(metrics.txConv)}
                </TableCell>

                {/* Colunas de resultado por stage (paid) — Faturamento/ROAS no final */}
                {isPaid && (
                  <>
                    <TableCell className="text-right">
                      {formatCurrency(row.faturamento)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatRatio(metrics.roas)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
