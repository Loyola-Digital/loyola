"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { MindAvatar } from "@/components/minds/mind-avatar";
import { useMindAvatarLookup } from "@/lib/hooks/use-mind-avatar-lookup";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Conversation } from "@loyola-x/shared";

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onDelete: (id: string) => void;
}

export function ConversationItem({
  conversation,
  isActive,
  onDelete,
}: ConversationItemProps) {
  const resolveAvatar = useMindAvatarLookup();
  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:bg-accent/50",
        isActive && "bg-accent/60 border-l-2 border-l-brand",
      )}
    >
      <Link
        href={`/minds/${conversation.mindId}/chat?conversationId=${conversation.id}`}
        className="flex flex-1 items-center gap-3 min-w-0"
      >
        <MindAvatar
          name={conversation.mindName ?? conversation.mindId}
          avatarUrl={resolveAvatar(conversation.mindId)}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">
            {conversation.mindName ?? conversation.mindId}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {conversation.title ?? "Nova conversa"}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(conversation.updatedAt), {
              addSuffix: true,
              locale: ptBR,
            })}
          </p>
        </div>
      </Link>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao nao pode ser desfeita. A conversa sera removida da sua lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(conversation.id)}>
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
