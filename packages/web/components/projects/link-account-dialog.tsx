"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
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
import { useInstagramAccounts, useAssignAccountToProject } from "@/lib/hooks/use-instagram-accounts";

interface LinkAccountDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkAccountDialog({ projectId, open, onOpenChange }: LinkAccountDialogProps) {
  const [selectedId, setSelectedId] = useState<string>("");

  // All accounts not yet linked to this project
  const { data: allAccounts } = useInstagramAccounts();
  const assignAccount = useAssignAccountToProject();

  const available = allAccounts?.filter((a) => a.projectId !== projectId) ?? [];

  function handleClose() {
    setSelectedId("");
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    await assignAccount.mutateAsync(
      { accountId: selectedId, projectId },
      {
        onSuccess: () => {
          toast.success("Conta vinculada ao projeto.");
          handleClose();
        },
        onError: () => {
          toast.error("Erro ao vincular conta.");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular conta Instagram
          </DialogTitle>
        </DialogHeader>

        {available.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">
              Todas as contas já estão vinculadas a este projeto, ou não há contas cadastradas.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Adicione contas em <strong>Settings → Instagram</strong>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar conta" />
              </SelectTrigger>
              <SelectContent>
                {available.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    @{account.instagramUsername}
                    {account.accountName !== account.instagramUsername &&
                      ` — ${account.accountName}`}
                    {account.projectId && (
                      <span className="ml-1 text-xs text-muted-foreground">(já em outro projeto)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!selectedId || assignAccount.isPending}>
                {assignAccount.isPending ? "Vinculando..." : "Vincular"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
