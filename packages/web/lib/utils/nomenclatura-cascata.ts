/**
 * Story 47.2 — o que a tela do Dicionário decide sem tocar na API, na forma
 * pura: a cascata expert → produto → funil → oferta, a prévia de slug e de
 * normalização, e o texto da confirmação de cascata.
 *
 * Normalização e slug vêm do `shared` (Story 47.1, D11) — a MESMA função que a
 * API usa para decidir. A tela só antecipa o que o servidor vai dizer.
 */

import {
  montarSlugDeLp,
  normalizarCodigo,
  type Normalizacao,
  type TipoDeCodigo,
} from "@loyola-x/shared/src/nomenclatura-codigos";

export type NivelDaCascata = "expertId" | "productId" | "funnelId" | "offerId";
export const NIVEIS: NivelDaCascata[] = ["expertId", "productId", "funnelId", "offerId"];

export type Cascata = Record<NivelDaCascata, string>;
export const CASCATA_VAZIA: Cascata = { expertId: "", productId: "", funnelId: "", offerId: "" };

/**
 * Trocar um nível LIMPA os seguintes (spec § 6, LPs): produto de outro expert
 * não pode ficar selecionado depois que o expert mudou. Trocar pelo mesmo
 * valor não limpa nada.
 */
export function aoTrocarNivel(atual: Cascata, nivel: NivelDaCascata, valor: string): Cascata {
  if (atual[nivel] === valor) return atual;
  const proxima = { ...atual, [nivel]: valor };
  for (const n of NIVEIS.slice(NIVEIS.indexOf(nivel) + 1)) proxima[n] = "";
  return proxima;
}

export function cascataCompleta(c: Cascata): boolean {
  return NIVEIS.every((n) => Boolean(c[n]));
}

/** Prévia ao vivo do que a API vai gravar (ou recusar) — mesma função do servidor. */
export function previaDeNormalizacao(entrada: string, tipo: TipoDeCodigo): Normalizacao | null {
  if (!entrada.trim()) return null;
  return normalizarCodigo(entrada, tipo);
}

/** Slug da LP montado na tela com a mesma regra da API; `null` enquanto faltar parte. */
export function previaDeSlug(partes: {
  expert?: string;
  produto?: string;
  funil?: string;
  oferta?: string;
  codigo?: string;
}): string | null {
  const { expert, produto, funil, oferta, codigo } = partes;
  if (!expert || !produto || !funil || !oferta || !codigo) return null;
  const c = normalizarCodigo(codigo, "lp");
  if (!c.ok) return null;
  return montarSlugDeLp({ expert, produto, funil, oferta, lp: c.valor });
}

export interface ImpactoDaDesativacao {
  produtos: number;
  funis: number;
  ofertas: number;
  lps: number;
  /** Story 47.9 */
  variaveisDeVsl?: number;
}

/**
 * Texto da confirmação de cascata do expert (spec § 5): "Isso desativa 2
 * produtos, 3 funis, 4 ofertas e 5 LPs de bbe. Continuar?" — só o que existe
 * entra na frase; expert sem filhos ativos não fala de cascata.
 */
export function textoDaCascata(code: string, impacto: ImpactoDaDesativacao): string {
  const partes: string[] = [];
  const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
  if (impacto.produtos) partes.push(plural(impacto.produtos, "produto", "produtos"));
  if (impacto.funis) partes.push(plural(impacto.funis, "funil", "funis"));
  if (impacto.ofertas) partes.push(plural(impacto.ofertas, "oferta", "ofertas"));
  if (impacto.lps) partes.push(plural(impacto.lps, "LP", "LPs"));
  if (impacto.variaveisDeVsl) partes.push(plural(impacto.variaveisDeVsl, "variável de VSL", "variáveis de VSL"));
  if (partes.length === 0) return `Desativar ${code}? Ele some dos selects do gerador e pode ser reativado depois.`;
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
  return `Isso desativa ${lista} de ${code}. Continuar?`;
}

/** Texto do campo travado (spec § 5, literal). */
export function textoDeCampoUsado(usadoEm: number): string {
  return `Usado em ${usadoEm} campanha(s). Para mudar o significado, crie um código novo.`;
}

/** Aviso ao editar descrição de funil/oferta usado (spec § 5, literal, não bloqueia). */
export const AVISO_DE_DESCRICAO_USADA =
  "Corrija ou detalhe, mas não mude o significado. Se a oferta mudou, cadastre um código novo.";

/** Busca client-side sobre as colunas visíveis: sem acento, sem caixa. */
export function casaBusca(texto: string, linha: Record<string, unknown>, colunas: string[]): boolean {
  const q = semAcento(texto).toLowerCase().trim();
  if (!q) return true;
  return colunas.some((c) => semAcento(String(linha[c] ?? "")).toLowerCase().includes(q));
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
