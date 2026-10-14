"use client";

import { useState } from "react";
import { Bell, BellOff, Smartphone } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePush } from "@/lib/hooks/use-push";

export default function NotificacoesSettingsPage() {
  const { suportado, permissao, inscrito, precisaInstalar, carregando, erro, ativar, desativar, testar } =
    usePush();
  const [aviso, setAviso] = useState<string | null>(null);

  async function aoTestar() {
    setAviso(null);
    try {
      await testar();
      setAviso("Mandei. Se não chegar em alguns segundos, confira as notificações nos ajustes do aparelho.");
    } catch {
      setAviso("Não consegui enviar. Ative a notificação neste aparelho primeiro.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações neste aparelho
          </CardTitle>
          <CardDescription>
            Alertas dos funis e o resumo diário chegam como notificação do celular. É por aparelho:
            ligar aqui não liga no seu computador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {carregando ? (
            <Skeleton className="h-10 w-48" />
          ) : precisaInstalar ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
              No iPhone a notificação só funciona com o app instalado. Toque em Compartilhar →
              &ldquo;Adicionar à Tela de Início&rdquo;, abra o Loyola X por lá e volte nesta tela.
            </p>
          ) : !suportado ? (
            <p className="text-sm text-muted-foreground">
              Este navegador não tem notificação push. Tente pelo Chrome no Android ou pelo app
              instalado no iPhone.
            </p>
          ) : permissao === "denied" ? (
            <p className="text-sm text-muted-foreground">
              A notificação está bloqueada para este site. Dá para liberar nos ajustes do navegador
              — no cadeado ao lado do endereço — e voltar aqui.
            </p>
          ) : inscrito ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">Ativas neste aparelho.</span>
              <Button variant="outline" size="sm" onClick={aoTestar}>
                Mandar um teste
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void desativar()}>
                <BellOff className="mr-2 h-4 w-4" />
                Desligar
              </Button>
            </div>
          ) : (
            <Button onClick={() => void ativar()}>
              <Bell className="mr-2 h-4 w-4" />
              Ativar neste aparelho
            </Button>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
