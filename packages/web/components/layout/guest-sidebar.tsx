"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronDown, Instagram, MessageSquare, Brain, TrendingUp, Rocket, Repeat, Share2, ArrowUpDown } from "lucide-react";
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
import { useAutoCloseSidebarOnNavigation } from "@/lib/hooks/use-auto-close-sidebar";
import { useFunnels } from "@/lib/hooks/use-funnels";
import { useFunnelStages } from "@/lib/hooks/use-funnel-stages";
import type { Project, ProjectPermissions } from "@/lib/hooks/use-projects";
import type { Funnel } from "@loyola-x/shared";

// ============================================================
// Module config
// ============================================================

const SOCIAL_MODULES = [
  { key: "instagram" as keyof ProjectPermissions, label: "Instagram", href: "instagram", icon: Instagram },
] as const;

const OTHER_MODULES = [
  { key: "traffic" as keyof ProjectPermissions, label: "Ads", href: "traffic", icon: TrendingUp },
  { key: "conversations" as keyof ProjectPermissions, label: "Conversas", href: "conversations", icon: MessageSquare },
  { key: "mind" as keyof ProjectPermissions, label: "Mind", href: "minds", icon: Brain },
] as const;

// Modules visible to ALL guests regardless of permissions
const UNGATED_MODULES = [
  { label: "Vendas", href: "sales", icon: ArrowUpDown },
] as const;

// ============================================================
// GuestFunnelItem — funil colapsável (read-only) com etapas aninhadas
// ============================================================

function GuestFunnelItem({
  funnel,
  projectId,
  pathname,
}: {
  funnel: Funnel;
  projectId: string;
  pathname: string;
}) {
  const { data: stages, isLoading: stagesLoading } = useFunnelStages(projectId, funnel.id);

  const funnelHref = `/projects/${projectId}/funnels/${funnel.id}`;
  const isActiveFunnel = pathname.startsWith(funnelHref);
  const [open, setOpen] = useState(isActiveFunnel);

  // Abre automaticamente ao navegar pra dentro do funil (inactive→active),
  // depois respeita a escolha manual do guest.
  const prevActiveRef = useRef(isActiveFunnel);
  useEffect(() => {
    if (isActiveFunnel && !prevActiveRef.current) setOpen(true);
    prevActiveRef.current = isActiveFunnel;
  }, [isActiveFunnel]);

  const FunnelIcon = funnel.type === "launch" ? Rocket : Repeat;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant={isActiveFunnel ? "secondary" : "ghost"}
          className="w-full justify-start gap-1.5 h-8 text-sm min-w-0"
        >
          <FunnelIcon className="h-4 w-4 shrink-0" />
          <span className="truncate flex-1 text-left">{funnel.name}</span>
          <ChevronRight
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform shrink-0",
              open && "rotate-90",
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 flex flex-col gap-0.5 border-l pl-2 py-0.5">
          {stagesLoading && <Skeleton className="h-6 w-full rounded-md" />}

          {!stagesLoading && stages && stages.length > 0 &&
            stages.map((stage) => {
              const stageHref = `${funnelHref}/stages/${stage.id}`;
              const isActive = pathname.startsWith(stageHref);
              return (
                <Button
                  key={stage.id}
                  variant={isActive ? "secondary" : "ghost"}
                  className="justify-start gap-2 h-7 text-xs min-w-0"
                  asChild
                >
                  <Link href={stageHref}>
                    <span className="truncate">{stage.name}</span>
                  </Link>
                </Button>
              );
            })}

          {!stagesLoading && (!stages || stages.length === 0) && (
            <p className="px-2 py-1 text-[11px] text-muted-foreground">Sem etapas</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================
// GuestProjectFolder — renders only permitted modules
// ============================================================

function GuestProjectFolder({ project }: { project: Project }) {
  const pathname = usePathname();
  const { data: membership } = useMyMembership(project.id);
  const permissions = membership?.permissions;
  const { data: funnelList } = useFunnels(project.id);

  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(`project-folder-${project.id}`) !== "closed";
  });

  const isProjectActive = pathname.startsWith(`/projects/${project.id}`);

  const visibleSocial = SOCIAL_MODULES.filter(
    (m) => !permissions || permissions[m.key],
  );
  const visibleOther = OTHER_MODULES.filter(
    (m) => !permissions || permissions[m.key],
  );

  const isSocialActive = visibleSocial.some((s) => pathname.includes(`/${s.href}`));
  const [socialOpen, setSocialOpen] = useState(isSocialActive);

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
          variant={isProjectActive && !visibleSocial.some((m) => pathname.includes(`/${m.href}`)) && !visibleOther.some((m) => pathname.includes(`/${m.href}`)) ? "secondary" : "ghost"}
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
          {/* Social group (collapsible) */}
          {visibleSocial.length > 0 && (
            <>
              <Button
                variant={isSocialActive && !socialOpen ? "secondary" : "ghost"}
                className="justify-start gap-2 h-8 text-sm"
                onClick={() => setSocialOpen((o) => !o)}
              >
                <Share2 className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">Social</span>
                {socialOpen ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
              {socialOpen && (
                <div className="ml-4 flex flex-col gap-0.5">
                  {visibleSocial.map((item) => {
                    const href = `/projects/${project.id}/${item.href}`;
                    const isActive = pathname.startsWith(href);
                    const Icon = item.icon;
                    return (
                      <Button
                        key={item.key}
                        variant={isActive ? "secondary" : "ghost"}
                        className="justify-start gap-2 h-7 text-sm"
                        asChild
                      >
                        <Link href={href}>
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      </Button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Other modules */}
          {visibleOther.map((item) => {
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

          {/* Ungated modules (always visible) */}
          {UNGATED_MODULES.map((item) => {
            const href = `/projects/${project.id}/${item.href}`;
            const isActive = pathname.startsWith(href);
            const Icon = item.icon;
            return (
              <Button
                key={item.href}
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

          {/* Funnels (read-only for guests) — colapsável com etapas aninhadas */}
          {funnelList && funnelList.length > 0 && (
            <>
              <Separator className="my-1" />
              {funnelList.map((funnel) => (
                <GuestFunnelItem
                  key={funnel.id}
                  funnel={funnel}
                  projectId={project.id}
                  pathname={pathname}
                />
              ))}
            </>
          )}
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
          Minhas Empresas
        </p>

        {isLoading && (
          <>
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </>
        )}

        {!isLoading && (!projects || projects.length === 0) && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            Nenhuma empresa acessível.
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

  useAutoCloseSidebarOnNavigation(isMobile);

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
