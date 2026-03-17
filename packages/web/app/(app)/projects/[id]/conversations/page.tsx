"use client";

import { use } from "react";
import Link from "next/link";
import { MessageSquare, ChevronRight } from "lucide-react";
import { useConversations } from "@/lib/hooks/use-conversations";
import { useProjects } from "@/lib/hooks/use-projects";
import { ConversationListItem } from "@/components/conversations/conversation-list-item";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectConversationsPage({ params }: Props) {
  const { id: projectId } = use(params);

  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === projectId);

  const { conversations, isLoading } = useConversations({ projectId });

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 border-b px-6 py-3 text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground transition-colors">
          Projetos
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link
          href={`/projects/${projectId}`}
          className="hover:text-foreground transition-colors"
        >
          {project?.clientName ?? project?.name ?? "Projeto"}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Conversas</span>
      </nav>

      {/* Header */}
      <header className="flex items-center gap-3 border-b px-6 py-4">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Conversas</h1>
      </header>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border px-4 py-3"
              >
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : !conversations || conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhuma conversa neste projeto ainda.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <ConversationListItem key={conv.id} conversation={conv} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
