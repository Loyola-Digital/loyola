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
        "Performance por criativo Meta (anúncio) de um projeto: metadata (thumbnail/title/body/cta), métricas de vídeo e KPIs (spend/ctr/cpc/cpm/leads/cpl/cpa/roas). Use orderBy para rankear (ex.: 'ctr', 'cpa', 'roas', 'spend', 'leads'). Filtre por campaignId se quiser uma campanha só. A resposta traz `total`, `returned`, `offset` e `truncated` — se `truncated` for true, chame de novo com `offset` maior para pegar o resto, senão a análise sai incompleta em silêncio.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
        campaignId: z.string().optional().describe("Filtra por uma campanha (campaignId de list_campaigns)."),
        orderBy: z
          .enum(["spend", "ctr", "cpc", "cpm", "cpl", "cpa", "roas", "leads", "impressions", "clicks"])
          .optional()
          .describe("Métrica de ordenação (desc). Default: spend."),
        // O teto acompanha a rota (500, desde a 43.4). Ficar em 200 fazia a
        // resposta voltar `truncated: true` sem dar meio de buscar o resto —
        // são 433 criativos medidos numa janela de 30 dias.
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Máx. de criativos por página. Default: 50, teto 500."),
        offset: z.coerce
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Quantos pular. Use com `limit` quando a resposta vier `truncated: true`: some `returned` ao `offset` e chame de novo até `truncated` virar false.",
          ),
        from: fromField,
        to: toField,
      },
    },
    async ({ projectId, campaignId, orderBy, limit, offset, from, to }) =>
      run(() =>
        client.get(`/api/public/meta/v1/projects/${encodeURIComponent(projectId)}/creatives`, {
          campaignId,
          orderBy,
          limit,
          offset,
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

  // ---- Cadeia de CAC da ETAPA (Epic 44) — o cálculo pronto, igual ao da aba ----
  server.registerTool(
    "get_stage_cadeia_cac",
    {
      title: "Cadeia de CAC da ETAPA",
      description:
        "A Cadeia de CAC de uma etapa — o MESMO payload que a aba 'Inácio' do painel renderiza (Epic 44). " +
        "PREFIRA esta tool a recompor a cadeia à mão a partir de get_stage_daily: CPM, CTR, CPC, Connect Rate, Conv. LP, tetos por janela de 7 dias, ranking do gargalo e benchmarks já vêm calculados com a régua da spec — recalcular por fora cria uma segunda régua que diverge da tela. " +
        "O número principal MUDA de métrica com a família da etapa: cacReal (spend ÷ vendas) na família paga (paid/sales/event_capture/event), cplReal (spend ÷ leads únicos) na gratuita (free/cpl) — numa etapa de família gratuita o principal NÃO é CAC. " +
        "⚠️ LEIA O CAMPO `familia`, NUNCA deduza do `stageType` (Story 44.25): num funil `perpetual`, uma etapa `free`/`cpl` é promovida à família PAGA e o principal É cacReal — ali o stage_type é o default da coluna, não uma escolha, e a etapa é o dashboard de venda do perpétuo. Vale hoje para bbe-fc1-a1-mai-26, fz-a1 e pps1. A promoção alcança só free/cpl: `mapa` e `comercial` dentro de perpétuo seguem familia:null. " +
        "`criativos` aqui é SÓ das campanhas desta etapa; get_creative_performance é do PROJETO inteiro e mistura funis. " +
        "Taxas em decimal (0.0192 = 1,92%); spend já inclui o imposto Meta. " +
        "familia:null não é erro — é etapa fora da aba (lyrio/comercial/debriefing), com motivo 'foraDaAba'. " +
        "Cada `motivo` pede uma ação diferente (semDados=conectar fonte, syncPendente=esperar o sync, leituraFalhou=checar permissão): não colapse em 'sem dados'. " +
        "EXCEÇÃO: `reguaDivergente` NÃO é ação de ninguém e não entra em lista de pendências — significa que a etapa TEM CAC mas esta rota ainda não o publica (a base de vendas daqui conta transações dedupadas; o dashboard perpétuo conta checkouts/compradores). Para o CAC dessa etapa, use o número do dashboard perpétuo e diga de onde veio; `spend` e `vendasReais` desta rota seguem confiáveis.",
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
          `/api/public/meta/v1/projects/${encodeURIComponent(projectId)}/stages/${encodeURIComponent(stageId)}/cadeia-cac`,
          { from, to }
        )
      )
  );

  // ---- Panorama do PROJETO (Story 44.20) — o ponto de partida diário ----
  server.registerTool(
    "get_project_panorama",
    {
      title: "Panorama do projeto (Cadeia de CAC)",
      description:
        "O panorama de UM projeto numa chamada: as etapas com campanha, quanto gastaram nas janelas curta (7d) e longa (30d), o número principal de cada uma, o gargalo da cadeia, as campanhas órfãs e as pendências de configuração (Story 44.20). " +
        "COMECE POR AQUI todo dia, ANTES de get_stage_cadeia_cac: esta tool diz quais etapas valem uma leitura profunda; a outra abre a etapa escolhida. Sem ela são de 6 a 10 chamadas (list_funnels, list_stages por funil, get_stage_daily por etapa) para a mesma resposta. " +
        "`spend` JÁ inclui o imposto Meta de 12,15%, aplicado como gross-up (spend ÷ (1 − 0,1215) = ×1,1382, NÃO ×1,1215): não reaplicar nem tentar reverter. " +
        "`noAr` é MEDIDO por gasto na janela curta, não por status — campanha pausada no meio da janela gastou e conta. " +
        "`effectiveStatus: null` NÃO é 'pausada': é entidade que o backfill de nomes ainda não resolveu. Nunca escreva 'Pausado' por ausência de dado. " +
        "`familia: null` é etapa fora da aba (lyrio/comercial/debriefing), não erro — ela aparece na lista, com gargalo null, e fica fora de totais.etapasNoAr. " +
        "`pendencias` são fatos de CONFIGURAÇÃO, não falhas da consulta, e cada `codigo` pede uma ação diferente (semDados=conectar fonte, syncPendente=esperar o sync, leituraFalhou=checar permissão). O campo `origem` diz se o item foi apurado pelo backend (`cadeia`) ou concluído pelo panorama (`panorama`) — só o primeiro é fato de origem. " +
        "`campanhasOrfas` é dinheiro gasto fora de toda etapa: não entra em CAC nem em ROAS de lugar nenhum, e não deve ser encostado numa etapa por semelhança de nome. " +
        "Esta tool NÃO tem `fresh`: ela lê o cache de vendas como está. Para número de venda recomputado ao vivo, abra a etapa escolhida com get_stage_cadeia_cac — o panorama forçando recompute em todas as etapas levava 15 s no maior projeto.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Último dia das duas janelas (YYYY-MM-DD). Default: hoje."),
        curta: z.number().int().min(1).max(365).optional().describe("Dias da janela curta. Default 7."),
        longa: z.number().int().min(1).max(365).optional().describe("Dias da janela longa. Default 30."),
      },
    },
    async ({ projectId, to, curta, longa }) =>
      run(() =>
        client.get(`/api/public/meta/v1/projects/${encodeURIComponent(projectId)}/panorama-cac`, {
          to,
          curta,
          longa,
        })
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

  const INCLUDE_DESC =
    "Blocos extras, CSV: byDay, porOrigem, porCanal, porProduto, porPlataforma, porProdutoPlataforma, porOrigemTemperatura (e byStage, só no funil). Ou \"all\". Omita para receber SÓ o resumo — peça apenas o que for usar.";

  server.registerTool(
    "get_stage_sales",
    {
      title: "Vendas de UMA etapa (resumo enxuto)",
      description:
        "Vendas de uma etapa a partir SÓ do stageId — não precisa do projectId nem de chamar discovery antes. Por padrão devolve só o resumo: totalVendas, faturamentoBruto/Liquido, range, subtypesConsidered (de quais planilhas veio) e manualSalesIncluded, mais o nome/tipo da etapa e o funil a que pertence. Use `include` para trazer as quebras pesadas sob demanda. Prefira esta tool a get_stage_sales_daily — mesma fonte (o mesmo cache), muito menos payload. Zero PII. `semDados:true` = etapa sem planilha de venda ou sync ainda não rodou. Para ROAS combine com o investimento de get_stage_daily; para linha a linha use get_stage_sales_rows.",
      inputSchema: {
        stageId: z.string().uuid().describe("ID da etapa (de list_stages)."),
        include: z.string().optional().describe(INCLUDE_DESC),
      },
    },
    async ({ stageId, include }) =>
      run(() =>
        client.get(
          `/api/public/v1/stages/${encodeURIComponent(stageId)}/sales` +
            (include ? `?include=${encodeURIComponent(include)}` : "")
        )
      )
  );

  server.registerTool(
    "get_funnel_sales",
    {
      title: "Vendas do FUNIL inteiro (agregado das etapas)",
      description:
        "Vendas somadas de TODAS as etapas de um funil — responde direto \"quantas vendas e quanto faturou o funil X\" sem iterar etapa por etapa. Por padrão só o resumo: totalVendas, faturamentoBruto/Liquido, range, stagesContabilizadas/stagesTotal (se forem diferentes, alguma etapa ficou fora — peça include=byStage pra ver qual e por quê). Use `include` para as quebras. Zero PII. Uma mesma planilha física só conta UMA vez: no perpétuo a planilha de vendas é do FUNIL e é herdada por toda etapa free/paid, então somar as etapas na mão dobra o faturamento — aqui já vem tratado, e `avisos` (quando presente) sinaliza ambiguidade restante. `computedAt` é o da etapa MAIS ANTIGA (frescura real do total). Para ROAS combine com o investimento do get_daily.",
      inputSchema: {
        funnelId: z.string().uuid().describe("ID do funil (de list_funnels)."),
        include: z.string().optional().describe(INCLUDE_DESC),
      },
    },
    async ({ funnelId, include }) =>
      run(() =>
        client.get(
          `/api/public/v1/funnels/${encodeURIComponent(funnelId)}/sales` +
            (include ? `?include=${encodeURIComponent(include)}` : "")
        )
      )
  );

  // ---- Row-level de vendas (39.I3 — Inácio) ----
  server.registerTool(
    "get_stage_sales_rows",
    {
      title: "Vendas ROW-LEVEL da etapa (por transação)",
      description:
        "Uma linha por TRANSAÇÃO das planilhas de venda da etapa (mesmas fontes do sales-daily): txId, emailHash (sha256 — zero PII, mesma chave do cross-launch), produto, plataforma (subtype: main_product/tmb/perpetual_sales/... — exclua tmb pra tirar TMB), valorBruto/Liquido, dataVendaRaw (célula CRUA — n8n grava UTC, faça você o corte UTC→BRT) + dataVenda (ISO), statusBucket (paid/refunded/chargeback/other — reembolsos INCLUÍDOS, filtre), as 5 UTMs da venda, origem/canal/temperatura classificados, e amarração lead↔venda (leadMatch, leadUtmSource/Term, leadCreatedAt → coorte D+x = dataVenda − leadCreatedAt). SEM dedup — chave do dashboard é txId+produto.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
        stageId: z.string().describe("ID da etapa (de list_stages)."),
      },
    },
    async ({ projectId, stageId }) =>
      run(() =>
        client.get(
          `/api/public/v1/projects/${encodeURIComponent(projectId)}/stages/${encodeURIComponent(stageId)}/sales-rows`
        )
      )
  );

  // ---- Cross-launch (39.I4 — Inácio) ----
  server.registerTool(
    "get_cross_launch",
    {
      title: "Cross-launch do projeto (recompra entre funis)",
      description:
        "Recompra entre lançamentos/funis do projeto, match server-side por sha256 de e-mail (zero PII): compradores únicos por funil, multiFunnelBuyers (compraram em 2+), e overlaps por par com direção (aThenB = comprou em A antes de B, pela 1ª compra em cada). Pré-computado em cache — semDados = sync pendente.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
      },
    },
    async ({ projectId }) =>
      run(() =>
        client.get(`/api/public/v1/projects/${encodeURIComponent(projectId)}/cross-launch`)
      )
  );

  // ---- Custos operacionais da etapa (Brief v5 #2 — Evento Presencial) ----
  server.registerTool(
    "get_stage_operational_costs",
    {
      title: "Custos operacionais da etapa",
      description:
        "Custos operacionais lançados na etapa (venue, staff, logística, hospedagem, alimentação, marketing, outros): totalCosts + byCategory + items. É o denominador que falta pro ROAS REAL de evento presencial: ROAS_real = faturamento ÷ (spend Meta + totalCosts). Retorna {semDados:true} se nenhum custo foi lançado.",
      inputSchema: {
        projectId: z.string().uuid().describe("ID do projeto (de list_projects)."),
        stageId: z.string().describe("ID da etapa (de list_stages)."),
      },
    },
    async ({ projectId, stageId }) =>
      run(() =>
        client.get(
          `/api/public/v1/projects/${encodeURIComponent(projectId)}/stages/${encodeURIComponent(stageId)}/operational-costs`
        )
      )
  );
}
