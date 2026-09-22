/**
 * Story 48.9 — que lançamento serve de BASE para preencher outro.
 *
 * O Painel de Planejamento nasce vazio em todo lançamento, e o time redigita
 * os mesmos parâmetros. A base natural é o lançamento anterior **do mesmo
 * expert e do mesmo tipo** — "pago com pago, gratuito com gratuito, meteórico
 * com meteórico" (pedido do Danilo, 2026-09-22).
 *
 * ## De onde sai cada parte
 *
 *   - **expert**: o PROJETO do funil (a Loyola tem um projeto por expert;
 *     `naming_experts.project_id` confirma o 1:1 quando preenchido). Quem
 *     chama já sabe o projeto — este módulo não adivinha.
 *   - **tipo**: do NOME do funil, contra o dicionário do Epic 47
 *     (`launch_type`): `pg` pago · `l` gratuito · `m` meteórico · `pr`
 *     presencial. Os nomes reais seguem `{expert}-{tipo}{n}[-mes[-ano]]`:
 *     `fz-m3-set-26`, `dg-pg04`, `bbe-pr2-ago-26`.
 *
 * ## O que NÃO é adivinhado
 *
 * Nome que não casa com nenhum tipo do dicionário (existe: `bbe-web-mai-26`)
 * fica com `tipo: null` — e um funil sem tipo não tem base nem serve de base.
 * É o "se não tiver outra, colocar como sem histórico anterior" do pedido,
 * aplicado também a quem não dá para classificar: melhor nenhuma base do que
 * uma base errada.
 *
 * Módulo FOLHA: sem imports.
 */

/** Os quatro tipos de lançamento do dicionário (Epic 47, `naming_dictionary_values.type = 'launch_type'`). */
export const TIPOS_DE_LANCAMENTO = {
  pg: "lançamento pago",
  l: "lançamento gratuito",
  m: "meteórico",
  pr: "evento presencial",
} as const;
export type TipoDeLancamento = keyof typeof TIPOS_DE_LANCAMENTO;

export interface LancamentoIdentificado {
  /** Sigla do expert no nome (`fz`, `dg`, `bbe`) — minúscula. `null` quando o nome não começa com sigla. */
  expert: string | null;
  /** `null` quando o pedaço de tipo não está no dicionário (ex.: `web`). */
  tipo: TipoDeLancamento | null;
  /** O que veio no lugar do tipo, mesmo quando não reconhecido — para a tela poder dizer o porquê. */
  tipoCru: string | null;
  /** Número da edição, quando existe (`m3` → 3; `pg04` → 4). */
  edicao: number | null;
}

const PADRAO = /^([a-z]{2,4})-([a-z]+)(\d*)/i;

function ehTipo(v: string): v is TipoDeLancamento {
  return Object.prototype.hasOwnProperty.call(TIPOS_DE_LANCAMENTO, v);
}

/**
 * Lê `{expert}-{tipo}{n}` do nome do funil. Tolerante ao resto (mês/ano com
 * ou sem hífen, com ou sem ano) porque os nomes reais divergem entre si:
 * `fz-m2-jul26`, `fz-m1-mai26`, `dg-pg04`.
 */
export function identificarLancamento(nome: string): LancamentoIdentificado {
  const m = PADRAO.exec(nome.trim());
  if (!m) return { expert: null, tipo: null, tipoCru: null, edicao: null };
  const cru = m[2].toLowerCase();
  const edicao = m[3] === "" ? null : Number(m[3]);
  return {
    expert: m[1].toLowerCase(),
    tipo: ehTipo(cru) ? cru : null,
    tipoCru: cru,
    edicao: Number.isFinite(edicao as number) ? edicao : null,
  };
}

/** Rótulo do tipo para a tela; `null` quando não identificado. */
export function rotuloDoTipoDeLancamento(tipo: TipoDeLancamento | null): string | null {
  return tipo === null ? null : TIPOS_DE_LANCAMENTO[tipo];
}

export interface FunilCandidato {
  id: string;
  nome: string;
  /** Criação do funil — a ordem "anterior" é por aqui, não pelo número da edição (que falta em alguns nomes). */
  criadoEm: string | Date;
}

export interface LancamentoAnterior extends FunilCandidato {
  tipo: TipoDeLancamento;
  rotuloDoTipo: string;
  edicao: number | null;
}

/**
 * Os lançamentos que podem servir de base para `alvo`, do mais recente para o
 * mais antigo.
 *
 * Regra (decisão do Danilo): **mesmo expert e mesmo tipo**, e **anterior** ao
 * alvo. Expert é o projeto — por isso `candidatos` já vem filtrado por
 * projeto; a sigla do nome não é usada para casar (dois funis do mesmo projeto
 * com siglas diferentes continuam sendo do mesmo expert).
 *
 * Alvo sem tipo identificado devolve lista vazia: "sem histórico anterior".
 */
export function lancamentosAnteriores(alvo: FunilCandidato, candidatos: readonly FunilCandidato[]): LancamentoAnterior[] {
  const id = identificarLancamento(alvo.nome);
  if (id.tipo === null) return [];
  const nascimento = new Date(alvo.criadoEm).getTime();
  return candidatos
    .filter((c) => c.id !== alvo.id)
    .map((c) => ({ c, i: identificarLancamento(c.nome) }))
    .filter(({ c, i }) => i.tipo === id.tipo && new Date(c.criadoEm).getTime() < nascimento)
    .map(({ c, i }) => ({
      ...c,
      tipo: i.tipo as TipoDeLancamento,
      rotuloDoTipo: TIPOS_DE_LANCAMENTO[i.tipo as TipoDeLancamento],
      edicao: i.edicao,
    }))
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
}
