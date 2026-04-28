"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFunnels } from "@/lib/hooks/use-funnels";
import { useFunnelStages } from "@/lib/hooks/use-funnel-stages";
import { useLinkOrganicPost } from "@/lib/hooks/use-organic-posts";
import type { OrganicPostSource } from "@loyola-x/shared";

interface LinkPostToStageModalProps {
  projectId: string;
  source: OrganicPostSource;
  externalId: string;
  postTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkPostToStageModal({
  projectId,
  source,
  externalId,
  postTitle,
  open,
  onOpenChange,
}: LinkPostToStageModalProps) {
  const { data: funnels, isLoading: funnelsLoading } = useFunnels(open ? projectId : null);

  const [selectedFunnelId, setSelectedFunnelId] = useState<string>("");
  const [selectedStageId, setSelectedStageId] = useState<string>("");

  const { data: stages, isLoading: stagesLoading } = useFunnelStages(
    open ? projectId : null,
    selectedFunnelId || null,
  );

  const linkMutation = useLinkOrganicPost(projectId);

  const sortedFunnels = useMemo(
    () => (funnels ? [...funnels].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [funnels],
  );

  const sortedStages = useMemo(
    () => (stages ? [...stages].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [stages],
  );

  async function handleLink() {
    if (!selectedFunnelId || !selectedStageId) return;
    try {
      await linkMutation.mutateAsync({
        funnelId: selectedFunnelId,
        stageId: selectedStageId,
        source,
        externalId,
      });
      toast.success("Post vinculado à etapa");
      // Reset stage so user can quickly link to another stage
      setSelectedStageId("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao vincular";
      if (msg.includes("already_linked") || msg.includes("409")) {
        toast.info("Este post já está vinculado a esta etapa");
      } else {
        toast.error(msg);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular a uma etapa do funil</DialogTitle>
          <DialogDescription className="line-clamp-2">{postTitle}</DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Para desvincular um post de uma etapa, abra o dashboard da etapa e use a
          aba <span className="font-medium">Mídias Orgânicas</span>.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Funil
            </label>
            {funnelsLoading ? (
              <Skeleton className="h-9" />
            ) : !funnels || funnels.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
                Nenhum funil neste projeto.{" "}
                <Link
                  href={`/projects/${projectId}/funnels`}
                  className="text-primary underline"
                  onClick={() => onOpenChange(false)}
                >
                  Criar funil
                </Link>
              </div>
            ) : (
              <Select
                value={selectedFunnelId}
                onValueChange={(v) => {
                  setSelectedFunnelId(v);
                  setSelectedStageId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um funil..." />
                </SelectTrigger>
                <SelectContent>
                  {sortedFunnels.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Etapa
            </label>
            {!selectedFunnelId ? (
              <div className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
                Selecione um funil primeiro.
              </div>
            ) : stagesLoading ? (
              <Skeleton className="h-9" />
            ) : !stages || stages.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
                Este funil não tem etapas ainda.
              </div>
            ) : (
              <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma etapa..." />
                </SelectTrigger>
                <SelectContent>
                  {sortedStages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            onClick={handleLink}
            disabled={!selectedFunnelId || !selectedStageId || linkMutation.isPending}
          >
            {linkMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
