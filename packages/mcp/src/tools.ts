import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LoyolaClient, ApiError } from "./client.js";
import { CATEGORIAS_DO_ANUAL, FAIXAS_DO_ANUAL, FUNIS_DO_ANUAL } from "./vocabulario-anual.js";

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
        "`cplCaptacao` (Story 44.26) é bloco SECUNDÁRIO — nunca o use no lugar do principal. Seu denominador (`leadsNaJanela`) conta só os dias COM campanha e deduplica dentro do dia, então difere de `leadsUnicosDaEtapa` de propósito: não reporte isso como divergência. `motivo: semCoberturaDiaria` = o CPL não sai e o acumulado NÃO substitui. " +
        "`criativos` aqui é SÓ das campanhas desta etapa; get_creative_performance é do PROJETO inteiro e mistura funis. " +
        "Taxas em decimal (0.0192 = 1,92%); spend já inclui o imposto Meta. " +
        "familia:null não é erro — é etapa fora da aba (lyrio/comercial/debriefing), com motivo 'foraDaAba'. " +
        "Cada `motivo` pede uma ação diferente (semDados=conectar fonte, syncPendente=esperar o sync, leituraFalhou=checar permissão): não colapse em 'sem dados'. " +
        "Story 44.28 (08/09/2026): o motivo `reguaDivergente` FOI REMOVIDO. A etapa promovida do perpétuo publica CAC normalmente, e é o MESMO número da aba Meta Ads — as duas passaram a contar vendas pela mesma função. Encontrar esse motivo num payload significa payload velho. " +
        "⚠️ O CAC dessas etapas SUBIU nessa data porque a contagem anterior inflava as vendas: em 30 dias, bbe-funil-churrasco R$ 117,78 → R$ 205,32, pps1/Aquisição R$ 91,91 → R$ 108,93, fz-a1/Vendas R$ 40,23 → R$ 40,75. É correção, não piora — ao comparar com relatório anterior a 08/09, explique em vez de reportar queda.",
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

  // ---- Perpétuo: os KPIs do topo, na régua da aba Meta Ads ----
  server.registerTool(
    "get_perpetual_metrics",
    {
      title: "Métricas do funil PERPÉTUO (a régua da aba Meta Ads)",
      description:
        "CAC, ROAS, margem, faturamento, order bump, reembolsos e a cadeia (CPM/CPC/CTR/connect rate/conversão de checkout) de um funil PERPÉTUO, na janela pedida (Story 44.28). " +
        "USE ESTA TOOL para falar do perpétuo no Resumão: ela devolve os MESMOS números que a aba Meta Ads do painel renderiza, porque as duas leem a mesma função. Recompor CAC ou ROAS por fora, a partir de spend de uma tool e vendas de outra, cria uma segunda régua que diverge da tela — é a classe de defeito que o Epic 44 inteiro existe para impedir. " +
        "⚠️ `vendas` são COMPRADORES ÚNICOS no período (dedup por e-mail na janela inteira). É a régua que o CAC exige, já que CAC é custo de aquisição de CLIENTE: quem compra em dois dias é UMA aquisição. " +
        "⚠️ `serieDiaria[].vendasNoDia` é OUTRA contagem — deduplica DENTRO do dia — e por isso a soma dela é MAIOR OU IGUAL a `vendas`. Isso está certo e não é divergência a reportar: são perguntas diferentes ('quanto vendeu neste dia' × 'quantos clientes foram adquiridos'). NUNCA some a série para citar o total de vendas; use `vendas`. " +
        "`investimento` JÁ inclui o imposto Meta de 12,15% (gross-up ÷ (1 − 0,1215) = ×1,1382, NÃO ×1,1215): não reaplicar nem tentar reverter. " +
        "Ausência é declarada, não vira zero: `investimento: null` = sem campanha vinculada ou sem mídia na janela; `vendas: null` = sem planilha de vendas conectada; `vendas: 0` = há planilha e não houve venda — coisas diferentes, com ações diferentes. `cac`/`roas`/`margem` vêm `null` quando falta numerador ou denominador, nunca `0`. " +
        "`cadeia` é `null` sem mídia na janela. `convLP` ali é a conversão de CHECKOUT (checkouts ÷ visitas na LP); `connectRate` é visitas na LP ÷ cliques no link — jamais sobre cliques totais. " +
        "Difere de get_stage_sales_daily, que conta vendas-dia de uma ETAPA por outra régua: as duas NÃO se substituem e não devem ser comparadas como se medissem a mesma coisa. " +
        "Para o dia fechado, peça `from` = `to` = ontem.",
      inputSchema: {
        funnelId: z
          .string()
          .uuid()
          .describe("ID do funil perpétuo (de list_funnels, onde type='perpetual')."),
        /**
         * ⚠️ Obrigatórios de propósito (AC1).
         *
         * A rota aceita janela default, e `get_stage_cadeia_cac` mostrou o
         * preço disso: chamada sem recorte devolve o HISTÓRICO INTEIRO, e o
         * agente publica um número de seis meses ao lado de um de 30 dias sem
         * que nada na resposta acuse. Aqui o schema não deixa a chamada sair
         * sem janela.
         */
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("Primeiro dia da janela (YYYY-MM-DD). OBRIGATÓRIO."),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("Último dia da janela (YYYY-MM-DD), inclusive. OBRIGATÓRIO."),
      },
    },
    async ({ funnelId, from, to }) =>
      run(() =>
        client.get(`/api/public/v1/funnels/${encodeURIComponent(funnelId)}/perpetual-metrics`, {
          from,
          to,
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

  // =========================================================================
  // PLANNER — esteira anual e calendário. As ÚNICAS tools que gravam.
  //
  // Exigem API key com `planner:write` (ou `planner:read` só para ler). Toda
  // gravação fica auditada com a chave. Fluxo: ler → dryRun → mostrar o diff
  // ao usuário → gravar só com o ok dele.
  // =========================================================================

  const PROJECT = z
    .string()
    .uuid()
    .describe(
      "ID da empresa (projectId). Conhecidos: DG & CPDF 738cda16-c5be-4268-9c98-92e46c359569 · BBE e25369be-1d04-4153-8178-14a3b617e70e · PP 1b89245d-60a4-48a5-a691-c730bd6f48ca · Lyrio 9bd898eb-531a-45a6-801f-61d50e76f794 · FZ & MFB 4d7f55ea-ff1b-4fa8-b3cc-caed182878b3. Outros: list_projects."
    );
  const ANO = z.number().int().min(2020).max(2100).describe("Ano da esteira (ex.: 2027).");
  const campoDeTexto = (oQue: string) =>
    z.string().nullable().optional().describe(`${oQue} Omitido = não muda. null = limpa.`);
  const planner = "/api/public/v1/planner";

  server.registerTool(
    "get_esteira_anual",
    {
      title: "Ler a esteira anual",
      description:
        "Lê a visão 'Anual (esteiras)' do Planner de uma empresa num ano: faixas (organico/trafego/ascensao, com o rótulo que a empresa usa na tela) → esteiras (linhas) → células preenchidas por mês (nota, produto, categoria, funil). Mês ausente = célula vazia. USE ANTES DE QUALQUER ESCRITA para ver o estado atual e os nomes exatos das esteiras.",
      inputSchema: { projectId: PROJECT, ano: ANO },
    },
    async ({ projectId, ano }) =>
      run(() => client.get(`${planner}/anual/${encodeURIComponent(projectId)}/${ano}`))
  );

  server.registerTool(
    "upsert_esteira_celulas",
    {
      title: "Preencher células da esteira",
      description:
        "Preenche ou atualiza células da esteira anual (nota, produto, categoria, funil) por mês, em lote. Upsert PARCIAL: campo omitido não muda, null limpa. A esteira vem por id OU por faixa + nome (sem diferenciar maiúsculas/acentos); com criarSeNaoExistir: true ela é criada. SEMPRE chame primeiro com dryRun: true, mostre ao usuário o diff (antes → depois) de cada célula e só grave (dryRun: false) depois do ok dele. Tudo ou nada: se um item for inválido, nada é gravado e a resposta lista o que corrigir.",
      inputSchema: {
        projectId: PROJECT,
        ano: ANO,
        dryRun: z.boolean().describe("true = só mostra o diff, não grava. Use true primeiro."),
        celulas: z
          .array(
            z.object({
              esteira: z
                .object({
                  id: z.string().uuid().optional().describe("ID da esteira (de get_esteira_anual)."),
                  faixa: z
                    .string()
                    .optional()
                    .describe(
                      `Faixa da esteira: ${FAIXAS_DO_ANUAL.join(" | ")} ou o rótulo da tela (ex.: TRÁFEGO, CAMPANHA).`
                    ),
                  nome: z.string().optional().describe("Nome da esteira, como aparece na tela."),
                  criarSeNaoExistir: z
                    .boolean()
                    .optional()
                    .describe("Cria a esteira se não houver uma com esse nome na faixa."),
                })
                .describe("Informe id, ou faixa + nome."),
              mes: z.number().int().min(1).max(12).describe("1 = janeiro … 12 = dezembro."),
              nota: campoDeTexto("Texto curto acima da célula (ex.: 'REN1 · semana 22–25/02')."),
              produto: campoDeTexto("Produto (ex.: 'Funil de Lucro (VSL 2)')."),
              categoria: z
                .enum(CATEGORIAS_DO_ANUAL)
                .nullable()
                .optional()
                .describe("Omitido = não muda. null = limpa."),
              funil: z
                .enum(FUNIS_DO_ANUAL)
                .nullable()
                .optional()
                .describe("Omitido = não muda. null = limpa."),
            })
          )
          .min(1)
          .max(200),
      },
    },
    async ({ projectId, ano, dryRun, celulas }) =>
      run(() =>
        client.send("PUT", `${planner}/anual/${encodeURIComponent(projectId)}/${ano}/celulas`, {
          dryRun,
          celulas,
        })
      )
  );

  server.registerTool(
    "create_esteira",
    {
      title: "Criar esteira",
      description:
        "Cria uma nova linha (esteira) dentro de uma faixa da esteira anual. A esteira vale para TODOS os anos (as células é que são por ano). Se já existir uma com o mesmo nome na faixa, devolve erro 409 com o id dela — use esse id. Para criar e já preencher, prefira upsert_esteira_celulas com criarSeNaoExistir: true.",
      inputSchema: {
        projectId: PROJECT,
        faixa: z
          .string()
          .describe(`${FAIXAS_DO_ANUAL.join(" | ")} ou o rótulo da tela (ex.: TRÁFEGO).`),
        nome: z.string().min(1).describe("Nome da esteira (ex.: 'Perpétuo Funil de Lucro')."),
      },
    },
    async ({ projectId, faixa, nome }) =>
      run(() =>
        client.send("POST", `${planner}/anual/${encodeURIComponent(projectId)}/esteiras`, {
          faixa,
          nome,
        })
      )
  );

  server.registerTool(
    "clear_esteira_celulas",
    {
      title: "Limpar meses da esteira",
      description:
        "Apaga as células de uma esteira em meses de um ano. Destrutivo: CONFIRME com o usuário antes, mostrando o que será apagado (chame antes com dryRun: true — a resposta traz o conteúdo de cada mês).",
      inputSchema: {
        projectId: PROJECT,
        ano: ANO,
        esteiraId: z.string().uuid().describe("ID da esteira (de get_esteira_anual)."),
        meses: z.array(z.number().int().min(1).max(12)).min(1).describe("Meses a limpar (1–12)."),
        dryRun: z.boolean().describe("true = só mostra o que seria apagado."),
      },
    },
    async ({ projectId, ano, esteiraId, meses, dryRun }) =>
      run(() =>
        client.send("DELETE", `${planner}/anual/${encodeURIComponent(projectId)}/${ano}/celulas`, {
          esteiraId,
          meses,
          dryRun,
        })
      )
  );

  // ---- Calendário do Planner (campanhas e fases) ----

  const DATA = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .describe("AAAA-MM-DD. Omitido = não muda. null = limpa.");

  server.registerTool(
    "list_planner_agendas",
    {
      title: "Listar agendas do Google do Planner",
      description:
        "Lista as agendas do Google Calendar conectadas ao Planner (id + nome, ex.: '🇺🇸 [FZ] Agenda Geral'). A campanha ligada a uma agenda espelha cada fase como evento nela.",
      inputSchema: {},
    },
    async () => run(() => client.get(`${planner}/agendas`))
  );

  server.registerTool(
    "list_planner_campanhas",
    {
      title: "Listar campanhas do calendário",
      description:
        "Lista as campanhas (cards) do calendário do Planner com as fases (id, nome, início, fim, noGoogle = já está na agenda). Filtre por busca (parte do nome), projectId ou janela de datas (de/ate: campanhas com alguma fase cruzando a janela). USE ANTES de editar, para achar o id da campanha e da fase.",
      inputSchema: {
        busca: z.string().optional().describe("Parte do nome da campanha (ex.: 'BBEPR2')."),
        projectId: z.string().uuid().optional().describe("Só campanhas desta empresa."),
        de: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Início da janela (AAAA-MM-DD)."),
        ate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Fim da janela (AAAA-MM-DD)."),
      },
    },
    async (filtros) => run(() => client.get(`${planner}/campanhas`, filtros))
  );

  server.registerTool(
    "create_planner_campanha",
    {
      title: "Criar campanha no calendário",
      description:
        "Cria uma campanha (card) no calendário do Planner, com fases opcionais. Com `agenda` (id ou parte do nome, ex.: 'FZ'), cada fase datada vira evento no Google Calendar dessa agenda, com título 'NOME - Fase'. Confirme nome, agenda e datas com o usuário antes. Se a resposta trouxer avisoGoogle, a campanha foi salva mas o Google recusou — repasse o aviso.",
      inputSchema: {
        nome: z.string().min(1).describe("Nome da campanha (ex.: 'FZ REN1 - Renovação MFB')."),
        agenda: z
          .string()
          .optional()
          .describe(
            "Agenda do Google (id ou parte do nome, de list_planner_agendas). Sem agenda, fica só no Planner."
          ),
        projectId: z.string().uuid().optional().describe("Empresa da campanha (opcional)."),
        cor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe("Cor #rrggbb (opcional)."),
        fases: z
          .array(z.object({ nome: z.string().min(1), inicio: DATA, fim: DATA }))
          .optional()
          .describe("Fases iniciais. Sem fases = campanha vazia."),
      },
    },
    async (dados) => run(() => client.send("POST", `${planner}/campanhas`, dados))
  );

  server.registerTool(
    "update_planner_campanha",
    {
      title: "Editar campanha do calendário",
      description:
        "Renomeia, recolore, troca a empresa ou a agenda do Google de uma campanha. Renomear muda o título de TODOS os eventos dela no Google. agenda: null desliga o espelho. Para mexer em fases, use upsert_planner_fase / delete_planner_fase.",
      inputSchema: {
        campanhaId: z.string().uuid().describe("ID da campanha (de list_planner_campanhas)."),
        nome: z.string().min(1).optional(),
        cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        projectId: z.string().uuid().nullable().optional(),
        agenda: z
          .string()
          .nullable()
          .optional()
          .describe("Id ou parte do nome da agenda; null desliga."),
      },
    },
    async ({ campanhaId, ...dados }) =>
      run(() =>
        client.send("PATCH", `${planner}/campanhas/${encodeURIComponent(campanhaId)}`, dados)
      )
  );

  server.registerTool(
    "upsert_planner_fase",
    {
      title: "Criar ou editar fase",
      description:
        "Cria uma fase numa campanha (sem faseId) ou edita uma existente (com faseId). Só a fase indicada muda — as outras ficam intactas. Com agenda ligada, a fase datada é espelhada no Google Calendar na hora. Confirme datas com o usuário antes de gravar.",
      inputSchema: {
        campanhaId: z.string().uuid().describe("ID da campanha (de list_planner_campanhas)."),
        faseId: z.string().optional().describe("ID da fase para EDITAR. Omitido = cria uma nova."),
        nome: z.string().min(1).optional().describe("Nome da fase (obrigatório ao criar)."),
        inicio: DATA,
        fim: DATA,
      },
    },
    async ({ campanhaId, faseId, ...dados }) =>
      run(() =>
        faseId
          ? client.send(
              "PATCH",
              `${planner}/campanhas/${encodeURIComponent(campanhaId)}/fases/${encodeURIComponent(faseId)}`,
              dados
            )
          : client.send("POST", `${planner}/campanhas/${encodeURIComponent(campanhaId)}/fases`, dados)
      )
  );

  server.registerTool(
    "delete_planner_fase",
    {
      title: "Excluir fase",
      description:
        "Exclui uma fase de uma campanha — e o evento dela no Google Calendar. Destrutivo: CONFIRME com o usuário antes, dizendo campanha, fase e datas.",
      inputSchema: {
        campanhaId: z.string().uuid().describe("ID da campanha."),
        faseId: z.string().describe("ID da fase (de list_planner_campanhas)."),
      },
    },
    async ({ campanhaId, faseId }) =>
      run(() =>
        client.send(
          "DELETE",
          `${planner}/campanhas/${encodeURIComponent(campanhaId)}/fases/${encodeURIComponent(faseId)}`
        )
      )
  );
}
