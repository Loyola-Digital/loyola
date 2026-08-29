"use client";

/**
 * Perguntar em português e receber o widget montado.
 *
 * A IA escolhe as métricas do catálogo — ela conhece as 25 e sabe que CPL geral
 * e CPL atribuído são coisas diferentes, o que quem pergunta normalmente não
 * sabe. O que ela **não** faz é escrever consulta: o servidor valida a escolha
 * dela contra o mesmo catálogo antes de qualquer coisa virar SQL.
 *
 * Por isso a explicação aparece junto com o widget: é ela que deixa conferir se
 * a pergunta foi entendida como se queria.
 */

import { useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Perguntas de partida — tirar a tela em branco é metade do uso. */
const EXEMPLOS = [
  "Quanto gastei por campanha?",
  "Investimento e CPM por dia",
  "Top 10 criativos por gasto, com CTR",
  "Receita por produto no período",
];

export function PerguntaAoBi({
  onPerguntar,
  pensando,
  explicacao,
  avisos,
}: {
  onPerguntar: (pergunta: string) => void;
  pensando: boolean;
  explicacao: string | null;
  avisos: string[];
}) {
  const [texto, setTexto] = useState("");

  function enviar() {
    const p = texto.trim();
    if (p.length < 3 || pensando) return;
    onPerguntar(p);
    setTexto("");
  }

  return (
    <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <h4 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Sparkles className="size-3.5" />
        Pergunte
      </h4>

      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          // Enter envia, Shift+Enter quebra linha — o que se espera de um campo
          // de conversa, e não de um formulário.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            enviar();
          }
        }}
        placeholder="Ex.: quanto gastei por campanha nos últimos 30 dias?"
        className="min-h-[68px] resize-none text-sm"
        disabled={pensando}
      />

      <div className="flex flex-wrap gap-1">
        {EXEMPLOS.map((e) => (
          <button
            key={e}
            type="button"
            disabled={pensando}
            onClick={() => setTexto(e)}
            className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:bg-accent disabled:opacity-50"
          >
            {e}
          </button>
        ))}
      </div>

      <Button size="sm" className="w-full" onClick={enviar} disabled={pensando || texto.trim().length < 3}>
        {pensando ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Montando…
          </>
        ) : (
          <>
            <Sparkles className="size-3.5" />
            Montar widget
          </>
        )}
      </Button>

      {explicacao && (
        <p className="rounded-md bg-background px-2.5 py-2 text-xs text-muted-foreground">
          {explicacao}
        </p>
      )}

      {avisos.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-500">
            <AlertTriangle className="size-3" />
            O que não deu
          </p>
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {avisos.map((a) => (
              <li key={a}>• {a}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
