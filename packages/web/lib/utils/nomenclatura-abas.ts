/**
 * Story 47.2 — a árvore de seções e abas de Configurações → Nomenclatura,
 * como DADO, e a leitura da URL como função pura.
 *
 * Regra 1 do Epic 46: aba ativa é contrato de URL. `?secao=dicionario&aba=lps`
 * abre a aba de LPs para quem receber o link; valor desconhecido cai no
 * default em vez de quebrar a tela.
 *
 * Story 47.7: "Slug de LP" deixou de ser sub-aba de Campanhas e virou seção
 * de primeiro nível (`?secao=slug`), sem sub-abas. O link antigo
 * (`?secao=campanhas&aba=slug`, entregue ao dono na validação visual de
 * 2026-09-09) continua abrindo a mesma tela — contrato de URL não se quebra.
 *
 * ⚠️ `.ts` sem JSX de propósito — o runner do web só coleta
 * `lib/utils/**\/*.test.ts` (ver `menu-de-abas.ts`, Story 46.1).
 */

export type Secao = "dicionario" | "campanhas" | "slug" | "vsl" | "ads";
export type AbaDoDicionario = "experts" | "produtos" | "funis" | "ofertas" | "lps" | "valores";
export type AbaDeCampanhas = "nova" | "lista" | "validar" | "legadas";
/** Story 47.9: seção Nome VSL. */
export type AbaDeVsl = "nova" | "lista" | "variaveis";
/** Story 47.10: seção Nome Ads. */
export type AbaDeAds = "novo" | "lista" | "valores";

export const ABAS_DO_DICIONARIO: { value: AbaDoDicionario; label: string }[] = [
  { value: "experts", label: "Experts" },
  { value: "produtos", label: "Produtos" },
  { value: "funis", label: "Funis" },
  { value: "ofertas", label: "Ofertas" },
  { value: "lps", label: "LPs" },
  { value: "valores", label: "Valores fixos" },
];

/** Seção Campanhas (Story 47.3): gerador, listagem e validador. */
export const ABAS_DE_CAMPANHAS: { value: AbaDeCampanhas; label: string }[] = [
  { value: "nova", label: "Nova campanha" },
  { value: "lista", label: "Campanhas" },
  { value: "validar", label: "Validar um nome" },
  /** Story 47.5: campanhas antigas do Meta classificadas nos nove campos. */
  { value: "legadas", label: "Legadas" },
];

/**
 * A ordem aqui é a ordem na tela. As seções da Fase 2 do Epic 47 (Nome VSL,
 * Nome Ads) entram depois de `slug`, nesta lista — o pedido do dono fixa
 * "à direita de".
 */
/** Seção Nome VSL (Story 47.9): gerador, listagem e as três variáveis por expert. */
export const ABAS_DE_VSL: { value: AbaDeVsl; label: string }[] = [
  { value: "nova", label: "Nova VSL" },
  { value: "lista", label: "VSLs" },
  { value: "variaveis", label: "Variáveis" },
];

/** Seção Nome Ads (Story 47.10): gerador, listagem e os dois valores fixos do anúncio. */
export const ABAS_DE_ADS: { value: AbaDeAds; label: string }[] = [
  { value: "novo", label: "Novo anúncio" },
  { value: "lista", label: "Anúncios" },
  { value: "valores", label: "Valores fixos" },
];

export const SECOES: { value: Secao; label: string; disponivel: boolean }[] = [
  { value: "dicionario", label: "Dicionário", disponivel: true },
  { value: "campanhas", label: "Campanhas", disponivel: true },
  /** Story 47.7 — pedido do dono na validação visual (2026-09-09): montar o slug de LP sem passar pelo cadastro. */
  { value: "slug", label: "Slug de LP", disponivel: true },
  /** Story 47.9 — à direita de Slug de LP, como o pedido do dono fixa. */
  { value: "vsl", label: "Nome VSL", disponivel: true },
  /** Story 47.10 — à direita de Nome VSL. */
  { value: "ads", label: "Nome Ads", disponivel: true },
];

/** Seção sem sub-abas não tem `aba` — a barra de abas não é desenhada para ela. */
export type AbaAtiva =
  | { secao: "dicionario"; aba: AbaDoDicionario }
  | { secao: "campanhas"; aba: AbaDeCampanhas }
  | { secao: "slug" }
  | { secao: "vsl"; aba: AbaDeVsl }
  | { secao: "ads"; aba: AbaDeAds };

const DEFAULT: AbaAtiva = { secao: "dicionario", aba: "experts" };

/**
 * Lê `secao` e `aba` da URL. Desconhecido → default do nível. Uma aba que não
 * pertence à seção pedida também cai no default da seção — `?secao=campanhas
 * &aba=lps` não existe.
 *
 * Compatibilidade (47.7): `?secao=campanhas&aba=slug` era a URL da tela de
 * slug até 2026-09-10 e abre a seção `slug`, não "Nova campanha".
 */
export function abaAtiva(params: { get(k: string): string | null }): AbaAtiva {
  const secao = SECOES.find((s) => s.value === params.get("secao"))?.value ?? DEFAULT.secao;
  const pedida = params.get("aba");
  if (secao === "slug") return { secao };
  if (secao === "vsl") return { secao, aba: ABAS_DE_VSL.find((a) => a.value === pedida)?.value ?? "nova" };
  if (secao === "ads") return { secao, aba: ABAS_DE_ADS.find((a) => a.value === pedida)?.value ?? "novo" };
  if (secao === "dicionario") {
    return { secao, aba: ABAS_DO_DICIONARIO.find((a) => a.value === pedida)?.value ?? "experts" };
  }
  if (pedida === "slug") return { secao: "slug" };
  return { secao, aba: ABAS_DE_CAMPANHAS.find((a) => a.value === pedida)?.value ?? "nova" };
}

/** Aba inicial de cada seção — o que o clique na seção abre. */
export function hrefDaSecao(secao: Secao): string {
  if (secao === "dicionario") return hrefDe("dicionario", "experts");
  if (secao === "campanhas") return hrefDe("campanhas", "nova");
  if (secao === "vsl") return hrefDe("vsl", "nova");
  if (secao === "ads") return hrefDe("ads", "novo");
  return hrefDe("slug");
}

export function hrefDe(secao: Secao, aba?: AbaDoDicionario | AbaDeCampanhas | AbaDeVsl | AbaDeAds): string {
  const base = `/settings/nomenclatura?secao=${secao}`;
  return aba ? `${base}&aba=${aba}` : base;
}
