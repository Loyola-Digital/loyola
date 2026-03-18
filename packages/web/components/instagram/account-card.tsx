"use client";

import { formatDistanceToNow, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MoreVertical, Pencil, Trash2, RefreshCw, X, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjects } from "@/lib/hooks/use-projects";
import {
  useLinkAccountToProject,
  useUnlinkAccountFromProject,
  type InstagramAccount,
} from "@/lib/hooks/use-instagram-accounts";
import { toast } from "sonner";

interface AccountCardProps {
  account: InstagramAccount;
  onEdit: (account: InstagramAccount) => void;
  onDelete: (account: InstagramAccount) => void;
  onRefresh: (id: string) => void;
  isRefreshing?: boolean;
}

// 2.2 — Badge de status
function TokenStatusBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) {
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
        Válido
      </Badge>
    );
  }

  const daysUntilExpiry = differenceInDays(new Date(expiresAt), new Date());

  if (daysUntilExpiry < 0) {
    return (
      <Badge variant="destructive">
        Expirado
      </Badge>
    );
  }

  if (daysUntilExpiry < 7) {
    return (
      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
        Expira em {daysUntilExpiry} dia{daysUntilExpiry !== 1 ? "s" : ""}
      </Badge>
    );
  }

  return (
    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
      Válido
    </Badge>
  );
}

export function AccountCard({
  account,
  onEdit,
  onDelete,
  onRefresh,
  isRefreshing,
}: AccountCardProps) {
  const { data: projects } = useProjects();
  const linkAccount = useLinkAccountToProject();
  const unlinkAccount = useUnlinkAccountFromProject();

  const initials = account.accountName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Projects not yet linked to this account
  const availableProjects = projects?.filter(
    (p) => !account.projectIds.includes(p.id),
  ) ?? [];

  // Projects currently linked
  const linkedProjects = projects?.filter((p) =>
    account.projectIds.includes(p.id),
  ) ?? [];

  function handleLink(projectId: string) {
    linkAccount.mutate(
      { accountId: account.id, projectId },
      {
        onSuccess: () => toast.success("Conta vinculada ao projeto."),
        onError: () => toast.error("Erro ao vincular."),
      },
    );
  }

  function handleUnlink(projectId: string) {
    unlinkAccount.mutate(
      { accountId: account.id, projectId },
      {
        onSuccess: () => toast.success("Vínculo removido."),
        onError: () => toast.error("Erro ao remover vínculo."),
      },
    );
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <Avatar className="h-12 w-12 shrink-0">
            {account.profilePictureUrl && (
              <AvatarImage
                src={account.profilePictureUrl}
                alt={account.instagramUsername}
              />
            )}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">{account.accountName}</span>
              <TokenStatusBadge expiresAt={account.tokenExpiresAt} />
            </div>
            <p className="text-sm text-muted-foreground">
              @{account.instagramUsername}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {account.lastSyncedAt && (
                <span>
                  Sync:{" "}
                  {formatDistanceToNow(new Date(account.lastSyncedAt), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </span>
              )}
              {account.tokenExpiresAt && (
                <span>
                  Expira:{" "}
                  {new Date(account.tokenExpiresAt).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>

            {/* Project links */}
            {projects && projects.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {linkedProjects.map((p) => (
                  <Badge
                    key={p.id}
                    variant="secondary"
                    className="flex items-center gap-1 pr-1"
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: p.color ?? "#94a3b8" }}
                    />
                    {p.name}
                    <button
                      onClick={() => handleUnlink(p.id)}
                      disabled={unlinkAccount.isPending}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {availableProjects.length > 0 && (
                  <Select onValueChange={handleLink} disabled={linkAccount.isPending}>
                    <SelectTrigger className="h-6 w-auto border-dashed px-2 text-xs gap-1">
                      <Plus className="h-3 w-3" />
                      <SelectValue placeholder="Projeto" />
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
            )}
          </div>

          {/* 2.3 — Ações via DropdownMenu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Ações</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(account)}>
                <Pencil className="h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onRefresh(account.id)}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Atualizar cache
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(account)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
