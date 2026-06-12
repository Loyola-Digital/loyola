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
  useKiwifyConnection,
  useSetKiwifyConnection,
  useDeleteKiwifyConnection,
} from "@/lib/hooks/use-kiwify";
import { KiwifySubscriptionsDashboard } from "@/components/subscriptions/kiwify-subscriptions-dashboard";

// Story 35.4 — Painel de conexão Kiwify (Assinaturas / recorrência).
// Espelha hotmart-connection-panel.tsx (34.4) com +1 campo (account_id).
// SEGURANÇA: o client_secret nunca é exibido de volta; é limpo do estado local
// após sucesso. O GET de conexão devolve apenas { connected }.

interface Props {
  projectId: string;
  isAdmin: boolean;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function KiwifyConnectionPanel({ projectId, isAdmin }: Props) {
  const conn = useKiwifyConnection(projectId);
  const connected = conn.data?.connected === true;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Kiwify — Assinaturas</h2>
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
            Integração Kiwify não configurada. Peça a um administrador do projeto para conectar.
          </p>
        )}
      </section>

      {/* Dashboard de recorrência (Story 35.5) — leitura para todos com acesso.
          KiwifySubscriptionsDashboard é um placeholder nesta story; a 35.5 o substitui. */}
      {connected && !conn.isError && (
        <KiwifySubscriptionsDashboard projectId={projectId} />
      )}
    </div>
  );
}

function ConnectionForm({ projectId }: { projectId: string }) {
  const setConn = useSetKiwifyConnection(projectId);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [accountId, setAccountId] = useState("");

  function handleSave() {
    if (!clientId.trim() || !clientSecret.trim() || !accountId.trim()) {
      toast.error("Preencha Client ID, Client Secret e Account ID.");
      return;
    }
    setConn.mutate(
      {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        accountId: accountId.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Kiwify conectado!");
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
        Conecte a credencial da Kiwify deste projeto. No painel da Kiwify, vá em{" "}
        <strong>Apps → API (Credenciais)</strong> e gere o <strong>Client ID</strong> e o{" "}
        <strong>Client Secret</strong>. O <strong>Account ID</strong> é o identificador da sua
        loja (store-id) — aparece na URL do painel e nas configurações da conta. A credencial é
        por projeto e fica criptografada — o secret nunca é exibido de volta.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="kiwify-client-id" className="text-xs">Client ID</Label>
          <Input
            id="kiwify-client-id"
            type="text"
            placeholder="ex: a1b2c3d4-..."
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kiwify-client-secret" className="text-xs">Client Secret</Label>
          <Input
            id="kiwify-client-secret"
            type="password"
            placeholder="••••••••••••••••"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kiwify-account-id" className="text-xs">Account ID (store-id)</Label>
          <Input
            id="kiwify-account-id"
            type="text"
            placeholder="ex: a1b2c3d4-..."
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
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
  const del = useDeleteKiwifyConnection(projectId);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">Credencial Kiwify ativa</p>
        <p className="text-[10px] text-muted-foreground truncate">
          Conectado · recorrência sincronizada por produto
        </p>
      </div>
      {isAdmin && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1 text-[10px] text-muted-foreground hover:text-red-500 shrink-0"
          onClick={() =>
            del.mutate(undefined, {
              onSuccess: () => toast.success("Kiwify desconectado"),
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
