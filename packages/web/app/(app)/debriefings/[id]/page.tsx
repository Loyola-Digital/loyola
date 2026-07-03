"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, ArrowLeft, Pencil, Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { useDebriefing, useDeleteDebriefing } from "@/lib/hooks/use-debriefings";
import { EditDebriefingDialog } from "@/components/debriefings/edit-debriefing-dialog";
import { DebriefingComments } from "@/components/debriefings/debriefing-comments";

// Story 37.1 — detalhe do debriefing. O HTML é renderizado FIELMENTE num
// iframe com sandbox="allow-scripts" e SEM allow-same-origin: scripts internos
// do doc (gráficos etc.) rodam, mas isolados — sem acesso a cookies/sessão/DOM
// da plataforma. Nunca usar dangerouslySetInnerHTML aqui.

export default function DebriefingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const role = useUserRole();
  const [editOpen, setEditOpen] = useState(false);
  const { data: debriefing, isLoading, error } = useDebriefing(params.id);
  const deleteDebriefing = useDeleteDebriefing();

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
    <div className="space-y-6">
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
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
            </AlertDialogTrigger>
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
      </div>

      {/* Renderização fiel e isolada do doc — ver nota no topo do arquivo */}
      <iframe
        srcDoc={debriefing.html}
        sandbox="allow-scripts"
        title={`Debriefing — ${debriefing.campaignName}`}
        className="w-full h-[75vh] rounded-xl border border-border/40 bg-white"
      />

      <Separator />

      <DebriefingComments debriefingId={params.id} />

      <EditDebriefingDialog
        debriefing={debriefing}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
