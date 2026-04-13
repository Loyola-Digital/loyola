"use client";

import { use, useState } from "react";
import { useProjects } from "@/lib/hooks/use-projects";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import { Instagram, UserPlus, Users, Brain, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { InviteMemberDialog } from "@/components/projects/invite-member-dialog";
import { MemberPermissionsEditor } from "@/components/projects/member-permissions-editor";
import { LinkAccountDialog } from "@/components/projects/link-account-dialog";
import { LinkMindDialog } from "@/components/projects/link-mind-dialog";
import { useProjectMinds, useUnlinkMindFromProject } from "@/lib/hooks/use-project-minds";
import type { InstagramAccount } from "@/lib/hooks/use-instagram-accounts";
import { toast } from "sonner";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectPage({ params }: Props) {
  const { id } = use(params);
  const apiClient = useApiClient();
  const role = useUserRole();
  const isAdmin = role !== null && role !== "guest";

  const [inviteOpen, setInviteOpen] = useState(false);
  const [linkAccountOpen, setLinkAccountOpen] = useState(false);
  const [linkMindOpen, setLinkMindOpen] = useState(false);

  const { data: linkedMinds, isLoading: mindsLoading } = useProjectMinds(id);
  const unlinkMind = useUnlinkMindFromProject();

  const { data: projects, isLoading: projectsLoading } = useProjects();
  const project = projects?.find((p) => p.id === id);

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["project-accounts", id],
    queryFn: () => apiClient<InstagramAccount[]>(`/api/projects/${id}/instagram/accounts`),
    enabled: !!id,
  });

  if (projectsLoading) {
    return (
      <div className="p-6 flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Projeto não encontrado.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="h-4 w-4 rounded-full shrink-0"
            style={{ backgroundColor: project.color ?? "#94a3b8" }}
          />
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <p className="text-muted-foreground text-sm">{project.clientName}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1.5" />
          Convidar
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Instagram className="h-4 w-4" />
            Contas Instagram vinculadas
          </h2>
          <Button size="sm" variant="outline" onClick={() => setLinkAccountOpen(true)}>
            + Vincular conta
          </Button>
        </div>
        {accountsLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {!accountsLoading && (!accounts || accounts.length === 0) && (
          <p className="text-sm text-muted-foreground">Nenhuma conta vinculada a este projeto.</p>
        )}
        {!accountsLoading && accounts && accounts.length > 0 && (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <Instagram className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{account.accountName}</span>
                <span className="text-muted-foreground">@{account.instagramUsername}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Minds vinculadas
              </h2>
              <Button size="sm" variant="outline" onClick={() => setLinkMindOpen(true)}>
                + Vincular mind
              </Button>
            </div>
            {mindsLoading && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
              </div>
            )}
            {!mindsLoading && (!linkedMinds || linkedMinds.length === 0) && (
              <p className="text-sm text-muted-foreground">
                Nenhuma mind vinculada. Vincule minds para que convidados possam acessá-las.
              </p>
            )}
            {!mindsLoading && linkedMinds && linkedMinds.length > 0 && (
              <ul className="flex flex-col gap-2">
                {linkedMinds.map((mind) => (
                  <li
                    key={mind.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Brain className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{mind.mindName}</span>
                      <span className="text-muted-foreground text-xs">
                        {mind.squadDisplayName}
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        await unlinkMind.mutateAsync(
                          { projectId: id, mindId: mind.mindId },
                          {
                            onSuccess: () => toast.success("Mind desvinculada."),
                            onError: () => toast.error("Erro ao desvincular mind."),
                          },
                        );
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
      </div>

      <Separator />
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Membros convidados
        </h2>
        <MemberPermissionsEditor projectId={id} />
      </div>

      <InviteMemberDialog
        projectId={id}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />

      <LinkAccountDialog
        projectId={id}
        open={linkAccountOpen}
        onOpenChange={setLinkAccountOpen}
      />

      <LinkMindDialog
        projectId={id}
        open={linkMindOpen}
        onOpenChange={setLinkMindOpen}
      />
    </div>
  );
}
