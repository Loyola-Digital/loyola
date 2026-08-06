/**
 * Story 29.38 — extrai mensagem útil de um erro do `apiClient`.
 *
 * O `createApiFetcher` já anexa `status`, `code` e `body` ao Error (api-client.ts:38).
 * Toda essa informação era descartada por `} catch {` sem parâmetro, e o usuário
 * recebia "Não foi possível salvar" para causas tão diferentes quanto:
 *
 *   403 — sem permissão
 *   400 — payload inválido (o zod devolve `details` com o campo exato)
 *   500 — coluna inexistente no banco
 *
 * Distinguir importa: o 500 desta aba custou uma investigação no banco de produção
 * para descobrir que faltava rodar migration. O status HTTP dizia isso o tempo
 * todo e ninguém o registrava.
 */

type ApiError = Error & { status?: number; code?: string; body?: unknown };

/** Operação que falhou. Muda só o texto; a classificação por status é a mesma. */
type Operacao = "salvar" | "carregar";

/**
 * Mensagem para o usuário. `fallback` cobre o caso de não haver nada melhor —
 * erro de rede, por exemplo, onde não há resposta para inspecionar.
 *
 * `operacao` existe porque a mesma função serve gravação e leitura (QA-02): sem
 * ela, uma falha ao CARREGAR a config exibia "erro ao salvar", e quem abrisse um
 * chamado descreveria a operação errada.
 */
export function apiErrorMessage(
  err: unknown,
  fallback: string,
  operacao: Operacao = "salvar",
): string {
  const e = err as ApiError;
  const status = typeof e?.status === "number" ? e.status : null;

  // Causas conhecidas ganham texto acionável: dizer "erro 500" a um gestor de
  // tráfego não o ajuda a decidir o que fazer em seguida.
  if (status === 403) return "Sem permissão para acessar esta configuração.";
  if (status === 404) return "Funil não encontrado — recarregue a página.";
  if (status === 500) {
    return (
      `Erro no servidor ao ${operacao}. Se acabou de sair um deploy, a API pode ` +
      "estar com migration pendente — avise o time."
    );
  }

  const msg = typeof e?.message === "string" ? e.message.trim() : "";
  // "API error: 422" é o texto que o fetcher usa quando não achou nada melhor no
  // corpo. Repassá-lo ao usuário seria trocar uma frase vaga por outra.
  const isGeneric = /^API error: \d+$/.test(msg);
  if (msg && !isGeneric) return status ? `${msg} (${status})` : msg;

  return status ? `${fallback} (erro ${status})` : fallback;
}

/**
 * Detalhe técnico para o console. Separado da mensagem do usuário de propósito:
 * o toast precisa caber numa linha, o console precisa bastar para diagnosticar.
 */
export function logApiError(context: string, err: unknown): void {
  const e = err as ApiError;
  console.error(`[${context}]`, {
    status: e?.status,
    code: e?.code,
    message: e?.message,
    body: e?.body,
  });
}
