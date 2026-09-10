/**
 * Story 47.5 — o que a aba Legadas decide sem tocar na API.
 *
 * A sugestão da API vem em CÓDIGOS (`funnel: "a01"`), porque o parser é do
 * `shared` e não conhece ids. O gerador trabalha com ids. Esta função faz a
 * ponte contra as listas que a tela já carregou — e só preenche o que existe
 * nelas, nunca chuta.
 */

import type { SugestaoDeClassificacao } from "@loyola-x/shared/src/nomenclatura-legado";
import { ESTADO_VAZIO, type EstadoDoGerador } from "./nomenclatura-gerador";

export interface TabelasParaPrefill {
  produtos: { id: string; slug: string; expertId: string }[];
  funis: { id: string; code: string; expertId: string }[];
  ofertas: { id: string; code: string; expertId: string }[];
  lps: { id: string; code: string; productId: string; funnelId: string; offerId: string }[];
}

/** Estado inicial do gerador a partir da sugestão + o expert deduzido do projeto. */
export function estadoDaSugestao(sugestao: SugestaoDeClassificacao, expertId: string, t: TabelasParaPrefill): EstadoDoGerador {
  const c = sugestao.campos;
  const produto = c.product ? t.produtos.find((p) => p.expertId === expertId && p.slug === c.product) : undefined;
  const funil = c.funnel ? t.funis.find((f) => f.expertId === expertId && f.code === c.funnel) : undefined;
  const oferta = c.offer === "ofmix" ? "ofmix" : c.offer ? t.ofertas.find((o) => o.expertId === expertId && o.code === c.offer)?.id : undefined;
  const lp =
    c.lp && produto && funil
      ? t.lps.find((l) => l.productId === produto.id && l.funnelId === funil.id && l.code === c.lp && (oferta === undefined || oferta === "ofmix" || l.offerId === oferta))?.id
      : undefined;
  return {
    ...ESTADO_VAZIO,
    expertId,
    productId: produto?.id ?? "",
    funnelId: funil?.id ?? "",
    offerId: oferta ?? "",
    year: c.year ?? "",
    temperature: c.temperature ?? "",
    auction: c.auction ?? "",
    format: c.format ?? "",
    lpId: lp ?? "",
  };
}

const ROTULO: Record<string, string> = { expert: "expert", product: "produto", funnel: "funil", offer: "oferta", year: "ano", temperature: "temp", auction: "leilão", format: "formato", lp: "lp" };

/** Resumo curto para a coluna da tabela: `a01 · hot · cbo · videos` e o que ficou de fora. */
export function resumoDaSugestao(s: SugestaoDeClassificacao): { achou: string; faltou: string } {
  const ordem = ["expert", "product", "funnel", "offer", "year", "temperature", "auction", "format", "lp"] as const;
  const achou = ordem.filter((k) => s.campos[k]).map((k) => s.campos[k] as string).join(" · ");
  const faltou = [...ordem.filter((k) => !s.campos[k]).map((k) => ROTULO[k]), ...s.naoCadastrado.map((n) => `${n} (não cadastrado)`)].join(", ");
  return { achou: achou || "nada reconhecido", faltou };
}

export const ROTULO_DA_FILA: Record<"pendentes" | "ignoradas" | "classificadas" | "todas", string> = {
  pendentes: "Pendentes",
  ignoradas: "Não é perpétuo",
  classificadas: "Classificadas",
  todas: "Todas",
};
