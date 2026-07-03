"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useUpdateDebriefing,
  type DebriefingDetail,
} from "@/lib/hooks/use-debriefings";

// Story 37.2 — dialog reduzido a "Renomear / substituir arquivo". A edição do
// CONTEÚDO do doc agora é inline na página de detalhe (designMode no iframe),
// então a textarea de código-fonte foi removida.

export function EditDebriefingDialog({
  debriefing,
  open,
  onOpenChange,
}: {
  debriefing: DebriefingDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [campaignName, setCampaignName] = useState(debriefing.campaignName);
  const [file, setFile] = useState<File | null>(null);
  const update = useUpdateDebriefing(debriefing.id);

  // Re-sincroniza ao abrir (o detalhe pode ter sido editado por outro)
  useEffect(() => {
    if (open) {
      setCampaignName(debriefing.campaignName);
      setFile(null);
    }
  }, [open, debriefing]);

  function handleSubmit() {
    const trimmedName = campaignName.trim();
    if (!trimmedName) {
      toast.error("O nome da campanha não pode ficar vazio.");
      return;
    }

    const nameChanged = trimmedName !== debriefing.campaignName;
    if (!file && !nameChanged) {
      onOpenChange(false);
      return;
    }

    update.mutate(
      { campaignName: trimmedName, file },
      {
        onSuccess: () => {
          toast.success("Debriefing atualizado!");
          onOpenChange(false);
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renomear / substituir arquivo</DialogTitle>
          <DialogDescription>
            Para corrigir o conteúdo do documento, use o botão &quot;Editar&quot;
            na página — a edição é direto no doc renderizado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-debriefing-campaign">Nome da campanha</Label>
            <Input
              id="edit-debriefing-campaign"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-debriefing-file">
              Substituir por novo arquivo HTML (opcional, máx. 5MB)
            </Label>
            <Input
              id="edit-debriefing-file"
              type="file"
              accept=".html,.htm,text/html"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={update.isPending}>
            {update.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
