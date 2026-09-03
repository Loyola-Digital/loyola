"use client";

/**
 * Todos os mapas de funil, num lugar só.
 *
 * Os mapas vivem dentro de uma etapa de um funil de um projeto — três níveis
 * de navegação para chegar num desenho. Aqui eles ficam lado a lado, e o
 * editor abre na própria tela: quem quer comparar dois funis não deveria ter
 * que sair do lugar para isso.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Map as MapIcon,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FunnelMapCanvas } from "@/components/funnels/funnel-map/funnel-map-canvas";
import { MapaMiniatura } from "@/components/funnels/funnel-map/mapa-miniatura";
import { NovoMapaDialog } from "@/components/funnels/funnel-map/novo-mapa-dialog";
import {
  useExcluirMapaAvulso,
  useFunnelMapsGlobal,
  type MapaNaLista,
} from "@/lib/hooks/use-funnel-maps-global";
import { useUserRole } from "@/lib/hooks/use-user-role";

function quando(iso: string | null): string {
  if (!iso) return "nunca salvo";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function FunnelMapsPage() {
  const role = useUserRole();
  const { data, isLoading } = useFunnelMapsGlobal();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<MapaNaLista | null>(null);
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [aExcluir, setAExcluir] = useState<MapaNaLista | null>(null);
  const excluir = useExcluirMapaAvulso();

  const mapas = data?.mapas ?? [];
  const arquivados = mapas.filter((m) => m.arquivado).length;

  const filtrados = useMemo(() => {
    const alvo = busca.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return mapas
      .filter((m) => mostrarArquivados || !m.arquivado)
      .filter((m) => {
        if (!alvo) return true;
        const texto = `${m.projectName} ${m.funnelName} ${m.stageName}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return texto.includes(alvo);
      });
  }, [mapas, busca, mostrarArquivados]);

  // O editor salva sozinho, e o PUT recusa guest: sem este corte, um convidado
  // abriria o mapa e cada auto-save levaria 403 sem ele entender por quê.
  if (role === "guest") {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Os mapas de funil são restritos à equipe interna.
        </p>
      </div>
    );
  }

  if (aberto) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={() => setAberto(null)}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Todos os mapas
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {aberto.funnelName} · {aberto.stageName}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{aberto.projectName}</p>
            </div>
          </div>
          {/* O funil inteiro continua a um clique: aqui só o mapa está aberto. */}
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" asChild>
            <Link href={`/projects/${aberto.projectId}/funnels/${aberto.funnelId}`}>
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir o funil
            </Link>
          </Button>
        </div>

        {/* As edições salvam no mesmo lugar de sempre — é o mesmo editor.
            O mapa AVULSO não tem projeto/funil/etapa, e o editor endereça o
            desenho por esse caminho; até ele ser vinculado a um funil, abre
            pela tela própria. */}
        {aberto.projectId && aberto.funnelId && aberto.stageId ? (
          <FunnelMapCanvas
            key={aberto.stageId}
            projectId={aberto.projectId}
            funnelId={aberto.funnelId}
            stageId={aberto.stageId}
            altura={620}
          />
        ) : aberto.mapId ? (
          <FunnelMapCanvas key={aberto.mapId} mapId={aberto.mapId} altura={620} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <MapIcon className="h-6 w-6 text-indigo-500" />
              Mapas de funil
            </h1>
            <p className="text-sm text-muted-foreground">
              Todos os mapas desenhados no Loyola X. Clique em um para abrir e editar aqui mesmo.
            </p>
          </div>
          {/* Criar daqui poupa os três níveis de navegação — e permite o mapa
              que ainda não tem funil onde morar. */}
          {role !== "guest" && (
            <Button size="sm" className="gap-1.5" onClick={() => setNovoAberto(true)}>
              <Plus className="h-4 w-4" />
              Novo mapa
            </Button>
          )}
        </div>
      </div>

      <NovoMapaDialog open={novoAberto} onOpenChange={setNovoAberto} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por projeto, funil ou etapa"
            className="h-8 pl-8 text-sm"
          />
        </div>
        {arquivados > 0 && (
          <Button
            variant={mostrarArquivados ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setMostrarArquivados((v) => !v)}
          >
            {mostrarArquivados ? "Ocultar" : "Mostrar"} arquivados ({arquivados})
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
          <p className="text-sm font-medium">
            {mapas.length === 0 ? "Nenhum mapa ainda" : "Nada com esse termo"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {mapas.length === 0
              ? "Adicione uma etapa do tipo Mapa em qualquer funil e ela aparece aqui."
              : "Tente outro projeto, funil ou etapa."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((m) => (
            /* Relativo para o botão de excluir se posicionar por cima: um
               <button> dentro de outro é inválido, e o leitor de tela anuncia
               a ação errada. */
            <div key={m.mapId ?? m.stageId} className="group relative">
            <button
              type="button"
              onClick={() => setAberto(m)}
              className="w-full rounded-xl border border-border/40 bg-card/60 p-3 text-left transition-colors hover:border-primary/40 hover:bg-card"
            >
              <MapaMiniatura blocos={m.previa} />
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {/* O avulso não tem funil: o nome dele é o título. */}
                  <p className="truncate text-sm font-medium">{m.funnelName ?? m.stageName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {m.projectName ? (
                      <>
                        <span
                          className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                          style={{ background: m.projectColor ?? "#6b7280" }}
                        />
                        {m.projectName} · {m.stageName}
                      </>
                    ) : (
                      "sem funil"
                    )}
                  </p>
                </div>
                {m.arquivado && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    Arquivado
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{m.blocos} blocos</span>
                <span>·</span>
                <span>{m.conectores} ligações</span>
                {m.abas > 1 && (
                  <>
                    <span>·</span>
                    <span>{m.abas} abas</span>
                  </>
                )}
                <span className="ml-auto">{quando(m.updatedAt)}</span>
              </div>
            </button>

            {/* Só o avulso é apagável por aqui. O mapa que é etapa de um funil
                sai pela tela do funil — apagá-lo daqui deixaria a etapa órfã
                na lista, apontando para um desenho que não existe mais. */}
            {m.mapId && role !== "guest" && (
              <button
                type="button"
                onClick={() => setAExcluir(m)}
                title="Excluir mapa"
                aria-label={`Excluir ${m.stageName}`}
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            </div>
          ))}
        </div>
      )}

      {/* Confirmação, e não desfazer: o mapa avulso não deixa etapa para trás,
          então não há de onde recriá-lo depois. */}
      <AlertDialog open={!!aExcluir} onOpenChange={(o) => !o && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{aExcluir?.stageName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O desenho vai embora com {aExcluir?.blocos ?? 0} bloco(s). Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const alvo = aExcluir;
                setAExcluir(null);
                if (!alvo?.mapId) return;
                // Não precisa fechar o editor: a lista só existe quando ele
                // está fechado — com um mapa aberto, a tela toda é o editor.
                excluir.mutate(alvo.mapId, {
                  onSuccess: () => toast.success(`"${alvo.stageName}" excluído`),
                  onError: (e) =>
                    toast.error(e instanceof Error ? e.message : "Não consegui excluir"),
                });
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
