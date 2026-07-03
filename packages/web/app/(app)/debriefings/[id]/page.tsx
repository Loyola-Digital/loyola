"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  ArrowLeft,
  MessageSquare,
  MessageSquarePlus,
  MoreVertical,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/lib/hooks/use-user-role";
import {
  useDebriefing,
  useDebriefings,
  useDeleteDebriefing,
  useUpdateDebriefing,
} from "@/lib/hooks/use-debriefings";
import {
  buildDebriefingSrcDoc,
  isDebriefingFrameMessage,
  DEBRIEFING_MSG,
} from "@/lib/debriefing-frame";
import { EditDebriefingDialog } from "@/components/debriefings/edit-debriefing-dialog";
import { DebriefingComments } from "@/components/debriefings/debriefing-comments";
import { DebriefingPinLayer } from "@/components/debriefings/debriefing-pin-layer";

// Story 37.1/37.2 — detalhe do debriefing. O HTML é renderizado FIELMENTE num
// iframe com sandbox="allow-scripts" e SEM allow-same-origin (nunca usar
// dangerouslySetInnerHTML). O script-agente injetado (debriefing-frame.ts)
// reporta a altura real (doc inteiro visível, sem scroll interno) e habilita a
// edição inline via designMode — o Lucas clica no texto renderizado e altera
// direto; Salvar extrai o HTML editado por postMessage e persiste.

const MIN_FRAME_HEIGHT = 400;
const MAX_FRAME_HEIGHT = 20000;

export default function DebriefingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const role = useUserRole();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // Story 37.3 — pins estilo Figma
  const [placing, setPlacing] = useState(false);
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [frameHeight, setFrameHeight] = useState(MIN_FRAME_HEIGHT);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const savingRef = useRef(false);

  const { data: debriefing, isLoading, error } = useDebriefing(params.id);
  const { data: listData } = useDebriefings();
  const update = useUpdateDebriefing(params.id);
  const deleteDebriefing = useDeleteDebriefing();
  const updateMutate = update.mutate;

  const commentCount = listData?.debriefings.find((d) => d.id === params.id)
    ?.commentCount;

  const srcDoc = useMemo(
    () =>
      debriefing
        ? buildDebriefingSrcDoc(debriefing.html, { editable: editMode })
        : "",
    [debriefing, editMode],
  );

  const onFrameMessage = useCallback(
    (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!isDebriefingFrameMessage(event.data)) return;

      if (event.data.type === DEBRIEFING_MSG.height) {
        setFrameHeight(
          Math.min(
            Math.max(event.data.height + 24, MIN_FRAME_HEIGHT),
            MAX_FRAME_HEIGHT,
          ),
        );
        return;
      }

      // debriefing:html — resposta do Salvar do modo edição
      if (!savingRef.current) return;
      savingRef.current = false;
      updateMutate(
        { html: event.data.html },
        {
          onSuccess: () => {
            toast.success("Documento atualizado!");
            setEditMode(false);
          },
          onError: (e) =>
            toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
        },
      );
    },
    [updateMutate],
  );

  useEffect(() => {
    window.addEventListener("message", onFrameMessage);
    return () => window.removeEventListener("message", onFrameMessage);
  }, [onFrameMessage]);

  if (role === "guest") {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
        <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          Debriefings são restritos à equipe interna.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }

  if (error || !debriefing) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
        <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Debriefing não encontrado.</p>
        <Button variant="ghost" className="mt-4" asChild>
          <Link href="/debriefings">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Link>
        </Button>
      </div>
    );
  }

  function handleSaveInline() {
    savingRef.current = true;
    iframeRef.current?.contentWindow?.postMessage(
      { type: DEBRIEFING_MSG.requestHtml },
      "*",
    );
  }

  function handleDelete() {
    deleteDebriefing.mutate(params.id, {
      onSuccess: () => {
        toast.success("Debriefing excluído");
        router.push("/debriefings");
      },
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="mb-1 -ml-2" asChild>
            <Link href="/debriefings">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Debriefings
            </Link>
          </Button>
          <h1 className="text-xl font-semibold truncate">{debriefing.campaignName}</h1>
          <p className="text-xs text-muted-foreground">
            {debriefing.authorName} · criado em{" "}
            {format(new Date(debriefing.createdAt), "dd MMM yyyy, HH:mm", { locale: ptBR })}
            {debriefing.editorName && (
              <>
                {" "}· editado por {debriefing.editorName} em{" "}
                {format(new Date(debriefing.updatedAt), "dd MMM yyyy, HH:mm", { locale: ptBR })}
              </>
            )}
            {typeof commentCount === "number" && (
              <>
                {" "}·{" "}
                <MessageSquare className="inline h-3 w-3 -mt-0.5" /> {commentCount}{" "}
                {commentCount === 1 ? "comentário" : "comentários"}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {!editMode && (
            <Button
              size="sm"
              variant={placing ? "secondary" : "outline"}
              onClick={() => setPlacing((p) => !p)}
            >
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              {placing ? "Cancelar pin" : "Comentar no doc"}
            </Button>
          )}
          {!editMode && (
            <Button
              size="sm"
              onClick={() => {
                setPlacing(false);
                setFocusedCommentId(null);
                setEditMode(true);
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Renomear / substituir arquivo
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Banner do modo "comentar no doc" */}
      {placing && !editMode && (
        <div className="sticky top-2 z-10 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 backdrop-blur">
          <MessageSquarePlus className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm min-w-0 flex-1">
            <span className="font-medium">Comentar no doc</span> — clique no
            ponto do documento onde quer deixar o comentário.
          </p>
          <Button size="sm" variant="ghost" onClick={() => setPlacing(false)}>
            <X className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
        </div>
      )}

      {/* Banner do modo edição */}
      {editMode && (
        <div className="sticky top-2 z-10 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 backdrop-blur">
          <Pencil className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm min-w-0 flex-1">
            <span className="font-medium">Modo de edição</span> — clique no texto
            do documento abaixo e altere direto.
          </p>
          <Button size="sm" onClick={handleSaveInline} disabled={update.isPending}>
            {update.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditMode(false)}
            disabled={update.isPending}
          >
            <X className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
        </div>
      )}

      {/* Doc + comentários lado a lado (desktop); empilhado no mobile */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6 space-y-6 lg:space-y-0">
        {/* Renderização fiel e isolada — altura acompanha o doc (sem scroll
            interno). O wrapper relative ancora a camada de pins (37.3). */}
        <div className="relative">
          <iframe
            ref={iframeRef}
            key={editMode ? "edit" : "view"}
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            scrolling="no"
            title={`Debriefing — ${debriefing.campaignName}`}
            className={`w-full rounded-xl border bg-white ${
              editMode ? "border-amber-500/60 ring-2 ring-amber-500/20" : "border-border/40"
            }`}
            style={{ height: frameHeight }}
          />
          {!editMode && (
            <DebriefingPinLayer
              debriefingId={params.id}
              placing={placing}
              onPlacingEnd={() => setPlacing(false)}
              focusedId={focusedCommentId}
              onFocusChange={setFocusedCommentId}
            />
          )}
        </div>

        <aside className="lg:sticky lg:top-4 rounded-xl border border-border/40 bg-card p-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <DebriefingComments
            debriefingId={params.id}
            focusedId={focusedCommentId}
            onPinSelect={(c) => {
              setFocusedCommentId(c.id);
              document
                .getElementById(`debriefing-pin-${c.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        </aside>
      </div>

      <EditDebriefingDialog
        debriefing={debriefing}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir debriefing?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{debriefing.campaignName}&quot; e todos os comentários serão
              removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
