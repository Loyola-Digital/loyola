"use client";

import { useState } from "react";
import { AlertTriangle, ClipboardList, FileSpreadsheet } from "lucide-react";
import {
  SURVEY_QUESTION_MAP,
  type SurveyQuestionKey,
} from "@/lib/constants/survey-questions";
import type {
  SurveyQuestionAggregation,
  SurveyOrigin,
  UseSurveyAggregationResult,
} from "@/lib/hooks/use-survey-aggregation";
import { cn } from "@/lib/utils";

interface SurveyQualificationSectionProps {
  /** Estado de loading (se true, renderiza skeleton) */
  isLoading: boolean;
  /** Se false, renderiza empty state "vincule pesquisa" */
  hasSurveys: boolean;
  /** Dados agregados do hook `useSurveyAggregation` */
  data: Pick<
    UseSurveyAggregationResult,
    "byQuestion" | "byQuestionByOrigin" | "totalResponses" | "usingFallback" | "fallbackReason" | "matchedResponses" | "unmatchedResponses"
  >;
}

const ORIGIN_OPTIONS: { value: SurveyOrigin; label: string }[] = [
  { value: "total", label: "Total" },
  { value: "pago", label: "Pago" },
  { value: "organico", label: "Orgânico" },
];

/**
 * Lista de perguntas renderizadas na seção 3.a, derivada do `SURVEY_QUESTION_MAP`
 * filtrando só as que incluem `"qualification"` em `showIn`. Assim, adicionar
 * nova pergunta no mapa com `showIn: ["qualification"]` faz ela aparecer aqui
 * automaticamente — evita bug de "esqueci de adicionar no componente".
 */
const QUALIFICATION_QUESTIONS: SurveyQuestionKey[] = (
  Object.entries(SURVEY_QUESTION_MAP) as Array<
    [SurveyQuestionKey, (typeof SURVEY_QUESTION_MAP)[SurveyQuestionKey]]
  >
)
  .filter(([, def]) => (def.showIn as readonly string[]).includes("qualification"))
  .map(([key]) => key);

/**
 * Barra horizontal proporcional ao pct da resposta. Mostra label (esquerda),
 * contagem absoluta (direita) e percentual (abaixo da barra).
 */
function HorizontalBar({ item }: { item: SurveyQuestionAggregation }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate flex-1">{item.label}</span>
        <span className="text-muted-foreground tabular-nums shrink-0 text-[10px]">
          {item.count}
        </span>
        <span className="text-muted-foreground tabular-nums shrink-0 w-10 text-right text-[10px]">
          {item.pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
        <div
          className="h-full bg-primary/70 rounded-full transition-all"
          style={{ width: `${Math.min(item.pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Seção "Resultados da Pesquisa — Qualificação do público" renderizada no
 * final do LaunchDashboard (Story 18.6 sub-feature 3.a).
 *
 * Exibe 3 perguntas em barras horizontais com top-8 + "Outros (N)":
 * - Qual seu faturamento mensal?
 * - Qual sua profissão?
 * - Quantos funcionários você tem?
 *
 * Estados:
 * - loading: skeleton do bloco inteiro
 * - sem pesquisas vinculadas: mensagem acionável
 * - pesquisas mas totalResponses=0: "sem respostas ainda"
 * - usingFallback: banner amarelo com explicação
 */
export function SurveyQualificationSection({
  isLoading,
  hasSurveys,
  data,
}: SurveyQualificationSectionProps) {
  const [origin, setOrigin] = useState<SurveyOrigin>("total");

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3 animate-pulse">
        <div className="h-4 w-64 bg-muted/30 rounded" />
        <div className="h-20 bg-muted/20 rounded" />
      </div>
    );
  }

  if (!hasSurveys) {
    return (
      <div className="rounded-xl border border-dashed border-border/30 bg-card/60 p-5 space-y-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Resultados da Pesquisa — Qualificação do público</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Nenhuma pesquisa vinculada a este funil.
        </p>
        <p className="text-xs">
          <FileSpreadsheet className="h-3 w-3 inline mr-1" />
          Vincule uma pesquisa na aba <span className="font-medium">Pesquisas</span> pra ver os
          resultados aqui.
        </p>
      </div>
    );
  }

  if (data.totalResponses === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Resultados da Pesquisa — Qualificação do público</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Pesquisa vinculada sem respostas ainda.
        </p>
      </div>
    );
  }

  // Agregação ativa conforme filtro de origem (Story 21.6). Fallback pra
  // byQuestion (total) caso byQuestionByOrigin ausente — robustez.
  const activeByQuestion = data.byQuestionByOrigin?.[origin] ?? data.byQuestion;

  // Perguntas que têm dados (pelo menos 1 resposta) no bucket ativo
  const questionsWithData = QUALIFICATION_QUESTIONS.filter(
    (key) => activeByQuestion[key].length > 0,
  );

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold">Resultados da Pesquisa — Qualificação do público</h3>
            <p className="text-[11px] text-muted-foreground">
              {data.totalResponses} respostas analisadas - {data.matchedResponses} com match - {data.unmatchedResponses} sem match
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              Apenas respondentes com email ou telefone identificados na planilha de Leads são contabilizados como match. Respostas sem match podem ser leads orgânicos ou emails/telefones diferentes entre etapas.
            </p>
          </div>
        </div>
        {/* Filtro por origem — Story 21.6 */}
        <div
          role="group"
          aria-label="Filtrar por origem"
          className="inline-flex rounded-md border border-border/50 bg-background/40 p-0.5 shadow-sm"
        >
          {ORIGIN_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setOrigin(value)}
              aria-pressed={origin === value}
              className={cn(
                "px-3 py-1 text-[11px] font-medium rounded transition-colors",
                origin === value
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {data.usingFallback && data.fallbackReason && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-start gap-2 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-700 dark:text-amber-400">
            <span className="font-medium">Exibindo histórico total:</span> {data.fallbackReason}.
          </p>
        </div>
      )}

      {questionsWithData.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Nenhuma das perguntas mapeadas foi encontrada nas planilhas vinculadas.
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {questionsWithData.map((key) => {
            const def = SURVEY_QUESTION_MAP[key];
            const items = activeByQuestion[key];
            return (
              <div key={key} className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {def.label}
                </h4>
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <HorizontalBar key={`${item.label}-${i}`} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
