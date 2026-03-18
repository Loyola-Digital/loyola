"use client";

import Link from "next/link";
import type { MindDetail } from "@loyola-x/shared";
import { MessageSquare, Layers, BookOpen, Zap } from "lucide-react";
import { MindAvatar } from "./mind-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface MindProfileProps {
  mind: MindDetail;
}

export function MindProfile({ mind }: MindProfileProps) {
  return (
    <div className="space-y-8 max-w-2xl">

      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-gradient-to-br from-card via-card to-brand/5 p-7">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(47_98%_54%/0.08),transparent_55%)]" />

        <div className="relative flex items-start gap-5">
          <MindAvatar
            name={mind.name}
            size="lg"
            className="shrink-0 ring-2 ring-border/20 shadow-lg"
          />

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold leading-tight tracking-tight">
              {mind.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge
                variant="outline"
                className="text-xs border-brand/30 text-brand/80 bg-brand/5"
              >
                {mind.squad}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {mind.specialty}
              </span>
            </div>

            {/* Stats inline */}
            {mind.stats && (
              <div className="flex gap-6 mt-4 pt-4 border-t border-border/30">
                <div className="flex items-center gap-1.5 text-sm">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span className="font-semibold text-foreground">
                    {mind.stats.artifactCount}
                  </span>
                  <span className="text-muted-foreground/70">artifacts</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span className="font-semibold text-foreground">
                    {mind.stats.heuristicCount}
                  </span>
                  <span className="text-muted-foreground/70">heuristics</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span className="font-semibold text-foreground">
                    {mind.stats.conversationCount}
                  </span>
                  <span className="text-muted-foreground/70">conversas</span>
                </div>
              </div>
            )}
          </div>

          <Link href={`/minds/${mind.id}/chat`} className="shrink-0">
            <Button size="sm" className="gap-2 shadow-sm">
              <MessageSquare className="h-4 w-4" />
              Conversar
            </Button>
          </Link>
        </div>
      </div>

      {/* Tags */}
      {mind.tags && mind.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {mind.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-xs font-normal bg-muted/50 text-muted-foreground border-0 rounded-full px-3 py-1"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Sobre */}
      {mind.bio && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-[0.12em]">
            Sobre
          </h2>
          <p className="text-sm text-foreground/80 leading-7">{mind.bio}</p>
        </section>
      )}

      {/* Frameworks */}
      {mind.frameworks && mind.frameworks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-[0.12em]">
            Frameworks
          </h2>
          <div className="flex flex-wrap gap-2">
            {mind.frameworks.map((fw) => (
              <Badge
                key={fw}
                variant="secondary"
                className="text-xs bg-muted/60 border-0"
              >
                {fw}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* Estilo de Comunicação */}
      {mind.communicationStyle && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-[0.12em]">
            Estilo de Comunicação
          </h2>
          <div className="rounded-xl border border-border/30 bg-muted/20 px-4 py-3 space-y-3">
            <p className="text-sm">
              <span className="text-muted-foreground/60 text-xs uppercase tracking-wide mr-2">
                Tom
              </span>
              <span className="text-foreground/80 font-medium">
                {mind.communicationStyle.tone}
              </span>
            </p>
            {mind.communicationStyle.vocabulary &&
              mind.communicationStyle.vocabulary.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {mind.communicationStyle.vocabulary.map((word) => (
                    <Badge
                      key={word}
                      variant="outline"
                      className="text-[11px] font-normal border-border/50"
                    >
                      {word}
                    </Badge>
                  ))}
                </div>
              )}
          </div>
        </section>
      )}
    </div>
  );
}
