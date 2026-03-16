"use client";

import { useState } from "react";
import { Instagram, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AccountCard } from "@/components/instagram/account-card";
import { AddAccountDialog } from "@/components/instagram/add-account-dialog";
import {
  EditAccountDialog,
  DeleteAccountDialog,
} from "@/components/instagram/edit-account-dialog";
import { TokenGuide } from "@/components/instagram/token-guide";
import {
  useInstagramAccounts,
  useRefreshAccount,
  type InstagramAccount,
} from "@/lib/hooks/use-instagram-accounts";

// 5.3 — Empty state
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Instagram className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">Nenhuma conta cadastrada</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Adicione sua primeira conta do Instagram para começar.
        </p>
      </div>
      <Button onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Adicionar Conta
      </Button>
    </div>
  );
}

export default function InstagramSettingsPage() {
  const { data: accounts, isLoading } = useInstagramAccounts();
  const refreshAccount = useRefreshAccount();

  const [addOpen, setAddOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<InstagramAccount | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<InstagramAccount | null>(null);

  function handleRefresh(id: string) {
    refreshAccount.mutate(id, {
      onSuccess: () => toast.success("Cache atualizado!"),
      onError: () => toast.error("Erro ao atualizar cache."),
    });
  }

  return (
    <div className="space-y-6">
      {/* 1 — Header card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Instagram className="h-5 w-5" />
                Meta / Instagram
              </CardTitle>
              <CardDescription className="mt-1">
                Gerencie as contas de Instagram conectadas à plataforma.
              </CardDescription>
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Adicionar Conta
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && (!accounts || accounts.length === 0) && (
            <EmptyState onAdd={() => setAddOpen(true)} />
          )}

          {/* 5.4 — Grid de cards (responsivo: 1 col mobile, 2 cols md+) */}
          {!isLoading && accounts && accounts.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onEdit={(a) => setEditAccount(a)}
                  onDelete={(a) => setDeleteAccount(a)}
                  onRefresh={handleRefresh}
                  isRefreshing={
                    refreshAccount.isPending &&
                    refreshAccount.variables === account.id
                  }
                />
              ))}
            </div>
          )}

          {/* 10 — Guia colapsável */}
          <div className="pt-2 border-t">
            <TokenGuide />
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />

      <EditAccountDialog
        account={editAccount}
        open={editAccount !== null}
        onOpenChange={(open) => {
          if (!open) setEditAccount(null);
        }}
      />

      <DeleteAccountDialog
        account={deleteAccount}
        open={deleteAccount !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteAccount(null);
        }}
      />
    </div>
  );
}
