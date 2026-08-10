// ============================================================
// Story 29.45 — qual estado a seção de gráficos por dimensão deve mostrar.
//
// Vive aqui, e não dentro do componente, pelo mesmo motivo que
// `classifyLpCoverage` saiu do JSX na 29.43 (gate QA-13): embutida na
// renderização, a regra é inalcançável por teste. O runner do `packages/web`
// cobre apenas `lib/utils` e roda em `environment: "node"`, sem jsdom — um
// teste de componente aqui seria o 11º `.test.tsx` órfão do pacote.
//
// O defeito que este módulo fecha: `EntityDimensionCharts` fazia
// `if (series.plotted.length === 0) return null`, e com isso três situações
// diferentes produziam a MESMA tela — nenhuma.
//
//   404 na API  → o recurso não existe nesta versão   → avisar o time
//   500 / rede  → falhou agora                        → tentar de novo
//   200 vazio   → o período não tem dado              → trocar o filtro
//
// As três pedem ações opostas. Em 2026-08-10 o gestor recebeu a terceira
// (nada na tela) quando a resposta certa era a primeira, e o relato chegou
// como "os gráficos não apareceram" — sem nada para investigar.
// ============================================================

/** O que a seção mostra. Um `kind` por renderização possível — sem `null`. */
export type EntityChartsState =
  /** Requisição em voo. Precede todo o resto (ver `classifyEntityChartsState`). */
  | { kind: "loading" }
  /** 404: a API em uso não conhece o endpoint. Repetir não muda nada. */
  | { kind: "erro-versao" }
  /** Qualquer outra falha. `status` é `null` quando o erro não veio do `api-client`. */
  | { kind: "erro"; status: number | null }
  /** A API respondeu, e não há série para o período/filtro. */
  | { kind: "vazio" }
  /** Há o que plotar. */
  | { kind: "ok" };

export interface EntityChartsStateInput {
  loading: boolean;
  isError: boolean;
  /** `error.status` do `api-client` (`api-client.ts:43`). Ausente = erro de outra origem. */
  status: number | null | undefined;
  plottedCount: number;
}

/**
 * Decide o estado da seção.
 *
 * A ORDEM dos ramos é parte do contrato, não detalhe de implementação:
 *
 * 1. `loading` vence tudo. Sem isso, um refetch com erro anterior ainda em
 *    memória pisca o bloco vermelho no meio de um carregamento normal — o
 *    risco que a story listava e que o caso 1 do AC5 agora prende em teste.
 * 2. Erro vence vazio. Uma requisição que falhou não produz "sem dados no
 *    período": ninguém sabe o que o período tem.
 * 3. Só então `plottedCount` decide entre vazio e ok.
 *
 * `status` desconhecido NUNCA vira `erro-versao`. Afirmar "esta versão da API
 * não tem o recurso" com base num erro que não trouxe status seria inventar o
 * diagnóstico — e mandaria o gestor cobrar um deploy que talvez não resolva.
 */
export function classifyEntityChartsState({
  loading,
  isError,
  status,
  plottedCount,
}: EntityChartsStateInput): EntityChartsState {
  if (loading) return { kind: "loading" };
  if (isError) {
    if (status === 404) return { kind: "erro-versao" };
    return { kind: "erro", status: status ?? null };
  }
  if (plottedCount === 0) return { kind: "vazio" };
  return { kind: "ok" };
}

/**
 * Extrai o status HTTP de um erro do React Query.
 *
 * O `api-client` anexa `status` ao `Error` que lança (`api-client.ts:43`), mas
 * o tipo que chega ao componente é `unknown` — e um erro de rede, lançado pelo
 * `fetch` antes de haver resposta, não tem status nenhum.
 */
export function httpStatusOf(error: unknown): number | null {
  if (error && typeof error === "object" && "status" in error) {
    const s = (error as { status?: unknown }).status;
    if (typeof s === "number") return s;
  }
  return null;
}
