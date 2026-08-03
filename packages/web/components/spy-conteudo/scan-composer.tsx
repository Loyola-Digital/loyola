"use client";

/**
 * Spy de Conteúdo — composer em formato de conversa.
 *
 * Substitui o formulário (username + limite + botão) por um fluxo que pergunta
 * uma coisa de cada vez: perfil → o que você quer saber → confirma. Duas razões
 * além do visual:
 *
 * 1. O campo "foco" só faz sentido depois que a pessoa pensou no perfil. Num
 *    formulário ele vira mais um input ignorado; aqui é uma pergunta.
 * 2. O foco chega ao prompt do analyzer e muda a análise de verdade — não é
 *    enfeite (ver `analyzer.ts` → `resposta_ao_foco`).
 *
 * É um roteiro determinístico, NÃO uma conversa com LLM: os passos são fixos e
 * conhecidos. Uma ida ao modelo aqui só somaria latência e custo pra coletar
 * dois campos.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Radar, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Sugestões de foco — atalhos pra quem não sabe o que perguntar. */
const SUGESTOES = [
  "Como ele estrutura os ganchos dos Reels?",
  "O que ele vende e como conduz pra oferta?",
  "Que temas dão mais engajamento e por quê?",
  "Qual a cara editorial dele — tom, ritmo, formato?",
] as const;

type Etapa = "perfil" | "foco" | "enviando";

interface Bolha {
  id: number;
  autor: "bot" | "user";
  texto: string;
}

export function ScanComposer({
  onSubmit,
  pending,
}: {
  onSubmit: (input: { username: string; focus?: string }) => Promise<void> | void;
  pending: boolean;
}) {
  const [etapa, setEtapa] = useState<Etapa>("perfil");
  const [bolhas, setBolhas] = useState<Bolha[]>([
    {
      id: 0,
      autor: "bot",
      texto: "Qual perfil você quer investigar? Pode mandar o @ ou o link.",
    },
  ]);
  const [valor, setValor] = useState("");
  const [username, setUsername] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    if (etapa !== "enviando") inputRef.current?.focus();
  }, [bolhas, etapa]);

  function push(autor: Bolha["autor"], texto: string) {
    setBolhas((b) => [...b, { id: b.length, autor, texto }]);
  }

  async function disparar(focus?: string) {
    setEtapa("enviando");
    try {
      await onSubmit({ username, focus });
      // Reinicia pro próximo scan — a lista à esquerda já mostra o que foi criado.
      setBolhas([
        { id: 0, autor: "bot", texto: "Qual perfil você quer investigar? Pode mandar o @ ou o link." },
      ]);
      setUsername("");
      setValor("");
      setEtapa("perfil");
    } catch {
      // O erro já vira toast na página; volta pro passo do foco pra pessoa
      // tentar de novo sem redigitar o perfil.
      push("bot", "Não consegui iniciar esse scan. Quer tentar de novo?");
      setEtapa("foco");
    }
  }

  function enviar() {
    const texto = valor.trim();
    if (!texto || etapa === "enviando") return;

    if (etapa === "perfil") {
      push("user", texto);
      setUsername(texto);
      setValor("");
      setEtapa("foco");
      // Pequeno atraso pra a resposta não aparecer no mesmo frame da pergunta —
      // sem isso o fluxo parece um formulário que se preencheu sozinho.
      setTimeout(() => {
        push(
          "bot",
          "O que você mais quer saber sobre esse perfil? Escreva a pergunta, ou peça a análise padrão pra receber o diagnóstico completo.",
        );
      }, 320);
      return;
    }

    // etapa === "foco"
    push("user", texto);
    setValor("");
    void disparar(texto);
  }

  const placeholder =
    etapa === "perfil"
      ? "@perfil ou instagram.com/perfil"
      : "Ex: como ele estrutura os ganchos dos Reels?";

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/40">
      {/* Brilho sutil no topo — dá o ar de "ferramenta de IA" sem custar layout. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-40 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.16),transparent_70%)]"
      />

      <div className="relative space-y-3 p-4">
        {/* Conversa */}
        <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {bolhas.map((b) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className={`flex gap-2 ${b.autor === "user" ? "justify-end" : ""}`}
              >
                {b.autor === "bot" && (
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Radar className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    b.autor === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-foreground"
                  }`}
                >
                  {b.texto}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {etapa === "enviando" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              Colocando na fila...
            </motion.div>
          )}
          <div ref={fimRef} />
        </div>

        {/* Sugestões de foco — só no passo certo, e some ao enviar. */}
        <AnimatePresence>
          {etapa === "foco" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-1.5 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => void disparar(undefined)}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <Sparkles className="h-3 w-3" />
                Análise padrão
              </button>
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    push("user", s);
                    void disparar(s);
                  }}
                  className="rounded-full border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Entrada */}
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={placeholder}
            rows={etapa === "foco" ? 2 : 1}
            disabled={etapa === "enviando" || pending}
            className="min-h-0 resize-none text-sm"
            onKeyDown={(e) => {
              // Enter envia; Shift+Enter quebra linha (a pergunta pode ser longa).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
          />
          <Button
            size="icon"
            onClick={enviar}
            disabled={!valor.trim() || etapa === "enviando" || pending}
            title={etapa === "perfil" ? "Continuar" : "Analisar"}
            className="h-9 w-9 shrink-0"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          A coleta e a análise rodam no servidor e levam alguns minutos — pode fechar a página. Um
          perfil com a mesma pergunta nas últimas 12h é reaproveitado em vez de refeito.
        </p>
      </div>
    </div>
  );
}
