"use client";

import { useMemo, useState } from "react";
import {
  FileSpreadsheet,
  RefreshCw,
  Trash2,
  Search,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  useLinkFunnelGroupsSpreadsheet,
  useUnlinkFunnelGroupsSpreadsheet,
  useSyncFunnelGroups,
} from "@/lib/hooks/use-funnel-groups";
import { useSpreadsheets, useSpreadsheetSheets } from "@/lib/hooks/use-google-sheets";
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

export function GroupsDashboardSection({ projectId, funnelId }: Props) {
  const linkQuery = useFunnelGroupsLink(projectId, funnelId);
  const [pickerOpen, setPickerOpen] = useState(false);
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
  const unlink = useUnlinkFunnelGroupsSpreadsheet(projectId, funnelId);

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

  function handleUnlink() {
    if (!confirm("Desvincular planilha e apagar todos os snapshots de grupos?")) return;
    unlink.mutate(undefined, {
      onSuccess: () => toast.success("Planilha desvinculada"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Erro"),
    });
  }

  if (linkQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 p-6">
        <Skeleton className="h-6 w-40 mb-4" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  // ESTADO VAZIO: sem planilha vinculada
  if (!isLinked) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              Grupos
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Acompanhe entradas, saídas e saldo de participantes nos grupos da campanha.
            </p>
          </div>
          <Button onClick={() => setPickerOpen(true)} size="sm">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Vincular planilha
          </Button>
        </div>

        <SheetsPickerDialog
          projectId={projectId}
          funnelId={funnelId}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
        />
      </div>
    );
  }

  // ESTADO VINCULADO
  const link = linkQuery.data!;
  const data = dailyQuery.data;
  const kpis = data?.kpis;
  const aggSeries = data?.aggregate.series ?? [];
  const campaigns = data?.campaigns ?? [];

  const filteredCampaigns =
    campaignFilter === "__all__"
      ? campaigns
      : campaigns.filter((c) => c.campaignId === campaignFilter);

  // Tabela diária: explode todas as séries (ou filtradas) em linhas
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

  return (
    <div className="rounded-lg border border-border/40 bg-card/40 p-6 space-y-6">
      {/* Header com link info + ações */}
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
        <div className="flex items-center gap-2">
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
          <Button onClick={handleUnlink} size="sm" variant="ghost" disabled={unlink.isPending}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {dailyQuery.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : kpis ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            icon={<Users className="h-4 w-4" />}
            label="Participantes"
            value={fmt(kpis.participants)}
            sublabel={kpis.asOf ? `até ${formatDateBR(kpis.asOf)}` : null}
            color="purple"
          />
          <KpiCard
            icon={<ArrowDownToLine className="h-4 w-4" />}
            label="Entrou no dia"
            value={fmtSigned(kpis.deltaInput)}
            sublabel="vs. dia anterior"
            color="green"
          />
          <KpiCard
            icon={<ArrowUpFromLine className="h-4 w-4" />}
            label="Saiu no dia"
            value={fmtSigned(kpis.deltaOutput)}
            sublabel="vs. dia anterior"
            color="red"
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Saldo do dia"
            value={fmtSigned(kpis.deltaParticipants)}
            sublabel={`${fmt(kpis.groupOpen)} grupos abertos · ${fmt(kpis.groupFull)} lotados`}
            color={kpis.deltaParticipants >= 0 ? "green" : "red"}
          />
        </div>
      ) : null}

      {/* Mini-gráfico de evolução (sparkline ASCII via barras) */}
      {aggSeries.length > 0 && <EvolutionChart series={aggSeries} />}

      {/* Tabela diária */}
      {campaigns.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border/40 rounded">
          Nenhum dado nos últimos {days} dias. Clique em <strong>Sincronizar</strong> para puxar da planilha.
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">Detalhamento diário</h4>
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="h-8 w-[280px]">
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

// ============================================================
// KPI Card
// ============================================================
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

// ============================================================
// Evolution chart (barras simples — entrou vs saiu por dia)
// ============================================================
function EvolutionChart({ series }: { series: FunnelGroupsDailyPoint[] }) {
  const maxAbs = Math.max(
    1,
    ...series.map((s) => Math.max(Math.abs(s.deltaInput), Math.abs(s.deltaOutput)))
  );

  return (
    <div className="rounded-md border border-border/40 bg-card/30 p-4">
      <h4 className="text-xs uppercase font-medium tracking-wider text-muted-foreground mb-3">
        Entradas vs. Saídas (diário)
      </h4>
      <div className="flex items-end gap-1 h-28">
        {series.map((s) => {
          const inH = (s.deltaInput / maxAbs) * 100;
          const outH = (s.deltaOutput / maxAbs) * 100;
          return (
            <div
              key={s.date}
              className="flex-1 flex flex-col items-center justify-end gap-0.5 group relative"
              title={`${formatDateBR(s.date)} · entrou ${fmtSigned(s.deltaInput)} · saiu ${fmtSigned(s.deltaOutput)}`}
            >
              <div className="flex flex-col w-full items-center gap-0.5">
                <div
                  className="w-full bg-green-500/70 rounded-t-sm transition-all"
                  style={{ height: `${Math.max(2, inH * 0.9)}%` }}
                />
                <div
                  className="w-full bg-red-500/70 rounded-b-sm transition-all"
                  style={{ height: `${Math.max(2, outH * 0.9)}%` }}
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

// ============================================================
// Sheets Picker Dialog
// ============================================================
function SheetsPickerDialog({
  projectId,
  funnelId,
  open,
  onOpenChange,
}: {
  projectId: string;
  funnelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: spreadsheetsData, isLoading: spreadsheetsLoading } = useSpreadsheets();
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const { data: sheetsData, isLoading: sheetsLoading } = useSpreadsheetSheets(
    selectedSpreadsheet?.id ?? null
  );
  const [search, setSearch] = useState("");
  const link = useLinkFunnelGroupsSpreadsheet(projectId, funnelId);
  const sync = useSyncFunnelGroups(projectId, funnelId);

  const spreadsheets = spreadsheetsData?.spreadsheets ?? [];
  const filtered = search
    ? spreadsheets.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : spreadsheets;

  function handleSelectSheet(sheetName: string) {
    if (!selectedSpreadsheet) return;
    link.mutate(
      {
        spreadsheetId: selectedSpreadsheet.id,
        spreadsheetName: selectedSpreadsheet.name,
        sheetName,
      },
      {
        onSuccess: () => {
          toast.success(`Planilha vinculada — sincronizando...`);
          // Sincronização inicial automática
          sync.mutate(undefined, {
            onSuccess: (r) =>
              toast.success(`Importados ${r.rowsInserted} snapshots`, {
                description: r.errors.length > 0 ? `${r.errors.length} avisos` : undefined,
              }),
            onError: (err) =>
              toast.error(`Erro na sync: ${err instanceof Error ? err.message : "?"}`),
          });
          handleClose();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Erro"),
      }
    );
  }

  function handleClose() {
    setSelectedSpreadsheet(null);
    setSearch("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-purple-500" />
            Vincular planilha de grupos
          </DialogTitle>
        </DialogHeader>

        {!selectedSpreadsheet ? (
          <div className="space-y-3 overflow-y-auto">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar planilha..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {spreadsheetsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {search ? "Nenhuma planilha encontrada." : "Nenhuma planilha disponível."}
              </p>
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSpreadsheet({ id: s.id, name: s.name })}
                    className="w-full text-left px-3 py-2 rounded hover:bg-muted/60 text-sm flex items-center gap-2"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-purple-500 shrink-0" />
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto">
            <div className="flex items-center gap-2 text-sm bg-muted/50 px-3 py-2 rounded">
              <FileSpreadsheet className="h-4 w-4 text-purple-500" />
              <span className="font-medium truncate">{selectedSpreadsheet.name}</span>
              <Badge variant="secondary" className="ml-auto text-xs">
                Selecionada
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Selecione a aba que contém os snapshots de grupos:
            </p>
            {sheetsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {sheetsData?.sheets.map((sheet) => (
                  <button
                    key={sheet.sheetId}
                    onClick={() => handleSelectSheet(sheet.title)}
                    disabled={link.isPending}
                    className="w-full text-left px-3 py-2 rounded hover:bg-muted/60 text-sm flex items-center justify-between"
                  >
                    <span>{sheet.title}</span>
                    <span className="text-xs text-muted-foreground">{sheet.rowCount} linhas</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {selectedSpreadsheet && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedSpreadsheet(null)}>
              Voltar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
