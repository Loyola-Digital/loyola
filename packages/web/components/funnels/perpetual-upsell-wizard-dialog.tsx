"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Search, Trash2 } from "lucide-react";
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
import {
  useConnectPerpetualUpsellSpreadsheet,
  useDisconnectPerpetualUpsellSpreadsheet,
} from "@/lib/hooks/use-perpetual-upsell";
import type { PerpetualUpsellSpreadsheet, SaleColumnMapping } from "@loyola-x/shared";

const UPSELL_MAPPING_FIELDS: Array<{
  key: keyof SaleColumnMapping;
  label: string;
  required?: boolean;
}> = [
  { key: "email", label: "Email", required: true },
  { key: "transactionId", label: "ID da Transação (recomendado)" },
  { key: "customerName", label: "Nome do Cliente" },
  { key: "valorBruto", label: "Valor Bruto" },
  { key: "dataVenda", label: "Data da Venda" },
  { key: "status", label: "Status do Pagamento (reembolso/chargeback)" },
];

type Step = "spreadsheet" | "sheet" | "mapping";

interface PerpetualUpsellWizardDialogProps {
  projectId: string;
  funnelId: string;
  current: PerpetualUpsellSpreadsheet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PerpetualUpsellWizardDialog({
  projectId, funnelId, current, open, onOpenChange,
}: PerpetualUpsellWizardDialogProps) {
  const { data: spreadsheetsData, isLoading: spreadsheetsLoading } = useSpreadsheets();
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<{ id: string; name: string } | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Partial<SaleColumnMapping>>({});
  const [search, setSearch] = useState("");
  const [directLink, setDirectLink] = useState("");

  // Hidrata UMA vez por abertura (evita refetch apagar edição em andamento).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      hydratedRef.current = false;
      return;
    }
    if (current && !hydratedRef.current) {
      setSelectedSpreadsheet({ id: current.spreadsheetId, name: current.spreadsheetName });
      setSelectedSheet(current.sheetName);
      setMapping(current.columnMapping ?? {});
      hydratedRef.current = true;
    }
  }, [open, current]);

  const { data: sheetsData, isLoading: sheetsLoading } = useSpreadsheetSheets(
    selectedSpreadsheet?.id ?? null,
  );
  const { data: sheetData, isLoading: sheetDataLoading } = useSheetData(
    selectedSpreadsheet?.id ?? null,
    selectedSheet,
  );
  const connect = useConnectPerpetualUpsellSpreadsheet(projectId, funnelId);
  const disconnect = useDisconnectPerpetualUpsellSpreadsheet(projectId, funnelId);

  const spreadsheets = spreadsheetsData?.spreadsheets ?? [];
  const filtered = search
    ? spreadsheets.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : spreadsheets;

  const rawHeaders = sheetData?.headers ?? [];
  const columns = Array.from(
    new Set(rawHeaders.map((h, i) => (h && h.trim().length > 0 ? h : `Coluna ${i + 1}`))),
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
        spreadsheetId: selectedSpreadsheet.id,
        spreadsheetName: sheetsData?.name ?? selectedSpreadsheet.name,
        sheetName: selectedSheet,
        columnMapping: mapping as SaleColumnMapping,
      },
      {
        onSuccess: () => {
          toast.success(current ? "Planilha atualizada!" : "Planilha de upsell conectada!");
          handleClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Erro ao conectar planilha.");
        },
      },
    );
  }

  function handleDisconnect() {
    if (!current) return;
    if (!confirm(`Desconectar a planilha "${current.spreadsheetName}"? O cruzamento de upsell deixará de aparecer.`)) return;
    disconnect.mutate(undefined, {
      onSuccess: () => {
        toast.success("Planilha desconectada.");
        handleClose();
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Erro ao desconectar.");
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-purple-600" />
            {current && step === "mapping"
              ? "Upsell — editar mapeamento"
              : step === "spreadsheet"
                ? "Upsell — selecione o arquivo"
                : step === "sheet"
                  ? "Upsell — selecione a aba"
                  : "Upsell — mapear colunas"}
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
                      <FileSpreadsheet className="h-4 w-4 text-purple-600 shrink-0" />
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
                Mapeie as colunas da planilha de upsell. <strong>Email</strong> é obrigatório (chave do cruzamento). Mapeie <strong>Data da Venda</strong> para garantir que o upsell só conte se for <strong>depois</strong> da compra do perpétuo.
              </p>

              {sheetDataLoading && columns.length === 0 ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 pt-1">
                  {UPSELL_MAPPING_FIELDS.map(({ key, label, required }) => (
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
          {current && (
            <Button
              variant="ghost"
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10 sm:mr-auto"
              onClick={handleDisconnect}
              disabled={disconnect.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {disconnect.isPending ? "Desconectando..." : "Desconectar"}
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          {step === "mapping" && (
            <Button onClick={handleSave} disabled={!canSave || connect.isPending}>
              {connect.isPending ? "Salvando..." : current ? "Atualizar" : "Conectar planilha"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
