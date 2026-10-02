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

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, History, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { textoDoPasso, type PassoDoAgente } from "@/lib/hooks/use-agente-de-bi";
import type { PerguntaGuardada } from "@/lib/bi/tipos";

/** "hoje", "ontem", "há 3 dias" — a idade basta para achar o que se procura. */
function quando(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const dias = Math.floor(ms / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

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
  passos,
  explicacao,
  avisos,
  historico = [],
}: {
  onPerguntar: (pergunta: string) => void;
  pensando: boolean;
  passos: PassoDoAgente[];
  explicacao: string | null;
  avisos: string[];
  /** O que já foi perguntado neste dashboard — ver `perguntasGuardadas`. */
  historico?: PerguntaGuardada[];
}) {
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  // A lista rola sozinha: o passo que interessa é sempre o último.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest" });
  }, [passos.length]);

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

      {/*
        O histórico fica ANTES do botão, junto dos exemplos: ele é a outra
        forma de começar uma pergunta. Antes a pergunta sumia assim que a
        resposta chegava — quem montou um widget bom na terça não tinha como
        lembrar o que digitou, e quem pegava o dashboard depois não sabia o
        que já havia sido tentado.
      */}
      {historico.length > 0 && (
        <details className="rounded-md bg-background px-2.5 py-1.5">
          <summary className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-muted-foreground">
            <History className="size-3" />
            Já perguntado aqui ({historico.length})
          </summary>
          <ul className="mt-1.5 max-h-44 space-y-1 overflow-y-auto">
            {[...historico].reverse().map((h, i) => (
              <li key={`${h.em}-${i}`}>
                <button
                  type="button"
                  disabled={pensando}
                  onClick={() => setTexto(h.texto)}
                  title="Usar esta pergunta de novo"
                  className="w-full rounded px-1 py-0.5 text-left text-[11px] transition hover:bg-accent disabled:opacity-50"
                >
                  <span className="line-clamp-2">{h.texto}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {quando(h.em)}
                    {h.por ? ` · ${h.por}` : ""} ·{" "}
                    {h.erro ? (
                      <span className="text-amber-600 dark:text-amber-500">falhou</span>
                    ) : h.widgets === 0 ? (
                      "sem widget"
                    ) : (
                      `${h.widgets} widget${h.widgets > 1 ? "s" : ""}`
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Button
        size="sm"
        className="w-full"
        onClick={enviar}
        disabled={pensando || texto.trim().length < 3}
      >
        {pensando ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Trabalhando…
          </>
        ) : (
          <>
            <Sparkles className="size-3.5" />
            Montar widget
          </>
        )}
      </Button>

      {passos.length > 0 && (
        // Os passos ficam depois de pronto: são o registro do que foi feito, e
        // é neles que se vê a IA ter corrigido a própria escolha.
        <ol className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-background px-2.5 py-2">
          {passos.map((p, i) => {
            const ultimo = i === passos.length - 1;
            const emAndamento = pensando && ultimo;
            return (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                {emAndamento ? (
                  <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin" />
                ) : (
                  <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                )}
                <span className={emAndamento ? "text-foreground" : undefined}>
                  {textoDoPasso(p)}
                </span>
              </li>
            );
          })}
          <div ref={fim} />
        </ol>
      )}

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
