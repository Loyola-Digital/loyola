/**
 * O vocabulário da esteira anual, para o `enum` das ferramentas — o modelo
 * escolhe da lista em vez de inventar "Webinar" ou "backend".
 *
 * Cópia de `packages/shared/src/planner-anual.ts`: o MCP não depende do
 * shared em runtime. O guard do build (`scripts/verificar-tools.mjs`) falha se
 * as duas divergirem, então um funil novo na API não fica de fora daqui.
 */
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
