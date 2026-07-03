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
import { Textarea } from "@/components/ui/textarea";
import {
  useUpdateDebriefing,
  type DebriefingDetail,
} from "@/lib/hooks/use-debriefings";

// Story 37.1 — dialog de edição com 3 caminhos:
//  (a) corrigir o nome da campanha;
//  (b) re-upload de um novo arquivo HTML (substitui o doc — caso mais comum);
//  (c) editar o código-fonte direto na textarea (correção pontual de dado).
// Se um arquivo for selecionado, ele tem precedência sobre a textarea.

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
  const [html, setHtml] = useState(debriefing.html);
  const [file, setFile] = useState<File | null>(null);
  const update = useUpdateDebriefing(debriefing.id);

  // Re-sincroniza os campos ao abrir (o detalhe pode ter sido editado por outro)
  useEffect(() => {
    if (open) {
      setCampaignName(debriefing.campaignName);
      setHtml(debriefing.html);
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
    const htmlChanged = !file && html !== debriefing.html;

    if (!file && !nameChanged && !htmlChanged) {
      onOpenChange(false);
      return;
    }
    if (htmlChanged && !html.trim()) {
      toast.error("O código HTML não pode ficar vazio.");
      return;
    }

    update.mutate(
      {
        campaignName: nameChanged || file ? trimmedName : undefined,
        html: htmlChanged ? html : undefined,
        file,
      },
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar debriefing</DialogTitle>
          <DialogDescription>
            Corrija o nome, suba um novo arquivo (substitui o atual) ou edite o
            código-fonte para ajustes pontuais.
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
              Substituir por novo arquivo HTML (opcional)
            </Label>
            <Input
              id="edit-debriefing-file"
              type="file"
              accept=".html,.htm,text/html"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-debriefing-html">Código-fonte HTML</Label>
            <Textarea
              id="edit-debriefing-html"
              className="font-mono text-xs h-64"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              disabled={!!file}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                O arquivo selecionado substituirá o conteúdo — a edição de
                código fica desabilitada.
              </p>
            )}
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
