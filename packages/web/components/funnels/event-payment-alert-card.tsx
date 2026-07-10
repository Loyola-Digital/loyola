"use client";

import { useEffect, useState } from "react";
import { Bell, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  useEventPaymentAlert,
  useSaveEventPaymentAlert,
  useTestEventPaymentAlert,
  useClickupChatChannels,
  useClickupMembers,
  type PaymentAlertMentionUser,
} from "@/lib/hooks/use-event-payment-alert";

interface EventPaymentAlertCardProps {
  projectId: string;
  funnelId: string;
  stageId: string;
}

/**
 * Story 38.3 — config do alerta diário de pagamentos no chat do ClickUp:
 * todo dia (a partir das 8h, horário de SP), se houver parcela do calendário
 * vencendo, posta no canal escolhido a lista de quem paga hoje, mencionando
 * os colaboradores configurados.
 */
export function EventPaymentAlertCard({ projectId, funnelId, stageId }: EventPaymentAlertCardProps) {
  const { data, isLoading } = useEventPaymentAlert(projectId, funnelId, stageId);
  const save = useSaveEventPaymentAlert(projectId, funnelId, stageId);
  const test = useTestEventPaymentAlert(projectId, funnelId, stageId);

  const clickupOk = data?.clickupConfigured ?? false;
  const { data: channelsData } = useClickupChatChannels(projectId, clickupOk);
  const { data: membersData } = useClickupMembers(projectId, clickupOk);
  const channels = channelsData?.channels ?? [];
  const members = membersData?.members ?? [];

  const [enabled, setEnabled] = useState(true);
  const [channelId, setChannelId] = useState("");
  const [mentionUsers, setMentionUsers] = useState<PaymentAlertMentionUser[]>([]);

  // Hidrata o form quando a config carrega.
  useEffect(() => {
    if (!data?.alert) return;
    setEnabled(data.alert.enabled);
    setChannelId(data.alert.channelId);
    setMentionUsers(data.alert.mentionUsers);
  }, [data?.alert]);

  function toggleMention(user: { id: string; username: string }) {
    setMentionUsers((curr) =>
      curr.some((u) => u.id === user.id)
        ? curr.filter((u) => u.id !== user.id)
        : [...curr, { id: user.id, username: user.username }],
    );
  }

  async function handleSave() {
    if (!channelId) {
      toast.error("Selecione o canal do ClickUp");
      return;
    }
    const channelName = channels.find((c) => c.id === channelId)?.name ?? null;
    try {
      await save.mutateAsync({ enabled, channelId, channelName, mentionUsers });
      toast.success("Alerta de pagamentos salvo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  function handleTest() {
    test.mutate(undefined, {
      onSuccess: (r) => {
        toast.success(
          r.paymentsToday > 0
            ? `Alerta enviado — ${r.paymentsToday} parcela${r.paymentsToday !== 1 ? "s" : ""} de hoje no canal`
            : "Mensagem de teste enviada (nenhuma parcela vence hoje)",
        );
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro no teste"),
    });
  }

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="rounded-lg border border-border/50 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Bell className="h-4 w-4 text-amber-500" />
            Alerta de pagamentos no ClickUp
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Todo dia, a partir das 8h, se houver parcela do calendário vencendo, avisa no canal
            quem deve pagar hoje — mencionando os colaboradores escolhidos.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Label htmlFor="alert-enabled" className="text-xs text-muted-foreground">
            {enabled ? "Ativo" : "Pausado"}
          </Label>
          <Switch id="alert-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      {!clickupOk ? (
        <p className="text-xs text-amber-600">
          ClickUp não configurado no servidor (CLICKUP_API_TOKEN) — peça ao admin.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="alert-channel">Canal do ClickUp</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger id="alert-channel">
                  <SelectValue placeholder={channels.length ? "Selecione o canal" : "Carregando canais..."} />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mencionar colaboradores</Label>
              <div className="max-h-36 overflow-y-auto rounded-md border border-border/40 divide-y divide-border/20">
                {members.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">Carregando membros...</p>
                ) : (
                  members.map((m) => {
                    const checked = mentionUsers.some((u) => u.id === m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMention(m)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="truncate font-medium">{m.username}</span>
                        {m.email && <span className="truncate text-muted-foreground">{m.email}</span>}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleTest}
              disabled={test.isPending || !data?.alert}
              title={data?.alert ? "Envia a mensagem de hoje agora no canal" : "Salve a configuração antes de testar"}
            >
              <Send className="h-3.5 w-3.5" />
              {test.isPending ? "Enviando..." : "Enviar teste agora"}
            </Button>
            {data?.alert?.lastSentDate && (
              <span className="text-[11px] text-muted-foreground">
                Último check: {data.alert.lastSentDate.split("-").reverse().join("/")}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
