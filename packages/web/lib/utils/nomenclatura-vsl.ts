/**
 * Story 47.9 — o que a tela de Nome VSL decide, na forma pura.
 *
 * A cascata (trocar o expert limpa tudo abaixo; produto, variáveis e oferta
 * são independentes entre si), a prévia — que é `buildVslName` do `shared`,
 * a MESMA função do servidor — e o corpo da API. O `.tsx` só desenha.
 *
 * ⚠️ `.ts` sem JSX de propósito — o runner do web só coleta `lib/utils/**`.
 */

import {
  CAMPO_DA_VSL,
  PREFIXO_DA_VARIAVEL,
  SEPARADOR_DA_VSL,
  TIPOS_DE_VARIAVEL,
  TIPO_DE_CODIGO_DA_VARIAVEL,
  buildVslName,
  pedacosDaVsl,
  type BlocoDaVsl,
  type PedacoDaVsl,
  type TipoDeVariavel,
  type VslFields,
} from "@loyola-x/shared/src/nomenclatura-de-vsl";

export { TIPOS_DE_VARIAVEL, CAMPO_DA_VSL, PREFIXO_DA_VARIAVEL, TIPO_DE_CODIGO_DA_VARIAVEL, type TipoDeVariavel };

/** Rótulos pt-BR das três variáveis (a oferta é o pitch — D19). */
export const ROTULO_DA_VARIAVEL: Record<TipoDeVariavel, string> = {
  lead: "Lead",
  problem: "Mecanismo do problema",
  solution: "Mecanismo da solução",
};

/** Código é sigla + NN (decisão do dono, 2026-09-10); a descrição carrega o significado. */
export const PLACEHOLDER_DA_VARIAVEL: Record<TipoDeVariavel, { code: string; description: string }> = {
  lead: { code: "lead01", description: "Ex.: gancho IA \"ficou de fora\"" },
  problem: { code: "pr01", description: "Ex.: tenta sozinho e trava por não ter um método" },
  solution: { code: "sol01", description: "Ex.: um agente pronto que faz o trabalho pesado" },
};

export interface EstadoDaVsl {
  expertId: string;
  productId: string;
  leadId: string;
  problemId: string;
  solutionId: string;
  offerId: string;
  /** Link da VSL no Drive (pedido do dono). Opcional. */
  url: string;
  notes: string;
}

export const ESTADO_VAZIO_DA_VSL: EstadoDaVsl = { expertId: "", productId: "", leadId: "", problemId: "", solutionId: "", offerId: "", url: "", notes: "" };

/** Trocar o expert limpa TUDO abaixo; os outros campos não limpam nada (são independentes). Trocar pelo mesmo valor não limpa. */
export function aoEscolherNaVsl(estado: EstadoDaVsl, campo: keyof EstadoDaVsl, valor: string): EstadoDaVsl {
  if (estado[campo] === valor) return estado;
  const proximo = { ...estado, [campo]: valor };
  if (campo === "expertId") return { ...proximo, productId: "", leadId: "", problemId: "", solutionId: "", offerId: "" };
  return proximo;
}

export interface TabelasDaVsl {
  experts: { id: string; code: string }[];
  produtos: { id: string; slug: string }[];
  variaveis: { id: string; type: TipoDeVariavel; code: string }[];
  ofertas: { id: string; code: string }[];
}

/** Do estado (ids) para os CÓDIGOS que entram no nome. */
export function camposDaVsl(estado: EstadoDaVsl, t: TabelasDaVsl): Partial<VslFields> {
  const acha = <T extends { id: string }>(xs: T[], id: string) => xs.find((x) => x.id === id);
  const variavel = (tipo: TipoDeVariavel, id: string) => t.variaveis.find((v) => v.id === id && v.type === tipo)?.code;
  return {
    expert: acha(t.experts, estado.expertId)?.code,
    product: acha(t.produtos, estado.productId)?.slug,
    lead: variavel("lead", estado.leadId),
    problem: variavel("problem", estado.problemId),
    solution: variavel("solution", estado.solutionId),
    offer: acha(t.ofertas, estado.offerId)?.code,
  };
}

export interface PreviaDaVsl {
  pedacos: PedacoDaVsl[];
  nome: string | null;
  texto: string;
  tamanho: number;
  completo: boolean;
  erro: string | null;
}

/** A prévia: parcial com `…`, contador, Salvar só quando completo. */
export function previaDaVsl(campos: Partial<VslFields>): PreviaDaVsl {
  const pedacos = pedacosDaVsl(campos);
  const completo = pedacos.every((p) => !p.faltando);
  let nome: string | null = null;
  let erro: string | null = null;
  if (completo) {
    try {
      nome = buildVslName(campos as VslFields);
    } catch (e) {
      erro = (e as Error).message;
    }
  }
  const texto = nome ?? pedacos.map((p) => (p.faltando ? "…" : p.valor)).join(SEPARADOR_DA_VSL);
  return { pedacos, nome, texto, tamanho: nome?.length ?? 0, completo: completo && nome !== null, erro };
}

/** Classes de cor por bloco — só tokens que existem em `globals.css`. Prefixo em cinza, como os `_`. */
export const CLASSE_DO_BLOCO_DA_VSL: Record<BlocoDaVsl, string> = {
  prefixo: "text-muted-foreground",
  identidade: "text-brand",
  angulo: "text-info",
};

export const LEGENDA_DA_VSL: { bloco: BlocoDaVsl; rotulo: string; descricao: string }[] = [
  { bloco: "identidade", rotulo: "Identidade", descricao: "expert, produto e oferta — de onde a VSL vende" },
  { bloco: "angulo", rotulo: "Ângulo", descricao: "lead, mecanismo do problema e mecanismo da solução — o que a VSL testa" },
];

/** O corpo que a API espera, a partir do estado. */
export function corpoDaVsl(estado: EstadoDaVsl) {
  return {
    expertId: estado.expertId,
    productId: estado.productId,
    leadId: estado.leadId,
    problemId: estado.problemId,
    solutionId: estado.solutionId,
    offerId: estado.offerId,
    url: estado.url.trim() || null,
    notes: estado.notes.trim() || null,
  };
}

/** De uma VSL gravada para o estado do gerador (Editar e Duplicar). */
export function estadoDeVsl(v: { expertId: string; productId: string; leadId: string; problemId: string; solutionId: string; offerId: string; url?: string | null; notes: string | null }): EstadoDaVsl {
  return { expertId: v.expertId, productId: v.productId, leadId: v.leadId, problemId: v.problemId, solutionId: v.solutionId, offerId: v.offerId, url: v.url ?? "", notes: v.notes ?? "" };
}

/** URL aceitável para o link da VSL: vazio (opcional) ou http(s) válido. */
export function linkDaVslValido(url: string): boolean {
  const u = url.trim();
  if (!u) return true;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
