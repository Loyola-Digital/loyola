"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, MessageSquare, CheckSquare, Settings, Plus, Eye, EyeOff, LayoutDashboard, LayoutGrid, Radar, Library, Map as MapIcon, Users, CalendarRange } from "lucide-react";
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
  // Ficha, férias e PDI de cada pessoa — o PDI virou aba daqui, e /pdi
  // redireciona. Admin vê o time; os demais caem na própria ficha (o guard e o
  // recorte de campos são do servidor).
  { label: "Pessoal", href: "/pessoal", icon: Users },
  // O calendário do time: campanhas e suas fases, antes de virarem funil. A
  // rota segue `/planner` — trocar a URL quebraria os links já compartilhados,
  // e o nome no menu é o que as pessoas leem.
  { label: "Calendário", href: "/planner", icon: CalendarRange },
  // Epic 31: Sprint Dashboard — só visível pra não-guests (guard server-side)
  { label: "Sprint Semanal", href: "/sprint-dashboard", icon: LayoutGrid },
  // Os mapas vivem dentro de etapa > funil > projeto; aqui ficam todos juntos,
  // para comparar e editar sem navegar três níveis por desenho.
  { label: "Funis", href: "/funnel-maps", icon: MapIcon },
  { label: "Minds", href: "/minds", icon: Brain },
  // Filha de Minds: aparece quando se está em Minds ou nela própria. A conversa
  // acontece COM um mind — fora desse contexto, o item é uma porta para uma
  // sala em que ninguém entra direto.
  { label: "Conversations", href: "/conversations", icon: MessageSquare, filhoDe: "/minds" },
  // Epic 45: dashboards montaveis com widgets prontos, sem tela nova por pergunta.
  { label: "BI", href: "/bi", icon: LayoutDashboard },
  // Spy de Conteúdo: raio-x de perfil de terceiro no Instagram (Apify + Claude).
  // Não confundir com /instagram, que é insights das contas PRÓPRIAS via Meta API.
  { label: "Spy de Conteúdo", href: "/spy-conteudo", icon: Radar },
  // Biblioteca de referências de anúncios do time (print/vídeo/link).
  { label: "Swipe Files", href: "/swipe-files", icon: Library },
  // Epic 37: Debriefing saiu do menu global — agora é etapa de funil
  // (stageType "debriefing"); as rotas /debriefings/* seguem servindo o detalhe.
  { label: "Configurações", href: "/settings", icon: Settings },
] as const;

/**
 * Fica por ÚLTIMO e só para admin.
 *
 * É o painel de tarefas dos agentes, não uma seção do produto: quem não
 * administra o sistema não tem o que fazer ali, e a posição no fim diz isso
 * sem precisar de explicação. Fora de `navItems` porque a ordem e a permissão
 * dele não são as das demais.
 */
const TASKS_AGENTS = { label: "Tasks Agents", href: "/tasks", icon: CheckSquare } as const;

function NavContent({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { total: openTaskCount } = useTasks({ status: "open", limit: 1, offset: 0 });
  const papel = useUserRole();
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

  // Split navItems: items before Settings, and Settings itself.
  // PDI só entra pra quem tem um documento atribuído (é a tela inicial dessa
  // pessoa) ou pra admin, que precisa do acesso à gestão. Pra quem não tem, o
  // item seria um link pra tela vazia.
  const topItems = navItems.filter((i) => {
    if (i.href === "/settings") return false;
    return true;
  });
  const settingsItem = navItems.find((i) => i.href === "/settings")!;

  return (
    <ScrollArea className="flex-1 min-h-0">
      <nav className="flex flex-col gap-1 p-2">
        {/* Global section */}
        {!collapsed && (
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Global
          </p>
        )}
        {topItems.map((item) => {
          // Subitem só aparece dentro do contexto do pai: em Minds ou nele
          // próprio. Mostrá-lo sempre poluiria o menu com uma opção que só faz
          // sentido depois de escolher um mind.
          if ("filhoDe" in item) {
            const pai = item.filhoDe as string;
            const noContexto = pathname.startsWith(pai) || pathname.startsWith(item.href);
            if (!noContexto) return null;
          }
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Button
              key={item.href}
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "justify-start gap-3",
                collapsed && "justify-center px-2",
                // Recuo em vez de menu sanfonado: a relação com o pai fica
                // visível o tempo todo, e não custa um clique para descobrir.
                "filhoDe" in item && !collapsed && "pl-9",
              )}
              asChild
            >
              <Link href={item.href}>
                <Icon
                  className={cn("shrink-0", "filhoDe" in item ? "h-4 w-4" : "h-5 w-5")}
                />
                {!collapsed && <span>{item.label}</span>}
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

        {/* Tasks Agents fecha o bloco Global, depois de Configurações, e só
            para admin. Ele estava DEPOIS de Empresas — o fim absoluto da barra,
            longe do menu a que pertence. */}
        {papel === "admin" && (
          <Button
            variant={pathname.startsWith(TASKS_AGENTS.href) ? "secondary" : "ghost"}
            className={cn("justify-start gap-3", collapsed && "justify-center px-2")}
            asChild
          >
            <Link href={TASKS_AGENTS.href}>
              <TASKS_AGENTS.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{TASKS_AGENTS.label}</span>}
              {openTaskCount > 0 && !collapsed && (
                <Badge variant="secondary" className="ml-auto px-1.5 py-0 text-[10px]">
                  {openTaskCount}
                </Badge>
              )}
            </Link>
          </Button>
        )}

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
