"use client";

import { useMemo } from "react";
import { useMinds } from "@/lib/hooks/use-minds";

/**
 * Returns a lookup function that resolves a mind's avatar URL by id.
 * Backed by the cached `useMinds` query — safe to call from many list items,
 * react-query dedupes network calls by query key.
 */
export function useMindAvatarLookup() {
  const { squads } = useMinds();

  return useMemo(() => {
    const map = new Map<string, string | null>();
    squads?.forEach((squad) => {
      squad.minds.forEach((mind) => {
        map.set(mind.id, mind.avatarUrl);
      });
    });
    return (mindId: string): string | null => map.get(mindId) ?? null;
  }, [squads]);
}
