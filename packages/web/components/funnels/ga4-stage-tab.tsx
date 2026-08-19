"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, BarChart3, Plug, Unlink, Save, RefreshCw, ChevronRight, Globe } from "lucide-react";
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
import { PlausibleDashboard } from "@/components/analytics/plausible-dashboard";
import {
  useDeletePlausibleSite,
  usePlausibleSite,
  usePlausibleSites,
  useSetPlausibleSite,
} from "@/lib/hooks/use-plausible";

// Epic 37 — Aba Analytics da etapa. Mede comportamento on-page + atribuição de
// origem/campanha (complementa Meta/Google Ads, que dão custo). A conexão é por
// projeto; a etapa escolhe a PÁGINA (ga4PageFilter) a analisar.
//
// Duas fontes possíveis, e nunca as duas ao mesmo tempo: GA4 (OAuth por projeto)
// ou Plausible self-hosted (instância única, site escolhido por projeto). Quem
// decide é o que está configurado — ter um site do Plausible desliga o GA4 daqui.
// O dashboard sai da MESMA rota nos dois casos: o backend já entrega o formato
// pronto, então a tela abaixo desenha os dois sem saber a diferença — só troca
// rótulo e esconde o que a fonte não mede.

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
  const plaus = usePlausibleSite(projectId);

  if (conn.isLoading || plaus.isLoading) return <Skeleton className="h-40" />;
  if (conn.isError) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-500">
        <span>Erro ao carregar a conexão de analytics.</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => conn.refetch()}>
          <RefreshCw className="h-3 w-3" /> Tentar de novo
        </Button>
      </div>
    );
  }

  // Site do Plausible escolhido é o que manda: o GA4 fica fora até alguém
  // desfazer a escolha. Mostrar os dois painéis ativos sugeriria que o número
  // pode vir de qualquer um dos dois.
  if (plaus.data?.siteId) {
    return (
      <PlausibleConnected
        projectId={projectId}
        funnelId={funnelId}
        stageId={stageId}
        siteId={plaus.data.siteId}
        baseUrl={plaus.data.configGlobal.baseUrl}
      />
    );
  }

  const ofereceePlausible = plaus.data?.configGlobal.configured ?? false;

  if (!conn.data?.connected) {
    return (
      <div className="space-y-4">
        <Ga4ConnectPanel projectId={projectId} />
        {ofereceePlausible && <PlausiblePicker projectId={projectId} />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Ga4Connected
        projectId={projectId}
        funnelId={funnelId}
        stageId={stageId}
        propertyName={conn.data.propertyName ?? conn.data.propertyId ?? "GA4"}
      />
      {ofereceePlausible && <PlausiblePicker projectId={projectId} trocandoDoGa4 />}
    </div>
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
  const del = useDeleteGa4Connection(projectId);

  return (
    <StageAnalyticsBody
      projectId={projectId}
      funnelId={funnelId}
      stageId={stageId}
      header={
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
      }
    />
  );
}

// ---- Plausible: o painel completo, mais o filtro de página da etapa ----
function PlausibleConnected({
  projectId,
  funnelId,
  stageId,
  siteId,
  baseUrl,
}: Props & { siteId: string; baseUrl: string | null }) {
  const del = useDeletePlausibleSite(projectId);
  const stageQ = useFunnelStage(projectId, funnelId, stageId);
  const updateStage = useUpdateStage(projectId, funnelId, stageId);

  const savedFilter = stageQ.data?.ga4PageFilter ?? "";
  const [filter, setFilter] = useState(savedFilter);
  useEffect(() => { setFilter(savedFilter); }, [savedFilter]);

  function saveFilter() {
    const value = filter.trim() || null;
    updateStage.mutate(
      { ga4PageFilter: value },
      { onSuccess: () => toast.success(value ? "Página salva" : "Filtro limpo") },
    );
  }

  return (
    <div className="space-y-5">
      {/* Filtro da etapa. Vazio mostra o site inteiro — que é exatamente o que
          o painel do Plausible mostra, então não é um estado "incompleto". */}
      <section className="max-w-xl space-y-2 rounded-xl border border-border/40 bg-card/60 p-4">
        <Label htmlFor="plausible-page-filter" className="text-xs font-medium">Página desta etapa (opcional)</Label>
        <p className="text-[11px] text-muted-foreground">
          Um trecho da URL para recortar o painel no pedaço desta etapa, ex.: <code>bbe-fc1</code>.
          Vazio = site inteiro.
        </p>
        <div className="flex gap-2">
          <Input
            id="plausible-page-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="ex.: bbe-fc1"
            onKeyDown={(e) => e.key === "Enter" && saveFilter()}
          />
          <Button size="sm" className="shrink-0 gap-1.5" onClick={saveFilter} disabled={updateStage.isPending || filter.trim() === savedFilter.trim()}>
            {updateStage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </section>

      <PlausibleDashboard
        projectId={projectId}
        pageFilter={savedFilter}
        header={
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-primary" />
              <span className="font-medium">Plausible</span>
              <Badge variant="secondary" className="max-w-[220px] truncate text-[10px]" title={siteId}>{siteId}</Badge>
              {baseUrl && (
                <a
                  href={`${baseUrl}/${encodeURIComponent(siteId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden truncate text-[10px] text-muted-foreground underline-offset-2 hover:underline sm:inline"
                >
                  abrir no Plausible
                </a>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2 text-[10px] text-muted-foreground hover:text-red-500"
              onClick={() => del.mutate(undefined, { onSuccess: () => toast.success("Projeto voltou para o GA4"), onError: (e) => toast.error(errMsg(e)) })}
              disabled={del.isPending}
            >
              {del.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
              Voltar ao GA4
            </Button>
          </div>
        }
      />
    </div>
  );
}

/**
 * Escolha do site do Plausible para o projeto.
 *
 * Fica visível mesmo com o GA4 conectado — é assim que se troca de fonte — mas
 * o aviso deixa explícito que a troca desliga o GA4 daqui, em vez de a pessoa
 * descobrir isso depois pelo número que mudou.
 */
function PlausiblePicker({ projectId, trocandoDoGa4 }: { projectId: string; trocandoDoGa4?: boolean }) {
  const sites = usePlausibleSites();
  const setSite = useSetPlausibleSite(projectId);
  const [dominio, setDominio] = useState("");

  function salvar(valor: string) {
    const v = valor.trim();
    if (!v) return;
    setSite.mutate(v, {
      onSuccess: (r) => toast.success(r.detalhe || "Plausible ativado neste projeto"),
      onError: (e) => toast.error(errMsg(e)),
    });
  }

  return (
    <section className="max-w-xl space-y-2 rounded-xl border border-border/40 bg-card/60 p-4">
      <div className="flex items-center gap-2 text-sm">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Usar Plausible neste projeto</span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Informe o domínio como ele está cadastrado no Plausible (ex.: <code>loja.exemplo.com</code>).
        Pode colar a URL inteira — a gente extrai o domínio.
        {trocandoDoGa4 && <> Ao salvar, <strong>este projeto deixa de ler o GA4</strong> e passa a ler o Plausible.</>}
      </p>

      {sites.isLoading ? (
        <Skeleton className="h-8" />
      ) : sites.data && sites.data.sites.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {sites.data.sites.map((s) => (
            <Button
              key={s.domain}
              variant="outline"
              size="sm"
              className="h-7 max-w-full px-2 text-[11px]"
              disabled={setSite.isPending}
              onClick={() => salvar(s.domain)}
            >
              <span className="truncate">{s.domain}</span>
            </Button>
          ))}
        </div>
      ) : (
        // Sem lista, dizer POR QUE — senão parece que a instância não tem site,
        // quando na verdade é a API que não expõe a listagem.
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          A lista de sites não veio: a API de sites do Plausible não existe no Community Edition, e o
          endpoint do painel exige login. Um admin pode cadastrar o login em{" "}
          <strong>Configurações → Analytics</strong> para a lista aparecer aqui. Enquanto isso, digite
          o domínio abaixo.
        </p>
      )}

      <div className="flex gap-2">
        <Input
          value={dominio}
          onChange={(e) => setDominio(e.target.value)}
          placeholder="loja.exemplo.com"
          onKeyDown={(e) => e.key === "Enter" && salvar(dominio)}
        />
        <Button size="sm" className="shrink-0 gap-1.5" onClick={() => salvar(dominio)} disabled={setSite.isPending || !dominio.trim()}>
          {setSite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          Ativar
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        O domínio é conferido contra a instância antes de salvar — domínio errado devolveria zero, que
        se confunde com &quot;não teve tráfego&quot;.
      </p>
    </section>
  );
}

/**
 * Corpo comum às duas fontes: filtro de página da etapa + números.
 *
 * Os rótulos mudam com a fonte porque as palavras não são equivalentes — o
 * Plausible conta "visitantes/visitas", o GA4 "usuários/sessões". E o que a
 * fonte não mede fica de fora em vez de aparecer zerado: "0 novos usuários"
 * seria lido como dado, não como ausência de dado.
 */
function StageAnalyticsBody({
  projectId,
  funnelId,
  stageId,
  header,
}: Props & { header: React.ReactNode }) {
  const stageQ = useFunnelStage(projectId, funnelId, stageId);
  const updateStage = useUpdateStage(projectId, funnelId, stageId);

  const savedFilter = stageQ.data?.ga4PageFilter ?? "";
  const [filter, setFilter] = useState(savedFilter);
  const [days, setDays] = useState(30);

  // Sincroniza o input quando o stage carrega/atualiza.
  useEffect(() => { setFilter(savedFilter); }, [savedFilter]);

  const analytics = useGa4StageAnalytics(projectId, funnelId, stageId, {
    days,
    enabled: Boolean(savedFilter),
  });

  const ehPlausible = analytics.data?.fonte === "plausible";

  function saveFilter() {
    const value = filter.trim() || null;
    updateStage.mutate(
      { ga4PageFilter: value },
      { onSuccess: () => toast.success(value ? "Página salva" : "Filtro limpo") },
    );
  }

  return (
    <div className="space-y-5">
      {header}

      {/* Config da página desta etapa */}
      <section className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-2 max-w-xl">
        <Label htmlFor="ga4-page-filter" className="text-xs font-medium">Página desta etapa</Label>
        <p className="text-[11px] text-muted-foreground">
          Um trecho que apareça na URL de TODAS as páginas da etapa — pode ser só um pedaço, ex.: <code>dg-pg04</code>.
          Pega <strong>todas</strong> as páginas cuja URL <em>contém</em> esse texto (não precisa da <code>/</code> nem do caminho inteiro; ignora maiúsc./minúsc.). Vazio = site inteiro.
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
        <p className="text-xs text-muted-foreground">Configure a página acima para ver as métricas.</p>
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
            <div className="flex flex-wrap items-center gap-2 text-xs text-red-500">
              <span>{errMsg(analytics.error)}</span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => analytics.refetch()}>
                <RefreshCw className="h-3 w-3" /> Tentar de novo
              </Button>
            </div>
          ) : analytics.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <Metric label={ehPlausible ? "Visitas" : "Sessões"} value={nf.format(analytics.data.totals.sessions)} />
                <Metric label={ehPlausible ? "Visitantes" : "Usuários ativos"} value={nf.format(analytics.data.totals.activeUsers)} />
                {!ehPlausible && <Metric label="Novos usuários" value={nf.format(analytics.data.totals.newUsers)} />}
                <Metric label="Engajamento" value={pf.format(analytics.data.totals.engagementRate)} />
                <Metric label={ehPlausible ? "Eventos" : "Conversões"} value={nf.format(analytics.data.totals.conversions)} />
                <Metric label="Páginas vistas" value={nf.format(analytics.data.totals.pageViews)} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Breakdown
                  title={ehPlausible ? "Por canal (Plausible)" : "Por canal"}
                  rows={analytics.data.byChannel.map((c) => ({ label: c.channel, sessions: c.sessions, conversions: c.conversions }))}
                />
                <Breakdown
                  title="Top campanhas"
                  rows={analytics.data.topCampaigns.map((c) => ({ label: c.campaign, sessions: c.sessions, conversions: c.conversions }))}
                />
              </div>

              {/* Páginas que o filtro puxou — agrupadas por path base (antes do ?) */}
              {analytics.data.byPage && analytics.data.byPage.length > 0 && (
                <PagesBreakdown pages={analytics.data.byPage} plausible={ehPlausible} />
              )}

              {ehPlausible && (
                <p className="text-[11px] text-muted-foreground">
                  O Plausible não separa visitante novo de recorrente nem registra receita — por isso
                  esses números não aparecem aqui. &quot;Engajamento&quot; é o complemento da taxa de rejeição.
                </p>
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
function PagesBreakdown({ pages, plausible }: { pages: PageRow[]; plausible?: boolean }) {
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
                  {plausible
                    ? `${nf.format(g.sessions)} visitas · ${nf.format(g.activeUsers)} visitantes`
                    : `${nf.format(g.sessions)} ses · ${nf.format(g.activeUsers)} ativos · ${nf.format(g.newUsers)} novos`}
                </span>
              </button>
              {isOpen && hasVariants && (
                <div className="space-y-0.5 border-t border-border/20 bg-muted/20 px-2 py-1.5">
                  {g.variants.map((v, i) => (
                    <div key={`${v.page}-${i}`} className="flex items-center justify-between gap-2 pl-5 text-[11px]">
                      <span className="truncate font-mono text-muted-foreground" title={v.page}>{v.page.includes("?") ? "?" + v.page.split("?").slice(1).join("?") : v.page}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {plausible
                          ? `${nf.format(v.sessions)} visitas · ${nf.format(v.activeUsers)} visitantes`
                          : `${nf.format(v.sessions)} ses · ${nf.format(v.activeUsers)} ativos · ${nf.format(v.newUsers)} novos`}
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
