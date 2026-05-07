"use client";

import { useState } from "react";
import { FileSpreadsheet, Plus, Trash2 } from "lucide-react";
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
  useDeleteSaleSpreadsheetById,
} from "@/lib/hooks/use-stage-sales-spreadsheets";
import { StageSalesWizardDialog } from "./stage-sales-wizard-dialog";

interface MultiSalesSpreadsheetsProps {
  projectId: string;
  funnelId: string;
  stageId: string;
}

/**
 * Lista N planilhas de vendas (subtype='sales') de uma stage, com botão
 * pra adicionar mais e desconectar individualmente. Usado em etapas tipo
 * "sales" que aceitam múltiplas planilhas (UNIQUE constraint dropada).
 */
export function MultiSalesSpreadsheets({
  projectId,
  funnelId,
  stageId,
}: MultiSalesSpreadsheetsProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { data: all, isLoading } = useStageSalesSpreadsheets(projectId, funnelId, stageId);
  const deleteById = useDeleteSaleSpreadsheetById(projectId, funnelId, stageId);

  const salesSheets = (all ?? []).filter((s) => s.subtype === "sales");
  const pendingDelete = salesSheets.find((s) => s.id === pendingDeleteId) ?? null;

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    await deleteById.mutateAsync(pendingDeleteId);
    toast.success("Planilha desconectada");
    setPendingDeleteId(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Planilhas de Vendas</h3>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8"
          onClick={() => setWizardOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar planilha
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-16" />
      ) : salesSheets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma planilha conectada.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use &quot;Adicionar planilha&quot; pra conectar a primeira.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {salesSheets.map((sheet) => (
            <div
              key={sheet.id}
              className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileSpreadsheet className="h-5 w-5 text-green-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{sheet.spreadsheetName}</p>
                  <p className="text-xs text-muted-foreground truncate">Aba: {sheet.sheetName}</p>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive/70 hover:text-destructive shrink-0 ml-3"
                onClick={() => setPendingDeleteId(sheet.id)}
                aria-label="Desconectar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <StageSalesWizardDialog
        projectId={projectId}
        funnelId={funnelId}
        stageId={stageId}
        subtype="sales"
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar planilha?</AlertDialogTitle>
            <AlertDialogDescription>
              A planilha <strong>{pendingDelete?.spreadsheetName}</strong> será desconectada desta etapa. Os dados da planilha no Google Drive não serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteById.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteById.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteById.isPending ? "Desconectando..." : "Desconectar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
