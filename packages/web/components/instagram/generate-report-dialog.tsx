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

/**
 * Quais anos dá para pedir.
 *
 * Social Media pediu para escolher mês E ano, não só os últimos 12 meses. O
 * teto é o ano corrente; o piso são 2 anos atrás, porque é até onde a Meta
 * devolve insights — oferecer 2023 geraria um relatório de zeros, que parece
 * defeito do painel e não limite da API.
 */
function anosDisponiveis(agora = new Date()): number[] {
  const atual = agora.getFullYear();
  return [atual, atual - 1, atual - 2];
}

const NOMES_DOS_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Meses de um ano, sem os que ainda não aconteceram. */
function mesesDoAno(ano: number, agora = new Date()): { value: string; label: string }[] {
  const ultimo = ano === agora.getFullYear() ? agora.getMonth() : 11;
  return NOMES_DOS_MESES.slice(0, ultimo + 1).map((nome, i) => ({
    value: `${ano}-${String(i + 1).padStart(2, "0")}`,
    label: nome,
  }));
}

/** O mês passado — o padrão de quem gera relatório mensal. */
function mesPassado(agora = new Date()): { ano: number; mes: string } {
  const d = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  return { ano: d.getFullYear(), mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` };
}

export function GenerateReportDialog({
  projectId,
  open,
  onOpenChange,
}: GenerateReportDialogProps) {
  const router = useRouter();
  const padrao = useMemo(() => mesPassado(), []);
  const anos = useMemo(() => anosDisponiveis(), []);
  const [selectedYear, setSelectedYear] = useState<number>(padrao.ano);
  const months = useMemo(() => mesesDoAno(selectedYear), [selectedYear]);
  const [selectedMonth, setSelectedMonth] = useState<string>(padrao.mes);

  // Trocar de ano pode deixar o mês escolhido fora da lista (dezembro no ano
  // corrente, por exemplo): cai no último mês disponível daquele ano.
  function trocarAno(ano: number) {
    setSelectedYear(ano);
    const disponiveis = mesesDoAno(ano);
    if (!disponiveis.some((m) => m.value === selectedMonth)) {
      setSelectedMonth(disponiveis[disponiveis.length - 1]?.value ?? "");
    }
  }

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
          <div className="grid grid-cols-[1fr_auto] gap-2">
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
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Ano
              </label>
              <Select value={String(selectedYear)} onValueChange={(v) => trocarAno(Number(v))}>
                <SelectTrigger className="w-[104px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anos.map((a) => (
                    <SelectItem key={a} value={String(a)}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
