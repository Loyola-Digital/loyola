"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowUpRight, Brain } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/lib/hooks/use-projects";
import { useProjectMinds } from "@/lib/hooks/use-project-minds";
import { MindAvatar } from "@/components/minds/mind-avatar";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectMindsPage({ params }: Props) {
  const { id } = use(params);

  const { data: projects, isLoading: projectsLoading } = useProjects();
  const project = projects?.find((p) => p.id === id);

  const { data: linkedMinds, isLoading: mindsLoading } = useProjectMinds(id);

  if (projectsLoading) {
    return (
      <div className="p-6 flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Empresa não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span
          className="h-4 w-4 rounded-full shrink-0"
          style={{ backgroundColor: project.color ?? "#94a3b8" }}
        />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" />
            Minds — {project.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            Minds disponíveis nesta empresa
          </p>
        </div>
      </div>

      {mindsLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {!mindsLoading && (!linkedMinds || linkedMinds.length === 0) && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhuma mind vinculada a esta empresa ainda.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Um administrador pode vincular minds nas configurações da empresa.
          </p>
        </div>
      )}

      {!mindsLoading && linkedMinds && linkedMinds.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {linkedMinds.map((mind) => (
            <Link
              key={mind.id}
              href={`/minds/${mind.mindId}`}
              className="group flex h-full"
            >
              <div className="relative flex flex-col w-full rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm p-5 transition-all duration-300 hover:border-brand/40 hover:shadow-[0_8px_32px_-8px_hsl(47_98%_54%/0.2)] hover:bg-card hover:-translate-y-0.5">
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <ArrowUpRight className="h-3.5 w-3.5 text-brand/60" />
                </div>

                <div className="flex items-start gap-3.5">
                  <MindAvatar
                    name={mind.mindName}
                    avatarUrl={mind.avatarUrl}
                    className="ring-2 ring-border/20 group-hover:ring-brand/30 transition-all duration-300 shrink-0"
                  />
                  <div className="min-w-0 flex-1 pr-4">
                    <h3 className="truncate font-semibold text-foreground group-hover:text-brand transition-colors duration-200 leading-tight">
                      {mind.mindName}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">
                      {mind.specialty}
                    </p>
                  </div>
                </div>

                <div className="mt-auto pt-4">
                  <span className="inline-block text-[10px] font-normal bg-muted/40 text-muted-foreground/70 border-0 px-2 py-0.5 rounded-full">
                    {mind.squadDisplayName}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
