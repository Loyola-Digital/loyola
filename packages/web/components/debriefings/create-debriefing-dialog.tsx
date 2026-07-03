"use client";

import { useState } from "react";
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
import { useCreateDebriefing } from "@/lib/hooks/use-debriefings";

// Story 37.1 — dialog de criação: nome da campanha + upload do doc HTML.

export function CreateDebriefingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [campaignName, setCampaignName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const create = useCreateDebriefing();

  function handleSubmit() {
    if (!campaignName.trim()) {
      toast.error("Informe o nome da campanha.");
      return;
    }
    if (!file) {
      toast.error("Selecione o arquivo HTML do debriefing.");
      return;
    }
    create.mutate(
      { campaignName: campaignName.trim(), file },
      {
        onSuccess: () => {
          toast.success("Debriefing criado!");
          setCampaignName("");
          setFile(null);
          onOpenChange(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar"),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo debriefing</DialogTitle>
          <DialogDescription>
            Informe a campanha e suba o documento HTML — ele será exibido na
            plataforma exatamente como é.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="debriefing-campaign">Nome da campanha</Label>
            <Input
              id="debriefing-campaign"
              placeholder="Ex.: DGPG-03"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="debriefing-file">Documento HTML (máx. 5MB)</Label>
            <Input
              id="debriefing-file"
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
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? "Enviando..." : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
