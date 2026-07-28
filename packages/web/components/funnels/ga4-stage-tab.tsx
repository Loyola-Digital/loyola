"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, BarChart3, Plug, Unlink, Save, RefreshCw, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useFunnelStage, useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import {
  useGa4Connection,
  useGa4OAuth,
  useSetGa4Connection,
  useDeleteGa4Connection,
  useGa4StageAnalytics,
  type Ga4Property,
} from "@/lib/hooks/use-ga4";

// Epic 37 — Aba GA4 da etapa. A GA4 mede comportamento on-page + atribuição de
// origem/campanha (complementa Meta/Google Ads, que dão custo). Conexão é por
// projeto (1 property GA4); a etapa escolhe a PÁGINA (ga4PageFilter) a analisar.

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const nf = new Intl.NumberFormat("pt-BR");
const pf = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export function Ga4StageTab({ projectId, funnelId, stageId }: Props) {
  const conn = useGa4Connection(projectId);

  if (conn.isLoading) return <Skeleton className="h-40" />;
  if (conn.isError) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-500">
        <span>Erro ao carregar conexão GA4.</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => conn.refetch()}>
          <RefreshCw className="h-3 w-3" /> Tentar de novo
        </Button>
      </div>
    );
  }

  if (!conn.data?.connected) {
    return <Ga4ConnectPanel projectId={projectId} />;
  }

  return (
    <Ga4Connected
      projectId={projectId}
      funnelId={funnelId}
      stageId={stageId}
      propertyName={conn.data.propertyName ?? conn.data.propertyId ?? "GA4"}
    />
  );
}

// ---- Conexão (OAuth Google + escolha da property) ----
function Ga4ConnectPanel({ projectId }: { projectId: string }) {
  const oauth = useGa4OAuth();
  const setConn = useSetGa4Connection(projectId);
  const [properties, setProperties] = useState<Ga4Property[]>([]);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  async function handleConnect() {
    try {
      const res = await oauth.mutateAsync();
      setRefreshToken(res.refreshToken);
      setProperties(res.properties);
      if (res.properties.length === 0) {
        toast.error("Nenhuma property GA4 acessível nessa conta Google.");
      }
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  function choose(p: Ga4Property) {
    if (!refreshToken) return;
    setConn.mutate(
      { refreshToken, propertyId: p.propertyId, propertyName: p.displayName },
      {
        onSuccess: () => { toast.success(`GA4 conectado: ${p.displayName}`); setRefreshToken(null); setProperties([]); },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  return (
    <section className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-3 max-w-xl">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold">Google Analytics 4</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Conecte o GA4 deste projeto para analisar, por etapa, o comportamento na página
        (sessões, engajamento, conversões) e a atribuição por origem/campanha. A conexão é por
        projeto; cada etapa escolhe qual página medir.
      </p>

      {properties.length === 0 ? (
        <Button size="sm" className="gap-1.5" onClick={handleConnect} disabled={oauth.isPending}>
          {oauth.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          Conectar com Google
        </Button>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs">Escolha a property GA4</Label>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {properties.map((p) => (
              <button
                key={p.propertyId}
                type="button"
                onClick={() => choose(p)}
                disabled={setConn.isPending}
                className="w-full flex items-center justify-between gap-2 rounded-md border border-border/40 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.displayName}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {p.account} · {p.propertyId}
                  </span>
                </span>
                {setConn.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ---- Conectado: config da página da etapa + analytics ----
function Ga4Connected({
  projectId,
  funnelId,
  stageId,
  propertyName,
}: Props & { propertyName: string }) {
  const stageQ = useFunnelStage(projectId, funnelId, stageId);
  const updateStage = useUpdateStage(projectId, funnelId, stageId);
  const del = useDeleteGa4Connection(projectId);

  const savedFilter = stageQ.data?.ga4PageFilter ?? "";
  const [filter, setFilter] = useState(savedFilter);
  const [days, setDays] = useState(30);

  // Sincroniza o input quando o stage carrega/atualiza.
  useEffect(() => { setFilter(savedFilter); }, [savedFilter]);

  const analytics = useGa4StageAnalytics(projectId, funnelId, stageId, {
    days,
    enabled: Boolean(savedFilter),
  });

  function saveFilter() {
    const value = filter.trim() || null;
    updateStage.mutate(
      { ga4PageFilter: value },
      { onSuccess: () => toast.success(value ? "Página GA4 salva" : "Filtro GA4 limpo") },
    );
  }

  return (
    <div className="space-y-5">
      {/* Header conexão */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="font-medium">GA4</span>
          <Badge variant="secondary" className="text-[10px]">{propertyName}</Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1 text-[10px] text-muted-foreground hover:text-red-500"
          onClick={() => del.mutate(undefined, { onSuccess: () => toast.success("GA4 desconectado"), onError: (e) => toast.error(errMsg(e)) })}
          disabled={del.isPending}
        >
          {del.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
          Desconectar
        </Button>
      </div>

      {/* Config da página desta etapa */}
      <section className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-2 max-w-xl">
        <Label htmlFor="ga4-page-filter" className="text-xs font-medium">Página desta etapa</Label>
        <p className="text-[11px] text-muted-foreground">
          Um trecho que apareça na URL de TODAS as páginas da etapa — pode ser só um pedaço, ex.: <code>dg-pg04</code>.
          Pega <strong>todas</strong> as páginas cuja URL <em>contém</em> esse texto (não precisa da <code>/</code> nem do caminho inteiro; ignora maiúsc./minúsc.). Vazio = property inteira.
        </p>
        <div className="flex gap-2">
          <Input
            id="ga4-page-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="ex.: dg-pg04"
            onKeyDown={(e) => e.key === "Enter" && saveFilter()}
          />
          <Button size="sm" className="gap-1.5 shrink-0" onClick={saveFilter} disabled={updateStage.isPending || filter.trim() === savedFilter.trim()}>
            {updateStage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </section>

      {/* Analytics */}
      {!savedFilter ? (
        <p className="text-xs text-muted-foreground">Configure a página acima para ver as métricas do GA4.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5">
            {[7, 30, 90].map((d) => (
              <Button key={d} variant={days === d ? "secondary" : "ghost"} size="sm" className="h-7 px-2 text-[11px]" onClick={() => setDays(d)}>
                {d}d
              </Button>
            ))}
            {analytics.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>

          {analytics.isLoading ? (
            <Skeleton className="h-40" />
          ) : analytics.isError ? (
            <div className="flex items-center gap-2 text-xs text-red-500">
              <span>Erro ao consultar GA4.</span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => analytics.refetch()}>
                <RefreshCw className="h-3 w-3" /> Tentar de novo
              </Button>
            </div>
          ) : analytics.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <Metric label="Sessões" value={nf.format(analytics.data.totals.sessions)} />
                <Metric label="Usuários ativos" value={nf.format(analytics.data.totals.activeUsers)} />
                <Metric label="Novos usuários" value={nf.format(analytics.data.totals.newUsers)} />
                <Metric label="Engajamento" value={pf.format(analytics.data.totals.engagementRate)} />
                <Metric label="Conversões" value={nf.format(analytics.data.totals.conversions)} />
                <Metric label="Páginas vistas" value={nf.format(analytics.data.totals.pageViews)} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Breakdown
                  title="Por canal"
                  rows={analytics.data.byChannel.map((c) => ({ label: c.channel, sessions: c.sessions, conversions: c.conversions }))}
                />
                <Breakdown
                  title="Top campanhas"
                  rows={analytics.data.topCampaigns.map((c) => ({ label: c.campaign, sessions: c.sessions, conversions: c.conversions }))}
                />
              </div>

              {/* Páginas que o filtro puxou — agrupadas por path base (antes do ?) */}
              {analytics.data.byPage && analytics.data.byPage.length > 0 && (
                <PagesBreakdown pages={analytics.data.byPage} />
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

interface PageRow { page: string; sessions: number; activeUsers: number; newUsers: number }
interface PageGroup {
  base: string;
  sessions: number;
  activeUsers: number;
  newUsers: number;
  variants: PageRow[];
}

/**
 * Lista de páginas do GA4 agrupada pela PATH BASE (antes do "?"). Cada grupo soma
 * as métricas das variações (com query string) e abre um dropdown pra ver o detalhe.
 */
function PagesBreakdown({ pages }: { pages: PageRow[] }) {
  const [open, setOpen] = useState<string | null>(null);

  const groups = useMemo<PageGroup[]>(() => {
    const map = new Map<string, PageGroup>();
    for (const p of pages) {
      const base = (p.page.split("?")[0] || p.page).trim() || "(sem path)";
      const g = map.get(base) ?? { base, sessions: 0, activeUsers: 0, newUsers: 0, variants: [] };
      g.sessions += p.sessions;
      g.activeUsers += p.activeUsers;
      g.newUsers += p.newUsers;
      g.variants.push(p);
      map.set(base, g);
    }
    for (const g of map.values()) g.variants.sort((a, b) => b.sessions - a.sessions);
    return [...map.values()].sort((a, b) => b.sessions - a.sessions);
  }, [pages]);

  return (
    <section className="rounded-xl border border-border/40 bg-card/60 p-3 space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground">
        Páginas incluídas neste filtro ({groups.length}) — agrupadas por URL · clique pra ver as variações
      </h4>
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {groups.map((g) => {
          const isOpen = open === g.base;
          const hasVariants = g.variants.length > 1 || (g.variants[0] && g.variants[0].page !== g.base);
          return (
            <div key={g.base} className="rounded-md border border-border/30">
              <button
                type="button"
                onClick={() => hasVariants && setOpen(isOpen ? null : g.base)}
                className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs ${hasVariants ? "cursor-pointer hover:bg-muted/40" : "cursor-default"}`}
              >
                <span className="flex min-w-0 items-center gap-1">
                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""} ${hasVariants ? "" : "opacity-0"}`} />
                  <span className="truncate font-mono" title={g.base}>{g.base}</span>
                  {hasVariants && <span className="shrink-0 text-[10px] text-muted-foreground">({g.variants.length})</span>}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {nf.format(g.sessions)} ses · {nf.format(g.activeUsers)} ativos · {nf.format(g.newUsers)} novos
                </span>
              </button>
              {isOpen && hasVariants && (
                <div className="space-y-0.5 border-t border-border/20 bg-muted/20 px-2 py-1.5">
                  {g.variants.map((v, i) => (
                    <div key={`${v.page}-${i}`} className="flex items-center justify-between gap-2 pl-5 text-[11px]">
                      <span className="truncate font-mono text-muted-foreground" title={v.page}>{v.page.includes("?") ? "?" + v.page.split("?").slice(1).join("?") : v.page}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {nf.format(v.sessions)} ses · {nf.format(v.activeUsers)} ativos · {nf.format(v.newUsers)} novos
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; sessions: number; conversions: number }> }) {
  return (
    <section className="rounded-xl border border-border/40 bg-card/60 p-3 space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Sem dados no período.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={`${r.label}-${i}`} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{r.label}</span>
              <span className="shrink-0 text-muted-foreground">
                {nf.format(r.sessions)} ses · {nf.format(r.conversions)} conv
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
