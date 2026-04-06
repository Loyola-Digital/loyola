"use client";

import { useState } from "react";
import {
  Youtube,
  Plus,
  Loader2,
  Trash2,
  Link2,
  Unlink,
} from "lucide-react";
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
  useGoogleAdsAccounts,
  useCreateGoogleAdsAccount,
  useDeleteGoogleAdsAccount,
  useLinkGoogleAdsProject,
  useUnlinkGoogleAdsProject,
  type GoogleAdsAccount,
} from "@/lib/hooks/use-google-ads";
import { useProjects } from "@/lib/hooks/use-projects";

function formatCustomerId(id: string): string {
  const clean = id.replace(/-/g, "");
  if (clean.length !== 10) return id;
  return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
}

export default function GoogleAdsSettingsPage() {
  const { data: accounts, isLoading } = useGoogleAdsAccounts();
  const { data: projects } = useProjects();
  const createAccount = useCreateGoogleAdsAccount();
  const deleteAccount = useDeleteGoogleAdsAccount();
  const linkProject = useLinkGoogleAdsProject();
  const unlinkProject = useUnlinkGoogleAdsProject();

  const [accountName, setAccountName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [developerToken, setDeveloperToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<GoogleAdsAccount | null>(null);

  function handleCreate() {
    setFormError("");
    if (!accountName.trim() || !customerId.trim() || !developerToken.trim() || !refreshToken.trim()) {
      setFormError("Preencha todos os campos.");
      return;
    }
    createAccount.mutate(
      {
        accountName: accountName.trim(),
        customerId: customerId.trim(),
        developerToken: developerToken.trim(),
        refreshToken: refreshToken.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Conta Google Ads conectada com sucesso!");
          setAccountName("");
          setCustomerId("");
          setDeveloperToken("");
          setRefreshToken("");
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
          <Youtube className="h-5 w-5 text-red-500" />
          Google Ads / YouTube
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gerencie contas de anuncios Google Ads (YouTube Ads) conectadas a plataforma.
        </p>
      </div>

      {/* Add account form */}
      <div className="rounded-2xl border border-border/30 bg-card/60 p-5 space-y-4">
        <h2 className="text-sm font-semibold">Conectar nova conta</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gAccountName" className="text-xs">Nome da conta</Label>
            <Input
              id="gAccountName"
              placeholder="Minha Conta YouTube"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gCustomerId" className="text-xs">Customer ID</Label>
            <Input
              id="gCustomerId"
              placeholder="123-456-7890"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gDevToken" className="text-xs">Developer Token</Label>
            <Input
              id="gDevToken"
              type="password"
              placeholder="Token do MCC"
              value={developerToken}
              onChange={(e) => setDeveloperToken(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gRefreshToken" className="text-xs">Refresh Token (OAuth2)</Label>
            <Input
              id="gRefreshToken"
              type="password"
              placeholder="1//0xxxxxxx..."
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
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
          <Youtube className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhuma conta Google Ads cadastrada</p>
          <p className="text-sm text-muted-foreground mt-1">
            Adicione uma conta acima para comecar a acompanhar suas campanhas do YouTube.
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
                        {formatCustomerId(account.customerId)}
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
            <AlertDialogTitle>Remover conta Google Ads?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta <strong>{deleteTarget?.accountName}</strong> sera removida permanentemente.
              Todas as vinculacoes com projetos serao perdidas.
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
