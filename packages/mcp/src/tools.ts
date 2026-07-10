import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LoyolaClient, ApiError } from "./client.js";

/**
 * Registra as tools MCP que embrulham a API pública Loyola X (Story 36.3).
 * Cada tool mapeia 1:1 num endpoint `/api/public/*`. A descrição ensina a IA
 * QUANDO usar cada uma; o fluxo natural é list_projects → list_funnels/list_campaigns
 * → get_creative_performance → get_creative_timeseries.
 */

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const message =
    err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Erro: ${message}` }], isError: true };
}

async function run(fn: () => Promise<unknown>) {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(err);
  }
}

const fromField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .describe("Data inicial ISO (YYYY-MM-DD). Default: 30 dias atrás.");
const toField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .describe("Data final ISO (YYYY-MM-DD). Default: hoje.");

export function registerTools(server: McpServer, client: LoyolaClient): void {
  // ---- Discovery ----
  server.registerTool(
    "list_projects",
    {
      title: "Listar projetos",
      description:
        "Lista os projetos (clientes) disponíveis no Loyola X. COMECE AQUI para descobrir o projectId antes de consultar funis ou métricas Meta.",
      inputSchema: {},
    },
    async () => run(() => client.get("/api/public/v1/projects"))
  );

  server.registerTool(
    "list_funnels",
    {
      title: "Listar funis de um projeto",
      description:
        "Lista os funis (lançamentos e perpétuos) de um projeto, com contagem de campanhas Meta/Google. Use o projectId obtido em list_projects.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
      },
    },
    async ({ projectId }) =>
      run(() => client.get(`/api/public/v1/projects/${encodeURIComponent(projectId)}/funnels`))
  );

  server.registerTool(
    "list_stages",
    {
      title: "Listar etapas de um funil",
      description:
        "Lista as etapas de um funil (stageType: paid/free/sales/cpl) com metas de leads e datas. Use o funnelId obtido em list_funnels.",
      inputSchema: {
        funnelId: z.string().uuid().describe("ID do funil (de list_funnels)."),
      },
    },
    async ({ funnelId }) =>
      run(() => client.get(`/api/public/v1/funnels/${encodeURIComponent(funnelId)}/stages`))
  );

  // ---- Meta Ads ----
  server.registerTool(
    "list_campaigns",
    {
      title: "Performance das campanhas Meta Ads",
      description:
        "Métricas agregadas das campanhas Meta Ads de um projeto: spend (já com imposto), impressions, clicks, ctr, cpc, cpm, leads, cpl, purchases, revenue, roas e contagem de criativos ativos. `partial:true` indica dias sem dado no cache.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
        from: fromField,
        to: toField,
      },
    },
    async ({ projectId, from, to }) =>
      run(() =>
        client.get(`/api/public/meta/v1/projects/${encodeURIComponent(projectId)}/campaigns`, {
          from,
          to,
        })
      )
  );

  server.registerTool(
    "get_creative_performance",
    {
      title: "Performance por criativo (anúncio)",
      description:
        "Performance por criativo Meta (anúncio) de um projeto: metadata (thumbnail/title/body/cta), métricas de vídeo e KPIs (spend/ctr/cpc/cpm/leads/cpl/cpa/roas). Use orderBy para rankear (ex.: 'ctr', 'cpa', 'roas', 'spend', 'leads'). Filtre por campaignId se quiser uma campanha só.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
        campaignId: z.string().optional().describe("Filtra por uma campanha (campaignId de list_campaigns)."),
        orderBy: z
          .enum(["spend", "ctr", "cpc", "cpm", "cpl", "cpa", "roas", "leads", "impressions", "clicks"])
          .optional()
          .describe("Métrica de ordenação (desc). Default: spend."),
        limit: z.coerce.number().int().min(1).max(200).optional().describe("Máx. de criativos. Default: 50."),
        from: fromField,
        to: toField,
      },
    },
    async ({ projectId, campaignId, orderBy, limit, from, to }) =>
      run(() =>
        client.get(`/api/public/meta/v1/projects/${encodeURIComponent(projectId)}/creatives`, {
          campaignId,
          orderBy,
          limit,
          from,
          to,
        })
      )
  );

  server.registerTool(
    "get_creative_timeseries",
    {
      title: "Série temporal de um criativo",
      description:
        "Série diária das métricas de um criativo específico (spend/impressions/clicks/leads/ctr/...). Útil para ver tendência/decaimento ao longo do tempo. Use o adId obtido em get_creative_performance.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
        adId: z.string().describe("ID do anúncio/criativo (adId de get_creative_performance)."),
        from: fromField,
        to: toField,
      },
    },
    async ({ projectId, adId, from, to }) =>
      run(() =>
        client.get(
          `/api/public/meta/v1/projects/${encodeURIComponent(projectId)}/creatives/${encodeURIComponent(adId)}/timeseries`,
          { from, to }
        )
      )
  );

  // ---- Dados Diários (Meta) ----
  server.registerTool(
    "get_daily",
    {
      title: "Dados Diários (Meta) do projeto",
      description:
        "Série diária agregada do projeto INTEIRO (metade Meta de 'Dados Diários'): spend, impressions, clicks, ctr, cpc, cpm, leads, cpl, landingPageViews, connectRate, etc. por dia. Combine por `date` com get_stage_sales_daily para o 'Dados Diários' completo e o ROAS REAL.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
        from: fromField,
        to: toField,
      },
    },
    async ({ projectId, from, to }) =>
      run(() =>
        client.get(`/api/public/meta/v1/projects/${encodeURIComponent(projectId)}/daily`, {
          from,
          to,
        })
      )
  );

  // ---- Dados Diários (Meta) POR ETAPA — mídia isolada, sem contaminação ----
  server.registerTool(
    "get_stage_daily",
    {
      title: "Dados Diários (Meta) da ETAPA",
      description:
        "Série diária Meta agregada SÓ das campanhas vinculadas à etapa (sem contaminação de outros funis/evergreen — auditoria Tier 1.2). Mesmas métricas do get_daily (spend com imposto, impressions, clicks, ctr, cpl, connectRate...). PREFIRA este ao get_daily quando analisar um lançamento/etapa específica. `campaignIds` no retorno mostra o que entrou no balde; etapa sem campanha vinculada retorna days:[].",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
        stageId: z.string().describe("ID da etapa (de list_stages)."),
        from: fromField,
        to: toField,
      },
    },
    async ({ projectId, stageId, from, to }) =>
      run(() =>
        client.get(
          `/api/public/meta/v1/projects/${encodeURIComponent(projectId)}/stages/${encodeURIComponent(stageId)}/daily`,
          { from, to }
        )
      )
  );

  // ---- Etapa: leads por origem / pesquisa / vendas ----
  server.registerTool(
    "get_stage_leads_summary",
    {
      title: "Leads por origem × temperatura (etapa)",
      description:
        "Splits de LEADS de uma etapa por origem (Pago/Orgânico/Sem Track) × temperatura (quente/frio) + leads únicos (dedup e-mail/telefone). Só contagens (zero PII). Use o stageId de list_stages. Retorna {semDados:true} se a etapa não tem planilha de leads.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
        stageId: z.string().describe("ID da etapa (de list_stages)."),
      },
    },
    async ({ projectId, stageId }) =>
      run(() =>
        client.get(
          `/api/public/v1/projects/${encodeURIComponent(projectId)}/stages/${encodeURIComponent(stageId)}/leads-summary`
        )
      )
  );

  server.registerTool(
    "get_stage_survey",
    {
      title: "Pesquisa de qualificação (etapa)",
      description:
        "Distribuições da pesquisa de qualificação de uma etapa por pergunta (renda, Faixa A/B/C/D, profissão, escolaridade, ...) no total e por origem, MAIS a quebra por criativo em `byAdId` (cruze pelo adId com get_creative_performance para achar o criativo que traz público mais qualificado). Só contagens (zero PII). Retorna {semDados:true} se a etapa não tem pesquisa.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
        stageId: z.string().describe("ID da etapa (de list_stages)."),
      },
    },
    async ({ projectId, stageId }) =>
      run(() =>
        client.get(
          `/api/public/v1/projects/${encodeURIComponent(projectId)}/stages/${encodeURIComponent(stageId)}/survey`
        )
      )
  );

  server.registerTool(
    "get_stage_sales_daily",
    {
      title: "Vendas diárias por origem (etapa)",
      description:
        "Vendas diárias de uma etapa por origem: faturamento (bruto/líquido) e ingressos por dia × origem (Pago/Orgânico/Sem Track). O ROAS REAL = faturamentoBruto ÷ investimento (combine com get_daily) — NÃO use o `roas` do pixel para decisões de receita. Só contagens (zero PII). Retorna {semDados:true} se a etapa não tem vendas.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
        stageId: z.string().describe("ID da etapa (de list_stages)."),
      },
    },
    async ({ projectId, stageId }) =>
      run(() =>
        client.get(
          `/api/public/v1/projects/${encodeURIComponent(projectId)}/stages/${encodeURIComponent(stageId)}/sales-daily`
        )
      )
  );
}
