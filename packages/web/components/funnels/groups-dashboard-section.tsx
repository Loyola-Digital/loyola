"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  RefreshCw,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  useFunnelGroupsLink,
  useFunnelGroupsDaily,
  useSyncFunnelGroups,
} from "@/lib/hooks/use-funnel-groups";
import type { FunnelGroupsDailyPoint } from "@loyola-x/shared";

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtSigned(n: number): string {
  if (n > 0) return `+${fmt(n)}`;
  return fmt(n);
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

interface Props {
  projectId: string;
  funnelId: string;
}

/**
 * Seção de dashboard com KPIs/gráfico/tabela de grupos.
 * O vínculo da planilha é feito na aba "Planilhas" (GroupsSpreadsheetCard).
 * Aqui só exibe os dados quando já está vinculado — caso contrário, oculta-se.
 */
export function GroupsDashboardSection({ projectId, funnelId }: Props) {
  const linkQuery = useFunnelGroupsLink(projectId, funnelId);
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [campaignFilter, setCampaignFilter] = useState<string>("__all__");

  const isLinked = !!linkQuery.data;
  const dateRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }, [days]);

  const dailyQuery = useFunnelGroupsDaily(projectId, funnelId, {
    from: dateRange.from,
    to: dateRange.to,
    enabled: isLinked,
  });

  const sync = useSyncFunnelGroups(projectId, funnelId);

  const data = dailyQuery.data;
  const campaigns = data?.campaigns ?? [];
  const isAllCampaigns = campaignFilter === "__all__";
  const filteredCampaigns = isAllCampaigns
    ? campaigns
    : campaigns.filter((c) => c.campaignId === campaignFilter);

  // Quando filtra por campanha, recalcula KPIs e aggSeries a partir da
  // campaign individual. Quando "Todas as campanhas", usa o agregado do backend.
  const filteredAggSeries = useMemo<FunnelGroupsDailyPoint[]>(() => {
    if (isAllCampaigns) return data?.aggregate.series ?? [];
    const c = campaigns.find((c) => c.campaignId === campaignFilter);
    return c?.series ?? [];
  }, [isAllCampaigns, campaignFilter, data, campaigns]);

  const filteredKpis = useMemo(() => {
    if (isAllCampaigns) return data?.kpis ?? null;
    if (filteredAggSeries.length === 0) return null;
    const last = filteredAggSeries[filteredAggSeries.length - 1];
    return {
      participants: last.participants,
      deltaParticipants: last.deltaParticipants,
      deltaInput: last.deltaInput,
      deltaOutput: last.deltaOutput,
      groupFull: last.groupFull,
      groupOpen: last.groupOpen,
      groupTotal: last.groupTotal,
      clicksTotal: filteredAggSeries.reduce((s, p) => s + p.clicksTotal, 0),
      asOf: last.date,
    };
  }, [isAllCampaigns, filteredAggSeries, data]);

  const tableRows = useMemo(() => {
    type Row = FunnelGroupsDailyPoint & { campaignId: string; campaignName: string };
    const rows: Row[] = [];
    for (const c of filteredCampaigns) {
      for (const p of c.series) {
        rows.push({ ...p, campaignId: c.campaignId, campaignName: c.campaignName });
      }
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return rows;
  }, [filteredCampaigns]);

  // Auto-sync ao abrir: puxa a planilha sozinho quando o último sync está
  // "velho" (> 10 min). Sync é barato (só lê a planilha + upsert, sem Meta) e
  // idempotente, então é seguro. O botão continua pra forçar refresh na hora.
  const autoSyncRan = useRef(false);
  const lastSyncedAt = linkQuery.data?.lastSyncedAt ?? null;
  useEffect(() => {
    if (!isLinked || autoSyncRan.current || sync.isPending) return;
    const lastMs = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0;
    if (Date.now() - lastMs <= 10 * 60 * 1000) return; // fresco: não re-sincroniza
    autoSyncRan.current = true;
    sync.mutate(undefined); // silencioso — o refetch do daily já atualiza a tela
  }, [isLinked, lastSyncedAt, sync]);

  function handleSync() {
    sync.mutate(undefined, {
      onSuccess: (r) => {
        if (r.errors.length > 0) {
          toast.warning(`Sincronizado com ${r.errors.length} avisos`, {
            description: `${r.rowsInserted} novos · ${r.rowsUpdated} atualizados`,
          });
        } else {
          toast.success("Sincronizado", {
            description: `${r.rowsInserted} novos · ${r.rowsUpdated} atualizados de ${r.rowsProcessed} linhas`,
          });
        }
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao sincronizar"),
    });
  }

  // Se ainda carregando ou sem vínculo, não mostra a seção (vazio é gerenciado na tab Planilhas)
  if (linkQuery.isLoading || !isLinked) return null;

  const link = linkQuery.data!;

  return (
    <div className="rounded-lg border border-border/40 bg-card/40 p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-500" />
            Grupos
          </h3>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span className="font-mono">{link.spreadsheetName}</span>
            <span className="text-muted-foreground/60">·</span>
            <span>{link.sheetName}</span>
            {link.lastSyncedAt && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span>última sync: {new Date(link.lastSyncedAt).toLocaleString("pt-BR")}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {campaigns.length > 0 && (
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="h-8 w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as campanhas</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.campaignId} value={c.campaignId}>
                    {c.campaignName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as 7 | 14 | 30)}>
            <SelectTrigger className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7d</SelectItem>
              <SelectItem value="14">Últimos 14d</SelectItem>
              <SelectItem value="30">Últimos 30d</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleSync} size="sm" variant="outline" disabled={sync.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
        </div>
      </div>

      {dailyQuery.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : filteredKpis ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            icon={<Users className="h-4 w-4" />}
            label="Participantes"
            value={fmt(filteredKpis.participants)}
            sublabel={filteredKpis.asOf ? `até ${formatDateBR(filteredKpis.asOf)}` : null}
            color="purple"
          />
          <KpiCard
            icon={<ArrowDownToLine className="h-4 w-4" />}
            label="Entrou no dia"
            value={fmtSigned(filteredKpis.deltaInput)}
            sublabel="vs. dia anterior"
            color="green"
          />
          <KpiCard
            icon={<ArrowUpFromLine className="h-4 w-4" />}
            label="Saiu no dia"
            value={fmtSigned(filteredKpis.deltaOutput)}
            sublabel="vs. dia anterior"
            color="red"
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Saldo do dia"
            value={fmtSigned(filteredKpis.deltaParticipants)}
            sublabel={`${fmt(filteredKpis.groupOpen)} grupos abertos · ${fmt(filteredKpis.groupFull)} lotados`}
            color={filteredKpis.deltaParticipants >= 0 ? "green" : "red"}
          />
        </div>
      ) : null}

      {filteredAggSeries.length > 0 && <EvolutionChart series={filteredAggSeries} />}

      {campaigns.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border/40 rounded">
          {sync.isPending ? (
            <>Sincronizando com a planilha…</>
          ) : (
            <>Nenhum dado nos últimos {days} dias. Sincroniza sozinho ao abrir — ou clique em <strong>Sincronizar</strong> pra forçar agora.</>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">Detalhamento diário</h4>
            {!isAllCampaigns && (
              <span className="text-xs text-muted-foreground">
                Filtrado por: {campaigns.find((c) => c.campaignId === campaignFilter)?.campaignName ?? ""}
              </span>
            )}
          </div>
          <div className="rounded-md border border-border/40 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Campanha</TableHead>
                  <TableHead className="text-right">Participantes</TableHead>
                  <TableHead className="text-right text-green-600">Entrou</TableHead>
                  <TableHead className="text-right text-red-600">Saiu</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Grupos (Aberto/Lotado/Total)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.slice(0, 100).map((r) => (
                  <TableRow key={`${r.campaignId}-${r.date}`}>
                    <TableCell className="font-mono text-xs">{formatDateBR(r.date)}</TableCell>
                    <TableCell className="text-xs max-w-[280px] truncate">{r.campaignName}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(r.participants)}</TableCell>
                    <TableCell className="text-right text-green-600">{fmtSigned(r.deltaInput)}</TableCell>
                    <TableCell className="text-right text-red-600">{fmtSigned(r.deltaOutput)}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${r.deltaParticipants >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {fmtSigned(r.deltaParticipants)}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {fmt(r.groupOpen)}/{fmt(r.groupFull)}/{fmt(r.groupTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {tableRows.length > 100 && (
              <div className="p-2 text-xs text-muted-foreground text-center bg-muted/30">
                Mostrando 100 de {fmt(tableRows.length)} linhas
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sublabel,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string | null;
  color: "purple" | "green" | "red";
}) {
  const colorClass = {
    purple: "text-purple-500",
    green: "text-green-600",
    red: "text-red-600",
  }[color];

  return (
    <div className="rounded-md border border-border/40 bg-card/30 p-3">
      <div className={`flex items-center gap-1.5 text-xs ${colorClass}`}>
        {icon}
        <span className="uppercase font-medium tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</div>
      {sublabel && <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>}
    </div>
  );
}

function EvolutionChart({ series }: { series: FunnelGroupsDailyPoint[] }) {
  // maxAbs absorve negativos (esperado em deltas problemáticos da fonte) e
  // garante denominador >= 1 para evitar divisão por zero.
  const maxAbs = Math.max(
    1,
    ...series.map((s) => Math.max(Math.abs(s.deltaInput), Math.abs(s.deltaOutput)))
  );
  const MAX_BAR_PX = 90;

  return (
    <div className="rounded-md border border-border/40 bg-card/30 p-4">
      <h4 className="text-xs uppercase font-medium tracking-wider text-muted-foreground mb-3">
        Entradas vs. Saídas (diário)
      </h4>
      <div className="flex items-end gap-1 min-h-[120px]">
        {series.map((s) => {
          const inH = Math.round((Math.abs(s.deltaInput) / maxAbs) * MAX_BAR_PX);
          const outH = Math.round((Math.abs(s.deltaOutput) / maxAbs) * MAX_BAR_PX);
          return (
            <div
              key={s.date}
              className="flex-1 flex flex-col items-center justify-end gap-0.5 min-w-0"
              title={`${formatDateBR(s.date)} · entrou ${fmtSigned(s.deltaInput)} · saiu ${fmtSigned(s.deltaOutput)}`}
            >
              <div className="flex flex-col w-full items-stretch gap-0.5">
                <div
                  className="w-full bg-green-500/70 rounded-t-sm"
                  style={{ height: `${Math.max(2, inH)}px` }}
                />
                <div
                  className="w-full bg-red-500/70 rounded-b-sm"
                  style={{ height: `${Math.max(2, outH)}px` }}
                />
              </div>
              <div className="text-[9px] text-muted-foreground rotate-[-30deg] mt-1 origin-left whitespace-nowrap">
                {s.date.slice(5)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-green-500/70 rounded-sm" />
          Entrou
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-red-500/70 rounded-sm" />
          Saiu
        </div>
      </div>
    </div>
  );
}
