"use client";

import { useUser } from "@clerk/nextjs";

export function useUserRole(): string {
  const { user } = useUser();
  return (user?.publicMetadata?.role as string) ?? "admin";
}
