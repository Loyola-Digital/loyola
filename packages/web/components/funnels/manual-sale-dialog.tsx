"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectMembers } from "@/lib/hooks/use-projects";
import { useCreateManualSale } from "@/lib/hooks/use-manual-sales";

interface ManualSaleDialogProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function todayIso(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseBrCurrency(input: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return null;
  const hasComma = cleaned.includes(",");
  const normalized = hasComma
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const v = parseFloat(normalized);
  if (!isFinite(v) || v <= 0) return null;
  return v;
}

export function ManualSaleDialog({
  projectId,
  funnelId,
  stageId,
  open,
  onOpenChange,
}: ManualSaleDialogProps) {
  const { data: members, isLoading: loadingMembers } = useProjectMembers(projectId);
  const createMutation = useCreateManualSale(projectId, funnelId, stageId);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [valueInput, setValueInput] = useState("");
  const [sellerUserId, setSellerUserId] = useState<string>("");
  const [saleDate, setSaleDate] = useState<string>(todayIso());

  function resetForm() {
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setValueInput("");
    setSellerUserId("");
    setSaleDate(todayIso());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const name = customerName.trim();
    if (name.length < 2) {
      toast.error("Nome do cliente é obrigatório");
      return;
    }

    const value = parseBrCurrency(valueInput);
    if (value === null) {
      toast.error("Valor da venda inválido");
      return;
    }

    if (!sellerUserId) {
      toast.error("Selecione o vendedor");
      return;
    }

    try {
      await createMutation.mutateAsync({
        customerName: name,
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        value,
        sellerUserId,
        saleDate,
      });
      toast.success("Venda lançada");
      resetForm();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao lançar venda";
      toast.error(message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Lançar venda manual (PIX direto)</DialogTitle>
            <DialogDescription>
              Vendas registradas aqui ficam separadas das vendas vindas da planilha.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="customer-name">Nome do cliente *</Label>
              <Input
                id="customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Maria Silva"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="customer-email">Email</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="opcional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customer-phone">Telefone</Label>
                <Input
                  id="customer-phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="opcional"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sale-value">Valor (R$) *</Label>
                <Input
                  id="sale-value"
                  inputMode="decimal"
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                  placeholder="1.997,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale-date">Data da venda *</Label>
                <Input
                  id="sale-date"
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seller">Vendedor *</Label>
              <Select value={sellerUserId} onValueChange={setSellerUserId}>
                <SelectTrigger id="seller">
                  <SelectValue
                    placeholder={loadingMembers ? "Carregando..." : "Selecione o vendedor"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {members && members.length > 0 ? (
                    members.map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.userName || m.userEmail}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Nenhum membro encontrado
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Lançando..." : "Lançar venda"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
