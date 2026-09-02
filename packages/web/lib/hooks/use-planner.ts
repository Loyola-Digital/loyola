"use client";

/**
 * O Planner — leitura e escrita.
 *
 * ## Escrita otimista, e por quê
 *
 * Arrastar uma barra e ver o calendário só se mexer quando o servidor responde
 * é o tipo de latência que faz alguém arrastar duas vezes. As mutações aqui
 * atualizam o cache na hora e reconciliam depois; se o servidor recusar, o
 * cache volta ao que era.
 *
 * O servidor continua normalizando tudo (data ilegível vira vazio, fim antes do
 * início vira igual ao início), e o que ele devolve substitui o otimista. Se as
 * duas versões divergirem, a tela mostra a dele.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import type { Campanha, Fase } from "@/lib/planner/datas";

const BASE = "/api/planner/campanhas";
const CHAVE = ["planner", "campanhas"] as const;

export function usePlanner() {
  const api = useApiClient();
  return useQuery({
    queryKey: CHAVE,
    queryFn: () => api<{ campanhas: Campanha[] }>(BASE),
  });
}

/** O que dá para mudar numa campanha. Tudo opcional — manda-se só o que mexeu. */
export interface MudancaNaCampanha {
  name?: string;
  color?: string;
  projectId?: string | null;
  phases?: Fase[];
  sortOrder?: number;
}

export function useCriarCampanha() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entrada: { name: string; phases?: Fase[]; color?: string }) =>
      api<Campanha>(BASE, { method: "POST", body: JSON.stringify(entrada) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useAtualizarCampanha() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: MudancaNaCampanha }) =>
      api<Campanha>(`${BASE}/${id}`, { method: "PUT", body: JSON.stringify(dados) }),

    // Otimista: a barra precisa acompanhar o cursor, não a rede.
    onMutate: async ({ id, dados }) => {
      await qc.cancelQueries({ queryKey: CHAVE });
      const antes = qc.getQueryData<{ campanhas: Campanha[] }>(CHAVE);
      qc.setQueryData<{ campanhas: Campanha[] }>(CHAVE, (atual) =>
        atual
          ? { campanhas: atual.campanhas.map((c) => (c.id === id ? { ...c, ...dados } : c)) }
          : atual,
      );
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      // Volta ao que era: melhor a tela recuar visivelmente do que ficar
      // mostrando uma data que o servidor recusou.
      if (ctx?.antes) qc.setQueryData(CHAVE, ctx.antes);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useDuplicarCampanha() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Campanha>(`${BASE}/${id}/duplicar`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useExcluirCampanha() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`${BASE}/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: CHAVE });
      const antes = qc.getQueryData<{ campanhas: Campanha[] }>(CHAVE);
      qc.setQueryData<{ campanhas: Campanha[] }>(CHAVE, (atual) =>
        atual ? { campanhas: atual.campanhas.filter((c) => c.id !== id) } : atual,
      );
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(CHAVE, ctx.antes);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

/** Restaura uma campanha excluída — é o que o desfazer usa. */
export function useRestaurarCampanha() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Campanha) =>
      api<Campanha>(BASE, {
        method: "POST",
        body: JSON.stringify({ name: c.name, color: c.color, phases: c.phases }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

// ============================================================
// Agenda do Google
// ============================================================

const GOOGLE = "/api/planner/google";
const CHAVE_AGENDAS = ["planner", "agendas-google"] as const;

export interface AgendaDoGoogle {
  id: string;
  calendarId: string;
  label: string;
  lastImportedAt: string | null;
}

export function useAgendasDoGoogle(habilitado = true) {
  const api = useApiClient();
  return useQuery({
    queryKey: CHAVE_AGENDAS,
    queryFn: () =>
      api<{ agendas: AgendaDoGoogle[]; emailParaCompartilhar: string | null }>(
        `${GOOGLE}/agendas`,
      ),
    enabled: habilitado,
  });
}

export function useConectarAgenda() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (calendarId: string) =>
      api<AgendaDoGoogle>(`${GOOGLE}/agendas`, {
        method: "POST",
        body: JSON.stringify({ calendarId }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHAVE_AGENDAS }),
  });
}

export function useDesconectarAgenda() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`${GOOGLE}/agendas/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHAVE_AGENDAS }),
  });
}

export interface ResultadoDaImportacao {
  lidos: number;
  /** Reuniões: evento com hora marcada não é fase. */
  ignoradosPorTerHora: number;
  campanhasCriadas: number;
  campanhasAtualizadas: number;
  fases: number;
}

export function useImportarAgenda() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (corpo: { calendarId: string; mesesAtras?: number; mesesAFrente?: number }) =>
      api<ResultadoDaImportacao>(`${GOOGLE}/importar`, {
        method: "POST",
        body: JSON.stringify(corpo),
      }),
    onSuccess: () => {
      // Invalida as DUAS: a importação mexe nas campanhas e carimba a data da
      // última importação na agenda.
      void qc.invalidateQueries({ queryKey: CHAVE });
      void qc.invalidateQueries({ queryKey: CHAVE_AGENDAS });
    },
  });
}
