"use client";

import { useState } from "react";
import { FileSpreadsheet, Trash2, RefreshCw, Search, Users } from "lucide-react";
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
import { toast } from "sonner";
import {
  useFunnelGroupsLink,
  useLinkFunnelGroupsSpreadsheet,
  useUnlinkFunnelGroupsSpreadsheet,
  useSyncFunnelGroups,
} from "@/lib/hooks/use-funnel-groups";
import { useSpreadsheets, useSpreadsheetSheets } from "@/lib/hooks/use-google-sheets";

interface Props {
  projectId: string;
  funnelId: string;
}

/**
 * Card de gerenciamento da planilha de grupos (vincular/desvincular/sincronizar).
 * O vínculo é a nível de funil — aparece igual em qualquer stage do mesmo funil.
 * KPIs e tabela diária ficam no dashboard (GroupsDashboardSection).
 */
export function GroupsSpreadsheetCard({ projectId, funnelId }: Props) {
  const linkQuery = useFunnelGroupsLink(projectId, funnelId);
  const [pickerOpen, setPickerOpen] = useState(false);
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
      <div className="rounded-lg border border-border/40 bg-card/40 p-4">
        <Skeleton className="h-16" />
      </div>
    );
  }

  const link = linkQuery.data;

  return (
    <div className="rounded-lg border border-border/40 bg-card/40 p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-purple-500/10 p-2">
            <Users className="h-4 w-4 text-purple-500" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Grupos (WhatsApp/Telegram)</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Snapshots diários de participantes por campanha. Vínculo a nível de funil.
            </p>
            {link && (
              <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2 flex-wrap">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span className="font-mono">{link.spreadsheetName}</span>
                <span className="text-muted-foreground/60">·</span>
                <span>aba: {link.sheetName}</span>
                {link.lastSyncedAt && (
                  <>
                    <span className="text-muted-foreground/60">·</span>
                    <span>última sync: {new Date(link.lastSyncedAt).toLocaleString("pt-BR")}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {link ? (
            <>
              <Button onClick={handleSync} size="sm" variant="outline" disabled={sync.isPending}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`} />
                Sincronizar
              </Button>
              <Button onClick={handleUnlink} size="sm" variant="ghost" disabled={unlink.isPending}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button onClick={() => setPickerOpen(true)} size="sm">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Vincular planilha
            </Button>
          )}
        </div>
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

// ============================================================
// Sheets Picker Dialog (usado só por este card)
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
          toast.success("Planilha vinculada — sincronizando...");
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
