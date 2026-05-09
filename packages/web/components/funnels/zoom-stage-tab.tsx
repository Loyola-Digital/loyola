"use client";

import { useState } from "react";
import { Plus, Trash2, Unlink, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  useZoomConnection,
  useSetZoomConnection,
  useDeleteZoomConnection,
  useZoomLinkedMeetings,
  useLinkZoomMeeting,
  useUnlinkZoomMeeting,
  useZoomPastMeetings,
  useZoomMeetingParticipants,
  type ZoomLinkedMeeting,
} from "@/lib/hooks/use-zoom-stage";

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
}

function fmtDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function ZoomStageTab({ projectId, funnelId, stageId }: Props) {
  const conn = useZoomConnection(projectId, funnelId, stageId);

  if (conn.isLoading) return <Skeleton className="h-32" />;
  if (!conn.data?.connected) {
    return <ZoomConnectionForm projectId={projectId} funnelId={funnelId} stageId={stageId} />;
  }

  return (
    <ZoomConnectedView
      projectId={projectId}
      funnelId={funnelId}
      stageId={stageId}
      accountId={conn.data.accountId ?? ""}
      clientId={conn.data.clientId ?? ""}
    />
  );
}

function ZoomConnectionForm({ projectId, funnelId, stageId }: Props) {
  const setConn = useSetZoomConnection(projectId, funnelId, stageId);
  const [accountId, setAccountId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  async function handleSave() {
    if (!accountId.trim() || !clientId.trim() || !clientSecret.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    try {
      await setConn.mutateAsync({
        accountId: accountId.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      toast.success("Zoom conectado");
      setClientSecret("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conectar");
    }
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4 space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <Video className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-semibold">Conectar Zoom</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Crie um app <strong>Server-to-Server OAuth</strong> em <a href="https://marketplace.zoom.us" target="_blank" rel="noreferrer" className="underline">marketplace.zoom.us</a> com scope <code className="font-mono text-[10px] bg-muted/50 px-1 rounded">report:read:list_meeting_participants:admin</code>. Reports API requer plano Pro+.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="zoom-account">Account ID</Label>
          <Input id="zoom-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="zoom-client">Client ID</Label>
          <Input id="zoom-client" value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="zoom-secret">Client Secret</Label>
          <Input id="zoom-secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={setConn.isPending}>
          {setConn.isPending ? "Validando..." : "Conectar"}
        </Button>
      </div>
    </div>
  );
}

function ZoomConnectedView({
  projectId,
  funnelId,
  stageId,
  accountId,
  clientId,
}: Props & { accountId: string; clientId: string }) {
  const linked = useZoomLinkedMeetings(projectId, funnelId, stageId);
  const unlink = useUnlinkZoomMeeting(projectId, funnelId, stageId);
  const deleteConn = useDeleteZoomConnection(projectId, funnelId, stageId);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const meetings = linked.data?.meetings ?? [];
  const selected = meetings.find((m) => m.id === selectedRowId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Conectado · Account: <code className="font-mono">{accountId}</code></p>
          <p className="text-[10px] text-muted-foreground">Client ID: <code className="font-mono">{clientId.slice(0, 8)}...</code></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Vincular reunião
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)} className="gap-1.5 text-destructive hover:text-destructive">
            <Unlink className="h-3.5 w-3.5" />
            Desconectar
          </Button>
        </div>
      </div>

      {linked.isLoading ? (
        <Skeleton className="h-32" />
      ) : meetings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma reunião vinculada.</p>
          <p className="text-xs text-muted-foreground mt-1">Use &quot;Vincular reunião&quot; pra adicionar a primeira.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {meetings.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedRowId(m.id)}
              className={`text-left rounded-lg border p-3 space-y-1 hover:bg-muted/30 transition-colors ${selectedRowId === m.id ? "border-primary/50 bg-primary/5" : "border-border/50"}`}
            >
              <p className="text-sm font-medium truncate">{m.label || m.topic || `Meeting ${m.meetingId}`}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {m.topic && m.topic !== m.label ? m.topic + " · " : ""}
                {m.startTime ? fmtTime(m.startTime) : "—"}
                {m.durationMinutes ? ` · ${m.durationMinutes}min` : ""}
              </p>
              <div className="flex items-center justify-between pt-1">
                <code className="font-mono text-[10px] text-muted-foreground">ID {m.meetingId}</code>
                <button
                  type="button"
                  className="text-destructive/70 hover:text-destructive p-0.5"
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(m.id); }}
                  aria-label="Desvincular"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <ZoomMeetingDashboard
          projectId={projectId}
          funnelId={funnelId}
          stageId={stageId}
          meeting={selected}
        />
      )}

      <ZoomLinkMeetingDialog
        projectId={projectId}
        funnelId={funnelId}
        stageId={stageId}
        open={linkOpen}
        onOpenChange={setLinkOpen}
      />

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular reunião?</AlertDialogTitle>
            <AlertDialogDescription>A reunião será desvinculada desta etapa. Os dados no Zoom não são afetados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDeleteId) return;
                await unlink.mutateAsync(confirmDeleteId);
                if (selectedRowId === confirmDeleteId) setSelectedRowId(null);
                toast.success("Reunião desvinculada");
                setConfirmDeleteId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar Zoom?</AlertDialogTitle>
            <AlertDialogDescription>Credenciais e reuniões vinculadas serão removidas. Não afeta o Zoom.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await deleteConn.mutateAsync();
                toast.success("Zoom desconectado");
                setConfirmDisconnect(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ZoomLinkMeetingDialog({
  projectId,
  funnelId,
  stageId,
  open,
  onOpenChange,
}: Props & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const past = useZoomPastMeetings(projectId, funnelId, stageId, open);
  const link = useLinkZoomMeeting(projectId, funnelId, stageId);
  const [meetingId, setMeetingId] = useState("");
  const [label, setLabel] = useState("");

  async function handleLink() {
    if (!meetingId.trim()) {
      toast.error("Selecione ou cole um Meeting ID");
      return;
    }
    try {
      await link.mutateAsync({ meetingId: meetingId.trim(), label: label.trim() || undefined });
      toast.success("Reunião vinculada");
      setMeetingId("");
      setLabel("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao vincular");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Vincular reunião Zoom</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1">
          {past.isLoading ? (
            <Skeleton className="h-32" />
          ) : past.data?.meetings && past.data.meetings.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reuniões passadas — clica pra selecionar</p>
              <div className="border border-border/30 rounded-lg max-h-72 overflow-y-auto">
                {past.data.meetings.map((m) => (
                  <button
                    key={m.uuid}
                    type="button"
                    onClick={() => {
                      setMeetingId(m.id);
                      if (!label) setLabel(m.topic);
                    }}
                    className={`w-full text-left p-2 hover:bg-muted/30 border-b border-border/10 last:border-0 ${meetingId === m.id ? "bg-primary/5" : ""}`}
                  >
                    <p className="text-xs font-medium truncate">{m.topic}</p>
                    <p className="text-[10px] text-muted-foreground">
                      ID {m.id} · {fmtTime(m.startTime)} · {m.durationMinutes}min
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : past.error ? (
            <p className="text-xs text-destructive">{past.error instanceof Error ? past.error.message : "Erro ao listar"}</p>
          ) : null}

          <div className="space-y-2 pt-2 border-t border-border/30">
            <div className="space-y-1">
              <Label htmlFor="link-meeting-id">Meeting ID</Label>
              <Input
                id="link-meeting-id"
                value={meetingId}
                onChange={(e) => setMeetingId(e.target.value)}
                placeholder="ex: 81796649087"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="link-label">Label (opcional)</Label>
              <Input
                id="link-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ex: CPL Aula 1 — 02/05"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleLink} disabled={link.isPending || !meetingId.trim()}>
            {link.isPending ? "Vinculando..." : "Vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZoomMeetingDashboard({
  projectId,
  funnelId,
  stageId,
  meeting,
}: Props & { meeting: ZoomLinkedMeeting }) {
  const participants = useZoomMeetingParticipants(projectId, funnelId, stageId, meeting.id);

  if (participants.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (participants.error) {
    return (
      <p className="text-xs text-destructive">
        {participants.error instanceof Error ? participants.error.message : "Erro ao buscar participantes"}
      </p>
    );
  }

  const data = participants.data;
  if (!data || data.participants.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum participante retornado.</p>;
  }

  const meetingDuration = data.participants.reduce((acc, p) => Math.max(acc, p.durationSeconds), 0);
  const avgRetention =
    data.participants.length > 0
      ? data.participants.reduce((acc, p) => acc + p.durationSeconds, 0) / data.participants.length
      : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{meeting.label || meeting.topic || `Meeting ${meeting.meetingId}`}</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
          {data.source === "webinar" ? "Webinar" : "Meeting"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat label="Participantes" value={String(data.total)} />
        <Stat label="Tempo médio" value={fmtDuration(Math.round(avgRetention))} />
        <Stat label="Maior duração" value={fmtDuration(meetingDuration)} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/30">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Nome</th>
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Entrou</th>
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Saiu</th>
              <th className="text-right py-2 px-3 font-medium text-muted-foreground">Duração</th>
              <th className="text-right py-2 px-3 font-medium text-muted-foreground">Retenção</th>
            </tr>
          </thead>
          <tbody>
            {data.participants.map((p, i) => {
              const ret = meetingDuration > 0 ? (p.durationSeconds / meetingDuration) * 100 : 0;
              return (
                <tr key={`${p.id ?? p.name}-${i}`} className="border-t border-border/10">
                  <td className="py-2 px-3 font-medium">{p.name || "—"}</td>
                  <td className="py-2 px-3 text-muted-foreground">{p.email ?? "—"}</td>
                  <td className="py-2 px-3 text-muted-foreground">{fmtTime(p.joinTime)}</td>
                  <td className="py-2 px-3 text-muted-foreground">{fmtTime(p.leaveTime)}</td>
                  <td className="py-2 px-3 text-right">{fmtDuration(p.durationSeconds)}</td>
                  <td className="py-2 px-3 text-right">
                    <span className={ret > 80 ? "text-emerald-600 font-medium" : ret > 50 ? "text-amber-600" : "text-muted-foreground"}>
                      {ret.toFixed(0)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
