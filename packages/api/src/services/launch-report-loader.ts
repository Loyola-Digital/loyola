/**
 * Story 41.2 — I/O do Resumão: carrega as 4 fontes e chama o motor.
 *
 * Separado de `launch-report-engine.ts` de propósito, seguindo o padrão que a
 * 41.8 estabeleceu: lá mora a matemática (pura, conferida contra a §10 em
 * teste); aqui mora o acesso a banco, planilha e cache da Meta.
 *
 * As 4 "views" do §1 da spec mapeiam para o que já existe:
 * - `v_campanhas` → `funnel_stages.campaigns` + `meta_campaign_insights_daily`
 * - `v_ads`       → `meta_ad_insights_daily` (só para a reconciliação §2.3b)
 * - `v_vendas`    → planilhas de `resolveSalesSheetsForStage`
 * - `v_pesquisa`  → `computeSurveyForStage`
 *
 * ⚠️ Regra do epic (R-E2): o spend vem do **cache do banco**. O gerador não abre
 * um novo caminho de fan-out por criativo na API da Meta.
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import {
  funnelStages,
  metaAdInsightsDaily,
  metaAdsAccounts,
  metaCampaignInsightsDaily,
  stageSalesSpreadsheets,
  funnelSurveys,
} from "../db/schema.js";
import { readSheetData } from "./google-sheets.js";
import { resolveSalesSheetsForStage } from "./sales-daily-sync.js";
import { classifyRefundStatus, isRefundBucket } from "./sales-status.js";
import { fetchCampaignDailyInsightsForIdsWithCache } from "./meta-insights-cache.js";
import { computeSurveyForStage } from "./survey-aggregation.js";
import { applyMetaTax } from "../utils/meta-tax.js";
import { businessYesterday, saleDayKey } from "../utils/sale-date.js";
import { loadReportConfig, type LaunchReportConfig } from "./launch-report-config.js";
import { resolverColunaPreco, valorBrl, type LinhaVendaValor } from "./launch-report-sales-value.js";
import { adNameDoTerm } from "./launch-report-normalize.js";
import type { AdInput, FaixaPorAd } from "./launch-report-ads.js";
import {
  computeLaunchReportMetrics,
  type CampanhaInput,
  type LaunchReportMetrics,
  type VendaInput,
} from "./launch-report-engine.js";
import type { Database } from "../db/client.js";

export interface LoadLaunchReportParams {
  stageId: string;
  /** Sobrepõe o período da config. Nulo em ambos = deriva (§2.8). */
  dataInicio?: string | null;
  dataFim?: string | null;
}

/** Erro de dado ausente — distinto de gate (`ReportScopeError`) e de invariante. */
export class LaunchReportDataError extends Error {
  readonly erro = "DADO_INDISPONIVEL";
  constructor(
    readonly detalhe: string,
    readonly acao: string,
  ) {
    super(detalhe);
    this.name = "LaunchReportDataError";
  }
  toResponse() {
    return { erro: this.erro, detalhe: this.detalhe, acao: this.acao };
  }
}

type AccessTokenFor = (accountId: string) => Promise<string | null>;

export async function loadLaunchReport(
  db: Database,
  accessTokenFor: AccessTokenFor,
  params: LoadLaunchReportParams,
): Promise<LaunchReportMetrics> {
  // 1. Config + gate do §12. Lança ReportScopeError se a combinação não passou.
  const config = await loadReportConfig(db, params.stageId);

  // 2. Campanhas vinculadas à etapa e conta Meta
  const [stage] = await db
    .select({
      campaigns: funnelStages.campaigns,
      metaAccountId: funnelStages.metaAccountId,
      funnelId: funnelStages.funnelId,
    })
    .from(funnelStages)
    .where(eq(funnelStages.id, params.stageId))
    .limit(1);
  if (!stage) {
    throw new LaunchReportDataError("etapa não encontrada", "Verificar o ID da etapa");
  }

  const campanhasDoStage = ((stage.campaigns as { id: string; name: string }[] | null) ?? []).filter(
    (c) => c?.id,
  );

  // 3. Vendas da planilha (sem recorte de período ainda — o §2.8 precisa da
  //    menor data de venda para derivar o início).
  const { linhas: vendasBrutas, mappingPrecoDivergente } = await carregarVendas(
    db,
    params.stageId,
    config.tipo,
  );

  // 4. Período (§2.8)
  const periodo = await resolverPeriodo(db, {
    config,
    params,
    vendas: vendasBrutas,
    campanhaIds: campanhasDoStage.map((c) => c.id),
  });

  // 5. Recorte no período e valor em BRL (§2.4)
  const noPeriodo = vendasBrutas.filter((v) => v.dia >= periodo.inicio && v.dia <= periodo.fim);
  const paraValor: LinhaVendaValor[] = noPeriodo.map((v) => ({
    produto: v.produto,
    preco: v.precoCru,
    moeda: v.moeda,
    data: v.dia,
  }));
  const resultadoValor = valorBrl(paraValor);

  const vendas: VendaInput[] = noPeriodo.map((v, i) => ({
    email: v.email,
    txId: v.txId,
    produto: v.produto,
    valorBrl: resultadoValor.valores[i] ?? v.precoCru,
    dia: v.dia,
    utmSource: v.utmSource,
    utmTerm: v.utmTerm,
    utmContent: v.utmContent,
    isOrderBump: v.isOrderBump,
  }));

  // 6. Mídia — cache do banco, com reconciliação campaign × ad (§2.3b)
  const campanhas = await carregarMidia(db, accessTokenFor, {
    projectId: config.projectId,
    metaAccountId: stage.metaAccountId,
    campanhas: campanhasDoStage,
    periodo,
  });

  // 6b. Ad-level para os destaques da 41.4. Ausente = `destaques` fica null e o
  //     A6 segue `skipped` — é o caso do PG02, cujo ad-level nunca foi gravado.
  const ads = await carregarAds(db, {
    projectId: config.projectId,
    campanhaIds: campanhasDoStage.map((c) => c.id),
    nomePorCampanha: new Map(campanhasDoStage.map((c) => [c.id, c.name])),
    periodo,
  });

  // Resolve o `ad_name` de cada venda paga pelo `utm_content` (ad id), com
  // fallback para o último segmento do `utm_term`. É o padrão consolidado na
  // Story 18.65: agregar por NOME, não exigir coluna literal na planilha.
  const nomePorAdId = new Map<string, string>();
  for (const a of ads) {
    if (a.adName) nomePorAdId.set(a.adId, a.adName);
  }
  for (const v of vendas) {
    v.adName = nomePorAdId.get((v.utmContent ?? "").trim()) ?? adNameDoTerm(v.utmTerm);
  }

  // 7. Pesquisa — blocos agregados + os e-mails que responderam (o denominador
  //    da taxa de resposta é comprador que respondeu, não resposta total).
  const survey = await computeSurveyForStage(db, params.stageId).catch(() => null);
  const { emails: emailsRespondentes, total: respostasTotais } = await carregarEmailsPesquisa(
    db,
    params.stageId,
  );

  return computeLaunchReportMetrics({
    periodo,
    impostoPct: config.impostoPct,
    impostoOrigem: config.impostoOrigem,
    // O loader já aplicou o gross-up por DIA, que é o certo quando o período
    // atravessa 2026-01-01 — o motor não reaplica (risco R1).
    impostoJaAplicado: true,
    campanhas,
    vendas,
    pesquisa: { emailsRespondentes, respostasTotais, blocos: survey ?? undefined },
    precoDistintoPorProduto: resultadoValor.precoDistintoPorProduto,
    linhasConvertidas: resultadoValor.linhasConvertidas,
    mappingPrecoDivergente,
    ads,
    faixas: extrairFaixas(survey, nomePorAdId),
  });
}

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------

interface LinhaCrua {
  email: string | null;
  txId: string | null;
  produto: string | null;
  precoCru: number;
  moeda: string | null;
  dia: string;
  utmSource: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  isOrderBump: boolean;
}

/** Aceita `119.54` (export do Gerenciador) e `119,54` (export BR). */
function parseNumberBr(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  return Number.parseFloat(normalized) || 0;
}

async function carregarVendas(
  db: Database,
  stageId: string,
  tipo: string,
): Promise<{
  linhas: LinhaCrua[];
  mappingPrecoDivergente: { colunaDoMapping: string; colunaUsada: string } | null;
}> {
  const { sheets } = await resolveSalesSheetsForStage(db, stageId);
  if (sheets.length === 0) {
    // Etapa gratuita costuma não ter planilha de VENDAS por natureza — ela capta
    // lead, não ingresso. E o Resumão inteiro é construído sobre venda
    // (ingressos únicos, faturamento, ROAS, ticket, order bump), então aqui não
    // é "falta conectar": é o relatório não se aplicar à etapa.
    //
    // O gate do §12 já sinaliza isso, mas ele é furável marcando `validado`
    // manualmente — e quem marcou merece um erro que diga o porquê, não um
    // "conecte a planilha" que mandaria procurar algo que não existe.
    if (tipo === "gratuito") {
      throw new LaunchReportDataError(
        "esta é uma etapa de captação GRATUITA e não tem planilha de vendas — o Resumão " +
          "é construído sobre venda (ingressos únicos, faturamento, ROAS, ticket e order " +
          "bump), métricas que não existem numa captação sem cobrança",
        "O Resumão foi validado apenas para captação PAGA (§12 da spec). Para a etapa " +
          "gratuita, use o dashboard da etapa; se o relatório precisa cobrir o gratuito, " +
          "isso é escopo novo — a spec marca §12.3 como pendente porque o Connect Rate " +
          "ainda não tem fonte no dado",
      );
    }
    throw new LaunchReportDataError(
      "etapa sem planilha de vendas conectada",
      "Conectar a planilha de vendas da etapa antes de gerar o Resumão",
    );
  }

  // §2.5 — order bump vem da união dos productNames marcados em TODAS as
  // planilhas do stage, case-insensitive. Produto não listado = captação.
  const marcados = await db
    .select({ orderBumpProducts: stageSalesSpreadsheets.orderBumpProducts })
    .from(stageSalesSpreadsheets)
    .where(eq(stageSalesSpreadsheets.stageId, stageId));
  const orderBumpSet = new Set<string>();
  for (const m of marcados) {
    for (const p of (m.orderBumpProducts as string[] | null) ?? []) {
      const norm = p.trim().toLowerCase();
      if (norm) orderBumpSet.add(norm);
    }
  }
  const isOrderBump = (produto: string | null) =>
    orderBumpSet.has((produto ?? "").trim().toLowerCase());

  const linhas: LinhaCrua[] = [];
  let mappingPrecoDivergente: { colunaDoMapping: string; colunaUsada: string } | null = null;

  for (const sheet of sheets) {
    const mapping = (sheet.columnMapping ?? {}) as Record<string, string | undefined>;

    let dados;
    try {
      dados = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
    } catch (e) {
      throw new LaunchReportDataError(
        `não foi possível ler a planilha "${sheet.sheetName}": ${(e as Error).message}`,
        "Verificar o acesso à planilha e tentar de novo",
      );
    }

    const { headers, rows } = dados;

    // §2.4 — a coluna de VALOR é resolvida aqui, não pelo mapping cego.
    const colPreco = resolverColunaPreco(mapping.valorBruto, headers);
    if (!colPreco.coluna) {
      throw new LaunchReportDataError(
        `a planilha "${sheet.sheetName}" não tem coluna de preço nem mapeamento de valor`,
        "Mapear a coluna de preço no wizard de planilhas",
      );
    }
    if (colPreco.mappingDivergente && colPreco.colunaDoMapping) {
      mappingPrecoDivergente = {
        colunaDoMapping: colPreco.colunaDoMapping,
        colunaUsada: colPreco.coluna,
      };
    }

    const idx = (nome: string | undefined | null) => (nome ? headers.indexOf(nome) : -1);
    const precoIdx = headers.indexOf(colPreco.coluna);
    const emailIdx = idx(mapping.email);
    const dataIdx = idx(mapping.dataVenda);
    const statusIdx = idx(mapping.status);
    const txIdx = idx(mapping.transactionId);
    const produtoIdx = idx(mapping.productName);
    const sourceIdx = idx(mapping.utm_source);
    const termIdx = idx(mapping.utm_term);
    const contentIdx = idx(mapping.utm_content);
    const moedaIdx = headers.findIndex((h) => /moeda|currency/i.test(h));

    if (dataIdx === -1) {
      throw new LaunchReportDataError(
        `a planilha "${sheet.sheetName}" não tem a data da venda mapeada`,
        "Mapear a coluna de data no wizard de planilhas",
      );
    }

    const hasStatusCol = statusIdx !== -1;

    // Passe 1 — transação reembolsada sai inteira (a linha paga pareada também).
    const reembolsadas = new Set<string>();
    if (hasStatusCol && txIdx !== -1) {
      for (const row of rows) {
        if (isRefundBucket(classifyRefundStatus(row[statusIdx], hasStatusCol))) {
          const tx = (row[txIdx] ?? "").trim();
          if (tx) reembolsadas.add(tx);
        }
      }
    }

    const limpo = (i: number, row: string[]): string | null => {
      if (i === -1) return null;
      const v = (row[i] ?? "").trim();
      if (!v) return null;
      const low = v.toLowerCase();
      if (low === "null" || low === "undefined" || low === "-" || low === "n/a") return null;
      return v;
    };

    for (const row of rows) {
      if (hasStatusCol) {
        if (isRefundBucket(classifyRefundStatus(row[statusIdx], hasStatusCol))) continue;
        if (txIdx !== -1) {
          const tx = (row[txIdx] ?? "").trim();
          if (tx && reembolsadas.has(tx)) continue;
        }
      }

      const dia = saleDayKey(row[dataIdx]);
      if (!dia) continue;

      const preco = parseNumberBr(row[precoIdx]);
      if (preco <= 0) continue;

      const produto = limpo(produtoIdx, row);
      linhas.push({
        email: limpo(emailIdx, row)?.toLowerCase() ?? null,
        txId: limpo(txIdx, row),
        produto,
        precoCru: preco,
        moeda: limpo(moedaIdx, row),
        dia,
        utmSource: limpo(sourceIdx, row),
        utmTerm: limpo(termIdx, row),
        utmContent: limpo(contentIdx, row),
        isOrderBump: isOrderBump(produto),
      });
    }
  }

  return { linhas, mappingPrecoDivergente };
}

// ---------------------------------------------------------------------------
// Período (§2.8)
// ---------------------------------------------------------------------------

async function resolverPeriodo(
  db: Database,
  args: {
    config: LaunchReportConfig;
    params: LoadLaunchReportParams;
    vendas: readonly LinhaCrua[];
    campanhaIds: readonly string[];
  },
): Promise<{ inicio: string; fim: string }> {
  const { config, params, vendas, campanhaIds } = args;

  const inicio = params.dataInicio ?? config.dataInicio ?? null;
  const fim = params.dataFim ?? config.dataFim ?? null;
  if (inicio && fim) {
    if (inicio > fim) {
      throw new LaunchReportDataError(
        `período inválido: início ${inicio} depois do fim ${fim}`,
        "Corrigir as datas na configuração do relatório",
      );
    }
    return { inicio, fim };
  }

  // §2.8 — início = menor data de venda da entidade de captura.
  const menorVenda = vendas.reduce<string | null>(
    (min, v) => (min === null || v.dia < min ? v.dia : min),
    null,
  );
  const inicioDerivado = inicio ?? menorVenda;
  if (!inicioDerivado) {
    throw new LaunchReportDataError(
      "não há venda para derivar o início do período e a config não traz data_inicio",
      "Definir o período na configuração do relatório da etapa",
    );
  }

  // §2.8 — fim = maior data com spend > 0 nas campanhas da etapa. Não incluir
  // "wave 1" (período com spend e sem conversão registrada) é o motivo de a
  // regra existir; por isso o fim vem do spend, não da última venda.
  let fimDerivado = fim ?? businessYesterday();
  if (!fim && campanhaIds.length > 0) {
    const linhas = await db
      .select({
        dateStart: metaCampaignInsightsDaily.dateStart,
        spend: metaCampaignInsightsDaily.spend,
      })
      .from(metaCampaignInsightsDaily)
      .where(
        and(
          eq(metaCampaignInsightsDaily.projectId, config.projectId),
          inArray(metaCampaignInsightsDaily.campaignId, [...campanhaIds]),
          gte(metaCampaignInsightsDaily.dateStart, inicioDerivado),
          lte(metaCampaignInsightsDaily.dateStart, fimDerivado),
        ),
      );
    const maiorComSpend = linhas.reduce<string | null>((max, l) => {
      const s = Number.parseFloat(l.spend ?? "0") || 0;
      if (s <= 0) return max;
      return max === null || l.dateStart > max ? l.dateStart : max;
    }, null);
    if (maiorComSpend) fimDerivado = maiorComSpend;
  }

  if (inicioDerivado > fimDerivado) {
    throw new LaunchReportDataError(
      `período derivado inválido: início ${inicioDerivado} depois do fim ${fimDerivado}`,
      "Definir o período explicitamente na configuração do relatório",
    );
  }
  return { inicio: inicioDerivado, fim: fimDerivado };
}

// ---------------------------------------------------------------------------
// Mídia
// ---------------------------------------------------------------------------

async function carregarMidia(
  db: Database,
  accessTokenFor: AccessTokenFor,
  args: {
    projectId: string;
    metaAccountId: string | null;
    campanhas: readonly { id: string; name: string }[];
    periodo: { inicio: string; fim: string };
  },
): Promise<CampanhaInput[]> {
  const { projectId, metaAccountId, campanhas, periodo } = args;
  if (campanhas.length === 0) return [];

  const campanhaIds = campanhas.map((c) => c.id);

  // Aquece o cache — o retorno não é usado para a quebra por campanha porque o
  // merge cache+fresh devolve linhas SEM `campaign_id` (achado da 41.8). A
  // quebra sai da tabela, que tem `campaign_id` na PK.
  if (metaAccountId) {
    const [account] = await db
      .select({ id: metaAdsAccounts.id, metaAccountId: metaAdsAccounts.metaAccountId })
      .from(metaAdsAccounts)
      .where(eq(metaAdsAccounts.id, metaAccountId))
      .limit(1);
    if (account) {
      const token = await accessTokenFor(account.id);
      if (token) {
        await fetchCampaignDailyInsightsForIdsWithCache(
          db,
          projectId,
          account.metaAccountId,
          token,
          campanhaIds,
          0,
          periodo.inicio,
          periodo.fim,
        ).catch(() => {
          // Falha de refetch não impede o relatório: o que já está em cache serve,
          // e a conferência externa (§8.3) é quem pega defasagem de investimento.
        });
      }
    }
  }

  // Campaign-level
  const linhasCampanha = await db
    .select({
      campaignId: metaCampaignInsightsDaily.campaignId,
      dateStart: metaCampaignInsightsDaily.dateStart,
      spend: metaCampaignInsightsDaily.spend,
      impressions: metaCampaignInsightsDaily.impressions,
      clicks: metaCampaignInsightsDaily.clicks,
    })
    .from(metaCampaignInsightsDaily)
    .where(
      and(
        eq(metaCampaignInsightsDaily.projectId, projectId),
        inArray(metaCampaignInsightsDaily.campaignId, campanhaIds),
        gte(metaCampaignInsightsDaily.dateStart, periodo.inicio),
        lte(metaCampaignInsightsDaily.dateStart, periodo.fim),
      ),
    );

  // Ad-level — só o spend, e só para a reconciliação do §2.3b. Não é fan-out
  // novo: é leitura da mesma tabela que a aba de Criativos já usa.
  const linhasAd = await db
    .select({
      campaignId: metaAdInsightsDaily.campaignId,
      spend: metaAdInsightsDaily.spend,
    })
    .from(metaAdInsightsDaily)
    .where(
      and(
        eq(metaAdInsightsDaily.projectId, projectId),
        inArray(metaAdInsightsDaily.campaignId, campanhaIds),
        gte(metaAdInsightsDaily.dateStart, periodo.inicio),
        lte(metaAdInsightsDaily.dateStart, periodo.fim),
      ),
    );

  const spendAdsPorCampanha = new Map<string, number>();
  for (const l of linhasAd) {
    if (!l.campaignId) continue;
    const s = Number.parseFloat(l.spend ?? "0") || 0;
    spendAdsPorCampanha.set(l.campaignId, (spendAdsPorCampanha.get(l.campaignId) ?? 0) + s);
  }

  const nomePorId = new Map(campanhas.map((c) => [c.id, c.name]));
  const acc = new Map<string, CampanhaInput>();

  for (const l of linhasCampanha) {
    const spend = Number.parseFloat(l.spend ?? "0") || 0;
    // Gross-up por DIA: a alíquota só vale de 2026-01-01 em diante e um período
    // pode atravessar essa data.
    const comImposto = applyMetaTax(spend, l.dateStart);

    let e = acc.get(l.campaignId);
    if (!e) {
      e = {
        campaignId: l.campaignId,
        campaignName: nomePorId.get(l.campaignId) ?? l.campaignId,
        spendBruto: 0,
        spendAdsBruto: spendAdsPorCampanha.get(l.campaignId) ?? null,
        impressoes: 0,
        cliques: 0,
        spendComImposto: 0,
      };
      acc.set(l.campaignId, e);
    }
    e.spendBruto += spend;
    e.spendComImposto += comImposto;
    e.impressoes += Number.parseFloat(l.impressions ?? "0") || 0;
    e.cliques += Number.parseFloat(l.clicks ?? "0") || 0;
  }

  // Campanha vinculada sem insight no período entra zerada — some do relatório
  // seria pior: é ela que o alerta "gastou e não converteu" precisa distinguir
  // de "nem apareceu".
  for (const c of campanhas) {
    if (!acc.has(c.id)) {
      acc.set(c.id, {
        campaignId: c.id,
        campaignName: c.name,
        spendBruto: 0,
        spendAdsBruto: spendAdsPorCampanha.get(c.id) ?? null,
        impressoes: 0,
        cliques: 0,
        spendComImposto: 0,
      });
    }
  }

  return [...acc.values()];
}

// ---------------------------------------------------------------------------
// Ad-level (Story 41.4)
// ---------------------------------------------------------------------------

/**
 * Ad-level do período, agregado por `ad_id`.
 *
 * ⚠️ Cobertura é irregular por projeto: no DG a tabela só tem dados a partir de
 * **2026-05-20**, então lançamentos anteriores (como o PG02, que rodou até
 * 09/05) devolvem lista vazia. Isso não é erro — a Meta não retém ad-level
 * indefinidamente e não há backfill. Sem ad-level, `destaques` fica `null` e o
 * invariante A6 permanece `skipped`.
 *
 * Leitura direta da tabela, sem fan-out novo na Meta (R-E2).
 */
async function carregarAds(
  db: Database,
  args: {
    projectId: string;
    campanhaIds: readonly string[];
    nomePorCampanha: Map<string, string>;
    periodo: { inicio: string; fim: string };
  },
): Promise<AdInput[]> {
  const { projectId, campanhaIds, nomePorCampanha, periodo } = args;
  if (campanhaIds.length === 0) return [];

  const linhas = await db
    .select({
      adId: metaAdInsightsDaily.adId,
      adName: metaAdInsightsDaily.adName,
      campaignId: metaAdInsightsDaily.campaignId,
      campaignName: metaAdInsightsDaily.campaignName,
      spend: metaAdInsightsDaily.spend,
      impressions: metaAdInsightsDaily.impressions,
      clicks: metaAdInsightsDaily.clicks,
    })
    .from(metaAdInsightsDaily)
    .where(
      and(
        eq(metaAdInsightsDaily.projectId, projectId),
        inArray(metaAdInsightsDaily.campaignId, [...campanhaIds]),
        gte(metaAdInsightsDaily.dateStart, periodo.inicio),
        lte(metaAdInsightsDaily.dateStart, periodo.fim),
      ),
    );

  const acc = new Map<string, AdInput>();
  for (const l of linhas) {
    const e = acc.get(l.adId);
    const spend = Number.parseFloat(l.spend ?? "0") || 0;
    const impressoes = Number.parseFloat(l.impressions ?? "0") || 0;
    const cliques = Number.parseFloat(l.clicks ?? "0") || 0;
    if (e) {
      e.spendBruto += spend;
      e.impressoes += impressoes;
      e.cliques += cliques;
    } else {
      acc.set(l.adId, {
        adId: l.adId,
        adName: l.adName,
        campaignId: l.campaignId ?? "",
        // O nome vinculado à etapa vence o desnormalizado na linha de insight:
        // é ele que carrega a convenção de hot/cold que classifica a visão.
        campaignName:
          (l.campaignId ? nomePorCampanha.get(l.campaignId) : null) ?? l.campaignName ?? "",
        spendBruto: spend,
        impressoes,
        cliques,
      });
    }
  }
  return [...acc.values()];
}

/**
 * Faixa por criativo a partir do `byAdId` de `computeSurveyForStage`, agregada
 * por **nome** do anúncio (coerente com o resto do agrupamento).
 *
 * ⚠️ `byAdId` traz **só ad ids reais**. Rótulos agregados de `utm_content`
 * (`org`, `link_in_bio`) e macros não resolvidas (`{{ad.id}}`) ficam de fora e
 * **não inflam o denominador** — é o que a AC5 da 41.4 exige.
 */
function extrairFaixas(survey: unknown, nomePorAdId: Map<string, string>): FaixaPorAd[] {
  if (!survey || typeof survey !== "object") return [];
  const byAdId = (survey as { byAdId?: Record<string, unknown> }).byAdId;
  if (!byAdId) return [];

  const porNome = new Map<string, { match: number; a: number; ab: number }>();

  for (const [adId, dados] of Object.entries(byAdId)) {
    const nome = nomePorAdId.get(adId);
    if (!nome) continue; // ad id sem nome resolvido não entra

    const faixa = (dados as { faixa?: { label: string; count: number }[] } | null)?.faixa;
    if (!Array.isArray(faixa)) continue;

    let total = 0;
    let a = 0;
    let ab = 0;
    for (const item of faixa) {
      const n = item?.count ?? 0;
      total += n;
      const label = (item?.label ?? "").trim().toUpperCase();
      if (label.startsWith("A")) a += n;
      if (label.startsWith("A") || label.startsWith("B")) ab += n;
    }
    if (total === 0) continue;

    const e = porNome.get(nome);
    if (e) {
      e.match += total;
      e.a += a;
      e.ab += ab;
    } else {
      porNome.set(nome, { match: total, a, ab });
    }
  }

  return [...porNome.entries()].map(([adName, v]) => ({
    adName,
    match: v.match,
    pctA: v.match === 0 ? 0 : (v.a / v.match) * 100,
    pctAB: v.match === 0 ? 0 : (v.ab / v.match) * 100,
  }));
}

// ---------------------------------------------------------------------------
// Pesquisa
// ---------------------------------------------------------------------------

/**
 * E-mails que responderam a pesquisa da etapa.
 *
 * `computeSurveyForStage` devolve só agregados — e o total dele conta **todas**
 * as linhas da planilha, que são os leads inscritos, não os compradores. Usar
 * aquele número como respondentes dá taxa acima de 100% (conferido no PG02:
 * 1.669 respostas para 1.407 ingressos únicos). A taxa do §3 é *comprador que
 * respondeu*, então aqui extraímos os e-mails para o motor fazer a interseção.
 *
 * Sem pesquisa vinculada, conjunto vazio — a taxa sai 0, não NaN.
 */
async function carregarEmailsPesquisa(
  db: Database,
  stageId: string,
): Promise<{ emails: Set<string>; total: number }> {
  const emails = new Set<string>();
  let total = 0;

  const surveys = await db
    .select({
      spreadsheetId: funnelSurveys.spreadsheetId,
      sheetName: funnelSurveys.sheetName,
      columnMapping: funnelSurveys.columnMapping,
    })
    .from(funnelSurveys)
    .where(eq(funnelSurveys.stageId, stageId));

  for (const s of surveys) {
    let dados;
    try {
      dados = await readSheetData(s.spreadsheetId, s.sheetName);
    } catch {
      continue; // pesquisa ilegível não derruba o relatório inteiro
    }
    const mapping = (s.columnMapping ?? {}) as Record<string, string | undefined>;
    const { headers, rows } = dados;
    let emailIdx = mapping.email ? headers.indexOf(mapping.email) : -1;
    if (emailIdx === -1) emailIdx = headers.findIndex((h) => /e-?mail/i.test(h));

    total += rows.length;
    if (emailIdx === -1) continue;
    for (const row of rows) {
      const e = (row[emailIdx] ?? "").trim().toLowerCase();
      if (e) emails.add(e);
    }
  }

  return { emails, total };
}
