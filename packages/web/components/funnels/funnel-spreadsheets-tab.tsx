"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, Plus, Table as TableIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFunnelSpreadsheets } from "@/lib/hooks/use-funnel-spreadsheets";
import { FunnelSpreadsheetWizardDialog } from "@/components/funnels/funnel-spreadsheet-wizard-dialog";
import { FunnelSpreadsheetListItem } from "@/components/funnels/funnel-spreadsheet-list-item";

interface FunnelSpreadsheetsTabProps {
  projectId: string;
  funnelId: string;
}

export function FunnelSpreadsheetsTab({ projectId, funnelId }: FunnelSpreadsheetsTabProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data, isLoading, error } = useFunnelSpreadsheets(projectId, funnelId);

  useEffect(() => {
    if (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar planilhas.");
    }
  }, [error]);

  const spreadsheets = data?.spreadsheets ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TableIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Planilhas vinculadas</h2>
          {spreadsheets.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({spreadsheets.length})
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setWizardOpen(true)}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Vincular planilha
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : spreadsheets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/30 p-8 text-center space-y-3">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium">Nenhuma planilha vinculada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Vincule planilhas de leads, vendas ou dados customizados para acompanhar o
              funil com dados estruturados.
            </p>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={() => setWizardOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Vincular primeira planilha
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {spreadsheets.map((sheet) => (
            <FunnelSpreadsheetListItem
              key={sheet.id}
              spreadsheet={sheet}
              projectId={projectId}
              funnelId={funnelId}
            />
          ))}
        </div>
      )}

      <FunnelSpreadsheetWizardDialog
        projectId={projectId}
        funnelId={funnelId}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
    </div>
  );
}
