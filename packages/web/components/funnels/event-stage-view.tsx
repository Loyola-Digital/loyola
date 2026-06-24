"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  Settings2,
  GraduationCap,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { FunnelStage, ManualSale } from "@loyola-x/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import { StageSalesSpreadsheetSection } from "@/components/funnels/stage-sales-spreadsheet-section";
import { ManualSaleDialog } from "@/components/funnels/manual-sale-dialog";
import { useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import {
  useAllSales,
  useManualSales,
  useDeleteManualSale,
  type UnifiedSale,
} from "@/lib/hooks/use-manual-sales";
import {
  useMemberkitConnection,
  useMemberkitClassrooms,
  useStageMemberkitEnrollment,
  useSetStageMemberkitEnrollment,
  useEnrollSaleMemberkit,
} from "@/lib/hooks/use-memberkit";
import {
  useEventProducts,
  useSetEventProducts,
  useEventClosers,
  useSetEventClosers,
} from "@/lib/hooks/use-event-config";

interface EventStageViewProps {
  projectId: string;
  funnelId: string;
  funnelName: string;
  stage: FunnelStage;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(value);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

function MemberkitBadge({ status }: { status: ManualSale["memberkitStatus"] }) {
  if (status === "enrolled") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400" title="Matriculado no MemberKit">
        <CheckCircle2 className="h-3 w-3" /> Matriculado
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400" title="Falha na matrícula — tente novamente">
        <XCircle className="h-3 w-3" /> Falha
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400" title="Matrícula pendente">
        <Clock className="h-3 w-3" /> Pendente
      </span>
    );
  }
  if (status === "skipped") {
    return <span className="text-[10px] text-muted-foreground" title="Sem matrícula (config ausente)">—</span>;
  }
  return <span className="text-muted-foreground/50">—</span>;
}

export function EventStageView({ projectId, funnelId, funnelName, stage }: EventStageViewProps) {
  const [days, setDays] = useState(90);
  const [manualSaleOpen, setManualSaleOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<ManualSale | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stageName, setStageName] = useState(stage.name);

  const updateStage = useUpdateStage(projectId, funnelId, stage.id);
  const { data, isLoading } = useAllSales(projectId, funnelId, stage.id, "event_sales", days);
  // Inclui o estado da query de vendas manuais no gate de loading: a tabela
  // resolve ações (editar/excluir/matricular) via manualMap, que depende dela.
  const { data: manualPayload, isLoading: manualLoading } = useManualSales(projectId, funnelId, stage.id, days);
  const deleteMutation = useDeleteManualSale(projectId, funnelId, stage.id);
  const enrollMutation = useEnrollSaleMemberkit(projectId, funnelId, stage.id);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // saleId em matrícula no momento — pra o spinner/disabled afetar só a linha clicada.
  const enrollingId = enrollMutation.isPending ? (enrollMutation.variables ?? null) : null;

  const sales = useMemo(() => data?.sales ?? [], [data]);
  const manualMap = useMemo(
    () => new Map<string, ManualSale>((manualPayload?.sales ?? []).map((s) => [s.id, s])),
    [manualPayload],
  );

  const summary = useMemo(() => {
    const totalRevenue = sales.reduce((acc, s) => acc + s.value, 0);
    return {
      totalSales: sales.length,
      totalRevenue,
      ticket: sales.length > 0 ? totalRevenue / sales.length : 0,
    };
  }, [sales]);

  // Breakdown por closer (vendedor) — computado no cliente a partir do all-sales.
  const byCloser = useMemo(() => {
    const map = new Map<string, { name: string; vendas: number; receita: number }>();
    for (const s of sales) {
      const name = s.sellerName?.trim() || "Sem closer";
      const e = map.get(name) ?? { name, vendas: 0, receita: 0 };
      e.vendas += 1;
      e.receita += s.value;
      map.set(name, e);
    }
    return Array.from(map.values()).sort((a, b) => b.receita - a.receita);
  }, [sales]);

  async function handleSaveName() {
    if (!stageName.trim() || stageName.trim() === stage.name) return;
    await updateStage.mutateAsync({ name: stageName.trim() });
    toast.success("Nome atualizado");
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    try {
      await deleteMutation.mutateAsync(confirmDeleteId);
      toast.success("Venda removida");
      setConfirmDeleteId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover venda");
    }
  }

  function handleEnroll(saleId: string) {
    enrollMutation.mutate(saleId, {
      onSuccess: () => toast.success("Matrícula concluída"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na matrícula"),
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{funnelName}</p>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-fuchsia-500" />
            {stage.name}
            <Badge variant="secondary" className="text-[10px]">Evento Presencial</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">Vendas do evento + matrícula automática no MemberKit</p>
        </div>
        <div className="flex items-center gap-2">
          <DayRangePicker days={days} onDaysChange={setDays} />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditingSale(null); setManualSaleOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Lançar venda
          </Button>
          <Sheet open={settingsOpen} onOpenChange={(o) => { setSettingsOpen(o); if (o) setStageName(stage.name); }}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings2 className="h-3.5 w-3.5" /> Configurar
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Configurações da Etapa</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="event-stage-name">Nome da etapa</Label>
                  <div className="flex gap-2">
                    <Input
                      id="event-stage-name"
                      value={stageName}
                      onChange={(e) => setStageName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveName}
                      disabled={updateStage.isPending || !stageName.trim() || stageName.trim() === stage.name}
                    >
                      Salvar
                    </Button>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Tabs defaultValue="vendas">
        <TabsList>
          <TabsTrigger value="vendas" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Vendas
          </TabsTrigger>
          <TabsTrigger value="planilha" className="gap-1.5">
            Planilha
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" /> Configuração
          </TabsTrigger>
        </TabsList>

        {/* VENDAS */}
        <TabsContent value="vendas" className="mt-6 space-y-4">
          {isLoading || manualLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard label="Total de vendas" value={String(summary.totalSales)} />
                <StatCard label="Faturamento total" value={formatCurrency(summary.totalRevenue)} highlight />
                <StatCard label="Ticket médio" value={formatCurrency(summary.ticket)} />
              </div>

              {byCloser.length > 0 && (
                <div className="rounded-lg border border-border/50 p-3">
                  <p className="text-xs font-medium mb-2">Por closer</p>
                  <div className="flex flex-wrap gap-2">
                    {byCloser.map((c) => (
                      <span key={c.name} className="text-[11px] rounded-full border border-border/50 px-2 py-1">
                        {c.name}: <strong>{c.vendas}</strong> · {formatCurrency(c.receita)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <SalesTable
                sales={sales}
                manualMap={manualMap}
                days={days}
                onEdit={(ms) => { setEditingSale(ms); setManualSaleOpen(true); }}
                onDelete={(id) => setConfirmDeleteId(id)}
                onEnroll={handleEnroll}
                enrollingId={enrollingId}
                onLaunch={() => { setEditingSale(null); setManualSaleOpen(true); }}
              />
            </>
          )}
        </TabsContent>

        {/* PLANILHA */}
        <TabsContent value="planilha" className="mt-6">
          <StageSalesSpreadsheetSection
            projectId={projectId}
            funnelId={funnelId}
            stageId={stage.id}
            subtype="event_sales"
            title="Planilha do Evento"
          />
        </TabsContent>

        {/* CONFIGURAÇÃO — produtos (com turma) + closers + auto-matrícula */}
        <TabsContent value="config" className="mt-6">
          <EventConfigTab projectId={projectId} funnelId={funnelId} stageId={stage.id} />
        </TabsContent>
      </Tabs>

      <ManualSaleDialog
        projectId={projectId}
        funnelId={funnelId}
        stageId={stage.id}
        open={manualSaleOpen}
        onOpenChange={(o) => { setManualSaleOpen(o); if (!o) setEditingSale(null); }}
        editingSale={editingSale}
        isEvent
      />

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover venda?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa venda manual será apagada. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 space-y-1 ${highlight ? "border-primary/30 bg-primary/5" : "border-border/50"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

interface SalesTableProps {
  sales: UnifiedSale[];
  manualMap: Map<string, ManualSale>;
  days: number;
  onEdit: (ms: ManualSale) => void;
  onDelete: (id: string) => void;
  onEnroll: (saleId: string) => void;
  enrollingId: string | null;
  onLaunch: () => void;
}

function SalesTable({ sales, manualMap, days, onEdit, onDelete, onEnroll, enrollingId, onLaunch }: SalesTableProps) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(sales.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visible = sales.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  if (sales.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Nenhuma venda nos últimos {days} dias.</p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onLaunch}>
          <Plus className="h-3.5 w-3.5" /> Lançar venda
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/10 text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Data</th>
            <th className="text-left px-3 py-2 font-medium">Cliente</th>
            <th className="text-left px-3 py-2 font-medium">Produto</th>
            <th className="text-left px-3 py-2 font-medium">Closer</th>
            <th className="text-left px-3 py-2 font-medium">MemberKit</th>
            <th className="text-right px-3 py-2 font-medium">Valor</th>
            <th className="text-right px-3 py-2 font-medium">Caixa</th>
            <th className="px-3 py-2 w-20" />
          </tr>
        </thead>
        <tbody>
          {visible.map((sale) => {
            const ms = sale.source === "manual" && sale.manualSaleId ? manualMap.get(sale.manualSaleId) : undefined;
            return (
              <tr key={sale.id} className="border-t border-border/30">
                <td className="px-3 py-2 tabular-nums">{formatDate(sale.saleDate)}</td>
                <td
                  className="px-3 py-2 max-w-[160px] truncate"
                  title={sale.negociacao ? `${sale.customerName ?? ""} — Negociação: ${sale.negociacao}` : (sale.customerName ?? "")}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="truncate">{sale.customerName ?? "—"}</span>
                    <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${
                      sale.source === "manual"
                        ? "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400"
                        : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                    }`}>
                      {sale.source === "manual" ? "Manual" : sale.sourceLabel ?? "Planilha"}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{sale.product ?? "—"}</td>
                <td className="px-3 py-2">{sale.sellerName ?? "—"}</td>
                <td className="px-3 py-2">{ms ? <MemberkitBadge status={ms.memberkitStatus} /> : <span className="text-muted-foreground/40">—</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(sale.value)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {sale.valorRecebido != null ? formatCurrency(sale.valorRecebido) : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {ms ? (
                    <div className="flex items-center justify-end gap-2">
                      {(ms.memberkitStatus === "failed" || ms.memberkitStatus === "pending" || ms.memberkitStatus === "skipped") && ms.customerEmail && (
                        <button
                          type="button"
                          onClick={() => onEnroll(ms.id)}
                          disabled={enrollingId === ms.id}
                          className="text-muted-foreground hover:text-emerald-600 transition-colors"
                          title={ms.memberkitStatus === "failed" ? "Tentar matrícula novamente" : "Matricular no MemberKit"}
                          aria-label="Matricular no MemberKit"
                        >
                          {enrollingId === ms.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GraduationCap className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onEdit(ms)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Editar venda"
                        aria-label="Editar venda"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(ms.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Remover venda"
                        aria-label="Remover venda"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40" title="Vendas da planilha são read-only">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sales.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/10 border-t border-border/30 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, sales.length)} de {sales.length}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="p-1 rounded hover:bg-muted/40 disabled:opacity-30">‹</button>
            <span className="tabular-nums px-2">{safePage + 1} / {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} className="p-1 rounded hover:bg-muted/40 disabled:opacity-30">›</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EventConfigTab({ projectId, funnelId, stageId }: { projectId: string; funnelId: string; stageId: string }) {
  const conn = useMemberkitConnection(projectId);
  const connected = conn.data?.connected === true;
  const classrooms = useMemberkitClassrooms(projectId, connected);
  const classroomList = classrooms.data?.classrooms ?? [];

  // Auto-matrícula (toggle por etapa)
  const cfg = useStageMemberkitEnrollment(projectId, funnelId, stageId);
  const setCfg = useSetStageMemberkitEnrollment(projectId, funnelId, stageId);
  const [autoEnroll, setAutoEnroll] = useState(true);
  const [cfgHydrated, setCfgHydrated] = useState(false);
  if (cfg.data && !cfgHydrated) {
    setCfgHydrated(true);
    setAutoEnroll(cfg.data.autoEnroll);
  }

  // Produtos (nome + turma)
  const productsQ = useEventProducts(projectId, funnelId, stageId);
  const setProductsMut = useSetEventProducts(projectId, funnelId, stageId);
  const [products, setProducts] = useState<{ name: string; classroomId: string }[]>([]);
  const [prodHydrated, setProdHydrated] = useState(false);
  if (productsQ.data && !prodHydrated) {
    setProdHydrated(true);
    setProducts(
      productsQ.data.products.map((p) => ({
        name: p.name,
        classroomId: p.memberkitClassroomId ? String(p.memberkitClassroomId) : "",
      })),
    );
  }

  // Closers (nomes)
  const closersQ = useEventClosers(projectId, funnelId, stageId);
  const setClosersMut = useSetEventClosers(projectId, funnelId, stageId);
  const [closers, setClosers] = useState<string[]>([]);
  const [closHydrated, setClosHydrated] = useState(false);
  if (closersQ.data && !closHydrated) {
    setClosHydrated(true);
    setClosers(closersQ.data.closers.map((c) => c.name));
  }

  function saveAuto() {
    setCfg.mutate(
      { classroomIds: cfg.data?.classroomIds ?? [], status: "active", autoEnroll },
      {
        onSuccess: () => toast.success("Auto-matrícula salva"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
      },
    );
  }

  function saveProducts() {
    // Preserva o nome da turma já salvo (por classroomId) caso a lista de turmas
    // ainda não tenha carregado — evita gravar memberkitClassroomName: null.
    const prevNameById = new Map<string, string>();
    for (const p of productsQ.data?.products ?? []) {
      if (p.memberkitClassroomId != null && p.memberkitClassroomName) {
        prevNameById.set(String(p.memberkitClassroomId), p.memberkitClassroomName);
      }
    }
    const payload = products
      .filter((p) => p.name.trim())
      .map((p) => {
        const cl = classroomList.find((c) => String(c.id) === p.classroomId);
        return {
          name: p.name.trim(),
          memberkitClassroomId: p.classroomId ? Number(p.classroomId) : null,
          memberkitClassroomName: cl?.name ?? prevNameById.get(p.classroomId) ?? null,
        };
      });
    setProductsMut.mutate(payload, {
      onSuccess: () => toast.success("Produtos salvos"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar produtos"),
    });
  }

  function saveClosers() {
    const payload = closers.filter((c) => c.trim()).map((c) => ({ name: c.trim() }));
    setClosersMut.mutate(payload, {
      onSuccess: () => toast.success("Closers salvos"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar closers"),
    });
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Status da conexão MemberKit */}
      {connected ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          ✓ MemberKit conectado neste projeto — escolha a turma de cada produto abaixo.
        </p>
      ) : (
        <div className="rounded-lg border border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-900/10 p-4 text-sm space-y-1">
          <p className="font-medium">MemberKit não conectado.</p>
          <p className="text-muted-foreground">
            Conecte a API key do MemberKit na página <strong>Assinaturas</strong> do projeto para poder mapear as turmas. Você ainda pode cadastrar produtos/closers aqui.
          </p>
        </div>
      )}

      {/* PRODUTOS */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Produtos vendidos</h3>
          <p className="text-xs text-muted-foreground">
            Cadastre os produtos do evento. Cada produto pode ter uma <strong>turma</strong> diferente no MemberKit — quem compra é matriculado nela.
          </p>
        </div>
        <div className="space-y-2">
          {products.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={p.name}
                onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                placeholder="Nome do produto"
                className="flex-1"
              />
              <Select
                value={p.classroomId || "none"}
                onValueChange={(v) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, classroomId: v === "none" ? "" : v } : x)))}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Turma MemberKit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem turma —</SelectItem>
                  {classroomList.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}{c.courseName ? ` · ${c.courseName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => setProducts((arr) => arr.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive p-1"
                aria-label="Remover produto"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setProducts((arr) => [...arr, { name: "", classroomId: "" }])}>
            <Plus className="h-3.5 w-3.5" /> Adicionar produto
          </Button>
          <Button size="sm" onClick={saveProducts} disabled={setProductsMut.isPending || !prodHydrated}>
            {setProductsMut.isPending ? "Salvando..." : "Salvar produtos"}
          </Button>
        </div>
      </section>

      {/* CLOSERS */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Closers</h3>
          <p className="text-xs text-muted-foreground">
            Cadastre os closers do evento. No lançamento da venda, o closer é escolhido desta lista.
          </p>
        </div>
        <div className="space-y-2">
          {closers.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={c}
                onChange={(e) => setClosers((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder="Nome do closer"
                className="flex-1 max-w-sm"
              />
              <button
                type="button"
                onClick={() => setClosers((arr) => arr.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive p-1"
                aria-label="Remover closer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setClosers((arr) => [...arr, ""])}>
            <Plus className="h-3.5 w-3.5" /> Adicionar closer
          </Button>
          <Button size="sm" onClick={saveClosers} disabled={setClosersMut.isPending || !closHydrated}>
            {setClosersMut.isPending ? "Salvando..." : "Salvar closers"}
          </Button>
        </div>
      </section>

      {/* AUTO-MATRÍCULA */}
      <section className="space-y-2 border-t border-border/40 pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoEnroll} onChange={(e) => setAutoEnroll(e.target.checked)} />
          Matricular automaticamente no MemberKit ao lançar a venda
        </label>
        <Button size="sm" onClick={saveAuto} disabled={setCfg.isPending || !cfgHydrated}>
          {setCfg.isPending ? "Salvando..." : "Salvar auto-matrícula"}
        </Button>
      </section>
    </div>
  );
}
