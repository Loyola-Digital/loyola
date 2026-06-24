"use client";

import { useState } from "react";
import { Loader2, GraduationCap, Plug, Unlink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  useMemberkitConnection,
  useSetMemberkitConnection,
  useDeleteMemberkitConnection,
} from "@/lib/hooks/use-memberkit";

// Story 19.11 — painel de conexão MemberKit (área de membros) por projeto.
// A API key fica na config do projeto; a turma de matrícula é escolhida na etapa
// de Evento Presencial.

interface Props {
  projectId: string;
  isAdmin: boolean;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function MemberkitConnectionPanel({ projectId, isAdmin }: Props) {
  const conn = useMemberkitConnection(projectId);
  const connected = conn.data?.connected === true;

  return (
    <section className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">MemberKit — Área de Membros</h2>
        {connected && <Badge variant="secondary" className="text-[10px]">Conectado</Badge>}
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
          Integração MemberKit não configurada. Peça a um administrador do projeto para conectar.
        </p>
      )}
    </section>
  );
}

function ConnectionForm({ projectId }: { projectId: string }) {
  const setConn = useSetMemberkitConnection(projectId);
  const [apiKey, setApiKey] = useState("");

  function handleSave() {
    if (!apiKey.trim()) {
      toast.error("Preencha a API key do MemberKit.");
      return;
    }
    setConn.mutate(
      { apiKey: apiKey.trim() },
      {
        onSuccess: () => {
          toast.success("MemberKit conectado!");
          setApiKey(""); // nunca persistir a key no estado após sucesso
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Conecte a credencial do MemberKit deste projeto. Pegue a <strong>API key</strong> em{" "}
        <strong>Configurações da conta</strong> no painel do MemberKit. A key é por projeto e fica
        criptografada — nunca é exibida de volta. Depois, escolha a turma de matrícula na etapa de{" "}
        <strong>Evento Presencial</strong>.
      </p>
      <div className="space-y-1 max-w-md">
        <Label htmlFor="memberkit-api-key" className="text-xs">API key</Label>
        <Input
          id="memberkit-api-key"
          type="password"
          placeholder="••••••••••••••••"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
      </div>
      <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={setConn.isPending}>
        {setConn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
        Conectar
      </Button>
    </div>
  );
}

function ConnectedHeader({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const del = useDeleteMemberkitConnection(projectId);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">Credencial MemberKit ativa</p>
        <p className="text-[10px] text-muted-foreground truncate">
          Conectado · matrícula automática ao lançar venda no Evento Presencial
        </p>
      </div>
      {isAdmin && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1 text-[10px] text-muted-foreground hover:text-red-500 shrink-0"
          onClick={() =>
            del.mutate(undefined, {
              onSuccess: () => toast.success("MemberKit desconectado"),
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
