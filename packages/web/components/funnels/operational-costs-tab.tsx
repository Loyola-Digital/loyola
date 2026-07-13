"use client";

// Brief v5 #2 — Custos operacionais do evento (venue, staff, logística...).
// Denominador do ROAS REAL: faturamento ÷ (tráfego + custos operacionais).

import { useState } from "react";
import { Wallet, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COST_CATEGORIES,
  type CostCategory,
  useCreateOperationalCost,
  useDeleteOperationalCost,
  useOperationalCosts,
} from "@/lib/hooks/use-operational-costs";

function formatCurrency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function categoryLabel(value: string): string {
  return COST_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
}

export function OperationalCostsTab({ projectId, funnelId, stageId }: Props) {
  const { data, isLoading } = useOperationalCosts(projectId, funnelId, stageId);
  const createMutation = useCreateOperationalCost(projectId, funnelId, stageId);
  const deleteMutation = useDeleteOperationalCost(projectId, funnelId, stageId);

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CostCategory>("venue");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState("");

  const items = data?.items ?? [];
  const byCategory = new Map<string, number>();
  for (const i of items) byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + i.amount);

  const handleCreate = async () => {
    const value = parseFloat(amount.replace(/\./g, "").replace(",", "."));
    if (!value || value <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    try {
      await createMutation.mutateAsync({
        category,
        description: description.trim() || null,
        amount: value,
        incurredAt: incurredAt || null,
      });
      toast.success("Custo lançado");
      setOpen(false);
      setDescription("");
      setAmount("");
      setIncurredAt("");
    } catch {
      toast.error("Erro ao lançar custo");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Custos operacionais</h3>
          <span className="text-xs text-muted-foreground">
            venue, staff, logística, hospedagem — o denominador do ROAS real
          </span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Lançar custo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Lançar custo operacional</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as CostCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Descrição (opcional)</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: aluguel do auditório"
                  maxLength={255}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Valor (R$)</Label>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="15000,00"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Data (opcional)</Label>
                  <Input
                    type="date"
                    value={incurredAt}
                    onChange={(e) => setIncurredAt(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Lançando..." : "Lançar custo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border/50 p-3">
          <p className="text-xs text-muted-foreground">Total de custos</p>
          <p className="text-lg font-semibold">{formatCurrency(data?.totalCosts ?? 0)}</p>
        </div>
        {[...byCategory.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([cat, total]) => (
            <div key={cat} className="rounded-lg border border-border/50 p-3">
              <p className="text-xs text-muted-foreground">{categoryLabel(cat)}</p>
              <p className="text-lg font-semibold">{formatCurrency(total)}</p>
            </div>
          ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          Nenhum custo lançado. Lance venue, staff, logística e hospedagem pra fechar o ROAS
          real do evento.
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Descrição</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium text-right">Valor</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-2">{categoryLabel(c.category)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.description ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.incurredAt
                      ? new Date(`${c.incurredAt}T12:00:00`).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(c.amount)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        try {
                          await deleteMutation.mutateAsync(c.id);
                          toast.success("Custo removido");
                        } catch {
                          toast.error("Erro ao remover custo");
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
