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

import { toast } from "sonner";
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import type { Campanha, Fase } from "@/lib/planner/datas";
import { corDaCampanha } from "@/lib/planner/cor-do-expert";

const BASE = "/api/planner/campanhas";
const CHAVE = ["planner", "campanhas"] as const;

export function usePlanner() {
  const api = useApiClient();
  // A cor é a do EXPERT, fixa (ver `cor-do-expert.ts`). Aplicada aqui, na
  // leitura, para calendário, linha do tempo e cards pintarem igual sem cada
  // um lembrar da regra — e para valer também nas campanhas antigas, sem
  // regravar nada no banco.
  const { data: agendas } = useAgendasDoGoogle();
  const rotulos = useMemo(
    () => new Map((agendas?.agendas ?? []).map((a) => [a.calendarId, a.label])),
    [agendas],
  );
  const comCorDoExpert = useCallback(
    (d: { campanhas: Campanha[] }) => ({
      campanhas: d.campanhas.map((c) => ({
        ...c,
        color: corDaCampanha(c.name, rotulos.get(c.googleCalendarId ?? "")),
      })),
    }),
    [rotulos],
  );
  const qc = useQueryClient();
  return useQuery({
    queryKey: CHAVE,
    queryFn: () => api<{ campanhas: Campanha[] }>(BASE),
    select: comCorDoExpert,
    /**
     * A tela se atualiza sozinha — várias pessoas mexem no Planner ao mesmo
     * tempo, e a mudança de uma precisa chegar para quem está olhando sem F5.
     * Também traz o que a sincronia com o Google importou.
     *
     * PAUSA enquanto há gravação em voo: a busca que voltasse no meio dela
     * traria o estado de antes e a barra recém-arrastada pularia de volta até
     * a gravação terminar. Com a aba escondida o React Query já não busca.
     * O campo em edição num card guarda o próprio rascunho (`TextoInline`),
     * então a atualização não apaga o que está sendo digitado.
     */
    refetchInterval: () => (qc.isMutating() > 0 ? false : 10_000),
    // O staleTime global é de 5 min: sem isto, voltar para a aba não buscava
    // nada e a tela ficava velha até o F5.
    staleTime: 5_000,
  });
}

/** O que dá para mudar numa campanha. Tudo opcional — manda-se só o que mexeu. */
export interface MudancaNaCampanha {
  name?: string;
  color?: string;
  projectId?: string | null;
  phases?: Fase[];
  sortOrder?: number;
  /** Ligar (ou desligar) o espelho na agenda do Google. */
  googleCalendarId?: string | null;
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
      api<Campanha & { avisoGoogle?: string }>(`${BASE}/${id}`, {
        method: "PUT",
        body: JSON.stringify(dados),
      }),

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
    onSuccess: (r) => {
      // A campanha FOI salva; o que falhou foi o espelho na agenda. Silenciar
      // deixaria o time confiando num Google que ficou para trás -- e avisar
      // com erro faria parecer que a edição se perdeu, o que não aconteceu.
      if (r?.avisoGoogle) toast.warning(r.avisoGoogle);
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
        // Com a agenda: sem ela a campanha voltava só no Planner, e os eventos
        // que a exclusão apagou no Google nunca reapareciam.
        body: JSON.stringify({
          name: c.name,
          color: c.color,
          phases: c.phases,
          googleCalendarId: c.googleCalendarId ?? null,
        }),
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

/**
 * Grava a nova ordem das campanhas.
 *
 * Em lote e otimista: arrastar precisa ver o resultado no gesto, não depois da
 * rede. A posição é o índice na lista — recalcular do zero evita que dois
 * arrastos simultâneos produzam uma sequência com buracos.
 */
export function useReordenarCampanhas() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<{ ok: true }>(`${BASE}/ordem`, { method: "PUT", body: JSON.stringify({ ids }) }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: CHAVE });
      const antes = qc.getQueryData<{ campanhas: Campanha[] }>(CHAVE);
      qc.setQueryData<{ campanhas: Campanha[] }>(CHAVE, (atual) => {
        if (!atual) return atual;
        const porId = new Map(atual.campanhas.map((c) => [c.id, c]));
        const reordenadas = ids
          .map((id) => porId.get(id))
          .filter((c): c is Campanha => Boolean(c))
          .map((c, i) => ({ ...c, sortOrder: i }));
        // As que não vieram na lista (concluídas escondidas, por exemplo) vão
        // para o fim em vez de sumir do cache.
        const resto = atual.campanhas.filter((c) => !ids.includes(c.id));
        return { campanhas: [...reordenadas, ...resto] };
      });
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(CHAVE, ctx.antes);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: CHAVE }),
  });
}
