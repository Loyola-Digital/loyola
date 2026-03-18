"use client";

import Link from "next/link";
import type { MindDetail } from "@loyola-x/shared";
import { MessageSquare } from "lucide-react";
import { MindAvatar } from "./mind-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface MindProfileProps {
  mind: MindDetail;
}

export function MindProfile({ mind }: MindProfileProps) {
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-gradient-to-br from-card via-card to-brand/5 p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(47_98%_54%/0.08),transparent_50%)]" />
        <div className="relative flex items-start gap-4">
          <MindAvatar
            name={mind.name}
            size="lg"
            className="shrink-0 ring-2 ring-border/30"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{mind.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-xs">
                {mind.squad}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {mind.specialty}
              </span>
            </div>
            {mind.stats && (
              <div className="flex gap-5 mt-3">
                <span className="text-sm">
                  <span className="font-semibold text-foreground">
                    {mind.stats.artifactCount}
                  </span>{" "}
                  <span className="text-muted-foreground">artifacts</span>
                </span>
                <span className="text-sm">
                  <span className="font-semibold text-foreground">
                    {mind.stats.heuristicCount}
                  </span>{" "}
                  <span className="text-muted-foreground">heuristics</span>
                </span>
                <span className="text-sm">
                  <span className="font-semibold text-foreground">
                    {mind.stats.conversationCount}
                  </span>{" "}
                  <span className="text-muted-foreground">conversas</span>
                </span>
              </div>
            )}
          </div>
          <Link href={`/minds/${mind.id}/chat`} className="shrink-0">
            <Button size="sm" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Conversar
            </Button>
          </Link>
        </div>
      </div>

      {/* Tags */}
      {mind.tags && mind.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mind.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-xs font-normal bg-muted/50 text-muted-foreground border-0"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Sobre */}
      {mind.bio && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            Sobre
          </h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {mind.bio}
          </p>
        </section>
      )}

      {/* Frameworks */}
      {mind.frameworks && mind.frameworks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            Frameworks
          </h2>
          <div className="flex flex-wrap gap-2">
            {mind.frameworks.map((fw) => (
              <Badge key={fw} variant="secondary" className="text-xs">
                {fw}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* Estilo de Comunicação */}
      {mind.communicationStyle && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            Estilo de Comunicação
          </h2>
          <p className="text-sm text-muted-foreground mb-2.5">
            Tom:{" "}
            <span className="text-foreground/80">
              {mind.communicationStyle.tone}
            </span>
          </p>
          {mind.communicationStyle.vocabulary &&
            mind.communicationStyle.vocabulary.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {mind.communicationStyle.vocabulary.map((word) => (
                  <Badge key={word} variant="outline" className="text-xs font-normal">
                    {word}
                  </Badge>
                ))}
              </div>
            )}
        </section>
      )}
    </div>
  );
}
