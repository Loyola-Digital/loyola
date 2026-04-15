"use client";

import { useState } from "react";
import { FileSpreadsheet, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteFunnelSpreadsheet } from "@/lib/hooks/use-funnel-spreadsheets";
import type { FunnelSpreadsheet, FunnelSpreadsheetType } from "@/lib/types/funnel-spreadsheet";
import { EditFunnelSpreadsheetDialog } from "@/components/funnels/edit-funnel-spreadsheet-dialog";
import { countMappedFields } from "@/components/funnels/funnel-spreadsheet-wizard-dialog";

const TYPE_LABEL: Record<FunnelSpreadsheetType, string> = {
  leads: "Leads",
  sales: "Vendas",
  custom: "Custom",
};

const TYPE_CLASSES: Record<FunnelSpreadsheetType, string> = {
  leads: "bg-blue-500/10 text-blue-600 border-blue-500/30 hover:bg-blue-500/15",
  sales: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15",
  custom: "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/15",
};

interface FunnelSpreadsheetListItemProps {
  spreadsheet: FunnelSpreadsheet;
  projectId: string;
  funnelId: string;
}

export function FunnelSpreadsheetListItem({
  spreadsheet, projectId, funnelId,
}: FunnelSpreadsheetListItemProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteSpreadsheet = useDeleteFunnelSpreadsheet(projectId, funnelId);

  const mappedCount = countMappedFields(spreadsheet.columnMapping);

  function handleDelete() {
    deleteSpreadsheet.mutate(spreadsheet.id, {
      onSuccess: () => {
        toast.success("Planilha removida.");
        setDeleteOpen(false);
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Erro ao remover.");
      },
    });
  }

  return (
    <>
      <div className="rounded-lg border border-border/30 bg-card/60 p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <FileSpreadsheet className="h-5 w-5 text-green-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">{spreadsheet.label}</p>
              <Badge
                variant="outline"
                className={`text-[10px] ${TYPE_CLASSES[spreadsheet.type]}`}
              >
                {TYPE_LABEL[spreadsheet.type]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {spreadsheet.spreadsheetName} / {spreadsheet.sheetName}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {mappedCount} {mappedCount === 1 ? "campo mapeado" : "campos mapeados"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setEditOpen(true)}
            aria-label="Editar mapeamento"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive/70 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            aria-label="Remover planilha"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {editOpen && (
        <EditFunnelSpreadsheetDialog
          spreadsheet={spreadsheet}
          projectId={projectId}
          funnelId={funnelId}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover planilha vinculada?</AlertDialogTitle>
            <AlertDialogDescription>
              O vínculo &quot;{spreadsheet.label}&quot; será removido do funil. A planilha no
              Google Drive <strong>não</strong> será afetada. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSpreadsheet.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleteSpreadsheet.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSpreadsheet.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
