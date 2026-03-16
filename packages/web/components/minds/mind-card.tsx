"use client";

import Link from "next/link";
import type { MindSummary } from "@loyola-x/shared";
import { Badge } from "@/components/ui/badge";
import { MindAvatar } from "./mind-avatar";

interface MindCardProps {
  mind: MindSummary;
}

export function MindCard({ mind }: MindCardProps) {
  return (
    <Link href={`/minds/${mind.id}`} className="group block">
      <div className="relative rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 transition-all duration-200 hover:scale-[1.02] hover:border-brand/30 hover:shadow-[0_0_20px_-4px_hsl(47_98%_54%/0.15)] hover:bg-card">
        <div className="flex items-start gap-3">
          <MindAvatar name={mind.name} className="ring-2 ring-border/30 group-hover:ring-brand/30 transition-all duration-200" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-foreground group-hover:text-brand transition-colors duration-200">
              {mind.name}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {mind.specialty}
            </p>
          </div>
        </div>
        {mind.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {mind.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[11px] font-normal bg-muted/50 text-muted-foreground border-0"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
