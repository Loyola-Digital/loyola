"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  useGenerateInstagramReport,
  useInstagramReports,
} from "@/lib/hooks/use-instagram-report";

interface GenerateReportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getLast12Months(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  // Inclui mês corrente + últimos 12 anteriores
  for (let i = 0; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    out.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return out;
}

export function GenerateReportDialog({
  projectId,
  open,
  onOpenChange,
}: GenerateReportDialogProps) {
  const router = useRouter();
  const months = useMemo(() => getLast12Months(), []);
  // Default: mês passado
  const [selectedMonth, setSelectedMonth] = useState<string>(months[1]?.value ?? months[0]?.value ?? "");

  const { data: existingReports } = useInstagramReports(open ? projectId : null);
  const generateMutation = useGenerateInstagramReport(projectId);

  const alreadyExists = (existingReports ?? []).some((r) => r.month === selectedMonth);

  async function handleGenerate() {
    if (!selectedMonth) return;
    try {
      const result = await generateMutation.mutateAsync({ month: selectedMonth });
      toast.success("Relatório gerado!");
      onOpenChange(false);
      router.push(`/projects/${projectId}/reports/instagram/${result.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar relatório";
      toast.error(msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Gerar relatório do mês
          </DialogTitle>
          <DialogDescription>
            O relatório agrega todas as contas IG vinculadas a este projeto, com top/bottom posts, saldo de seguidores, totais, distribuição, gráfico diário e demografia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Mês
            </label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um mês..." />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {alreadyExists && (
            <p className="text-xs text-amber-600">
              ⚠ Já existe relatório para este mês. Gerar substituirá o anterior.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            A geração pode demorar até 1 minuto dependendo da quantidade de posts e contas vinculadas.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generateMutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={!selectedMonth || generateMutation.isPending}>
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              "Gerar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
