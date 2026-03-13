"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useConversations } from "@/lib/hooks/use-conversations";
import { ConversationListItem } from "@/components/conversations/conversation-list-item";
import { MindFilter } from "@/components/conversations/mind-filter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const LIMIT = 20;

export default function ConversationsPage() {
  const [mindIdFilter, setMindIdFilter] = useState<string | undefined>();
  const [offset, setOffset] = useState(0);

  const { conversations, total, isLoading } = useConversations({
    mindId: mindIdFilter,
    limit: LIMIT,
    offset,
  });

  const start = offset + 1;
  const end = Math.min(offset + LIMIT, total);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b px-6 py-4">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Conversas</h1>
        <Badge variant="secondary" className="ml-auto">
          {total}
        </Badge>
      </header>

      <div className="flex items-center gap-3 border-b px-6 py-3">
        <MindFilter
          value={mindIdFilter}
          onChange={(id) => {
            setMindIdFilter(id);
            setOffset(0);
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border px-4 py-3">
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
            <p className="text-sm text-muted-foreground mb-4">
              Nenhuma conversa ainda. Explore as minds!
            </p>
            <Button asChild variant="outline">
              <Link href="/minds">Ver minds</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <ConversationListItem key={conv.id} conversation={conv} />
            ))}
          </div>
        )}
      </div>

      {total > LIMIT && (
        <div className="flex items-center justify-between border-t px-6 py-3">
          <p className="text-sm text-muted-foreground">
            Mostrando {start}-{end} de {total} conversas
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset(offset + LIMIT)}
            >
              Proximo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
