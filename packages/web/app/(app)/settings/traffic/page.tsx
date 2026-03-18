"use client";

import { useState } from "react";
import { TrendingUp, Plus, Loader2, Trash2, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  useMetaAdsAccounts,
  useCreateMetaAdsAccount,
  useDeleteMetaAdsAccount,
  useLinkMetaAdsProject,
  useUnlinkMetaAdsProject,
  type MetaAdsAccount,
} from "@/lib/hooks/use-meta-ads";
import { useProjects } from "@/lib/hooks/use-projects";

export default function TrafficSettingsPage() {
  const { data: accounts, isLoading } = useMetaAdsAccounts();
  const { data: projects } = useProjects();
  const createAccount = useCreateMetaAdsAccount();
  const deleteAccount = useDeleteMetaAdsAccount();
  const linkProject = useLinkMetaAdsProject();
  const unlinkProject = useUnlinkMetaAdsProject();

  const [accountName, setAccountName] = useState("");
  const [metaAccountId, setMetaAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MetaAdsAccount | null>(null);

  function handleCreate() {
    setFormError("");
    if (!accountName.trim() || !metaAccountId.trim() || !accessToken.trim()) {
      setFormError("Preencha todos os campos.");
      return;
    }
    createAccount.mutate(
      { accountName: accountName.trim(), metaAccountId: metaAccountId.trim(), accessToken: accessToken.trim() },
      {
        onSuccess: () => {
          toast.success("Conta conectada com sucesso!");
          setAccountName("");
          setMetaAccountId("");
          setAccessToken("");
        },
        onError: (err) => {
          setFormError(err instanceof Error ? err.message : "Erro ao conectar conta.");
        },
      }
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteAccount.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success("Conta removida.");
        setDeleteTarget(null);
      },
      onError: () => toast.error("Erro ao remover conta."),
    });
  }

  function handleLink(accountId: string, projectId: string) {
    linkProject.mutate(
      { accountId, projectId },
      {
        onSuccess: () => toast.success("Projeto vinculado!"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao vincular."),
      }
    );
  }

  function handleUnlink(accountId: string, projectId: string) {
    unlinkProject.mutate(
      { accountId, projectId },
      {
        onSuccess: () => toast.success("Projeto desvinculado."),
        onError: () => toast.error("Erro ao desvincular."),
      }
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Meta Ads / Tráfego
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gerencie contas de anúncios Meta Ads conectadas à plataforma.
        </p>
      </div>

      {/* Add account form */}
      <div className="rounded-2xl border border-border/30 bg-card/60 p-5 space-y-4">
        <h2 className="text-sm font-semibold">Conectar nova conta</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="accountName" className="text-xs">Nome da conta</Label>
            <Input
              id="accountName"
              placeholder="Cliente ABC"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="metaAccountId" className="text-xs">Ad Account ID</Label>
            <Input
              id="metaAccountId"
              placeholder="123456789"
              value={metaAccountId}
              onChange={(e) => setMetaAccountId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accessToken" className="text-xs">Access Token</Label>
            <Input
              id="accessToken"
              type="password"
              placeholder="EAAxxxxxxx..."
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </div>
        </div>
        {formError && (
          <p className="text-sm text-destructive">{formError}</p>
        )}
        <Button onClick={handleCreate} disabled={createAccount.isPending}>
          {createAccount.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Conectar conta
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!accounts || accounts.length === 0) && (
        <div className="rounded-2xl border border-border/30 bg-card/60 p-8 text-center">
          <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhuma conta de anúncios cadastrada</p>
          <p className="text-sm text-muted-foreground mt-1">
            Adicione uma conta Meta Ads acima para começar.
          </p>
        </div>
      )}

      {/* Accounts list */}
      {accounts && accounts.length > 0 && (
        <div className="space-y-4">
          {accounts.map((account) => {
            const linkedProjectIds = new Set(account.projects.map((p) => p.projectId));
            const availableProjects = (projects ?? []).filter(
              (p) => !linkedProjectIds.has(p.id)
            );

            return (
              <div
                key={account.id}
                className="rounded-2xl border border-border/30 bg-card/60 p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{account.accountName}</span>
                      <Badge variant="outline" className="text-[10px]">
                        act_{account.metaAccountId}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Criada em {new Date(account.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive/70 hover:text-destructive"
                    onClick={() => setDeleteTarget(account)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Linked projects */}
                <div className="flex flex-wrap items-center gap-2">
                  {account.projects.map((p) => (
                    <Badge
                      key={p.projectId}
                      variant="secondary"
                      className="flex items-center gap-1 pr-1"
                    >
                      <Link2 className="h-3 w-3" />
                      {p.projectName}
                      <button
                        onClick={() => handleUnlink(account.id, p.projectId)}
                        className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                      >
                        <Unlink className="h-3 w-3 text-destructive/70" />
                      </button>
                    </Badge>
                  ))}

                  {availableProjects.length > 0 && (
                    <Select
                      onValueChange={(projectId) => handleLink(account.id, projectId)}
                    >
                      <SelectTrigger className="h-7 w-[160px] text-xs">
                        <SelectValue placeholder="Vincular projeto..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableProjects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conta de anúncios?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta <strong>{deleteTarget?.accountName}</strong> será removida permanentemente.
              Todas as vinculações com projetos serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
