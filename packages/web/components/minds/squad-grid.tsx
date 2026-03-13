"use client";

import type { Squad } from "@loyola-x/shared";
import { MindCard } from "./mind-card";

interface SquadGridProps {
  squads: Squad[];
}

export function SquadGrid({ squads }: SquadGridProps) {
  return (
    <div className="space-y-8">
      {squads.map((squad) => (
        <section key={squad.id}>
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <h2 className="text-xl font-bold">{squad.displayName}</h2>
              <span className="text-sm text-muted-foreground">
                {squad.mindCount} {squad.mindCount === 1 ? "mind" : "minds"}
              </span>
            </div>
            {squad.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {squad.description}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {squad.minds.map((mind) => (
              <MindCard key={mind.id} mind={mind} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
