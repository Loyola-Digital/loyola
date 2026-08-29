"use client";

/**
 * A conversa com o agente do BI, em streaming.
 *
 * Streaming por dois motivos que se resolvem juntos: a IA pensa por dez a trinta
 * segundos, e um POST silencioso nesse tempo é cortado pelo proxy (o navegador
 * reporta "Failed to fetch"); e "Montando…" parado é indistinguível de travado.
 *
 * Cada widget aparece assim que o número dele chega — não no fim.
 */

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { lerNdjson } from "@/lib/bi/ndjson";
import type { Widget } from "@/lib/bi/tipos";
import type { ResultadoDoWidget } from "@/lib/hooks/use-bi";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type PassoDoAgente =
  | { tipo: "lendo" }
  | { tipo: "pensando"; tentativa: number }
  | { tipo: "montou"; titulo: string; grafico: string }
  | { tipo: "corrigindo"; motivo: string }
  | { tipo: "calculando"; titulo: string };

type LinhaDoAgente =
  | { tipo: "passo"; passo: PassoDoAgente }
  | { tipo: "widget"; widget: Widget; resultado: ResultadoDoWidget }
  | { tipo: "fim"; explicacao: string; avisos: string[] }
  | { tipo: "erro"; error: string };

/** O passo em português, como aparece na tela. */
export function textoDoPasso(p: PassoDoAgente): string {
  switch (p.tipo) {
    case "lendo":
      return "Lendo as métricas disponíveis…";
    case "pensando":
      return p.tentativa === 0
        ? "Escolhendo o que medir e como mostrar…"
        : "Refazendo com as métricas certas…";
    case "montou":
      return `Montou: ${p.titulo} (${p.grafico})`;
    case "corrigindo":
      return "Uma métrica não existia — corrigindo…";
    case "calculando":
      return `Calculando: ${p.titulo}`;
  }
}

export function useAgenteDeBi(projectId: string | null, dashboardId: string | null) {
  const { getToken } = useAuth();
  const [passos, setPassos] = useState<PassoDoAgente[]>([]);
  const [pensando, setPensando] = useState(false);
  const [explicacao, setExplicacao] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const emVoo = useRef<AbortController | null>(null);

  const perguntar = useCallback(
    async (
      pergunta: string,
      aoChegarWidget: (widget: Widget, resultado: ResultadoDoWidget) => void,
    ) => {
      if (!projectId || !dashboardId) return;

      // Uma pergunta por vez: a anterior sai de cena junto com o que ela estava
      // montando, senão dois conjuntos de widgets chegariam misturados.
      emVoo.current?.abort();
      const controlador = new AbortController();
      emVoo.current = controlador;

      setPassos([]);
      setExplicacao(null);
      setAvisos([]);
      setPensando(true);

      try {
        const token = await getToken();
        const resposta = await fetch(
          `${API_URL}/api/projects/${projectId}/bi/dashboards/${dashboardId}/agente`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ pergunta }),
            signal: controlador.signal,
          },
        );

        if (!resposta.ok) {
          // Erro antes do stream começar (403, 404, 400) vem como JSON normal.
          const corpo = (await resposta.json().catch(() => null)) as { error?: string } | null;
          setAvisos([corpo?.error ?? `Falha ao perguntar (${resposta.status})`]);
          return;
        }

        await lerNdjson<LinhaDoAgente>(
          resposta.body,
          (linha) => {
            if (linha.tipo === "passo") {
              setPassos((atuais) => [...atuais, linha.passo]);
            } else if (linha.tipo === "widget") {
              aoChegarWidget(linha.widget, linha.resultado);
            } else if (linha.tipo === "fim") {
              setExplicacao(linha.explicacao);
              setAvisos(linha.avisos);
            } else if (linha.tipo === "erro") {
              setAvisos([linha.error]);
            }
          },
          controlador.signal,
        );
      } catch (erro) {
        if ((erro as Error)?.name === "AbortError") return;
        setAvisos([(erro as Error)?.message ?? "Não consegui montar agora."]);
      } finally {
        if (emVoo.current === controlador) {
          setPensando(false);
          emVoo.current = null;
        }
      }
    },
    [projectId, dashboardId, getToken],
  );

  return { perguntar, passos, pensando, explicacao, avisos };
}
