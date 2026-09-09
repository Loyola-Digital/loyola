/**
 * O tipo de "quem executa a query": o `db` do plugin OU a transação aberta a
 * partir dele. Os dois têm a mesma API de consulta; o que muda é o escopo.
 */
import type { Database } from "../../db/client.js";

type FnDeTransacao = Parameters<Database["transaction"]>[0];
export type Transacao = Parameters<FnDeTransacao>[0];
export type Conexao = Database | Transacao;
