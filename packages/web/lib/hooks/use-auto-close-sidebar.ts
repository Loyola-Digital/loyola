"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/lib/stores/ui-store";

/**
 * Fecha o sidebar mobile automaticamente ao navegar para outra rota.
 * No desktop não interfere — só age quando `isMobile === true`.
 */
export function useAutoCloseSidebarOnNavigation(isMobile: boolean) {
  const pathname = usePathname();
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const prevPathname = useRef<string | null>(null);

  useEffect(() => {
    // Pula a primeira execução — fechar no mount apagaria o estado inicial.
    if (prevPathname.current !== null && prevPathname.current !== pathname && isMobile) {
      setSidebarOpen(false);
    }
    prevPathname.current = pathname;
  }, [pathname, isMobile, setSidebarOpen]);
}
