"use client";

/**
 * O modelo de Lead Scoring editado como tabela, não como JSON.
 *
 * ## Por que existe
 *
 * O modelo chegava pronto de um fluxo do n8n e era colado num campo de JSON.
 * Mesmo depois de o rascunho passar a vir do Tally, ajustar quanto vale cada
 * resposta — que é a única parte que exige conhecer o lançamento — continuava
 * sendo editar chaves e vírgulas à mão, onde um `,` fora do lugar invalida o
 * modelo inteiro.
 *
 * Aqui cada pergunta é uma linha, cada alternativa tem o seu campo de pontos, e
 * o total recalcula na hora.
 *
 * ## Os três números derivados
 *
 * `max_points` por pergunta, `max_possible_score` e os limites das faixas não
 * são digitados: saem dos pontos. Mantidos à mão eles divergem em silêncio — um
 * `max_possible_score` velho desloca todas as faixas e muda a classificação de
 * todo mundo sem nenhum erro aparecer. O servidor recalcula ao salvar; o que
 * esta tela mostra é a prévia da mesma conta.
 */

import { useMemo } from "react";
import { Scale, Sigma } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Resposta {
  value: string;
  points?: number;
  points_conditional?: { if_q4_filled: number; if_q4_empty: number };
}

interface Pergunta {
  id: string;
  label?: string;
  weight?: number;
  max_points?: number;
  answers: Resposta[];
  unmapped_default?: number;
}

interface Faixa {
  id: string;
  range: { min: number; max: number };
  recommended_action?: string;
  description?: string;
}

export interface ModeloDeScoring {
  scoring_model?: { max_possible_score?: number; questions?: Pergunta[] };
  bands?: Faixa[];
  [k: string]: unknown;
}

/** O melhor caso de uma resposta — condicional conta pelo maior dos dois. */
function pontosDaResposta(r: Resposta): number {
  if (typeof r.points === "number") return r.points;
  if (r.points_conditional) {
    return Math.max(r.points_conditional.if_q4_filled, r.points_conditional.if_q4_empty);
  }
  return 0;
}

/** O máximo de cada pergunta e o total — a mesma conta que o servidor faz. */
export function totaisDoModelo(modelo: ModeloDeScoring): {
  porPergunta: Map<string, number>;
  total: number;
} {
  const porPergunta = new Map<string, number>();
  let total = 0;
  for (const q of modelo.scoring_model?.questions ?? []) {
    const maior = q.answers.reduce((m, a) => Math.max(m, pontosDaResposta(a)), 0);
    const max = maior * (q.weight ?? 1);
    porPergunta.set(q.id, max);
    total += max;
  }
  return { porPergunta, total };
}

export function EditorDeScoring({
  modelo,
  onChange,
}: {
  modelo: ModeloDeScoring;
  onChange: (novo: ModeloDeScoring) => void;
}) {
  const perguntas = modelo.scoring_model?.questions ?? [];
  const { porPergunta, total } = useMemo(() => totaisDoModelo(modelo), [modelo]);

  function trocarPergunta(idx: number, mudanca: Partial<Pergunta>) {
    const novas = perguntas.map((q, i) => (i === idx ? { ...q, ...mudanca } : q));
    onChange({ ...modelo, scoring_model: { ...modelo.scoring_model, questions: novas } });
  }

  function trocarPonto(qi: number, ai: number, pontos: number) {
    const pergunta = perguntas[qi];
    if (!pergunta) return;
    const answers = pergunta.answers.map((a, i) =>
      i === ai
        ? // Mexer nos pontos de uma condicional viraria os dois casos num só e
          // mudaria a regra sem avisar — então a condicional fica como está e a
          // tela diz isso.
          a.points_conditional
          ? a
          : { ...a, points: pontos }
        : a,
    );
    trocarPergunta(qi, { answers });
  }

  function trocarFaixa(idx: number, campo: "min" | "max", valor: number) {
    const bands = (modelo.bands ?? []).map((b, i) =>
      i === idx ? { ...b, range: { ...b.range, [campo]: valor } } : b,
    );
    onChange({ ...modelo, bands });
  }

  if (perguntas.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        Nenhuma pergunta no modelo ainda. Importe o formulário do Tally para começar.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sigma className="h-3.5 w-3.5" />
          Pontuação máxima possível
        </span>
        <span className="font-semibold tabular-nums">{total}</span>
      </div>

      <div className="space-y-3">
        {perguntas.map((q, qi) => (
          <div key={q.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{q.label || q.id}</p>
                <p className="text-[11px] text-muted-foreground">
                  vale até{" "}
                  <span className="font-semibold tabular-nums">{porPergunta.get(q.id) ?? 0}</span>{" "}
                  ponto(s)
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`peso-${q.id}`} className="flex items-center gap-1 text-[11px]">
                  <Scale className="h-3 w-3" />
                  Peso
                </Label>
                <Input
                  id={`peso-${q.id}`}
                  type="number"
                  min={0}
                  step={0.5}
                  value={q.weight ?? 1}
                  onChange={(e) => trocarPergunta(qi, { weight: Number(e.target.value) || 0 })}
                  className="h-8 w-20 text-xs"
                />
              </div>
            </div>

            {q.answers.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Resposta aberta — não pontua sozinha.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {q.answers.map((a, ai) => (
                  <li key={`${a.value}-${ai}`} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs">{a.value}</span>
                    {a.points_conditional ? (
                      <span className="text-[11px] text-muted-foreground">
                        condicional ({a.points_conditional.if_q4_filled} /{" "}
                        {a.points_conditional.if_q4_empty}) — edite no JSON
                      </span>
                    ) : (
                      <Input
                        type="number"
                        step={1}
                        value={a.points ?? 0}
                        onChange={(e) => trocarPonto(qi, ai, Number(e.target.value) || 0)}
                        className="h-8 w-20 text-xs tabular-nums"
                        aria-label={`Pontos de ${a.value}`}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {(modelo.bands ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Faixas
          </p>
          <div className="space-y-1.5">
            {(modelo.bands ?? []).map((b, i) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                <span className="w-8 text-sm font-semibold">{b.id}</span>
                <Input
                  type="number"
                  value={b.range.min}
                  onChange={(e) => trocarFaixa(i, "min", Number(e.target.value) || 0)}
                  className="h-8 w-20 text-xs tabular-nums"
                  aria-label={`Mínimo da faixa ${b.id}`}
                />
                <span className="text-xs text-muted-foreground">até</span>
                <Input
                  type="number"
                  value={b.range.max}
                  onChange={(e) => trocarFaixa(i, "max", Number(e.target.value) || 0)}
                  className="h-8 w-20 text-xs tabular-nums"
                  aria-label={`Máximo da faixa ${b.id}`}
                />
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                  {b.recommended_action || b.description}
                </span>
              </div>
            ))}
          </div>
          {/* A faixa mais alta precisa alcançar o total; senão o lead perfeito
              não cai em lugar nenhum e é contado como "não classificado". */}
          {Math.max(...(modelo.bands ?? []).map((b) => b.range.max)) < total && (
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              A faixa mais alta vai até{" "}
              {Math.max(...(modelo.bands ?? []).map((b) => b.range.max))}, mas o modelo chega a{" "}
              {total} — quem tirar mais que isso não cai em faixa nenhuma.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
