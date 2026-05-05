"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeadScoringCampaignBreakdown } from "@/lib/hooks/use-lead-scoring-campaign-breakdown";

interface LeadScoringCampaignTablesProps {
  projectId: string;
  funnelId: string;
  stageId: string;
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function fmtPercent(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

const DAY_OPTIONS = [
  { value: 7, label: "Últimos 7 dias" },
  { value: 14, label: "Últimos 14 dias" },
  { value: 30, label: "Últimos 30 dias" },
  { value: 60, label: "Últimos 60 dias" },
  { value: 90, label: "Últimos 90 dias" },
];

export function LeadScoringCampaignTables({
  projectId,
  funnelId,
  stageId,
}: LeadScoringCampaignTablesProps) {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useLeadScoringCampaignBreakdown(
    projectId,
    funnelId,
    stageId,
    days,
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-5">
        <p className="text-sm text-red-700 dark:text-red-400">
          Erro ao carregar breakdown de campanhas: {error}
        </p>
      </div>
    );
  }

  if (!data || data.semDados) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <p className="text-sm text-muted-foreground">
          Nenhum dado de utm_campaign encontrado na planilha de pesquisa.
        </p>
      </div>
    );
  }

  const rows = data.rows ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <p className="text-sm text-muted-foreground">
          Nenhuma campanha com leads associados.
        </p>
      </div>
    );
  }

  // Extract band IDs from first row (assume all rows have same bands)
  const bandIds = Object.keys(rows[0]?.bands ?? {}).sort();

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Breakdown de Leads por Campanha</h3>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="days-select" className="text-xs text-muted-foreground">
            Período:
          </label>
          <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger id="days-select" className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value.toString()}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela 1: Distribuição por Faixa */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          Tabela 1: Distribuição de Leads por Faixa (%)
        </p>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10 min-w-[160px]">
                  Campanha
                </TableHead>
                <TableHead className="text-right min-w-[100px]">Investido</TableHead>
                <TableHead className="text-right min-w-[80px]">Leads</TableHead>
                <TableHead className="text-right min-w-[90px]">CPL</TableHead>
                <TableHead className="text-right min-w-[100px]">CPL Ideal</TableHead>
                {bandIds.map((bid) => (
                  <TableHead key={`${bid}-pct`} className="text-right min-w-[90px]">
                    % Band {bid}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.utmCampaign}>
                  <TableCell className="sticky left-0 bg-background z-10 font-medium truncate">
                    {row.campaignName}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {fmtCurrency(row.spend)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {fmtInt(row.totalLeads)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {fmtCurrency(row.cpl)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {fmtCurrency(row.cplIdeal)}
                  </TableCell>
                  {bandIds.map((bid) => (
                    <TableCell key={`${row.utmCampaign}-${bid}-pct`} className="text-right text-sm">
                      {fmtPercent(row.bands[bid]?.pct)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Tabela 2: Breakdown Financeiro por Faixa */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          Tabela 2: Custo por Faixa (CPL/Faixa + %)
        </p>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10 min-w-[160px]">
                  Campanha
                </TableHead>
                <TableHead className="text-right min-w-[100px]">Investido</TableHead>
                <TableHead className="text-right min-w-[80px]">Leads</TableHead>
                <TableHead className="text-right min-w-[90px]">CPL Total</TableHead>
                {bandIds.map((bid) => (
                  <div key={`col-${bid}`} className="contents">
                    <TableHead className="text-right min-w-[100px]">CPL {bid}</TableHead>
                    <TableHead className="text-right min-w-[90px]">% {bid}</TableHead>
                  </div>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.utmCampaign}>
                  <TableCell className="sticky left-0 bg-background z-10 font-medium truncate">
                    {row.campaignName}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {fmtCurrency(row.spend)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {fmtInt(row.totalLeads)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {fmtCurrency(row.cpl)}
                  </TableCell>
                  {bandIds.map((bid) => (
                    <div key={`row-${row.utmCampaign}-${bid}`} className="contents">
                      <TableCell className="text-right text-sm">
                        {fmtCurrency(row.bands[bid]?.cplFaixa)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {fmtPercent(row.bands[bid]?.pct)}
                      </TableCell>
                    </div>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
