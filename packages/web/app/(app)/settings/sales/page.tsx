"use client";

import { useState } from "react";
import {
  ShoppingCart, Plus, Trash2, FileSpreadsheet, ArrowUpDown, Search, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useProjects } from "@/lib/hooks/use-projects";
import {
  useSalesProducts, useCreateSalesProduct, useDeleteSalesProduct,
  useAddSalesMapping, useDeleteSalesMapping,
  type SalesProduct, type ColumnMapping,
} from "@/lib/hooks/use-sales";
import { useSpreadsheets, useSpreadsheetSheets, useSheetData } from "@/lib/hooks/use-google-sheets";

// ============================================================
// COLUMN MAPPING DIALOG
// ============================================================

function MappingDialog({ projectId, productId, open, onOpenChange }: {
  projectId: string; productId: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { data: spreadsheetsData, isLoading: spreadsheetsLoading } = useSpreadsheets();
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<{ id: string; name: string } | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const { data: sheetsData } = useSpreadsheetSheets(selectedSpreadsheet?.id ?? null);
  const { data: sheetData } = useSheetData(selectedSpreadsheet?.id ?? null, selectedSheet);
  const [mapping, setMapping] = useState<ColumnMapping>({ email: "", date: "" });
  const [search, setSearch] = useState("");
  const addMapping = useAddSalesMapping(projectId, productId);

  const spreadsheets = spreadsheetsData?.spreadsheets ?? [];
  const filtered = search ? spreadsheets.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())) : spreadsheets;
  const columns = sheetData?.headers ?? [];

  const step = !selectedSpreadsheet ? "spreadsheet" : !selectedSheet ? "sheet" : "mapping";

  function handleSave() {
    if (!selectedSpreadsheet || !selectedSheet || !mapping.email || !mapping.date) return;
    addMapping.mutate(
      { spreadsheetId: selectedSpreadsheet.id, spreadsheetName: selectedSpreadsheet.name, sheetName: selectedSheet, columnMapping: mapping },
      { onSuccess: () => { toast.success("Planilha mapeada!"); handleClose(); }, onError: () => toast.error("Erro ao salvar.") }
    );
  }

  function handleClose() {
    setSelectedSpreadsheet(null); setSelectedSheet(null); setMapping({ email: "", date: "" }); setSearch(""); onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            {step === "spreadsheet" ? "Selecionar planilha" : step === "sheet" ? "Selecionar aba" : "Mapear colunas"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {step === "spreadsheet" && (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar planilha..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              {spreadsheetsLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : (
                <div className="max-h-[300px] overflow-y-auto space-y-1">
                  {filtered.map((s) => (
                    <button key={s.id} onClick={() => setSelectedSpreadsheet(s)}
                      className="w-full flex items-center gap-3 rounded-lg border border-border/30 p-3 text-left hover:bg-accent">
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
              <button onClick={() => setSelectedSpreadsheet(null)} className="text-xs text-muted-foreground hover:text-foreground">← Voltar</button>
              <p className="text-sm font-medium">{selectedSpreadsheet?.name}</p>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {(sheetsData?.sheets ?? []).map((sheet) => (
                  <button key={sheet.title} onClick={() => setSelectedSheet(sheet.title)}
                    className="w-full flex items-center justify-between rounded-lg border border-border/30 p-3 hover:bg-accent">
                    <span className="text-sm">{sheet.title}</span>
                    <span className="text-xs text-muted-foreground">{sheet.rowCount} linhas</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "mapping" && (
            <>
              <button onClick={() => setSelectedSheet(null)} className="text-xs text-muted-foreground hover:text-foreground">← Voltar</button>
              <p className="text-sm font-medium">{selectedSpreadsheet?.name} / {selectedSheet}</p>
              <p className="text-xs text-muted-foreground">Indique qual coluna corresponde a cada campo. Email e Data sao obrigatorios.</p>

              <div className="grid gap-3 grid-cols-2">
                {[
                  { key: "email", label: "Email *", required: true },
                  { key: "date", label: "Data *", required: true },
                  { key: "name", label: "Nome" },
                  { key: "phone", label: "Telefone" },
                  { key: "origin", label: "Origem" },
                  { key: "type", label: "Tipo" },
                  { key: "value", label: "Valor" },
                  { key: "status", label: "Status" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Select value={(mapping as unknown as Record<string, string>)[key] ?? ""} onValueChange={(v) => setMapping((prev) => ({ ...prev, [key]: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— Nenhum —</SelectItem>
                        {columns.map((col) => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {columns.length === 0 && <p className="text-xs text-amber-500">Carregando colunas da planilha...</p>}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          {step === "mapping" && (
            <Button onClick={handleSave} disabled={!mapping.email || !mapping.date || addMapping.isPending}>
              {addMapping.isPending ? "Salvando..." : "Salvar mapeamento"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// PRODUCT SECTION
// ============================================================

function ProductSection({ product, projectId }: { product: SalesProduct; projectId: string }) {
  const [open, setOpen] = useState(true);
  const [mappingOpen, setMappingOpen] = useState(false);
  const deleteProduct = useDeleteSalesProduct(projectId);
  const deleteMapping = useDeleteSalesMapping(projectId, product.id);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/20" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{product.name}</span>
          <Badge variant={product.type === "inferior" ? "secondary" : "default"} className="text-[10px]">
            {product.type === "inferior" ? "Front-end" : "Back-end"}
          </Badge>
          {product.mappings.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{product.mappings.length} planilha{product.mappings.length > 1 ? "s" : ""}</span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={(e) => {
          e.stopPropagation();
          deleteProduct.mutate(product.id, { onSuccess: () => toast.success("Produto removido.") });
        }}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {open && (
        <div className="border-t border-border/20 p-4 space-y-3">
          {product.mappings.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-border/20 bg-muted/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />
                <div>
                  <p className="text-xs font-medium">{m.spreadsheetName} / {m.sheetName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Email: {m.columnMapping.email} · Data: {m.columnMapping.date}
                    {m.columnMapping.origin ? ` · Origem: ${m.columnMapping.origin}` : ""}
                    {m.columnMapping.value ? ` · Valor: ${m.columnMapping.value}` : ""}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteMapping.mutate(m.id, { onSuccess: () => toast.success("Removido.") })}>
                <Trash2 className="h-3 w-3 text-destructive/70" />
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setMappingOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar planilha
          </Button>

          <MappingDialog projectId={projectId} productId={product.id} open={mappingOpen} onOpenChange={setMappingOpen} />
        </div>
      )}
    </div>
  );
}

// ============================================================
// PAGE
// ============================================================

export default function SalesSettingsPage() {
  const { data: projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const activeProjectId = selectedProjectId ?? projects?.[0]?.id ?? null;

  const { data, isLoading } = useSalesProducts(activeProjectId ?? "");
  const createProduct = useCreateSalesProduct(activeProjectId ?? "");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"inferior" | "superior">("inferior");

  const inferiors = data?.products.filter((p) => p.type === "inferior") ?? [];
  const superiors = data?.products.filter((p) => p.type === "superior") ?? [];

  function handleCreate() {
    if (!newName.trim() || !activeProjectId) return;
    createProduct.mutate({ name: newName.trim(), type: newType }, {
      onSuccess: () => { toast.success("Produto criado!"); setNewName(""); },
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ArrowUpDown className="h-5 w-5" />
          Integracao de Vendas
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure produtos e conecte planilhas de vendas para rastrear conversoes front-end → back-end.
        </p>
      </div>

      {/* Project selector */}
      {projects && projects.length > 1 && (
        <Select value={activeProjectId ?? undefined} onValueChange={setSelectedProjectId}>
          <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="Projeto" /></SelectTrigger>
          <SelectContent>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {/* Add product */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-3">
        <h2 className="text-sm font-semibold">Novo produto</h2>
        <div className="flex gap-3">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do produto" className="flex-1 h-9" />
          <Select value={newType} onValueChange={(v) => setNewType(v as "inferior" | "superior")}>
            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inferior">Front-end</SelectItem>
              <SelectItem value="superior">Back-end</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleCreate} disabled={!newName.trim() || createProduct.isPending} size="sm" className="h-9">
            <Plus className="h-4 w-4" />
            Criar
          </Button>
        </div>
      </div>

      {isLoading && <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>}

      {/* Inferior products */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Badge variant="secondary">Front-end</Badge>
          Produtos Inferiores
          <span className="text-xs text-muted-foreground font-normal">— entrada do funil</span>
        </h2>
        {inferiors.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum produto front-end cadastrado.</p>
        )}
        {inferiors.map((p) => <ProductSection key={p.id} product={p} projectId={activeProjectId!} />)}
      </div>

      {/* Superior products */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Badge>Back-end</Badge>
          Produtos Superiores
          <span className="text-xs text-muted-foreground font-normal">— upsell / high-ticket</span>
        </h2>
        {superiors.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum produto back-end cadastrado.</p>
        )}
        {superiors.map((p) => <ProductSection key={p.id} product={p} projectId={activeProjectId!} />)}
      </div>
    </div>
  );
}
