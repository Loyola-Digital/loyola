"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

export function UserStatusGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: me, error } = useCurrentUser();

  useEffect(() => {
    if (me && me.status !== "active") {
      router.replace("/pending-approval");
    }
    // If API returns 403 with PENDING_APPROVAL code
    if (error) {
      const e = error as Error & { code?: string };
      if (e.code === "PENDING_APPROVAL" || e.code === "BLOCKED") {
        router.replace("/pending-approval");
      }
    }
  }, [me, error, router]);

  // Render children regardless — guard is non-blocking for active users
  return <>{children}</>;
}
