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
import { useCreateFunnelSpreadsheet } from "@/lib/hooks/use-funnel-spreadsheets";
import type {
  ColumnMapping, FunnelSpreadsheetType,
} from "@/lib/types/funnel-spreadsheet";

export const FUNNEL_MAPPING_FIELDS: Array<{
  key: keyof ColumnMapping;
  label: string;
  group: "contact" | "utm" | "transactional";
}> = [
  // Contato
  { key: "name", label: "Nome", group: "contact" },
  { key: "email", label: "Email", group: "contact" },
  { key: "phone", label: "Telefone", group: "contact" },
  // Transacional
  { key: "date", label: "Data", group: "transactional" },
  { key: "status", label: "Status", group: "transactional" },
  { key: "value", label: "Valor", group: "transactional" },
  // UTMs
  { key: "utm_source", label: "UTM Source", group: "utm" },
  { key: "utm_medium", label: "UTM Medium", group: "utm" },
  { key: "utm_campaign", label: "UTM Campaign", group: "utm" },
  { key: "utm_content", label: "UTM Content", group: "utm" },
  { key: "utm_term", label: "UTM Term", group: "utm" },
];

export function countMappedFields(mapping: ColumnMapping): number {
  return FUNNEL_MAPPING_FIELDS.reduce(
    (acc, f) => (mapping[f.key] && mapping[f.key]!.length > 0 ? acc + 1 : acc),
    0,
  );
}

type Step = "spreadsheet" | "sheet" | "mapping";

interface FunnelSpreadsheetWizardDialogProps {
  projectId: string;
  funnelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FunnelSpreadsheetWizardDialog({
  projectId, funnelId, open, onOpenChange,
}: FunnelSpreadsheetWizardDialogProps) {
  const { data: spreadsheetsData, isLoading: spreadsheetsLoading } = useSpreadsheets();
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<{ id: string; name: string } | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FunnelSpreadsheetType>("leads");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [search, setSearch] = useState("");
  const [directLink, setDirectLink] = useState("");

  const { data: sheetsData, isLoading: sheetsLoading } = useSpreadsheetSheets(selectedSpreadsheet?.id ?? null);
  const { data: sheetData, isLoading: sheetDataLoading } = useSheetData(
    selectedSpreadsheet?.id ?? null,
    selectedSheet,
  );
  const createSpreadsheet = useCreateFunnelSpreadsheet(projectId, funnelId);

  const spreadsheets = spreadsheetsData?.spreadsheets ?? [];
  const filtered = search
    ? spreadsheets.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : spreadsheets;
  // Filter out empty headers (Radix Select rejects value="") and dedupe
  // while preserving the first occurrence's display label.
  const rawHeaders = sheetData?.headers ?? [];
  const columns = Array.from(
    new Set(
      rawHeaders
        .map((h, i) => (h && h.trim().length > 0 ? h : `Coluna ${i + 1}`))
    ),
  );
  const previewRows = (sheetData?.rows ?? []).slice(0, 5);

  const step: Step = !selectedSpreadsheet
    ? "spreadsheet"
    : !selectedSheet
      ? "sheet"
      : "mapping";

  const mappedCount = countMappedFields(mapping);
  const canSave = mappedCount > 0 && label.trim().length > 0;

  function resetState() {
    setSelectedSpreadsheet(null);
    setSelectedSheet(null);
    setLabel("");
    setType("leads");
    setMapping({});
    setSearch("");
    setDirectLink("");
  }

  function handleClose() {
    resetState();
    onOpenChange(false);
  }

  function handleSave() {
    if (!selectedSpreadsheet || !selectedSheet || !canSave) return;
    createSpreadsheet.mutate(
      {
        label: label.trim(),
        type,
        spreadsheetId: selectedSpreadsheet.id,
        spreadsheetName: sheetsData?.name ?? selectedSpreadsheet.name,
        sheetName: selectedSheet,
        columnMapping: mapping,
      },
      {
        onSuccess: () => {
          toast.success("Planilha vinculada!");
          handleClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Erro ao vincular planilha.");
        },
      },
    );
  }

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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            {step === "spreadsheet"
              ? "Vincular planilha — selecione o arquivo"
              : step === "sheet"
                ? "Vincular planilha — aba e tipo"
                : "Vincular planilha — mapear colunas"}
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
                        toast.error("Link invalido. Cole o link completo do Google Sheets.");
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
                <div className="max-h-[320px] overflow-y-auto space-y-1">
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

              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Label (nome amigável)</Label>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Ex: Leads captados abril"
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

              <div className="space-y-1 pt-2">
                <Label className="text-xs">Aba da planilha</Label>
                {sheetsLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => <Skeleton key={i} className="h-10" />)}
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[280px] overflow-y-auto">
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
                Indique qual coluna corresponde a cada campo. Pelo menos um campo precisa estar mapeado.
              </p>

              <div className="grid gap-3 grid-cols-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Label (nome amigável) <span className="text-red-500">*</span></Label>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Ex: Leads captados abril"
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

              {sheetDataLoading && columns.length === 0 ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (
                <MappingFieldsGroups mapping={mapping} columns={columns} onChange={updateField} />
              )}

              {/* Preview */}
              {previewRows.length > 0 && mappedCount > 0 && (
                <div className="pt-3 border-t border-border/20">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Pré-visualização (5 primeiras linhas)
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-border/20">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30">
                        <tr>
                          {FUNNEL_MAPPING_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                            <th key={f.key} className="text-left py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap">
                              {f.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, ri) => (
                          <tr key={ri} className="border-t border-border/10">
                            {FUNNEL_MAPPING_FIELDS.filter((f) => mapping[f.key]).map((f) => {
                              const colIdx = columns.indexOf(mapping[f.key]!);
                              return (
                                <td key={f.key} className="py-1.5 px-2 max-w-[160px] truncate">
                                  {colIdx >= 0 ? row[colIdx] ?? "" : ""}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {step === "mapping" && !canSave && (
            <p className="text-xs text-amber-600 sm:mr-auto">
              {label.trim().length === 0 && mappedCount === 0
                ? "Preencha o label e mapeie pelo menos 1 campo."
                : label.trim().length === 0
                  ? "Preencha o label."
                  : "Mapeie pelo menos 1 campo."}
            </p>
          )}
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          {step === "mapping" && (
            <Button
              onClick={handleSave}
              disabled={!canSave || createSpreadsheet.isPending}
            >
              {createSpreadsheet.isPending
                ? "Salvando..."
                : `Salvar (${mappedCount} ${mappedCount === 1 ? "campo" : "campos"})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Mapping field groups — exported for reuse by Edit dialog
// ============================================================

export function MappingFieldsGroups({
  mapping, columns, onChange,
}: {
  mapping: ColumnMapping;
  columns: string[];
  onChange: (key: keyof ColumnMapping, value: string) => void;
}) {
  const contact = FUNNEL_MAPPING_FIELDS.filter((f) => f.group === "contact");
  const transactional = FUNNEL_MAPPING_FIELDS.filter((f) => f.group === "transactional");
  const utm = FUNNEL_MAPPING_FIELDS.filter((f) => f.group === "utm");

  return (
    <div className="space-y-4">
      <FieldGroup title="Contato" fields={contact} mapping={mapping} columns={columns} onChange={onChange} />
      <FieldGroup title="Transacional" fields={transactional} mapping={mapping} columns={columns} onChange={onChange} />
      <FieldGroup title="UTMs" fields={utm} mapping={mapping} columns={columns} onChange={onChange} />
    </div>
  );
}

function FieldGroup({
  title, fields, mapping, columns, onChange,
}: {
  title: string;
  fields: Array<{ key: keyof ColumnMapping; label: string }>;
  mapping: ColumnMapping;
  columns: string[];
  onChange: (key: keyof ColumnMapping, value: string) => void;
}) {
  return (
    <div className="pt-2 border-t border-border/20 first:border-t-0 first:pt-0">
      <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        {fields.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Select
              value={mapping[key] || "__none__"}
              onValueChange={(v) => onChange(key, v)}
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
    </div>
  );
}
