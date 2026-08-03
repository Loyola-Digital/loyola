"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  useConnectPerpetualSpreadsheet,
  useDisconnectPerpetualSpreadsheet,
} from "@/lib/hooks/use-perpetual-spreadsheet";
import type { PerpetualSpreadsheet, SaleColumnMapping, SalesPlatform } from "@loyola-x/shared";

// Mesmos campos do StageSalesWizard — utm_source é o destaque pro perpetual.
const PERPETUAL_MAPPING_FIELDS: Array<{
  key: keyof SaleColumnMapping;
  label: string;
  required?: boolean;
}> = [
  { key: "email", label: "Email", required: true },
  { key: "transactionId", label: "ID da Transação (recomendado)" },
  { key: "valorBruto", label: "Valor Bruto" },
  { key: "valorLiquido", label: "Valor Líquido" },
  { key: "dataVenda", label: "Data da Venda" },
  { key: "formaPagamento", label: "Forma de Pagamento" },
  { key: "status", label: "Status do Pagamento (reembolso/chargeback)" },
  // Story 29.31: nome do produto de cada venda. Pré-requisito da 29.30
  // (classificar Principal / Order Bump / Upsell / Downsell). O rótulo diz para
  // que serve — sem isso ninguém mapeia um campo opcional a mais.
  // Chave `productName` (não `produto`): é o slot canônico do
  // `SaleColumnMapping`, fixado pela Story 19.10.
  { key: "productName", label: "Produto (para classificar Order Bump / Upsell)" },
  { key: "utm_source", label: "UTM Source (Origem)" },
  { key: "utm_medium", label: "UTM Medium" },
  { key: "utm_campaign", label: "UTM Campaign" },
  { key: "utm_content", label: "UTM Content" },
  { key: "utm_term", label: "UTM Term" },
];

type Step = "spreadsheet" | "sheet" | "mapping";

interface PerpetualSpreadsheetWizardDialogProps {
  projectId: string;
  funnelId: string;
  current: PerpetualSpreadsheet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PerpetualSpreadsheetWizardDialog({
  projectId, funnelId, current, open, onOpenChange,
}: PerpetualSpreadsheetWizardDialogProps) {
  const { data: spreadsheetsData, isLoading: spreadsheetsLoading } = useSpreadsheets();
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<{ id: string; name: string } | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Partial<SaleColumnMapping>>({});
  const [platform, setPlatform] = useState<SalesPlatform | "">("");
  const [search, setSearch] = useState("");
  const [directLink, setDirectLink] = useState("");

  // Pré-popula em edit mode (planilha já conectada). Hidrata UMA vez por
  // abertura — senão um refetch do react-query (novo objeto `current`) reexecuta
  // o efeito e apaga as edições em andamento do usuário.
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
      setPlatform(current.platform ?? "");
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
  const connect = useConnectPerpetualSpreadsheet(projectId, funnelId);
  const disconnect = useDisconnectPerpetualSpreadsheet(projectId, funnelId);

  const spreadsheets = spreadsheetsData?.spreadsheets ?? [];
  const filtered = search
    ? spreadsheets.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : spreadsheets;

  const rawHeaders = sheetData?.headers ?? [];
  /** Nome exibido de cada coluna — cabeçalho vazio vira "Coluna N". */
  const displayName = (h: string | undefined, i: number) =>
    h && h.trim().length > 0 ? h : `Coluna ${i + 1}`;
  const columns = Array.from(new Set(rawHeaders.map(displayName)));

  // Story 29.31: prévia dos produtos distintos da coluna mapeada.
  //
  // Usa as `rows` que `useSheetData` JÁ retorna — o wizard consumia só os
  // headers. Zero request novo, nem ao backend nem ao Google Sheets.
  //
  // Serve a dois propósitos: valida na hora que a coluna certa foi escolhida
  // (coluna errada mostra valores sem sentido ou dezenas de distintos), e já
  // responde a pergunta que a 29.30 vai fazer — quais produtos este funil vende.
  const productPreview = useMemo(() => {
    const selected = mapping.productName;
    if (!selected) return null;
    const idx = rawHeaders.findIndex((h, i) => displayName(h, i) === selected);
    if (idx === -1) return null;

    // Agrupa por trim().toLowerCase() — a MESMA regra de match que a 29.30 vai
    // usar (padrão de `orderBumpProducts`, 18.51a). Assim o que o usuário vê
    // aqui é exatamente o que ele vai classificar depois. Exibe a primeira
    // grafia encontrada.
    const byKey = new Map<string, { nome: string; count: number }>();
    for (const row of sheetData?.rows ?? []) {
      const raw = (row[idx] ?? "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      const e = byKey.get(key);
      if (e) e.count += 1;
      else byKey.set(key, { nome: raw, count: 1 });
    }
    const all = Array.from(byKey.values()).sort((a, b) => b.count - a.count);
    return { top: all.slice(0, 15), total: all.length };
  }, [mapping.productName, rawHeaders, sheetData?.rows]);

  const step: Step = !selectedSpreadsheet ? "spreadsheet" : !selectedSheet ? "sheet" : "mapping";
  const canSave = !!(mapping.email && mapping.email.length > 0);

  function resetState() {
    setSelectedSpreadsheet(null);
    setSelectedSheet(null);
    setMapping({});
    setPlatform("");
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
        platform: platform || null,
      },
      {
        onSuccess: () => {
          toast.success(current ? "Planilha atualizada!" : "Planilha de vendas conectada!");
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
    if (!confirm(`Desconectar a planilha "${current.spreadsheetName}"? Os dados de vendas deixarão de aparecer no dashboard.`)) return;
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
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            {current && step === "mapping"
              ? "Planilha de Vendas — editar mapeamento"
              : step === "spreadsheet"
                ? "Planilha de Vendas — selecione o arquivo"
                : step === "sheet"
                  ? "Planilha de Vendas — selecione a aba"
                  : "Planilha de Vendas — mapear colunas"}
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
                Mapeie as colunas da sua planilha. <strong>Email</strong> é obrigatório. Recomendamos mapear <strong>UTM Source</strong> para análise de origem da receita.
              </p>

              {/* Story 29.7: plataforma de pagamento — define fee% descontado da Receita Bruta */}
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
                <div>
                  <Label className="text-xs font-medium">Plataforma de Pagamento</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Define os percentuais descontados da Receita Bruta pra calcular Margem real.
                  </p>
                </div>
                <Select value={platform || "__none__"} onValueChange={(v) => setPlatform(v === "__none__" ? "" : (v as SalesPlatform))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecionar plataforma..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem desconto de fees</SelectItem>
                    <SelectItem value="kiwify">Kiwify (−20.99%: reembolso 4% + marketplace 4.99% + imposto 11% + outros 1%)</SelectItem>
                    <SelectItem value="hotmart">Hotmart (−26%: reembolso 4% + marketplace 10% + imposto 11% + outros 1%)</SelectItem>
                    <SelectItem value="other">Outra plataforma (sem desconto automático)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {sheetDataLoading && columns.length === 0 ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 pt-1">
                  {PERPETUAL_MAPPING_FIELDS.map(({ key, label, required }) => (
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

              {/* Story 29.31: prévia dos produtos da coluna mapeada. Só aparece
                  com a coluna escolhida (AC5) — sem ela o wizard fica idêntico
                  ao que era. */}
              {productPreview && (
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
                  <div>
                    <Label className="text-xs font-medium">
                      Produtos encontrados na planilha
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      {productPreview.total === 0
                        ? "Nenhum valor preenchido nessa coluna — confira se escolheu a coluna certa."
                        : `${productPreview.total} produto${productPreview.total !== 1 ? "s" : ""} distinto${productPreview.total !== 1 ? "s" : ""}. Na etapa de classificação você marca quais são Order Bump, Upsell ou Downsell.`}
                    </p>
                  </div>
                  {productPreview.total > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {productPreview.top.map((p) => (
                        <span
                          key={p.nome}
                          className="inline-flex items-center gap-1 rounded border border-border/40 bg-background/60 px-1.5 py-0.5 text-[10px]"
                          title={`${p.count} linha${p.count !== 1 ? "s" : ""} com este produto`}
                        >
                          <span className="max-w-[220px] truncate">{p.nome}</span>
                          <span className="tabular-nums text-muted-foreground">{p.count}</span>
                        </span>
                      ))}
                      {productPreview.total > productPreview.top.length && (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          +{productPreview.total - productPreview.top.length} outros
                        </span>
                      )}
                    </div>
                  )}
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
