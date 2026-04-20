"use client";

import { useState } from "react";
import { FileSpreadsheet, Search } from "lucide-react";
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
import {
  useSpreadsheets, useSpreadsheetSheets, useSheetData,
} from "@/lib/hooks/use-google-sheets";
import { useConnectSaleSpreadsheet } from "@/lib/hooks/use-stage-sales-spreadsheets";
import type { SaleColumnMapping, StageSalesSubtype } from "@loyola-x/shared";

// ============================================================
// SALE MAPPING FIELDS
// ============================================================

const SALE_MAPPING_FIELDS: Array<{
  key: keyof SaleColumnMapping;
  label: string;
  required?: boolean;
}> = [
  { key: "email", label: "Email", required: true },
  { key: "valorBruto", label: "Valor Bruto" },
  { key: "valorLiquido", label: "Valor Líquido" },
  { key: "formaPagamento", label: "Forma de Pagamento" },
  { key: "canalOrigem", label: "Canal de Origem" },
  { key: "dataVenda", label: "Data da Venda" },
];

type Step = "spreadsheet" | "sheet" | "mapping";

interface StageSalesWizardDialogProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  subtype: StageSalesSubtype;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StageSalesWizardDialog({
  projectId, funnelId, stageId, subtype, open, onOpenChange,
}: StageSalesWizardDialogProps) {
  const { data: spreadsheetsData, isLoading: spreadsheetsLoading } = useSpreadsheets();
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<{ id: string; name: string } | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Partial<SaleColumnMapping>>({});
  const [search, setSearch] = useState("");
  const [directLink, setDirectLink] = useState("");

  const { data: sheetsData, isLoading: sheetsLoading } = useSpreadsheetSheets(
    selectedSpreadsheet?.id ?? null
  );
  const { data: sheetData, isLoading: sheetDataLoading } = useSheetData(
    selectedSpreadsheet?.id ?? null,
    selectedSheet
  );
  const connect = useConnectSaleSpreadsheet(projectId, funnelId, stageId);

  const spreadsheets = spreadsheetsData?.spreadsheets ?? [];
  const filtered = search
    ? spreadsheets.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : spreadsheets;

  const rawHeaders = sheetData?.headers ?? [];
  const columns = Array.from(
    new Set(rawHeaders.map((h, i) => (h && h.trim().length > 0 ? h : `Coluna ${i + 1}`)))
  );

  const step: Step = !selectedSpreadsheet ? "spreadsheet" : !selectedSheet ? "sheet" : "mapping";

  const canSave = !!(mapping.email && mapping.email.length > 0);

  function resetState() {
    setSelectedSpreadsheet(null);
    setSelectedSheet(null);
    setMapping({});
    setSearch("");
    setDirectLink("");
  }

  function handleClose() {
    resetState();
    onOpenChange(false);
  }

  function updateField(key: keyof SaleColumnMapping, value: string) {
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
    if (!selectedSpreadsheet || !selectedSheet || !canSave || !mapping.email) return;
    connect.mutate(
      {
        subtype,
        spreadsheetId: selectedSpreadsheet.id,
        spreadsheetName: sheetsData?.name ?? selectedSpreadsheet.name,
        sheetName: selectedSheet,
        columnMapping: mapping as SaleColumnMapping,
      },
      {
        onSuccess: () => {
          toast.success("Planilha de vendas conectada!");
          handleClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Erro ao conectar planilha.");
        },
      }
    );
  }

  const subtypeLabel = subtype === "capture" ? "Captação" : "Produto Principal";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            {step === "spreadsheet"
              ? `Planilha de ${subtypeLabel} — selecione o arquivo`
              : step === "sheet"
                ? `Planilha de ${subtypeLabel} — selecione a aba`
                : `Planilha de ${subtypeLabel} — mapear colunas`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {step === "spreadsheet" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Colar link da planilha</Label>
                <div className="flex gap-2">
                  <Input
                    value={directLink}
                    onChange={(e) => setDirectLink(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="flex-1 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!directLink.trim()}
                    onClick={() => {
                      const match = directLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
                      if (match) {
                        setSelectedSpreadsheet({ id: match[1], name: "Planilha" });
                      } else {
                        toast.error("Link inválido. Cole o link completo do Google Sheets.");
                      }
                    }}
                  >
                    Usar
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex-1 h-px bg-border/50" />
                <span>ou selecione da lista</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>

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
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {search ? "Nenhuma planilha encontrada." : "Nenhuma planilha no Google Drive."}
                </p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto space-y-1">
                  {filtered.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSpreadsheet(s)}
                      className="w-full flex items-center gap-3 rounded-lg border border-border/30 p-3 text-left hover:bg-accent transition-colors"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="text-sm truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "sheet" && (
            <>
              <button
                onClick={() => setSelectedSpreadsheet(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← Voltar
              </button>

              <p className="text-sm font-medium">
                {sheetsData?.name ?? selectedSpreadsheet?.name}
              </p>

              <div className="space-y-1">
                <Label className="text-xs">Aba da planilha</Label>
                {sheetsLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => <Skeleton key={i} className="h-10" />)}
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {(sheetsData?.sheets ?? []).map((sheet) => (
                      <button
                        key={sheet.title}
                        onClick={() => setSelectedSheet(sheet.title)}
                        className="w-full flex items-center justify-between rounded-lg border border-border/30 p-3 hover:bg-accent transition-colors"
                      >
                        <span className="text-sm">{sheet.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {sheet.rowCount} linhas
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {step === "mapping" && (
            <>
              <button
                onClick={() => setSelectedSheet(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← Voltar
              </button>

              <p className="text-sm font-medium">
                {selectedSpreadsheet?.name} / {selectedSheet}
              </p>
              <p className="text-xs text-muted-foreground">
                Mapeie as colunas da sua planilha. O campo <strong>Email</strong> é obrigatório (usado para deduplicação de vendas).
              </p>

              {sheetDataLoading && columns.length === 0 ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 pt-1">
                  {SALE_MAPPING_FIELDS.map(({ key, label, required }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">
                        {label}
                        {required && <span className="text-red-500 ml-0.5">*</span>}
                      </Label>
                      <Select
                        value={mapping[key] || "__none__"}
                        onValueChange={(v) => updateField(key, v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Não mapear —</SelectItem>
                          {columns.map((col) => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {step === "mapping" && !canSave && (
            <p className="text-xs text-amber-600 sm:mr-auto">
              Mapeie o campo Email para continuar.
            </p>
          )}
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          {step === "mapping" && (
            <Button onClick={handleSave} disabled={!canSave || connect.isPending}>
              {connect.isPending ? "Salvando..." : "Conectar planilha"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
