// ============================================================
// Story 18.69 — o que persistir quando o gestor salva a classificação.
//
// ## O defeito que isto impede
//
// A primeira versão do diálogo gravava tipo explícito para TODOS os produtos
// da planilha, derivando `ingresso` para o que não estivesse marcado. Abrir o
// diálogo de uma etapa não classificada e salvar — sem mudar nada — gravaria
// `ingresso` na Mentoria ClaudeLab (R$ 4.500) e nas Automações (R$ 5.000).
//
// Consequência: esses produtos passariam a ANCORAR checkouts de captação e o
// denominador dobraria — R$ 447.523 em vez de R$ 216.997 no dg-pg02. E, pior
// que o defeito original, ficaria PERSISTIDO: quem investigasse depois veria
// uma classificação explícita, não um default.
//
// A regra: só se grava o que difere do default. Um mapa enxuto diz "o gestor
// declarou isto"; um mapa completo de defaults diz a mesma coisa sobre
// suposições que ninguém fez.
//
// Em `lib/utils` porque é o único diretório que o runner do pacote executa.
// ============================================================

/** O tipo de quem não foi classificado, na Captação Paga. */
export const TIPO_PADRAO_CAPTACAO = "ingresso";

/**
 * Monta o mapa a persistir.
 *
 * @param produtos  todos os produtos encontrados na planilha
 * @param escolhas  o que está na tela agora (do mapa salvo ou escolhido agora)
 */
export function mapaParaPersistir(
  produtos: Array<{ name: string }>,
  escolhas: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of produtos) {
    const k = p.name.trim().toLowerCase();
    if (!k) continue;
    const tipo = escolhas[k];
    // Sem escolha, ou escolha igual ao default: não grava. O backend cai no
    // default sozinho, e o mapa não afirma o que ninguém declarou.
    if (!tipo || tipo === TIPO_PADRAO_CAPTACAO) continue;
    out[k] = tipo;
  }
  return out;
}
