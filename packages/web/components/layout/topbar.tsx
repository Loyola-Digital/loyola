"use client";

import { Menu } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/lib/stores/ui-store";
import { InstalarApp } from "@/components/layout/instalar-app";

export function Topbar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle sidebar</span>
      </Button>

      <span className="text-sm font-semibold">Loyola X</span>

      <div className="ml-auto flex items-center gap-3">
        {/* Some sozinho quando já está instalado ou quando o navegador não
            instala — ver o componente. */}
        <InstalarApp />
        <UserButton />
      </div>
    </header>
  );
}
