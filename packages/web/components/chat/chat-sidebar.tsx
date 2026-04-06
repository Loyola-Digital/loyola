"use client";

import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConversationItem } from "@/components/chat/conversation-item";
import { useConversations, useDeleteConversation } from "@/lib/hooks/use-conversations";
import { useTasks } from "@/lib/hooks/use-tasks";

interface ChatSidebarProps {
  mindId: string;
  conversationId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-600",
  in_progress: "bg-yellow-500/10 text-yellow-600",
  review: "bg-purple-500/10 text-purple-600",
  done: "bg-green-500/10 text-green-600",
  cancelled: "bg-gray-500/10 text-gray-500",
  pending: "bg-slate-500/10 text-slate-600",
};

function SidebarContent({
  mindId,
  conversationId,
}: {
  mindId: string;
  conversationId?: string;
}) {
  const { conversations, isLoading } = useConversations({ mindId });
  const deleteConversation = useDeleteConversation();
  const { tasks, isLoading: tasksLoading } = useTasks({ limit: 5 });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Conversas</h3>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs border-brand/30 text-brand hover:bg-brand/10 hover:text-brand" asChild>
          <Link href={`/minds/${mindId}/chat`}>
            <Plus className="h-3.5 w-3.5" />
            Nova
          </Link>
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1">
          {isLoading ? (
            <div className="space-y-2 px-3 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations && conversations.length > 0 ? (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === conversationId}
                onDelete={(id) => deleteConversation.mutate(id)}
              />
            ))
          ) : (
            <p className="px-4 py-6 text-xs text-muted-foreground text-center">
              Nenhuma conversa ainda
            </p>
          )}
        </div>

        <Separator className="my-2" />

        <div className="px-4 py-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
            Tarefas Recentes
          </h4>
          {tasksLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : tasks && tasks.length > 0 ? (
            <div className="space-y-1">
              {tasks.map((task) => (
                <a
                  key={task.id}
                  href={task.clickupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent transition-colors"
                >
                  <span className="flex-1 truncate">{task.title}</span>
                  <Badge
                    variant="secondary"
                    className={cn("text-[10px] px-1.5 py-0", STATUS_COLORS[task.status])}
                  >
                    {task.status}
                  </Badge>
                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhuma tarefa</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function ChatSidebar({
  mindId,
  conversationId,
  open,
  onOpenChange,
}: ChatSidebarProps) {
  return (
    <>
      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-[280px] p-0 md:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Conversas</SheetTitle>
          </SheetHeader>
          <SidebarContent mindId={mindId} conversationId={conversationId} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[280px] flex-col border-r bg-sidebar-background text-sidebar-foreground shrink-0">
        <SidebarContent mindId={mindId} conversationId={conversationId} />
      </aside>
    </>
  );
}
