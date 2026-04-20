"use client";

import { useState } from "react";
import { FileSpreadsheet, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  useStageSalesSpreadsheets,
  useDisconnectSaleSpreadsheet,
} from "@/lib/hooks/use-stage-sales-spreadsheets";
import { StageSalesWizardDialog } from "./stage-sales-wizard-dialog";
import type { StageSalesSubtype } from "@loyola-x/shared";

interface StageSalesSpreadsheetSectionProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  subtype: StageSalesSubtype;
  title: string;
}

export function StageSalesSpreadsheetSection({
  projectId,
  funnelId,
  stageId,
  subtype,
  title,
}: StageSalesSpreadsheetSectionProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const { data: all, isLoading } = useStageSalesSpreadsheets(projectId, funnelId, stageId);
  const disconnect = useDisconnectSaleSpreadsheet(projectId, funnelId, stageId);

  const spreadsheet = all?.find((s) => s.subtype === subtype) ?? null;

  async function handleDisconnect() {
    await disconnect.mutateAsync(subtype);
    toast.success("Planilha desconectada");
    setDisconnectOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {!spreadsheet && !isLoading && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8"
            onClick={() => setWizardOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Conectar planilha
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-16" />
      ) : spreadsheet ? (
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileSpreadsheet className="h-5 w-5 text-green-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{spreadsheet.spreadsheetName}</p>
              <p className="text-xs text-muted-foreground truncate">Aba: {spreadsheet.sheetName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              onClick={() => setWizardOpen(true)}
            >
              Reconectar
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => setDisconnectOpen(true)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhuma planilha conectada.</p>
      )}

      <StageSalesWizardDialog
        projectId={projectId}
        funnelId={funnelId}
        stageId={stageId}
        subtype={subtype}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar planilha?</AlertDialogTitle>
            <AlertDialogDescription>
              A planilha <strong>{spreadsheet?.spreadsheetName}</strong> será desconectada desta etapa. Os dados da planilha não serão apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnect.isPending ? "Desconectando..." : "Desconectar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
