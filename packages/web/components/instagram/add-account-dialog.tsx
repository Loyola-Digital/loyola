"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddAccount,
  type InstagramAccount,
} from "@/lib/hooks/use-instagram-accounts";

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  accountName: string;
  accessToken: string;
}

const EMPTY_FORM: FormState = { accountName: "", accessToken: "" };

export function AddAccountDialog({ open, onOpenChange }: AddAccountDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showToken, setShowToken] = useState(false);
  const [savedAccount, setSavedAccount] = useState<InstagramAccount | null>(null);

  const addAccount = useAddAccount();

  function handleClose(value: boolean) {
    if (!value) {
      setForm(EMPTY_FORM);
      setShowToken(false);
      setSavedAccount(null);
      addAccount.reset();
    }
    onOpenChange(value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.accountName.trim() || !form.accessToken.trim()) return;

    try {
      const account = await addAccount.mutateAsync({
        accountName: form.accountName.trim(),
        accessToken: form.accessToken.trim(),
      });
      setSavedAccount(account);
      toast.success("Conta adicionada com sucesso!");
      setTimeout(() => handleClose(false), 2000);
    } catch {
      // error shown inline via addAccount.error
    }
  }

  const errorMessage = addAccount.error
    ? addAccount.error.message.includes("já está cadastrada")
      ? "Esta conta do Instagram já está cadastrada."
      : "Token inválido ou sem permissões necessárias."
    : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Conta Instagram</DialogTitle>
        </DialogHeader>

        {/* 3.6 — Sucesso: preview do perfil */}
        {savedAccount ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="font-medium">@{savedAccount.instagramUsername}</p>
            <p className="text-sm text-muted-foreground">Conta conectada!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 3.2 — Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="accountName">Nome da conta</Label>
              <Input
                id="accountName"
                placeholder="Ex: Cliente ABC"
                value={form.accountName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accountName: e.target.value }))
                }
                disabled={addAccount.isPending}
                required
              />
            </div>

            {/* 3.4 — Token com toggle */}
            <div className="space-y-1.5">
              <Label htmlFor="accessToken">Access Token</Label>
              <div className="relative">
                <Textarea
                  id="accessToken"
                  placeholder="Cole o access token aqui..."
                  value={form.accessToken}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, accessToken: e.target.value }))
                  }
                  disabled={addAccount.isPending}
                  className={`pr-10 resize-none ${
                    !showToken ? "font-mono tracking-widest" : ""
                  }`}
                  style={
                    !showToken && form.accessToken
                      ? ({ WebkitTextSecurity: "disc" } as React.CSSProperties)
                      : undefined
                  }
                  rows={3}
                  required
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
              <p className="text-xs text-muted-foreground">
                O token será validado automaticamente ao salvar.
              </p>
            </div>

            {/* 3.7 — Erro inline */}
            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={addAccount.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  addAccount.isPending ||
                  !form.accountName.trim() ||
                  !form.accessToken.trim()
                }
              >
                {addAccount.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {addAccount.isPending ? "Validando..." : "Adicionar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
