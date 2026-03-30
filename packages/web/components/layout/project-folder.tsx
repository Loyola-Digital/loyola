"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Instagram, MessageSquare, TrendingUp, Rocket, Repeat, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { Project } from "@/lib/hooks/use-projects";
import { useFunnels } from "@/lib/hooks/use-funnels";

interface ProjectFolderProps {
  project: Project;
  collapsed?: boolean;
  onNewFunnel?: () => void;
}

const PROJECT_SUBITEMS = [
  { label: "Instagram", href: "instagram", icon: Instagram },
  { label: "Ads", href: "traffic", icon: TrendingUp },
  { label: "Conversas", href: "conversations", icon: MessageSquare },
] as const;

export function ProjectFolder({ project, collapsed = false, onNewFunnel }: ProjectFolderProps) {
  const pathname = usePathname();
  const { data: funnelList, isLoading: funnelsLoading } = useFunnels(project.id);
  const storageKey = `project-folder-${project.id}`;

  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(storageKey) !== "closed";
  });

  useEffect(() => {
    localStorage.setItem(storageKey, open ? "open" : "closed");
  }, [open, storageKey]);

  const isProjectActive = pathname.startsWith(`/projects/${project.id}`);

  if (collapsed) {
    return (
      <Button
        variant={isProjectActive ? "secondary" : "ghost"}
        className="justify-center px-2 w-full"
        asChild
      >
        <Link href={`/projects/${project.id}`}>
          <span
            className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: project.color ?? "#94a3b8" }}
          />
        </Link>
      </Button>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant={isProjectActive && !pathname.includes("/instagram") && !pathname.includes("/traffic") && !pathname.includes("/conversations") ? "secondary" : "ghost"}
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
          {PROJECT_SUBITEMS.map((item) => {
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

          {/* Funnels section */}
          {(funnelList && funnelList.length > 0 || funnelsLoading) && (
            <Separator className="my-1" />
          )}

          {funnelsLoading && (
            <>
              <Skeleton className="h-7 w-full rounded-md" />
              <Skeleton className="h-7 w-full rounded-md" />
            </>
          )}

          {funnelList?.map((funnel) => {
            const href = `/projects/${project.id}/funnels/${funnel.id}`;
            const isActive = pathname.startsWith(href);
            const FunnelIcon = funnel.type === "launch" ? Rocket : Repeat;
            return (
              <Button
                key={funnel.id}
                variant={isActive ? "secondary" : "ghost"}
                className="justify-start gap-2 h-8 text-sm"
                asChild
              >
                <Link href={href}>
                  <FunnelIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{funnel.name}</span>
                </Link>
              </Button>
            );
          })}

          {onNewFunnel && (
            <Button
              variant="ghost"
              className="justify-start gap-2 h-8 text-sm text-muted-foreground hover:text-foreground"
              onClick={onNewFunnel}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>Novo Funil</span>
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
