"use client";

import { useState } from "react";
import { Users, Plus, X, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useSellerAliases,
  useCreateSellerAlias,
  useUpdateSellerAlias,
  useDeleteSellerAlias,
  type SellerAlias,
} from "@/lib/hooks/use-seller-aliases";

interface Props {
  projectId: string;
}

/**
 * Configuração de "merge de vendedor" (escopo por projeto). Permite unificar
 * variações do nome do vendedor que vêm de fontes distintas (utm_source da
 * planilha × sellerName das vendas manuais) num único nome canônico exibido no
 * breakdown. Ex: "isabela" + "ISABELA COMERCIAL" → "Isabela".
 */
export function SellerAliasesDialog({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: aliases, isLoading } = useSellerAliases(open ? projectId : null);
  const createMut = useCreateSellerAlias(projectId);

  const [newName, setNewName] = useState("");
  const [newAliases, setNewAliases] = useState("");

  function handleCreate() {
    const canonicalName = newName.trim();
    if (!canonicalName) {
      toast.error("Informe o nome do vendedor.");
      return;
    }
    const parsed = newAliases
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    createMut.mutate(
      { canonicalName, aliases: parsed },
      {
        onSuccess: () => {
          setNewName("");
          setNewAliases("");
          toast.success(`Vendedor "${canonicalName}" configurado.`);
        },
        onError: () => toast.error("Erro ao criar vendedor."),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Configurar vendedores
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge de vendedores</DialogTitle>
          <DialogDescription>
            Unifique variações do mesmo vendedor num único nome. As variações
            (ex: como aparece na UTM e na venda manual) colapsam num card só no
            breakdown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Lista de vendedores canônicos */}
          <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : !aliases || aliases.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum vendedor configurado ainda.
              </p>
            ) : (
              aliases.map((alias) => (
                <SellerAliasCard key={alias.id} projectId={projectId} alias={alias} />
              ))
            )}
          </div>

          {/* Form de criação */}
          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium">Novo vendedor</p>
            <div className="space-y-2">
              <Label htmlFor="seller-canonical" className="text-xs">
                Nome canônico (como deve aparecer)
              </Label>
              <Input
                id="seller-canonical"
                placeholder="Ex: Isabela"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seller-variations" className="text-xs">
                Variações (separadas por vírgula)
              </Label>
              <Input
                id="seller-variations"
                placeholder="isabela, ISABELA COMERCIAL, isa vendas"
                value={newAliases}
                onChange={(e) => setNewAliases(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={createMut.isPending}
              className="gap-1.5"
            >
              {createMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Adicionar vendedor
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Card de um vendedor canônico — gerencia suas variações (chips) e remoção. */
function SellerAliasCard({
  projectId,
  alias,
}: {
  projectId: string;
  alias: SellerAlias;
}) {
  const updateMut = useUpdateSellerAlias(projectId);
  const deleteMut = useDeleteSellerAlias(projectId);
  const [newAlias, setNewAlias] = useState("");

  function addAlias() {
    const value = newAlias.trim();
    if (!value) return;
    const next = [...alias.aliases, value];
    updateMut.mutate(
      { id: alias.id, input: { aliases: next } },
      {
        onSuccess: () => setNewAlias(""),
        onError: () => toast.error("Erro ao adicionar variação."),
      },
    );
  }

  function removeAlias(value: string) {
    const next = alias.aliases.filter((a) => a !== value);
    updateMut.mutate(
      { id: alias.id, input: { aliases: next } },
      { onError: () => toast.error("Erro ao remover variação.") },
    );
  }

  return (
    <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold truncate">{alias.canonicalName}</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() =>
            deleteMut.mutate(alias.id, {
              onError: () => toast.error("Erro ao remover vendedor."),
            })
          }
          disabled={deleteMut.isPending}
          title="Remover vendedor"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {alias.aliases.length === 0 ? (
          <span className="text-xs text-muted-foreground">Sem variações.</span>
        ) : (
          alias.aliases.map((a) => (
            <Badge key={a} variant="secondary" className="gap-1 font-normal">
              {a}
              <button
                type="button"
                onClick={() => removeAlias(a)}
                className="hover:text-destructive"
                aria-label={`Remover ${a}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Adicionar variação..."
          value={newAlias}
          onChange={(e) => setNewAlias(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addAlias();
          }}
          className="h-8 text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          onClick={addAlias}
          disabled={updateMut.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
