"use client";

import { use } from "react";
import { useProjects } from "@/lib/hooks/use-projects";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import { Instagram } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { InstagramAccount } from "@/lib/hooks/use-instagram-accounts";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectPage({ params }: Props) {
  const { id } = use(params);
  const apiClient = useApiClient();

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

  return (
    <div className="p-6 flex flex-col gap-6 max-w-2xl">
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

      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Instagram className="h-4 w-4" />
          Contas Instagram vinculadas
        </h2>
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
    </div>
  );
}
