/**
 * O que um link público de mapa pode mostrar — e o que não pode.
 *
 * Separado da rota porque é a parte com regra de segurança, e ela precisa de
 * teste que não dependa de banco nem de servidor de pé.
 */

import { randomBytes } from "node:crypto";
import { comAoMenosUmaAba } from "./funnel-map-abas.js";

/**
 * Um token novo: 32 bytes aleatórios em base64url — sempre 43 caracteres.
 *
 * 256 bits não se adivinham, e o token não sai de nada que já circule (como o
 * `id` do mapa). Geração e validação moram juntas para o formato não divergir.
 */
export function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * O pedido PODE ser um token? Filtro barato antes de ir ao banco.
 *
 * A proteção de verdade não é esta: é a busca ser por `share_token`, nunca por
 * `id`. Um valor que passe aqui e não seja token só dá 404. O filtro existe
 * para não gastar consulta com o que não pode ser token — string vazia, o UUID
 * de um mapa, path traversal — e é exato (43) porque o gerado é sempre 43.
 */
export function tokenValido(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export interface MapaDoBanco {
  nome: string | null;
  nomeDaEtapa: string | null;
  tabs: unknown;
  updatedAt: Date | null;
}

/**
 * O payload público.
 *
 * NÃO leva `id`: sem ele a tela não carrega os comentários, que são conversa
 * interna do time. Não leva projeto, funil nem quem editou — nada disso é o
 * desenho que a pessoa decidiu mostrar.
 *
 * A lista de campos é EXPLÍCITA de propósito. Um `{ ...mapa }` aqui passaria a
 * vazar o próximo campo que alguém acrescentar à tabela, sem ninguém notar.
 */
export function payloadPublico(mapa: MapaDoBanco) {
  const abas = Array.isArray(mapa.tabs) ? mapa.tabs : [];
  return {
    // O nome da etapa manda quando existe — é o que o time vê na lista.
    nome: mapa.nomeDaEtapa ?? mapa.nome ?? "Mapa do funil",
    tabs: comAoMenosUmaAba(abas as Parameters<typeof comAoMenosUmaAba>[0]),
    rascunho: abas.length === 0,
    updatedAt: mapa.updatedAt?.toISOString() ?? null,
  };
}
