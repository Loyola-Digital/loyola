/**
 * A fila que salva o layout do canvas.
 *
 * Três comportamentos, e cada um existe por causa de uma falha concreta:
 *
 * | Comportamento | Sem ele |
 * |---|---|
 * | debounce de 600 ms | um `PUT` por pixel arrastado |
 * | um `PUT` por vez | a resposta lenta sobrescreve a rápida |
 * | descarga ao sair | fechar a página perde o último arrasto |
 *
 * Fica fora do React de propósito: é uma máquina de estados com temporizador, e
 * dentro de um hook ela só seria testável com DOM montado.
 */

export const ATRASO_PADRAO_MS = 600;

export interface FilaDeSalvamento<T> {
  /** Registra um valor novo e reinicia a contagem do debounce. */
  agendar(valor: T): void;
  /** Salva o pendente agora, e resolve quando não houver mais nada em voo. */
  descarregar(): Promise<void>;
  /** Cancela o temporizador. Não cancela o que já está em voo. */
  parar(): void;
  /** Há algo em voo ou esperando o temporizador? */
  ocupada(): boolean;
}

export function criarFilaDeSalvamento<T>(
  salvar: (valor: T) => Promise<unknown>,
  opcoes: {
    atrasoMs?: number;
    /** Chamado quando o estado muda, para a tela mostrar "salvando…". */
    aoMudarEstado?: (salvando: boolean) => void;
    aoFalhar?: (erro: unknown) => void;
  } = {},
): FilaDeSalvamento<T> {
  const atraso = opcoes.atrasoMs ?? ATRASO_PADRAO_MS;

  let pendente: { valor: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let emVoo: Promise<void> | null = null;

  function avisar() {
    opcoes.aoMudarEstado?.(Boolean(emVoo) || Boolean(pendente));
  }

  function disparar(): Promise<void> {
    // Já tem um em voo: não dispara. Quem estiver voando olha o pendente ao
    // terminar — é isto que garante que dois `PUT` nunca se cruzem.
    if (emVoo || !pendente) return emVoo ?? Promise.resolve();

    const { valor } = pendente;
    pendente = null;
    avisar();

    emVoo = salvar(valor)
      .catch((erro) => {
        opcoes.aoFalhar?.(erro);
      })
      .then(() => {
        emVoo = null;
        // Chegou coisa nova enquanto este salvava: sai agora, sem esperar o
        // debounce de novo — senão o último arrasto ficaria 600 ms parado.
        if (pendente) return disparar();
        avisar();
        return undefined;
      });

    return emVoo;
  }

  return {
    agendar(valor) {
      pendente = { valor };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void disparar();
      }, atraso);
      avisar();
    },

    async descarregar() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await disparar();
      // O `disparar` reentrante já cobre o que chegou no meio, mas se algo
      // entrou entre o `await` e aqui, esta segunda passada o pega.
      if (pendente) await disparar();
    },

    parar() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },

    ocupada() {
      return Boolean(emVoo) || Boolean(pendente) || Boolean(timer);
    },
  };
}
