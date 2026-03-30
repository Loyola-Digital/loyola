"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Instagram, MessageSquare, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/hooks/use-projects";

interface ProjectFolderProps {
  project: Project;
  collapsed?: boolean;
}

const PROJECT_SUBITEMS = [
  { label: "Instagram", href: "instagram", icon: Instagram },
  { label: "Ads", href: "traffic", icon: TrendingUp },
  { label: "Conversas", href: "conversations", icon: MessageSquare },
] as const;

export function ProjectFolder({ project, collapsed = false }: ProjectFolderProps) {
  const pathname = usePathname();
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
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
