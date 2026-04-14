"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProject } from "@/lib/hooks/use-projects";
import { useMinds } from "@/lib/hooks/use-minds";
import { useLinkMindToProject } from "@/lib/hooks/use-project-minds";

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#d4a843", // gold
] as const;

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);
  const [selectedMinds, setSelectedMinds] = useState<string[]>([]);

  const createProject = useCreateProject();
  const { squads } = useMinds();
  const linkMind = useLinkMindToProject();

  // Only show minds from restricted squads (Loyola Experts etc.) — public minds don't need linking
  const restrictedSquads = (squads ?? []).filter((s) => s.access?.excludeRoles?.length);
  const allMinds = restrictedSquads.flatMap((squad) =>
    squad.minds.map((m) => ({
      id: m.id,
      name: m.name,
      squad: squad.displayName,
    })),
  );

  function toggleMind(mindId: string) {
    setSelectedMinds((prev) =>
      prev.includes(mindId) ? prev.filter((id) => id !== mindId) : [...prev, mindId],
    );
  }

  function handleClose() {
    setName("");
    setClientName("");
    setColor(PRESET_COLORS[0]);
    setSelectedMinds([]);
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !clientName.trim()) return;

    const project = await createProject.mutateAsync({ name: name.trim(), clientName: clientName.trim(), color });

    // Link selected minds to the new project
    for (const mindId of selectedMinds) {
      await linkMind.mutateAsync({ projectId: project.id, mindId }).catch(() => {});
    }

    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Nova Empresa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">Nome da empresa</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Campanha Verão 2026"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-name">Cliente</Label>
            <Input
              id="client-name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Ex: Empresa XYZ Ltda"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cor</Label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-all",
                    color === c ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>
          {allMinds.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5" />
                Minds da empresa
              </Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Selecione as minds que convidados poderão acessar nesta empresa.
              </p>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto rounded-md border p-2">
                {allMinds.map((mind) => (
                  <button
                    key={mind.id}
                    type="button"
                    onClick={() => toggleMind(mind.id)}
                    className={cn(
                      "flex items-center gap-2 rounded px-2 py-1.5 text-sm text-left transition-colors",
                      selectedMinds.includes(mind.id)
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted/50",
                    )}
                  >
                    <span className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      selectedMinds.includes(mind.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30",
                    )}>
                      {selectedMinds.includes(mind.id) && <Check className="h-3 w-3" />}
                    </span>
                    <span>{mind.name}</span>
                    <span className="text-xs text-muted-foreground">({mind.squad})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createProject.isPending || linkMind.isPending}>
              {createProject.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
