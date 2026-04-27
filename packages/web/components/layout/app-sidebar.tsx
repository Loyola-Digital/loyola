"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, MessageSquare, CheckSquare, Settings, Plus, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/stores/ui-store";
import { useHiddenProjectsStore } from "@/lib/stores/hidden-projects-store";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { useTasks } from "@/lib/hooks/use-tasks";
import { Badge } from "@/components/ui/badge";
import { useProjects } from "@/lib/hooks/use-projects";
import { ProjectFolder } from "@/components/layout/project-folder";
import { CreateProjectDialog } from "@/components/layout/create-project-dialog";
import { FunnelWizard } from "@/components/funnels/funnel-wizard";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { GuestSidebar } from "@/components/layout/guest-sidebar";
import { useAutoCloseSidebarOnNavigation } from "@/lib/hooks/use-auto-close-sidebar";

const navItems = [
  { label: "Minds", href: "/minds", icon: Brain },
  { label: "Conversations", href: "/conversations", icon: MessageSquare },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

function NavContent({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { total: openTaskCount } = useTasks({ status: "open", limit: 1, offset: 0 });
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const hiddenIds = useHiddenProjectsStore((s) => s.hiddenIds);
  const showHidden = useHiddenProjectsStore((s) => s.showHidden);
  const toggleShowHidden = useHiddenProjectsStore((s) => s.toggleShowHidden);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [wizardProjectId, setWizardProjectId] = useState<string | null>(null);

  const visibleProjects = projects?.filter(
    (p) => showHidden || !hiddenIds.includes(p.id),
  );
  const hiddenCount = projects?.filter((p) => hiddenIds.includes(p.id)).length ?? 0;

  // Split navItems: items before Settings, and Settings itself
  const topItems = navItems.filter((i) => i.href !== "/settings");
  const settingsItem = navItems.find((i) => i.href === "/settings")!;

  return (
    <ScrollArea className="flex-1">
      <nav className="flex flex-col gap-1 p-2">
        {/* Global section */}
        {!collapsed && (
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Global
          </p>
        )}
        {topItems.map((item) => {
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

        {/* Settings */}
        {(() => {
          const isActive = pathname.startsWith(settingsItem.href);
          const Icon = settingsItem.icon;
          return (
            <Button
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "justify-start gap-3",
                collapsed && "justify-center px-2",
              )}
              asChild
            >
              <Link href={settingsItem.href}>
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{settingsItem.label}</span>}
              </Link>
            </Button>
          );
        })()}

        {/* Separator */}
        <Separator className="my-2" />

        {/* Projects section */}
        {!collapsed && (
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Empresas
          </p>
        )}

        {projectsLoading && (
          <>
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </>
        )}

        {!projectsLoading && projects && projects.length === 0 && !collapsed && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            Nenhuma empresa. Crie a primeira.
          </p>
        )}

        {!projectsLoading &&
          visibleProjects?.map((project) => (
            <ProjectFolder
              key={project.id}
              project={project}
              collapsed={collapsed}
              isHidden={hiddenIds.includes(project.id)}
              onNewFunnel={() => setWizardProjectId(project.id)}
            />
          ))}

        {/* Toggle hidden projects */}
        {!projectsLoading && hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="mt-1 text-muted-foreground hover:text-foreground h-7 w-7"
            onClick={toggleShowHidden}
          >
            {showHidden ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </Button>
        )}

        {/* New project button */}
        <Button
          variant="ghost"
          className={cn(
            "justify-start gap-2 mt-1 text-muted-foreground hover:text-foreground",
            collapsed && "justify-center px-2",
          )}
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="text-sm">Nova Empresa</span>}
        </Button>
      </nav>

      <CreateProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {wizardProjectId && (
        <FunnelWizard
          projectId={wizardProjectId}
          open={!!wizardProjectId}
          onOpenChange={(open) => {
            if (!open) setWizardProjectId(null);
          }}
        />
      )}
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
  const role = useUserRole();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  useResponsiveSidebar();

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    handler(mql);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useAutoCloseSidebarOnNavigation(isMobile);

  if (role === null) return null;
  if (role === "guest") return <GuestSidebar />;

  return (
    <>
      {/* Mobile drawer — only mount Sheet on mobile to prevent overlay on desktop */}
      {isMobile && (
        <Sheet
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
        >
          <SheetContent side="left" className="w-[320px] p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle className="flex items-center gap-2">
                <Image src="/logo.svg" alt="Loyola" width={120} height={28} className="brightness-0 invert" />
              </SheetTitle>
            </SheetHeader>
            <NavContent collapsed={false} />
          </SheetContent>
        </Sheet>
      )}

      {/* Desktop sidebar */}
      <aside
        id="app-sidebar"
        className={cn(
          "hidden md:flex flex-col border-r bg-sidebar-background text-sidebar-foreground transition-all duration-200",
          sidebarOpen ? "w-[320px]" : "w-16",
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
