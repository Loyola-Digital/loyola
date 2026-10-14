"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Smartphone } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePush } from "@/lib/hooks/use-push";
import { useProjects } from "@/lib/hooks/use-projects";
import { useProjetosSeguidos, useSalvarProjetosSeguidos } from "@/lib/hooks/use-alertas";
import { RegrasDeAlerta } from "@/components/notificacoes/regras-de-alerta";

export default function NotificacoesSettingsPage() {
  const {
    suportado,
    permissao,
    inscrito,
    precisaInstalar,
    carregando,
    erro,
    ativar,
    desativar,
    testar,
  } = usePush();
  const [aviso, setAviso] = useState<string | null>(null);

  const { data: projetos, isLoading: carregandoProjetos } = useProjects();
  const { data: seguidos } = useProjetosSeguidos();
  const salvarSeguidos = useSalvarProjetosSeguidos();
  const [marcados, setMarcados] = useState<string[] | null>(null);
  const [projetoDasRegras, setProjetoDasRegras] = useState<string>("");

  // A lista do servidor é a verdade até a pessoa mexer; depois disso quem manda
  // é o rascunho local, senão cada salvamento piscaria o estado antigo.
  useEffect(() => {
    if (seguidos && marcados === null) setMarcados(seguidos.projectIds);
  }, [seguidos, marcados]);

  async function aoTestar() {
    setAviso(null);
    try {
      await testar();
      setAviso("Mandei. Se não chegar em alguns segundos, confira as notificações nos ajustes do aparelho.");
    } catch {
      setAviso("Não consegui enviar. Ative a notificação neste aparelho primeiro.");
    }
  }

  function alternar(projectId: string, ligado: boolean) {
    const atual = marcados ?? [];
    const novo = ligado ? [...atual, projectId] : atual.filter((p) => p !== projectId);
    setMarcados(novo);
    salvarSeguidos.mutate(novo);
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
            Alertas dos funis chegam como notificação do celular. É por aparelho: ligar aqui não
            liga no seu computador.
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

      <Card>
        <CardHeader>
          <CardTitle>Projetos que eu sigo</CardTitle>
          <CardDescription>
            Você só recebe alerta dos projetos marcados aqui. Vale para todos os seus aparelhos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {carregandoProjetos || marcados === null ? (
            <Skeleton className="h-20 w-full" />
          ) : projetos?.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum projeto disponível.</p>
          ) : (
            projetos?.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3">
                <span className="text-sm">{p.name}</span>
                <Switch
                  checked={marcados.includes(p.id)}
                  onCheckedChange={(v) => alternar(p.id, v)}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regras de alerta</CardTitle>
          <CardDescription>
            Valem para todo mundo que segue o projeto. O alerta sai no máximo uma vez por dia por
            regra, entre 8h e 22h.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={projetoDasRegras} onValueChange={setProjetoDasRegras}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="Escolha o projeto" />
            </SelectTrigger>
            <SelectContent>
              {projetos?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {projetoDasRegras && <RegrasDeAlerta projectId={projetoDasRegras} />}
        </CardContent>
      </Card>
    </div>
  );
}
