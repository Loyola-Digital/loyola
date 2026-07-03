"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, FileText, MessageSquare, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { useDebriefings } from "@/lib/hooks/use-debriefings";
import { CreateDebriefingDialog } from "@/components/debriefings/create-debriefing-dialog";

// Story 37.1 — lista de debriefings de campanha (aba global, não-guests).

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function DebriefingsPage() {
  const role = useUserRole();
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = useDebriefings();

  // Defesa em profundidade — o guest-guard da API já barra com 403.
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

  const debriefings = data?.debriefings ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <FileText className="h-5 w-5" />
            Debriefing
          </h1>
          <p className="text-sm text-muted-foreground">
            Documentos de debriefing das campanhas — com comentários do time.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo debriefing
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : debriefings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Nenhum debriefing ainda. Suba o primeiro doc HTML de uma campanha.
          </p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo debriefing
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {debriefings.map((d) => (
            <Link key={d.id} href={`/debriefings/${d.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base truncate">{d.campaignName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      {d.authorAvatarUrl && (
                        <AvatarImage src={d.authorAvatarUrl} alt={d.authorName} />
                      )}
                      <AvatarFallback className="text-[10px]">
                        {initials(d.authorName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground truncate">
                      {d.authorName} ·{" "}
                      {format(new Date(d.createdAt), "dd MMM yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {d.commentCount}{" "}
                    {d.commentCount === 1 ? "comentário" : "comentários"}
                    {d.editorName && (
                      <span className="ml-auto truncate">
                        editado por {d.editorName}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateDebriefingDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
