"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { MindSummary } from "@loyola-x/shared";
import { Badge } from "@/components/ui/badge";
import { MindAvatar } from "./mind-avatar";

interface MindCardProps {
  mind: MindSummary;
}

export function MindCard({ mind }: MindCardProps) {
  return (
    <Link href={`/minds/${mind.id}`} className="group flex h-full">
      <div className="relative flex flex-col w-full rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm p-5 transition-all duration-300 hover:border-brand/40 hover:shadow-[0_8px_32px_-8px_hsl(47_98%_54%/0.2)] hover:bg-card hover:-translate-y-0.5">

        {/* Arrow hint on hover */}
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <ArrowUpRight className="h-3.5 w-3.5 text-brand/60" />
        </div>

        {/* Avatar + name + specialty */}
        <div className="flex items-start gap-3.5">
          <MindAvatar
            name={mind.name}
            avatarUrl={mind.avatarUrl}
            className="ring-2 ring-border/20 group-hover:ring-brand/30 transition-all duration-300 shrink-0"
          />
          <div className="min-w-0 flex-1 pr-4">
            <h3 className="truncate font-semibold text-foreground group-hover:text-brand transition-colors duration-200 leading-tight">
              {mind.name}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">
              {mind.specialty}
            </p>
          </div>
        </div>

        {/* Tags */}
        <div className="mt-auto pt-4 flex flex-wrap gap-1.5 min-h-[22px]">
          {mind.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-[10px] font-normal bg-muted/40 text-muted-foreground/70 border-0 px-2 py-0.5 rounded-full"
            >
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    </Link>
  );
}
