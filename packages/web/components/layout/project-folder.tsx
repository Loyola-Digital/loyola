"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, ChevronDown, Instagram, MessageSquare, TrendingUp, Rocket, Repeat, Plus, MoreHorizontal, Trash2, Share2, Youtube, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { Project } from "@/lib/hooks/use-projects";
import { useDeleteProject, useUpdateProject } from "@/lib/hooks/use-projects";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFunnels } from "@/lib/hooks/use-funnels";

interface ProjectFolderProps {
  project: Project;
  collapsed?: boolean;
  onNewFunnel?: () => void;
}

const SOCIAL_SUBITEMS = [
  { label: "Instagram", href: "instagram", icon: Instagram },
  { label: "YouTube", href: "youtube-organic", icon: Youtube },
] as const;

const PROJECT_SUBITEMS = [
  { label: "Ads", href: "traffic", icon: TrendingUp },
  { label: "YouTube Ads", href: "youtube", icon: Youtube },
  { label: "Conversas", href: "conversations", icon: MessageSquare },
] as const;

export function ProjectFolder({ project, collapsed = false, onNewFunnel }: ProjectFolderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: funnelList, isLoading: funnelsLoading } = useFunnels(project.id);
  const deleteProject = useDeleteProject();
  const updateProject = useUpdateProject();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editColor, setEditColor] = useState(project.color ?? "#94a3b8");
  const storageKey = `project-folder-${project.id}`;
  const socialKey = `social-group-${project.id}`;

  const isSocialActive = SOCIAL_SUBITEMS.some((s) => pathname.includes(`/${s.href}`));
  const [socialOpen, setSocialOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(socialKey);
    if (stored !== null) return stored !== "closed";
    return isSocialActive; // only open if user is on a social page
  });

  useEffect(() => {
    if (isSocialActive && !socialOpen) setSocialOpen(true);
  }, [isSocialActive, socialOpen]);

  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) return stored !== "closed";
    return isProjectActive; // only open if user is inside this project
  });

  useEffect(() => {
    localStorage.setItem(storageKey, open ? "open" : "closed");
  }, [open, storageKey]);

  useEffect(() => {
    localStorage.setItem(socialKey, socialOpen ? "open" : "closed");
  }, [socialOpen, socialKey]);

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

  async function handleDelete() {
    try {
      await deleteProject.mutateAsync(project.id);
      toast.success(`Projeto "${project.name}" deletado.`);
      router.push("/");
    } catch {
      toast.error("Erro ao deletar projeto.");
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group flex items-center">
        <CollapsibleTrigger asChild>
          <Button
            variant={isProjectActive && !pathname.includes("/instagram") && !pathname.includes("/traffic") && !pathname.includes("/conversations") ? "secondary" : "ghost"}
            className="flex-1 justify-start gap-2 px-2"
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setEditName(project.name); setEditColor(project.color ?? "#94a3b8"); setShowEditDialog(true); }}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar projeto
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowDeleteAlert(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Deletar projeto
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              O projeto <strong>{project.name}</strong> e todos os seus dados (funis, conversas, vínculos) serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProject.isPending ? "Deletando..." : "Deletar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit project dialog */}
      <AlertDialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Editar projeto</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-xs">Nome do projeto</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cor</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="h-9 w-12 rounded border border-border cursor-pointer" />
                <div className="flex gap-1.5">
                  {["#d4a843", "#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#f97316", "#ec4899", "#94a3b8"].map((c) => (
                    <button key={c} onClick={() => setEditColor(c)}
                      className={`h-7 w-7 rounded-full border-2 transition-all ${editColor === c ? "border-foreground scale-110" : "border-transparent hover:border-border"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!editName.trim() || updateProject.isPending}
              onClick={() => {
                updateProject.mutate({ id: project.id, name: editName.trim(), color: editColor }, {
                  onSuccess: () => { toast.success("Projeto atualizado!"); setShowEditDialog(false); },
                  onError: () => toast.error("Erro ao atualizar."),
                });
              }}
            >
              {updateProject.isPending ? "Salvando..." : "Salvar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CollapsibleContent>
        <div className="ml-4 flex flex-col gap-0.5 border-l pl-2 py-1">
          {/* Social group (collapsible) */}
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
              {SOCIAL_SUBITEMS.map((item) => {
                const href = `/projects/${project.id}/${item.href}`;
                const isActive = pathname.startsWith(href);
                const Icon = item.icon;
                return (
                  <Button
                    key={item.href}
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

          {/* Other modules */}
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
