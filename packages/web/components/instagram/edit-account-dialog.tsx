"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useUpdateAccount,
  useDeleteAccount,
  type InstagramAccount,
} from "@/lib/hooks/use-instagram-accounts";

// ── Edit Dialog ────────────────────────────────────────────────

interface EditAccountDialogProps {
  account: InstagramAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAccountDialog({
  account,
  open,
  onOpenChange,
}: EditAccountDialogProps) {
  const [accountName, setAccountName] = useState("");
  const [newToken, setNewToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const updateAccount = useUpdateAccount();

  // 4.1 — Pré-preencher ao abrir
  useEffect(() => {
    if (account && open) {
      setAccountName(account.accountName);
      setNewToken("");
      setShowToken(false);
      updateAccount.reset();
    }
  }, [account, open]);

  function handleClose(value: boolean) {
    if (!value) {
      setAccountName("");
      setNewToken("");
      updateAccount.reset();
    }
    onOpenChange(value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;

    try {
      await updateAccount.mutateAsync({
        id: account.id,
        accountName: accountName.trim() || undefined,
        ...(newToken.trim() ? { accessToken: newToken.trim() } : {}),
      });
      toast.success("Conta atualizada com sucesso!");
      handleClose(false);
    } catch {
      // error shown inline
    }
  }

  const errorMessage = updateAccount.error
    ? "Token inválido ou sem permissões necessárias."
    : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Conta</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-accountName">Nome da conta</Label>
            <Input
              id="edit-accountName"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              disabled={updateAccount.isPending}
              required
            />
          </div>

          {/* 4.1 — Token mascarado, só substitui se digitar novo */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-token">Novo Access Token (opcional)</Label>
            <div className="relative">
              <Textarea
                id="edit-token"
                placeholder="Deixe em branco para manter o token atual"
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                disabled={updateAccount.isPending}
                className={`pr-10 resize-none ${
                  !showToken && newToken ? "font-mono tracking-widest" : ""
                }`}
                style={
                  !showToken && newToken
                    ? ({ WebkitTextSecurity: "disc" } as React.CSSProperties)
                    : undefined
                }
                rows={3}
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {newToken.trim() && (
              <p className="text-xs text-muted-foreground">
                O novo token será validado antes de salvar.
              </p>
            )}
          </div>

          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={updateAccount.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={updateAccount.isPending || !accountName.trim()}
            >
              {updateAccount.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {updateAccount.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirmation Dialog ─────────────────────────────────

interface DeleteAccountDialogProps {
  account: InstagramAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({
  account,
  open,
  onOpenChange,
}: DeleteAccountDialogProps) {
  const deleteAccount = useDeleteAccount();

  async function handleConfirm() {
    if (!account) return;
    try {
      await deleteAccount.mutateAsync(account.id);
      toast.success(`Conta "${account.accountName}" removida.`);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Erro ao remover conta: ${msg}`);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover conta?</AlertDialogTitle>
          <AlertDialogDescription>
            A conta <strong>{account?.accountName}</strong> (@
            {account?.instagramUsername}) será removida permanentemente. Esta
            ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteAccount.isPending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleteAccount.isPending}
          >
            {deleteAccount.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
