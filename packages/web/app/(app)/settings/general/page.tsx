"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/lib/hooks/use-projects";
import { InviteMemberDialog } from "@/components/projects/invite-member-dialog";
import { MemberPermissionsEditor } from "@/components/projects/member-permissions-editor";
import { useUserRole } from "@/lib/hooks/use-user-role";

export default function GeneralSettingsPage() {
  const role = useUserRole();
  const isAdmin = role !== "guest";
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="space-y-6">
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Acesso de Convidados
            </CardTitle>
            <CardDescription>
              Convide membros externos e gerencie as permissões deles por projeto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Project selector */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium shrink-0">Projeto:</span>
              {projectsLoading ? (
                <Skeleton className="h-9 w-48" />
              ) : (
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Selecionar projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedProjectId && (
                <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
                  + Convidar membro
                </Button>
              )}
            </div>

            {/* Members list for selected project */}
            {selectedProjectId && (
              <div className="pt-2 border-t">
                <MemberPermissionsEditor projectId={selectedProjectId} />
              </div>
            )}

            {!selectedProjectId && !projectsLoading && (
              <p className="text-sm text-muted-foreground">
                Selecione um projeto acima para ver e gerenciar os membros convidados.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Configurações Gerais</CardTitle>
            <CardDescription>
              Configurações gerais da plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Nenhuma configuração disponível no momento.
            </p>
          </CardContent>
        </Card>
      )}

      {isAdmin && selectedProjectId && (
        <InviteMemberDialog
          projectId={selectedProjectId}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      )}
    </div>
  );
}
