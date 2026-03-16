"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, MessageSquare, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/stores/ui-store";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect } from "react";
import { useTasks } from "@/lib/hooks/use-tasks";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { label: "Minds", href: "/minds", icon: Brain },
  { label: "Conversations", href: "/conversations", icon: MessageSquare },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
] as const;

function NavContent({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { total: openTaskCount } = useTasks({ status: "open", limit: 1, offset: 0 });

  return (
    <ScrollArea className="flex-1">
      <nav className="flex flex-col gap-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          const showBadge = item.href === "/tasks" && openTaskCount > 0 && !collapsed;
          return (
            <Button
              key={item.href}
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "justify-start gap-3",
                collapsed && "justify-center px-2",
              )}
              asChild
            >
              <Link href={item.href}>
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
                {showBadge && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    {openTaskCount}
                  </Badge>
                )}
              </Link>
            </Button>
          );
        })}
      </nav>
    </ScrollArea>
  );
}

function useResponsiveSidebar() {
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setSidebarOpen(e.matches);
    };
    handler(mql);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [setSidebarOpen]);
}

export function AppSidebar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  useResponsiveSidebar();

  return (
    <>
      {/* Mobile drawer */}
      <Sheet
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
      >
        <SheetContent side="left" className="w-[240px] p-0 md:hidden">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2">
              <Image src="/logo.svg" alt="Loyola" width={120} height={28} className="brightness-0 invert" />
            </SheetTitle>
          </SheetHeader>
          <NavContent collapsed={false} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside
        id="app-sidebar"
        className={cn(
          "hidden md:flex flex-col border-r bg-sidebar-background text-sidebar-foreground transition-all duration-200",
          sidebarOpen ? "w-[240px]" : "w-16",
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center border-b px-4",
            !sidebarOpen && "justify-center px-2",
          )}
        >
          {sidebarOpen ? (
            <Image src="/logo.svg" alt="Loyola" width={120} height={28} className="brightness-0 invert" />
          ) : (
            <Image src="/icon.svg" alt="L" width={28} height={28} />
          )}
        </div>
        <Separator />
        <NavContent collapsed={!sidebarOpen} />
      </aside>
    </>
  );
}
