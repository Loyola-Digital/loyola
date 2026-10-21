"use client";

import { useState } from "react";
import { Check, Copy, RefreshCw, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  useCriarWebhookLeads,
  useRotacionarWebhookLeads,
  useWebhookLeadsFonte,
  type WebhookLeadsFonte,
} from "@/lib/hooks/use-webhook-leads";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function urlCompleta(fonte: Pick<WebhookLeadsFonte, "path" | "token">): string | null {
  if (!fonte.token) return null;
  return `${API_URL}${fonte.path}?token=${fonte.token}`;
}

interface WebhookLeadsDialogProps {
  projectId: string;
  funnelId: string;
  stageId?: string;
  /** O id da planilha virtual. `null` abre em modo de criação. */
  spreadsheetId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WebhookLeadsDialog({
  projectId, funnelId, stageId, spreadsheetId, open, onOpenChange,
}: WebhookLeadsDialogProps) {
  const [label, setLabel] = useState("Leads por webhook");
  const [copiado, setCopiado] = useState(false);
  // A fonte recém-criada: o POST já devolve a URL, e esperar o GET invalidado
  // deixaria o usuário olhando um esqueleto depois de clicar em Criar.
  const [criada, setCriada] = useState<WebhookLeadsFonte | null>(null);

  const { data, isLoading } = useWebhookLeadsFonte(projectId, funnelId, spreadsheetId);
  const criar = useCriarWebhookLeads(projectId, funnelId);
  const rotacionar = useRotacionarWebhookLeads(projectId, funnelId);

  const fonte = criada ?? data ?? null;
  const url = fonte ? urlCompleta(fonte) : null;

  function fechar() {
    setCriada(null);
    setCopiado(false);
    setLabel("Leads por webhook");
    onOpenChange(false);
  }

  function copiar() {
    if (!url) return;
    navigator.clipboard?.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
    toast.success("URL copiada");
  }

  function handleCriar() {
    if (!label.trim()) return;
    criar.mutate(
      { stageId, label: label.trim() },
      {
        onSuccess: (nova) => {
          setCriada(nova);
          toast.success("Webhook criado. Cole a URL no Mautic.");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar webhook."),
      },
    );
  }

  function handleRotacionar() {
    const id = fonte?.id;
    if (!id) return;
    rotacionar.mutate(id, {
      onSuccess: (nova) => {
        setCriada(nova);
        toast.success("Token trocado. A URL antiga parou de funcionar.");
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao trocar o token."),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) fechar(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-sky-600" />
            Receber leads por webhook
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!spreadsheetId && !criada ? (
            <>
              <p className="text-sm text-muted-foreground">
                O X cria uma URL própria desta etapa. Cada lead enviado para ela entra na
                etapa como se tivesse vindo da planilha — scoring, origem por UTM e envio
                ao Meta seguem iguais.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome da fonte</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ex: Leads Mautic — página de captação"
                  className="h-9 text-sm"
                />
              </div>
            </>
          ) : isLoading && !criada ? (
            <div className="space-y-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-16" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">URL para colar no Mautic (ou no n8n)</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={url ?? "Sem permissão para ver o token desta fonte."}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 font-mono text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={copiar} disabled={!url}>
                    {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border/30 bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium">Campos aceitos</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <code>nome</code>, <code>email</code>, <code>telefone</code> e as cinco UTMs
                  (<code>utm_source</code>, <code>utm_medium</code>, <code>utm_campaign</code>,{" "}
                  <code>utm_content</code>, <code>utm_term</code>) — como formulário ou como
                  JSON. UTM em branco entra como vazia, não como origem desconhecida. A data
                  do lead é a hora em que ele chega. E-mail repetido dentro de um minuto conta
                  como reenvio e é ignorado.
                </p>
              </div>

              {fonte && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {fonte.recebidos} {fonte.recebidos === 1 ? "lead recebido" : "leads recebidos"}
                    {fonte.ultimoEm
                      ? ` · último em ${new Date(fonte.ultimoEm).toLocaleString("pt-BR")}`
                      : ""}
                  </span>
                  {fonte.token && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5 text-xs"
                      onClick={handleRotacionar}
                      disabled={rotacionar.isPending}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Trocar token
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {!spreadsheetId && !criada ? (
            <>
              <Button variant="outline" size="sm" onClick={fechar}>Cancelar</Button>
              <Button size="sm" onClick={handleCriar} disabled={!label.trim() || criar.isPending}>
                {criar.isPending ? "Criando..." : "Criar webhook"}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={fechar}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
