"use client";

import { useCurrentUser } from "@/lib/hooks/use-current-user";

/**
 * Returns the user's role from the DB (via /api/me).
 * Returns null while loading, "admin" as fallback on error.
 */
export function useUserRole(): string | null {
  const { data: me, isLoading } = useCurrentUser();
  if (isLoading) return null;
  return me?.role ?? "admin";
}
