"use client";

import { useState } from "react";
import { Loader2, Mail, Send, Eye, Link2, Unlink, Plug, Sparkles, RefreshCw } from "lucide-react";
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
  useMauticStageCampaign,
  useSetMauticStageCampaign,
  useDeleteMauticStageCampaign,
  useMauticCampaigns,
  useMauticMetrics,
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
        <h2 className="text-base font-semibold">Mautic — Email Automation</h2>
      </div>

      {conn.isLoading ? (
        <Skeleton className="h-24" />
      ) : !conn.data?.connected ? (
        <ConnectionForm projectId={projectId} />
      ) : (
        <div className="space-y-4">
          <ConnectedHeader projectId={projectId} baseUrl={conn.data.baseUrl ?? ""} username={conn.data.username ?? ""} />
          <StageCampaignSection projectId={projectId} funnelId={funnelId} stageId={stageId} />
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
        Conecte o Mautic do projeto. A conexão é reutilizada em todas as etapas. Requer
        Basic Auth habilitado no Mautic (Configurações → API).
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

function StageCampaignSection({ projectId, funnelId, stageId }: Props) {
  const link = useMauticStageCampaign(projectId, funnelId, stageId);
  const setLink = useSetMauticStageCampaign(projectId, funnelId, stageId);
  const delLink = useDeleteMauticStageCampaign(projectId, funnelId, stageId);
  const [manualOpen, setManualOpen] = useState(false);

  if (link.isLoading) return <Skeleton className="h-20" />;

  const linked = link.data?.linked ?? null;
  const suggested = link.data?.suggested ?? null;
  const matchToken = link.data?.matchToken ?? "";

  if (linked) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span className="text-sm font-medium truncate">{linked.campaignName}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
              {linked.matchMode === "auto" ? "auto" : "manual"}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => setManualOpen((v) => !v)}>
              Trocar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] text-muted-foreground hover:text-red-500"
              onClick={() =>
                delLink.mutate(undefined, {
                  onSuccess: () => toast.success("Campanha desvinculada"),
                  onError: (e) => toast.error(errMsg(e)),
                })
              }
              disabled={delLink.isPending}
            >
              {delLink.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {manualOpen && (
          <ManualCampaignPicker
            projectId={projectId}
            onPick={(c) =>
              setLink.mutate(
                { campaignId: c.id, campaignName: c.name },
                {
                  onSuccess: () => {
                    toast.success("Campanha trocada");
                    setManualOpen(false);
                  },
                  onError: (e) => toast.error(errMsg(e)),
                },
              )
            }
            pending={setLink.isPending}
          />
        )}

        <MetricsPanel projectId={projectId} funnelId={funnelId} stageId={stageId} />
      </div>
    );
  }

  // Sem vínculo: sugestão de auto-match + seleção manual
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Nenhuma campanha Mautic vinculada a esta etapa.
        {matchToken && <> Match automático por <span className="font-mono">{matchToken}</span>.</>}
      </p>

      {suggested && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-sm truncate">{suggested.name}</span>
            <span className="text-[9px] text-muted-foreground shrink-0">sugerida</span>
          </div>
          <Button
            size="sm"
            className="h-7 px-2 text-[10px] gap-1 shrink-0"
            onClick={() =>
              setLink.mutate(
                { auto: true },
                {
                  onSuccess: () => toast.success("Campanha vinculada (auto)"),
                  onError: (e) => toast.error(errMsg(e)),
                },
              )
            }
            disabled={setLink.isPending}
          >
            {setLink.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
            Vincular
          </Button>
        </div>
      )}

      <ManualCampaignPicker
        projectId={projectId}
        onPick={(c) =>
          setLink.mutate(
            { campaignId: c.id, campaignName: c.name },
            {
              onSuccess: () => toast.success("Campanha vinculada"),
              onError: (e) => toast.error(errMsg(e)),
            },
          )
        }
        pending={setLink.isPending}
      />
    </div>
  );
}

function ManualCampaignPicker({
  projectId,
  onPick,
  pending,
}: {
  projectId: string;
  onPick: (c: { id: string; name: string }) => void;
  pending: boolean;
}) {
  const campaigns = useMauticCampaigns(projectId, true);

  if (campaigns.isLoading) return <Skeleton className="h-9" />;
  if (campaigns.isError) {
    return <p className="text-xs text-red-500">Erro ao listar campanhas do Mautic.</p>;
  }
  const list = campaigns.data?.campaigns ?? [];
  if (list.length === 0) return <p className="text-xs text-muted-foreground">Nenhuma campanha encontrada no Mautic.</p>;

  return (
    <div className="flex items-center gap-2">
      <Select
        onValueChange={(id) => {
          const c = list.find((x) => x.id === id);
          if (c) onPick(c);
        }}
        disabled={pending}
      >
        <SelectTrigger className="h-9 text-xs">
          <SelectValue placeholder="Selecionar campanha manualmente…" />
        </SelectTrigger>
        <SelectContent>
          {list.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

function MetricsPanel({ projectId, funnelId, stageId }: Props) {
  const metrics = useMauticMetrics(projectId, funnelId, stageId, true);

  if (metrics.isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }
  if (metrics.isError) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-500">
        <span>Erro ao buscar métricas.</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => metrics.refetch()}>
          <RefreshCw className="h-3 w-3" /> Tentar de novo
        </Button>
      </div>
    );
  }
  const m = metrics.data;
  if (!m) return null;
  const openRatePct = m.openRate != null ? `${(m.openRate * 100).toFixed(1)}%` : "—";

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-2">
        <MetricBox icon={<Send className="h-3 w-3" />} label="Enviados" value={m.sent.toLocaleString("pt-BR")} />
        <MetricBox icon={<Eye className="h-3 w-3" />} label="Aberturas" value={m.opens.toLocaleString("pt-BR")} />
        <MetricBox icon={<Mail className="h-3 w-3" />} label="Taxa abertura" value={openRatePct} />
      </div>
      <p className="text-[10px] text-muted-foreground">
        {m.emailCount} email(s) na campanha. Cliques não são expostos pela API padrão do Mautic.
      </p>
    </div>
  );
}

function MetricBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/60 p-2.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-base font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}
