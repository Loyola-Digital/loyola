/**
 * Story 44.28 (AC3/AC4) — `GET /api/public/v1/funnels/:funnelId/perpetual-metrics`
 * para o agente Inácio.
 *
 * ## Por que esta rota existe
 *
 * O Inácio publica um Resumão diário para a diretoria e divergia da aba Meta
 * Ads. Uma das causas: os KPIs do perpétuo (CAC, ROAS, margem) eram calculados
 * **dentro do componente React** e só existiam no navegador. Para publicar "CAC
 * R$ 215,86" o agente teria que recompor a conta por fora — a segunda régua que
 * o Epic 44 inteiro existe para impedir.
 *
 * Agora as duas pontas leem as MESMAS funções:
 *
 * ```
 *   vendas   → services/perpetual-sales.ts   (era inline no handler autenticado)
 *   mídia    → services/meta-campaign-daily.ts
 *   KPIs     → shared/src/perpetuo-metricas.ts   (era um useMemo no dashboard)
 *   cadeia   → shared/src/cadeia-cac.ts
 * ```
 *
 * Nada aqui calcula: este arquivo autentica, resolve o funil, escolhe a janela
 * e compõe. Se um número desta rota divergir do painel, o defeito está numa das
 * quatro funções acima — e afeta os dois lados igualmente, que é o ponto.
 *
 * ## Duas armadilhas que este arquivo evita de propósito
 *
 * **1. O imposto de mídia não se aplica duas vezes.** `carregarSerieDiariaPorCampanha`
 * já devolve `spend` TRIBUTADO (`accumulate` aplicou `applyMetaTax`). Foi o bug
 * da 29.24, corrigido na 29.27. `calcularMetricasDoPerpetuo` documenta o mesmo
 * contrato do outro lado: "nunca reaplicar".
 *
 * **2. `vendas` e `vendasNoDia` são contagens diferentes, e a resposta diz qual
 * é qual.** O total do período deduplica por e-mail na janela inteira
 * (compradores únicos — a régua do card, e a que o CAC exige, já que CAC é
 * custo de aquisição de *cliente*). A série diária deduplica DENTRO do dia, e
 * por isso quem compra em dois dias conta duas vezes lá. **A soma da série é
 * maior ou igual ao total, e isso está certo.** O AC1 desta story manda expor a
 * régua do card como `vendas` e nomear a outra sem ambiguidade — daí
 * `vendasNoDia`.
 */

import fp from "fastify-plugin";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { funnels, funnelStages } from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import {
  calcularVendasDoPerpetuo,
  calcularVendasDiariasDoPerpetuo,
} from "../services/perpetual-sales.js";
import { carregarSerieDiariaPorCampanha } from "../services/meta-campaign-daily.js";
import { businessToday, inicioDaJanela } from "../utils/sale-date.js";
// A API importa o shared por BARE import; o web vai por subpath. Os dois
// caminhos não são intercambiáveis e trocar derruba o boot em silêncio
// (Story 19.14) — `calcularMetricasDoPerpetuo` já é reexportado no índice.
import {
  agregar,
  calcularMetricas,
  calcularMetricasDoPerpetuo,
  type DiaBruto,
} from "@loyola-x/shared";

const paramsSchema = z.object({ funnelId: z.string().uuid() });

const querySchema = z.object({
  /** `YYYY-MM-DD`. Com `from` **e** `to`, a janela é exatamente essa. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * Atalho para os cortes do Resumão: 1 (dia fechado), 7, 30, 90.
   *
   * Uma janela de N dias **inclui hoje** — `inicioDaJanela` é a régua única
   * desde a Story 44.27, que corrigiu o seletor somando faturamento de N+1 dias
   * contra investimento de N.
   */
  days: z.coerce.number().int().positive().max(365).optional(),
});

/** A janela efetiva, e de qual entrada ela veio. */
function resolverJanela(q: z.infer<typeof querySchema>): {
  from: string;
  to: string;
  dias: number;
  origem: "explicita" | "days" | "default";
} {
  const hoje = businessToday();
  if (q.from && q.to) {
    const dias =
      Math.round((Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000) + 1;
    return { from: q.from, to: q.to, dias, origem: "explicita" };
  }
  const dias = q.days ?? 30;
  return {
    from: inicioDaJanela(dias, hoje),
    to: hoje,
    dias,
    origem: q.days ? "days" : "default",
  };
}

export default fp(async function publicPerpetualMetricsRoutes(fastify) {
  fastify.get<{
    Params: z.infer<typeof paramsSchema>;
    Querystring: z.infer<typeof querySchema>;
  }>(
    "/api/public/v1/funnels/:funnelId/perpetual-metrics",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "funnelId inválido", code: "BAD_REQUEST" });
      }
      const query = querySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          error: "Parâmetros inválidos",
          code: "BAD_REQUEST",
          details: query.error.flatten().fieldErrors,
        });
      }
      const { funnelId } = params.data;

      const [funil] = await fastify.db
        .select({
          id: funnels.id,
          projectId: funnels.projectId,
          name: funnels.name,
          type: funnels.type,
        })
        .from(funnels)
        .where(eq(funnels.id, funnelId))
        .limit(1);
      if (!funil) {
        return reply.code(404).send({ error: "Funil não encontrado", code: "NOT_FOUND" });
      }

      const janela = resolverJanela(query.data);

      // ── mídia ────────────────────────────────────────────────
      // As campanhas vinculadas às etapas do funil. Sem nenhuma, não há
      // investimento — e `calcularMetricasDoPerpetuo` trata isso como o ramo em
      // que CAC e ROAS não existem (`null`), em vez de dividir por zero.
      const etapas = await fastify.db
        .select({ campaigns: funnelStages.campaigns })
        .from(funnelStages)
        .where(eq(funnelStages.funnelId, funnelId));
      const campaignIds = [
        ...new Set(
          etapas
            .flatMap((e) => (Array.isArray(e.campaigns) ? e.campaigns : []))
            .map((c: unknown) => (typeof c === "string" ? c : ((c as { id?: string })?.id ?? "")))
            .filter(Boolean),
        ),
      ];

      const campanhas = await carregarSerieDiariaPorCampanha(fastify.db, {
        projectId: funil.projectId,
        campaignIds,
        from: janela.from,
        to: janela.to,
        explicitRange: true,
      });

      // ⚠️ `spend` já vem TRIBUTADO daqui. Não reaplicar (bug da 29.24).
      const diasDeMidia: DiaBruto[] = campanhas.flatMap((c) =>
        (c.days ?? []).map((d) => ({
          date: d.date,
          spend: d.spend,
          impressions: d.impressions,
          linkClicks: d.linkClicks,
          landingPageViews: d.landingPageViews,
          checkouts: d.checkouts,
        })),
      );
      const agregado = agregar(diasDeMidia);
      const temMidia = diasDeMidia.length > 0;

      // ── vendas ───────────────────────────────────────────────
      const vendas = await calcularVendasDoPerpetuo(fastify.db, {
        projectId: funil.projectId,
        funnelId,
        startDate: janela.from,
        endDate: janela.to,
      });
      /**
       * ⚠️ `semDados` e SÓ ele. A primeira versão desta linha somava
       * `&& vendas.platform !== null`, e isso apagava a distinção que o Epic 44
       * existe para proteger: janela sem NENHUMA venda devolve
       * `{...EMPTY_SALES_DATA, semDados: false}` (`perpetual-sales.ts:484`) —
       * um payload vazio cujo `platform` é `null` mas que afirma *"medimos e
       * deu zero"*, não *"não há fonte"*.
       *
       * Medido no `pps` em 08/09: 1d e 7d apareciam como `vendas: null` onde a
       * rota autenticada dizia `0`. "Nenhuma venda ontem" é informação de
       * gestão; "sem dado" manda o leitor procurar um defeito que não existe.
       */
      const temPlanilha = !vendas.semDados;

      const diarias = await calcularVendasDiariasDoPerpetuo(fastify.db, {
        funnelId,
        startDate: janela.from,
        endDate: janela.to,
      });

      // ── KPIs — a MESMA função que o dashboard usa ────────────
      const kpis = calcularMetricasDoPerpetuo({
        temCampanhas: campaignIds.length > 0,
        midia: temMidia ? { totalSpend: agregado.spend } : null,
        vendas: temPlanilha
          ? {
              totalVendas: vendas.totalVendas,
              faturamentoBruto: vendas.faturamentoBruto,
              faturamentoLiquidoCalculado: vendas.faturamentoLiquidoCalculado,
            }
          : null,
      });

      /**
       * A cadeia (CPM/CPC/CTR/connect rate/conversão de checkout) sai da mesma
       * função da aba Inácio, na família `paga` — que é o que um perpétuo é.
       * `convLP` é a conversão de checkout: `checkouts ÷ landingPageViews`.
       *
       * Sem mídia na janela não há cadeia, e `null` diz isso. Devolver zeros
       * afirmaria que medimos e deu zero — a distinção que o Epic 44 protege.
       */
      const cadeia = temMidia ? calcularMetricas(agregado, "paga") : null;

      /**
       * AC4 — a série diária do Resumão, **um dia por linha**, mídia e vendas
       * lado a lado.
       *
       * `vendasNoDia` NÃO soma para `vendas` (ver o cabeçalho deste arquivo). O
       * nome carrega a diferença porque um campo chamado `vendas` aqui viraria
       * a segunda régua no dia em que alguém somasse a coluna.
       */
      const spendPorDia = new Map<string, number>();
      for (const d of diasDeMidia) {
        spendPorDia.set(d.date, (spendPorDia.get(d.date) ?? 0) + d.spend);
      }
      /**
       * ⚠️ `in`, não `as`. Sem planilha, `calcularVendasDiariasDoPerpetuo`
       * devolve um objeto que **não tem** `salesByDay` — e o compilador sabe
       * disso pela união. Um cast enganaria o tipo e o campo chegaria
       * `undefined` em runtime; o `in` deixa o TypeScript provar a presença.
       */
      const byDay = diarias.byDay ?? {};
      const salesByDay = "salesByDay" in diarias ? diarias.salesByDay : {};
      const serieDiaria = [...new Set([...spendPorDia.keys(), ...Object.keys(byDay)])]
        .sort()
        .map((date) => ({
          date,
          investimento: spendPorDia.get(date) ?? 0,
          faturamentoBruto: byDay[date] ?? 0,
          vendasNoDia: salesByDay[date] ?? 0,
        }));

      return {
        funnelId,
        projectId: funil.projectId,
        funnelName: funil.name,
        funnelType: funil.type,
        periodo: { from: janela.from, to: janela.to, dias: janela.dias, origem: janela.origem },

        /**
         * ⚠️ COMPRADORES ÚNICOS na janela — a régua do card e do CAC. Ver o
         * cabeçalho: não é a soma de `serieDiaria[].vendasNoDia`.
         */
        vendas: temPlanilha ? vendas.totalVendas : null,
        unidadeDeVendas: "compradores únicos no período" as const,

        investimento: temMidia ? agregado.spend : null,
        investimentoComImpostoDeMidia: true,
        faturamentoBruto: temPlanilha ? vendas.faturamentoBruto : null,
        faturamentoLiquidoCalculado: temPlanilha ? vendas.faturamentoLiquidoCalculado : null,
        ticketMedioBruto: temPlanilha ? vendas.ticketMedioBruto : null,

        cac: kpis?.cac ?? null,
        roas: kpis?.roas ?? null,
        margem: kpis?.margin ?? null,
        margemPercent: kpis?.marginPercent ?? null,

        orderBump: "orderBump" in vendas ? vendas.orderBump : null,
        reembolsos: temPlanilha
          ? {
              bruto: vendas.reembolsoBruto,
              liquido: vendas.reembolsoLiquido,
              quantidade: vendas.vendasReembolsadas,
              /** `false` = a planilha não tem coluna de status; o número é estimativa. */
              medido: vendas.reembolsoReal,
            }
          : null,

        cadeia,
        agregadoDeMidia: temMidia ? agregado : null,
        /** Hot/cold por comprador, do `utm_term` — a mesma regra do painel. */
        porTemperatura:
          "analiseDeOrigem" in vendas ? vendas.analiseDeOrigem.porTemperatura : null,

        serieDiaria,

        /** `true` quando não há NEM mídia NEM planilha na janela. */
        semDados: !temMidia && !temPlanilha,
      };
    },
  );
});
