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
  Map as MapIcon,
  Target,
  Search,
  Star,
} from "lucide-react";
import { NpsStageTab } from "@/components/funnels/nps-stage-tab";
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
import { ManualSaleDialog } from "@/components/funnels/manual-sale-dialog";
import { SalesPlanTab } from "@/components/funnels/sales-plan-tab";
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
  useEventMap,
  useSetEventLeadStatus,
  useSetEventLeadSeller,
  useSetEventLeadSellerBulk,
} from "@/lib/hooks/use-event-config";
import { EventSourcesTab } from "@/components/funnels/event-sources-tab";
import { LeadDetailDialog, RevenueMatchBadge, type RoiLead } from "@/components/funnels/roi-calculator";
import type { EventLeadStatus } from "@loyola-x/shared";

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
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">{funnelName}</p>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2 flex-wrap">
            <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-fuchsia-500 shrink-0" />
            <span className="truncate">{stage.name}</span>
            <Badge variant="secondary" className="text-[10px] shrink-0">Evento Presencial</Badge>
          </h1>
          <p className="hidden sm:block text-sm text-muted-foreground">Vendas do evento + matrícula automática no MemberKit</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
        <TabsList className="max-w-full justify-start overflow-x-auto h-auto">
          <TabsTrigger value="vendas" className="gap-1.5 shrink-0">
            <CalendarDays className="h-3.5 w-3.5" /> Vendas
          </TabsTrigger>
          <TabsTrigger value="mapa" className="gap-1.5 shrink-0">
            <MapIcon className="h-3.5 w-3.5" /> Mapa
          </TabsTrigger>
          <TabsTrigger value="plano" className="gap-1.5 shrink-0">
            <Target className="h-3.5 w-3.5" /> Plano de Vendas
          </TabsTrigger>
          <TabsTrigger value="planilha" className="gap-1.5 shrink-0">
            Leads
          </TabsTrigger>
          <TabsTrigger value="nps" className="gap-1.5 shrink-0">
            <Star className="h-3.5 w-3.5 text-yellow-500" /> NPS
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5 shrink-0">
            <GraduationCap className="h-3.5 w-3.5" /> Config
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

        {/* MAPA DO EVENTO — leads com status (comprou/negociação/negativa/pendente) */}
        <TabsContent value="mapa" className="mt-6">
          <EventMapTab projectId={projectId} funnelId={funnelId} stageId={stage.id} />
        </TabsContent>

        {/* PLANO DE VENDAS — cruzamento das pesquisas (faturamento) com a matriz de ofertas */}
        <TabsContent value="plano" className="mt-6">
          <SalesPlanTab projectId={projectId} funnelId={funnelId} stageId={stage.id} />
        </TabsContent>

        {/* LEADS DO EVENTO — conectar as planilhas (fonte única: Mapa + Plano de Vendas) */}
        <TabsContent value="planilha" className="mt-6">
          <EventSourcesTab projectId={projectId} funnelId={funnelId} stageId={stage.id} />
        </TabsContent>

        {/* NPS — cruza a lista de NPS (planilha) com as respostas da etapa */}
        <TabsContent value="nps" className="mt-6">
          <NpsStageTab projectId={projectId} funnelId={funnelId} stageId={stage.id} />
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
    <div className="rounded-lg border border-border/50 overflow-x-auto">
      <table className="w-full min-w-[680px] text-xs">
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

function normTipo(tipo: string): string {
  return (tipo || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Prioridade de exibição: comprador → 2ª cadeira → iFood → fornecedor-dono-de-
// restaurante → outros (franqueados) → fornecedor comum (último).
function leadRank(l: { tipo: string; isRestaurantOwner: boolean }): number {
  const t = normTipo(l.tipo);
  if (t.includes("comprador")) return 0;
  if (t.includes("cadeira")) return 1;
  if (t.includes("ifood") || t.includes("i food")) return 2;
  if (t.includes("fornecedor")) return l.isRestaurantOwner ? 3 : 5;
  return 4;
}

// Badge de tipo (cor por categoria) exibido na frente do nome. Fornecedor que
// também é dono de restaurante ganha um badge próprio (destaque verde).
function TipoBadge({ lead }: { lead: { tipo: string; isRestaurantOwner: boolean } }) {
  const t = normTipo(lead.tipo);
  if (t.includes("fornecedor") && lead.isRestaurantOwner) {
    return (
      <span
        className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
        title="Fornecedor que é dono de restaurante"
      >
        🍴 Forn · Restaurante
      </span>
    );
  }
  if (!lead.tipo) return null;
  const cls =
    t.includes("comprador")
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : t.includes("cadeira")
        ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
        : t.includes("ifood") || t.includes("i food")
          ? "bg-red-500/15 text-red-400 border-red-500/30"
          : t.includes("fornecedor")
            ? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
            : "bg-[#d4af37]/15 text-[#d4af37] border-[#d4af37]/30";
  return (
    <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${cls}`} title={lead.tipo}>
      {lead.tipo}
    </span>
  );
}

// Badge do tipo de ingresso — só VIP e Black ganham destaque.
function TicketBadge({ ticket }: { ticket: string }) {
  const t = (ticket || "").trim().toLowerCase();
  if (t === "vip") {
    return (
      <span
        className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-amber-500/20 text-amber-300 border-amber-500/50"
        title="Ingresso VIP"
      >
        VIP
      </span>
    );
  }
  if (t === "black") {
    return (
      <span
        className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-white/10 text-white border-white/40"
        title="Ingresso Black"
      >
        BLACK
      </span>
    );
  }
  return null;
}

function EventMapTab({ projectId, funnelId, stageId }: { projectId: string; funnelId: string; stageId: string }) {
  const { data, isLoading } = useEventMap(projectId, funnelId, stageId);
  const setStatus = useSetEventLeadStatus(projectId, funnelId, stageId);
  const setSeller = useSetEventLeadSeller(projectId, funnelId, stageId);
  const setSellerBulk = useSetEventLeadSellerBulk(projectId, funnelId, stageId);
  const closersQ = useEventClosers(projectId, funnelId, stageId);
  const closerNames = useMemo(() => closersQ.data?.closers.map((c) => c.name) ?? [], [closersQ.data]);
  const [filter, setFilter] = useState<"all" | EventLeadStatus>("all");
  const [sellerFilter, setSellerFilter] = useState<string>("all"); // "all" | "none" | nome do closer
  const [query, setQuery] = useState("");
  const [detailLead, setDetailLead] = useState<RoiLead | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSeller, setBulkSeller] = useState<string>("");

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const summary = data?.summary;

  // Aplica filtros (status + vendedor) e ordena por prioridade de tipo, depois
  // por maior faturamento (sem faturamento vai por último dentro do tipo).
  const visible = useMemo(() => {
    let arr = leads;
    if (filter !== "all") arr = arr.filter((l) => l.status === filter);
    if (sellerFilter !== "all") {
      arr = arr.filter((l) => (sellerFilter === "none" ? !l.assignedSeller : l.assignedSeller === sellerFilter));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      arr = arr.filter((l) =>
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.phone ?? "").toLowerCase().includes(q) ||
        (l.invitedBy ?? "").toLowerCase().includes(q),
      );
    }
    return [...arr].sort((a, b) => {
      const pa = leadRank(a);
      const pb = leadRank(b);
      if (pa !== pb) return pa - pb;
      return (b.revenue ?? -1) - (a.revenue ?? -1);
    });
  }, [leads, filter, sellerFilter, query]);

  // Emails visíveis (base do "selecionar todos").
  const visibleEmails = useMemo(() => visible.map((l) => l.email), [visible]);
  const allVisibleSelected = visibleEmails.length > 0 && visibleEmails.every((e) => selected.has(e));

  function toggleSelect(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleEmails.forEach((e) => next.delete(e));
      else visibleEmails.forEach((e) => next.add(e));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function applyBulk() {
    const emails = Array.from(selected);
    if (emails.length === 0) return;
    const seller = bulkSeller && bulkSeller !== "none" ? bulkSeller : null;
    setSellerBulk.mutate(
      { emails, seller },
      {
        onSuccess: (res) => {
          toast.success(seller ? `${res.count} lead(s) atribuído(s) a ${seller}` : `Atribuição removida de ${res.count} lead(s)`);
          clearSelection();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atribuir em massa"),
      },
    );
  }

  function changeStatus(email: string, status: "pending" | "negotiating" | "declined") {
    setStatus.mutate(
      { email, status },
      {
        onSuccess: () => toast.success("Status atualizado"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
      },
    );
  }

  function changeSeller(email: string, seller: string | null) {
    setSeller.mutate(
      { email, seller },
      {
        onSuccess: () => toast.success(seller ? "Vendedor atribuído" : "Atribuição removida"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atribuir"),
      },
    );
  }

  // Seletor de vendedor por lead — para no clique pra não abrir o modal do lead.
  function sellerControl(l: (typeof leads)[number]) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Select
          value={l.assignedSeller ?? "none"}
          onValueChange={(v) => changeSeller(l.email, v === "none" ? null : v)}
        >
          <SelectTrigger className="h-7 text-[11px] bg-[#1a2236] border-[#1f2937] text-[#f3f4f6]">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent className="bg-[#111827] border-[#1f2937] text-[#f3f4f6]">
            <SelectItem value="none" className="text-[#9ca3af] focus:bg-[#1a2236] focus:text-[#f3f4f6]">— Sem vendedor —</SelectItem>
            {closerNames.map((name) => (
              <SelectItem key={name} value={name} className="text-[#f3f4f6] focus:bg-[#1a2236] focus:text-[#f3f4f6]">
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  function statusControl(l: (typeof leads)[number]) {
    if (l.status === "bought") {
      return (
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
          title={l.sale?.saleDate ? `Venda em ${formatDate(l.sale.saleDate)}` : undefined}
        >
          Comprou
        </span>
      );
    }
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Select value={l.status} onValueChange={(v) => changeStatus(l.email, v as "pending" | "negotiating" | "declined")}>
          <SelectTrigger className="h-7 text-[11px] bg-[#1a2236] border-[#1f2937] text-[#f3f4f6]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#111827] border-[#1f2937] text-[#f3f4f6]">
            <SelectItem value="pending" className="text-[#f3f4f6] focus:bg-[#1a2236] focus:text-[#f3f4f6]">Pendente</SelectItem>
            <SelectItem value="negotiating" className="text-amber-400 focus:bg-[#1a2236] focus:text-amber-400">Em negociação</SelectItem>
            <SelectItem value="declined" className="text-red-400 focus:bg-[#1a2236] focus:text-red-400">Negativa</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Tema premium (escuro/dourado), no estilo do relatório — escopado a esta aba.
  if (isLoading) {
    return (
      <div className="rounded-2xl bg-[#0a0e1a] border border-[#1f2937] p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-[#111827] animate-pulse" />)}
        </div>
        <div className="h-64 rounded-xl bg-[#111827] animate-pulse" />
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-2xl bg-[#0a0e1a] border border-[#1f2937] p-8 text-center text-sm space-y-1">
        <p className="font-medium text-[#f3f4f6]">Nenhum lead no mapa ainda.</p>
        <p className="text-[#9ca3af]">
          Conecte a planilha de <strong className="text-[#d4af37]">Participantes</strong> na aba Leads do Evento — eles aparecem aqui.
        </p>
      </div>
    );
  }

  const FILTERS: { key: "all" | EventLeadStatus; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: summary?.total ?? leads.length },
    { key: "bought", label: "Comprou", count: summary?.bought ?? 0 },
    { key: "negotiating", label: "Em negociação", count: summary?.negotiating ?? 0 },
    { key: "declined", label: "Negativa", count: summary?.declined ?? 0 },
    { key: "pending", label: "Pendente", count: summary?.pending ?? 0 },
  ];

  const kpis: { label: string; value: string; gold?: boolean }[] = [
    { label: "Participantes", value: String(summary?.total ?? leads.length) },
    { label: "Comprou", value: String(summary?.bought ?? 0), gold: true },
    { label: "Faturamento", value: formatCurrency(summary?.revenue ?? 0), gold: true },
    { label: "Em negociação", value: String(summary?.negotiating ?? 0) },
    { label: "Negativa", value: String(summary?.declined ?? 0) },
    { label: "Pendente", value: String(summary?.pending ?? 0) },
  ];

  return (
    <div className="rounded-2xl bg-[#0a0e1a] text-[#f3f4f6] border border-[#1f2937] p-4 sm:p-6 space-y-5 sm:space-y-6">
      {/* Header estilo relatório */}
      <div className="border-b border-[#d4af37]/60 pb-4">
        <div className="text-[11px] tracking-[2px] uppercase font-semibold text-[#d4af37]">Imersão Presencial</div>
        <h2 className="text-xl sm:text-2xl font-extrabold mt-1 text-[#f3f4f6]">Mapa do Evento</h2>
        <p className="text-[13px] text-[#9ca3af] mt-1">
          Participantes vindos das planilhas de <span className="text-[#d4af37]">Leads do Evento</span>.
          Marque o status de cada um — <span className="text-[#d4af37]">Comprou</span> é automático quando há venda lançada.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 sm:gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl bg-[#111827] border border-[#1f2937] p-3 sm:p-4 transition-colors hover:border-[#d4af37]/60">
            <div className="text-[10px] sm:text-[11px] uppercase tracking-[1px] text-[#6b7280] mb-1.5 sm:mb-2 truncate">{k.label}</div>
            <div className={`text-lg sm:text-2xl font-extrabold leading-none ${k.gold ? "text-[#d4af37]" : "text-[#f3f4f6]"}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Busca em tempo real por nome / email / telefone / convidado */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280] pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, email ou telefone..."
          className="w-full h-9 pl-9 pr-9 rounded-lg bg-[#111827] border border-[#1f2937] text-[#f3f4f6] text-[13px] placeholder:text-[#6b7280] outline-none focus:border-[#d4af37]/50"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#f3f4f6] p-1"
            aria-label="Limpar busca"
          >
            <XCircle className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filtros: status (chips) + vendedor (select) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                filter === f.key
                  ? "bg-[#d4af37] text-black border-[#d4af37]"
                  : "text-[#9ca3af] border-[#1f2937] hover:bg-[#1a2236]"
              }`}
            >
              {f.label} <span className="ml-1 tabular-nums opacity-80">{f.count}</span>
            </button>
          ))}
        </div>
        <div className="sm:ml-auto shrink-0">
          <Select value={sellerFilter} onValueChange={setSellerFilter}>
            <SelectTrigger className="h-8 w-[200px] text-[12px] bg-[#111827] border-[#1f2937] text-[#f3f4f6]">
              <SelectValue placeholder="Filtrar por vendedor" />
            </SelectTrigger>
            <SelectContent className="bg-[#111827] border-[#1f2937] text-[#f3f4f6]">
              <SelectItem value="all" className="text-[#f3f4f6] focus:bg-[#1a2236] focus:text-[#f3f4f6]">Todos os vendedores</SelectItem>
              <SelectItem value="none" className="text-[#9ca3af] focus:bg-[#1a2236] focus:text-[#f3f4f6]">Sem vendedor</SelectItem>
              {closerNames.map((name) => (
                <SelectItem key={name} value={name} className="text-[#f3f4f6] focus:bg-[#1a2236] focus:text-[#f3f4f6]">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Barra de ação em massa — aparece quando há leads selecionados */}
      {selected.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/[0.06] p-3">
          <span className="text-[13px] font-semibold text-[#f3f4f6]">
            {selected.size} selecionado{selected.size > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Select value={bulkSeller} onValueChange={setBulkSeller}>
              <SelectTrigger className="h-8 w-[180px] text-[12px] bg-[#111827] border-[#1f2937] text-[#f3f4f6]">
                <SelectValue placeholder="Escolher vendedor" />
              </SelectTrigger>
              <SelectContent className="bg-[#111827] border-[#1f2937] text-[#f3f4f6]">
                <SelectItem value="none" className="text-[#9ca3af] focus:bg-[#1a2236] focus:text-[#f3f4f6]">— Sem vendedor —</SelectItem>
                {closerNames.map((name) => (
                  <SelectItem key={name} value={name} className="text-[#f3f4f6] focus:bg-[#1a2236] focus:text-[#f3f4f6]">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={applyBulk}
              disabled={!bulkSeller || setSellerBulk.isPending}
              className="bg-[#d4af37] text-black hover:bg-[#d4af37]/90 h-8"
            >
              {setSellerBulk.isPending ? "Atribuindo..." : "Atribuir"}
            </Button>
            <button
              type="button"
              onClick={clearSelection}
              className="text-[12px] text-[#9ca3af] hover:text-[#f3f4f6] px-2"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-[#1f2937] bg-[#111827] px-3 py-6 text-center text-[#6b7280] text-sm">
          Nenhum participante com esses filtros.
        </div>
      ) : (
        <>
          {/* DESKTOP — tabela */}
          <div className="hidden sm:block rounded-xl border border-[#1f2937] overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#1f2937] text-[#f3f4f6]">
                <tr>
                  <th className="px-3 py-2.5 w-[40px]">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="accent-[#d4af37] cursor-pointer"
                      aria-label="Selecionar todos"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[1px]">Participante</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[1px]">Email</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[1px]">Telefone</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[1px]">Faturamento</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[1px]">Produto</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[1px]">Valor</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[1px] w-[170px]">Status</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[1px] w-[160px]">Vendedor</th>
                </tr>
              </thead>
              <tbody className="bg-[#111827]">
                {visible.map((l) => (
                  <tr
                    key={l.email}
                    onClick={() => setDetailLead({ name: l.name, email: l.email, phone: l.phone, revenue: l.revenue, revenueMatch: l.revenueMatch, revenueMatchInfo: l.revenueMatchInfo })}
                    className={`border-t border-[#1f2937] hover:bg-[#1a2236] transition-colors cursor-pointer ${selected.has(l.email) ? "bg-[#d4af37]/[0.06]" : ""}`}
                    title="Ver ficha e calculadora"
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(l.email)}
                        onChange={() => toggleSelect(l.email)}
                        className="accent-[#d4af37] cursor-pointer"
                        aria-label={`Selecionar ${l.name || l.email}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 max-w-[220px] text-[#f3f4f6] font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <TipoBadge lead={l} />
                        <TicketBadge ticket={l.ticket} />
                        <span className="truncate">{l.name || "—"}</span>
                      </span>
                      {normTipo(l.tipo).includes("cadeira") && l.invitedBy && (
                        <div className="text-[10px] text-[#9ca3af] mt-0.5 truncate" title={`Convidado por ${l.invitedBy}${l.saleEmail ? " · " + l.saleEmail : ""}`}>
                          👤 Convidado por {l.invitedBy}{l.saleEmail ? ` · ${l.saleEmail}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[#9ca3af] max-w-[180px] truncate">{l.email}</td>
                    <td className="px-3 py-2.5 text-[#9ca3af]">{l.phone || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[#d4af37]">
                      {l.revenue != null ? formatCurrency(l.revenue) : <span className="text-[#6b7280] font-normal">—</span>}
                      <RevenueMatchBadge revenueMatch={l.revenueMatch} info={l.revenueMatchInfo} />
                    </td>
                    <td className="px-3 py-2.5 max-w-[140px] truncate text-[#9ca3af]" title={l.sale?.product ?? ""}>
                      {l.sale?.product || "—"}
                      {l.sale && l.sale.count > 1 ? <span className="text-[10px] text-[#6b7280]"> +{l.sale.count - 1}</span> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[#d4af37]">
                      {l.sale ? formatCurrency(l.sale.value) : <span className="text-[#6b7280] font-normal">—</span>}
                    </td>
                    <td className="px-3 py-2.5">{statusControl(l)}</td>
                    <td className="px-3 py-2.5">{sellerControl(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MOBILE — cards */}
          <div className="sm:hidden space-y-2">
            {visible.map((l) => (
              <div
                key={l.email}
                onClick={() => setDetailLead({ name: l.name, email: l.email, phone: l.phone, revenue: l.revenue, revenueMatch: l.revenueMatch, revenueMatchInfo: l.revenueMatchInfo })}
                className={`rounded-xl border bg-[#111827] p-3 cursor-pointer active:bg-[#1a2236] ${selected.has(l.email) ? "border-[#d4af37]/50" : "border-[#1f2937]"}`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(l.email)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(l.email)}
                    className="accent-[#d4af37] cursor-pointer mt-1 shrink-0"
                    aria-label={`Selecionar ${l.name || l.email}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <TipoBadge lead={l} />
                      <TicketBadge ticket={l.ticket} />
                      <span className="font-semibold text-[#f3f4f6] truncate">{l.name || l.email}</span>
                    </div>
                    <div className="text-[12px] text-[#9ca3af] truncate mt-0.5">{l.email}</div>
                    {l.phone && <div className="text-[12px] text-[#6b7280] truncate">{l.phone}</div>}
                    {normTipo(l.tipo).includes("cadeira") && l.invitedBy && (
                      <div className="text-[11px] text-[#9ca3af] truncate mt-0.5">
                        👤 Convidado por {l.invitedBy}{l.saleEmail ? ` · ${l.saleEmail}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-[1px] text-[#6b7280]">Fat.</div>
                    <div className="font-bold tabular-nums text-[#d4af37]">
                      {l.revenue != null ? formatCurrency(l.revenue) : "—"}
                    </div>
                    <RevenueMatchBadge revenueMatch={l.revenueMatch} info={l.revenueMatchInfo} />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-[#1f2937]">
                  {l.sale ? (
                    <span className="text-[12px] text-[#9ca3af] truncate">
                      {l.sale.product || "Venda"} · <span className="text-[#d4af37] font-semibold">{formatCurrency(l.sale.value)}</span>
                    </span>
                  ) : (
                    <span className="text-[12px] text-[#6b7280]">—</span>
                  )}
                  {statusControl(l)}
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-[#1f2937]">
                  <div className="text-[10px] uppercase tracking-[1px] text-[#6b7280] mb-1">Vendedor</div>
                  {sellerControl(l)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <LeadDetailDialog
        open={!!detailLead}
        onOpenChange={(o) => !o && setDetailLead(null)}
        lead={detailLead}
        projectId={projectId}
        funnelId={funnelId}
        stageId={stageId}
      />
    </div>
  );
}
