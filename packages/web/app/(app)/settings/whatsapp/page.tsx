"use client";

/**
 * Conexão com o SendFlow — a operação de WhatsApp.
 *
 * Vive aqui, e não por projeto, porque é UMA conta atendendo todos os experts.
 * Mesma razão da aba Analytics.
 */

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSendflowGlobalConnection,
  useConectarSendflow,
  useDeleteSendflowGlobalConnection,
} from "@/lib/hooks/use-sendflow";

/**
 * Avisa o resultado da volta do OAuth.
 *
 * Componente separado e sob <Suspense> porque `useSearchParams` obriga a isso
 * no Next — sem a fronteira, o build falha ao pré-renderizar a página.
 */
function AvisoDoRetorno() {
  const params = useSearchParams();
  const resultado = params.get("sendflow");
  const motivo = params.get("motivo");
  useEffect(() => {
    if (resultado === "ok") toast.success("SendFlow conectado");
    if (resultado === "erro") toast.error(motivo || "Não consegui conectar ao SendFlow");
  }, [resultado, motivo]);
  return null;
}

export default function WhatsappSettingsPage() {
  const { data, isLoading } = useSendflowGlobalConnection();
  const conectar = useConectarSendflow();
  const remover = useDeleteSendflowGlobalConnection();


  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <AvisoDoRetorno />
      </Suspense>
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
            O SendFlow só autoriza por navegador — não emite chave de API. Clique em conectar,
            faça login lá, e pronto: o Loyola X registra o próprio acesso e o renova sozinho daí
            em diante.
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

              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" disabled={conectar.isPending} onClick={() => conectar.mutate()}>
                  {conectar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {data?.connected ? "Reconectar" : "Conectar com o SendFlow"}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Abre o login do SendFlow. Você autoriza uma vez e o Loyola X cuida do resto —
                  não precisa copiar token nenhum.
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
