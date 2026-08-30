/**
 * O controle de levas de atualização do dashboard.
 *
 * Trocar um filtro dispara uma leva de consultas. Duas coisas precisam ser
 * verdade, e nenhuma delas é automática:
 *
 * 1. **Debounce.** Arrastar o seletor de período por cinco presets não pode
 *    disparar cinco levas.
 * 2. **A leva velha não pinta.** Sem isso, a resposta lenta da leva anterior
 *    chega depois da rápida da atual e escreve o número errado por cima — um bug
 *    que só aparece com rede ruim e some quando alguém vai investigar.
 *
 * Fica fora do React porque é uma máquina de estados com temporizador: dentro de
 * um hook, os dois comportamentos só seriam testáveis com DOM montado.
 */

export const ATRASO_DE_FILTRO_MS = 500;

export interface ContextoDaLeva {
  sinal: AbortSignal;
  /** `false` assim que uma leva mais nova começar. Cheque antes de pintar. */
  ehAtual: () => boolean;
}

export interface ControleDeLevas<T> {
  /** Agenda uma leva, reiniciando o debounce. */
  pedir(entrada: T): void;
  /** Dispara agora, sem esperar o debounce (botão "atualizar"). */
  agora(entrada: T): Promise<void>;
  /** Aborta a leva em voo e cancela a agendada. */
  cancelar(): void;
}

export function criarControleDeLevas<T>(
  executar: (entrada: T, ctx: ContextoDaLeva) => Promise<void>,
  atrasoMs = ATRASO_DE_FILTRO_MS,
): ControleDeLevas<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sequencia = 0;
  let emVoo: AbortController | null = null;

  function disparar(entrada: T): Promise<void> {
    // Aborta a anterior ANTES de começar: duas levas em voo é exatamente o
    // estado em que a antiga pode vencer a nova.
    emVoo?.abort();

    const minhaSequencia = ++sequencia;
    const controlador = new AbortController();
    emVoo = controlador;

    return executar(entrada, {
      sinal: controlador.signal,
      ehAtual: () => minhaSequencia === sequencia,
    }).finally(() => {
      if (emVoo === controlador) emVoo = null;
    });
  }

  return {
    pedir(entrada) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void disparar(entrada);
      }, atrasoMs);
    },

    agora(entrada) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      return disparar(entrada);
    },

    cancelar() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // A sequência avança para que a resposta em voo não seja aceita.
      sequencia += 1;
      emVoo?.abort();
      emVoo = null;
    },
  };
}
