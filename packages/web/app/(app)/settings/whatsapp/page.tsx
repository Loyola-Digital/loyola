"use client";

/**
 * Conexão com o SendFlow — a operação de WhatsApp.
 *
 * Vive aqui, e não por projeto, porque é UMA conta atendendo todos os experts.
 * Mesma razão da aba Analytics.
 */

import { useState } from "react";
import { MessageSquare, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSendflowGlobalConnection,
  useSaveSendflowGlobalConnection,
  useDeleteSendflowGlobalConnection,
} from "@/lib/hooks/use-sendflow";

export default function WhatsappSettingsPage() {
  const { data, isLoading } = useSendflowGlobalConnection();
  const salvar = useSaveSendflowGlobalConnection();
  const remover = useDeleteSendflowGlobalConnection();

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");

  const preenchido = clientId.trim() && clientSecret.trim() && refreshToken.trim();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MessageSquare className="h-6 w-6 text-emerald-600" />
          WhatsApp (SendFlow)
        </h1>
        <p className="text-sm text-muted-foreground">
          Uma conta atende todos os experts — por isso a conexão fica aqui, e não em cada projeto.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conexão</CardTitle>
          <CardDescription>
            O SendFlow não emite chave de API: o servidor só aceita autorização por navegador
            (<code className="text-xs">authorization_code</code>). Autorize uma vez, cole o
            refresh token aqui e o Loyola X renova o acesso sozinho daí em diante.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-24" />
          ) : (
            <>
              {data?.connected && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                  <div className="min-w-0 text-xs">
                    <p className="font-medium text-emerald-700 dark:text-emerald-400">Conectado</p>
                    <p className="truncate text-muted-foreground">
                      client <code className="text-[10px]">{data.clientId}</code>
                      {data.updatedAt
                        ? ` · atualizado em ${new Date(data.updatedAt).toLocaleDateString("pt-BR")}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                    disabled={remover.isPending}
                    onClick={() =>
                      remover.mutate(undefined, {
                        onSuccess: () => toast.success("Conexão removida"),
                        onError: (e) =>
                          toast.error(e instanceof Error ? e.message : "Erro ao remover"),
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Desconectar
                  </Button>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Client ID</Label>
                  <Input
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="mcp_client_…"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Client Secret</Label>
                  <Input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="mcp_secret_…"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Refresh Token</Label>
                  <Input
                    type="password"
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  disabled={!preenchido || salvar.isPending}
                  onClick={() =>
                    salvar.mutate(
                      {
                        clientId: clientId.trim(),
                        clientSecret: clientSecret.trim(),
                        refreshToken: refreshToken.trim(),
                      },
                      {
                        onSuccess: () => {
                          toast.success(data?.connected ? "Conexão atualizada" : "SendFlow conectado");
                          setClientSecret("");
                          setRefreshToken("");
                        },
                        onError: (e) =>
                          toast.error(e instanceof Error ? e.message : "Não consegui conectar"),
                      },
                    )
                  }
                >
                  {salvar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {data?.connected ? "Atualizar conexão" : "Conectar"}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  As credenciais são validadas contra o SendFlow antes de gravar, e ficam
                  criptografadas no banco.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que a integração faz</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Todo dia de manhã o Loyola X coleta, para cada funil que casa com uma campanha do
            SendFlow: quantas pessoas estão nos grupos, entradas, saídas e cliques — e registra os
            disparos no Log de Campanha. Isso substitui a planilha que era exportada à mão.
          </p>
          <p>
            O casamento usa o código do funil (o mesmo do Mautic). Se uma campanha não aparecer,
            confira se o nome dela no SendFlow contém esse código.
          </p>
          <p className="text-xs">
            Limite conhecido: o SendFlow não expõe o <strong>texto</strong> das mensagens enviadas.
            O log registra data, hora e status de cada disparo, não o conteúdo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
