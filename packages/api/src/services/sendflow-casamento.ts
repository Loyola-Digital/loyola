/**
 * Qual campanha do SendFlow é a deste funil.
 *
 * ## O problema que isto resolve
 *
 * O funil se chama `fz-m3-set-26`; no SendFlow o grupo é `FZM3`. Quem digitou
 * cada um foi uma pessoa diferente, e nenhuma das duas está errada.
 *
 * O casamento antigo comparava texto cru: o token do funil (`fz-m3`) contra o
 * nome da campanha em minúsculas (`fzm3`). `"fzm3".includes("fz-m3")` é falso,
 * e o resultado era "nenhuma campanha encontrada" — sem dizer que a causa era
 * um hífen.
 *
 * Normalizar os dois lados resolve para todo mundo, não só para este funil. É a
 * mesma decisão que o planner já tomou com `chaveDoNome`, e por isso usa a
 * mesma função: uma segunda normalização começaria a divergir da primeira.
 *
 * ## Exato antes de parcial
 *
 * Duas passadas, e a ordem importa. `fzm3` está contido em `fzm30`, então uma
 * busca por conteúdo sozinha pode entregar a campanha do funil vizinho. Se
 * existir uma campanha cuja chave é IGUAL ao alvo, é ela — sem discussão.
 */

import { chaveDoNome } from "../utils/chave-de-nome.js";

/**
 * O pedaço do nome do funil que identifica a campanha.
 *
 * `fz-m3-set-26` → `fz-m3`: os dois primeiros segmentos são o produto e a
 * edição; o resto é mês e ano, que a campanha do SendFlow costuma não repetir.
 */
export function tokenDoFunil(nome: string): string {
  const segs = nome.trim().split("-").filter(Boolean);
  return segs.length >= 2 ? `${segs[0]}-${segs[1]}` : nome.trim();
}

/**
 * O que se procura no SendFlow — já normalizado.
 *
 * O `matchCode` do funil MANDA quando existe: é o override para quando o nome
 * no SendFlow não tem relação nenhuma com o nome do funil, e nenhuma
 * normalização salvaria.
 */
export function alvoDoFunil(
  funnelName: string,
  matchCode: string | null,
): string {
  return chaveDoNome(matchCode?.trim() || tokenDoFunil(funnelName));
}

export interface CampanhaCasavel {
  name?: string | null;
}

/** A campanha que casa, ou `null`. */
export function casarCampanha<T extends CampanhaCasavel>(
  campanhas: T[],
  funnelName: string,
  matchCode: string | null,
): T | null {
  const alvo = alvoDoFunil(funnelName, matchCode);
  if (!alvo) return null;

  const chave = (c: T) => chaveDoNome(c.name ?? "");
  // Exato primeiro: `fzm3` está contido em `fzm30`, e sem esta passada a busca
  // por conteúdo poderia entregar a campanha do funil vizinho.
  return (
    campanhas.find((c) => chave(c) === alvo) ??
    campanhas.find((c) => chave(c).includes(alvo)) ??
    null
  );
}
