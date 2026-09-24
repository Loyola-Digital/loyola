import { chaveDeComprador } from "../utils/comprador.js";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { FORMATO_DO_CODIGO } from "@loyola-x/shared";
import {
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import { classifyRefundStatus, isRefundBucket, isRevenueBucket } from "../services/sales-status.js";
import {
  businessToday,
  // Story 44.27: a régua ÚNICA do seletor de período — substituiu os cinco
  // `shiftDayKey(hoje, -days)` deste arquivo. Ver a nota no helper: eram duas
  // réguas, e a diferença de um dia inflava o ROAS da janela curta.
  inicioDaJanela,
  // Story 29.69: dia e hora derivados JUNTOS, nos três formatos que as
  // planilhas de produção usam — um deles com fuso misto na mesma coluna.
  saleDayAndHour,
  weekdayFromDayKey,
  NOMES_DOS_DIAS,
} from "../utils/sale-date.js";
import { applyMetaTax } from "../utils/meta-tax.js";
/**
 * Story 44.28 (T3) — o núcleo de vendas mora no service, e as duas rotas
 * (esta, autenticada, e a pública do Inácio) leem a MESMA função. Os helpers
 * abaixo voltam de lá porque `sales-data-daily` e `hourly` também os usam:
 * mantê-los exportados de um lugar só é o que impede a segunda cópia.
 */
import {
  calcularVendasDoPerpetuo,
  calcularVendasDiariasDoPerpetuo,
  loadPerpetualSpreadsheet,
  parseNumber,
  effectivePlatformFeeRate,
  sanitizeUtmValue,
} from "../services/perpetual-sales.js";
// Story 29.79 — funil e oferta de cada campanha, e o filtro das vendas por eles.
import {
  acumuladorForaDoFiltro,
  campanhasParaMidia,
  carregarFunilOferta,
  decidirLinhaNoFiltro,
  filtroDaQuery,
  idsDeCampanhaDasEtapas,
  resumoDoFiltro,
} from "../services/funil-e-oferta.js";
import { getMetaAccountForProject } from "../services/traffic-analytics.js";
import {
  getHourlyInsightsFromDb,
  getCampaignDailySpendFromDb,
} from "../services/meta-db-source.js";

// ============================================================
// Epic 29 Story 29.3 — agregação de vendas do perpétuo
// porUtmSource é BRUTO (sem normalização Pago/Orgânico)
// ============================================================

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const querySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * Story 29.42 (AC8) — dimensão opcional do `sales-data-daily`.
   *
   * Ausente = comportamento de sempre (`byDay`/`salesByDay` totais), intacto
   * para todos os consumidores atuais. Presente, acrescenta `byEntity` sem
   * remover nada — campo aditivo.
   *
   * No perpétuo, o UTM carrega o ID da entidade Meta:
   *   campaign -> utm_campaign · adset -> utm_medium · ad -> utm_content
   */
  groupBy: z.enum(["campaign", "adset", "ad"]).optional(),
  /**
   * Story 29.79 (AC4) — o recorte por funil e/ou oferta, no formato do
   * dicionário (`a01`, `of01`). Os dois combinam (E). Ausentes = "Todos", e a
   * resposta é byte a byte a de antes (AC6).
   *
   * ⚠️ Uma API anterior a esta story DESCARTA as duas chaves calada (o
   * `z.object` ignora o que não conhece) e devolveria vendas sem filtro. Por
   * isso a resposta ecoa `filtro` quando o aplicou — e o painel só manda o
   * parâmetro depois de a API declarar suporte (29.80 AC7).
   */
  funil: z.string().regex(FORMATO_DO_CODIGO.funil.regex).optional(),
  oferta: z.string().regex(FORMATO_DO_CODIGO.oferta.regex).optional(),
});


// ============================================================
// ROUTES
// ============================================================

export default fp(async function perpetualSalesDataRoutes(fastify) {
  async function getProjectAccess(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!member) return null;
    }
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return project ?? null;
  }

  async function getFunnel(funnelId: string, projectId: string) {
    const [funnel] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }


  // ---- GET /perpetual/sales-data ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/perpetual/sales-data",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const filtro = await filtroDaQuery(fastify.db, params.data, query.data);
      const dados = await calcularVendasDoPerpetuo(fastify.db, {
        projectId: params.data.projectId,
        funnelId: params.data.funnelId,
        days: query.data.days,
        startDate: query.data.startDate,
        endDate: query.data.endDate,
        filtro,
      });
      return dados;
    },
  );

  // ---- GET /perpetual/sales-data-daily ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/perpetual/sales-data-daily",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const filtro = await filtroDaQuery(fastify.db, params.data, query.data);
      return await calcularVendasDiariasDoPerpetuo(fastify.db, {
        funnelId: params.data.funnelId,
        days: query.data.days,
        startDate: query.data.startDate,
        endDate: query.data.endDate,
        groupBy: query.data.groupBy,
        filtro,
      });
    },
  );

  // ---- GET /perpetual/hourly ---- (Story 29.69, AC5/AC6)
  /**
   * As duas agregações que os seis painéis pedidos precisam: por HORA do dia
   * (24 posições) e por DIA DA SEMANA (7). Uma rota só, porque as duas leem a
   * mesma planilha e o mesmo investimento — separá-las faria a tela pedir duas
   * vezes o que custa uma.
   *
   * Duas fontes de investimento, de propósito:
   *
   * - **por hora** vem do cache `meta_hourly_insights_daily` (AC4), que só
   *   existe depois do sync;
   * - **por dia da semana** vem do insight DIÁRIO que já existe há muito tempo.
   *
   * É o que a AC7 exige: os três painéis de dia da semana funcionam mesmo que o
   * backfill horário nunca tenha rodado. Se as duas dependessem do cache novo,
   * metade da entrega ficaria refém de um sync.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/perpetual/hourly",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      // ---- janela ----
      let since: string;
      let until: string;
      if (query.data.startDate && query.data.endDate) {
        since = query.data.startDate;
        until = query.data.endDate;
      } else {
        until = businessToday();
        since = inicioDaJanela(query.data.days ?? 30, until);
      }

      // ---- campanhas do funil ----
      const campaignIds = await idsDeCampanhaDasEtapas(fastify.db, params.data.funnelId);
      /**
       * Story 29.79 — o recorte por funil/oferta. `campanhasDaMidia === null`
       * quando o filtro não casou nenhuma campanha (R1/PO-03): aí os leitores
       * NÃO são chamados — com `[]` eles devolveriam o projeto inteiro.
       */
      const filtro = await filtroDaQuery(fastify.db, params.data, query.data);
      const campanhasDaMidia = campanhasParaMidia(campaignIds, filtro);
      const fora = filtro ? acumuladorForaDoFiltro() : null;

      // ---- as 24 e as 7 posições, sempre todas (AC5) ----
      type Bucket = {
        faturamentoBruto: number;
        faturamentoLiquido: number;
        vendas: number;
        investimento: number;
      };
      const zero = (): Bucket => ({
        faturamentoBruto: 0,
        faturamentoLiquido: 0,
        vendas: 0,
        investimento: 0,
      });
      const porHora: Bucket[] = Array.from({ length: 24 }, zero);
      const porDiaDaSemana: Bucket[] = Array.from({ length: 7 }, zero);

      let vendasComHora = 0;
      let vendasSemHora = 0;
      let totalLinhas = 0;
      /**
       * Story 29.69 (AC6) — o faturamento DENTRO e FORA do corte por hora.
       *
       * A contagem de vendas não basta. Medido em produção: no `fz-a1`, 80 de
       * 1.594 vendas têm hora (5%) — o painel por hora somaria R$ 4.720 contra
       * R$ 90.974 do funil. Sem este par de números na resposta, quem olha os
       * dois painéis lado a lado conclui que um deles está quebrado.
       */
      let faturamentoComHora = 0;
      let faturamentoSemHora = 0;

      const spreadsheet = await loadPerpetualSpreadsheet(fastify.db, params.data.funnelId);
      let feeRate = 0;
      if (spreadsheet) {
        const mapping = spreadsheet.columnMapping as {
          email: string;
          transactionId?: string;
          valorBruto?: string;
          dataVenda?: string;
          status?: string;
          // Story 29.79: o id da campanha da venda — a chave do filtro.
          utm_campaign?: string;
        };
        let sheetData;
        try {
          sheetData = await readSheetData(spreadsheet.spreadsheetId, spreadsheet.sheetName);
        } catch {
          sheetData = null;
        }
        if (sheetData && sheetData.rows.length > 0) {
          const { headers, rows } = sheetData;
          const colIdx = (f: string | undefined) => (f ? headers.indexOf(f) : -1);
          const emailIdx = colIdx(mapping.email);
          const txIdx = colIdx(mapping.transactionId);
          const brutoIdx = colIdx(mapping.valorBruto);
          const dataIdx = colIdx(mapping.dataVenda);
          const statusIdx = colIdx(mapping.status);
          const utmCampaignIdx = colIdx(mapping.utm_campaign);
          const hasStatusCol = statusIdx !== -1;
          feeRate = effectivePlatformFeeRate(spreadsheet.platform, hasStatusCol);

          // Reembolso: a linha refunded e a compra "paid" pareada saem das duas
          // agregações — as MESMAS regras do card, senão o gráfico contradiz o
          // número que está acima dele.
          const refundedTxIds = new Set<string>();
          if (hasStatusCol && txIdx !== -1) {
            for (const row of rows) {
              if (isRefundBucket(classifyRefundStatus(row[statusIdx], hasStatusCol))) {
                const txId = (row[txIdx] ?? "").trim();
                if (txId) refundedTxIds.add(txId);
              }
            }
          }

          /**
           * Compradores distintos DENTRO de cada posição (AC5: `vendas` é
           * comprador, não linha).
           *
           * O order bump vem numa linha própria com o mesmo e-mail e a mesma
           * hora: contá-lo como venda inflaria o pico do gráfico exatamente nas
           * horas de maior conversão. Mesmo raciocínio da série diária (29.53),
           * e pela mesma razão a soma das 24 posições não bate com o total do
           * período quando alguém compra duas vezes em horas diferentes.
           */
          const vistosNaHora = new Set<string>();
          const vistosNoDiaDaSemana = new Set<string>();

          for (const [idxDaLinha, row] of rows.entries()) {
            if (dataIdx === -1) break;
            const dh = saleDayAndHour(row[dataIdx]);
            if (!dh) continue;
            if (dh.dia < since || dh.dia > until) continue;
            if (emailIdx !== -1 && !(row[emailIdx] ?? "").trim()) continue;
            if (hasStatusCol) {
              if (!isRevenueBucket(classifyRefundStatus(row[statusIdx], hasStatusCol))) continue;
              if (txIdx !== -1) {
                const txId = (row[txIdx] ?? "").trim();
                if (txId && refundedTxIds.has(txId)) continue;
              }
            }

            const bruto = parseNumber(row[brutoIdx] ?? "");
            const chave = chaveDeComprador(
              (row[emailIdx] ?? "").trim().toLowerCase(),
              txIdx === -1 ? "" : row[txIdx],
              idxDaLinha,
            );
            // Story 29.79 (AC4): a linha paga passa pelo filtro. O conjunto de
            // reembolsos acima já viu a planilha inteira (PO-07).
            if (filtro) {
              const decisao = decidirLinhaNoFiltro(
                utmCampaignIdx === -1 ? null : sanitizeUtmValue(row[utmCampaignIdx]),
                filtro,
                utmCampaignIdx !== -1,
              );
              if (!decisao.dentro) {
                if (decisao.motivo) fora!.somar(decisao, chave, bruto);
                continue;
              }
            }

            totalLinhas += 1;
            const liquido = bruto * (1 - feeRate);

            // Dia da semana NÃO depende da hora (AC7): basta o dia.
            const dow = weekdayFromDayKey(dh.dia);
            if (dow !== null) {
              const b = porDiaDaSemana[dow];
              b.faturamentoBruto += bruto;
              b.faturamentoLiquido += liquido;
              const k = `${dow}|${chave}`;
              if (!vistosNoDiaDaSemana.has(k)) {
                vistosNoDiaDaSemana.add(k);
                b.vendas += 1;
              }
            }

            // Hora: só quem TEM hora entra. Sem isto, toda venda de planilha sem
            // hora empilharia à meia-noite e o painel diria que 100% das vendas
            // acontecem às 00h (AC2).
            if (dh.hora === null) {
              vendasSemHora += 1;
              faturamentoSemHora += bruto;
              continue;
            }
            vendasComHora += 1;
            faturamentoComHora += bruto;
            const b = porHora[dh.hora];
            b.faturamentoBruto += bruto;
            b.faturamentoLiquido += liquido;
            const kh = `${dh.hora}|${chave}`;
            if (!vistosNaHora.has(kh)) {
              vistosNaHora.add(kh);
              b.vendas += 1;
            }
          }
        }
      }

      // ---- investimento ----
      const metaAccount = await getMetaAccountForProject(fastify.db, params.data.projectId);

      // por HORA: do banco (AC4). A Meta só é consultada pelo sync.
      const horario =
        campanhasDaMidia === null
          ? { porDiaEHora: [], primeiroDiaComCache: null, accountTimezone: null, ultimoSync: null }
          : await getHourlyInsightsFromDb(
              fastify.db,
              params.data.projectId,
              since,
              until,
              campanhasDaMidia,
            );
      for (const linha of horario.porDiaEHora) {
        if (linha.hour < 0 || linha.hour > 23) continue;
        // Imposto aplicado UMA vez, aqui — o cache guarda o spend cru da Meta.
        // Aplicá-lo de novo no frontend produziria spend × 1,1215², que é o
        // defeito que a 29.27 pagou para corrigir.
        porHora[linha.hour].investimento += applyMetaTax(linha.spend, linha.dateStart);
      }

      // por DIA DA SEMANA: do insight DIÁRIO (AC7) — funciona sem o cache novo.
      const diario =
        campanhasDaMidia === null
          ? []
          : await getCampaignDailySpendFromDb(
              fastify.db,
              params.data.projectId,
              since,
              until,
              campanhasDaMidia,
            );
      for (const d of diario) {
        const dow = weekdayFromDayKey(d.dateStart);
        if (dow === null) continue;
        porDiaDaSemana[dow].investimento += applyMetaTax(d.spend, d.dateStart);
      }

      const comRoasEMargem = (b: Bucket) => ({
        ...b,
        // ROAS sobre o BRUTO (regra da 29.20); só o denominador carrega imposto.
        roas: b.investimento > 0 ? b.faturamentoBruto / b.investimento : null,
        // Margem = receita LÍQUIDA − investimento (decisão do gestor, 29.20).
        margem: b.faturamentoLiquido - b.investimento,
      });

      return {
        porHora: porHora.map((b, hora) => ({ hora, ...comRoasEMargem(b) })),
        porDiaDaSemana: porDiaDaSemana.map((b, dia) => ({
          dia,
          nome: NOMES_DOS_DIAS[dia],
          ...comRoasEMargem(b),
        })),
        /**
         * AC6 — a cobertura vai junto do dado, não num lugar separado.
         *
         * É o que permite a tela dizer "faltam 12 vendas de 148" em vez de
         * desenhar um gráfico incompleto com cara de completo. Os três funis
         * perpétuos sem hora na planilha (Task 0) caem inteiros em
         * `vendasSemHora`.
         */
        cobertura: {
          totalVendas: totalLinhas,
          vendasComHora,
          vendasSemHora,
          /**
           * A Task 0 desta story classificou os funis em "tem hora" e "não
           * tem". A medição de produção mostrou que a realidade é MISTA: no
           * `fz-a1` são 5% das vendas com hora e no `pps1`, 30% — a mesma
           * coluna, formatos diferentes linha a linha. Por isso a cobertura é
           * um número, não um booleano.
           */
          faturamentoComHora,
          faturamentoSemHora,
          /** `null` = o sync horário nunca rodou para este funil. */
          primeiroDiaComCacheHorario: horario.primeiroDiaComCache,
          ultimoSyncHorario: horario.ultimoSync,
          /**
           * Fuso em que a Meta reportou as faixas. A venda é carimbada no fuso
           * do negócio; se os dois diferirem, sobrepor as séries no mesmo eixo
           * produz uma leitura de "melhor hora" que não existe. `null` = não
           * verificado, que é diferente de verificado e igual (AC3).
           */
          accountTimezone: horario.accountTimezone,
          temContaMeta: !!metaAccount,
          janela: { since, until },
        },
        semDados: !spreadsheet,
        // Story 29.79 (AC5): só com filtro — sem ele, nenhuma chave nova (AC6).
        ...(filtro ? { filtro: resumoDoFiltro(filtro), foraDoFiltro: fora!.lista() } : {}),
      };
    },
  );

  // ---- GET /perpetual/funil-oferta ---- (Story 29.79, AC3)
  /**
   * O funil e a oferta de cada campanha da etapa, o dicionário do expert do
   * projeto e o que não se sabe classificar — é o que a barra de filtros do
   * painel (29.80) consome: as opções dos dois selects, a lista `campanhas[]`
   * pela qual ela estreita os `campaignIds`, e as sinalizações com link.
   *
   * Só leitura; guest com a MESMA regra das vizinhas (membro do projeto).
   * Janela: `startDate`/`endDate` ou `days` (padrão 30, como a `hourly`) — só
   * o `gasto` de cada campanha depende dela.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/perpetual/funil-oferta",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      let since: string;
      let until: string;
      if (query.data.startDate && query.data.endDate) {
        since = query.data.startDate;
        until = query.data.endDate;
      } else {
        until = businessToday();
        since = inicioDaJanela(query.data.days ?? 30, until);
      }

      return await carregarFunilOferta(fastify.db, {
        projectId: params.data.projectId,
        funnelId: params.data.funnelId,
        since,
        until,
      });
    },
  );
});
