"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Instagram, MessageSquare, Brain, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/lib/hooks/use-projects";
import { useMyMembership } from "@/lib/hooks/use-projects";
import { useUIStore } from "@/lib/stores/ui-store";
import type { Project, ProjectPermissions } from "@/lib/hooks/use-projects";

// ============================================================
// Module config
// ============================================================

const ALL_MODULES = [
  { key: "instagram" as keyof ProjectPermissions, label: "Instagram", href: "instagram", icon: Instagram },
  { key: "traffic" as keyof ProjectPermissions, label: "Ads", href: "traffic", icon: TrendingUp },
  { key: "conversations" as keyof ProjectPermissions, label: "Conversas", href: "conversations", icon: MessageSquare },
  { key: "mind" as keyof ProjectPermissions, label: "Mind", href: "minds", icon: Brain },
] as const;

// ============================================================
// GuestProjectFolder — renders only permitted modules
// ============================================================

function GuestProjectFolder({ project }: { project: Project }) {
  const pathname = usePathname();
  const { data: membership } = useMyMembership(project.id);
  const permissions = membership?.permissions;

  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(`project-folder-${project.id}`) !== "closed";
  });

  const isProjectActive = pathname.startsWith(`/projects/${project.id}`);

  const visibleModules = ALL_MODULES.filter(
    (m) => !permissions || permissions[m.key],
  );

  return (
    <Collapsible
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        localStorage.setItem(`project-folder-${project.id}`, val ? "open" : "closed");
      }}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant={isProjectActive && !visibleModules.some((m) => pathname.includes(`/${m.href}`)) ? "secondary" : "ghost"}
          className="w-full justify-start gap-2 px-2"
        >
          <ChevronRight
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: project.color ?? "#94a3b8" }}
          />
          <span className="truncate text-sm">{project.name}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 flex flex-col gap-0.5 border-l pl-2 py-1">
          {visibleModules.map((item) => {
            const href = `/projects/${project.id}/${item.href}`;
            const isActive = pathname.startsWith(href);
            const Icon = item.icon;
            return (
              <Button
                key={item.key}
                variant={isActive ? "secondary" : "ghost"}
                className="justify-start gap-2 h-8 text-sm"
                asChild
              >
                <Link href={href}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </Button>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================
// GuestSidebar
// ============================================================

function GuestNavContent() {
  const { data: projects, isLoading } = useProjects();

  return (
    <ScrollArea className="flex-1">
      <nav className="flex flex-col gap-1 p-2">
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Meus Projetos
        </p>

        {isLoading && (
          <>
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </>
        )}

        {!isLoading && (!projects || projects.length === 0) && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            Nenhum projeto acessível.
          </p>
        )}

        {!isLoading &&
          projects?.map((project) => (
            <GuestProjectFolder key={project.id} project={project} />
          ))}
      </nav>
    </ScrollArea>
  );
}

export function GuestSidebar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
      if (e.matches) setSidebarOpen(false);
    };
    handler(mql);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [setSidebarOpen]);

  return (
    <>
      {/* Mobile drawer */}
      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[240px] p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle className="flex items-center gap-2">
                <Image src="/logo.svg" alt="Loyola" width={120} height={28} className="brightness-0 invert" />
              </SheetTitle>
            </SheetHeader>
            <GuestNavContent />
          </SheetContent>
        </Sheet>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[240px] border-r bg-sidebar-background text-sidebar-foreground">
        <div className="flex h-14 items-center border-b px-4">
          <Image src="/logo.svg" alt="Loyola" width={120} height={28} className="brightness-0 invert" />
        </div>
        <Separator />
        <GuestNavContent />
      </aside>
    </>
  );
}
