/**
 * As tools que o MCP do Inácio deve servir — a lista canônica da `main`.
 *
 * ## Por que esta lista existe
 *
 * Deploy da API e bundle do MCP são coisas diferentes. A rota sobe sozinha no
 * merge; o MCP é um processo stdio que roda num gateway e só muda com
 * `pnpm --filter @loyola-x/mcp build` + restart manual, feito à mão, lá.
 *
 * Nada no pipeline da `main` toca nisso — e o resultado medido foi: cinco tools
 * entregues em JULHO chegaram ao gateway dois meses depois. O Inácio passou
 * esse tempo analisando sem saber que tinha row-level de venda disponível, e
 * ninguém percebeu, porque um bundle velho não dá erro: ele simplesmente serve
 * menos coisa, em silêncio.
 *
 * O `contract.ts` já registrava o buraco, duas vezes: "packages/mcp NÃO tem
 * checagem de contrato". Documentar não bastou. Esta lista é a metade fixa da
 * comparação que faltava — a API publica o que a `main` tem, o MCP compara com
 * o que ele mesmo registrou, e a diferença deixa de depender de alguém lembrar.
 *
 * ## A regra
 *
 * **PR que adiciona ou remove uma tool do MCP mexe nesta lista no mesmo PR.**
 * O build do MCP falha se ela divergir de `tools.ts`, então esquecer não passa
 * do CI — é o guard que substitui a lembrança.
 *
 * Módulo folha, sem imports, pelo mesmo motivo do `contract.ts`: precisa ser
 * legível por API, MCP e web sem arrastar a árvore de tipos junto.
 */
export const TOOLS_DO_MCP = [
  "list_projects",
  "list_funnels",
  "list_stages",
  "list_campaigns",
  "get_creative_performance",
  "get_creative_timeseries",
  "get_daily",
  "get_stage_daily",
  "get_stage_cadeia_cac",
  "get_project_panorama",
  "get_stage_leads_summary",
  "get_stage_survey",
  "get_stage_sales_daily",
  "get_stage_sales",
  "get_funnel_sales",
  "get_stage_sales_rows",
  "get_cross_launch",
  "get_stage_operational_costs",
] as const;

export type ToolDoMcp = (typeof TOOLS_DO_MCP)[number];
