"use client";

/**
 * A atualização progressiva do dashboard.
 *
 * Chama `refresh-all` (NDJSON) e vai pintando cada widget conforme a linha dele
 * chega, em vez de esperar o mais lento. As duas máquinas de estado — controle
 * de levas e leitura de NDJSON — moram em `lib/bi/` e são testadas lá; aqui fica
 * só a ponte com o React e com o token de autenticação.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { criarControleDeLevas, type ContextoDaLeva } from "@/lib/bi/levas";
import { lerNdjson } from "@/lib/bi/ndjson";
import type { DateRange } from "@/lib/bi/tipos";
import type { ResultadoDoWidget } from "@/lib/hooks/use-bi";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface ContextoPedido {
  dateRange?: DateRange;
  slicers?: { field: string; values: string[] }[];
}

type LinhaNdjson =
  | { tipo: "inicio"; total: number; periodo: { start: string; end: string } }
  | { tipo: "widget"; widgetId: string; resultado: ResultadoDoWidget }
  | { tipo: "fim" };

export function useRefreshProgressivo(projectId: string | null, dashboardId: string | null) {
  const { getToken } = useAuth();
  const [resultados, setResultados] = useState<Record<string, ResultadoDoWidget>>({});
  const [carregando, setCarregando] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [periodo, setPeriodo] = useState<{ start: string; end: string } | null>(null);

  // O endereço muda quando o dashboard muda; a função de executar precisa ver
  // sempre o valor atual sem recriar o controle (o que reiniciaria o debounce).
  const alvo = useRef({ projectId, dashboardId });
  alvo.current = { projectId, dashboardId };

  const executar = useCallback(
    async (ctxPedido: ContextoPedido, leva: ContextoDaLeva) => {
      const { projectId: pid, dashboardId: did } = alvo.current;
      if (!pid || !did) return;

      setCarregando(true);
      try {
        const token = await getToken();
        const resposta = await fetch(
          `${API_URL}/api/projects/${pid}/bi/dashboards/${did}/refresh-all`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(ctxPedido),
            signal: leva.sinal,
          },
        );
        if (!resposta.ok) throw new Error(`Falha ao atualizar (${resposta.status})`);

        await lerNdjson<LinhaNdjson>(
          resposta.body,
          (linha) => {
            // A checagem por linha, e não só no fim: a leva antiga pode estar
            // no meio da leitura quando a nova começa, e cada linha dela
            // pintaria por cima do valor certo.
            if (!leva.ehAtual()) return;
            if (linha.tipo === "inicio") {
              setPendentes(linha.total);
              setPeriodo(linha.periodo);
            } else if (linha.tipo === "widget") {
              setResultados((atuais) => ({ ...atuais, [linha.widgetId]: linha.resultado }));
              setPendentes((n) => Math.max(0, n - 1));
            }
          },
          leva.sinal,
        );
      } catch (erro) {
        // Aborto é o funcionamento normal de troca de filtro, não falha.
        if ((erro as Error)?.name === "AbortError") return;
        throw erro;
      } finally {
        if (leva.ehAtual()) {
          setCarregando(false);
          setPendentes(0);
        }
      }
    },
    [getToken],
  );

  const controle = useMemo(() => criarControleDeLevas(executar), [executar]);

  useEffect(() => {
    // Trocar de dashboard limpa o que estava pintado: manter os resultados do
    // anterior faria o novo aparecer com números que não são dele.
    setResultados({});
    controle.cancelar();
    if (projectId && dashboardId) void controle.agora({});
    return () => controle.cancelar();
  }, [projectId, dashboardId, controle]);

  return {
    resultados,
    carregando,
    pendentes,
    periodo,
    /** Troca de filtro: entra pelo debounce. */
    pedir: controle.pedir,
    /** Botão de atualizar: dispara na hora. */
    atualizarAgora: controle.agora,
  };
}
