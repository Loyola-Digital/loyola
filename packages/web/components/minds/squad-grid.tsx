"use client";

import type { Squad } from "@loyola-x/shared";
import { MindCard } from "./mind-card";

interface SquadGridProps {
  squads: Squad[];
}

export function SquadGrid({ squads }: SquadGridProps) {
  return (
    <div className="space-y-14">
      {squads.map((squad) => (
        <section key={squad.id}>
          {/* Squad header with brand left accent */}
          <div className="mb-6 border-l-2 border-brand/40 pl-4">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {squad.displayName}
              </h2>
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand/70">
                {squad.mindCount}
              </span>
            </div>
            {squad.description && (
              <p className="mt-1 text-xs text-muted-foreground/70 leading-relaxed max-w-lg">
                {squad.description}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-stretch">
            {squad.minds.map((mind) => (
              <MindCard key={mind.id} mind={mind} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
