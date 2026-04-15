"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useSheetData } from "@/lib/hooks/use-google-sheets";
import { useUpdateFunnelSpreadsheet } from "@/lib/hooks/use-funnel-spreadsheets";
import type {
  ColumnMapping, FunnelSpreadsheet, FunnelSpreadsheetType,
} from "@/lib/types/funnel-spreadsheet";
import {
  MappingFieldsGroups, countMappedFields,
} from "@/components/funnels/funnel-spreadsheet-wizard-dialog";

interface EditFunnelSpreadsheetDialogProps {
  spreadsheet: FunnelSpreadsheet;
  projectId: string;
  funnelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditFunnelSpreadsheetDialog({
  spreadsheet, projectId, funnelId, open, onOpenChange,
}: EditFunnelSpreadsheetDialogProps) {
  const [label, setLabel] = useState(spreadsheet.label);
  const [type, setType] = useState<FunnelSpreadsheetType>(spreadsheet.type);
  const [mapping, setMapping] = useState<ColumnMapping>(spreadsheet.columnMapping);

  const { data: sheetData, isLoading } = useSheetData(spreadsheet.spreadsheetId, spreadsheet.sheetName);
  const updateSpreadsheet = useUpdateFunnelSpreadsheet(projectId, funnelId);

  const columns = sheetData?.headers ?? [];
  const mappedCount = countMappedFields(mapping);
  const canSave = mappedCount > 0 && label.trim().length > 0;

  function updateField(key: keyof ColumnMapping, value: string) {
    setMapping((prev) => {
      const next = { ...prev };
      if (value === "__none__" || !value) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  function handleSave() {
    if (!canSave) return;
    updateSpreadsheet.mutate(
      {
        id: spreadsheet.id,
        label: label.trim(),
        type,
        columnMapping: mapping,
      },
      {
        onSuccess: () => {
          toast.success("Mapeamento atualizado!");
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Erro ao atualizar.");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Editar mapeamento — {spreadsheet.spreadsheetName} / {spreadsheet.sheetName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          <div className="grid gap-3 grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as FunnelSpreadsheetType)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="sales">Vendas</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            Para alterar planilha ou aba, remova este vínculo e crie outro.
          </p>

          {isLoading && columns.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (
            <MappingFieldsGroups mapping={mapping} columns={columns} onChange={updateField} />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || updateSpreadsheet.isPending}
          >
            {updateSpreadsheet.isPending
              ? "Salvando..."
              : `Salvar (${mappedCount} ${mappedCount === 1 ? "campo" : "campos"})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
