/**
 * Leitura de NDJSON — uma linha JSON por vez, conforme o servidor manda.
 *
 * O dashboard pinta widget a widget em vez de esperar o mais lento. Duas
 * armadilhas moram aqui, e as duas são silenciosas:
 *
 * 1. **Linha partida entre chunks.** O `fetch` entrega bytes, não linhas — o
 *    último pedaço de um chunk quase sempre é meia linha, e fazer `JSON.parse`
 *    nele derruba a leitura no meio.
 * 2. **Linha ilegível.** Um erro de serialização numa linha não pode descartar
 *    as que vieram antes nem as que vêm depois.
 */

export interface LeituraNdjson {
  /** Quantas linhas foram entregues. */
  linhas: number;
  /** Quantas vieram ilegíveis — o dashboard usa para avisar sem esconder. */
  ilegiveis: number;
}

export async function lerNdjson<T>(
  corpo: ReadableStream<Uint8Array> | null,
  aoReceber: (linha: T) => void,
  sinal?: AbortSignal,
): Promise<LeituraNdjson> {
  if (!corpo) return { linhas: 0, ilegiveis: 0 };

  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let resto = "";
  let linhas = 0;
  let ilegiveis = 0;

  try {
    for (;;) {
      if (sinal?.aborted) break;
      const { done, value } = await leitor.read();
      if (done) break;

      resto += decodificador.decode(value, { stream: true });
      const partes = resto.split("\n");
      // A última parte fica guardada: ou é linha incompleta, ou string vazia.
      resto = partes.pop() ?? "";

      for (const parte of partes) {
        const texto = parte.trim();
        if (!texto) continue;
        try {
          aoReceber(JSON.parse(texto) as T);
          linhas += 1;
        } catch {
          ilegiveis += 1;
        }
      }
    }

    // O que sobrou sem `\n` no fim ainda pode ser uma linha inteira.
    const final = resto.trim();
    if (final) {
      try {
        aoReceber(JSON.parse(final) as T);
        linhas += 1;
      } catch {
        ilegiveis += 1;
      }
    }
  } finally {
    // `cancel` e não `releaseLock`: abortar precisa fechar a conexão, senão o
    // servidor segue calculando widgets que ninguém mais vai ver.
    await leitor.cancel().catch(() => {});
  }

  return { linhas, ilegiveis };
}
