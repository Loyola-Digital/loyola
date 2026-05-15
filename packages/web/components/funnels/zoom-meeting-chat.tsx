"use client";

import { useMemo, useState } from "react";
import { MessageSquare, Search } from "lucide-react";
import type { ZoomChatMessage } from "@/lib/hooks/use-zoom-stage";

interface Props {
  messages: ZoomChatMessage[];
}

function fmtClockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Story 28.6: card com chat in-meeting persistido. Filtra por nome do remetente
 * (busca client-side). Estado vazio explícito quando reunião não tinha chat ou
 * sync ainda não rodou na versão nova.
 */
export function ZoomMeetingChat({ messages }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.trim().toLowerCase();
    return messages.filter(
      (m) =>
        m.sender.toLowerCase().includes(q) ||
        m.message.toLowerCase().includes(q),
    );
  }, [messages, search]);

  const isEmpty = messages.length === 0;

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4 lg:col-span-2">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Chat da Reunião
          </h4>
          <p className="text-[11px] text-muted-foreground">
            {isEmpty
              ? "Sem chat capturado pra esta reunião"
              : `${messages.length} ${messages.length === 1 ? "mensagem" : "mensagens"}${filtered.length !== messages.length ? ` · ${filtered.length} visíveis` : ""}`}
          </p>
        </div>
        {!isEmpty && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por nome ou texto…"
              className="h-7 w-56 rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-primary"
            />
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-xs">Nenhuma mensagem foi capturada nesta reunião.</p>
          <p className="text-[10px] opacity-70 mt-1">
            Verifique se "Save chat to cloud" estava habilitado na conta Zoom durante a live.
          </p>
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto rounded-md border border-border/30 bg-background/50">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma mensagem bate com "{search}"
            </p>
          ) : (
            <ul className="divide-y divide-border/20">
              {filtered.map((msg, i) => (
                <li
                  key={`${msg.dateTime}-${msg.sender}-${i}`}
                  className="flex items-start gap-3 px-3 py-2 text-[11px] hover:bg-muted/30"
                >
                  <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                    {fmtClockTime(msg.dateTime)}
                  </span>
                  <span className="shrink-0 font-medium min-w-0 max-w-[180px] truncate">
                    {msg.sender}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground/90">
                    {msg.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
