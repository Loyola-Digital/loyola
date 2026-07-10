"use client";

import { useState } from "react";
import { FileSpreadsheet, Plus, Pencil, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils/lp-metrics-calculator";
import {
  usePerpetualUpsellSpreadsheet,
  usePerpetualUpsellData,
} from "@/lib/hooks/use-perpetual-upsell";
import { PerpetualUpsellWizardDialog } from "./perpetual-upsell-wizard-dialog";

interface PerpetualUpsellSectionProps {
  projectId: string;
  funnelId: string;
}

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}
function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-purple-500/40 bg-purple-500/5" : "border-border/50 bg-muted/20"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${highlight ? "text-purple-700 dark:text-purple-300" : ""}`}>{value}</div>
    </div>
  );
}

export function PerpetualUpsellSection({ projectId, funnelId }: PerpetualUpsellSectionProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data: sheet, isLoading: sheetLoading } = usePerpetualUpsellSpreadsheet(projectId, funnelId);
  const { data, isLoading: dataLoading } = usePerpetualUpsellData(projectId, funnelId);

  const connected = !!sheet;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-purple-600" />
          Upsell High Ticket
        </h3>
        {connected ? (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => setWizardOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Editar planilha
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setWizardOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Conectar planilha
          </Button>
        )}
      </div>

      {sheetLoading ? (
        <Skeleton className="h-24" />
      ) : !connected ? (
        <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
          <FileSpreadsheet className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma planilha de high ticket conectada.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Conecte a planilha do produto upsell pra ver quem comprou o perpétuo e depois subiu pro high ticket.
          </p>
        </div>
      ) : dataLoading ? (
        <Skeleton className="h-40" />
      ) : data?.semPerpetuo ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Conecte a planilha de <strong>vendas do perpétuo</strong> primeiro — o cruzamento precisa dela como base.
        </div>
      ) : !data || data.semDados ? (
        <p className="text-sm text-muted-foreground">Sem dados para cruzar ainda.</p>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label="Base do perpétuo" value={fmtNumber(data.basePerpetuo)} />
            <Kpi label="Upsells (após)" value={fmtNumber(data.upsells)} highlight />
            <Kpi label="Taxa de upsell" value={fmtPercent(data.taxaUpsell)} highlight />
            <Kpi label="Faturamento HT" value={formatCurrency(data.faturamentoHighTicket)} />
            <Kpi label="Ticket médio HT" value={formatCurrency(data.ticketMedioHighTicket)} />
          </div>

          {data.compradores.length > 0 ? (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30 text-xs text-muted-foreground">
                      <th className="py-2 px-3 text-left font-medium">Comprador</th>
                      <th className="py-2 px-3 text-left font-medium whitespace-nowrap">Compra perpétuo</th>
                      <th className="py-2 px-3 text-left font-medium whitespace-nowrap">Compra HT</th>
                      <th className="py-2 px-3 text-right font-medium">Compras HT</th>
                      <th className="py-2 px-3 text-right font-medium">Valor HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.compradores.map((c) => (
                      <tr key={c.email} className="border-b border-border/20 last:border-0 hover:bg-accent/40">
                        <td className="py-2 px-3">
                          <div className="font-medium truncate max-w-[220px]">{c.nome ?? c.email}</div>
                          {c.nome && <div className="text-xs text-muted-foreground truncate max-w-[220px]">{c.email}</div>}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">{fmtDate(c.dataPerpetuo)}</td>
                        <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">{fmtDate(c.dataHighTicket)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtNumber(c.comprasHighTicket)}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-medium">{formatCurrency(c.valorHighTicket)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ninguém do perpétuo comprou o high ticket depois ainda.
            </p>
          )}
        </>
      )}

      <PerpetualUpsellWizardDialog
        projectId={projectId}
        funnelId={funnelId}
        current={sheet ?? null}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
    </div>
  );
}
