"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Youtube,
  Loader2,
  Trash2,
  Link2,
  Unlink,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  useDeleteGoogleAdsAccount,
  useLinkGoogleAdsProject,
  useUnlinkGoogleAdsProject,
  useGoogleAdsAuthUrl,
  useGoogleAdsAuthCallback,
  useGoogleAdsOAuthConnect,
  type GoogleAdsAccount,
  type GoogleAdsAccessibleAccount,
} from "@/lib/hooks/use-google-ads";
import { useProjects } from "@/lib/hooks/use-projects";

function formatCustomerId(id: string): string {
  const clean = id.replace(/-/g, "");
  if (clean.length !== 10) return id;
  return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
}

type OAuthStep = "idle" | "authorizing" | "picking" | "connecting";

export default function GoogleAdsSettingsPage() {
  const { data: accounts, isLoading } = useGoogleAdsAccounts();
  const { data: projects } = useProjects();
  const deleteAccount = useDeleteGoogleAdsAccount();
  const linkProject = useLinkGoogleAdsProject();
  const unlinkProject = useUnlinkGoogleAdsProject();
  const getAuthUrl = useGoogleAdsAuthUrl();
  const authCallback = useGoogleAdsAuthCallback();
  const oauthConnect = useGoogleAdsOAuthConnect();

  const [deleteTarget, setDeleteTarget] = useState<GoogleAdsAccount | null>(null);
  const [oauthStep, setOauthStep] = useState<OAuthStep>("idle");
  const [availableAccounts, setAvailableAccounts] = useState<GoogleAdsAccessibleAccount[]>([]);
  const [refreshToken, setRefreshToken] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState("");

  // Listen for OAuth callback message from popup
  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "google-ads-auth") return;

    if (event.data.error) {
      toast.error("Autorizacao cancelada ou falhou.");
      setOauthStep("idle");
      return;
    }

    if (event.data.code) {
      setOauthStep("authorizing");
      authCallback.mutate(
        { code: event.data.code, redirectUri },
        {
          onSuccess: (data) => {
            setRefreshToken(data.refreshToken);
            setAvailableAccounts(data.accounts);
            setOauthStep("picking");
            if (data.accounts.length === 0) {
              toast.error("Nenhuma conta Google Ads acessivel encontrada.");
              setOauthStep("idle");
            }
          },
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Erro na autenticacao.");
            setOauthStep("idle");
          },
        }
      );
    }
  }, [authCallback, redirectUri]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  function handleStartOAuth() {
    setOauthStep("authorizing");
    getAuthUrl.mutate(undefined, {
      onSuccess: (data) => {
        setRedirectUri(data.redirectUri);
        // Open popup
        const w = 500, h = 600;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        window.open(
          data.url,
          "google-ads-auth",
          `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
        );
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Erro ao iniciar OAuth.");
        setOauthStep("idle");
      },
    });
  }

  function handleConnect() {
    if (!selectedCustomerId || !refreshToken) return;
    const account = availableAccounts.find((a) => a.customerId === selectedCustomerId);
    if (!account) return;

    setOauthStep("connecting");
    oauthConnect.mutate(
      {
        accountName: account.descriptiveName,
        customerId: account.customerId,
        refreshToken,
      },
      {
        onSuccess: () => {
          toast.success("Conta Google Ads conectada!");
          setOauthStep("idle");
          setAvailableAccounts([]);
          setRefreshToken("");
          setSelectedCustomerId(null);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Erro ao conectar.");
          setOauthStep("picking");
        },
      }
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteAccount.mutate(deleteTarget.id, {
      onSuccess: () => { toast.success("Conta removida."); setDeleteTarget(null); },
      onError: () => toast.error("Erro ao remover conta."),
    });
  }

  function handleLink(accountId: string, projectId: string) {
    linkProject.mutate({ accountId, projectId }, {
      onSuccess: () => toast.success("Projeto vinculado!"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao vincular."),
    });
  }

  function handleUnlink(accountId: string, projectId: string) {
    unlinkProject.mutate({ accountId, projectId }, {
      onSuccess: () => toast.success("Projeto desvinculado."),
      onError: () => toast.error("Erro ao desvincular."),
    });
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
          Conecte contas de anuncios Google Ads para acompanhar campanhas do YouTube.
        </p>
      </div>

      {/* OAuth Connect */}
      <div className="rounded-2xl border border-border/30 bg-card/60 p-5 space-y-4">
        <h2 className="text-sm font-semibold">Conectar nova conta</h2>

        {oauthStep === "idle" && (
          <Button onClick={handleStartOAuth} disabled={getAuthUrl.isPending} className="gap-2">
            {getAuthUrl.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            )}
            Conectar com Google
          </Button>
        )}

        {oauthStep === "authorizing" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Aguardando autorizacao no Google...
          </div>
        )}

        {oauthStep === "picking" && availableAccounts.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Selecione a conta Google Ads para conectar:
            </p>
            <div className="space-y-2">
              {availableAccounts.map((acc) => (
                <button
                  key={acc.customerId}
                  onClick={() => setSelectedCustomerId(acc.customerId)}
                  className={`w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                    selectedCustomerId === acc.customerId
                      ? "border-primary bg-primary/5"
                      : "border-border/30 hover:border-border/60"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">{acc.descriptiveName}</p>
                    <p className="text-xs text-muted-foreground">{formatCustomerId(acc.customerId)}</p>
                  </div>
                  {selectedCustomerId === acc.customerId && (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleConnect} disabled={!selectedCustomerId || oauthConnect.isPending}>
                {oauthConnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Conectar conta selecionada
              </Button>
              <Button variant="outline" onClick={() => { setOauthStep("idle"); setAvailableAccounts([]); }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {oauthStep === "connecting" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Conectando conta...
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!accounts || accounts.length === 0) && (
        <div className="rounded-2xl border border-border/30 bg-card/60 p-8 text-center">
          <Youtube className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhuma conta Google Ads cadastrada</p>
          <p className="text-sm text-muted-foreground mt-1">
            Clique em "Conectar com Google" acima para comecar.
          </p>
        </div>
      )}

      {/* Accounts list */}
      {accounts && accounts.length > 0 && (
        <div className="space-y-4">
          {accounts.map((account) => {
            const linkedProjectIds = new Set(account.projects.map((p) => p.projectId));
            const availableProjects = (projects ?? []).filter((p) => !linkedProjectIds.has(p.id));

            return (
              <div key={account.id} className="rounded-2xl border border-border/30 bg-card/60 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{account.accountName}</span>
                      <Badge variant="outline" className="text-[10px]">{formatCustomerId(account.customerId)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Criada em {new Date(account.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive/70 hover:text-destructive" onClick={() => setDeleteTarget(account)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {account.projects.map((p) => (
                    <Badge key={p.projectId} variant="secondary" className="flex items-center gap-1 pr-1">
                      <Link2 className="h-3 w-3" />
                      {p.projectName}
                      <button onClick={() => handleUnlink(account.id, p.projectId)} className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 transition-colors">
                        <Unlink className="h-3 w-3 text-destructive/70" />
                      </button>
                    </Badge>
                  ))}
                  {availableProjects.length > 0 && (
                    <Select onValueChange={(projectId) => handleLink(account.id, projectId)}>
                      <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue placeholder="Vincular projeto..." /></SelectTrigger>
                      <SelectContent>
                        {availableProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
