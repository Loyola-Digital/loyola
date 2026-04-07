"use client";

import { useState, useEffect, useCallback } from "react";
import { Youtube, Loader2, Trash2, Link2, Unlink, CheckCircle2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  useYouTubeChannels, useDeleteYouTubeChannel, useLinkYouTubeProject, useUnlinkYouTubeProject,
  useYouTubeAuthUrl, useYouTubeAuthCallback, useYouTubeConnect,
  type YouTubeChannel, type YouTubeChannelInfo,
} from "@/lib/hooks/use-youtube-channels";
import { useProjects } from "@/lib/hooks/use-projects";

function fmtNumber(val: number | null): string {
  if (val === null) return "—";
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

type OAuthStep = "idle" | "authorizing" | "picking" | "connecting";

export default function YouTubeSettingsPage() {
  const { data: channels, isLoading } = useYouTubeChannels();
  const { data: projects } = useProjects();
  const deleteChannel = useDeleteYouTubeChannel();
  const linkProject = useLinkYouTubeProject();
  const unlinkProject = useUnlinkYouTubeProject();
  const getAuthUrl = useYouTubeAuthUrl();
  const authCallback = useYouTubeAuthCallback();
  const connectChannel = useYouTubeConnect();

  const [deleteTarget, setDeleteTarget] = useState<YouTubeChannel | null>(null);
  const [oauthStep, setOauthStep] = useState<OAuthStep>("idle");
  const [availableChannels, setAvailableChannels] = useState<YouTubeChannelInfo[]>([]);
  const [refreshToken, setRefreshToken] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState("");

  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.origin !== window.location.origin || event.data?.type !== "youtube-auth") return;
    if (event.data.error) { toast.error("Autorizacao cancelada."); setOauthStep("idle"); return; }
    if (event.data.code) {
      setOauthStep("authorizing");
      authCallback.mutate({ code: event.data.code, redirectUri }, {
        onSuccess: (data) => { setRefreshToken(data.refreshToken); setAvailableChannels(data.channels); setOauthStep("picking"); },
        onError: (err) => { toast.error(err instanceof Error ? err.message : "Erro."); setOauthStep("idle"); },
      });
    }
  }, [authCallback, redirectUri]);

  useEffect(() => { window.addEventListener("message", handleMessage); return () => window.removeEventListener("message", handleMessage); }, [handleMessage]);

  function handleStartOAuth() {
    setOauthStep("authorizing");
    getAuthUrl.mutate(undefined, {
      onSuccess: (data) => {
        setRedirectUri(data.redirectUri);
        const w = 500, h = 600, left = window.screenX + (window.outerWidth - w) / 2, top = window.screenY + (window.outerHeight - h) / 2;
        window.open(data.url, "youtube-auth", `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`);
      },
      onError: (err) => { toast.error(err instanceof Error ? err.message : "Erro."); setOauthStep("idle"); },
    });
  }

  function handleConnect() {
    const ch = availableChannels.find((c) => c.channelId === selectedChannelId);
    if (!ch || !refreshToken) return;
    setOauthStep("connecting");
    connectChannel.mutate({ ...ch, refreshToken }, {
      onSuccess: () => { toast.success("Canal YouTube conectado!"); setOauthStep("idle"); setAvailableChannels([]); setRefreshToken(""); },
      onError: (err) => { toast.error(err instanceof Error ? err.message : "Erro."); setOauthStep("picking"); },
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Youtube className="h-5 w-5 text-red-500" />
          YouTube Canal
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Conecte canais do YouTube para acompanhar metricas organicas.</p>
      </div>

      {/* OAuth */}
      <div className="rounded-2xl border border-border/30 bg-card/60 p-5 space-y-4">
        <h2 className="text-sm font-semibold">Conectar canal</h2>

        {oauthStep === "idle" && (
          <Button onClick={handleStartOAuth} disabled={getAuthUrl.isPending} className="gap-2">
            {getAuthUrl.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4 text-red-500" />}
            Conectar com Google
          </Button>
        )}

        {oauthStep === "authorizing" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Aguardando autorizacao...</div>
        )}

        {oauthStep === "picking" && availableChannels.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Selecione o canal:</p>
            <div className="space-y-2">
              {availableChannels.map((ch) => (
                <button key={ch.channelId} onClick={() => setSelectedChannelId(ch.channelId)}
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${selectedChannelId === ch.channelId ? "border-primary bg-primary/5" : "border-border/30 hover:border-border/60"}`}>
                  {ch.thumbnailUrl && <img src={ch.thumbnailUrl} alt="" className="h-10 w-10 rounded-full" />}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{ch.channelName}</p>
                    <p className="text-xs text-muted-foreground">{fmtNumber(ch.subscriberCount)} inscritos</p>
                  </div>
                  {selectedChannelId === ch.channelId && <CheckCircle2 className="h-5 w-5 text-primary" />}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleConnect} disabled={!selectedChannelId}>{connectChannel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Conectar canal</Button>
              <Button variant="outline" onClick={() => { setOauthStep("idle"); setAvailableChannels([]); }}>Cancelar</Button>
            </div>
          </div>
        )}

        {oauthStep === "picking" && availableChannels.length === 0 && (
          <div className="text-sm text-muted-foreground">Nenhum canal encontrado nesta conta Google.</div>
        )}

        {oauthStep === "connecting" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Conectando canal...</div>
        )}
      </div>

      {isLoading && <div className="space-y-4">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>}

      {!isLoading && (!channels || channels.length === 0) && (
        <div className="rounded-2xl border border-border/30 bg-card/60 p-8 text-center">
          <Youtube className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhum canal conectado</p>
          <p className="text-sm text-muted-foreground mt-1">Clique em "Conectar com Google" acima.</p>
        </div>
      )}

      {channels && channels.length > 0 && (
        <div className="space-y-4">
          {channels.map((ch) => {
            const linkedIds = new Set(ch.projects.map((p) => p.projectId));
            const available = (projects ?? []).filter((p) => !linkedIds.has(p.id));
            return (
              <div key={ch.id} className="rounded-2xl border border-border/30 bg-card/60 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {ch.thumbnailUrl && <img src={ch.thumbnailUrl} alt="" className="h-10 w-10 rounded-full" />}
                    <div>
                      <span className="font-semibold">{ch.channelName}</span>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />{fmtNumber(ch.subscriberCount)} inscritos</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive/70 hover:text-destructive" onClick={() => setDeleteTarget(ch)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {ch.projects.map((p) => (
                    <Badge key={p.projectId} variant="secondary" className="flex items-center gap-1 pr-1">
                      <Link2 className="h-3 w-3" />{p.projectName}
                      <button onClick={() => unlinkProject.mutate({ channelId: ch.id, projectId: p.projectId }, { onSuccess: () => toast.success("Desvinculado.") })} className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"><Unlink className="h-3 w-3 text-destructive/70" /></button>
                    </Badge>
                  ))}
                  {available.length > 0 && (
                    <Select onValueChange={(pid) => linkProject.mutate({ channelId: ch.id, projectId: pid }, { onSuccess: () => toast.success("Vinculado!") })}>
                      <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue placeholder="Vincular projeto..." /></SelectTrigger>
                      <SelectContent>{available.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover canal?</AlertDialogTitle>
            <AlertDialogDescription>O canal <strong>{deleteTarget?.channelName}</strong> sera removido permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTarget) deleteChannel.mutate(deleteTarget.id, { onSuccess: () => { toast.success("Removido."); setDeleteTarget(null); } }); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
