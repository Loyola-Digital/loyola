/**
 * Single-flight (coalescing de requisições in-flight).
 *
 * PROBLEMA QUE RESOLVE: quando N pessoas abrem o mesmo dashboard ao mesmo tempo
 * e o dado precisa ser buscado (cache frio/stale), cada request dispara a MESMA
 * busca à Meta — "consulta em dobro" + rate limit. Single-flight faz com que N
 * chamadas concorrentes com a MESMA chave compartilhem UMA execução: a primeira
 * roda, as demais aguardam o resultado dela.
 *
 * NÃO é cache: a promise é removida do mapa assim que resolve/rejeita, então a
 * próxima chamada re-executa. É puramente deduplicação do que está EM VOO agora.
 *
 * Escopo: in-process. Hoje a API roda 1 instância (numReplicas=1), então isso
 * cobre o caso relatado (várias pessoas batendo na mesma instância). Se um dia
 * escalar pra N réplicas, trocar/empilhar com um lock distribuído (ex.:
 * pg_advisory_lock) usando a mesma `key` — a assinatura aqui não muda.
 */

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Coalesce execuções concorrentes de `fn` pela `key`.
 *
 * @param key  identidade lógica da operação (ex.: `campaign-daily:<projectId>:<ids>:<since>:<until>`).
 * @param fn   função que efetivamente faz o trabalho caro (ex.: fetch à Meta).
 * @returns    o resultado de `fn` — compartilhado por todos os callers concorrentes.
 */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  // `Promise.resolve().then(fn)` adia `fn` pro próximo microtask, garantindo que
  // `inFlight.set` abaixo já rodou antes de qualquer `.finally` (evita corrida de
  // ordering em que um throw síncrono de `fn` limparia o mapa antes do set,
  // deixando a promise rejeitada presa para sempre).
  const promise = Promise.resolve()
    .then(fn)
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/** Nº de operações em voo agora (observabilidade/testes). */
export function inFlightCount(): number {
  return inFlight.size;
}
