/**
 * Story 47.2 — a árvore de seções e abas de Configurações → Nomenclatura,
 * como DADO, e a leitura da URL como função pura.
 *
 * Regra 1 do Epic 46: aba ativa é contrato de URL. `?secao=dicionario&aba=lps`
 * abre a aba de LPs para quem receber o link; valor desconhecido cai no
 * default em vez de quebrar a tela.
 *
 * ⚠️ `.ts` sem JSX de propósito — o runner do web só coleta
 * `lib/utils/**\/*.test.ts` (ver `menu-de-abas.ts`, Story 46.1).
 */

export type Secao = "dicionario" | "campanhas";
export type AbaDoDicionario = "experts" | "produtos" | "funis" | "ofertas" | "lps" | "valores";
export type AbaDeCampanhas = "nova" | "lista" | "validar";

export const ABAS_DO_DICIONARIO: { value: AbaDoDicionario; label: string }[] = [
  { value: "experts", label: "Experts" },
  { value: "produtos", label: "Produtos" },
  { value: "funis", label: "Funis" },
  { value: "ofertas", label: "Ofertas" },
  { value: "lps", label: "LPs" },
  { value: "valores", label: "Valores fixos" },
];

/** A seção Campanhas chega na 47.3; até lá aparece desabilitada ("Em breve"). */
export const ABAS_DE_CAMPANHAS: { value: AbaDeCampanhas; label: string }[] = [
  { value: "nova", label: "Nova campanha" },
  { value: "lista", label: "Campanhas" },
  { value: "validar", label: "Validar um nome" },
];

export const SECOES: { value: Secao; label: string; disponivel: boolean }[] = [
  { value: "dicionario", label: "Dicionário", disponivel: true },
  { value: "campanhas", label: "Campanhas", disponivel: false },
];

export interface AbaAtiva {
  secao: Secao;
  aba: AbaDoDicionario | AbaDeCampanhas;
}

const DEFAULT: AbaAtiva = { secao: "dicionario", aba: "experts" };

/**
 * Lê `secao` e `aba` da URL. Desconhecido → default do nível. Uma aba que não
 * pertence à seção pedida também cai no default da seção — `?secao=campanhas
 * &aba=lps` não existe.
 */
export function abaAtiva(params: { get(k: string): string | null }): AbaAtiva {
  const secao = SECOES.find((s) => s.value === params.get("secao"))?.value ?? DEFAULT.secao;
  const pedida = params.get("aba");
  if (secao === "dicionario") {
    return { secao, aba: ABAS_DO_DICIONARIO.find((a) => a.value === pedida)?.value ?? "experts" };
  }
  return { secao, aba: ABAS_DE_CAMPANHAS.find((a) => a.value === pedida)?.value ?? "nova" };
}

export function hrefDe(secao: Secao, aba: AbaDoDicionario | AbaDeCampanhas): string {
  return `/settings/nomenclatura?secao=${secao}&aba=${aba}`;
}
