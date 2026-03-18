"use client";

import type { Squad } from "@loyola-x/shared";
import { MindCard } from "./mind-card";

interface SquadGridProps {
  squads: Squad[];
}

export function SquadGrid({ squads }: SquadGridProps) {
  return (
    <div className="space-y-10">
      {squads.map((squad) => (
        <section key={squad.id}>
          <div className="mb-5">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold tracking-tight">{squad.displayName}</h2>
              <span className="rounded-full bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {squad.mindCount}
              </span>
            </div>
            {squad.description && (
              <p className="mt-1 text-sm text-muted-foreground/80 leading-relaxed">
                {squad.description}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-stretch">
            {squad.minds.map((mind) => (
              <MindCard key={mind.id} mind={mind} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
