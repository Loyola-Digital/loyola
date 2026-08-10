// ============================================================
// Story 29.46 — o painel e a API estão na mesma versão de contrato?
//
// Função pura, em `lib/utils`, porque é o único diretório que o runner do
// pacote executa (`vitest.config.ts:33`, `environment: "node"`). Dentro do
// componente do banner, esta regra não teria teste — e ela é justamente a
// parte que não pode errar: um falso positivo faz o gestor cobrar um deploy
// desnecessário, um falso negativo devolve o projeto ao estado que custou
// três investigações (ver `API_CONTRACT_VERSION` em `@loyola-x/shared`).
// ============================================================

export type ContractVerdict =
  /** Mesma versão, ou a API não informa — nos dois casos, silêncio. */
  | { kind: "alinhado" }
  /** A API está atrás: recursos novos do painel podem não responder. */
  | { kind: "api-atras"; api: number; web: number }
  /** O painel está atrás: deploy da Vercel pendente. */
  | { kind: "web-atras"; api: number; web: number };

/**
 * @param apiContract  `contract` de `/api/health`. `undefined` numa API anterior
 *                     à própria 29.46 — e é por isso que ausência **não** vira
 *                     alarme: no dia do merge desta story a API ainda não terá o
 *                     campo, e a story dispararia contra si mesma.
 * @param webContract  `API_CONTRACT_VERSION` compilado neste bundle.
 */
export function compareApiContract(
  apiContract: number | null | undefined,
  webContract: number,
): ContractVerdict {
  if (typeof apiContract !== "number" || !Number.isFinite(apiContract)) {
    return { kind: "alinhado" };
  }
  if (apiContract < webContract) return { kind: "api-atras", api: apiContract, web: webContract };
  if (apiContract > webContract) return { kind: "web-atras", api: apiContract, web: webContract };
  return { kind: "alinhado" };
}
