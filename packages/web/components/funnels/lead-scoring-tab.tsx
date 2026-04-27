"use client";

import { useState, useEffect } from "react";
import { Brain, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFunnelSurveys } from "@/lib/hooks/use-google-sheets";
import {
  useLeadScoring,
  useSaveLeadScoring,
  useLeadScoringResults,
  type BandResult,
  type ProjectInfo,
} from "@/lib/hooks/use-lead-scoring";

interface LeadScoringTabProps {
  projectId: string;
  funnelId: string;
  stageId: string;
}

const BAND_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800 border-green-200",
  B: "bg-blue-100 text-blue-800 border-blue-200",
  C: "bg-yellow-100 text-yellow-800 border-yellow-200",
  D: "bg-red-100 text-red-800 border-red-200",
};

const ACTION_LABELS: Record<string, string> = {
  CONTACT_NOW: "Contatar agora",
  NURTURE: "Nutrir",
  QUALIFY_MORE: "Qualificar mais",
  LOW_PRIORITY: "Baixa prioridade",
  DISQUALIFY: "Desqualificar",
  DO_NOT_CONTACT: "Não contatar",
};

function fmtCurrency(v: number | null) {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNumber(v: number | undefined) {
  if (v === undefined || v === null) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

const SCHEMA_PLACEHOLDER = `{
  "schema_version": "1.0",
  "project": { "name": "...", "ticket": 0, "roas": 0, "cpa_ceiling": 0 },
  "scoring_model": {
    "max_possible_score": 100,
    "questions": [
      {
        "id": "Q1",
        "label": "renda",
        "new_survey_column": "Qual é sua renda mensal?",
        "weight": 17.57,
        "max_points": 17.57,
        "answers": [
          { "value": "R$ 5.000 - R$ 10.000", "points": 17.57 }
        ],
        "unmapped_default": 0
      }
    ]
  },
  "bands": [
    { "id": "A", "range": { "min": 80, "max": 101 }, "recommended_action": "CONTACT_NOW", "description": "Contatar agora — lead quente" },
    { "id": "B", "range": { "min": 70, "max": 80  }, "recommended_action": "NURTURE",     "description": "Nutrir" },
    { "id": "C", "range": { "min": 55, "max": 70  }, "recommended_action": "QUALIFY_MORE","description": "Qualificar mais" },
    { "id": "D", "range": { "min": 0,  "max": 55  }, "recommended_action": "DISQUALIFY",  "description": "Desqualificar" }
  ],
  "cpl_ideal": {
    "global": 17.99,
    "per_band": {
      "A": { "cpl": 22.18, "breakeven": 44.37 },
      "B": { "cpl": 19.37, "breakeven": 38.75 },
      "C": { "cpl": 16.15, "breakeven": 32.30 },
      "D": { "cpl": 9.30,  "breakeven": 18.60 }
    }
  }
}`;

export function LeadScoringTab({ projectId, funnelId, stageId }: LeadScoringTabProps) {
  const { data: surveysData } = useFunnelSurveys(projectId, funnelId, stageId);
  const { data: saved, isLoading } = useLeadScoring(projectId, funnelId, stageId);
  const { data: results, isLoading: resultsLoading, refetch: refetchResults } =
    useLeadScoringResults(projectId, funnelId, stageId);
  const saveSchema = useSaveLeadScoring(projectId, funnelId, stageId);

  const surveys = surveysData?.surveys ?? [];

  const [selectedSurveyId, setSelectedSurveyId] = useState<string>("");
  const [jsonText, setJsonText] = useState("");

  useEffect(() => {
    if (saved) {
      setSelectedSurveyId(saved.surveyId ?? "");
      setJsonText(JSON.stringify(saved.schemaJson, null, 2));
    }
  }, [saved]);

  async function handleSave() {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText);
      if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    } catch {
      toast.error("JSON inválido — verifique a sintaxe e tente novamente");
      return;
    }

    if ((parsed as { schema_version?: string }).schema_version !== "1.0") {
      toast.warning("schema_version diferente de \"1.0\" — salvando mesmo assim");
    }

    if (!(parsed as { scoring_model?: { questions?: unknown[] } }).scoring_model?.questions) {
      toast.error("Schema inválido — falta scoring_model.questions");
      return;
    }
    if (!(parsed as { bands?: unknown[] }).bands?.length) {
      toast.error("Schema inválido — falta bands[]");
      return;
    }

    try {
      await saveSchema.mutateAsync({
        surveyId: selectedSurveyId || null,
        schemaJson: parsed,
      });
      toast.success("Schema salvo com sucesso");
    } catch {
      toast.error("Erro ao salvar schema");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">Lead Scoring</h2>
      </div>

      {/* Configuração */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Configuração do Modelo
        </h3>

        <div className="space-y-2">
          <Label>Planilha de pesquisa</Label>
          {surveys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma planilha de pesquisa vinculada a esta etapa. Adicione uma na aba{" "}
              <strong>Pesquisas</strong>.
            </p>
          ) : (
            <Select value={selectedSurveyId} onValueChange={setSelectedSurveyId}>
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder="Selecionar planilha..." />
              </SelectTrigger>
              <SelectContent>
                {surveys.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.spreadsheetName} — {s.sheetName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label>Schema JSON (ctrl+c / ctrl+v do modelo externo)</Label>
          <Textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={SCHEMA_PLACEHOLDER}
            rows={16}
            className="font-mono text-xs"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saveSchema.isPending || !jsonText.trim()}
        >
          {saveSchema.isPending ? "Salvando..." : "Salvar Schema"}
        </Button>
      </div>

      {/* Project info */}
      {results?.project && <ProjectInfoCard project={results.project} />}

      {/* Resultados */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Distribuição por Banda
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => refetchResults()}
            disabled={resultsLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${resultsLoading ? "animate-spin" : ""}`} />
            Recalcular
          </Button>
        </div>

        {!saved ? (
          <p className="text-sm text-muted-foreground">
            Cole o JSON do modelo de Lead Scoring acima para começar.
          </p>
        ) : !selectedSurveyId && !saved.surveyId ? (
          <p className="text-sm text-muted-foreground">
            Selecione uma planilha de pesquisa para calcular os resultados.
          </p>
        ) : resultsLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !results || results.semDados ? (
          <p className="text-sm text-muted-foreground">
            Sem dados suficientes para calcular. Verifique se a planilha tem respostas e se os{" "}
            <code className="font-mono text-xs">new_survey_column</code> batem com os headers da
            planilha.
          </p>
        ) : (
          <ResultsTable results={results} />
        )}
      </div>
    </div>
  );
}

function ProjectInfoCard({ project }: { project: ProjectInfo }) {
  const items: { label: string; value: string }[] = [];
  if (project.name) items.push({ label: "Projeto", value: project.name });
  if (project.ticket !== undefined)
    items.push({ label: "Ticket", value: fmtCurrency(project.ticket) });
  if (project.roas !== undefined) items.push({ label: "ROAS", value: fmtNumber(project.roas) });
  if (project.cpa_ceiling !== undefined)
    items.push({ label: "CPA Ceiling", value: fmtCurrency(project.cpa_ceiling) });

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-4">
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {items.map((it) => (
          <div key={it.label} className="text-sm">
            <span className="text-muted-foreground">{it.label}: </span>
            <span className="font-medium">{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsTable({
  results,
}: {
  results: {
    total_leads_scored: number;
    unclassified: number;
    bands: BandResult[];
    cpl_global: number | null;
  };
}) {
  // Ordem A → D
  const ORDER = ["A", "B", "C", "D"];
  const ordered = [...results.bands].sort(
    (a, b) => (ORDER.indexOf(a.id) === -1 ? 99 : ORDER.indexOf(a.id))
      - (ORDER.indexOf(b.id) === -1 ? 99 : ORDER.indexOf(b.id)),
  );
  const total = results.total_leads_scored + results.unclassified;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Banda</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead className="text-right">CPL Ideal</TableHead>
            <TableHead className="text-right">CPL Breakeven</TableHead>
            <TableHead>Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordered.map((b) => (
            <TableRow key={b.id}>
              <TableCell>
                <Badge variant="outline" className={`font-bold ${BAND_COLORS[b.id] ?? ""}`}>
                  {b.id}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{b.description}</TableCell>
              <TableCell className="text-right font-medium">
                {b.leads_scored.toLocaleString("pt-BR")}
              </TableCell>
              <TableCell className="text-right">{b.pct.toFixed(1)}%</TableCell>
              <TableCell className="text-right">{fmtCurrency(b.cpl_ideal)}</TableCell>
              <TableCell className="text-right">{fmtCurrency(b.cpl_breakeven)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {ACTION_LABELS[b.recommended_action] ?? b.recommended_action}
              </TableCell>
            </TableRow>
          ))}
          {results.unclassified > 0 && (
            <TableRow className="text-muted-foreground">
              <TableCell>—</TableCell>
              <TableCell className="text-xs italic">Não classificado (score fora de range)</TableCell>
              <TableCell className="text-right">
                {results.unclassified.toLocaleString("pt-BR")}
              </TableCell>
              <TableCell className="text-right">
                {total > 0 ? ((results.unclassified / total) * 100).toFixed(1) : "0.0"}%
              </TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          )}
        </TableBody>
        <TableFooter>
          <TableRow className="font-semibold">
            <TableCell>Total</TableCell>
            <TableCell />
            <TableCell className="text-right">{total.toLocaleString("pt-BR")}</TableCell>
            <TableCell className="text-right">100%</TableCell>
            <TableCell className="text-right" colSpan={2}>
              {results.cpl_global !== null && (
                <span className="text-xs text-muted-foreground">
                  CPL global: {fmtCurrency(results.cpl_global)}
                </span>
              )}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
