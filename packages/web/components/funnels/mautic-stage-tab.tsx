"use client";

import { useMemo, useState } from "react";
import { Loader2, Mail, Plug, Unlink, RefreshCw, Search, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useMauticConnection,
  useSetMauticConnection,
  useDeleteMauticConnection,
  useMauticEmails,
  type MauticEmailRow,
} from "@/lib/hooks/use-mautic";

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function MauticStageTab({ projectId, funnelId, stageId }: Props) {
  const conn = useMauticConnection(projectId);

  return (
    <section className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Mautic — Performance de Email</h2>
      </div>

      {conn.isLoading ? (
        <Skeleton className="h-24" />
      ) : !conn.data?.connected ? (
        <ConnectionForm projectId={projectId} />
      ) : (
        <div className="space-y-4">
          <ConnectedHeader projectId={projectId} baseUrl={conn.data.baseUrl ?? ""} username={conn.data.username ?? ""} />
          <EmailDashboard projectId={projectId} funnelId={funnelId} stageId={stageId} />
        </div>
      )}
    </section>
  );
}

function ConnectionForm({ projectId }: { projectId: string }) {
  const setConn = useSetMauticConnection(projectId);
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function handleSave() {
    if (!baseUrl.trim() || !username.trim() || !password) {
      toast.error("Preencha URL, email e senha.");
      return;
    }
    setConn.mutate(
      { baseUrl: baseUrl.trim(), username: username.trim(), password },
      {
        onSuccess: () => toast.success("Mautic conectado!"),
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Conecte o Mautic do projeto (reutilizado em todas as etapas). Requer Basic Auth
        habilitado e, pra cliques/bounces, usuário <strong>admin</strong>.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="mautic-url" className="text-xs">URL</Label>
          <Input id="mautic-url" placeholder="https://mautic.seudominio.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mautic-user" className="text-xs">Email</Label>
          <Input id="mautic-user" placeholder="email@dominio.com" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mautic-pass" className="text-xs">Senha</Label>
          <Input id="mautic-pass" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </div>
      <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={setConn.isPending}>
        {setConn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
        Conectar
      </Button>
    </div>
  );
}

function ConnectedHeader({ projectId, baseUrl, username }: { projectId: string; baseUrl: string; username: string }) {
  const del = useDeleteMauticConnection(projectId);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{baseUrl}</p>
        <p className="text-[10px] text-muted-foreground truncate">{username} · conectado</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 gap-1 text-[10px] text-muted-foreground hover:text-red-500 shrink-0"
        onClick={() =>
          del.mutate(undefined, {
            onSuccess: () => toast.success("Mautic desconectado"),
            onError: (e) => toast.error(errMsg(e)),
          })
        }
        disabled={del.isPending}
      >
        {del.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
        Desconectar
      </Button>
    </div>
  );
}

type SortKey = "clickRate" | "openRate" | "sent" | "opens" | "clicks";
const SORT_LABEL: Record<SortKey, string> = {
  clickRate: "Taxa de clique",
  openRate: "Taxa de abertura",
  sent: "Enviados",
  opens: "Aberturas",
  clicks: "Cliques",
};

function metricVal(e: MauticEmailRow, k: SortKey): number {
  const v = e[k];
  return typeof v === "number" ? v : -1;
}

function EmailDashboard({ projectId, funnelId, stageId }: Props) {
  const q = useMauticEmails(projectId, funnelId, stageId, true);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("clickRate");

  const matchToken = q.data?.matchToken ?? "";
  const statsAvailable = q.data?.statsAvailable ?? true;

  const filtered = useMemo(() => {
    let list = q.data?.emails ?? [];
    if (!showAll && matchToken) {
      list = list.filter((e) => e.name.toLowerCase().includes(matchToken.toLowerCase()));
    }
    const s = search.trim().toLowerCase();
    if (s) list = list.filter((e) => e.name.toLowerCase().includes(s));
    return [...list].sort((a, b) => metricVal(b, sortKey) - metricVal(a, sortKey));
  }, [q.data, showAll, matchToken, search, sortKey]);

  if (q.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
        <p className="text-[10px] text-muted-foreground">Buscando emails e métricas do Mautic… (cliques/bounces podem levar alguns segundos)</p>
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-500">
        <span>Erro ao buscar emails: {errMsg(q.error)}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => q.refetch()}>
          <RefreshCw className="h-3 w-3" /> Tentar de novo
        </Button>
      </div>
    );
  }

  const totalSent = filtered.reduce((s, e) => s + e.sent, 0);
  const totalOpens = filtered.reduce((s, e) => s + e.opens, 0);
  const totalClicks = filtered.reduce((s, e) => s + (e.clicks ?? 0), 0);
  const aggOpen = totalSent > 0 ? (totalOpens / totalSent) * 100 : null;
  const aggClick = totalSent > 0 ? (totalClicks / totalSent) * 100 : null;

  return (
    <div className="space-y-3">
      {/* Resumo agregado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryBox label="Emails" value={String(filtered.length)} />
        <SummaryBox label="Enviados" value={totalSent.toLocaleString("pt-BR")} />
        <SummaryBox label="Abertura média" value={aggOpen != null ? `${aggOpen.toFixed(1)}%` : "—"} tone="blue" />
        <SummaryBox label="Clique médio" value={aggClick != null ? `${aggClick.toFixed(1)}%` : "—"} tone="emerald" />
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-7 text-xs" placeholder="Filtrar por email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <SelectItem key={k} value={k} className="text-xs">{SORT_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showAll ? "default" : "outline"}
          size="sm"
          className="h-8 text-[11px]"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Todos os emails" : matchToken ? `Só do funil (${matchToken})` : "Só do funil"}
        </Button>
      </div>

      {!statsAvailable && (
        <p className="text-[10px] text-amber-500">
          Cliques/bounces/descadastros precisam de usuário admin no Mautic (/api/stats). Mostrando só enviados+aberturas.
        </p>
      )}

      {/* Tabela */}
      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          {showAll ? "Nenhum email encontrado." : `Nenhum email com "${matchToken}" no nome. Clique em "Todos os emails".`}
        </p>
      ) : (
        <div className="overflow-x-auto">
          {/* Header */}
          <div className="grid grid-cols-[1.6fr_repeat(5,_minmax(56px,_0.6fr))] gap-2 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground border-b border-border/30">
            <span>Email</span>
            <span className="text-right">Enviados</span>
            <span className="text-right">Abertura</span>
            <span className="text-right">Clique</span>
            <span className="text-right">Bounces</span>
            <span className="text-right">Descad.</span>
          </div>
          {filtered.map((e, i) => {
            const isRate = sortKey === "clickRate" || sortKey === "openRate";
            const isTop = i === 0 && isRate && metricVal(e, sortKey) > 0;
            return (
              <div
                key={e.id}
                className="grid grid-cols-[1.6fr_repeat(5,_minmax(56px,_0.6fr))] gap-2 px-2 py-1.5 text-xs items-center border-b border-border/10 last:border-0"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {isTop && <Trophy className="h-3 w-3 text-amber-500 shrink-0" />}
                  <span className="truncate" title={e.name}>{e.name}</span>
                  <span className="text-[8px] px-1 py-px rounded bg-muted text-muted-foreground shrink-0">
                    {e.emailType === "template" ? "camp" : e.emailType === "list" ? "lista" : "—"}
                  </span>
                </div>
                <span className="text-right tabular-nums">{e.sent.toLocaleString("pt-BR")}</span>
                <span className="text-right tabular-nums text-blue-500">{e.openRate != null ? `${(e.openRate * 100).toFixed(0)}%` : "—"}</span>
                <span className="text-right tabular-nums text-emerald-500">{e.clickRate != null ? `${(e.clickRate * 100).toFixed(0)}%` : "—"}</span>
                <span className="text-right tabular-nums text-amber-600">{e.bounces ?? "—"}</span>
                <span className="text-right tabular-nums text-red-500">{e.unsubscribes ?? "—"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryBox({ label, value, tone }: { label: string; value: string; tone?: "blue" | "emerald" }) {
  const toneCls = tone === "blue" ? "text-blue-500" : tone === "emerald" ? "text-emerald-500" : "";
  return (
    <div className="rounded-lg border border-border/40 bg-card/60 p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <p className={`text-base font-bold tabular-nums mt-0.5 ${toneCls}`}>{value}</p>
    </div>
  );
}
