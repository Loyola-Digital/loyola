"use client";

import Link from "next/link";
import type { MindSummary } from "@loyola-x/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MindAvatar } from "./mind-avatar";

interface MindCardProps {
  mind: MindSummary;
}

export function MindCard({ mind }: MindCardProps) {
  return (
    <Link href={`/minds/${mind.id}`}>
      <Card className="transition-all hover:scale-[1.02] hover:border-primary/50 hover:shadow-md">
        <CardContent className="flex items-start gap-3 p-4">
          <MindAvatar name={mind.name} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{mind.name}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {mind.specialty}
            </p>
            {mind.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {mind.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
