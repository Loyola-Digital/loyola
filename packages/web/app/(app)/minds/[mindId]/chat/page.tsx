"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import { useMind } from "@/lib/hooks/use-mind";
import { ChatContainer } from "@/components/chat/chat-container";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function ChatPage() {
  const { mindId } = useParams<{ mindId: string }>();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversationId") ?? undefined;
  const projectId = searchParams.get("projectId") ?? undefined;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { mind, isLoading } = useMind(mindId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto h-10 w-10 rounded-full" />
          <Skeleton className="mx-auto h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!mind) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Mind não encontrada</p>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)]">
      <ChatSidebar
        mindId={mindId}
        conversationId={conversationId}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
      />
      <div className="flex flex-1 flex-col min-w-0">
        <div className="md:hidden flex items-center gap-3 border-b border-border/50 px-4 py-2.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold truncate">{mind.name}</span>
        </div>
        <ChatContainer
          mindId={mindId}
          mindName={mind.name}
          mindAvatarUrl={mind.avatarUrl}
          conversationId={conversationId}
          projectId={projectId}
        />
      </div>
    </div>
  );
}
