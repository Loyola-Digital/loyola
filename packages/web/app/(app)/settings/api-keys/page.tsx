"use client";

import { useState } from "react";
import { KeyRound, Plus, Copy, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  type CreatedApiKey,
} from "@/lib/hooks/use-api-keys";
import { useUserRole } from "@/lib/hooks/use-user-role";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ApiKeysSettingsPage() {
  const role = useUserRole();
  const isAdmin = role === "admin";
  const { data: keys, isLoading } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [newName, setNewName] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Apenas administradores podem gerenciar chaves de API.
          </p>
        </CardContent>
      </Card>
    );
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) {
      toast.error("Dê um nome para a chave.");
      return;
    }
    createKey.mutate(
      { name },
      {
        onSuccess: (data) => {
          setCreatedKey(data);
          setNewName("");
          setCopied(false);
        },
        onError: () => toast.error("Erro ao gerar chave."),
      },
    );
  }

  function handleCopy() {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey.key).then(
      () => {
        setCopied(true);
        toast.success("Chave copiada.");
      },
      () => toast.error("Não foi possível copiar."),
    );
  }

  function handleRevoke(id: string) {
    if (!confirm("Tem certeza? Qualquer integração usando esta chave para de funcionar.")) {
      return;
    }
    revokeKey.mutate(id, {
      onSuccess: () => toast.success("Chave revogada."),
      onError: () => toast.error("Erro ao revogar."),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            API Keys
          </h1>
          <p className="text-sm text-muted-foreground">
            Chaves para consumo da API de dados (ex.: MCP / integrações de IA).
          </p>
        </div>
      </div>

      {/* Gerar nova chave */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" />
            Gerar nova chave
          </CardTitle>
          <CardDescription>
            A chave em texto puro é exibida uma única vez. Guarde-a com segurança.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="key-name">Nome</Label>
              <Input
                id="key-name"
                placeholder="Ex.: MCP IA Lucas"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
            <Button onClick={handleCreate} disabled={createKey.isPending} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Gerar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Chaves
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
          {!isLoading && (keys?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma chave criada.</p>
          )}
          {!isLoading &&
            keys?.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between py-3 border-b last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center gap-2">
                    {k.name}
                    {k.revoked ? (
                      <Badge variant="destructive">Revogada</Badge>
                    ) : (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        Ativa
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {k.keyPrefix}… · {k.scopes.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Criada {formatDate(k.createdAt)} · Último uso {formatDate(k.lastUsedAt)}
                  </p>
                </div>
                {!k.revoked && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive border-destructive/30 gap-1.5"
                    onClick={() => handleRevoke(k.id)}
                    disabled={revokeKey.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                    Revogar
                  </Button>
                )}
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Dialog: chave recém-criada (exibida uma única vez) */}
      <Dialog open={createdKey !== null} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chave criada</DialogTitle>
            <DialogDescription>
              Copie agora — você não verá esta chave novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
              {createdKey?.key}
            </code>
            <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5 shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>Concluído</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
