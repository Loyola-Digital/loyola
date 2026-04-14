"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MindAvatar } from "@/components/minds/mind-avatar";
import { useMindAvatarLookup } from "@/lib/hooks/use-mind-avatar-lookup";
import { Badge } from "@/components/ui/badge";
import type { Conversation } from "@loyola-x/shared";

interface ConversationListItemProps {
  conversation: Conversation;
}

export function ConversationListItem({
  conversation: conv,
}: ConversationListItemProps) {
  const resolveAvatar = useMindAvatarLookup();
  return (
    <Link
      href={`/minds/${conv.mindId}/chat?conversationId=${conv.id}`}
      className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
    >
      <MindAvatar name={conv.mindName} avatarUrl={resolveAvatar(conv.mindId)} size="sm" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {conv.title ?? "Conversa sem titulo"}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {conv.mindName}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(conv.updatedAt), {
            addSuffix: true,
            locale: ptBR,
          })}
        </span>
        {conv.messageCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {conv.messageCount} msgs
          </Badge>
        )}
      </div>
    </Link>
  );
}
