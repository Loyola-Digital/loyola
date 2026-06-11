"use client";

import { useState } from "react";
import { Loader2, CreditCard, Plug, Unlink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  useHotmartConnection,
  useSetHotmartConnection,
  useDeleteHotmartConnection,
} from "@/lib/hooks/use-hotmart";
import { SubscriptionsDashboard } from "@/components/subscriptions/subscriptions-dashboard";

interface Props {
  projectId: string;
  isAdmin: boolean;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function HotmartConnectionPanel({ projectId, isAdmin }: Props) {
  const conn = useHotmartConnection(projectId);
  const connected = conn.data?.connected === true;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Hotmart — Assinaturas</h2>
          {connected && (
            <Badge variant="secondary" className="text-[10px]">Conectado</Badge>
          )}
        </div>

        {conn.isLoading ? (
          <Skeleton className="h-24" />
        ) : conn.isError ? (
          <div className="flex items-center gap-2 text-xs text-red-500">
            <span>Erro ao carregar conexão.</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={() => conn.refetch()}
            >
              <RefreshCw className="h-3 w-3" /> Tentar de novo
            </Button>
          </div>
        ) : connected ? (
          <ConnectedHeader projectId={projectId} isAdmin={isAdmin} />
        ) : isAdmin ? (
          <ConnectionForm projectId={projectId} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Integração Hotmart não configurada. Peça a um administrador do projeto para conectar.
          </p>
        )}
      </section>

      {/* Dashboard de assinaturas (Story 34.5) — leitura para todos com acesso */}
      {connected && !conn.isError && (
        <SubscriptionsDashboard projectId={projectId} />
      )}

      {/* Kiwify — stub "em breve", puramente decorativo, sem rede */}
      <KiwifyStub />
    </div>
  );
}

function ConnectionForm({ projectId }: { projectId: string }) {
  const setConn = useSetHotmartConnection(projectId);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  function handleSave() {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Preencha Client ID e Client Secret.");
      return;
    }
    setConn.mutate(
      { clientId: clientId.trim(), clientSecret: clientSecret.trim() },
      {
        onSuccess: () => {
          toast.success("Hotmart conectado!");
          // Limpa o secret do estado local após sucesso — nunca persistir em memória.
          setClientSecret("");
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Conecte a credencial da Hotmart deste projeto. Gere um app em{" "}
        <strong>Ferramentas → Credenciais</strong> no painel da Hotmart e copie o{" "}
        <strong>Client ID</strong> e o <strong>Client Secret</strong>. A credencial é por projeto
        e fica criptografada — o secret nunca é exibido de volta.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="hotmart-client-id" className="text-xs">Client ID</Label>
          <Input
            id="hotmart-client-id"
            type="text"
            placeholder="ex: a1b2c3d4-..."
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hotmart-client-secret" className="text-xs">Client Secret</Label>
          <Input
            id="hotmart-client-secret"
            type="password"
            placeholder="••••••••••••••••"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={setConn.isPending}>
        {setConn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
        Conectar
      </Button>
    </div>
  );
}

function ConnectedHeader({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const del = useDeleteHotmartConnection(projectId);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">Credencial Hotmart ativa</p>
        <p className="text-[10px] text-muted-foreground truncate">
          Conectado · assinaturas sincronizadas por produto
        </p>
      </div>
      {isAdmin && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1 text-[10px] text-muted-foreground hover:text-red-500 shrink-0"
          onClick={() =>
            del.mutate(undefined, {
              onSuccess: () => toast.success("Hotmart desconectado"),
              onError: (e) => toast.error(errMsg(e)),
            })
          }
          disabled={del.isPending}
        >
          {del.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
          Desconectar
        </Button>
      )}
    </div>
  );
}

/** Kiwify — placeholder visual desabilitado. Não dispara nenhuma chamada de rede. */
function KiwifyStub() {
  return (
    <section
      aria-disabled="true"
      className="rounded-xl border border-dashed border-border/40 bg-card/30 p-4 space-y-1 opacity-50 pointer-events-none select-none"
    >
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold text-muted-foreground">Kiwify</h2>
        <Badge variant="outline" className="text-[10px]">em breve</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        A integração com a Kiwify chega em breve. Em breve você poderá conectar a credencial e ver
        as assinaturas da Kiwify aqui também.
      </p>
    </section>
  );
}
