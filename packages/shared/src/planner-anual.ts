/**
 * O vocabulário da esteira anual do Planner — a lista, num lugar só.
 *
 * Mora no shared porque tem três leitores que precisam concordar: a API
 * (valida o que chega), o MCP (põe as opções no `enum` da ferramenta, para o
 * modelo não inventar valor) e a documentação. Uma cópia por pacote divergiria
 * no primeiro funil novo, e o MCP passaria a oferecer uma opção que a API
 * recusa.
 *
 * Módulo folha, sem imports — pelo mesmo motivo do `contract.ts`.
 */

/** As faixas coloridas da lateral, na ordem da tela. O rótulo muda por empresa. */
export const FAIXAS_DO_ANUAL = ["organico", "trafego", "ascensao"] as const;

export const CATEGORIAS_DO_ANUAL = ["Back-End", "Front-End"] as const;

export const FUNIS_DO_ANUAL = [
  "Lançamento",
  "DR - VSL",
  "Grupo de Conteúdo",
  "Reunião Secreta",
  "Webinar diário",
  "Time comercial",
] as const;
