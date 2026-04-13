"use client";

import { useState } from "react";
import { Brain } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMinds } from "@/lib/hooks/use-minds";
import { useLinkMindToProject, useProjectMinds } from "@/lib/hooks/use-project-minds";

interface LinkMindDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkMindDialog({ projectId, open, onOpenChange }: LinkMindDialogProps) {
  const [selectedMindId, setSelectedMindId] = useState<string>("");

  const { squads } = useMinds();
  const { data: linkedMinds } = useProjectMinds(projectId);
  const linkMind = useLinkMindToProject();

  // Only show minds from restricted squads (the ones that need linking)
  const linkedIds = new Set(linkedMinds?.map((m) => m.mindId) ?? []);
  const restrictedSquads = (squads ?? []).filter((s) => s.access?.excludeRoles?.length);
  const availableMinds = restrictedSquads.flatMap((squad) =>
    squad.minds
      .filter((m) => !linkedIds.has(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        squad: squad.displayName,
        specialty: m.specialty,
      })),
  );

  function handleClose() {
    setSelectedMindId("");
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMindId) return;
    await linkMind.mutateAsync(
      { projectId, mindId: selectedMindId },
      {
        onSuccess: () => {
          toast.success("Mind vinculada ao projeto.");
          handleClose();
        },
        onError: () => {
          toast.error("Erro ao vincular mind.");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Vincular Mind ao Projeto
          </DialogTitle>
        </DialogHeader>

        {availableMinds.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">
              Todas as minds já estão vinculadas a este projeto.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Select value={selectedMindId} onValueChange={setSelectedMindId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar mind" />
              </SelectTrigger>
              <SelectContent>
                {availableMinds.map((mind) => (
                  <SelectItem key={mind.id} value={mind.id}>
                    {mind.name}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({mind.squad})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!selectedMindId || linkMind.isPending}>
                {linkMind.isPending ? "Vinculando..." : "Vincular"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
