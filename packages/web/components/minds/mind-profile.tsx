"use client";

import Link from "next/link";
import type { MindDetail } from "@loyola-x/shared";
import { MessageSquare } from "lucide-react";
import { MindAvatar } from "./mind-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface MindProfileProps {
  mind: MindDetail;
}

export function MindProfile({ mind }: MindProfileProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <MindAvatar name={mind.name} size="lg" />
        <div>
          <h1 className="text-2xl font-bold">{mind.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{mind.squad}</Badge>
            <span className="text-sm text-muted-foreground">
              {mind.specialty}
            </span>
          </div>
        </div>
      </div>

      <Link href={`/minds/${mind.id}/chat`}>
        <Button className="gap-2">
          <MessageSquare className="h-4 w-4" />
          Iniciar Conversa
        </Button>
      </Link>

      <Separator />

      {/* Sobre */}
      {mind.bio && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Sobre</h2>
          <p className="text-muted-foreground leading-relaxed">{mind.bio}</p>
        </section>
      )}

      {/* Frameworks */}
      {mind.frameworks && mind.frameworks.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Frameworks</h2>
          <div className="flex flex-wrap gap-2">
            {mind.frameworks.map((fw) => (
              <Badge key={fw} variant="secondary">
                {fw}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* Estilo de Comunicacao */}
      {mind.communicationStyle && (
        <section>
          <h2 className="text-lg font-semibold mb-2">
            Estilo de Comunicação
          </h2>
          <p className="text-sm text-muted-foreground mb-2">
            Tom: {mind.communicationStyle.tone}
          </p>
          {mind.communicationStyle.vocabulary &&
            mind.communicationStyle.vocabulary.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {mind.communicationStyle.vocabulary.map((word) => (
                  <Badge key={word} variant="outline" className="text-xs">
                    {word}
                  </Badge>
                ))}
              </div>
            )}
        </section>
      )}

      {/* Estatisticas */}
      {mind.stats && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Estatísticas</h2>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-2xl font-bold">
                  {mind.stats.artifactCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-xs text-muted-foreground">Artifacts</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-2xl font-bold">
                  {mind.stats.heuristicCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-xs text-muted-foreground">Heuristics</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-2xl font-bold">
                  {mind.stats.conversationCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-xs text-muted-foreground">Conversas</p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}
