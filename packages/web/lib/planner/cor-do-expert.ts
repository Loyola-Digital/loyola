/**
 * A cor de cada campanha no Planner é a do EXPERT — fixa, não escolhida.
 *
 * Pedido do time (21/09/2026): bater o olho no calendário e saber de quem é
 * cada barra. Cor livre por campanha virava arco-íris — cada importação do
 * Google trazia uma, e duas campanhas do mesmo expert saíam de cores
 * diferentes.
 */

export type Expert = "PP" | "FZ" | "DG" | "BBE" | "LYRIO" | "GERAL";

export const COR_DO_EXPERT: Record<Expert, string> = {
  PP: "#2e9e5b", // verde
  FZ: "#e0529c", // rosa
  DG: "#2f6fdb", // azul
  BBE: "#7a1f2b", // vinho
  LYRIO: "#8a8f98", // cinza
  GERAL: "#e3b505", // amarelo
};

/** Sem acento, emoji nem caixa: "🇺🇸 [FZ] Agenda" e "fzl4" comparam igual. */
function limpar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s[\]-]/gu, "")
    .trim()
    .toUpperCase();
}

/**
 * O começo do nome decide ("PPA2 - ANSIEDADE" → PP, "FZM3 - MFB" → FZ). A
 * ordem importa só entre prefixos que se sobrepõem — não há nenhum hoje.
 * MFB é da FZ e CPDF é do DG (as empresas são "FZ & MFB" e "DG & CPDF").
 */
const PREFIXOS: [RegExp, Expert][] = [
  [/^BBE/, "BBE"],
  [/^PP/, "PP"],
  [/^(FZ|MFB)/, "FZ"],
  [/^(DG|CPDF)/, "DG"],
  [/^(LYRIO|LYRO)/, "LYRIO"],
];

/** A etiqueta da agenda do Google: "🧠 [PP] Agenda Geral" → PP. [LL] é a geral. */
const ETIQUETAS: Record<string, Expert> = { PP: "PP", FZ: "FZ", DG: "DG", BBE: "BBE", LL: "GERAL" };

export function expertDaCampanha(nome: string, rotuloDaAgenda?: string | null): Expert {
  const n = limpar(nome);
  for (const [re, expert] of PREFIXOS) if (re.test(n)) return expert;
  const etiqueta = limpar(rotuloDaAgenda ?? "").match(/\[([A-Z]+)\]/)?.[1];
  return (etiqueta && ETIQUETAS[etiqueta]) || "GERAL";
}

export function corDaCampanha(nome: string, rotuloDaAgenda?: string | null): string {
  return COR_DO_EXPERT[expertDaCampanha(nome, rotuloDaAgenda)];
}
