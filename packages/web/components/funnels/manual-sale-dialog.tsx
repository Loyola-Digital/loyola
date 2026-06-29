"use client";

import { useEffect, useState } from "react";
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
import {
  useCreateManualSale,
  useEligibleSellers,
  useUpdateManualSale,
} from "@/lib/hooks/use-manual-sales";
import { useEventProducts, useEventClosers, useEventLeads } from "@/lib/hooks/use-event-config";
import type { InvoiceStatus, ManualSale } from "@loyola-x/shared";

/**
 * Story 19.15 — valida CPF (com ou sem máscara) via dígitos verificadores.
 * Inline aqui de propósito: o web consome `@loyola-x/shared` como type-only
 * (sem resolução de `.js` no bundle do Next), então não importamos o valor.
 * Espelha `isValidCpf` de `@loyola-x/shared` (usado server-side).
 */
function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calcDigit = (slice: string, factorStart: number): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * (factorStart - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = calcDigit(cpf.slice(0, 9), 10);
  const d2 = calcDigit(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

interface ManualSaleDialogProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando passado, dialog entra em modo edição (PATCH ao invés de POST). */
  editingSale?: ManualSale | null;
  /**
   * Story 19.10: etapa de Evento Presencial. Quando true: vendedor é o Closer
   * (texto livre), email é obrigatório (matrícula MemberKit), e ganha os campos
   * Caixa (valor recebido) + Negociação.
   */
  isEvent?: boolean;
}

function formatBrCurrencyFromNumber(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function saleDateToInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  editingSale,
  isEvent = false,
}: ManualSaleDialogProps) {
  const isEditing = !!editingSale;
  // No evento o vendedor é o Closer (lista cadastrada) — não busca usuários da plataforma.
  const { data: sellers, isLoading: loadingSellers } = useEligibleSellers(isEvent ? null : projectId);
  // Story 19.12: no evento, Produto e Closer vêm de listas cadastradas na etapa.
  const { data: productsData } = useEventProducts(projectId, funnelId, stageId, isEvent);
  const { data: closersData } = useEventClosers(projectId, funnelId, stageId, isEvent);
  const { data: leadsData } = useEventLeads(projectId, funnelId, stageId, isEvent);
  const eventProducts = productsData?.products ?? [];
  const eventClosers = closersData?.closers ?? [];
  const eventLeads = leadsData?.leads ?? [];
  const createMutation = useCreateManualSale(projectId, funnelId, stageId);
  const updateMutation = useUpdateManualSale(projectId, funnelId, stageId);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [valueInput, setValueInput] = useState("");
  const [sellerUserId, setSellerUserId] = useState<string>("");
  const [closer, setCloser] = useState(""); // Story 19.10 — vendedor texto livre (evento)
  const [saleDate, setSaleDate] = useState<string>(todayIso());
  const [product, setProduct] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | "">("");
  const [valorRecebidoInput, setValorRecebidoInput] = useState(""); // Story 19.10 — Caixa
  const [negociacao, setNegociacao] = useState(""); // Story 19.10
  // Story 19.15 — dados fiscais p/ nota (Evento Presencial)
  const [customerCpf, setCustomerCpf] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [valorNotaInput, setValorNotaInput] = useState("");

  // Story 19.12: ao editar venda antiga, produto/closer pode não estar mais na
  // lista — mostramos o valor atual como item "(não cadastrado)" em vez de vazio.
  const productOutOfList = !!product && !eventProducts.some((p) => p.name === product);
  const closerOutOfList = !!closer && !eventClosers.some((c) => c.name === closer);

  // Story 19.12c: busca de lead/participante (pool das planilhas espelhadas).
  const [leadSearch, setLeadSearch] = useState("");
  const leadQuery = leadSearch.trim().toLowerCase();
  const leadMatches = leadQuery
    ? eventLeads
        .filter((l) => l.email.toLowerCase().includes(leadQuery) || l.name.toLowerCase().includes(leadQuery))
        .slice(0, 8)
    : [];

  function selectLead(lead: { name: string; email: string; phone: string }) {
    if (lead.name) setCustomerName(lead.name);
    setCustomerEmail(lead.email);
    if (lead.phone) setCustomerPhone(lead.phone);
    setLeadSearch("");
  }

  // Hidrata form quando entra em modo edição (ou troca de venda em edição)
  useEffect(() => {
    if (!open) return;
    if (editingSale) {
      setCustomerName(editingSale.customerName);
      setCustomerEmail(editingSale.customerEmail ?? "");
      setCustomerPhone(editingSale.customerPhone ?? "");
      setValueInput(formatBrCurrencyFromNumber(editingSale.value));
      setSellerUserId(editingSale.sellerUserId ?? "");
      // No evento, sellerUserId é null e o nome do closer vive em sellerName.
      setCloser(editingSale.sellerUserId ? "" : editingSale.sellerName ?? "");
      setSaleDate(saleDateToInput(editingSale.saleDate));
      setProduct(editingSale.product ?? "");
      setInvoiceStatus(editingSale.invoiceStatus ?? "");
      setValorRecebidoInput(
        editingSale.valorRecebido != null ? formatBrCurrencyFromNumber(editingSale.valorRecebido) : "",
      );
      setNegociacao(editingSale.negociacao ?? "");
      setCustomerCpf(editingSale.customerCpf ?? "");
      setCustomerAddress(editingSale.customerAddress ?? "");
      setValorNotaInput(
        editingSale.valorNota != null ? formatBrCurrencyFromNumber(editingSale.valorNota) : "",
      );
    } else {
      resetForm();
    }
  }, [open, editingSale?.id]);

  function resetForm() {
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setValueInput("");
    setSellerUserId("");
    setCloser("");
    setSaleDate(todayIso());
    setProduct("");
    setInvoiceStatus("");
    setValorRecebidoInput("");
    setNegociacao("");
    setCustomerCpf("");
    setCustomerAddress("");
    setValorNotaInput("");
    setLeadSearch("");
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

    // Story 19.10/19.11: no evento, email é obrigatório (matrícula MemberKit) e
    // o vendedor é o Closer (texto livre). Fora do evento, vendedor = usuário.
    if (isEvent) {
      if (!customerEmail.trim()) {
        toast.error("Email é obrigatório (necessário para matrícula no MemberKit)");
        return;
      }
      if (!customerPhone.trim()) {
        toast.error("Telefone é obrigatório");
        return;
      }
      if (!product.trim()) {
        toast.error("Selecione o produto");
        return;
      }
      if (closer.trim().length < 2) {
        toast.error("Selecione o closer");
        return;
      }
    } else if (!sellerUserId) {
      toast.error("Selecione o vendedor");
      return;
    }

    // Story 19.15 — dados fiscais obrigatórios no evento (emissão de nota).
    let valorNota: number | null = null;
    if (isEvent) {
      if (!isValidCpf(customerCpf)) {
        toast.error("CPF inválido");
        return;
      }
      if (customerAddress.trim().length < 3) {
        toast.error("Endereço é obrigatório");
        return;
      }
      valorNota = parseBrCurrency(valorNotaInput);
      if (valorNota === null) {
        toast.error("Valor da nota inválido");
        return;
      }
    }

    const valorRecebido = isEvent ? parseBrCurrency(valorRecebidoInput) : null;

    const payload = {
      customerName: name,
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      value,
      ...(isEvent
        ? {
            sellerName: closer.trim(),
            valorRecebido,
            negociacao: negociacao.trim() || null,
            customerCpf: customerCpf.trim(),
            customerAddress: customerAddress.trim(),
            valorNota,
          }
        : { sellerUserId }),
      saleDate,
      product: product.trim() || undefined,
      invoiceStatus: invoiceStatus || null,
    };

    try {
      if (isEditing && editingSale) {
        await updateMutation.mutateAsync({ saleId: editingSale.id, input: payload });
        toast.success("Venda atualizada");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Venda lançada");
      }
      resetForm();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar venda";
      toast.error(message);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

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
            <DialogTitle>
              {isEditing
                ? "Editar venda"
                : isEvent
                  ? "Lançar venda (Evento Presencial)"
                  : "Lançar venda manual (PIX direto)"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Ajuste os campos abaixo e clique em Salvar."
                : isEvent
                  ? "Ao lançar, o comprador é matriculado automaticamente no MemberKit (se configurado na etapa)."
                  : "Vendas registradas aqui ficam separadas das vendas vindas da planilha."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {isEvent && (
              <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/20 p-2.5">
                <Label htmlFor="lead-search" className="text-xs">Buscar participante (lead)</Label>
                <Input
                  id="lead-search"
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Nome ou email do lead da planilha"
                  autoComplete="off"
                />
                {leadQuery && (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border/40 divide-y divide-border/30">
                    {leadMatches.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-muted-foreground">
                        Nenhum lead encontrado — preencha os campos abaixo para cadastrar novo.
                      </p>
                    ) : (
                      leadMatches.map((l) => (
                        <button
                          key={l.email}
                          type="button"
                          onClick={() => selectLead(l)}
                          className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50"
                        >
                          <span className="font-medium">{l.name || "(sem nome)"}</span>
                          <span className="text-muted-foreground"> · {l.email}</span>
                          {l.phone ? <span className="text-muted-foreground"> · {l.phone}</span> : null}
                        </button>
                      ))
                    )}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Selecione um participante pra autopreencher, ou preencha manualmente pra cadastrar novo.
                </p>
              </div>
            )}
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
                <Label htmlFor="customer-email">Email{isEvent ? " *" : ""}</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder={isEvent ? "necessário p/ MemberKit" : "opcional"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customer-phone">Telefone{isEvent ? " *" : ""}</Label>
                <Input
                  id="customer-phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder={isEvent ? "obrigatório" : "opcional"}
                />
              </div>
            </div>

            {isEvent && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-cpf">CPF *</Label>
                    <Input
                      id="customer-cpf"
                      inputMode="numeric"
                      value={customerCpf}
                      onChange={(e) => setCustomerCpf(e.target.value)}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="valor-nota">Valor da nota (R$) *</Label>
                    <Input
                      id="valor-nota"
                      inputMode="decimal"
                      value={valorNotaInput}
                      onChange={(e) => setValorNotaInput(e.target.value)}
                      placeholder="1.997,00"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="customer-address">Endereço *</Label>
                  <Input
                    id="customer-address"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Rua, número, bairro, cidade/UF, CEP"
                  />
                </div>
              </>
            )}

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

            {isEvent && (
              <div className="space-y-1.5">
                <Label htmlFor="valor-recebido">Caixa (valor recebido)</Label>
                <Input
                  id="valor-recebido"
                  inputMode="decimal"
                  value={valorRecebidoInput}
                  onChange={(e) => setValorRecebidoInput(e.target.value)}
                  placeholder="opcional — ex: 1.000,00"
                />
              </div>
            )}

            {isEvent ? (
              <div className="space-y-1.5">
                <Label htmlFor="product-select">Produto *</Label>
                {eventProducts.length > 0 || productOutOfList ? (
                  <Select value={product} onValueChange={setProduct}>
                    <SelectTrigger id="product-select">
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {productOutOfList && (
                        <SelectItem value={product}>{product} (não cadastrado)</SelectItem>
                      )}
                      {eventProducts.map((p) => (
                        <SelectItem key={p.id} value={p.name}>
                          {p.name}
                          {p.memberkitClassroomName ? ` · ${p.memberkitClassroomName}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-amber-600">
                    Nenhum produto cadastrado. Cadastre os produtos na aba <strong>Configuração</strong> da etapa.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="product">Produto</Label>
                <Input
                  id="product"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="Ex: Mentoria 1:1 (opcional)"
                />
              </div>
            )}

            {isEvent && (
              <div className="space-y-1.5">
                <Label htmlFor="negociacao">Negociação</Label>
                <Input
                  id="negociacao"
                  value={negociacao}
                  onChange={(e) => setNegociacao(e.target.value)}
                  placeholder="opcional — condições do acordo"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="invoice-status">Nota fiscal</Label>
              <Select
                value={invoiceStatus || "none"}
                onValueChange={(v) => setInvoiceStatus(v === "none" ? "" : (v as InvoiceStatus))}
              >
                <SelectTrigger id="invoice-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não preenchido</SelectItem>
                  <SelectItem value="emitida">Emitida</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isEvent ? (
              <div className="space-y-1.5">
                <Label htmlFor="closer-select">Closer (vendedor) *</Label>
                {eventClosers.length > 0 || closerOutOfList ? (
                  <Select value={closer} onValueChange={setCloser}>
                    <SelectTrigger id="closer-select">
                      <SelectValue placeholder="Selecione o closer" />
                    </SelectTrigger>
                    <SelectContent>
                      {closerOutOfList && (
                        <SelectItem value={closer}>{closer} (não cadastrado)</SelectItem>
                      )}
                      {eventClosers.map((cl) => (
                        <SelectItem key={cl.id} value={cl.name}>
                          {cl.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-amber-600">
                    Nenhum closer cadastrado. Cadastre os closers na aba <strong>Configuração</strong> da etapa.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="seller">Vendedor *</Label>
                <Select value={sellerUserId} onValueChange={setSellerUserId}>
                  <SelectTrigger id="seller">
                    <SelectValue
                      placeholder={loadingSellers ? "Carregando..." : "Selecione o vendedor"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {sellers && sellers.length > 0 ? (
                      sellers.map((s) => (
                        <SelectItem key={s.userId} value={s.userId}>
                          {s.name || s.email}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhum vendedor encontrado
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEditing
                  ? "Salvando..."
                  : "Lançando..."
                : isEditing
                ? "Salvar"
                : "Lançar venda"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
