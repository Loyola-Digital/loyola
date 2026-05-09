"use client";

import { useState } from "react";
import { Loader2, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { toast } from "sonner";

interface ZoomParticipant {
  id: string | null;
  name: string;
  email: string | null;
  joinTime: string | null;
  leaveTime: string | null;
  durationSeconds: number;
  status: string | null;
}

interface ZoomResponse {
  participants: ZoomParticipant[];
  total: number;
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

export default function ZoomPocPage() {
  const apiClient = useApiClient();
  const [accountId, setAccountId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ZoomResponse | null>(null);

  const meetingDuration = data?.participants.reduce((acc, p) => Math.max(acc, p.durationSeconds), 0) ?? 0;

  async function handleSubmit() {
    if (!accountId.trim() || !clientId.trim() || !clientSecret.trim() || !meetingId.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    setLoading(true);
    try {
      const result = await apiClient<ZoomResponse>("/api/zoom-poc/participants", {
        method: "POST",
        body: JSON.stringify({
          accountId: accountId.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          meetingId: meetingId.trim(),
        }),
      });
      setData(result);
      toast.success(`${result.total} participantes encontrados`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          POC — Zoom Meeting Participants
        </h1>
        <p className="text-sm text-muted-foreground">
          Prova de conceito: gera token Server-to-Server OAuth e busca participantes de uma reunião encerrada via Reports API. Credenciais não são persistidas.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-lg border border-border/50 bg-card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="zoom-account-id">Account ID</Label>
            <Input
              id="zoom-account-id"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="abc123XYZ..."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="zoom-meeting-id">Meeting UUID</Label>
            <Input
              id="zoom-meeting-id"
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              placeholder="UUID da reunião encerrada"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="zoom-client-id">Client ID</Label>
            <Input
              id="zoom-client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="zoom-client-secret">Client Secret</Label>
            <Input
              id="zoom-client-secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={loading} className="gap-1.5">
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <Users className="h-3.5 w-3.5" />
                Buscar participantes
              </>
            )}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Crie um app <strong>Server-to-Server OAuth</strong> em https://marketplace.zoom.us com scopes <code className="font-mono">report:read:list_meeting_participants:admin</code>. Reports API requer plano Pro+.
        </p>
      </div>

      {/* Results */}
      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-32" />
        </div>
      )}

      {data && !loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat label="Participantes (total entries)" value={String(data.total)} />
            <Stat label="Únicos por nome" value={String(new Set(data.participants.map((p) => p.name)).size)} />
            <Stat label="Maior duração" value={fmtDuration(meetingDuration)} />
          </div>

          {data.participants.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum participante retornado.</p>
          ) : (
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
                    const retention = meetingDuration > 0 ? (p.durationSeconds / meetingDuration) * 100 : 0;
                    return (
                      <tr key={`${p.id ?? p.name}-${i}`} className="border-t border-border/10">
                        <td className="py-2 px-3 font-medium">{p.name || "—"}</td>
                        <td className="py-2 px-3 text-muted-foreground">{p.email ?? "—"}</td>
                        <td className="py-2 px-3 text-muted-foreground">{fmtTime(p.joinTime)}</td>
                        <td className="py-2 px-3 text-muted-foreground">{fmtTime(p.leaveTime)}</td>
                        <td className="py-2 px-3 text-right">{fmtDuration(p.durationSeconds)}</td>
                        <td className="py-2 px-3 text-right">
                          <span className={retention > 80 ? "text-emerald-600 font-medium" : retention > 50 ? "text-amber-600" : "text-muted-foreground"}>
                            {retention.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
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
