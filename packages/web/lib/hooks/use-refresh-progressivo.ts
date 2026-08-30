"use client";

/**
 * A atualização progressiva do dashboard.
 *
 * Chama `refresh-all` (NDJSON) e vai pintando cada widget conforme a linha dele
 * chega, em vez de esperar o mais lento. As duas máquinas de estado — controle
 * de levas e leitura de NDJSON — moram em `lib/bi/` e são testadas lá; aqui fica
 * só a ponte com o React e com o token de autenticação.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { criarControleDeLevas, type ContextoDaLeva } from "@/lib/bi/levas";
import { lerNdjson } from "@/lib/bi/ndjson";
import { reduzirResultados } from "@/lib/bi/resultados";
import type { DateRange } from "@/lib/bi/tipos";
import type { ResultadoDoWidget } from "@/lib/hooks/use-bi";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface ContextoPedido {
  dateRange?: DateRange;
  slicers?: { field: string; values: string[] }[];
}

type LinhaNdjson =
  | {
      tipo: "inicio";
      total: number;
      periodo: { start: string; end: string };
      /** Quantos projetos entraram — a tela diz isso no escopo consolidado. */
      projetosNoEscopo: number;
    }
  | { tipo: "widget"; widgetId: string; resultado: ResultadoDoWidget }
  | { tipo: "fim" };

export function useRefreshProgressivo(projectId: string | null, dashboardId: string | null) {
  const { getToken } = useAuth();
  // O reducer mora em `lib/bi/resultados.ts` e é testado lá: é ele que garante
  // que a leva passa por cima da semente, e que trocar de projeto zera as duas.
  const [resultados, despachar] = useReducer(
    reduzirResultados,
    {} as Record<string, ResultadoDoWidget>,
  );
  const [carregando, setCarregando] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [periodo, setPeriodo] = useState<{ start: string; end: string } | null>(null);
  const [projetosNoEscopo, setProjetosNoEscopo] = useState(0);

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
              setProjetosNoEscopo(linha.projetosNoEscopo ?? 1);
            } else if (linha.tipo === "widget") {
              despachar({
                tipo: "chegou",
                widgetId: linha.widgetId,
                resultado: linha.resultado,
              });
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
    // Trocar de dashboard ou de projeto limpa o que estava pintado: manter os
    // resultados do anterior faria o novo aparecer com números que não são dele.
    despachar({ tipo: "limpar" });
    setPeriodo(null);
    controle.cancelar();
    if (projectId && dashboardId) void controle.agora({});
    return () => controle.cancelar();
  }, [projectId, dashboardId, controle]);

  /**
   * Semeia o resultado de um widget recém-criado.
   *
   * Entra no MESMO mapa das levas, e não num mapa paralelo com prioridade: a
   * semente é um valor provisório, e a próxima leva tem que poder passar por
   * cima dela. Guardá-la separado — como estava — fazia o widget inserido nesta
   * sessão continuar mostrando o número do projeto anterior depois de trocar de
   * projeto ou de escopo, com cara de atual.
   */
  const semear = useCallback((widgetId: string, resultado: ResultadoDoWidget) => {
    despachar({ tipo: "semear", widgetId, resultado });
  }, []);

  return {
    resultados,
    carregando,
    pendentes,
    periodo,
    projetosNoEscopo,
    semear,
    /** Troca de filtro: entra pelo debounce. */
    pedir: controle.pedir,
    /** Botão de atualizar: dispara na hora. */
    atualizarAgora: controle.agora,
  };
}
