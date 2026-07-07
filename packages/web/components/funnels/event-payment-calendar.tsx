"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useManualSales } from "@/lib/hooks/use-manual-sales";
import type { ManualSale } from "@loyola-x/shared";

interface EventPaymentCalendarProps {
  projectId: string;
  funnelId: string;
  stageId: string;
}

/** Um pagamento previsto (parcela de um acordo) numa data específica. */
interface PaymentOccurrence {
  dateKey: string; // YYYY-MM-DD local
  customerName: string;
  product: string | null;
  amount: number;
  installmentNumber: number;
  installmentTotal: number;
  saleId: string;
}

function formatCurrency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Parse local de YYYY-MM-DD (sem UTC shift). */
function parseDateKey(key: string): Date | null {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Soma meses preservando o dia do vencimento, com clamp pro último dia do mês
 * quando o mês alvo é mais curto (ex: 31/01 + 1 mês → 28/02).
 */
function addMonthsClamped(base: Date, months: number): Date {
  const y = base.getFullYear();
  const m = base.getMonth() + months;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(base.getDate(), lastDay));
}

/** Gera as ocorrências mensais de todos os acordos de parcelamento ativos. */
function buildOccurrences(sales: ManualSale[]): Map<string, PaymentOccurrence[]> {
  const byDay = new Map<string, PaymentOccurrence[]>();
  for (const sale of sales) {
    if (sale.refundedAt) continue; // venda reembolsada não gera cobrança
    if (
      sale.installmentCount == null ||
      sale.installmentAmount == null ||
      !sale.firstInstallmentDate
    ) {
      continue;
    }
    const first = parseDateKey(sale.firstInstallmentDate);
    if (!first) continue;
    for (let i = 0; i < sale.installmentCount; i++) {
      const due = addMonthsClamped(first, i);
      const key = toDateKey(due);
      const arr = byDay.get(key) ?? [];
      arr.push({
        dateKey: key,
        customerName: sale.customerName,
        product: sale.product,
        amount: sale.installmentAmount,
        installmentNumber: i + 1,
        installmentTotal: sale.installmentCount,
        saleId: sale.id,
      });
      byDay.set(key, arr);
    }
  }
  return byDay;
}

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * Calendário de pagamento do parcelamento (Evento Presencial): projeta as
 * parcelas combinadas nas vendas (valor mensal + 1ª parcela + nº de parcelas)
 * numa grade mensal navegável — o que entra em cada data.
 */
export function EventPaymentCalendar({ projectId, funnelId, stageId }: EventPaymentCalendarProps) {
  // Janela larga (2 anos de vendas retroativas): os acordos projetam parcelas
  // pro futuro a partir da venda — independente do range do resto da tela.
  const { data, isLoading } = useManualSales(projectId, funnelId, stageId, 730);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-based

  const [detailDay, setDetailDay] = useState<string | null>(null);

  const occurrencesByDay = useMemo(
    () => buildOccurrences(data?.sales ?? []),
    [data?.sales],
  );

  const hasAnyPlan = occurrencesByDay.size > 0;

  // Grade do mês: começa no domingo da semana do dia 1 e fecha no sábado da
  // semana do último dia — sempre semanas completas.
  const gridDays = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const start = new Date(viewYear, viewMonth, 1 - firstOfMonth.getDay());
    const lastOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const end = new Date(viewYear, viewMonth, lastOfMonth.getDate() + (6 - lastOfMonth.getDay()));
    const days: Date[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }
    return days;
  }, [viewYear, viewMonth]);

  const monthTotal = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const [key, occs] of occurrencesByDay) {
      const d = parseDateKey(key);
      if (d && d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
        for (const o of occs) {
          total += o.amount;
          count += 1;
        }
      }
    }
    return { total, count };
  }, [occurrencesByDay, viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function goToday() {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const todayKey = toDateKey(today);
  const detailOccurrences = detailDay ? occurrencesByDay.get(detailDay) ?? [] : [];
  const detailDate = detailDay ? parseDateKey(detailDay) : null;

  return (
    <div className="space-y-4">
      {/* Header: navegação + resumo do mês */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToday}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h3 className="text-base font-semibold ml-1">
            {MONTH_LABELS[viewMonth]} {viewYear}
          </h3>
        </div>
        <div className="text-sm text-right">
          <span className="text-muted-foreground">Previsto no mês: </span>
          <span className="font-semibold text-emerald-500">{formatCurrency(monthTotal.total)}</span>
          <span className="text-xs text-muted-foreground ml-1.5">
            ({monthTotal.count} parcela{monthTotal.count !== 1 ? "s" : ""})
          </span>
        </div>
      </div>

      {!hasAnyPlan && (
        <div className="rounded-lg border border-dashed border-border/40 p-6 text-center space-y-1">
          <CalendarClock className="h-6 w-6 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum parcelamento cadastrado ainda.</p>
          <p className="text-xs text-muted-foreground">
            Ao lançar (ou editar) uma venda, preencha a seção{" "}
            <strong>Parcelamento</strong> — valor mensal, nº de parcelas e data da 1ª parcela.
          </p>
        </div>
      )}

      {/* Grade do calendário */}
      <div className="rounded-xl border border-border/30 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border/30 bg-muted/30">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((day) => {
            const key = toDateKey(day);
            const inMonth = day.getMonth() === viewMonth;
            const isToday = key === todayKey;
            const occs = occurrencesByDay.get(key) ?? [];
            const dayTotal = occs.reduce((s, o) => s + o.amount, 0);
            const visible = occs.slice(0, 3);
            const hidden = occs.length - visible.length;
            return (
              <button
                key={key}
                type="button"
                disabled={occs.length === 0}
                onClick={() => setDetailDay(key)}
                className={`relative min-h-[92px] border-b border-r border-border/20 p-1.5 text-left align-top transition-colors last:border-r-0 ${
                  inMonth ? "" : "bg-muted/20 opacity-50"
                } ${occs.length > 0 ? "cursor-pointer hover:bg-muted/30" : "cursor-default"}`}
              >
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${
                    isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {day.getDate()}
                </span>
                <div className="mt-0.5 space-y-0.5">
                  {visible.map((o, i) => (
                    <div
                      key={`${o.saleId}-${o.installmentNumber}-${i}`}
                      className="truncate rounded bg-emerald-500/10 px-1 py-0.5 text-[10px] leading-tight text-emerald-600 dark:text-emerald-400"
                      title={`${o.customerName} · parcela ${o.installmentNumber}/${o.installmentTotal} · ${formatCurrency(o.amount)}`}
                    >
                      <span className="font-medium">{o.customerName.split(" ")[0]}</span>{" "}
                      {formatCurrency(o.amount)}
                    </div>
                  ))}
                  {hidden > 0 && (
                    <div className="text-[10px] text-muted-foreground px-1">+{hidden} mais</div>
                  )}
                </div>
                {occs.length > 0 && (
                  <div className="absolute bottom-1 right-1.5 text-[10px] font-semibold tabular-nums text-emerald-500">
                    {formatCurrency(dayTotal)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detalhe do dia */}
      <Dialog open={!!detailDay} onOpenChange={(open) => !open && setDetailDay(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Pagamentos de{" "}
              {detailDate
                ? detailDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
                : ""}
            </DialogTitle>
            <DialogDescription>
              {detailOccurrences.length} parcela{detailOccurrences.length !== 1 ? "s" : ""} ·{" "}
              total {formatCurrency(detailOccurrences.reduce((s, o) => s + o.amount, 0))}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {detailOccurrences.map((o, i) => (
              <div
                key={`${o.saleId}-${o.installmentNumber}-${i}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{o.customerName}</p>
                  <p className="text-xs text-muted-foreground">
                    Parcela {o.installmentNumber}/{o.installmentTotal}
                    {o.product ? ` · ${o.product}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-500">
                  {formatCurrency(o.amount)}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
