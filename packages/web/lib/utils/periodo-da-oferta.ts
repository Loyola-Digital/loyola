/**
 * O período em que uma oferta vendeu, curto o bastante para caber na linha.
 *
 * ## Por que mostrar período na lista de ofertas
 *
 * O mesmo produto pode vender por uma oferta num funil e por outra em outro —
 * "Super Funcionário com Claude 2 Ed." tem Lote Promocional (191 vendas),
 * Lote 1 (95) e Lote 2 (42). O nome sozinho não diz qual é a desta etapa, e um
 * relançamento repete os mesmos nomes um ano depois. A data em que cada oferta
 * vendeu é o que permite reconhecê-la.
 */

/** `aaaa-mm-dd` → `dd/mm`. Sem `Date`: a string já está no fuso que importa, e
 *  `new Date("2026-10-07")` volta um dia em fuso negativo. */
function diaEMes(ymd: string): string {
  const [, mes, dia] = ymd.split("-");
  return mes && dia ? `${dia}/${mes}` : ymd;
}

/**
 * `de` e `ate` como um rótulo só.
 *
 * Mesmo dia aparece uma vez — "06/10 → 06/10" ocupa o dobro para dizer o
 * mesmo. O ano entra só quando os dois lados são de anos diferentes, que é o
 * caso que de fato precisa dele (perpétuo atravessando o ano).
 */
export function periodoCurto(de: string | null, ate: string | null): string {
  if (!de) return "";
  if (!ate || ate === de) return diaEMes(de);
  const anoDe = de.slice(0, 4);
  const anoAte = ate.slice(0, 4);
  if (anoDe !== anoAte) return `${diaEMes(de)}/${anoDe.slice(2)} → ${diaEMes(ate)}/${anoAte.slice(2)}`;
  return `${diaEMes(de)} → ${diaEMes(ate)}`;
}
