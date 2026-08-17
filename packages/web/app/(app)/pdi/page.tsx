"use client";

/**
 * Tela de PDI da própria pessoa — é aqui que o app abre quando ela tem um PDI
 * atribuído. Admin ganha, além do seu, o acesso à área de gestão.
 */

import Link from "next/link";
import { Settings2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PdiViewer } from "@/components/pdi/pdi-viewer";
import { useMeuPdi } from "@/lib/hooks/use-pdi";
import { useUserRole } from "@/lib/hooks/use-user-role";

export default function PdiPage() {
  const { data, isLoading } = useMeuPdi();
  const role = useUserRole();
  const ehAdmin = role === "admin";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Target className="h-6 w-6 text-primary" />
            Meu PDI
          </h1>
          <p className="text-sm text-muted-foreground">
            Plano de Desenvolvimento Individual — seu, e só seu.
          </p>
        </div>
        {ehAdmin && (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/pdi/gerenciar">
              <Settings2 className="h-3.5 w-3.5" />
              Gerenciar PDIs
            </Link>
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-[420px] rounded-xl" />
      ) : data?.pdi ? (
        <div className="space-y-2">
          <PdiViewer html={data.pdi.html} titulo={data.pdi.title} />
          <p className="text-[11px] text-muted-foreground">
            {data.pdi.title} · atribuído em{" "}
            {new Date(data.pdi.createdAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
          <Target className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-medium">Você ainda não tem um PDI</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Assim que a liderança atribuir o seu Plano de Desenvolvimento Individual, ele aparece
            aqui — e passa a ser a primeira tela ao abrir o Loyola X.
          </p>
        </div>
      )}
    </div>
  );
}
