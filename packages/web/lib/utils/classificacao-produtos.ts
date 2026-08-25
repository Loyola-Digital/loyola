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

/**
 * O tipo que o BACKEND assume para produto sem entrada no mapa.
 *
 * Não é "o default da tela" — é o que `tipoDoProdutoNaVenda()` devolve quando
 * não acha a chave (`stage-sales-data.ts:446`). Tudo que difere disto precisa
 * ser gravado, ou o mapa e o cálculo discordam em silêncio.
 */
export const TIPO_PADRAO_CAPTACAO = "ingresso";

/**
 * Story 18.70 — o papel que a planilha cumpre na etapa.
 *
 * `captacao`: a planilha do que a captação vende (subtype `capture`).
 * `venda`: a planilha do produto vendido (`main_product`, `tmb`).
 *
 * O vocabulário muda entre as duas. "Ingresso" não existe numa etapa de venda,
 * e oferecê-lo lá convida à classificação errada.
 */
export type ContextoDaPlanilha = "captacao" | "venda";

/** Deriva o contexto do subtype da planilha. */
export function contextoDoSubtype(subtype: string): ContextoDaPlanilha {
  return subtype === "capture" ? "captacao" : "venda";
}

/** Os cinco papéis da 18.69, com rótulo. */
const TODOS_OS_TIPOS = [
  { valor: "ingresso", rotulo: "Ingresso" },
  { valor: "order_bump", rotulo: "Order bump" },
  { valor: "combo", rotulo: "Combo" },
  { valor: "upsell", rotulo: "Upsell" },
  { valor: "principal", rotulo: "Principal (outra etapa)" },
] as const;

/**
 * Os tipos oferecidos ao gestor, por contexto (AC3).
 *
 * Na venda, `ingresso` sai da lista e `principal` deixa de dizer "outra etapa"
 * — ali ele É o produto da etapa.
 */
export function tiposDisponiveis(
  contexto: ContextoDaPlanilha,
): ReadonlyArray<{ valor: string; rotulo: string }> {
  if (contexto === "captacao") return TODOS_OS_TIPOS;
  return TODOS_OS_TIPOS.filter((t) => t.valor !== "ingresso").map((t) =>
    t.valor === "principal" ? { valor: "principal", rotulo: "Produto principal" } : { ...t },
  );
}

/**
 * O tipo pré-selecionado na tela para produto ainda não classificado.
 *
 * ## Por que na venda ele difere do padrão do backend
 *
 * O backend assume `ingresso` para o que não está no mapa. Numa etapa de venda
 * isso é errado — a Mentoria ClaudeLab passaria a ancorar checkouts de
 * captação. Então a tela pré-seleciona `principal`, que por DIFERIR de
 * `TIPO_PADRAO_CAPTACAO` é gravado explicitamente ao salvar, e o backend passa
 * a ler o papel certo em vez de cair no default.
 */
export function tipoPadraoDe(contexto: ContextoDaPlanilha): string {
  return contexto === "captacao" ? TIPO_PADRAO_CAPTACAO : "principal";
}

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
