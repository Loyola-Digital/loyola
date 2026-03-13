"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useMind } from "@/lib/hooks/use-mind";
import { ChatContainer } from "@/components/chat/chat-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function ChatPage() {
  const { mindId } = useParams<{ mindId: string }>();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversationId") ?? undefined;

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
    <ChatContainer
      mindId={mindId}
      mindName={mind.name}
      conversationId={conversationId}
    />
  );
}
