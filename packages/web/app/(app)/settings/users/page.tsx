"use client";

import { Users, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdminUsers,
  useUpdateUserStatus,
  useSyncUsers,
  useUpdateUser,
  type UserRole,
} from "@/lib/hooks/use-admin-users";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Ativo</Badge>;
  if (status === "blocked")
    return <Badge variant="destructive">Bloqueado</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pendente</Badge>;
}

export default function UsersSettingsPage() {
  const role = useUserRole();
  const updateUser = useUpdateUser();
  const isAdmin = role === "admin" || role === "manager";
  const { data: users, isLoading } = useAdminUsers();
  const updateStatus = useUpdateUserStatus();
  const syncUsers = useSyncUsers();

  function handleStatus(userId: string, status: "active" | "blocked") {
    updateStatus.mutate(
      { userId, status },
      {
        onSuccess: () => toast.success(status === "active" ? "Usuário aprovado." : "Usuário bloqueado."),
        onError: () => toast.error("Erro ao atualizar status."),
      },
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Apenas administradores podem gerenciar usuários.</p>
        </CardContent>
      </Card>
    );
  }

  const pending = users?.filter((u) => u.status === "pending") ?? [];
  const others = users?.filter((u) => u.status !== "pending") ?? [];

  return (
    <div className="space-y-6">
      {/* Sync button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Usuarios
          </h1>
          <p className="text-sm text-muted-foreground">Gerencie usuarios e permissoes.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={syncUsers.isPending}
          onClick={() => {
            syncUsers.mutate(undefined, {
              onSuccess: (data) => {
                if (data.updated > 0) {
                  toast.success(`${data.updated} usuario${data.updated > 1 ? "s" : ""} atualizado${data.updated > 1 ? "s" : ""} com dados do Clerk.`);
                } else {
                  toast.info("Todos os usuarios ja estao sincronizados.");
                }
              },
              onError: () => toast.error("Erro ao sincronizar."),
            });
          }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncUsers.isPending ? "animate-spin" : ""}`} />
          Sincronizar com Clerk
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            Aguardando aprovação
            {pending.length > 0 && (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 ml-1">
                {pending.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Novos usuários que precisam de aprovação para acessar a plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
          {!isLoading && pending.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum usuário pendente.</p>
          )}
          {!isLoading && pending.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-3 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{u.name === u.email ? u.email : u.name}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive border-destructive/30"
                  onClick={() => handleStatus(u.id, "blocked")}
                  disabled={updateStatus.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Rejeitar
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleStatus(u.id, "active")}
                  disabled={updateStatus.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Aprovar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Todos os usuários
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-12 w-full" />}
          {!isLoading && others.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum usuário ativo.</p>
          )}
          {!isLoading && others.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-3 border-b last:border-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name === u.email ? u.email : u.name}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {/* Aparece nas listas: controla os seletores de pessoa (PDI,
                    vendedor). Conta fantasma fica desmarcada sem precisar
                    apagar — várias são donas de dados reais. */}
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Switch
                    checked={u.listed}
                    disabled={!isAdmin || updateUser.isPending}
                    onCheckedChange={(checked: boolean) =>
                      updateUser.mutate(
                        { userId: u.id, listed: checked },
                        {
                          onSuccess: () =>
                            toast.success(checked ? "Aparece nas listas." : "Escondido das listas."),
                          onError: () => toast.error("Erro ao atualizar."),
                        },
                      )
                    }
                  />
                  nas listas
                </label>
                <Select
                  value={u.role}
                  disabled={!isAdmin || updateUser.isPending}
                  onValueChange={(novo: string) =>
                    updateUser.mutate(
                      { userId: u.id, role: novo as UserRole },
                      {
                        onSuccess: () => toast.success(`Papel alterado para ${novo}.`),
                        onError: (e: unknown) =>
                          toast.error(e instanceof Error ? e.message : "Erro ao alterar papel."),
                      },
                    )
                  }
                >
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["copywriter", "strategist", "manager", "admin"].map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <StatusBadge status={u.status} />
                {u.status === "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive border-destructive/30"
                    onClick={() => handleStatus(u.id, "blocked")}
                    disabled={updateStatus.isPending}
                  >
                    Bloquear
                  </Button>
                )}
                {u.status === "blocked" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatus(u.id, "active")}
                    disabled={updateStatus.isPending}
                  >
                    Reativar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
