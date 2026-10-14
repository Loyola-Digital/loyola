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
import {
  usePreferenciasDeNotificacao,
  useProjetosSeguidos,
  useSalvarPreferencias,
  useSalvarProjetosSeguidos,
} from "@/lib/hooks/use-alertas";
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

  const { data: prefs } = usePreferenciasDeNotificacao();
  const salvarPrefs = useSalvarPreferencias();

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
    } catch (err) {
      // A mensagem vem da API: sem ela, "não consegui enviar" escondia chave
      // VAPID inválida atrás de um erro que parecia do aparelho.
      setAviso(err instanceof Error ? err.message : "Não consegui enviar.");
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
          <CardTitle>Resumo diário</CardTitle>
          <CardDescription>
            Uma notificação por dia com o fechamento de ontem dos projetos que você segue. Dia sem
            movimento nenhum não vira notificação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!prefs ? (
            <Skeleton className="h-10 w-48" />
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Switch
                  checked={prefs.resumoAtivo}
                  onCheckedChange={(v) =>
                    salvarPrefs.mutate({ resumoAtivo: v, horaDoResumo: prefs.horaDoResumo })
                  }
                />
                <span className="text-sm">Receber o resumo</span>
              </div>
              {prefs.resumoAtivo && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Por volta das</span>
                  <Select
                    value={String(prefs.horaDoResumo)}
                    onValueChange={(v) =>
                      salvarPrefs.mutate({ resumoAtivo: true, horaDoResumo: Number(v) })
                    }
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 14 }, (_, i) => i + 8).map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {String(h).padStart(2, "0")}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regras de alerta</CardTitle>
          <CardDescription>
            Por padrão valem para todos os projetos — cada pessoa recebe só dos que segue. O alerta
            sai no máximo uma vez por dia por regra e por projeto, entre 8h e 22h.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegrasDeAlerta projetos={projetos ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
