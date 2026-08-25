/**
 * O Drizzle (>= 0.44) embrulha os erros do driver num `DrizzleQueryError` cuja
 * mensagem e sempre "Failed query: <sql>" — o erro original do Postgres, com o
 * codigo e o nome da constraint, fica em `cause` (as vezes aninhado).
 *
 * Checar `err.message.includes("uq_...")` nunca casa nessas versoes: o handler
 * de 409 e pulado e a rota devolve 500 com o SQL cru (e os parametros) no corpo.
 */

/** Codigo SQLSTATE de unique_violation. */
const UNIQUE_VIOLATION = "23505";

type ErroDePostgres = {
  code?: unknown;
  constraint?: unknown;
  detail?: unknown;
  message?: unknown;
};

/** Percorre a cadeia de `cause` ate o fim (com guarda contra ciclos). */
function cadeiaDeCausas(err: unknown): ErroDePostgres[] {
  const cadeia: ErroDePostgres[] = [];
  const vistos = new Set<unknown>();
  let atual: unknown = err;

  while (atual && typeof atual === "object" && !vistos.has(atual)) {
    vistos.add(atual);
    cadeia.push(atual as ErroDePostgres);
    atual = (atual as { cause?: unknown }).cause;
  }

  return cadeia;
}

/**
 * Diz se o erro e uma violacao de unicidade — opcionalmente de uma constraint
 * especifica. O nome e procurado no campo `constraint` e tambem no texto, para
 * cobrir drivers que so trazem a mensagem.
 */
export function violaUnicidade(err: unknown, constraint?: string): boolean {
  return cadeiaDeCausas(err).some((elo) => {
    if (elo.code !== UNIQUE_VIOLATION) return false;
    if (!constraint) return true;
    if (elo.constraint === constraint) return true;
    return [elo.message, elo.detail].some(
      (texto) => typeof texto === "string" && texto.includes(constraint),
    );
  });
}
